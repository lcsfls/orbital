'use strict';

// Builds the image, starts a container, calls /healthz and checks that data
// survives a container restart. Skipped when Docker is not available, unless
// SMOKE_REQUIRED=1 is set (use that in CI).

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const image = 'orbital:smoke-test';
const name = `orbital-smoke-${process.pid}`;
const port = 18000 + (process.pid % 1000);

const docker = (...args) => execFileSync('docker', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function dockerAvailable() {
  try {
    docker('info', '--format', '{{.ServerVersion}}');
    return true;
  } catch {
    return false;
  }
}

async function waitHealthy(timeoutMs = 60000) {
  const until = Date.now() + timeoutMs;
  let last;
  while (Date.now() < until) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (r.ok) return r.json();
      last = new Error(`status ${r.status}`);
    } catch (err) {
      last = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw last;
}

const available = dockerAvailable();
const skip = !available && process.env.SMOKE_REQUIRED !== '1' ? 'Docker is not available' : false;

test('container starts, /healthz answers, data survives a restart', { skip, timeout: 600000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-smoke-'));
  fs.chmodSync(dataDir, 0o777);
  t.after(() => {
    try {
      docker('rm', '-f', name);
    } catch {
      /* already gone */
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  docker('build', '-t', image, '.');
  docker('run', '-d', '--name', name, '-p', `127.0.0.1:${port}:8080`, '-v', `${dataDir}:/data`, image);

  const health = await waitHealthy();
  assert.equal(health.status, 'ok');

  const headers = { 'Content-Type': 'application/json', 'X-Orbital': '1' };
  const setup = await fetch(`http://127.0.0.1:${port}/api/auth/setup`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: 'smoke', password: 'smoke-test-password' }),
  });
  assert.equal(setup.status, 201);
  headers.Cookie = setup.headers.get('set-cookie').split(';')[0];

  const created = await fetch(`http://127.0.0.1:${port}/api/ideas`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'survives restart' }),
  });
  assert.equal(created.status, 201);

  docker('restart', name);
  await waitHealthy();
  // The session lives in the database too, so it survives the restart.
  const ideas = await (await fetch(`http://127.0.0.1:${port}/api/ideas`, { headers })).json();
  assert.ok(ideas.some((i) => i.title === 'survives restart'));
  assert.equal(docker('inspect', '--format', '{{.Config.User}}', name), 'node');
});
