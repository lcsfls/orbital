'use strict';

// Local AI (behind AI_ENABLED). Talks to one configured OpenAI-compatible endpoint
// (Ollama, LM Studio, llama.cpp server, vLLM). No hard-coded cloud URL, no background calls.
// Everything returned here is a suggestion. Nothing is created automatically.

const fs = require('node:fs');
const path = require('node:path');
const rules = require('./rules');
const { HttpError } = require('./validate');

const PROMPT_DIR = path.join(__dirname, 'prompts');

function envDefaults(env = process.env) {
  return {
    base_url: env.AI_BASE_URL || 'http://host.docker.internal:11434/v1',
    model: env.AI_MODEL || 'llama3.1:8b',
    api_key: env.AI_API_KEY || '',
    timeout_ms: Number(env.AI_TIMEOUT_MS) || 60000,
    max_tokens: Number(env.AI_MAX_TOKENS) || 800,
  };
}

// Prompt files: front matter (name, version) + body with {{placeholders}}.
function loadPrompt(name) {
  const text = fs.readFileSync(path.join(PROMPT_DIR, `${name}.md`), 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta = {};
  if (m) for (const line of m[1].split('\n')) {
    const [k, ...v] = line.split(':');
    if (k && v.length) meta[k.trim()] = v.join(':').trim();
  }
  return { name, version: Number(meta.version) || 1, body: (m ? m[2] : text).trim() };
}

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? ''));
}

// Accepts "http://host:11434" or ".../v1" and returns the chat completions URL.
function completionsUrl(baseUrl) {
  const u = new URL(baseUrl);
  let p = u.pathname.replace(/\/+$/, '');
  if (!p) p = '/v1';
  if (!p.endsWith('/chat/completions')) p = `${p}/chat/completions`;
  u.pathname = p;
  return u.toString();
}

// The model list lives next to chat/completions on every supported server.
function modelsUrl(baseUrl) {
  return completionsUrl(baseUrl).replace(/\/chat\/completions$/, '/models');
}

// Pulls the first JSON object out of a model reply (models like to add prose or code fences).
function extractJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const oneOf = (v, values) => (values.includes(v) ? v : null);
// Tone rule: no exclamation marks.
const calm = (s) => s.replace(/!+/g, '.');

function cleanSuggestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).map((t) => calm(clip(typeof t === 'string' ? t : t?.title, 120))).filter(Boolean).slice(0, 6);
  return {
    title: calm(clip(raw.title, 200)),
    tasks,
    importance: oneOf(raw.importance, rules.IMPORTANCE),
    urgency: oneOf(raw.urgency, rules.URGENCY),
    core_context: oneOf(raw.core_context, rules.CORE_CONTEXT),
    mission_critical: oneOf(raw.mission_critical, rules.YES_NO),
    reason: calm(clip(raw.reason, 300)),
  };
}

function cleanInboxItems(raw) {
  const list = Array.isArray(raw?.items) ? raw.items : [];
  return list
    .slice(0, 200)
    .map((i) => {
      const kind = i?.kind === 'task' ? 'task' : 'idea';
      const out = { kind, title: calm(clip(i?.title, 200)), notes: calm(clip(i?.notes, 2000)), reason: calm(clip(i?.reason, 300)) };
      if (kind === 'idea') {
        const cc = oneOf(i.core_context, rules.CORE_CONTEXT);
        const mc = oneOf(i.mission_critical, rules.YES_NO);
        if (cc && mc) Object.assign(out, { core_context: cc, mission_critical: mc });
      }
      return out;
    })
    .filter((i) => i.title);
}

function createAi(ctx, { enabled, env = process.env, fetchImpl = globalThis.fetch }) {
  const { db } = ctx;

  function settings() {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'ai'").get();
    let stored = {};
    try {
      stored = row ? JSON.parse(row.value) : {};
    } catch {
      stored = {};
    }
    return { ...envDefaults(env), ...stored };
  }

  // Never send the API key back to the browser.
  function publicSettings() {
    const s = settings();
    let endpoint = null;
    try {
      endpoint = completionsUrl(s.base_url);
    } catch {
      endpoint = null;
    }
    return { enabled, base_url: s.base_url, model: s.model, timeout_ms: s.timeout_ms, max_tokens: s.max_tokens, api_key_set: Boolean(s.api_key), endpoint };
  }

  function updateSettings(patch) {
    if ('base_url' in patch) {
      let u;
      try {
        u = new URL(patch.base_url);
      } catch {
        throw new HttpError(400, 'validation_error', 'base_url must be a valid URL');
      }
      if (!['http:', 'https:'].includes(u.protocol)) throw new HttpError(400, 'validation_error', 'base_url must use http or https');
    }
    const next = { ...settings(), ...patch };
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('ai', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next));
    return publicSettings();
  }

  // JSON output is requested in the prompt only; response_format is not supported everywhere.
  async function chat(prompt) {
    if (!enabled) throw new HttpError(404, 'not_found', 'Local AI is not enabled');
    const s = settings();
    const url = completionsUrl(s.base_url);
    const headers = { 'Content-Type': 'application/json' };
    if (s.api_key) headers.Authorization = `Bearer ${s.api_key}`;
    const body = {
      model: s.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: s.max_tokens,
      temperature: 0.2,
      stream: false,
    };
    const started = Date.now();
    let res;
    try {
      res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(s.timeout_ms) });
    } catch (err) {
      const reason = err.name === 'TimeoutError' ? `timed out after ${s.timeout_ms} ms` : err.message;
      throw new HttpError(502, 'ai_unreachable', `Could not reach the AI endpoint ${url}: ${reason}`);
    }
    const latency = Date.now() - started;
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      throw new HttpError(502, 'ai_error', `AI endpoint answered ${res.status}: ${data?.error?.message || data?.error || 'no details'}`);
    }
    const text = data?.choices?.[0]?.message?.content ?? '';
    return { text, model: data?.model || s.model, latency_ms: latency, endpoint: url };
  }

  // Lists the models the configured server offers (OpenAI-compatible /v1/models).
  async function models() {
    if (!enabled) throw new HttpError(404, 'not_found', 'Local AI is not enabled');
    const s = settings();
    const url = modelsUrl(s.base_url);
    const headers = s.api_key ? { Authorization: `Bearer ${s.api_key}` } : {};
    let res;
    try {
      res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(Math.min(s.timeout_ms, 15000)) });
    } catch (err) {
      throw new HttpError(502, 'ai_unreachable', `Could not reach the AI endpoint ${url}: ${err.message}`);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new HttpError(502, 'ai_error', `AI endpoint answered ${res.status}`);
    const ids = (Array.isArray(data?.data) ? data.data : []).map((m) => m?.id).filter((id) => typeof id === 'string');
    return { models: [...new Set(ids)].sort(), current: s.model, endpoint: url };
  }

  async function projectSteps(project, tasks) {
    const p = loadPrompt('project-steps');
    const list = (arr) => (arr.length ? arr.map((t) => t.title).join('; ') : 'none');
    const r = await chat(
      fill(p.body, {
        title: project.title,
        notes: project.notes || '(none)',
        done: list(tasks.filter((t) => t.status === 'done')),
        open: list(tasks.filter((t) => t.status !== 'done')),
      }),
    );
    const raw = extractJson(r.text);
    const existing = new Set(tasks.map((t) => t.title.trim().toLowerCase()));
    const steps = (Array.isArray(raw?.steps) ? raw.steps : [])
      .map((x) => calm(clip(typeof x === 'string' ? x : x?.title, 200)))
      .filter((x) => {
        const key = x.toLowerCase();
        if (!x || existing.has(key)) return false;
        existing.add(key);
        return true;
      })
      .slice(0, 5);
    if (!steps.length) throw new HttpError(502, 'ai_bad_output', 'The model did not return usable steps. Try again or pick another model.');
    return { steps, reason: calm(clip(raw?.reason, 300)), prompt: { name: p.name, version: p.version }, model: r.model, latency_ms: r.latency_ms };
  }

  async function orbitChat(message, facts) {
    const p = loadPrompt('orbit-chat');
    const r = await chat(fill(p.body, { facts, message }));
    const text = calm(clip(r.text, 700));
    if (!text) throw new HttpError(502, 'ai_bad_output', 'The model returned an empty answer.');
    return { text, prompt: { name: p.name, version: p.version }, model: r.model, latency_ms: r.latency_ms };
  }

  async function test() {
    const r = await chat('Reply with the single word: ready');
    return { ok: true, latency_ms: r.latency_ms, model: r.model, endpoint: r.endpoint, reply: clip(r.text, 200) };
  }

  async function suggest(idea) {
    const p = loadPrompt('suggest');
    const r = await chat(fill(p.body, { title: idea.title, notes: idea.notes || '(none)' }));
    const suggestion = cleanSuggestion(extractJson(r.text));
    if (!suggestion) throw new HttpError(502, 'ai_bad_output', 'The model did not return a usable suggestion. Try again or pick another model.');
    return { suggestion, prompt: { name: p.name, version: p.version }, model: r.model, latency_ms: r.latency_ms };
  }

  async function sortInbox(text) {
    const p = loadPrompt('inbox');
    const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const r = await chat(fill(p.body, { lines: lines.map((l) => `- ${l}`).join('\n') }));
    const items = cleanInboxItems(extractJson(r.text));
    if (!items.length) throw new HttpError(502, 'ai_bad_output', 'The model did not return usable items. The rule-based sort still works.');
    return { items, prompt: { name: p.name, version: p.version }, model: r.model, latency_ms: r.latency_ms };
  }

  function weekFacts() {
    const to = ctx.clock.now();
    const from = new Date(to.getTime() - 7 * 86400000);
    const f = from.toISOString();
    const q = (sql) => db.prepare(sql).all(ctx.uid(), f);
    const facts = {
      tasks_done: q("SELECT t.title FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.user_id = ? AND t.status = 'done' AND t.done_at >= ?").map((r) => r.title),
      projects_completed: q("SELECT title FROM projects WHERE user_id = ? AND status = 'completed' AND completed_at >= ?").map((r) => r.title),
      ideas_parked: q("SELECT title FROM ideas WHERE user_id = ? AND status = 'parked' AND updated_at >= ?").map((r) => r.title),
      ideas_dropped: q("SELECT title FROM ideas WHERE user_id = ? AND status = 'dropped' AND updated_at >= ?").map((r) => r.title),
    };
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), facts };
  }

  async function digest() {
    const p = loadPrompt('digest');
    const w = weekFacts();
    const list = (label, arr) => `${label} (${arr.length}): ${arr.length ? arr.slice(0, 40).join('; ') : 'none'}`;
    const factText = [
      list('Tasks completed', w.facts.tasks_done),
      list('Projects completed', w.facts.projects_completed),
      list('Ideas parked', w.facts.ideas_parked),
      list('Ideas dropped', w.facts.ideas_dropped),
    ].join('\n');
    const r = await chat(fill(p.body, { from: w.from, to: w.to, facts: factText }));
    return { text: calm(r.text.trim()), ...w, prompt: { name: p.name, version: p.version }, model: r.model, latency_ms: r.latency_ms };
  }

  return { enabled, settings: publicSettings, updateSettings, test, models, suggest, sortInbox, digest, weekFacts, projectSteps, orbitChat };
}

module.exports = { createAi, completionsUrl, modelsUrl, extractJson, cleanSuggestion, cleanInboxItems, loadPrompt, fill };
