'use strict';

const express = require('express');
const items = require('../items');
const { HttpError, validate, parseId } = require('../validate');

module.exports = function tasksRouter(ctx) {
  const { db } = ctx;
  const router = express.Router();

  const getRow = (id) => {
    const row = db.prepare('SELECT t.* FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ? AND p.user_id = ?').get(id, ctx.uid());
    if (!row) throw new HttpError(404, 'not_found', 'Task not found');
    return row;
  };

  router.get('/', (req, res) => {
    if (req.query.project_id !== undefined) {
      const pid = parseId(req.query.project_id);
      const rows = db
        .prepare('SELECT t.* FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.project_id = ? AND p.user_id = ? ORDER BY t.position, t.id')
        .all(pid, ctx.uid());
      return res.json(rows.map(items.serializeTask));
    }
    res.json(db.prepare('SELECT t.* FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.user_id = ? ORDER BY t.project_id, t.position, t.id').all(ctx.uid()).map(items.serializeTask));
  });

  router.get('/:id', (req, res) => {
    res.json(items.serializeTask(getRow(parseId(req.params.id))));
  });

  router.post('/', (req, res) => {
    const patch = items.toRow(validate(req.body, items.TASK_SCHEMA));
    if (!db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(patch.project_id, ctx.uid())) {
      throw new HttpError(400, 'validation_error', 'project_id does not exist');
    }
    const now = ctx.nowIso();
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM tasks WHERE project_id = ?').get(patch.project_id).p;
    const row = {
      status: 'todo',
      mandatory: 0,
      mandatory_reason: '',
      position: maxPos + 1,
      ...patch,
      done_at: null,
      created_at: now,
      updated_at: now,
    };
    if (row.status === 'done') row.done_at = now;
    const info = db
      .prepare(
        `INSERT INTO tasks (project_id, title, status, mandatory, mandatory_reason, position, done_at, created_at, updated_at)
         VALUES (@project_id, @title, @status, @mandatory, @mandatory_reason, @position, @done_at, @created_at, @updated_at)`,
      )
      .run(row);
    const id = Number(info.lastInsertRowid);
    const rewards = row.status === 'done' ? [doneReward(row, id)] : [];
    ctx.respond(res, 201, items.serializeTask(getRow(id)), rewards);
  });

  // A task is rewarded once: +30 if mandatory, +20 otherwise.
  const doneReward = (row, id) => {
    const already = db
      .prepare("SELECT 1 FROM xp_events WHERE user_id = ? AND ref_type = 'task' AND ref_id = ? AND action IN ('task_done','mandatory_done')")
      .get(ctx.uid(), id);
    if (already) return null;
    return ctx.game.award(row.mandatory ? 'mandatory_done' : 'task_done', 'task', id);
  };

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const prev = getRow(id);
    const patch = items.toRow(validate(req.body, items.TASK_SCHEMA, { partial: true }));
    // Moving a task to another of your own projects (or the to-do list) puts it at the end there.
    let moved = false;
    if ('project_id' in patch && patch.project_id !== prev.project_id) {
      if (!db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(patch.project_id, ctx.uid())) {
        throw new HttpError(400, 'validation_error', 'project_id does not exist');
      }
      moved = true;
    }
    const now = ctx.nowIso();
    const row = { ...prev, ...patch, updated_at: now };
    if (moved && !('position' in patch)) {
      row.position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM tasks WHERE project_id = ?').get(row.project_id).p;
    }
    if (row.status === 'done' && prev.status !== 'done') row.done_at = now;
    if (row.status !== 'done') row.done_at = null;
    db.prepare(
      `UPDATE tasks SET project_id=@project_id, title=@title, status=@status, mandatory=@mandatory, mandatory_reason=@mandatory_reason,
       position=@position, done_at=@done_at, updated_at=@updated_at WHERE id=@id`,
    ).run(row);
    const rewards = row.status === 'done' && prev.status !== 'done' ? [doneReward(row, id)] : [];
    ctx.respond(res, 200, items.serializeTask(getRow(id)), rewards);
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    getRow(id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    res.status(204).end();
  });

  return router;
};
