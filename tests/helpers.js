'use strict';

const { openDatabase } = require('../backend/db');
const { createApp } = require('../backend/app');

const ADMIN = { username: 'admin', password: 'test-password-1' };

// A clock the tests can move forward.
function fakeClock(start = '2026-03-02T10:00:00.000Z') {
  let t = new Date(start).getTime();
  return {
    timeZone: 'UTC',
    now: () => new Date(t),
    set: (iso) => {
      t = new Date(iso).getTime();
    },
    addDays: (n) => {
      t += n * 86400000;
    },
  };
}

// An HTTP client with its own cookie jar (one browser).
function makeClient(base) {
  let cookie = '';
  async function call(method, url, body, { csrf = true } = {}) {
    const init = { method, headers: {} };
    if (csrf) init.headers['X-Orbital'] = '1';
    if (cookie) init.headers.Cookie = cookie;
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(base + url, init);
    const set = res.headers.get('set-cookie');
    if (set) {
      const pair = set.split(';')[0];
      cookie = pair.endsWith('=') ? '' : pair;
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json, headers: res.headers, setCookie: set };
  }
  return {
    call,
    get: (u) => call('GET', u),
    post: (u, b) => call('POST', u, b),
    patch: (u, b) => call('PATCH', u, b),
    put: (u, b) => call('PUT', u, b),
    del: (u) => call('DELETE', u),
    login: (username, password) => call('POST', '/api/auth/login', { username, password }),
  };
}

// Starts an in-process server on a random port with an in-memory database.
// By default the first admin is set up and the returned client is signed in.
async function startServer(opts = {}) {
  const db = openDatabase(':memory:');
  const clock = opts.clock || fakeClock();
  const app = createApp({
    db,
    clock,
    homeEnabled: Boolean(opts.homeEnabled),
    aiEnabled: Boolean(opts.aiEnabled),
    aiFetch: opts.aiFetch,
    env: opts.env || {},
    setupToken: opts.setupToken || '',
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = makeClient(base);
  if (opts.setup !== false) {
    const r = await client.post('/api/auth/setup', ADMIN);
    if (r.status !== 201) throw new Error(`setup failed: ${JSON.stringify(r.body)}`);
  }
  return {
    db,
    clock,
    base,
    ...client,
    client: () => makeClient(base),
    close: () => new Promise((r) => server.close(r)),
  };
}

module.exports = { fakeClock, startServer, makeClient, ADMIN };
