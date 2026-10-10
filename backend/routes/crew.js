'use strict';

// The crew: opt-in, alphabetical, cheering instead of ranking.

const express = require('express');
const { HttpError, validate } = require('../validate');

const DEFAULT_GOAL = 30;

module.exports = function crewRouter(ctx) {
  const { db, game, auth, week } = ctx;
  const router = express.Router();

  const optedIn = () => Boolean(game.settings().crew);
  const goal = () => {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'crew_goal'").get();
    const n = row ? Number(JSON.parse(row.value)) : DEFAULT_GOAL;
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_GOAL;
  };

  router.get('/week', (req, res) => res.json(week.summary(ctx.uid())));

  router.get('/crew', (req, res) => {
    const c = week.crew();
    if (!optedIn()) return res.json({ opted_in: false, member_count: c.members.length, goal: goal() });
    const unseen = db
      .prepare(
        `SELECT c.id, c.created_at, COALESCE(NULLIF(u.display_name, ''), u.username) AS from_name
         FROM cheers c JOIN users u ON u.id = c.from_user WHERE c.to_user = ? AND c.seen = 0 ORDER BY c.id`,
      )
      .all(ctx.uid());
    const cheeredToday = new Set(
      db.prepare('SELECT to_user FROM cheers WHERE from_user = ? AND day = ?').all(ctx.uid(), game.today()).map((r) => r.to_user),
    );
    res.json({
      opted_in: true,
      start: c.start,
      end: c.end,
      goal: goal(),
      total: c.total,
      members: c.members.map((m) => ({ ...m, me: m.id === ctx.uid(), cheered_today: cheeredToday.has(m.id) })),
      cheers_unseen: unseen,
    });
  });

  router.post('/crew/cheer', (req, res) => {
    const body = validate(req.body, { user_id: { type: 'int', required: true, min: 1 } });
    if (!optedIn()) throw new HttpError(403, 'not_in_crew', 'Join the crew in Settings first.');
    if (body.user_id === ctx.uid()) throw new HttpError(400, 'validation_error', 'You cannot cheer for yourself. But well done anyway.');
    const target = week.crew().members.find((m) => m.id === body.user_id);
    if (!target) throw new HttpError(404, 'not_found', 'That person is not in the crew.');
    const day = game.today();
    if (db.prepare('SELECT 1 FROM cheers WHERE from_user = ? AND to_user = ? AND day = ?').get(ctx.uid(), body.user_id, day)) {
      throw new HttpError(409, 'already_cheered', `You already cheered for ${target.name} today.`);
    }
    db.prepare('INSERT INTO cheers (from_user, to_user, day, created_at) VALUES (?, ?, ?, ?)').run(ctx.uid(), body.user_id, day, ctx.nowIso());
    res.status(201).json({ ok: true, message: `Sent. ${target.companion_name} will tell ${target.name}.` });
  });

  router.post('/crew/cheers/seen', (req, res) => {
    db.prepare('UPDATE cheers SET seen = 1 WHERE to_user = ? AND seen = 0').run(ctx.uid());
    res.status(204).end();
  });

  router.patch('/crew/goal', auth.requireAdmin, (req, res) => {
    const body = validate(req.body, { goal: { type: 'int', required: true, min: 1 } });
    if (body.goal > 1000) throw new HttpError(400, 'validation_error', 'goal must be at most 1000');
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('crew_goal', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(body.goal));
    res.json({ goal: goal() });
  });

  return router;
};
