"""Offline product chain. Model decisions are visibly scripted fixtures, never live AI."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import tempfile
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import services
assert Path(services.__file__).resolve().parent == ROOT / 'services'
from services.product.kernel import ProductKernel


class FixtureModel:
    def __init__(self,clock): self.clock=clock
    def respond(self,context):
        if context['csv_attached']:
            return {'reply':'测试回执：提交本地材料核对。','actions':[{'kind':'csv.audit'}]}
        return {'reply':'测试回执：听你说。','followup':{'topic':'wellbeing','purpose':'虚构近况跟进',
                'due_at':(self.clock()+timedelta(minutes=30)).isoformat(),
                'expires_at':(self.clock()+timedelta(hours=3)).isoformat()}}
    def reassess(self,context):
        return {'disposition':'send','text':'测试问候：现在稍微好一点了吗？','reason':'still_relevant'}


def main():
    scratch = ROOT / '.test-data'
    scratch.mkdir(exist_ok=True)
    root = Path(tempfile.mkdtemp(prefix='demo-',dir=scratch))
    now = [datetime(2026,9,24,10,tzinfo=timezone.utc)]
    clock = lambda:now[0]
    model = FixtureModel(clock)
    app = ProductKernel(root,clock=clock,model=model)
    first = app.bootstrap()
    csv_turn = {'command_id':str(uuid4()),'conversation_id':str(uuid4()),'text':'核对虚构材料',
                'csv_text':'item,unit,qty,unit_price,currency\n笔,支,2,3,CNY\n'}
    app.submit_turn(csv_turn,capabilities=['csv.audit'])
    app.respond(csv_turn['command_id'])
    task_id = app.execute(csv_turn['command_id'])['actions'][0]['task']['task_id']
    app.workbench.run_next()
    app.sync_task_messages()
    memory = app.memory.add('偏好先给结论')
    app.memory.edit(memory['id'],1,'偏好先给结论，必要时展开')
    policy = app.store.read_policy()
    app.memory.configure(policy.revision,{**policy.model_dump(mode='json'),'proactive_enabled':True})
    followup_turn = {'command_id':str(uuid4()),'conversation_id':str(uuid4()),'text':'虚构测试：今天很难受'}
    app.submit_turn(followup_turn)
    app.respond(followup_turn['command_id'])
    ordinary = app.turn(followup_turn['command_id'])
    now[0] += timedelta(minutes=30)
    restarted = ProductKernel(root,clock=clock,model=model)
    tick = restarted.tick()
    result = restarted.workbench.result({'task_id':task_id})
    print(json.dumps({'mode':'offline_scripted_model_real_local_services','model_http_requests':0,
        'data_root':str(root),'identity_preserved':first['profile']['profile_id']==restarted.home()['profile']['profile_id'],
        'task_status':restarted.turn(csv_turn['command_id'])['actions'][0]['task']['status'],
        'actual_csv_total':result.metadata['total'],'memory_count':len(restarted.memory.list()),
        'chat_has_schedule_fields':any(key in ordinary for key in ('followup','due_at','scheduled_at')),
        'followup_result':tick['followup'],'inbox_kinds':[message['kind'] for message in restarted.contact.inbox()]},ensure_ascii=False,indent=2))


if __name__ == '__main__': main()
