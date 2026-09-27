from copy import deepcopy
from uuid import uuid4
import pytest
from services.product.models import ProductError


def package(key='a', version='b', kind='mcp'):
    part = {'id':'mcp.notes' if kind=='mcp' else 'skill.notes','kind':kind,'name':'notes','description':'Notes','issues':[]}
    if kind == 'mcp':
        part['connection'] = {'type':'http','url':'https://example.com/mcp','headers':{}}
    else:
        part.update(instructions='Compare the given evidence.', resources={'references/help.md':'Example reference'})
    return {'id':key*32,'hash':version*64,'name':'Notes','description':'Compare notes','source':'','license':'MIT','format':'agent-skills' if kind=='skill' else 'mcp','issues':[],'components':[part]}


TOOLS = [{'name':'read_note','description':'Read notes','inputSchema':{'type':'object','properties':{'name':{'type':'string'}},'required':['name'],'additionalProperties':False},'annotations':{'readOnlyHint':True}},
         {'name':'write_note','description':'Write notes','inputSchema':{'type':'object'},'annotations':{'readOnlyHint':False}}]


def dispatch(app, action, **p):
    return app.capabilities.dispatch(action, p)


def installed(app, value=None):
    value = value or package()
    item = dispatch(app, 'import', definition=value)
    if value['components'][0]['kind'] == 'mcp':
        item = dispatch(app, 'connected', id=item['id'], version=item['version'], component='mcp.notes', tools=TOOLS, expected_revision=item['revision'])
        item = dispatch(app, 'grant', id=item['id'], component='mcp.notes', tools=['read_note'], expected_revision=item['revision'])
    return dispatch(app, 'manage', id=item['id'], expected_revision=item['revision'], operation='enable', version=None)


def action_turn(app, item, *, kind='capability.call', grants=None, **extra):
    payload = {'kind':kind,'package_id':item['id'],'version':item['version'],'component':item['components'][0]['id'],**extra}
    if kind == 'capability.call':
        payload.update(tool='read_note',arguments={'name':'fictional'})
    turn = app.submit_turn({'command_id':str(uuid4()),'conversation_id':str(uuid4()),'text':'Read fictional notes'},
                           capabilities=grants if grants is not None else ['task.loop','capability.describe','capability.call'])
    begin = app.begin(turn['id'])
    return app.accept(turn['id'],begin['ticket'],{'reply':'Read the notes','actions':[payload]})


def test_import_disabled_and_updates_are_staged(app):
    item = dispatch(app, 'import', definition=package(kind='skill'))
    assert not item['enabled'] and not item['ready']
    item = installed(app, package(kind='skill'))
    assert item['ready']
    updated = package(version='c',kind='skill')
    updated['components'][0]['instructions'] = 'A revised method.'
    stage = dispatch(app, 'import', definition=updated)
    assert stage['version']=='b'*64 and stage['enabled'] and stage['revision']==item['revision']
    restored = dispatch(app, 'manage', id=item['id'], expected_revision=item['revision'], operation='restore', version='c'*64)
    assert not restored['enabled'] and restored['version']=='c'*64
    with pytest.raises(ProductError, match='revision_conflict'):
        dispatch(app,'manage',id=item['id'],expected_revision=item['revision'],operation='enable',version=None)


def test_skill_progressive_disclosure_and_permissions(app):
    item = installed(app, package(kind='skill'))
    t = action_turn(app,item,kind='capability.describe')
    t = app.execute(t['id'])
    with app.store.tx() as db:
        result = db.execute('SELECT result_json FROM actions WHERE turn_id=?',(t['id'],)).fetchone()[0]
    assert 'Compare the given evidence' in result and 'references/help.md' in result and 'Example reference' not in result
    t = action_turn(app,item,kind='capability.describe',resource='references/help.md')
    assert app.execute(t['id'])['actions'][0]['result']['content']=='Example reference'
    with pytest.raises(ProductError,match='permission_denied'):
        action_turn(app,item,kind='capability.describe',grants=[])


def test_write_grants_and_schema_reconnect_fail_closed(app):
    item = installed(app)
    with pytest.raises(ProductError,match='capability_write_not_supported'):
        dispatch(app,'grant',id=item['id'],component='mcp.notes',tools=['write_note'],expected_revision=item['revision'])
    connected = dispatch(app,'connected',id=item['id'],version=item['version'],component='mcp.notes',tools=TOOLS,expected_revision=item['revision'])
    assert not connected['ready'] and not any(t['allowed'] for t in connected['components'][0]['tools'])


def test_claim_is_once_and_receipt_is_bound_to_action_and_token(app):
    item=installed(app);t=action_turn(app,item);a=t['actions'][0]
    claim=dispatch(app,'claim',turn_id=t['id'],action_id=a['id'])
    assert app.turn(t['id'])['actions'][0]['state']=='outcome_unknown'
    with pytest.raises(ProductError,match='capability_already_claimed'):
        dispatch(app,'claim',turn_id=t['id'],action_id=a['id'])
    payload={'turn_id':t['id'],'action_id':a['id'],'token':claim['token'],'status':'succeeded','result':{'content':[{'type':'text','text':'42'}]},'error':None}
    with pytest.raises(ProductError,match='capability_receipt_mismatch'):
        dispatch(app,'finish',**{**payload,'token':str(uuid4())})
    assert dispatch(app,'finish',**payload)['recorded']
    assert dispatch(app,'finish',**payload)['recorded']
    with pytest.raises(ProductError,match='capability_receipt_mismatch'):
        dispatch(app,'finish',**{**payload,'result':{'different':True}})
    assert app.execute(t['id'])['actions'][0]['state']=='accepted'


def test_crash_after_claim_preserves_uncertainty_and_never_replays(app):
    item=installed(app);t=action_turn(app,item);a=t['actions'][0]
    dispatch(app,'claim',turn_id=t['id'],action_id=a['id'])
    assert app.recover()['interrupted_capability_calls']==1
    assert app.recover()['interrupted_capability_calls']==0
    assert app.turn(t['id'])['state']=='outcome_unknown'
    assert app.execute(t['id'])['actions'][0]['state']=='outcome_unknown'
    with pytest.raises(ProductError):
        dispatch(app,'claim',turn_id=t['id'],action_id=a['id'])
    app.revoke(t['id']);assert app.turn(t['id'])['state']=='cancelled'


def test_stop_wins_over_a_late_result(app):
    item=installed(app);t=action_turn(app,item);a=t['actions'][0]
    claim=dispatch(app,'claim',turn_id=t['id'],action_id=a['id']);app.revoke(t['id'])
    dispatch(app,'finish',turn_id=t['id'],action_id=a['id'],token=claim['token'],status='succeeded',result={'text':'late'},error=None)
    after=app.turn(t['id']);assert after['state']=='cancelled' and after['actions'][0]['state']=='blocked'


def test_disabled_or_stale_package_cannot_be_claimed(app):
    item=installed(app);t=action_turn(app,item);a=t['actions'][0]
    dispatch(app,'manage',id=item['id'],operation='disable',version=None,expected_revision=item['revision'])
    with pytest.raises(ProductError,match='capability_changed'):
        dispatch(app,'claim',turn_id=t['id'],action_id=a['id'])


def test_disabling_package_also_blocks_a_late_success(app):
    item=installed(app);t=action_turn(app,item);a=t['actions'][0]
    claim=dispatch(app,'claim',turn_id=t['id'],action_id=a['id'])
    dispatch(app,'manage',id=item['id'],operation='disable',version=None,expected_revision=item['revision'])
    dispatch(app,'finish',turn_id=t['id'],action_id=a['id'],token=claim['token'],status='succeeded',result={'text':'late'},error=None)
    assert app.turn(t['id'])['actions'][0]['state']=='blocked'


def test_apply_saved_set_is_atomic_and_does_not_invent_grants(app):
    one=installed(app,package(kind='skill'));two=dispatch(app,'import',definition=package(key='c'))
    saved=dispatch(app,'save-set',name='Research',items=[{'id':one['id'],'version':one['version']},{'id':two['id'],'version':two['version']}])
    one=dispatch(app,'manage',id=one['id'],expected_revision=one['revision'],operation='disable',version=None)
    with pytest.raises(ProductError,match='capability_not_ready'):
        dispatch(app,'apply-set',id=saved['id'])
    assert not dispatch(app,'read',id=one['id'])['enabled']
    good=dispatch(app,'save-set',name='Writing',items=[{'id':one['id'],'version':one['version']}])
    dispatch(app,'apply-set',id=good['id'])
    assert dispatch(app,'read',id=one['id'])['enabled']
