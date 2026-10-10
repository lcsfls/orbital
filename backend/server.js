'use strict';

const path = require('node:path');
const { openDatabase } = require('./db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const flag = (v) => /^(1|true|yes|on)$/i.test(v || '');
// Home (with the 3D living room) is on unless HOME_ENABLED=false.
const HOME_ENABLED = process.env.HOME_ENABLED === undefined || process.env.HOME_ENABLED === '' ? true : flag(process.env.HOME_ENABLED);
const AI_ENABLED = flag(process.env.AI_ENABLED);

const dbFile = path.join(DATA_DIR, 'orbital.sqlite');
const db = openDatabase(dbFile);
const app = createApp({
  db,
  homeEnabled: HOME_ENABLED,
  aiEnabled: AI_ENABLED,
  // auto: Secure cookie when the request came in over HTTPS (set TRUST_PROXY behind Traefik).
  cookieSecure: process.env.COOKIE_SECURE || 'auto',
  trustProxy: process.env.TRUST_PROXY ? (Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY) : false,
  setupToken: process.env.SETUP_TOKEN || '',
  dataDir: DATA_DIR,
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Orbital listening on http://${HOST}:${PORT} (data: ${dbFile}, home: ${HOME_ENABLED ? 'on' : 'off'}, ai: ${AI_ENABLED ? 'on' : 'off'})`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
