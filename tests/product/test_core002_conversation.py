from uuid import uuid4
import json

import pytest

from conftest import turn
from services.product.kernel import ProductKernel
from services.product.models import ProductError


def test_reopen_list_and_select_original_turn(app, clock):
    first = turn(app, text='核对材料', capabilities=('csv.audit',))
    app.respond(first['id'])
    original_task = app.execute(first['id'])['actions'][0]['task']['task_id']
    restarted = ProductKernel(app.root, clock=clock)
    page = restarted.conversations.list({})
    assert page['items'][0]['conversation_id'] == first['conversation_id']
    turns = restarted.conversations.turns({'conversation_id': first['conversation_id']})
    assert turns['items'][0]['id'] == first['id']
    assert restarted.turn(turns['items'][0]['id'])['actions'][0]['task']['task_id'] == original_task


def test_snapshot_keyset_pages_with_same_timestamps_and_new_input(app):
    conversations = [str(uuid4()) for _ in range(5)]
    records = [turn(app, conversation=cid, text=f'conversation-{i}', csv_text=None,
                    capabilities=()) for i, cid in enumerate(conversations)]
    first = app.conversations.list({'limit': 2})
    assert len(first['items']) == 2 and first['next_before']
    inserted = turn(app, conversation=conversations[0], text='new', csv_text=None, capabilities=())
    pages = list(first['items'])
    before = first['next_before']
    while before is not None:
        page = app.conversations.list({'limit': 2, 'snapshot': first['snapshot'], 'before': before})
        pages.extend(page['items'])
        before = page['next_before']
    assert len(pages) == 5 and len({row['conversation_id'] for row in pages}) == 5
    assert inserted['id'] not in [row['latest_turn_id'] for row in pages]
    assert app.conversations.list({})['items'][0]['latest_turn_id'] == inserted['id']
    assert app.conversations.list({'snapshot': 0}) == {'items': [], 'snapshot': 0, 'next_before': None}


def test_turn_summary_is_small_and_excludes_material_and_temporary(app):
    cid = str(uuid4())
    private_csv = 'header\n' + 'SECRET_SOURCE' * 500
    long = '长' * 2000
    ordinary = turn(app, conversation=cid, text=long, csv_text=private_csv, capabilities=('csv.audit',))
    temporary = turn(app, conversation=cid, text='TEMP_SECRET', csv_text=None,
                     temporary=True, capabilities=())
    page = app.conversations.turns({'conversation_id': cid})
    assert len(page['items']) == 1 and page['items'][0]['id'] == ordinary['id']
    assert len(page['items'][0]['text_preview']) == 240
    wire = json.dumps(page)
    assert 'SECRET_SOURCE' not in wire and 'TEMP_SECRET' not in wire
    assert 'grants' not in wire and 'ticket' not in wire and 'due_at' not in wire
    assert app.turn(temporary['id'])['temporary']
    assert app.conversations.turns({'conversation_id': str(uuid4())})['items'] == []


@pytest.mark.parametrize('payload', [{'limit': True}, {'limit': 0}, {'limit': 51},
                                     {'snapshot': -1}, {'before': 0}, {'unknown': 1}])
def test_invalid_page_values(app, payload):
    with pytest.raises(ProductError, match='invalid_request'):
        app.conversations.list(payload)
