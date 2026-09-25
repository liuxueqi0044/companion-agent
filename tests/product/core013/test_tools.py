import json
from uuid import uuid4

import pytest

from services.product.entry import dispatch
from services.product.models import ProductError
from services.product.tool_library import query, ToolLibrary


def definition(sql='SELECT DISTINCT name FROM data ORDER BY name'):
    return {'name':'去重','description':'按 name 去重排序','sql':sql,'parameters':[],
            'examples':[{'csv_text':'name\nB\nA\nB\n','parameters':{},'expected':[{'name':'A'},{'name':'B'}]}]}


def action(app, value, csv_text=None, grants=('tool.save','tool.run')):
    turn=app.submit_turn({'command_id':str(uuid4()),'conversation_id':str(uuid4()),'text':'保存或运行我的工具','csv_text':csv_text},capabilities=grants)
    c=app.begin(turn['id']);app.accept(turn['id'],c['ticket'],{'reply':'正在处理。','actions':[value]})
    return app.execute(turn['id'])


def test_real_save_new_input_reuse_artifact_and_reopen(app):
    saved=action(app,{'kind':'tool.save','definition':definition()})
    receipt=saved['actions'][0]['tool'];assert receipt['validation']['passed']==1
    repeated=app.execute(saved['id']);assert repeated==saved
    run=action(app,{'kind':'tool.run','tool_id':receipt['id'],'version':1,'parameters':{}},'name\nC\nC\nD\n')
    a=run['actions'][0];assert a['state']=='accepted' and a['row_count']==2
    output=dispatch(app,'artifact.read',{'turn_id':run['id'],'action_id':a['id']})
    assert json.loads(output['files'][0]['content'])==[{'name':'C'},{'name':'D'}]
    reopened=ToolLibrary(app.root);reopened.bootstrap()
    assert reopened.read(receipt['id'])['sha256']==receipt['sha256']
    c=app.submit_turn({'command_id':str(uuid4()),'conversation_id':str(uuid4()),'text':'用已有的工具'},capabilities=('tool.run',))
    assert app.begin(c['id'])['tools'][0]['id']==receipt['id']


def test_failed_examples_never_save_or_revise(app):
    bad=definition('SELECT name FROM data')
    failed=action(app,{'kind':'tool.save','definition':bad})
    assert failed['actions'][0]['state']=='failed'
    assert failed['actions'][0]['error']=='tool_example_failed'
    assert app.tools.catalog()==[]


def test_versions_cas_disable_and_restore(app):
    r=app.tools.save(str(uuid4()),{'kind':'tool.save','definition':definition()})
    changed=definition('SELECT DISTINCT name FROM data ORDER BY name DESC')
    changed['examples'][0]['expected']=[{'name':'B'},{'name':'A'}]
    second=app.tools.save(str(uuid4()),{'kind':'tool.save','tool_id':r['id'],'expected_revision':1,'definition':changed})
    assert second['version']==2 and second['revision']==2
    with pytest.raises(ProductError,match='tool_revision_conflict'):
        app.tools.run(r['id'],1,{},'name\nA\n')
    with pytest.raises(ProductError,match='tool_revision_conflict'):
        app.tools.manage({'command_id':str(uuid4()),'tool_id':r['id'],'expected_revision':1,'operation':'disable'})
    command={'command_id':str(uuid4()),'tool_id':r['id'],'expected_revision':2,'operation':'disable'}
    disabled=app.tools.manage(command);assert app.tools.manage(command)==disabled
    with pytest.raises(ProductError,match='tool_disabled'):
        app.tools.run(r['id'],2,{},'name\nA\n')
    restored=app.tools.manage({'command_id':str(uuid4()),'tool_id':r['id'],'expected_revision':3,'operation':'restore','version':1})
    assert restored['version']==1 and not restored['enabled']
    enabled=app.tools.manage({'command_id':str(uuid4()),'tool_id':r['id'],'expected_revision':4,'operation':'enable'})
    assert enabled['revision']==5
    assert app.tools.run(r['id'],1,{},'name\nB\nA\n')['rows']==[{'name':'A'},{'name':'B'}]


@pytest.mark.parametrize('sql',[
    "ATTACH DATABASE 'file.db' AS other", 'SELECT * FROM sqlite_master', 'PRAGMA database_list',
    'DELETE FROM data', "SELECT load_extension('missing')", "SELECT readfile('secret')",
    'SELECT randomblob(100000000)', 'SELECT 1; SELECT 2', 'CREATE TABLE evil(x)',
    "SELECT * FROM pragma_database_list", 'SELECT name AS x, name AS x FROM data',
])
def test_sql_cannot_escape_explicit_input(sql):
    with pytest.raises(ProductError):
        query(definition(sql),'name\nA\n',{})


def test_query_cost_and_output_limits():
    with pytest.raises(ProductError,match='tool_query_limit'):
        query(definition('WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n) SELECT sum(x) FROM n'),None,{})
    with pytest.raises(ProductError,match='tool_output_too_large'):
        query(definition('SELECT * FROM data'),'name\n'+'A\n'*1001,{})
    with pytest.raises(ProductError,match='tool_invalid_csv'):
        query(definition(),'name,NAME\nA,B\n',{})


def test_text_parameters_are_data_not_sql():
    d={'name':'文本整理','description':'去首尾空白','sql':'SELECT trim(:text) AS cleaned',
       'parameters':[{'name':'text','type':'text','description':'原文'}],
       'examples':[{'parameters':{'text':' hi '},'expected':[{'cleaned':'hi'}]}]}
    assert query(d,None,{'text':" '; DELETE FROM data; -- "})['rows']==[{'cleaned':"'; DELETE FROM data; --"}]
    with pytest.raises(ProductError,match='tool_parameters_invalid'):
        query(d,None,{'text':1})


def test_context_invalidates_when_tools_change_and_permissions_apply(app):
    t=app.submit_turn({'command_id':str(uuid4()),'conversation_id':str(uuid4()),'text':'新工具'},capabilities=('tool.save',))
    c=app.begin(t['id']);app.tools.save(str(uuid4()),{'kind':'tool.save','definition':definition()})
    assert app.accept(t['id'],c['ticket'],{'reply':'ok','actions':[]})['error']=='context_changed'
    with pytest.raises(ProductError,match='permission_denied'):
        action(app,{'kind':'tool.save','definition':definition()},grants=())


def test_corrupt_source_preserved_and_rejected(app):
    r=app.tools.save(str(uuid4()),{'kind':'tool.save','definition':definition()})
    with app.tools.tx(True) as db:
        db.execute('UPDATE versions SET sha256=?',('bad',))
    with pytest.raises(ProductError,match='tool_store_invalid'):
        app.tools.run(r['id'],1,{},'name\nA\n')


def test_edit_context_includes_only_explicitly_named_source(app):
    r=app.tools.save(str(uuid4()),{'kind':'tool.save','definition':definition()})
    t=app.submit_turn({'command_id':str(uuid4()),'conversation_id':str(uuid4()),'text':'修改工具 '+r['id']},capabilities=('tool.save',))
    c=app.begin(t['id'])
    assert c['tool_details'][0]['definition']['sql']==definition()['sql']
    other=app.submit_turn({'command_id':str(uuid4()),'conversation_id':str(uuid4()),'text':'聊聊今天'},capabilities=('tool.run',))
    assert app.begin(other['id'])['tool_details']==[]


def test_disable_after_accept_prevents_actual_query(app):
    r=app.tools.save(str(uuid4()),{'kind':'tool.save','definition':definition()})
    t=app.submit_turn({'command_id':str(uuid4()),'conversation_id':str(uuid4()),'text':'运行','csv_text':'name\nA\n'},capabilities=('tool.run',))
    c=app.begin(t['id']);app.accept(t['id'],c['ticket'],{'reply':'准备运行','actions':[{'kind':'tool.run','tool_id':r['id'],'version':1,'parameters':{}}]})
    app.tools.manage({'command_id':str(uuid4()),'tool_id':r['id'],'expected_revision':1,'operation':'disable'})
    result=app.execute(t['id'])
    assert result['actions'][0]['error']=='tool_disabled'
    assert 'artifact' not in result['actions'][0]
