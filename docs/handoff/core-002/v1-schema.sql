-- Frozen CORE-001 schema; build fresh migration fixtures only.
CREATE TABLE meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL,
 profile_id TEXT NOT NULL, policy_json TEXT NOT NULL);
CREATE TABLE turns(id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, conversation_id TEXT NOT NULL,
 text TEXT NOT NULL, csv_text TEXT, temporary INTEGER NOT NULL, grants_json TEXT NOT NULL,
 profile_revision INTEGER NOT NULL, policy_revision INTEGER NOT NULL, state TEXT NOT NULL,
 ticket TEXT, reply TEXT, summary TEXT, error TEXT, created_at TEXT NOT NULL);
CREATE TABLE actions(id TEXT PRIMARY KEY, turn_id TEXT NOT NULL REFERENCES turns(id),
 ordinal INTEGER NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL,
 state TEXT NOT NULL, result_json TEXT, error TEXT, UNIQUE(turn_id,ordinal));
CREATE TABLE memories(id TEXT PRIMARY KEY, source_id TEXT NOT NULL, category TEXT NOT NULL,
 content TEXT NOT NULL, revision INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
 UNIQUE(source_id,category,content));
CREATE TABLE excluded_sources(source_id TEXT PRIMARY KEY);
CREATE TABLE followups(id TEXT PRIMARY KEY, source_id TEXT NOT NULL UNIQUE REFERENCES turns(id),
 topic TEXT NOT NULL, purpose TEXT NOT NULL, due_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 state TEXT NOT NULL, ticket TEXT, policy_revision INTEGER NOT NULL, reason TEXT,
 attempts INTEGER NOT NULL DEFAULT 0, context_cursor INTEGER);
CREATE TABLE blocked_topics(topic TEXT PRIMARY KEY);
CREATE TABLE inbox(id TEXT PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
 text TEXT NOT NULL, source_id TEXT, reference_id TEXT, created_at TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0);
CREATE TABLE reminders(id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, text TEXT NOT NULL,
 due_at TEXT NOT NULL, state TEXT NOT NULL);
CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT, turn_id TEXT, kind TEXT NOT NULL,
 reference_id TEXT, occurred_at TEXT NOT NULL);
CREATE TABLE experiences(revision INTEGER PRIMARY KEY AUTOINCREMENT, package_revision TEXT NOT NULL,
 source_hash TEXT NOT NULL, artifact_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE experience_head(singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL);
CREATE INDEX pending_followups ON followups(state,due_at);
CREATE INDEX conversation_turns ON turns(conversation_id,created_at);
