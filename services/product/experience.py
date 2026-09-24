"""Bind existing sealed packages to personal identity. No source is executed here."""
from __future__ import annotations

import hashlib
import json
import re
import struct

from .models import ProductError
from .store import guard, stamp

FILES = ('view.html', 'view.css', 'view.js')


class ExperienceService:
    def __init__(self, store, clock, *, reviewed_packages=()):
        self.store, self.clock = store, clock
        # Host-provided reviewed hashes. source_type alone is never a trust grant.
        self.reviewed_packages = frozenset((item['source_hash'], item['artifact_hash']) for item in reviewed_packages)

    def _verified(self, revision):
        if not isinstance(revision, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', revision):
            raise ProductError('invalid_package')
        folder = guard(self.store.root / 'spaces' / 'revisions' / revision)
        try:
            if {item.name for item in folder.iterdir()} != {*FILES, 'artifact.html', 'manifest.json'}:
                raise ProductError('invalid_package')
            def read(name, maximum):
                target = guard(folder / name)
                if not target.is_file() or target.stat().st_size > maximum:
                    raise ProductError('invalid_package')
                return target.read_bytes()
            manifest = json.loads(read('manifest.json', 32 * 1024))
            files = {name: read(name, 32 * 1024) for name in FILES}
            if sum(map(len, files.values())) > 64 * 1024:
                raise ProductError('invalid_package')
            artifact = read('artifact.html', 128 * 1024)
            for name, data in files.items():
                data.decode('utf-8', errors='strict')
                if manifest['files'][name]['sha256'] != hashlib.sha256(data).hexdigest():
                    raise ProductError('invalid_package')
            records = [('format', b'personal-space-spike/1'), ('host_api_version', b'demo/1'), *files.items()]
            encoded = b''.join(struct.pack('>IQ', len(name.encode()), len(data)) + name.encode() + data for name, data in records)
            source_hash = hashlib.sha256(encoded).hexdigest()
            artifact_hash = hashlib.sha256(artifact).hexdigest()
            if (manifest['revision_id'] != revision or manifest['format'] != 'personal-space-spike/1'
                    or manifest['host_api_version'] != 'demo/1' or manifest['build_input_hash'] != source_hash
                    or manifest['artifact_hash'] != artifact_hash):
                raise ProductError('invalid_package')
            if manifest['source_type'] != 'handwritten_fixture' or (source_hash, artifact_hash) not in self.reviewed_packages:
                raise ProductError('isolation_not_verified')
            return source_hash, artifact_hash
        except (OSError, ValueError, TypeError, KeyError) as exc:
            raise ProductError('invalid_package') from exc

    def activate(self, revision, expected_revision):
        source_hash, artifact_hash = self._verified(revision)
        with self.store.tx(True) as db:
            current = db.execute('SELECT revision FROM experience_head WHERE singleton=1').fetchone()[0]
            if type(expected_revision) is not int or current != expected_revision:
                raise ProductError('revision_conflict')
            next_revision = db.execute('INSERT INTO experiences(package_revision,source_hash,artifact_hash,created_at) VALUES(?,?,?,?)',
                                       (revision, source_hash, artifact_hash, stamp(self.clock()))).lastrowid
            db.execute('UPDATE experience_head SET revision=? WHERE singleton=1', (next_revision,))
            return {'revision': next_revision, 'package_revision': revision, 'artifact_hash': artifact_hash,
                    'activation': 'registered_only', 'native_mount': 'not_run'}

    def restore(self, target_revision, expected_revision):
        with self.store.tx() as db:
            row = db.execute('SELECT * FROM experiences WHERE revision=?', (target_revision,)).fetchone()
            if row is None:
                raise ProductError('not_found')
            package_revision = row['package_revision']
            hashes = (row['source_hash'], row['artifact_hash'])
        if self._verified(package_revision) != hashes:
            raise ProductError('invalid_package')
        return self.activate(package_revision, expected_revision)

    def history(self):
        with self.store.tx() as db:
            return [dict(row) for row in db.execute('SELECT * FROM experiences ORDER BY revision DESC LIMIT 100')]
