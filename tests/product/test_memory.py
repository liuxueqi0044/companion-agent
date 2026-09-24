import pytest
from services.product.models import ProductError
from conftest import turn, policy, planned


def test_memory_controlled_source_edit_forget(app, model):
    model.decision = {'reply': '好的。', 'memories': [{'content': '偏好简短回答', 'category': 'preferences'}]}
    item = turn(app, capabilities=())
    app.respond(item['id'])
    record = app.memory.list()[0]
    assert record['source_id'] == item['id']
    app.memory.edit(record['id'], 1, '偏好先听结论')
    assert app.memory.retrieve()[0]['content'] == '偏好先听结论'
    with pytest.raises(ProductError, match='revision_conflict'):
        app.memory.edit(record['id'], 1, '迟到编辑')
    app.memory.forget(record['id'], 2)
    assert app.memory.list() == []
    follow = turn(app, capabilities=(), conversation=item['conversation_id'])
    assert app.begin(follow['id'])['history'] == []


def test_off_blocks_reads_and_late_writes_without_deleting_saved_memory(app):
    app.memory.add('喜欢咖啡')
    item = turn(app)
    context = app.begin(item['id'])
    policy(app, memory_enabled=False)
    assert app.memory.retrieve() == [] and len(app.memory.list()) == 1
    result = app.accept(item['id'], context['ticket'], {'reply': 'x', 'memories': [{'content': '新记忆', 'category': 'preferences'}]})
    assert result['error'] == 'context_changed' and len(app.memory.list()) == 1
    policy(app, memory_enabled=True)
    assert app.memory.retrieve()[0]['content'] == '喜欢咖啡'


def test_no_backfill_and_temporary_conversation(app, model):
    policy(app, memory_enabled=False)
    model.decision = {'reply': 'x', 'memories': [{'content': '不要补录', 'category': 'work'}]}
    app.respond(turn(app, capabilities=())['id'])
    policy(app, memory_enabled=True)
    assert app.memory.list() == []
    app.memory.add('已有记忆')
    item = turn(app, temporary=True, capabilities=())
    context = app.begin(item['id'])
    assert context['memories'] == [] and context['history'] == [] and not context['proactive_allowed']
    app.accept(item['id'], context['ticket'], model.decision)
    assert len(app.memory.list()) == 1


def test_scope_limits_future_retrieval_and_extraction(app, model):
    app.memory.add('工作信息', 'work')
    app.memory.add('表达偏好', 'preferences')
    policy(app, memory_categories=['work'])
    assert [item['category'] for item in app.memory.retrieve()] == ['work']
    model.decision = {'reply': 'x', 'memories': [{'content': '不在范围', 'category': 'goals'}]}
    app.respond(turn(app, capabilities=())['id'])
    assert len(app.memory.list()) == 2


def test_memory_off_cancels_old_followup_context(app, model, clock):
    _, plan = planned(app, model, clock)
    policy(app, memory_enabled=False)
    assert app.contact.inspect_plans()[0]['state'] == 'cancelled'
    clock.advance(hours=1)
    assert app.tick()['followup'] is None


def test_edit_can_be_done_while_memory_off(app):
    record = app.memory.add('one')
    policy(app, memory_enabled=False)
    app.memory.edit(record['id'], 1, 'two')
    assert app.memory.retrieve() == [] and app.memory.list()[0]['content'] == 'two'


def test_policy_cas_and_strict_boolean(app):
    original = app.store.read_policy()
    policy(app, proactive_enabled=True)
    with pytest.raises(ProductError, match='revision_conflict'):
        app.memory.configure(original.revision, original)
    with pytest.raises(ProductError, match='invalid_request'):
        policy(app, memory_enabled='false')


def test_multiple_same_category_memories_paging_and_clear(app, model):
    model.decision = {'reply':'x','memories':[{'category':'work','content':'项目A'}, {'category':'work','content':'项目B'}]}
    app.respond(turn(app,capabilities=())['id'])
    first = app.memory.list(limit=1)
    second = app.memory.list(limit=1,before=first[0]['cursor'])
    assert len(first) == len(second) == 1 and first[0]['id'] != second[0]['id']
    app.memory.clear(app.store.read_policy().revision)
    assert app.memory.list() == []
    assert app.home()['profile']['profile_id']


def test_concurrent_policy_changes_only_one_cas_wins(app):
    from concurrent.futures import ThreadPoolExecutor
    original = app.store.read_policy()
    def change(enabled):
        try:
            return app.memory.configure(original.revision,{**original.model_dump(mode='json'),'proactive_enabled':enabled}).revision
        except ProductError as exc:
            return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(change,[True,False]))
    assert sorted(map(str,outcomes)) == ['2','revision_conflict']
