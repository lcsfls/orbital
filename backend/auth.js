'use strict';

// Local accounts: scrypt password hashes, random session tokens (only their
// SHA-256 is stored), HttpOnly cookies and a simple login rate limit.

const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { ensureUserRows } = require('./db');
const { HttpError } = require('./validate');

const COOKIE = 'orbital_session';
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/i;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

// Holds the signed-in user for the current request, so data modules can scope
// their queries without passing the user through every call.
const requestUser = new AsyncLocalStorage();

function currentUserId() {
  const store = requestUser.getStore();
  if (!store?.user) throw new Error('No user in request context');
  return store.user.id;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(expected, actual);
}

// Used to keep login timing similar for unknown users.
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function checkUsername(username) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new HttpError(400, 'validation_error', 'Username: 3 to 32 characters, letters, digits, dot, dash or underscore');
  }
  return username.toLowerCase();
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    throw new HttpError(400, 'validation_error', 'Password must be 8 to 200 characters');
  }
  return password;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function publicUser(u) {
  return { id: u.id, username: u.username, display_name: u.display_name, role: u.role, disabled: Boolean(u.disabled), created_at: u.created_at };
}

function createAuth(db, clock, { cookieSecure = 'auto' } = {}) {
  const failures = new Map();
  const nowIso = () => clock.now().toISOString();

  function userCount() {
    return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  }

  function createUser({ username, password, display_name: displayName = '', role = 'user' }) {
    const name = checkUsername(username);
    checkPassword(password);
    if (!['admin', 'user'].includes(role)) throw new HttpError(400, 'validation_error', 'role must be admin or user');
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(name)) {
      throw new HttpError(409, 'username_taken', 'That username is already taken');
    }
    const now = nowIso();
    const id = db.transaction(() => {
      const info = db
        .prepare('INSERT INTO users (username, display_name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(name, String(displayName).trim().slice(0, 80), hashPassword(password), role, now, now);
      const uid = Number(info.lastInsertRowid);
      ensureUserRows(db, uid);
      return uid;
    })();
    return getUser(id);
  }

  function getUser(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  function createSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = clock.now();
    const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now.toISOString());
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(sha256(token), userId, now.toISOString(), expires.toISOString());
    return { token, expires };
  }

  function sessionUser(token) {
    if (!token) return null;
    const row = db
      .prepare('SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
      .get(sha256(token));
    if (!row || row.disabled || row.expires_at < nowIso()) return null;
    return row;
  }

  function setCookie(req, res, token, expires) {
    const secure = cookieSecure === 'true' || (cookieSecure === 'auto' && req.secure);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', expires });
  }

  function clearCookie(res) {
    res.clearCookie(COOKIE, { path: '/' });
  }

  function login(req, username, password) {
    const key = `${req.ip}|${String(username).toLowerCase()}`;
    const now = Date.now();
    const recent = (failures.get(key) || []).filter((t) => now - t < FAILURE_WINDOW_MS);
    if (recent.length >= MAX_FAILURES) {
      throw new HttpError(429, 'too_many_attempts', 'Too many failed logins. Try again in 15 minutes.');
    }
    const user = typeof username === 'string' ? db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase()) : null;
    const ok = verifyPassword(String(password ?? ''), user ? user.password_hash : DUMMY_HASH) && user && !user.disabled;
    if (!ok) {
      recent.push(now);
      failures.set(key, recent);
      throw new HttpError(401, 'invalid_login', 'Username or password is not correct');
    }
    failures.delete(key);
    return user;
  }

  function setPassword(userId, password, { keepToken = null } = {}) {
    checkPassword(password);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(password), nowIso(), userId);
    // Sign out other sessions after a password change.
    if (keepToken) db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, sha256(keepToken));
    else db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  function logout(token) {
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }

  // Middleware: reads the session cookie and runs the rest of the request with that user.
  function middleware(req, res, next) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const user = sessionUser(token);
    // Sliding expiry: refresh at most once a day while the session is in use.
    if (user) {
      const now = clock.now().getTime();
      if (Date.parse(user.expires_at) - now < (SESSION_DAYS - 1) * 86400000) {
        const expires = new Date(now + SESSION_DAYS * 86400000);
        db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(expires.toISOString(), sha256(token));
        setCookie(req, res, token, expires);
      }
    }
    req.sessionToken = token;
    req.user = user;
    requestUser.run({ user }, next);
  }

  function requireUser(req, res, next) {
    if (!req.user) return next(new HttpError(401, 'unauthenticated', 'Please sign in'));
    next();
  }

  function requireAdmin(req, res, next) {
    if (!req.user) return next(new HttpError(401, 'unauthenticated', 'Please sign in'));
    if (req.user.role !== 'admin') return next(new HttpError(403, 'forbidden', 'Only admins can do this'));
    next();
  }

  return {
    userCount,
    createUser,
    getUser,
    createSession,
    setCookie,
    clearCookie,
    login,
    logout,
    setPassword,
    middleware,
    requireUser,
    requireAdmin,
    verifyPassword,
  };
}

module.exports = { createAuth, currentUserId, publicUser, hashPassword, verifyPassword, checkUsername, checkPassword, COOKIE };
