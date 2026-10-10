'use strict';

// Scratchpad and inbox. Capture first, sort later.

const { addDays } = require('./gamification');
const { HttpError } = require('./validate');

const RETENTION_DAYS = 30;
const MAX_SCRATCH = 200000;
const TASK_MARKER = /^(?:-|\*|\[\s?\]|TODO\b:?)\s*/i;

// Rule-based sorting (no AI). Returns proposals, nothing is created here.
//   "- x", "* x", "[ ] x", "TODO x"  -> task in the Inbox project
//   "x?"                             -> idea with the note "open question"
//   anything else                    -> parked idea
function parseLines(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (TASK_MARKER.test(line)) {
      const title = line.replace(TASK_MARKER, '').trim();
      if (title) out.push(proposal('task', title, '', line));
      continue;
    }
    out.push(proposal('idea', line, line.endsWith('?') ? 'open question' : '', line));
  }
  return out;
}

function proposal(kind, text, notes, source) {
  let title = text;
  let extra = notes;
  if (title.length > 200) {
    title = `${title.slice(0, 197)}...`;
    extra = [notes, text].filter(Boolean).join('\n\n');
  }
  return { kind, title, notes: extra, source };
}

function createInbox(ctx) {
  const { db, clock, game, uid } = ctx;

  function prune() {
    const cutoff = addDays(game.today(), -RETENTION_DAYS);
    db.prepare('DELETE FROM scratch_snapshots WHERE user_id = ? AND day < ?').run(uid(), cutoff);
    const cutoffIso = new Date(clock.now().getTime() - RETENTION_DAYS * 86400000).toISOString();
    db.prepare('DELETE FROM sorted_history WHERE user_id = ? AND sorted_at < ?').run(uid(), cutoffIso);
  }

  function getScratch() {
    const r = db.prepare('SELECT content, updated_at FROM scratchpad WHERE user_id = ?').get(uid());
    return { content: r.content, updated_at: r.updated_at, unsorted: r.content.trim().length > 0 };
  }

  // Saves the scratchpad. The first save of a day keeps a snapshot of the
  // previous content, so an accidental "delete everything" can be undone.
  function saveScratch(content) {
    if (content.length > MAX_SCRATCH) throw new HttpError(413, 'too_large', 'Scratchpad is too large');
    const prev = getScratch();
    const day = game.today();
    const now = ctx.nowIso();
    db.transaction(() => {
      if (prev.content.trim() && prev.content !== content) {
        db.prepare('INSERT OR IGNORE INTO scratch_snapshots (user_id, day, content, created_at) VALUES (?, ?, ?, ?)').run(uid(), day, prev.content, now);
      }
      db.prepare('UPDATE scratchpad SET content = ?, updated_at = ? WHERE user_id = ?').run(content, now, uid());
      prune();
    })();
    return getScratch();
  }

  function snapshots() {
    prune();
    return db.prepare('SELECT day, content, created_at FROM scratch_snapshots WHERE user_id = ? ORDER BY day DESC').all(uid());
  }

  function restoreSnapshot(day) {
    const snap = db.prepare('SELECT content FROM scratch_snapshots WHERE user_id = ? AND day = ?').get(uid(), day);
    if (!snap) throw new HttpError(404, 'not_found', 'Snapshot not found');
    return saveScratch(snap.content);
  }

  function history() {
    prune();
    return db
      .prepare('SELECT id, text, items, sorted_at FROM sorted_history WHERE user_id = ? ORDER BY id DESC')
      .all(uid())
      .map((r) => ({ ...r, items: JSON.parse(r.items) }));
  }

  function inboxProject() {
    const found = db.prepare("SELECT id FROM projects WHERE user_id = ? AND kind = 'inbox' AND status = 'active' ORDER BY id LIMIT 1").get(uid());
    if (found) return found.id;
    const now = ctx.nowIso();
    return Number(
      db
        .prepare(
          "INSERT INTO projects (user_id, title, notes, status, kind, created_at, updated_at) VALUES (?, 'To-do', 'Your simple to-do list.', 'active', 'inbox', ?, ?)",
        )
        .run(uid(), now, now).lastInsertRowid,
    );
  }

  // Creates the accepted proposals. Optionally replaces the scratchpad content
  // (the client removes the sorted lines). Sorting to empty: +10 XP once per day.
  function apply({ items, source_text: sourceText, scratch_content: scratchContent }) {
    const created = { ideas: [], tasks: [] };
    const rewards = [];
    db.transaction(() => {
      for (const it of items) {
        if (it.kind === 'task') {
          const pid = inboxProject();
          const now = ctx.nowIso();
          const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM tasks WHERE project_id = ?').get(pid).p;
          const id = db
            .prepare(
              "INSERT INTO tasks (project_id, title, status, position, created_at, updated_at) VALUES (?, ?, 'todo', ?, ?, ?)",
            )
            .run(pid, it.title, pos, now, now).lastInsertRowid;
          created.tasks.push(Number(id));
        } else {
          const { kind, ...fields } = it; // eslint-disable-line no-unused-vars
          const { id } = ctx.createIdea(fields, { reward: false });
          created.ideas.push(id);
        }
      }
      db.prepare('INSERT INTO sorted_history (user_id, text, items, sorted_at) VALUES (?, ?, ?, ?)').run(
        uid(),
        sourceText || items.map((i) => i.title).join('\n'),
        JSON.stringify(items.map((i) => ({ kind: i.kind, title: i.title }))),
        ctx.nowIso(),
      );
      if (typeof scratchContent === 'string') {
        saveScratch(scratchContent);
        if (!scratchContent.trim()) rewards.push(game.award('inbox_zero', 'scratchpad', null));
      }
    })();
    return { created, rewards, scratch: getScratch() };
  }

  return { getScratch, saveScratch, snapshots, restoreSnapshot, history, apply, inboxProject };
}

module.exports = { parseLines, createInbox, RETENTION_DAYS };
