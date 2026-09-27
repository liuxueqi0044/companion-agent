import json
from conftest import turn, policy


def test_49_short_preferences_keep_first_and_last_in_context(app):
    first = app.memory.add('回答时先说结论')['id']
    for n in range(48):
        last = app.memory.add(f'其他偏好 {n}')['id']
    context = app.begin(turn(app, text='你好', capabilities=())['id'])
    ids = {m['id'] for m in context['memories']}
    assert first in ids and last in ids
    assert len(app.memory.list()) == 49


def test_relevance_searches_beyond_recent_window_and_respects_edit_forget(app):
    old = app.memory.add('项目玄武使用账单编号作为主键', 'work')['id']
    for n in range(160):
        app.memory.add(f'无关项目 {n}', 'work')
    assert app.memory.retrieve('玄武的账单如何关联')[0]['id'] == old
    app.memory.edit(old, 1, '项目白鹭使用订单编号')
    current = app.memory.retrieve('白鹭订单编号')[0]
    assert current['id'] == old and current['revision'] == 2
    assert '玄武' not in json.dumps(app.memory.retrieve('玄武'), ensure_ascii=False)
    app.memory.forget(old, 2)
    assert old not in {m['id'] for m in app.memory.retrieve('白鹭订单编号')}


def test_retrieval_is_bounded_and_policy_is_still_authoritative(app):
    for n in range(130):
        app.memory.add(f'长期偏好 {n} ' + '细节' * 200)
    rows = app.memory.retrieve('长期偏好')
    assert len(rows) <= 96
    assert len(json.dumps(rows, ensure_ascii=False, separators=(',', ':')).encode()) <= 20 * 1024
    assert rows == app.memory.retrieve('长期偏好')
    policy(app, memory_categories=['work'])
    assert app.memory.retrieve('长期偏好') == []
    policy(app, memory_categories=['preferences'], memory_enabled=False)
    assert app.memory.retrieve('长期偏好') == []
    policy(app, memory_enabled=True)
    assert app.begin(turn(app, temporary=True, capabilities=())['id'])['memories'] == []


def test_english_words_casefold_and_unicode_normalization(app):
    old = app.memory.add('Use PostgreSQL for invoice reconciliation', 'work')['id']
    for n in range(120):
        app.memory.add(f'unrelated {n}', 'work')
    assert app.memory.retrieve('ＰＯＳＴＧＲＥＳＱＬ invoice')[0]['id'] == old
