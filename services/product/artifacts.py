"""Local text deliverables: immutable receipts, never executable host code."""
import base64
import hashlib
import io
import json
import zipfile

from .models import ArtifactAction, ProductError, validate
from .store import canonical, stamp


def create_receipt(action_id, payload, now):
    action = validate(ArtifactAction, payload)
    files = [item.model_dump() for item in action.files]
    return {'id': action_id, 'title': action.title, 'created_at': stamp(now),
            'sha256': hashlib.sha256(canonical(files).encode()).hexdigest(), 'files': files}


def checked(value):
    try:
        action = validate(ArtifactAction, {'kind': 'artifact.create', 'title': value['title'], 'files': value['files']})
        if hashlib.sha256(canonical([f.model_dump() for f in action.files]).encode()).hexdigest() != value['sha256']:
            raise ValueError('hash')
        return value
    except (KeyError, TypeError, ValueError, ProductError) as exc:
        raise ProductError('artifact_corrupt') from exc


def summary(receipt):
    value = checked(receipt)
    return {key: value[key] for key in ('id', 'title', 'created_at', 'sha256')} | {
        'files': [{'path': row['path'], 'bytes': len(row['content'].encode())} for row in value['files']]}


def read_artifact(store, turn_id, action_id):
    with store.tx() as db:
        row = db.execute("SELECT result_json FROM actions WHERE id=? AND turn_id=? AND kind IN ('artifact.create','tool.run') AND state='accepted'", (action_id, turn_id)).fetchone()
        if row is None:
            raise ProductError('artifact_not_found')
        try:
            value = checked(json.loads(row['result_json']))
        except (TypeError, ValueError) as exc:
            raise ProductError('artifact_corrupt') from exc
        if value['id'] != action_id:
            raise ProductError('artifact_corrupt')
        return value


def download(store, turn_id, action_id):
    value = read_artifact(store, turn_id, action_id)
    # Always a ZIP. HTML/scripts are never served inline or automatically run.
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for row in value['files']:
            info = zipfile.ZipInfo(row['path'], date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, row['content'].encode('utf-8'))
    data = output.getvalue()
    return {'name': 'morrow-' + action_id + '.zip', 'mime': 'application/zip',
            'base64': base64.b64encode(data).decode('ascii'), 'sha256': hashlib.sha256(data).hexdigest()}
