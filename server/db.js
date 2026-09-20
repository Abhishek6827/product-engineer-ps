// server/db.js — SQLite persistence layer using Node 24 built-in node:sqlite
//
// Design decisions:
// - node:sqlite (DatabaseSync) provides zero-native-dependency SQLite.
// - WAL journal mode allows concurrent readers while the generator writes.
// - Synchronous API simplifies the prototype — no callback/promise overhead
//   for what is fundamentally a single-writer workload.
// - Startup recovery marks stale running/queued runs as 'interrupted' rather
//   than silently resuming, because the generator state is lost on crash.

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = join(__dirname, '..', 'data', 'runs.db');

let db;

/**
 * Initialize the database. Accepts an optional path override for testing.
 * @param {string} [dbPath]
 * @returns {DatabaseSync}
 */
export function initDb(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_message_id TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued'
        CHECK(state IN ('queued','running','completed','failed','interrupted')),
      total_events INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      error TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id),
      FOREIGN KEY (user_message_id) REFERENCES messages(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'text_chunk',
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (run_id, seq),
      FOREIGN KEY (run_id) REFERENCES runs(id)
    )
  `);

  return db;
}

/** @returns {DatabaseSync} */
export function getDb() {
  if (!db) throw new Error('Database not initialized — call initDb() first.');
  return db;
}

// ── Conversation helpers ────────────────────────────────────────────────

export function createConversation(id = randomUUID()) {
  getDb().prepare('INSERT INTO conversations (id) VALUES (?)').run(id);
  return id;
}

export function getConversation(id) {
  return getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

// ── Message helpers ─────────────────────────────────────────────────────

export function createMessage(id, conversationId, role, content) {
  getDb().prepare(
    'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)'
  ).run(id, conversationId, role, content);
  return id;
}

// ── Run helpers ─────────────────────────────────────────────────────────

export function createRun(id, conversationId, userMessageId) {
  getDb().prepare(
    'INSERT INTO runs (id, conversation_id, user_message_id, state) VALUES (?, ?, ?, ?)'
  ).run(id, conversationId, userMessageId, 'queued');
  return id;
}

export function updateRunState(runId, state, extra = {}) {
  const sets = ['state = ?'];
  const params = [state];
  if (extra.completedAt) {
    sets.push('completed_at = ?');
    params.push(extra.completedAt);
  }
  if (extra.error !== undefined) {
    sets.push('error = ?');
    params.push(extra.error);
  }
  if (extra.totalEvents !== undefined) {
    sets.push('total_events = ?');
    params.push(extra.totalEvents);
  }
  params.push(runId);
  getDb()
    .prepare(`UPDATE runs SET ${sets.join(', ')} WHERE id = ?`)
    .run(...params);
}

export function getRun(runId) {
  return getDb().prepare('SELECT * FROM runs WHERE id = ?').get(runId);
}

// ── Event helpers ───────────────────────────────────────────────────────

export function insertEvent(runId, seq, type, payload) {
  getDb().prepare(
    'INSERT INTO events (run_id, seq, type, payload) VALUES (?, ?, ?, ?)'
  ).run(runId, seq, type, payload);
}

export function getEventsAfterSeq(runId, afterSeq) {
  return getDb()
    .prepare('SELECT * FROM events WHERE run_id = ? AND seq > ? ORDER BY seq ASC')
    .all(runId, afterSeq);
}

export function getEventCount(runId) {
  const row = getDb()
    .prepare('SELECT COUNT(*) as count FROM events WHERE run_id = ?')
    .get(runId);
  return row.count;
}

export function getMaxSeq(runId) {
  const row = getDb()
    .prepare('SELECT MAX(seq) as max_seq FROM events WHERE run_id = ?')
    .get(runId);
  return row.max_seq ?? 0;
}

// ── Startup recovery ────────────────────────────────────────────────────
// Mark any runs left in 'running' or 'queued' state as 'interrupted'.
// This is the honest policy: the in-memory generator died with the process,
// so we cannot guarantee the run would have completed. The durable event
// history up to the crash point is preserved and inspectable.

export function recoverStaleRuns() {
  const stmt = getDb().prepare(
    `UPDATE runs
       SET state = 'interrupted',
           completed_at = datetime('now'),
           error = 'Process restarted while run was active'
     WHERE state IN ('queued', 'running')`
  );
  return stmt.run().changes;
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}
