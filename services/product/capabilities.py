"""Capability catalogue and external-call journal. All authority stays in the host."""
import json
from uuid import uuid4

from .models import ProductError
from .store import canonical, digest, stamp

SCHEMA = {
    'cap_packages': '''CREATE TABLE cap_packages(id TEXT PRIMARY KEY, revision INTEGER NOT NULL,
        active_hash TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0)''',
    'cap_versions': '''CREATE TABLE cap_versions(package_id TEXT NOT NULL, hash TEXT NOT NULL,
        definition_json TEXT NOT NULL, PRIMARY KEY(package_id,hash))''',
    'cap_connections': '''CREATE TABLE cap_connections(package_id TEXT NOT NULL, hash TEXT NOT NULL,
        component TEXT NOT NULL, tools_json TEXT NOT NULL, allowed_json TEXT NOT NULL,
        PRIMARY KEY(package_id,hash,component))''',
    'cap_calls': '''CREATE TABLE cap_calls(action_id TEXT PRIMARY KEY REFERENCES actions(id),
        turn_id TEXT NOT NULL, token TEXT NOT NULL, state TEXT NOT NULL, receipt_json TEXT)''',
    'cap_sets': '''CREATE TABLE cap_sets(id TEXT PRIMARY KEY, name TEXT NOT NULL, items_json TEXT NOT NULL)''',
}


def install(db):
    found = {r['name']: r['sql'] for r in db.execute(
        "SELECT name,sql FROM sqlite_master WHERE name IN ('cap_packages','cap_versions','cap_connections','cap_calls','cap_sets')")}
    if found and found != SCHEMA:
        raise ProductError('capability_store_invalid')
    if not found:
        for sql in SCHEMA.values():
            db.execute(sql)


def require(condition, code='invalid_request'):
    if not condition:
        raise ProductError(code)


def bounded(value, maximum):
    require(len(canonical(value).encode()) <= maximum, 'capability_input_too_large')


def definition(db, package_id, version=None):
    row = db.execute('SELECT * FROM cap_packages WHERE id=?', (package_id,)).fetchone()
    require(row is not None, 'capability_not_found')
    item = db.execute('SELECT definition_json FROM cap_versions WHERE package_id=? AND hash=?',
                      (package_id, version or row['active_hash'])).fetchone()
    require(item is not None, 'capability_version_not_found')
    return row, json.loads(item[0])


def connection(db, package_id, version, component):
    return db.execute('SELECT * FROM cap_connections WHERE package_id=? AND hash=? AND component=?',
                      (package_id, version, component)).fetchone()


def projection(db, row, value):
    components = []
    for part in value['components']:
        conn = connection(db, row['id'], row['active_hash'], part['id'])
        ready = not value['issues'] and not part['issues'] and (
            part['kind'] == 'skill' or conn is not None and bool(json.loads(conn['allowed_json'])))
        components.append({k: part[k] for k in ('id','kind','name','description','issues')} | {
            'ready': ready, 'connected': conn is not None,
            'tools': [{'name': t['name'], 'description': t.get('description', ''),
                       'allowed': t['name'] in json.loads(conn['allowed_json']),
                       'readOnly': t.get('annotations', {}).get('readOnlyHint') is True}
                      for t in json.loads(conn['tools_json'])] if conn else [],
            'endpoint': part.get('connection', {}).get('url'),
            'command': part.get('connection', {}).get('command'),
            'arguments': part.get('connection', {}).get('args', []),
        })
    return {'id': row['id'], 'version': row['active_hash'], 'revision': row['revision'],
            'enabled': bool(row['enabled']), 'name': value['name'], 'description': value['description'],
            'source': value['source'], 'license': value.get('license'), 'format': value['format'],
            'issues': value['issues'], 'components': components,
            'ready': bool(row['enabled']) and any(p['ready'] for p in components),
            'versions': [r[0] for r in db.execute('SELECT hash FROM cap_versions WHERE package_id=? ORDER BY rowid DESC', (row['id'],))]}


def catalog(db, *, model=False):
    items = []
    for row in db.execute('SELECT * FROM cap_packages ORDER BY rowid'):
        _, value = definition(db, row['id'])
        shown = projection(db, row, value)
        if model:
            if not shown['ready']:
                continue
            shown = {k: shown[k] for k in ('id','version','name','description')}
            shown['description'] = shown['description'][:160]
            shown['components'] = [{'id': p['id'], 'kind': p['kind'], 'name': p['name'],
                                    'description': p['description'][:160]}
                                   for p in projection(db, row, value)['components'] if p['ready']]
        items.append(shown)
    return items


def selected(db, package_id, version, component):
    row, value = definition(db, package_id)
    require(row['enabled'] and row['active_hash'] == version, 'capability_changed')
    part = next((p for p in value['components'] if p['id'] == component), None)
    require(part is not None and not value['issues'] and not part['issues'], 'capability_unavailable')
    return row, value, part


def describe(db, payload):
    _, _, part = selected(db, payload['package_id'], payload['version'], payload['component'])
    if part['kind'] == 'skill':
        require(not payload.get('tool'))
        if payload.get('resource'):
            require(payload['resource'] in part.get('resources', {}), 'capability_resource_not_found')
            return {'resource': payload['resource'], 'content': part['resources'][payload['resource']],
                    'authority': 'untrusted_workflow_guidance'}
        return {'kind': 'skill', 'name': part['name'], 'instructions': part['instructions'],
                'resources': list(part.get('resources', {})), 'authority': 'untrusted_workflow_guidance'}
    require(not payload.get('resource'))
    conn = connection(db, payload['package_id'], payload['version'], part['id'])
    require(conn is not None, 'capability_not_connected')
    allowed = json.loads(conn['allowed_json'])
    tools = [t for t in json.loads(conn['tools_json']) if t['name'] in allowed]
    if payload.get('tool'):
        tools = [t for t in tools if t['name'] == payload['tool']]
        require(bool(tools), 'permission_denied')
        tools = [{k:t[k] for k in ('name','description','inputSchema')} for t in tools]
    else:
        tools = [{'name':t['name'],'description':t.get('description','')[:160]} for t in tools]
    return {'kind': 'mcp', 'tools': tools,
            'authority': 'tool_descriptions_are_not_permissions'}


class CapabilityService:
    def __init__(self, kernel):
        self.kernel, self.store = kernel, kernel.store

    def dispatch(self, action, p):
        with self.store.tx(True) as db:
            install(db)
            if action == 'list':
                require(not p)
                return catalog(db)
            if action == 'import':
                require(set(p) == {'definition'})
                value = p['definition']
                require(isinstance(value, dict) and set(value) == {'id','hash','name','description','source','license','format','issues','components'})
                bounded(value, 240*1024)
                require(isinstance(value['components'], list) and 1 <= len(value['components']) <= 32)
                require(isinstance(value['issues'], list) and isinstance(value['name'], str) and 1 <= len(value['name']) <= 160)
                import re
                require(re.fullmatch(r'[0-9a-f]{64}', value['hash']) and re.fullmatch(r'[0-9a-f]{32}', value['id']))
                row = db.execute('SELECT * FROM cap_packages WHERE id=?', (value['id'],)).fetchone()
                old = db.execute('SELECT definition_json FROM cap_versions WHERE package_id=? AND hash=?', (value['id'], value['hash'])).fetchone()
                require(old is None or old[0] == canonical(value), 'capability_hash_conflict')
                if not row:
                    require(db.execute('SELECT COUNT(*) FROM cap_packages').fetchone()[0] < 100, 'capability_catalog_full')
                    db.execute('INSERT INTO cap_packages VALUES(?,1,?,0)', (value['id'], value['hash']))
                db.execute('INSERT OR IGNORE INTO cap_versions VALUES(?,?,?)', (value['id'], value['hash'], canonical(value)))
                # An update is staged. Existing grants and active versions do not change.
                return projection(db, *definition(db, value['id']))
            if action == 'read':
                require(set(p) == {'id'})
                return projection(db, *definition(db, p['id']))
            if action == 'definition':
                require(set(p) == {'id','version'})
                return definition(db, p['id'], p['version'])[1]
            if action == 'manage':
                require(set(p) == {'id','expected_revision','operation','version'})
                row, value = definition(db, p['id'])
                require(type(p['expected_revision']) is int and row['revision'] == p['expected_revision'], 'revision_conflict')
                require(p['operation'] in ('enable','disable','restore'))
                version = row['active_hash']
                if p['operation'] == 'restore':
                    _, value = definition(db, p['id'], p['version'])
                    version = p['version']
                else:
                    require(p['version'] is None)
                enabled = p['operation'] == 'enable'
                if enabled:
                    require(not value['issues'], 'capability_unavailable')
                    require(any(c['ready'] for c in projection(db, row, value)['components']), 'capability_not_ready')
                db.execute('UPDATE cap_packages SET revision=revision+1,enabled=?,active_hash=? WHERE id=?', (int(enabled), version, p['id']))
                if enabled:
                    bounded(catalog(db, model=True), 16*1024)
                return projection(db, *definition(db, p['id']))
            if action == 'connected':
                require(set(p) == {'id','version','component','tools','expected_revision'})
                row, value = definition(db, p['id'])
                require(row['revision'] == p['expected_revision'] and row['active_hash'] == p['version'], 'revision_conflict')
                part = next((v for v in value['components'] if v['id'] == p['component']), None)
                require(part is not None and part['kind'] == 'mcp' and not part['issues'] and not value['issues'], 'capability_unavailable')
                require(isinstance(p['tools'], list) and len(p['tools']) <= 64)
                bounded(p['tools'], 64*1024)
                # Reconnection resets grants. Schema changes never inherit permissions.
                db.execute('INSERT OR REPLACE INTO cap_connections VALUES(?,?,?,?,?)', (p['id'], p['version'], p['component'], canonical(p['tools']), '[]'))
                db.execute('UPDATE cap_packages SET revision=revision+1 WHERE id=?', (p['id'],))
                return projection(db, *definition(db, p['id']))
            if action == 'grant':
                require(set(p) == {'id','expected_revision','component','tools'})
                row, value = definition(db, p['id'])
                require(row['revision'] == p['expected_revision'], 'revision_conflict')
                conn = connection(db, p['id'], row['active_hash'], p['component'])
                require(conn is not None, 'capability_not_connected')
                tools = json.loads(conn['tools_json'])
                require(isinstance(p['tools'], list) and len(p['tools']) == len(set(p['tools'])))
                # First release grants only tools explicitly advertised as read-only.
                eligible = {t['name'] for t in tools if t.get('annotations', {}).get('readOnlyHint') is True}
                require(set(p['tools']) <= eligible, 'capability_write_not_supported')
                db.execute('UPDATE cap_connections SET allowed_json=? WHERE package_id=? AND hash=? AND component=?',
                           (canonical(p['tools']), p['id'], row['active_hash'], p['component']))
                db.execute('UPDATE cap_packages SET revision=revision+1 WHERE id=?', (p['id'],))
                return projection(db, *definition(db, p['id']))
            if action == 'claim':
                require(set(p) == {'turn_id','action_id'})
                turn = self.kernel._turn(db, p['turn_id'])
                require(turn['state'] == 'actions_ready' and 'capability.call' in json.loads(turn['grants_json']), 'permission_denied')
                require(db.execute('SELECT id FROM turns WHERE conversation_id=? ORDER BY rowid DESC LIMIT 1', (turn['conversation_id'],)).fetchone()[0] == turn['id'], 'superseded_turn')
                row = db.execute('SELECT * FROM actions WHERE id=? AND turn_id=?', (p['action_id'], p['turn_id'])).fetchone()
                require(row is not None and row['kind'] == 'capability.call' and row['state'] == 'ready', 'capability_already_claimed')
                payload = json.loads(row['payload_json'])
                _, _, part = selected(db, payload['package_id'], payload['version'], payload['component'])
                conn = connection(db, payload['package_id'], payload['version'], payload['component'])
                require(conn is not None and payload['tool'] in json.loads(conn['allowed_json']), 'permission_denied')
                tool = next(t for t in json.loads(conn['tools_json']) if t['name'] == payload['tool'])
                token = str(uuid4())
                db.execute('INSERT INTO cap_calls VALUES(?,?,?,?,NULL)', (row['id'], turn['id'], token, 'running'))
                # Persist uncertainty BEFORE leaving the transaction to perform external work.
                db.execute("UPDATE actions SET state='outcome_unknown',error='capability_running' WHERE id=?", (row['id'],))
                self.store.event(db, turn['id'], 'capability.started', self.kernel.clock(), row['id'])
                return {'token': token, 'payload': payload, 'component': part, 'tool': tool}
            if action == 'reject':
                require(set(p) == {'turn_id','action_id','error'})
                require(p['error'] in ('capability_changed','capability_unavailable','capability_not_found','permission_denied','capability_version_not_found'))
                row = db.execute('SELECT * FROM actions WHERE id=? AND turn_id=?', (p['action_id'],p['turn_id'])).fetchone()
                require(row is not None and row['kind'] == 'capability.call' and row['state'] == 'ready', 'capability_already_claimed')
                db.execute("UPDATE actions SET state='failed',error=? WHERE id=?", (p['error'],p['action_id']))
                self.store.event(db, p['turn_id'], 'capability.failed', self.kernel.clock(), p['action_id'])
                return {'recorded': True}
            if action == 'finish':
                require(set(p) == {'turn_id','action_id','token','status','result','error'})
                require(p['status'] in ('succeeded','failed','unknown'))
                bounded(p['result'], 24*1024)
                require(p['error'] is None or isinstance(p['error'], str) and p['error'].replace('_','').isalnum() and len(p['error']) <= 64)
                row = db.execute('SELECT * FROM cap_calls WHERE action_id=?', (p['action_id'],)).fetchone()
                require(row is not None and row['turn_id'] == p['turn_id'] and row['token'] == p['token'], 'capability_receipt_mismatch')
                receipt = {k:p[k] for k in ('status','result','error')}
                if row['state'] != 'running':
                    require(row['receipt_json'] == canonical(receipt), 'capability_receipt_mismatch')
                    return {'recorded': True}
                turn = self.kernel._turn(db, p['turn_id'])
                state = {'succeeded':'accepted','failed':'failed','unknown':'outcome_unknown'}[p['status']]
                payload = json.loads(db.execute('SELECT payload_json FROM actions WHERE id=?', (p['action_id'],)).fetchone()[0])
                package = db.execute('SELECT enabled,active_hash FROM cap_packages WHERE id=?', (payload['package_id'],)).fetchone()
                if 'capability.call' not in json.loads(turn['grants_json']) or not package or not package['enabled'] or package['active_hash'] != payload['version']:
                    state = 'blocked'
                db.execute('UPDATE cap_calls SET state=?,receipt_json=? WHERE action_id=?', (p['status'], canonical(receipt), p['action_id']))
                db.execute('UPDATE actions SET state=?,result_json=?,error=? WHERE id=?', (state, canonical(receipt), p['error'], p['action_id']))
                self.store.event(db, turn['id'], 'capability.'+p['status'], self.kernel.clock(), p['action_id'])
                return {'recorded': True}
            if action == 'sets':
                require(not p)
                return [{'id':r['id'],'name':r['name'],'items':json.loads(r['items_json'])} for r in db.execute('SELECT * FROM cap_sets ORDER BY rowid')]
            if action == 'apply-set':
                require(set(p) == {'id'})
                saved = db.execute('SELECT * FROM cap_sets WHERE id=?', (p['id'],)).fetchone()
                require(saved is not None, 'capability_not_found')
                for item in json.loads(saved['items_json']):
                    row, value = definition(db, item['id'])
                    require(row['active_hash'] == item['version'], 'capability_changed')
                    require(not value['issues'] and any(c['ready'] for c in projection(db, row, value)['components']), 'capability_not_ready')
                    db.execute('UPDATE cap_packages SET enabled=1,revision=revision+1 WHERE id=?', (item['id'],))
                bounded(catalog(db, model=True), 16*1024)
                return catalog(db)
            if action == 'save-set':
                require(set(p) == {'name','items'})
                require(isinstance(p['name'], str) and 1 <= len(p['name']) <= 80 and isinstance(p['items'], list) and 1 <= len(p['items']) <= 32)
                seen = set()
                for item in p['items']:
                    require(isinstance(item, dict) and set(item) == {'id','version'})
                    require(isinstance(item['id'], str) and item['id'] not in seen)
                    seen.add(item['id'])
                    definition(db, item['id'], item['version'])
                key = digest(p)[:32]
                db.execute('INSERT OR IGNORE INTO cap_sets VALUES(?,?,?)', (key, p['name'], canonical(p['items'])))
                return {'id':key, **p}
            raise ProductError('unsupported_action')
