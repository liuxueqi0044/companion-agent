"""Bounded, stable browsing projections over the existing turn journal."""
from __future__ import annotations

from .models import ConversationListRequest, ConversationTurnsRequest, validate
from .store import ProductStore


def preview(value):
    return value[:240] if value is not None else None


class ConversationBrowser:
    def __init__(self, store: ProductStore):
        self.store = store

    def list(self, payload):
        query = validate(ConversationListRequest, payload)
        with self.store.tx() as db:
            snapshot = query.snapshot if query.snapshot is not None else db.execute(
                'SELECT COALESCE(MAX(rowid),0) FROM turns').fetchone()[0]
            rows = db.execute('''WITH latest AS (
                SELECT conversation_id, MAX(rowid) AS cursor FROM turns
                WHERE rowid<=? AND temporary=0 GROUP BY conversation_id)
                SELECT t.conversation_id,t.id AS latest_turn_id,t.rowid AS cursor,t.created_at,t.text,t.reply
                FROM latest l JOIN turns t ON t.rowid=l.cursor
                WHERE (? IS NULL OR t.rowid<?)
                ORDER BY t.rowid DESC LIMIT ?''',
                (snapshot, query.before, query.before, query.limit + 1)).fetchall()
        more = len(rows) > query.limit
        items = [{'conversation_id': row['conversation_id'], 'latest_turn_id': row['latest_turn_id'],
                  'cursor': row['cursor'], 'last_active_at': row['created_at'],
                  'text_preview': preview(row['text']), 'reply_preview': preview(row['reply'])}
                 for row in rows[:query.limit]]
        return {'items': items, 'snapshot': snapshot,
                'next_before': items[-1]['cursor'] if more else None}

    def turns(self, payload):
        query = validate(ConversationTurnsRequest, payload)
        with self.store.tx() as db:
            snapshot = query.snapshot if query.snapshot is not None else db.execute(
                'SELECT COALESCE(MAX(rowid),0) FROM turns').fetchone()[0]
            rows = db.execute('''SELECT t.rowid AS cursor,t.id,t.conversation_id,t.text,t.reply,
                t.state,t.temporary,t.created_at,
                EXISTS(SELECT 1 FROM actions a WHERE a.turn_id=t.id) AS has_actions
                FROM turns t WHERE t.conversation_id=? AND t.rowid<=? AND t.temporary=0
                AND (? IS NULL OR t.rowid<?)
                ORDER BY t.rowid DESC LIMIT ?''',
                (query.conversation_id, snapshot, query.before, query.before, query.limit + 1)).fetchall()
        more = len(rows) > query.limit
        items = [{'id': row['id'], 'conversation_id': row['conversation_id'], 'cursor': row['cursor'],
                  'text_preview': preview(row['text']), 'reply_preview': preview(row['reply']),
                  'state': row['state'], 'temporary': bool(row['temporary']),
                  'has_actions': bool(row['has_actions']), 'created_at': row['created_at']}
                 for row in rows[:query.limit]]
        return {'items': items, 'snapshot': snapshot,
                'next_before': items[-1]['cursor'] if more else None}
