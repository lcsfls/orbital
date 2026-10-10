'use strict';

const express = require('express');
const items = require('../items');
const { HttpError, validate, parseId } = require('../validate');

module.exports = function projectsRouter(ctx) {
  const { db } = ctx;
  const router = express.Router();

  const getRow = (id) => {
    const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, ctx.uid());
    if (!row) throw new HttpError(404, 'not_found', 'Project not found');
    return row;
  };

  const save = (row) => {
    db.prepare(
      `UPDATE projects SET title=@title, notes=@notes, status=@status, core_context=@core_context,
       mission_critical=@mission_critical, mandatory=@mandatory, mandatory_reason=@mandatory_reason,
       quadrant_set_at=@quadrant_set_at, completed_at=@completed_at, updated_at=@updated_at WHERE id=@id AND user_id=@user_id`,
    ).run(row);
  };

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM projects WHERE user_id = ?').all(ctx.uid());
    let list = rows.map((r) => ctx.loadProject(r.id));
    if (req.query.status) list = list.filter((p) => p.status === req.query.status);
    res.json(items.sortProjects(list));
  });

  router.get('/:id', (req, res) => {
    const id = parseId(req.params.id);
    getRow(id);
    res.json(ctx.loadProject(id));
  });

  router.post('/', (req, res) => {
    const patch = items.toRow(validate(req.body, items.PROJECT_SCHEMA));
    const now = ctx.nowIso();
    const row = {
      notes: '',
      status: 'active',
      core_context: null,
      mission_critical: null,
      mandatory: 0,
      mandatory_reason: '',
      quadrant_set_at: null,
      completed_at: null,
      ...patch,
      user_id: ctx.uid(),
      created_at: now,
      updated_at: now,
    };
    if (row.status !== 'active') throw new HttpError(400, 'validation_error', 'A new project starts as active');
    items.applyCoreContext(null, row, patch, now);
    const info = db
      .prepare(
        `INSERT INTO projects (user_id, title, notes, status, core_context, mission_critical, mandatory, mandatory_reason,
         quadrant_set_at, completed_at, created_at, updated_at)
         VALUES (@user_id, @title, @notes, @status, @core_context, @mission_critical, @mandatory, @mandatory_reason,
         @quadrant_set_at, @completed_at, @created_at, @updated_at)`,
      )
      .run(row);
    ctx.respond(res, 201, ctx.loadProject(Number(info.lastInsertRowid)), []);
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const prev = getRow(id);
    const patch = items.toRow(validate(req.body, items.PROJECT_SCHEMA, { partial: true }));
    const now = ctx.nowIso();
    const row = { ...prev, ...patch, updated_at: now };
    items.applyCoreContext(prev, row, patch, now);
    if (row.status === 'completed' && prev.status !== 'completed') row.completed_at = now;
    if (row.status === 'active') row.completed_at = null;
    save(row);

    const rewards = [];
    if (row.status === 'completed' && prev.status !== 'completed') {
      rewards.push(ctx.game.award('project_completed', 'project', id));
      if (row.mandatory) rewards.push(ctx.game.award('mandatory_done', 'project', id));
    }
    ctx.respond(res, 200, ctx.loadProject(id), rewards);
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    getRow(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    res.status(204).end();
  });

  router.post('/:id/review', (req, res) => {
    const id = parseId(req.params.id);
    const prev = getRow(id);
    const body = validate(req.body, items.REVIEW_SCHEMA);
    const before = ctx.loadProject(id);
    const result = ctx.review('project', prev, before.review_due, body);
    save({ ...prev, ...result.fields });
    ctx.respond(res, 200, ctx.loadProject(id), result.rewards, { drift: result.drift });
  });

  return router;
};
