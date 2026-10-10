'use strict';

const express = require('express');
const rules = require('../rules');
const items = require('../items');
const { HttpError, validate, parseId } = require('../validate');

module.exports = function ideasRouter(ctx) {
  const { db } = ctx;
  const router = express.Router();

  const getRow = (id) => {
    const row = db.prepare('SELECT * FROM ideas WHERE id = ? AND user_id = ?').get(id, ctx.uid());
    if (!row) throw new HttpError(404, 'not_found', 'Idea not found');
    return row;
  };

  const save = (row) => {
    db.prepare(
      `UPDATE ideas SET title=@title, notes=@notes, status=@status, importance=@importance, urgency=@urgency,
       core_context=@core_context, mission_critical=@mission_critical, money=@money, time=@time,
       delegation=@delegation, mandatory=@mandatory, mandatory_reason=@mandatory_reason, due_date=@due_date,
       quadrant_set_at=@quadrant_set_at, done_at=@done_at, updated_at=@updated_at WHERE id=@id AND user_id=@user_id`,
    ).run(row);
  };

  // Economics (stage 2) only applies once the Eisenhower quadrant is set.
  const checkStages = (row, patch) => {
    const hasEconomics = items.ECONOMICS_FIELDS.some((f) => row[f]);
    const relevant = items.touches(patch, items.ECONOMICS_FIELDS) || items.touches(patch, items.EISENHOWER_FIELDS);
    if (relevant && hasEconomics && !rules.eisenhowerQuadrant(row.importance, row.urgency)) {
      throw new HttpError(
        400,
        'eisenhower_required',
        'Set importance and urgency (Eisenhower) before the economics stage',
      );
    }
  };

  router.get('/', (req, res) => {
    let list = db.prepare('SELECT * FROM ideas WHERE user_id = ?').all(ctx.uid()).map((r) => items.serializeIdea(r, ctx));
    if (req.query.status) list = list.filter((i) => i.status === req.query.status);
    if (req.query.quadrant) list = list.filter((i) => i.core_context_quadrant === req.query.quadrant);
    if (req.query.eisenhower) list = list.filter((i) => i.eisenhower_quadrant === req.query.eisenhower);
    res.json(items.sortIdeas(list));
  });

  router.get('/:id', (req, res) => {
    res.json(items.serializeIdea(getRow(parseId(req.params.id)), ctx));
  });

  // Creates an idea from validated input. Used by POST /api/ideas and the inbox.
  ctx.createIdea = (patch, { reward = true } = {}) => {
    const now = ctx.nowIso();
    const row = {
      title: patch.title,
      notes: '',
      importance: null,
      urgency: null,
      core_context: null,
      mission_critical: null,
      money: null,
      time: null,
      delegation: null,
      mandatory: 0,
      mandatory_reason: '',
      due_date: null,
      quadrant_set_at: null,
      done_at: null,
      ...patch,
      user_id: ctx.uid(),
      created_at: now,
      updated_at: now,
    };
    if (row.status && !['parked', 'evaluated'].includes(row.status)) {
      throw new HttpError(400, 'validation_error', 'A new idea starts as parked or evaluated');
    }
    checkStages(row, patch);
    items.applyCoreContext(null, row, patch, now);
    const evaluated = rules.isEvaluated(row);
    if (row.status === 'evaluated' && !evaluated) {
      throw new HttpError(400, 'evaluation_incomplete', 'Evaluation needs Eisenhower and Core/Context answers');
    }
    row.status = row.status || (evaluated ? 'evaluated' : 'parked');

    const info = db
      .prepare(
        `INSERT INTO ideas (user_id, title, notes, status, importance, urgency, core_context, mission_critical, money, time,
         delegation, mandatory, mandatory_reason, due_date, quadrant_set_at, done_at, created_at, updated_at)
         VALUES (@user_id, @title, @notes, @status, @importance, @urgency, @core_context, @mission_critical, @money, @time,
         @delegation, @mandatory, @mandatory_reason, @due_date, @quadrant_set_at, @done_at, @created_at, @updated_at)`,
      )
      .run(row);
    const id = Number(info.lastInsertRowid);
    const rewards = [];
    if (reward) {
      rewards.push(ctx.game.award('idea_create', 'idea', id));
      if (row.status === 'evaluated') rewards.push(ctx.game.award('evaluate', 'idea', id));
    }
    return { id, rewards };
  };

  router.post('/', (req, res) => {
    const patch = items.toRow(validate(req.body, items.IDEA_SCHEMA));
    const { id, rewards } = ctx.createIdea(patch);
    ctx.respond(res, 201, items.serializeIdea(getRow(id), ctx), rewards);
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const prev = getRow(id);
    const patch = items.toRow(validate(req.body, items.IDEA_SCHEMA, { partial: true }));
    const now = ctx.nowIso();
    const row = { ...prev, ...patch, updated_at: now };
    checkStages(row, patch);
    items.applyCoreContext(prev, row, patch, now);

    const evaluated = rules.isEvaluated(row);
    if ('status' in patch) {
      if (patch.status === 'evaluated' && !evaluated) {
        throw new HttpError(400, 'evaluation_incomplete', 'Evaluation needs Eisenhower and Core/Context answers');
      }
    } else if (prev.status === 'parked' && evaluated && !rules.isEvaluated(prev)) {
      row.status = 'evaluated';
    }
    if (row.status === 'dropped' && row.mandatory) {
      throw new HttpError(409, 'mandatory_item', 'Mandatory items cannot be dropped. Clear the mandatory flag first.');
    }
    if (row.status === 'decided' && prev.status !== 'decided') row.done_at = now;
    if (row.status !== 'decided') row.done_at = null;
    save(row);

    const rewards = [];
    if (row.status !== prev.status) {
      if (row.status === 'evaluated') rewards.push(ctx.game.award('evaluate', 'idea', id));
      if (row.status === 'parked' && prev.status === 'evaluated') rewards.push(ctx.game.award('park', 'idea', id));
      if (row.status === 'dropped') rewards.push(ctx.game.award('drop', 'idea', id));
      if (row.status === 'decided' && row.mandatory) rewards.push(ctx.game.award('mandatory_done', 'idea', id));
    }
    ctx.respond(res, 200, items.serializeIdea(getRow(id), ctx), rewards);
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    getRow(id);
    db.prepare('DELETE FROM ideas WHERE id = ?').run(id);
    res.status(204).end();
  });

  // Converts an idea into a project. The idea becomes "decided".
  router.post('/:id/make-project', (req, res) => {
    const id = parseId(req.params.id);
    const idea = getRow(id);
    if (!items.isOpenIdea(idea)) {
      throw new HttpError(409, 'invalid_state', 'Only parked or evaluated ideas can become a project');
    }
    const now = ctx.nowIso();
    const projectId = db.transaction(() => {
      db.prepare("UPDATE ideas SET status = 'decided', updated_at = ? WHERE id = ?").run(now, id);
      const info = db
        .prepare(
          `INSERT INTO projects (user_id, title, notes, status, idea_id, core_context, mission_critical, mandatory,
           mandatory_reason, quadrant_set_at, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ctx.uid(),
          idea.title,
          idea.notes,
          id,
          idea.core_context,
          idea.mission_critical,
          idea.mandatory,
          idea.mandatory_reason,
          idea.quadrant_set_at,
          now,
          now,
        );
      return Number(info.lastInsertRowid);
    })();
    const project = ctx.loadProject(projectId);
    res.status(201).json({ item: project, idea: items.serializeIdea(getRow(id), ctx), reward: null, gamification: ctx.gameState() });
  });

  router.post('/:id/review', (req, res) => {
    const id = parseId(req.params.id);
    const prev = getRow(id);
    const body = validate(req.body, items.REVIEW_SCHEMA);
    const before = items.serializeIdea(prev, ctx);
    const result = ctx.review('idea', prev, before.review_due, body);
    const row = { ...prev, ...result.fields };
    save(row);
    ctx.respond(res, 200, items.serializeIdea(getRow(id), ctx), result.rewards, { drift: result.drift });
  });

  return router;
};
