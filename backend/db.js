'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

// Each migration runs once, inside a transaction. Append new ones, never edit released ones.
// Every row of user data carries a user_id. Tasks belong to a user through their project.
const MIGRATIONS = [
  {
    version: 1,
    name: 'initial multi-user schema',
    sql: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX sessions_user ON sessions(user_id);

      CREATE TABLE ideas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'parked'
          CHECK (status IN ('parked','evaluated','decided','dropped')),
        importance TEXT CHECK (importance IN ('important','not_important')),
        urgency TEXT CHECK (urgency IN ('urgent','not_urgent')),
        core_context TEXT CHECK (core_context IN ('core','context')),
        mission_critical TEXT CHECK (mission_critical IN ('yes','no')),
        money TEXT CHECK (money IN ('yes','neutral','no')),
        time TEXT CHECK (time IN ('yes','neutral','no')),
        delegation TEXT CHECK (delegation IN ('yes','neutral','no')),
        mandatory INTEGER NOT NULL DEFAULT 0,
        mandatory_reason TEXT NOT NULL DEFAULT '',
        due_date TEXT,
        quadrant_set_at TEXT,
        done_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX ideas_user ON ideas(user_id);

      CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
        kind TEXT NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal','inbox')),
        idea_id INTEGER REFERENCES ideas(id) ON DELETE SET NULL,
        core_context TEXT CHECK (core_context IN ('core','context')),
        mission_critical TEXT CHECK (mission_critical IN ('yes','no')),
        mandatory INTEGER NOT NULL DEFAULT 0,
        mandatory_reason TEXT NOT NULL DEFAULT '',
        quadrant_set_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX projects_user ON projects(user_id);

      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
        mandatory INTEGER NOT NULL DEFAULT 0,
        mandatory_reason TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        done_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX tasks_project ON tasks(project_id);

      CREATE TABLE gamification (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        xp_total INTEGER NOT NULL DEFAULT 0,
        xp_spent INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        last_active_day TEXT,
        settings TEXT NOT NULL DEFAULT '{"effects":true,"sound":false}'
      );

      CREATE TABLE xp_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        xp INTEGER NOT NULL,
        ref_type TEXT,
        ref_id INTEGER,
        day TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX xp_events_ref ON xp_events(user_id, action, ref_type, ref_id);
      CREATE INDEX xp_events_day ON xp_events(user_id, day, action);

      CREATE TABLE home_state (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        owned_items TEXT NOT NULL DEFAULT '[]',
        placements TEXT NOT NULL DEFAULT '[]',
        last_mow_at TEXT
      );

      CREATE TABLE scratchpad (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL DEFAULT '',
        updated_at TEXT
      );

      CREATE TABLE scratch_snapshots (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, day)
      );

      CREATE TABLE sorted_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        items TEXT NOT NULL DEFAULT '[]',
        sorted_at TEXT NOT NULL
      );

      -- Instance-wide settings (for example the local AI endpoint). Admins change them.
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'crew cheers',
    sql: `
      CREATE TABLE cheers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        created_at TEXT NOT NULL,
        seen INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX cheers_to ON cheers(to_user, seen);
      CREATE UNIQUE INDEX cheers_once_a_day ON cheers(from_user, to_user, day);
    `,
  },
];

// Creates the per-user singleton rows. Safe to call more than once.
function ensureUserRows(db, userId) {
  for (const table of ['gamification', 'home_state', 'scratchpad']) {
    db.prepare(`INSERT OR IGNORE INTO ${table} (user_id) VALUES (?)`).run(userId);
  }
}

function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(db.prepare('SELECT version FROM migrations').all().map((r) => r.version));
  const insert = db.prepare('INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)');
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      insert.run(m.version, m.name, new Date().toISOString());
    })();
  }
  return schemaVersion(db);
}

function schemaVersion(db) {
  return db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM migrations').get().v;
}

// Opens (and creates) the database. Pass ':memory:' for tests.
function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

module.exports = { openDatabase, migrate, schemaVersion, ensureUserRows, MIGRATIONS };
