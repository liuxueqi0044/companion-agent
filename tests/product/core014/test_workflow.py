import json
from uuid import uuid4

import pytest

from services.product.kernel import ProductKernel
from services.product.models import ProductError
from services.product.entry import dispatch
from services.product import workflow


CSV = 'name,qty\nA,2\nA,3\nB,4\n'


def new(app, *, grants=('task.loop','data.query','artifact.create','tool.save','tool.run'), **kw):
    return app.submit_turn({'command_id':str(uuid4()),'conversation_id':str(uuid4()),
                            'text':'按 name 汇总，保存报告','csv_text':CSV,**kw}, capabilities=grants)['id']


def decide(app, id, action=None, *, first=False, **kw):
    c = app.begin(id, automatic=not first)
    reply = app.accept(id, c['ticket'], {'reply':'处理当前步骤','actions':[action] if action else [],**kw}, provider_summary='公开执行摘要')
    return c, app.execute(id) if action else reply


def sql(text='SELECT name, sum(num(qty)) AS total FROM data GROUP BY name ORDER BY name'):
    return {'kind':'data.query','title':'汇总','sql':text}


def test_failure_repair_observe_report_finish_and_reopen(app):
    id=new(app)
    _,failed=decide(app,id,sql('SELECT absent FROM data'),first=True,plan=['检查材料','计算汇总','核对并保存报告'])
    assert failed['actions'][0]['error']=='tool_query_rejected'
    c,actual=decide(app,id,sql())
    assert c['workflow']['receipts'][0]['error']=='tool_query_rejected'
    c,report=decide(app,id,{'kind':'artifact.create','title':'报告','files':[{'path':'report.md','content':'A: 5, B: 4'}]})
    observed=c['workflow']['receipts'][-1]
    assert observed['rows']==[{'name':'A','total':5.0},{'name':'B','total':4.0}]
    assert observed['rows_truncated'] is False and observed['input_rows']==3
    c,finished=decide(app,id)
    assert 'not executed' in c['workflow']['receipts'][-1]['meaning']
    assert finished['state']=='responded' and finished['workflow']['step_count']==4
    assert finished['workflow']['outcome']=='complete'
    assert [s['ordinal'] for s in finished['workflow']['steps']]==[1,2,3,4]
    assert 'ticket' not in json.dumps(finished)
    assert ProductKernel(app.root).turn(id)==finished
    with pytest.raises(ProductError,match='invalid_transition'): app.execute(id)
    with pytest.raises(ProductError,match='invalid_transition'): app.begin(id,automatic=True)
    output=dispatch(app,'artifact.read',{'turn_id':id,'action_id':actual['actions'][-1]['id']})
    assert json.loads(output['files'][0]['content'])==observed['rows']


def test_save_and_use_same_turn_receipt(app):
    id=new(app)
    definition={'name':'去重','description':'name 唯一值','sql':'SELECT DISTINCT name FROM data ORDER BY name',
                'parameters':[],'examples':[{'csv_text':'name\nA\nA\n','parameters':{},'expected':[{'name':'A'}]}]}
    _,saved=decide(app,id,{'kind':'tool.save','definition':definition},first=True)
    tool=saved['actions'][0]['tool']
    c,result=decide(app,id,{'kind':'tool.run','tool_id':tool['id'],'version':tool['version'],'parameters':{}})
    assert c['workflow']['receipts'][0]['tool']['id']==tool['id']
    assert result['actions'][-1]['row_count']==2
    c,_=decide(app,id)
    assert c['workflow']['receipts'][-1]['rows']==[{'name':'A'},{'name':'B'}]


def test_recovery_accepted_action_is_not_regenerated(app):
    id=new(app); c=app.begin(id)
    app.accept(id,c['ticket'],{'reply':'即将计算','actions':[sql()]})
    reopened=ProductKernel(app.root);reopened.recover()
    again=reopened.begin(id)
    assert again['resume_actions'] and 'ticket' not in again
    assert again['turn']['workflow']['step_count']==1
    one=reopened.execute(id);two=reopened.execute(id)
    assert one==two and len(one['actions'])==1
    c,result=decide(reopened,id)
    assert c['workflow']['receipts'][0]['row_count']==2


def test_recovery_interrupted_model_does_not_replay_earlier_actions(app):
    id=new(app);decide(app,id,sql(),first=True)
    abandoned=app.begin(id,automatic=True)
    assert app.recover()['interrupted_model_turns']==1
    with pytest.raises(ProductError,match='stale_generation'):app.accept(id,abandoned['ticket'],{'reply':'late'})
    resumed=app.begin(id)
    assert resumed['workflow']['previous_error']=='interrupted'
    assert len(resumed['workflow']['receipts'])==1
    end=app.accept(id,resumed['ticket'],{'reply':'读回已有结果。'})
    assert end['workflow']['step_count']==3
    assert len(end['actions'])==1


def test_no_grant_no_loop_or_query_and_no_generated_authority(app):
    id=new(app,grants=())
    with pytest.raises(ProductError,match='invalid_transition'):app.begin(id,automatic=True)
    c=app.begin(id)
    with pytest.raises(ProductError,match='permission_denied'):app.accept(id,c['ticket'],{'reply':'执行','actions':[sql()]})
    with pytest.raises(ProductError,match='invalid_request'):
        app.accept(id,c['ticket'],{'reply':'执行','actions':[],'capabilities':['task.loop']})
    assert app.turn(id)['actions']==[]


def test_stop_and_supersede_prevent_next_step(app):
    id=new(app);decide(app,id,sql(),first=True)
    next_c=app.begin(id,automatic=True)
    app.revoke(id)
    with pytest.raises(ProductError,match='stale_generation'):app.accept(id,next_c['ticket'],{'reply':'late','actions':[sql()]})
    with pytest.raises(ProductError):app.begin(id)
    assert len(app.turn(id)['actions'])==1
    second=new(app);decide(app,second,sql(),first=True)
    old=app.turn(second)
    new(app,conversation_id=old['conversation_id'])
    with pytest.raises(ProductError,match='superseded_turn'):app.begin(second,automatic=True)


def test_checkpoint_is_durable_and_user_resume_does_not_repeat(app):
    id=new(app)
    for i in range(workflow.WINDOW): decide(app,id,sql(),first=i==0)
    pause=app.begin(id,automatic=True)
    assert pause['paused'] and pause['turn']['state']=='paused'
    assert pause['turn']['workflow']['step_count']==8
    resumed=app.begin(id)
    assert resumed['workflow']['step']==9
    final=app.accept(id,resumed['ticket'],{'reply':'汇总完成'})
    assert len(final['actions'])==8 and final['workflow']['outcome']=='complete'


def test_overall_limit_and_history_projection_are_bounded(app,monkeypatch):
    monkeypatch.setattr(workflow,'MAX_STEPS',2)
    id=new(app);decide(app,id,sql(),first=True);decide(app,id,sql())
    assert app.begin(id,automatic=True)['paused']
    assert app.begin(id)['paused']
    assert not app.turn(id)['workflow']['can_continue']


def test_no_duplicate_mutation_and_intermediate_memory_side_effect(app):
    action={'kind':'artifact.create','title':'报告','files':[{'path':'report.md','content':'结果'}]}
    id=new(app);decide(app,id,action,first=True)
    c=app.begin(id,automatic=True)
    with pytest.raises(ProductError,match='repeated_action'):app.accept(id,c['ticket'],{'reply':'保存','actions':[action]})
    with pytest.raises(ProductError,match='invalid_request'):
        app.accept(id,c['ticket'],{'reply':'保存','actions':[sql()],'memories':[{'category':'preferences','content':'用户喜欢简短'}]})
    assert app.memory.list()==[] and len(app.turn(id)['actions'])==1


def test_unknown_or_not_executed_results_never_advance(app):
    id=new(app);c=app.begin(id)
    ready=app.accept(id,c['ticket'],{'reply':'计算','actions':[sql()]})
    with pytest.raises(ProductError,match='invalid_transition'):app.begin(id,automatic=True)
    app.execute(id)
    with app.store.tx(True) as db:
        db.execute("UPDATE actions SET state='outcome_unknown' WHERE turn_id=?",(id,))
    with pytest.raises(ProductError,match='reconciliation_required'):app.begin(id,automatic=True)


def test_bounded_observations_do_not_copy_attachment_or_other_turn(app):
    id=new(app,csv_text='name,qty\n'+'X,1\n'*30)
    decide(app,id,sql('SELECT name, qty FROM data'),first=True)
    c=app.begin(id,automatic=True)
    receipt=c['workflow']['receipts'][0]
    assert len(receipt['rows'])==20 and receipt['rows_truncated'] and receipt['row_count']==30
    assert 'csv_text' not in c and 'ticket' not in c['workflow']
    other=new(app)
    assert app.begin(other)['workflow']['receipts']==[]


def test_sql_limits_also_apply_to_one_shot_query(app):
    for statement in ("ATTACH DATABASE 'x' AS outside",'SELECT * FROM sqlite_master','DELETE FROM data'):
        id=new(app);_,result=decide(app,id,sql(statement),first=True)
        assert result['actions'][0]['state']=='failed' and 'artifact' not in result['actions'][0]


def test_legacy_mode_stays_single_step(app):
    id=new(app,grants=('data.query',));decide(app,id,sql(),first=True)
    assert app.turn(id)['workflow'] is None
    with pytest.raises(ProductError,match='invalid_transition'):app.begin(id,automatic=True)


def test_extension_install_idempotent_and_corrupt_shape_rejected(app):
    app.bootstrap();app.bootstrap()
    with app.store.tx(True) as db:db.execute('ALTER TABLE workflow_runs ADD COLUMN unexpected TEXT')
    with pytest.raises(ProductError,match='workflow_store_invalid'):app.bootstrap()


def test_model_cannot_award_completion_after_last_tool_failed(app):
    id=new(app);decide(app,id,sql('SELECT missing FROM data'),first=True)
    _,end=decide(app,id,outcome='complete',reply='模型声称已完成')
    assert end['workflow']['outcome']=='incomplete'
    assert end['actions'][0]['state']=='failed'


def test_real_fixed_audit_feedback_is_not_just_a_submit_receipt(app):
    id=new(app,grants=('task.loop','csv.audit'),csv_text='item,unit,qty,unit_price,currency\npen,piece,2,3,USD\n')
    _,queued=decide(app,id,{'kind':'csv.audit'},first=True)
    with pytest.raises(ProductError,match='workflow_waiting'):app.begin(id,automatic=True)
    app.workbench.run_next()
    c,end=decide(app,id)
    receipt=c['workflow']['receipts'][0]
    assert receipt['task']['status']=='completed' and receipt['result_metadata']['total']=='6'
    assert len(receipt['result_page_sha256'])==64
    assert end['workflow']['outcome']=='complete'


def test_large_tool_request_does_not_hide_its_actual_receipt(app):
    id=new(app)
    definition={'name':'常量','description':'返回一行','sql':'SELECT 1 AS value','parameters':[],
                'examples':[{'csv_text':'name\n'+'X'*9000+'\n','parameters':{},'expected':[{'value':1}]}]}
    decide(app,id,{'kind':'tool.save','definition':definition},first=True)
    c=app.begin(id,automatic=True)
    receipt=c['workflow']['receipts'][0]
    assert receipt['tool']['version']==1 and receipt['requested_truncated']
    assert c['workflow']['omitted_receipts']==0
    assert 'examples' not in receipt['requested']['definition']


def test_existing_v2_extension_upgrade_preserves_every_original_row(app):
    from services.product.store import canonical
    old=new(app,grants=())
    c=app.begin(old);app.accept(old,c['ticket'],{'reply':'原有对话'})
    with app.store.tx(True) as db:
        db.execute('DROP TABLE workflow_steps');db.execute('DROP TABLE workflow_runs')
        names=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name")]
        before={name:canonical([dict(r) for r in db.execute('SELECT * FROM '+name)]) for name in names}
    app.bootstrap()
    with app.store.tx() as db:
        after={name:canonical([dict(r) for r in db.execute('SELECT * FROM '+name)]) for name in names}
    assert before==after
    assert app.turn(old)['reply']=='原有对话'
    assert app.turn(old)['workflow'] is None
    assert app.respond(new(app,grants=('task.loop',)))['state']=='model_failed'  # fixture model asks for an ungranted action


def test_single_step_cli_does_not_generate_again_over_pending_actions_or_pause(app,monkeypatch):
    id=new(app);c=app.begin(id)
    ready=app.accept(id,c['ticket'],{'reply':'计算','actions':[sql()]})
    assert app.respond(id)==ready
    app.execute(id)
    monkeypatch.setattr(workflow,'MAX_STEPS',1)
    assert app.respond(id)['state']=='paused'
