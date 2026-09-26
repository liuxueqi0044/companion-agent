import hashlib
from uuid import uuid4
import pytest
from services.product.kernel import ProductKernel
from services.product.models import ProductError
from services.product import goals

GRANTS = ('task.loop','artifact.create','data.query',*goals.CONTROL)
def new(app, grants=GRANTS):
    return app.submit_turn({'command_id':str(uuid4()),'conversation_id':str(uuid4()),'text':'/goal 汇总并保存报告',
                            'csv_text':'name,qty\nA,2\nA,3\nB,4\n'},capabilities=grants)['id']
def step(app,id,action=None,**kw):
    turn=app.turn(id)
    c=app.begin(id,automatic=turn['state']=='actions_recorded')
    assert 'ticket' in c,c
    r=app.accept(id,c['ticket'],{'reply':'处理本步骤','actions':[action] if action else [],**kw})
    return c,app.execute(id) if action else r
def spec(id='one',deps=None):
    return {'id':id,'title':'验证并保存','instruction':'保存一个结果文件','criteria':['文件包含正确结果'], 'depends_on':deps or []}
def plan(tasks=None):return {'kind':'goal.plan','tasks':tasks or [spec()]}
def dispatch(id='one',executor='worker'):return {'kind':'goal.dispatch','task_id':id,'executor':executor}
def artifact(value='A=5; B=4'):return {'kind':'artifact.create','title':'结果','files':[{'path':'result.md','content':value}]}
def submit(id):return {'kind':'goal.submit','summary':'已保存','evidence_ids':[id]}
def review(id,passed=True,task='one'):
    return {'kind':'goal.review','task_id':task,'verdict':'accept' if passed else 'rework',
            'checks':[{'criterion':0,'passed':passed,'reason':'核对实际文件','evidence_ids':[id]}]}
def worker(app,id):step(app,id,plan());step(app,id,dispatch())
def saved(app,id):return step(app,id,artifact())[1]['actions'][-1]['id']


def test_null_outcome_is_only_tolerated_while_actions_are_pending(app):
    from services.product.models import ModelDecision, validate
    id=new(app);step(app,id,plan(),outcome=None)
    _,r=step(app,id,dispatch(),outcome=None)
    assert r['workflow']['goal']['phase']=='working'
    assert r['workflow']['outcome'] is None
    for decision in ({'reply':'done','outcome':None}, {'reply':'done','actions':[],'outcome':None},
                     {'reply':'bad','actions':[{'kind':'unknown'}],'outcome':None}):
        with pytest.raises(ProductError,match='invalid_request'):validate(ModelDecision,decision)


def test_tool_only_response_may_omit_prose_but_final_reply_cannot_be_empty(app):
    from services.product.models import ModelDecision, validate
    id=new(app);c=app.begin(id)
    app.accept(id,c['ticket'],{'reply':'','actions':[plan()]})
    assert app.execute(id)['workflow']['goal']['phase']=='dispatching'
    for text in ('','   ','\x00'):
        with pytest.raises(ProductError,match='invalid_request'):
            validate(ModelDecision,{'reply':text,'actions':[]})

def test_full_goal_distinct_roles_bound_review_and_reopen(app):
    id=new(app);c,r=step(app,id,plan([spec(),spec('two',['one'])]))
    assert c['goal']['role']=='director'
    step(app,id,dispatch());c,r=step(app,id,artifact());a=r['actions'][-1]['id']
    assert c['goal']['role']=='worker' and c['history']==[] and c['memories']==[]
    assert c['user_text']==spec()['instruction'] and 'goal.review' not in c['capabilities']
    step(app,id,submit(a));c,r=step(app,id,review(a))
    assert c['goal']['role']=='reviewer' and c['goal']['source_previews'][0]['content']=='A=5; B=4'
    assert r['workflow']['goal']['tasks'][0]['state']=='accepted'
    step(app,id,dispatch('two'));c,r=step(app,id,artifact('second report'))
    assert c['goal']['source_previews'][0]['action_id']==a
    b=r['actions'][-1]['id'];step(app,id,submit(b));r=review(b,task='two');r['checks'][0]['evidence_ids'].append(a)
    step(app,id,r)
    step(app,id,{'kind':'goal.finish','outcome':'complete'});_,end=step(app,id)
    assert end['state']=='responded' and end['workflow']['outcome']=='complete'
    assert all(t['state']=='accepted' for t in end['workflow']['goal']['tasks'])
    reopened=ProductKernel(app.root);reopened.bootstrap()
    assert reopened.turn(id)==end
    assert {'director','worker','reviewer'} <= {s['role'] for s in end['workflow']['steps']}


def test_combined_plan_dispatch_preserves_director_to_worker_boundary(app):
    id=new(app);c=app.begin(id)
    app.accept(id,c['ticket'],{'reply':'plan then assign','actions':[plan(),dispatch()]})
    r=app.execute(id)
    assert [a['state'] for a in r['actions']]==['accepted','accepted']
    assert r['workflow']['goal']['phase']=='working'
    next_context=app.begin(id,automatic=True)
    assert next_context['goal']['role']=='worker'
    assert next_context['history']==[]


def test_failed_plan_blocks_paired_dispatch_even_when_target_already_exists(app):
    id=new(app);step(app,id,plan());c=app.begin(id,automatic=True)
    app.accept(id,c['ticket'],{'reply':'bad duplicate plan','actions':[plan(),dispatch()]})
    r=app.execute(id)
    assert [a['state'] for a in r['actions'][-2:]]==['failed','failed']
    assert r['actions'][-1]['error']=='goal_plan_failed'
    assert r['workflow']['goal']['tasks'][0]['attempt']==0

def test_worker_cannot_self_accept_or_finish_or_write_memory(app):
    id=new(app);worker(app,id);c=app.begin(id,automatic=True)
    for decision in ({'reply':'x','actions':[review(str(uuid4()))]}, {'reply':'x','actions':[{'kind':'goal.finish','outcome':'complete'}]},
                     {'reply':'x','actions':[]}, {'reply':'x','actions':[artifact()], 'memories':[{'category':'preferences','content':'invented'}]}):
        with pytest.raises(ProductError):app.accept(id,c['ticket'],decision)
    assert app.turn(id)['workflow']['goal']['tasks'][0]['state']=='working'

def test_director_cannot_bypass_workers_and_finish_with_pending_tasks(app):
    id=new(app);step(app,id,plan());c=app.begin(id,automatic=True)
    with pytest.raises(ProductError,match='permission_denied'):app.accept(id,c['ticket'],{'reply':'x','actions':[artifact()]})
    app.accept(id,c['ticket'],{'reply':'x','actions':[{'kind':'goal.finish','outcome':'complete'}]})
    end=app.execute(id);assert end['actions'][-1]['state']=='failed'
    assert end['workflow']['goal']['phase']=='dispatching'

@pytest.mark.parametrize('tasks',[ [spec('a',['b']),spec('b',['a'])], [spec(),spec()], [spec('a',['absent'])] ])
def test_bad_plans_are_atomic(app,tasks):
    id=new(app);_,r=step(app,id,plan(tasks));assert r['actions'][-1]['state']=='failed'
    assert r['workflow']['goal']['tasks']==[]

def test_dependency_and_claude_permission_are_enforced(app):
    id=new(app);step(app,id,plan([spec(),spec('two',['one'])]))
    _,r=step(app,id,dispatch('two'));assert r['actions'][-1]['state']=='failed'
    _,r=step(app,id,dispatch(executor='claude'));assert r['actions'][-1]['error']=='permission_denied'
    assert all(t['attempt']==0 for t in r['workflow']['goal']['tasks'])

def test_rework_keeps_critique_but_forbids_old_evidence(app):
    id=new(app);worker(app,id);a=saved(app,id);step(app,id,submit(a));step(app,id,review(a,False))
    step(app,id,dispatch());c,r=step(app,id,submit(a))
    assert c['goal']['task']['attempt']==2 and c['goal']['task']['checks'][0]['passed'] is False
    assert c['goal']['source_previews'][0]['action_id']==a
    assert r['actions'][-1]['state']=='failed'
    b=step(app,id,artifact('corrected result'))[1]['actions'][-1]['id'];step(app,id,submit(b));step(app,id,review(b))
    assert app.turn(id)['workflow']['goal']['tasks'][0]['state']=='accepted'

def test_cross_turn_evidence_and_unbound_review_rejected(app):
    other=new(app);worker(app,other);a=saved(app,other)
    id=new(app);worker(app,id);_,r=step(app,id,submit(a));assert r['actions'][-1]['state']=='failed'
    b=saved(app,id);step(app,id,submit(b));_,r=step(app,id,review(a));assert r['actions'][-1]['state']=='failed'
    assert r['workflow']['goal']['phase']=='reviewing'

@pytest.mark.parametrize('mutation',['missing','duplicate','mismatch'])
def test_review_requires_every_criterion_once(app,mutation):
    id=new(app);s=spec();s['criteria']=['one','two'];step(app,id,plan([s]));step(app,id,dispatch())
    a=saved(app,id);step(app,id,submit(a));r=review(a)
    if mutation=='duplicate':r['checks']*=2
    elif mutation=='mismatch':r['checks'].append({**r['checks'][0],'criterion':1,'passed':False})
    _,end=step(app,id,r);assert end['actions'][-1]['state']=='failed'

def test_stop_and_restart_do_not_resume_old_tickets(app):
    id=new(app);worker(app,id);c=app.begin(id,automatic=True);app.recover()
    with pytest.raises(ProductError,match='stale_generation'):app.accept(id,c['ticket'],{'reply':'x','actions':[artifact()]})
    resumed=app.begin(id);assert resumed['goal']['role']=='worker'
    app.stop({'turn_id':id,'command_id':str(uuid4())})
    with pytest.raises(ProductError,match='stale_generation'):app.accept(id,resumed['ticket'],{'reply':'x','actions':[artifact()]})
    assert app.turn(id)['workflow']['goal']['phase']=='cancelled'

def test_missing_capability_and_non_goal_control(app):
    with pytest.raises(ProductError,match='invalid_capability'):new(app,('task.loop','goal.plan'))
    id=new(app,('task.loop','artifact.create'));c=app.begin(id)
    with pytest.raises(ProductError,match='permission_denied'):app.accept(id,c['ticket'],{'reply':'x','actions':[plan()]})

def test_goal_checkpoint_at_24_and_explicit_resume(app):
    id=new(app);worker(app,id)
    for n in range(22):step(app,id,{'kind':'data.query','title':'query','sql':'SELECT name FROM data'})
    assert app.begin(id,automatic=True)['paused'] is True
    assert app.turn(id)['workflow']['step_count']==24
    assert 'ticket' in app.begin(id)


def test_three_repeated_control_failures_checkpoint_without_more_model_calls(app):
    id=new(app);step(app,id,plan([spec(),spec('two',['one'])]))
    for _ in range(3):step(app,id,dispatch('two'))
    paused=app.begin(id,automatic=True)
    assert paused['paused'] and paused['turn']['error']=='goal_no_progress'
    resumed=app.begin(id);assert 'ticket' in resumed

def test_coding_receipt_is_bound_to_files_and_failing_check_blocks_review(app):
    id=new(app,(*GRANTS,'agent.claude'));step(app,id,plan());step(app,id,dispatch(executor='claude'))
    c=app.begin(id,automatic=True);a={'kind':'artifact.create','title':'source','files':[{'path':'main.js','content':'('}]}
    e={'kind':'claude-code','receipt_id':str(uuid4()),'model':'test','files':[{'path':'main.js','bytes':1,'sha256':hashlib.sha256(b'(').hexdigest()}],
       'checks':[{'path':'main.js','kind':'node_syntax','status':'failed','detail':'invalid syntax'}],'tool_calls':1,'api_requests':2}
    with pytest.raises(ProductError,match='invalid_provider_metadata'):app.accept(id,c['ticket'],{'reply':'x','actions':[a]})
    bad={**e,'files':[{**e['files'][0],'sha256':'0'*64}]}
    with pytest.raises(ProductError,match='invalid_provider_metadata'):app.accept(id,c['ticket'],{'reply':'x','actions':[a]},execution_evidence=bad)
    app.accept(id,c['ticket'],{'reply':'x','actions':[a]},execution_evidence=e);r=app.execute(id);out=r['actions'][-1]['id']
    step(app,id,submit(out));_,r=step(app,id,review(out));assert r['actions'][-1]['state']=='failed'
    _,r=step(app,id,review(out,False));assert r['workflow']['goal']['tasks'][0]['state']=='rework'

def test_incomplete_finish_is_honest_and_final_outcome_cannot_change(app):
    id=new(app);step(app,id,{'kind':'goal.finish','outcome':'needs_input'});c=app.begin(id,automatic=True)
    with pytest.raises(ProductError,match='invalid_request'):app.accept(id,c['ticket'],{'reply':'all done','actions':[],'outcome':'complete'})
    r=app.accept(id,c['ticket'],{'reply':'need input','actions':[],'outcome':'needs_input'})
    assert r['workflow']['outcome']=='needs_input'
