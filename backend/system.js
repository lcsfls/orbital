'use strict';

// Update check and update requests (admins only).
// The app never changes its own code. In the Proxmox LXC it only drops a request file
// into its data folder; a separate root systemd unit (orbital-update.path) runs the update.

const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');
const { HttpError } = require('./validate');

const REQUEST_FILE = '.update-requested';
const STATUS_FILE = '.update-status';

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function createSystem({ appRoot = path.join(__dirname, '..'), dataDir, env = process.env, fetchImpl = globalThis.fetch, paths = {} }) {
  const p = {
    lxcEnv: paths.lxcEnv || '/etc/orbital/orbital.env',
    lxcPathUnit: paths.lxcPathUnit || '/etc/systemd/system/orbital-update.path',
    dockerEnv: paths.dockerEnv || '/.dockerenv',
  };
  const repo = env.UPDATE_REPO || 'lcsfls/orbital';
  const branch = env.UPDATE_BRANCH || 'main';
  const checkEnabled = !/^(0|false|no|off)$/i.test(env.UPDATE_CHECK || '');

  function install() {
    if (fs.existsSync(p.lxcEnv)) return 'lxc';
    if (fs.existsSync(p.dockerEnv)) return 'docker';
    return 'manual';
  }

  // Written by the installer and by orbital-update: { commit, date }.
  function current() {
    const v = readJson(path.join(appRoot, '.orbital-version')) || {};
    return { version: pkg.version, commit: v.commit || null, date: v.date || null };
  }

  function status() {
    return dataDir ? readJson(path.join(dataDir, STATUS_FILE)) : null;
  }

  function command(kind) {
    if (kind === 'lxc') return 'pct exec <id> -- /usr/local/bin/orbital-update';
    if (kind === 'docker') return 'git pull && docker compose up -d --build';
    return 'git pull && npm ci --omit=dev, then restart Orbital';
  }

  async function latest() {
    if (!checkEnabled) throw new HttpError(404, 'not_found', 'Update checks are switched off (UPDATE_CHECK=false)');
    const url = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`;
    let res;
    try {
      res = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'orbital-update-check' }, signal: AbortSignal.timeout(10000) });
    } catch (err) {
      throw new HttpError(502, 'update_check_failed', `Could not reach GitHub: ${err.message}`);
    }
    if (!res.ok) throw new HttpError(502, 'update_check_failed', `GitHub answered ${res.status}`);
    const data = await res.json();
    return {
      commit: data.sha,
      date: data.commit?.committer?.date || null,
      message: String(data.commit?.message || '').split('\n')[0].slice(0, 200),
      url: data.html_url || `https://github.com/${repo}/commits/${branch}`,
    };
  }

  async function check() {
    const kind = install();
    const cur = current();
    const late = await latest();
    const available = Boolean(late.commit && cur.commit && !late.commit.startsWith(cur.commit) && !cur.commit.startsWith(late.commit));
    return {
      install: kind,
      current: cur,
      latest: late,
      // Without a recorded commit we cannot tell, so we say so instead of guessing.
      update_available: cur.commit ? available : null,
      can_self_update: kind === 'lxc' && fs.existsSync(p.lxcPathUnit),
      command: command(kind),
      status: status(),
    };
  }

  function request() {
    const kind = install();
    if (kind !== 'lxc' || !fs.existsSync(p.lxcPathUnit)) {
      throw new HttpError(409, 'not_supported', `This installation cannot update itself. Run: ${command(kind)}`);
    }
    fs.writeFileSync(path.join(dataDir, REQUEST_FILE), new Date().toISOString());
    return { status: 'requested' };
  }

  return { install, current, status, check, request, command };
}

module.exports = { createSystem, REQUEST_FILE, STATUS_FILE };
