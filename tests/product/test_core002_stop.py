from pathlib import Path
import subprocess
import sys
import time
from uuid import uuid4

import pytest

from conftest import turn
from services.product.kernel import ProductKernel
from services.product.models import ProductError


def _task_turn(app):
    item = turn(app)
    app.respond(item['id'])
    return item, app.execute(item['id'])['actions'][0]


def test_stop_generation_ready_and_known_task(app):
    generating = turn(app)
    ticket = app.begin(generating['id'])['ticket']
    assert app.stop({'turn_id': generating['id'], 'command_id': str(uuid4())})['permission_revoked']
    with pytest.raises(ProductError, match='stale_generation'):
        app.accept(generating['id'], ticket, {'reply': 'late'})
    ready = turn(app)
    app.respond(ready['id'])
    assert app.stop({'turn_id': ready['id'], 'command_id': str(uuid4())})['tasks'][0]['needs_reconciliation']
    with pytest.raises(ProductError, match='permission_denied'):
        app.execute(ready['id'])
    item, action = _task_turn(app)
    command = str(uuid4())
    first = app.stop({'turn_id': item['id'], 'command_id': command})
    assert first['tasks'][0]['task_id'] == action['task']['task_id']
    assert first['tasks'][0]['task_status'] == 'cancelled'
    assert first['tasks'][0]['cancel_requested']
    second = ProductKernel(app.root).stop({'turn_id': item['id'], 'command_id': command})
    assert second['tasks'][0]['cancel_command_id'] == first['tasks'][0]['cancel_command_id']
    reopened_command = str(uuid4())
    via_new_session = app.stop({'turn_id': item['id'], 'command_id': reopened_command})
    assert via_new_session['command_id'] == command
    assert via_new_session['tasks'][0]['cancel_command_id'] == first['tasks'][0]['cancel_command_id']
    with pytest.raises(ProductError, match='idempotency_conflict'):
        app.stop({'turn_id': ready['id'], 'command_id': command})
    with pytest.raises(ProductError, match='idempotency_conflict'):
        app.stop({'turn_id': ready['id'], 'command_id': reopened_command})


def test_stop_unknown_submit_keeps_original_action_id(app):
    item = turn(app)
    app.respond(item['id'])
    real = app.workbench.submit
    def unknown(value):
        real(value)
        raise ConnectionError('receipt_lost')
    app.workbench.submit = unknown
    action = app.execute(item['id'])['actions'][0]
    assert action['state'] == 'outcome_unknown'
    stopped = app.stop({'turn_id': item['id'], 'command_id': str(uuid4())})
    assert stopped['tasks'][0]['action_id'] == action['id']
    assert stopped['tasks'][0]['task_status'] == 'unknown'
    assert stopped['tasks'][0]['needs_reconciliation']
    assert len(app.workbench.list({}).items) == 1


def test_crash_after_real_cancel_replays_same_stable_id(app):
    item, action = _task_turn(app)
    source = Path(__file__).resolve().parents[2]
    command = str(uuid4())
    script = '''import os,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from services.product.kernel import ProductKernel
app=ProductKernel(Path(sys.argv[2]))
real=app.workbench.cancel
def crash(value):
    real(value)
    os._exit(23)
app.workbench.cancel=crash
app.stop({'turn_id':sys.argv[3],'command_id':sys.argv[4]})
'''
    child = subprocess.run([sys.executable, '-I', '-B', '-c', script,
                            str(source), str(app.root), item['id'], command], capture_output=True, timeout=20)
    assert child.returncode == 23 and not child.stderr
    assert app.turn(item['id'])['state'] == 'cancelled'
    replay = ProductKernel(app.root).stop({'turn_id': item['id'], 'command_id': command})
    assert replay['tasks'][0]['task_status'] == 'cancelled'
    assert replay['tasks'][0]['cancel_requested']
    assert len(app.workbench.list({}).items) == 1


def test_real_worker_process_observes_stop_request(app):
    item, action = _task_turn(app)
    source = Path(__file__).resolve().parents[2]
    ready = app.root / 'worker.ready'
    release = app.root / 'worker.release'
    script = '''import sys,time
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from services.product.kernel import ProductKernel
app=ProductKernel(Path(sys.argv[2]))
ready,release=Path(sys.argv[3]),Path(sys.argv[4])
def wait():
    ready.write_text('ready')
    until=time.monotonic()+10
    while not release.exists() and time.monotonic()<until: time.sleep(.01)
app.workbench.worker.after_checkpoint=wait
print(app.workbench.run_next().status,flush=True)
'''
    child = subprocess.Popen([sys.executable, '-I', '-B', '-c', script, str(source),
                              str(app.root), str(ready), str(release)], stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE)
    try:
        deadline = time.monotonic() + 10
        while not ready.exists() and time.monotonic() < deadline:
            time.sleep(.02)
        assert ready.exists()
        stopped = app.stop({'turn_id': item['id'], 'command_id': str(uuid4())})
        assert stopped['tasks'][0]['task_status'] in ('cancelling', 'cancelled')
        release.write_text('go')
        out, err = child.communicate(timeout=20)
        assert child.returncode == 0 and out.strip() == b'cancelled' and not err
        assert app.turn(item['id'])['actions'][0]['task']['status'] == 'cancelled'
    finally:
        release.write_text('go')
        if child.poll() is None:
            child.kill()
            child.communicate(timeout=5)
