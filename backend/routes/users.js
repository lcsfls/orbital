'use strict';

// Sign-in, first-run setup and user management (admins).

const express = require('express');
const { publicUser } = require('../auth');
const { HttpError, validate, parseId } = require('../validate');

module.exports = function usersRouter(ctx) {
  const { db, auth } = ctx;
  const router = express.Router();

  const signIn = (req, res, user, status = 200) => {
    const { token, expires } = auth.createSession(user.id);
    auth.setCookie(req, res, token, expires);
    res.status(status).json({ user: publicUser(user) });
  };

  router.get('/auth/status', (req, res) => {
    res.json({ setup_required: auth.userCount() === 0, user: req.user ? publicUser(req.user) : null });
  });

  // First run only: creates the first admin.
  router.post('/auth/setup', (req, res) => {
    const body = validate(req.body, {
      username: { type: 'string', required: true, max: 32 },
      password: { type: 'string', required: true, max: 200, raw: true },
      display_name: { type: 'string', max: 80 },
      setup_token: { type: 'string', max: 200, raw: true },
    });
    // Optional SETUP_TOKEN: protects an exposed instance before the first admin exists.
    if (ctx.setupToken && body.setup_token !== ctx.setupToken) {
      throw new HttpError(403, 'invalid_setup_token', 'Setup token is not correct');
    }
    delete body.setup_token;
    const user = db.transaction(() => {
      if (auth.userCount() > 0) throw new HttpError(409, 'already_set_up', 'Orbital is already set up. Please sign in.');
      return auth.createUser({ ...body, role: 'admin' });
    })();
    signIn(req, res, user, 201);
  });

  router.post('/auth/login', (req, res) => {
    const body = validate(req.body, {
      username: { type: 'string', required: true, max: 64 },
      password: { type: 'string', required: true, max: 200, raw: true },
    });
    signIn(req, res, auth.login(req, body.username, body.password));
  });

  router.post('/auth/logout', (req, res) => {
    auth.logout(req.sessionToken);
    auth.clearCookie(res);
    res.status(204).end();
  });

  router.post('/auth/password', auth.requireUser, (req, res) => {
    const body = validate(req.body, {
      current_password: { type: 'string', required: true, max: 200, raw: true },
      new_password: { type: 'string', required: true, max: 200, raw: true },
    });
    if (!auth.verifyPassword(body.current_password, req.user.password_hash)) {
      throw new HttpError(400, 'invalid_password', 'Current password is not correct');
    }
    auth.setPassword(req.user.id, body.new_password, { keepToken: req.sessionToken });
    res.status(204).end();
  });

  router.patch('/auth/profile', auth.requireUser, (req, res) => {
    const body = validate(req.body, { display_name: { type: 'string', required: true, max: 80 } });
    db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').run(body.display_name, ctx.nowIso(), req.user.id);
    res.json({ user: publicUser(auth.getUser(req.user.id)) });
  });

  // ---- Admin: user management ----
  const admins = () => db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").get().n;

  router.get('/users', auth.requireAdmin, (req, res) => {
    res.json(db.prepare('SELECT * FROM users ORDER BY username').all().map(publicUser));
  });

  router.post('/users', auth.requireAdmin, (req, res) => {
    const body = validate(req.body, {
      username: { type: 'string', required: true, max: 32 },
      password: { type: 'string', required: true, max: 200, raw: true },
      display_name: { type: 'string', max: 80 },
      role: { type: 'enum', values: ['admin', 'user'] },
    });
    res.status(201).json(publicUser(auth.createUser(body)));
  });

  router.patch('/users/:id', auth.requireAdmin, (req, res) => {
    const id = parseId(req.params.id);
    const user = auth.getUser(id);
    if (!user) throw new HttpError(404, 'not_found', 'User not found');
    const body = validate(req.body, {
      display_name: { type: 'string', max: 80 },
      role: { type: 'enum', values: ['admin', 'user'] },
      disabled: { type: 'bool' },
      password: { type: 'string', max: 200, raw: true },
    });
    const losesAdmin = user.role === 'admin' && !user.disabled && ((body.role && body.role !== 'admin') || body.disabled === true);
    if (losesAdmin && admins() <= 1) throw new HttpError(409, 'last_admin', 'There must be at least one active admin');
    db.transaction(() => {
      const now = ctx.nowIso();
      if ('display_name' in body) db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').run(body.display_name, now, id);
      if ('role' in body) db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(body.role, now, id);
      if ('disabled' in body) {
        db.prepare('UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?').run(body.disabled ? 1 : 0, now, id);
        if (body.disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      }
      if (body.password) auth.setPassword(id, body.password);
    })();
    res.json(publicUser(auth.getUser(id)));
  });

  // Deletes the user and all of their data.
  router.delete('/users/:id', auth.requireAdmin, (req, res) => {
    const id = parseId(req.params.id);
    const user = auth.getUser(id);
    if (!user) throw new HttpError(404, 'not_found', 'User not found');
    if (id === req.user.id) throw new HttpError(409, 'self_delete', 'You cannot delete your own account');
    if (user.role === 'admin' && !user.disabled && admins() <= 1) throw new HttpError(409, 'last_admin', 'There must be at least one active admin');
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.status(204).end();
  });

  return router;
};
