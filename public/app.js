'use strict';

// Orbital frontend. Plain JS, no framework, talks to the local API only.
// Principles: one primary action per view, one question per step,
// secondary actions live in the side sheet, nothing happens without the user.

(() => {
  // ---------- Helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  const QUAD = {
    invent: { label: 'Invent', line: 'Core, not critical. Experiment. Small bets, fast learning.' },
    deploy: { label: 'Deploy', line: 'Core, critical. This is what pays. Scale it, protect it.' },
    manage: { label: 'Manage', line: 'Context, critical. Must run. Minimise effort, never drop.' },
    offload: { label: 'Offload', line: 'Context, not critical. Standardise, hand off or stop.' },
  };
  const EIS = { do_now: 'Do now', schedule: 'Schedule', delegate: 'Delegate', drop: 'Drop or defer' };
  const MANAGE_TIP = 'Keep it running, keep it cheap. This is not a failure of the matrix, it is the matrix working.';
  const MANAGE_REASON = 'Context, mission-critical';
  const REASONS = ['Contract obligation', 'Security vulnerability', 'Blocks another project', 'Legal requirement'];
  // The companion robot: users give it a name and a colour during setup.
  const COMPANION_COLORS = {
    moon: { label: 'Moon', hex: '#f3effa' },
    sky: { label: 'Sky', hex: '#b9d4f2' },
    mint: { label: 'Mint', hex: '#bfe6cf' },
    peach: { label: 'Peach', hex: '#f6caa0' },
    rose: { label: 'Rose', hex: '#f2bfcf' },
    lilac: { label: 'Lilac', hex: '#d4c6f2' },
    sand: { label: 'Sand', hex: '#e8dcc0' },
  };
  const NAME_IDEAS = ['Orbit', 'Mila', 'Pixel', 'Nova', 'Bo', 'Juno'];
  const cname = () => S.game?.settings?.companion_name || 'Orbit';
  const ccolor = () => (COMPANION_COLORS[S.game?.settings?.companion_color] || COMPANION_COLORS.moon).hex;
  function applyCompanion(hex = ccolor()) {
    document.documentElement.style.setProperty('--orbit-body', hex);
  }
  const MSG = {
    idle: 'Orbiting the core. Nothing urgent.',
    get alert() {
      return `Mandatory item open. ${cname()} is waiting.`;
    },
    emptyIdeas: 'Nothing in orbit yet.',
    emptyProjects: 'No projects in orbit.',
  };
  const TERN = { yes: 'Yes', neutral: 'Neutral', no: 'No' };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  class ApiError extends Error {}

  async function api(method, url, body) {
    const opts = { method, headers: {} };
    if (method !== 'GET') opts.headers['X-Orbital'] = '1';
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch {
      throw new ApiError('Orbital cannot reach its server right now. Check that the container is running.');
    }
    if (res.status === 204) return null;
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = new ApiError(data?.message || `Request failed (${res.status})`);
      err.status = res.status;
      err.code = data?.error;
      if (res.status === 401 && !url.startsWith('/api/auth/')) showAuth();
      throw err;
    }
    return data;
  }

  // ---------- State ----------
  const S = {
    config: {},
    user: null,
    ideas: [],
    projects: [],
    stats: null,
    game: null,
    rules: null,
    home: null,
    ideaFilter: 'open',
    quadFilter: '',
    openProject: null,
    skipped: new Set(),
    orbitOverride: null,
  };
  const effectsOn = () => S.game?.settings?.effects !== false && !reducedMotion.matches;

  // ---------- Orbit ----------
  function orbitSvg(size) {
    return `<svg class="orbit idle" viewBox="66 50 168 168" width="${size}" height="${size}" aria-hidden="true" focusable="false">
      <circle class="o-pulse" cx="150" cy="140" r="26"/>
      <circle class="o-core" cx="150" cy="140" r="26"/>
      <circle class="o-core-dot" cx="150" cy="140" r="8"/>
      <circle class="o-ring" cx="150" cy="140" r="64"/>
      <g class="o-sparks"><circle cx="92" cy="96" r="3"/><circle cx="212" cy="88" r="2.5"/><circle cx="220" cy="180" r="3"/><circle cx="84" cy="186" r="2"/><circle cx="150" cy="58" r="2.5"/></g>
      <g class="o-spin"><g transform="translate(150 76)"><g class="o-unspin">
        <line class="o-antenna" x1="0" y1="-14" x2="0" y2="-22"/><circle class="o-antenna-dot" cx="0" cy="-24" r="2.5"/>
        <rect class="o-body" x="-14" y="-14" width="28" height="28" rx="9"/>
        <g class="f-idle"><g class="o-blink"><circle class="o-ink" cx="-5" cy="-1" r="2.6"/><circle class="o-ink" cx="5" cy="-1" r="2.6"/></g><path class="o-line" d="M-5 6 Q0 9 5 6"/></g>
        <g class="f-happy"><path class="o-line" d="M-8 -1 Q-5 -5 -2 -1"/><path class="o-line" d="M2 -1 Q5 -5 8 -1"/><path class="o-line" d="M-6 5 Q0 11 6 5"/></g>
        <g class="f-alert"><circle class="o-ink" cx="-5" cy="-1" r="3.4"/><circle class="o-ink" cx="5" cy="-1" r="3.4"/><circle class="o-shine" cx="-4" cy="-2" r="1"/><circle class="o-shine" cx="6" cy="-2" r="1"/><circle class="o-mouth" cx="0" cy="7" r="2.2"/></g>
      </g></g></g>
      <g class="o-badge" transform="translate(192 98)"><circle class="b-bg" r="9"/><rect class="b-ink" x="-1.2" y="-5" width="2.4" height="6" rx="1"/><circle class="b-ink" cy="4" r="1.3"/></g>
    </svg>`;
  }

  function setOrbitState(state) {
    for (const svg of $$('.orbit')) {
      svg.classList.remove('idle', 'celebrate', 'alert');
      svg.classList.add(state);
    }
  }

  let orbitTimer = 0;
  function renderStatus() {
    const g = S.game;
    if (!g) return;
    const state = S.orbitOverride ? 'celebrate' : g.orbit_state || 'idle';
    setOrbitState(state);
    const message = S.orbitOverride || (state === 'alert' ? MSG.alert : MSG.idle);
    $('#orbitTip').textContent = message;
    $('#orbitBtn').setAttribute('aria-label', `${cname()} says: ${message}`);
    applyCompanion();
    $('#levelLabel').textContent = `Level ${g.level}`;
    const pct = Math.round(g.progress * 100);
    $('#xpBar > span').style.width = `${pct}%`;
    $('#xpBar').setAttribute('aria-valuenow', String(pct));
    $('#xpBar').title = `${g.xp_total} XP. Next level at ${g.next_level_at} XP.`;
    $('#streakLabel').textContent = g.streak > 0 ? `${plural(g.streak, 'day')} in a row` : g.streak_message || 'Today is a good day to start';
    document.body.classList.toggle('no-fx', g.settings?.effects === false);
  }

  function celebrate(message) {
    S.orbitOverride = message;
    renderStatus();
    clearTimeout(orbitTimer);
    orbitTimer = setTimeout(() => {
      S.orbitOverride = null;
      renderStatus();
    }, 3600);
  }

  // ---------- Toasts, confetti, sound ----------
  function toast(text, { xp = 0, warn = false } = {}) {
    const el = document.createElement('div');
    el.className = `toast${warn ? ' warn' : ''}`;
    el.innerHTML = (xp ? `<b>+${xp} XP</b>` : '') + esc(text);
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), warn ? 6000 : 3400);
  }
  const fail = (err) => toast(err.message, { warn: true });

  const canvas = $('#confetti');
  const cx = canvas.getContext('2d');
  let particles = [];
  let raf = 0;
  let confettiTimer = 0;
  function clearConfetti() {
    particles = [];
    cancelAnimationFrame(raf);
    raf = 0;
    cx.clearRect(0, 0, canvas.width, canvas.height);
  }
  function confetti(anchor) {
    if (!effectsOn() || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ['#f2b36b', '#8fb8e8', '#9fd3b5', '#e9a3c8', '#f3effa'];
    for (let i = 0; i < 36; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const v = 2 + Math.random() * 4;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, s: 4 + Math.random() * 4, c: colors[i % colors.length], r: Math.random() * 6, life: 0 });
    }
    if (!raf) raf = requestAnimationFrame(tick);
    // Safety net: never leave particles on screen, even if frames get throttled.
    clearTimeout(confettiTimer);
    confettiTimer = setTimeout(clearConfetti, 1800);
  }
  function tick() {
    cx.clearRect(0, 0, innerWidth, innerHeight);
    particles = particles.filter((p) => p.life < 64);
    for (const p of particles) {
      p.life += 1;
      p.vy += 0.17;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += 0.18;
      cx.globalAlpha = Math.max(0, 1 - p.life / 64);
      cx.fillStyle = p.c;
      cx.save();
      cx.translate(p.x, p.y);
      cx.rotate(p.r);
      cx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      cx.restore();
    }
    cx.globalAlpha = 1;
    raf = particles.length ? requestAnimationFrame(tick) : 0;
    if (!raf) cx.clearRect(0, 0, innerWidth, innerHeight);
  }

  let audio = null;
  function chime() {
    if (!S.game?.settings?.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      [523, 784].forEach((f, i) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.04, t + i * 0.1 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.1 + 0.25);
        o.connect(g).connect(audio.destination);
        o.start(t + i * 0.1);
        o.stop(t + i * 0.1 + 0.27);
      });
    } catch {
      /* sound is optional */
    }
  }

  // Applies a mutation response: fresh gamification state and reward effects.
  function applyResult(resp, anchor) {
    if (resp?.gamification) S.game = resp.gamification;
    const reward = resp?.reward;
    if (reward) {
      toast(reward.message, { xp: reward.xp });
      celebrate(reward.message);
      chime();
      confetti(anchor);
    }
    renderStatus();
  }

  // ---------- Data ----------
  async function loadAll() {
    await api('GET', '/api/todo');
    const [ideas, projects, stats, game] = await Promise.all([
      api('GET', '/api/ideas'),
      api('GET', '/api/projects'),
      api('GET', '/api/stats'),
      api('GET', '/api/gamification'),
    ]);
    Object.assign(S, { ideas, projects, stats, game });
    renderStatus();
  }
  async function refresh() {
    await loadAll();
    render();
  }
  const ideaById = (id) => S.ideas.find((i) => i.id === id);
  const projectById = (id) => S.projects.find((p) => p.id === id);

  // ---------- Auth ----------
  async function showAuth() {
    $('#shell').hidden = true;
    closeAll();
    const status = await api('GET', '/api/auth/status').catch(() => ({ setup_required: false }));
    const setup = status.setup_required;
    const el = $('#auth');
    el.hidden = false;
    el.innerHTML = `<div class="auth-card">
      ${orbitSvg(120)}
      <h1>${setup ? 'Welcome to Orbital' : 'Welcome back'}</h1>
      <p class="quiet" style="margin:0 auto">${setup ? 'A calm place for ideas and projects. First, create your account. You will be the admin and can invite others later.' : 'Sign in to see your orbit.'}</p>
      <form id="authForm" novalidate>
        ${setup ? '<label class="field"><span>Your name</span><input type="text" name="display_name" autocomplete="name" maxlength="80"></label>' : ''}
        <label class="field"><span>Username</span><input type="text" name="username" autocomplete="username" required maxlength="32" autocapitalize="none" spellcheck="false">
          ${setup ? '<small>3 to 32 letters, digits, dots, dashes or underscores.</small>' : ''}</label>
        <label class="field"><span>Password</span><input type="password" name="password" autocomplete="${setup ? 'new-password' : 'current-password'}" required maxlength="200">
          ${setup ? '<small>At least 8 characters.</small>' : ''}</label>
        ${setup && S.config.setup_token_required ? '<label class="field"><span>Setup token</span><input type="password" name="setup_token" autocomplete="off"><small>Set by whoever runs this server (SETUP_TOKEN).</small></label>' : ''}
        <button class="btn" type="submit">${setup ? 'Create account' : 'Sign in'}</button>
        <div class="error" id="authErr" role="alert"></div>
      </form></div>`;
    $('#authForm input').focus();
    $('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      try {
        const r = await api('POST', setup ? '/api/auth/setup' : '/api/auth/login', body);
        S.user = r.user;
        await enterApp();
      } catch (err) {
        $('#authErr').textContent = err.message;
      }
    });
  }

  async function enterApp() {
    $('#auth').hidden = true;
    $('#auth').innerHTML = '';
    $('#shell').hidden = false;
    $('#whoLabel').textContent = S.user.display_name || S.user.username;
    await Promise.all([loadAll(), loadScratch()]);
    if (!S.game.settings.onboarded) return showOnboarding();
    showTab(location.hash.slice(1) || 'today');
  }

  // ---------- First-run setup for every new account ----------
  const OB = { step: 0 };
  const OB_STEPS = ['hello', 'name', 'color', 'you', 'comfort', 'first', 'done'];

  function showOnboarding() {
    Object.assign(OB, {
      step: 0,
      name: cname(),
      color: S.game.settings.companion_color || 'moon',
      display: S.user.display_name || '',
      effects: S.game.settings.effects !== false,
      sound: Boolean(S.game.settings.sound),
      todo: '',
    });
    $('#shell').hidden = true;
    $('#onboard').hidden = false;
    renderOnboarding();
  }

  function renderOnboarding() {
    const step = OB_STEPS[OB.step];
    const hex = COMPANION_COLORS[OB.color].hex;
    applyCompanion(hex);
    const nm = esc(OB.name.trim() || 'Orbit');
    const dots = OB_STEPS.slice(1, -1).map((s, i) => `<i class="${i < OB.step ? 'on' : ''}"></i>`).join('');
    let body = '';
    let next = 'Next';
    if (step === 'hello') {
      body = `<h1>Hi. I am your companion.</h1>
        <p class="lead">Let us set things up together. It takes about a minute, and you can change everything later in Settings.</p>`;
      next = 'Start';
    } else if (step === 'name') {
      body = `<p class="q">What should I be called?</p><p class="q-help">Pick a name you like. Short names are easiest.</p>
        <label class="field"><span class="sr-only">Name</span><input type="text" id="obName" maxlength="24" value="${esc(OB.name)}" autocomplete="off"></label>
        <div class="filters">${NAME_IDEAS.map((n) => `<button type="button" data-ob="name-idea" data-v="${n}" class="${OB.name === n ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    } else if (step === 'color') {
      body = `<p class="q">Which colour suits ${nm}?</p><p class="q-help">Only for looks. You can change it any time.</p>
        <div class="swatches" role="radiogroup" aria-label="Colour">${Object.entries(COMPANION_COLORS)
          .map(([id, c]) => `<button type="button" role="radio" aria-checked="${OB.color === id}" data-ob="color" data-v="${id}" class="swatch${OB.color === id ? ' on' : ''}"><span style="background:${c.hex}"></span>${c.label}</button>`)
          .join('')}</div>`;
    } else if (step === 'you') {
      body = `<p class="q">What should ${nm} call you?</p><p class="q-help">Your first name or a nickname is fine.</p>
        <label class="field"><span class="sr-only">Your name</span><input type="text" id="obYou" maxlength="80" value="${esc(OB.display)}" autocomplete="given-name"></label>`;
    } else if (step === 'comfort') {
      body = `<p class="q">How lively should things be?</p><p class="q-help">When you finish something, ${nm} can do a little lap with some confetti. If your system asks for reduced motion, everything stays still anyway.</p>
        <div class="choices">
          <button class="choice${OB.effects ? ' on' : ''}" data-ob="effects" data-v="1">Small celebrations<small>${nm} moves, a little confetti</small></button>
          <button class="choice${!OB.effects ? ' on' : ''}" data-ob="effects" data-v="0">Keep it still<small>No movement, no confetti</small></button>
        </div>
        <label class="check" style="margin-top:18px"><input type="checkbox" id="obSound" ${OB.sound ? 'checked' : ''}> A soft sound when something is done</label>`;
    } else if (step === 'first') {
      body = `<p class="q">One small thing for today?</p><p class="q-help">Optional. It goes on your to-do list. Something tiny is perfect.</p>
        <label class="field"><span class="sr-only">First to-do</span><input type="text" id="obTodo" maxlength="200" value="${esc(OB.todo)}" placeholder="e.g. Drink a glass of water"></label>`;
      next = OB.todo.trim() ? 'Add it' : 'Skip this';
    } else {
      body = `<h1>${nm} is ready.</h1>
        <p class="lead">${OB.display.trim() ? `Nice to meet you, ${esc(OB.display.trim())}. ` : ''}Tap ${nm} any time to visit your little house.</p>`;
      next = 'Let us go';
    }
    $('#onboard').innerHTML = `<div class="auth-card onboard-card">
      <div class="onboard-orbit">${orbitSvg(step === 'hello' || step === 'done' ? 170 : 140)}</div>
      ${step !== 'hello' && step !== 'done' ? `<div class="steps" aria-hidden="true">${dots}</div><p class="quiet small" style="margin:-14px 0 18px">Step ${OB.step} of ${OB_STEPS.length - 2}</p>` : ''}
      <div class="onboard-body">${body}</div>
      <div class="actions" style="justify-content:center">
        ${OB.step > 0 && step !== 'done' ? '<button class="btn soft" data-ob="back">Back</button>' : ''}
        <button class="btn" data-ob="next">${next}</button>
      </div>
      ${step !== 'done' ? '<p style="margin-top:18px"><button class="btn text" data-ob="skip">Skip setup</button></p>' : ''}
    </div>`;
    if (S.game.settings.effects !== false) setOrbitState(step === 'done' ? 'celebrate' : 'idle');
    const bind = (sel, key) => {
      const el = $(sel);
      if (!el) return;
      el.addEventListener('input', () => {
        OB[key] = el.value;
        if (key === 'todo') $('[data-ob="next"]').textContent = OB.todo.trim() ? 'Add it' : 'Skip this';
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onboardAct('next');
        }
      });
      el.focus();
    };
    bind('#obName', 'name');
    bind('#obYou', 'display');
    bind('#obTodo', 'todo');
    $('#obSound')?.addEventListener('change', (e) => (OB.sound = e.target.checked));
    if (!$('#obName, #obYou, #obTodo')) $('[data-ob="next"]').focus();
  }

  async function finishOnboarding(skipped) {
    const settings = skipped
      ? { onboarded: true }
      : { onboarded: true, companion_name: OB.name.trim() || 'Orbit', companion_color: OB.color, effects: OB.effects, sound: OB.sound };
    try {
      S.game = await api('PATCH', '/api/gamification', { settings });
      if (!skipped && OB.display.trim() && OB.display.trim() !== S.user.display_name) {
        S.user = (await api('PATCH', '/api/auth/profile', { display_name: OB.display.trim() })).user;
        $('#whoLabel').textContent = S.user.display_name || S.user.username;
      }
      if (!skipped && OB.todo.trim()) {
        const list = await api('GET', '/api/todo');
        await api('POST', '/api/tasks', { project_id: list.id, title: OB.todo.trim().slice(0, 200) });
      }
    } catch (err) {
      fail(err);
    }
    $('#onboard').hidden = true;
    $('#onboard').innerHTML = '';
    $('#shell').hidden = false;
    applyCompanion();
    await loadAll();
    showTab(location.hash.slice(1) || 'today');
  }

  function onboardAct(a, v) {
    if (a === 'skip') return finishOnboarding(true);
    if (a === 'back') {
      OB.step = Math.max(0, OB.step - 1);
      return renderOnboarding();
    }
    if (a === 'name-idea') OB.name = v;
    if (a === 'color') OB.color = v;
    if (a === 'effects') OB.effects = v === '1';
    if (a === 'name-idea' || a === 'color' || a === 'effects') return renderOnboarding();
    if (a === 'next') {
      if (OB_STEPS[OB.step] === 'name' && !OB.name.trim()) OB.name = 'Orbit';
      if (OB.step === OB_STEPS.length - 1) return finishOnboarding(false);
      OB.step += 1;
      renderOnboarding();
    }
  }
  $('#onboard').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ob]');
    if (b) onboardAct(b.dataset.ob, b.dataset.v);
  });

  // ---------- Routing ----------
  const TABS = ['today', 'todo', 'scratch', 'ideas', 'projects', 'home', 'guide', 'settings'];
  // The simple to-do list is stored as the user's 'inbox' project.
  const todoList = () => S.projects.find((p) => p.kind === 'inbox' && p.open);
  const realProjects = () => S.projects.filter((p) => p.kind !== 'inbox');
  let current = 'today';
  function showTab(name) {
    if (!TABS.includes(name) || (name === 'home' && !S.config.home_enabled)) name = 'today';
    current = name;
    $$('.nav a[data-tab]').forEach((a) => {
      a.classList.toggle('on', a.dataset.tab === name);
      if (a.dataset.tab === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => {
    if (!$('#shell').hidden) showTab(location.hash.slice(1));
  });

  const VIEWS = {};
  function render() {
    const main = $('#main');
    const top = `<div class="mobile-top"><button type="button" data-act="room" aria-label="Open the living room">${orbitSvg(44)}<div><div class="me-level">Level ${S.game?.level ?? 1}</div><div class="quiet small">${esc(S.game?.streak ? `${plural(S.game.streak, 'day')} in a row` : `Tap to visit ${esc(cname())}`)}</div></div></button></div>`;
    main.innerHTML = top + VIEWS[current]();
    renderStatus();
    VIEWS[`${current}After`]?.();
  }

  // ---------- Today ----------
  function nextTask() {
    const open = S.projects.filter((p) => p.open);
    const rank = (p, t) => {
      if (t.mandatory) return 0;
      if (t.status === 'doing') return 1;
      if (p.mandatory || p.core_context_quadrant === 'manage') return 2;
      if (p.core_context_quadrant === 'deploy') return 3;
      return 4;
    };
    const all = open.flatMap((p) => p.tasks.filter((t) => t.status !== 'done').map((t) => ({ p, t, r: rank(p, t) })));
    all.sort((a, b) => a.r - b.r || a.t.position - b.t.position);
    return all.find((x) => !S.skipped.has(x.t.id)) || all[0] || null;
  }

  function greeting() {
    const h = new Date().getHours();
    const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    return `${part}, ${esc(S.user.display_name || S.user.username)}.`;
  }

  VIEWS.today = () => {
    const st = S.stats;
    const m = st.mandatory_open;
    const needs = m.length
      ? `<div class="needs-you"><h2>${m.length === 1 ? 'One thing needs you' : `${m.length} things need you`}</h2><ul>
          ${m.slice(0, 3).map((x) => `<li><button class="linkish" data-act="open-${x.type}" data-id="${x.type === 'task' ? x.project_id : x.id}">${esc(x.title)}</button>${x.reason ? ` <span class="quiet">(${esc(x.reason)})</span>` : ''}</li>`).join('')}
          ${m.length > 3 ? `<li class="quiet">and ${m.length - 3} more</li>` : ''}</ul></div>`
      : '';

    const nt = nextTask();
    const parked = S.ideas.filter((i) => i.status === 'parked');
    // Progress across all tasks of active projects, until the list is empty.
    const activeTasks = S.projects.filter((p) => p.open).flatMap((p) => p.tasks);
    const doneCount = activeTasks.filter((t) => t.status === 'done').length;
    const pct = activeTasks.length ? Math.round((100 * doneCount) / activeTasks.length) : 0;
    const progressLine = (extra = '') => `<div class="progress" role="progressbar" aria-label="Steps done" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" style="margin-top:20px"><span style="width:${pct}%"></span></div>
      <div class="where">${pct}% done (${doneCount} of ${plural(activeTasks.length, 'step')})${extra}</div>`;
    const ready = S.projects.filter((p) => p.open && p.tasks.length && p.tasks_done === p.tasks.length);
    let focus;
    if (nt) {
      const left = activeTasks.length - doneCount;
      focus = `<div class="focus" data-flash="task-${nt.t.id}">
        <div class="label">Next up</div>
        <div class="big">${esc(nt.t.title)}</div>
        <div class="where">${nt.p.kind === 'inbox' ? 'on your to-do list' : `in ${esc(nt.p.title)}`}</div>
        <div class="actions"><button class="btn" data-act="today-done" data-id="${nt.t.id}">Mark as done</button>
        ${left > 1 ? `<button class="btn text" data-act="today-skip" data-id="${nt.t.id}">Not now, show another</button>` : ''}</div>
        ${progressLine(left === 1 ? '. This is the last one.' : `. ${left} to go.`)}</div>`;
    } else if (activeTasks.length) {
      focus = `<div class="focus">
        <div class="label">All steps done</div>
        <div class="big">The list is empty.</div>
        ${progressLine()}
        <div class="where">${ready.length ? 'Close what is finished, or add new steps in Projects.' : 'Nothing left in orbit right now. A pause is fine.'}</div>
        ${ready.length ? `<div class="actions">${ready.slice(0, 3).map((p) => `<button class="btn${ready.length === 1 ? '' : ' soft'}" data-act="complete-project" data-id="${p.id}">Complete ${esc(p.title)}</button>`).join('')}</div>` : ''}</div>`;
    } else if (parked.length) {
      const i = parked[parked.length - 1];
      focus = `<div class="focus"><div class="label">A parked idea is waiting</div><div class="big">${esc(i.title)}</div>
        <div class="where">${plural(parked.length, 'idea')} parked. Parked ${ago(i.created_at)}. Deciding one takes about a minute.</div>
        <div class="actions"><button class="btn" data-act="evaluate" data-id="${i.id}">Evaluate it</button></div></div>`;
    } else {
      focus = `<div class="empty"><strong>${MSG.emptyIdeas}</strong>Write whatever is on your mind into Scratch. Sorting comes later.
        <div class="actions" style="justify-content:center"><a class="btn" href="#scratch">Open Scratch</a></div></div>`;
    }

    const cc = st.core_context;
    const cell = (q) => `<button type="button" class="${q}" data-act="quad" data-q="${q}"${q === 'manage' ? ` title="${esc(MANAGE_TIP)}"` : ''}>
      <div class="n">${cc[q]}</div><div class="k">${QUAD[q].label}</div><div class="d">${esc(QUAD[q].line)}</div></button>`;
    const total = Object.values(cc).reduce((a, b) => a + b, 0);

    // "At a glance": collapsed by default, remembered per browser.
    const activeProjects = realProjects().filter((p) => p.open);
    let glanceOpen = false;
    try { glanceOpen = localStorage.getItem('orbital.glance') === '1'; } catch { /* storage unavailable */ }
    const num = (n, label) => `<div><div class="n">${n}</div><div class="quiet small">${label}</div></div>`;
    const glance = S.ideas.length || S.projects.length
      ? `<section><details class="fold" id="glance"${glanceOpen ? ' open' : ''}><summary>At a glance</summary><div>
          <div class="glance">${num(st.ideas.parked, 'Parked ideas')}${num(st.projects.active, 'Active projects')}${num(st.tasks.open, 'Open tasks')}${num(st.tasks.done, 'Done tasks')}</div>
          ${activeProjects.length
            ? `<ul class="list">${activeProjects.map((p) => `<li><button type="button" class="row" data-act="open-project" data-id="${p.id}">
                <div class="body"><div class="t">${esc(p.title)}</div>
                ${p.tasks.length ? `<div class="progress" aria-hidden="true"><span style="width:${p.progress}%"></span></div>` : ''}
                <div class="s">${p.tasks.length ? `${p.tasks_done} of ${p.tasks.length} done` : 'No tasks yet'}</div></div></button></li>`).join('')}</ul>`
            : '<p class="quiet">No projects in orbit.</p>'}
        </div></details></section>`
      : '';

    return `<div class="page">
      <h1>${greeting()}</h1>
      <p class="lead">${esc(S.game.alert_count ? MSG.alert : S.game.streak_message || MSG.idle)}</p>
      ${needs}
      <section>${focus}</section>
      ${glance}
      ${total ? `<section><h2>Where your ideas sit</h2>
        <div class="quad">${cell('invent')}${cell('deploy')}${cell('offload')}${cell('manage')}</div>
        <div class="axis"><span>Top: core. Bottom: context.</span><span>Right: mission-critical.</span></div>
        ${st.hints.map((h) => `<div class="hint">${esc(h.message)}</div>`).join('')}
        ${st.review_due.count ? `<div class="hint">${st.review_due.count === 1 ? 'One item is' : `${st.review_due.count} items are`} ready for a quadrant review. You will find them under Ideas and Projects.</div>` : ''}
      </section>` : ''}
      ${S.config.ai_enabled ? `<section><h2>Your week</h2><div class="panel" id="digestOut"><p class="quiet">A short summary of the last 7 days, written by your local model. It only runs when you ask.</p>
        <button class="btn soft" data-act="digest">Write my weekly digest</button></div></section>` : ''}
    </div>`;
  };

  VIEWS.todayAfter = () => {
    const d = $('#glance');
    if (!d) return;
    d.addEventListener('toggle', () => {
      try { localStorage.setItem('orbital.glance', d.open ? '1' : '0'); } catch { /* storage unavailable */ }
    });
  };

  // ---------- Ideas ----------
  // Calm relative date: "today", "3 days ago", "2 weeks ago", else a locale date.
  function ago(iso) {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return 'earlier';
    const days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days <= 13) return `${days} days ago`;
    const weeks = Math.floor(days / 7);
    if (weeks <= 8) return `${weeks} weeks ago`;
    return new Date(iso).toLocaleDateString();
  }

  function ideaLine(i) {
    if (i.status === 'dropped') return 'Dropped. That was a decision.';
    if (i.status === 'decided') return i.done_at ? 'Done.' : 'Decided. Now a project.';
    if (i.mandatory && i.result) return `${i.result}${i.mandatory_reason ? ` (${i.mandatory_reason})` : ''}`;
    if (i.result && i.status === 'evaluated') return i.result;
    if (i.eisenhower_quadrant) return `Parked ${ago(i.created_at)}. ${EIS[i.eisenhower_quadrant]} so far.`;
    return `Parked ${ago(i.created_at)}. Not evaluated yet.`;
  }

  const IDEA_FILTERS = {
    open: { label: 'Open', fn: (i) => i.open },
    parked: { label: 'Parked', fn: (i) => i.status === 'parked' },
    evaluated: { label: 'Evaluated', fn: (i) => i.status === 'evaluated' },
    decided: { label: 'Decided', fn: (i) => i.status === 'decided' },
    dropped: { label: 'Dropped', fn: (i) => i.status === 'dropped' },
  };

  VIEWS.ideas = () => {
    const f = IDEA_FILTERS[S.ideaFilter];
    const list = S.ideas.filter((i) => f.fn(i) && (!S.quadFilter || i.core_context_quadrant === S.quadFilter));
    const rows = list
      .map((i) => {
        const needs = i.open && (i.mandatory || i.core_context_quadrant === 'manage');
        return `<li><button class="row${needs ? ' needs' : ''}" data-act="open-idea" data-id="${i.id}" data-flash="idea-${i.id}">
          <div class="body"><div class="t">${esc(i.title)}</div><div class="s">${esc(ideaLine(i))}</div></div>
          ${i.review_due ? '<span class="chip sky">Review</span>' : ''}
          <svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
        </button></li>`;
      })
      .join('');
    return `<div class="page">
      <h1>Ideas</h1>
      <p class="lead">Catch it first. Decide later, one question at a time.</p>
      <form class="capture" id="captureForm" autocomplete="off">
        <input type="text" id="capture" maxlength="200" placeholder="What is on your mind?" aria-label="New idea">
        <button class="btn" type="submit">Park it</button>
      </form>
      <div class="filters" role="group" aria-label="Show">
        ${Object.entries(IDEA_FILTERS).map(([k, v]) => `<button type="button" data-act="ifilter" data-f="${k}" class="${S.ideaFilter === k ? 'on' : ''}" aria-pressed="${S.ideaFilter === k}">${v.label}</button>`).join('')}
        ${S.quadFilter ? `<button type="button" class="on" data-act="quad-clear" aria-label="Remove quadrant filter">${QUAD[S.quadFilter].label} only ×</button>` : ''}
      </div>
      ${list.length ? `<ul class="list">${rows}</ul>` : `<div class="empty"><strong>${S.ideas.length ? 'Nothing here right now.' : MSG.emptyIdeas}</strong>${S.ideas.length ? 'Try another filter.' : 'Type your first idea above and park it.'}</div>`}
    </div>`;
  };

  VIEWS.ideasAfter = () => {
    const input = $('#capture');
    if (!input) return;
    $('#captureForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return input.focus();
      try {
        const resp = await api('POST', '/api/ideas', { title });
        input.value = '';
        applyResult(resp, e.submitter);
        if (!resp.reward) toast(`Parked: ${title}`);
        await refresh();
        flash('idea', resp.item.id);
        $('#capture')?.focus();
      } catch (err) {
        fail(err);
      }
    });
    // Paste anywhere: several lines open the inbox review instead of one long title.
    input.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text') || '';
      if (text.split(/\r?\n/).filter((l) => l.trim()).length < 2) return;
      e.preventDefault();
      openInbox({ origin: 'paste', text: text.replace(/\r\n/g, '\n') }).catch(fail);
    });
  };

  function flash(type, id) {
    if (!effectsOn()) return;
    const el = $(`[data-flash="${type}-${id}"]`);
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  // ---------- Sheet and modal ----------
  const sheet = $('#sheet');
  const modal = $('#modal');
  function openSheet(html) {
    sheet.innerHTML = `<div class="sheet-inner">${html}</div>`;
    if (!sheet.open) sheet.showModal();
    const first = sheet.querySelector('[autofocus]') || sheet.querySelector('.sheet-body button, .sheet-body input');
    first?.focus();
  }
  const closeSheet = () => sheet.open && sheet.close();
  function closeAll() {
    if (sheet.open) sheet.close();
    if (modal.open) modal.close();
  }
  const sheetHead = (title, chip = '') =>
    `<div class="sheet-head"><div>${chip}</div><button class="close" data-act="close" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
     <h2 id="sheetTitle" class="sr-title" style="padding:0 28px;margin:0 0 4px">${esc(title)}</h2>`;

  // Calm confirmation instead of the browser's confirm().
  function ask(title, text, confirmLabel, { danger = false } = {}) {
    return new Promise((resolve) => {
      modal.innerHTML = `<div class="modal-inner"><h2 id="modalTitle">${esc(title)}</h2><p class="quiet">${esc(text)}</p>
        <div class="actions"><button class="btn ${danger ? 'danger' : ''}" data-v="yes">${esc(confirmLabel)}</button><button class="btn soft" data-v="no">Keep it</button></div></div>`;
      const done = (v) => {
        modal.close();
        resolve(v);
      };
      modal.querySelector('[data-v="yes"]').onclick = () => done(true);
      modal.querySelector('[data-v="no"]').onclick = () => done(false);
      modal.oncancel = () => resolve(false);
      modal.showModal();
      modal.querySelector('[data-v="no"]').focus();
    });
  }

  function prompted(title, label, value = '', { suggestions = [] } = {}) {
    return new Promise((resolve) => {
      modal.innerHTML = `<form class="modal-inner" id="promptForm"><h2 id="modalTitle">${esc(title)}</h2>
        <label class="field"><span>${esc(label)}</span><input type="text" id="promptInput" maxlength="200" value="${esc(value)}"></label>
        ${suggestions.length ? `<div class="filters">${suggestions.map((s) => `<button type="button" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
        <div class="actions"><button class="btn" type="submit">Save</button><button class="btn soft" type="button" data-v="no">Cancel</button></div></form>`;
      const done = (v) => {
        modal.close();
        resolve(v);
      };
      modal.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => ($('#promptInput').value = b.dataset.s)));
      modal.querySelector('[data-v="no"]').onclick = () => done(null);
      $('#promptForm').onsubmit = (e) => {
        e.preventDefault();
        done($('#promptInput').value.trim());
      };
      modal.oncancel = () => resolve(null);
      modal.showModal();
      $('#promptInput').focus();
    });
  }

  // ---------- Idea sheet ----------
  function ideaChip(i) {
    if (i.status === 'parked') return '<span class="chip sun">Parked</span>';
    if (i.status === 'evaluated') return '<span class="chip sky">Evaluated</span>';
    if (i.status === 'decided') return '<span class="chip sage">Decided</span>';
    return '<span class="chip">Dropped</span>';
  }

  function explain(i) {
    if (i.result_kind === 'manage') return MANAGE_TIP;
    if (i.result_kind === 'mandatory') return i.still_required ? 'The matrix alone would say otherwise. It is still required, so it stays on top.' : 'An outside obligation. It stays on top until it is done.';
    if (i.result_kind === 'fallback') return 'This combination is not one of the nine rules, so Orbital used its fallback. Decide consciously.';
    if (i.result_kind === 'eisenhower') return 'Based on urgency and importance. Add the economics for a sharper answer.';
    return '';
  }

  function openIdea(id) {
    const i = ideaById(id);
    if (!i) return;
    const evaluated = Boolean(i.eisenhower_quadrant && i.core_context_quadrant);
    const facts = [];
    if (i.eisenhower_quadrant) facts.push(['Urgent and important', EIS[i.eisenhower_quadrant]]);
    if (i.core_context_quadrant) facts.push(['Core or context', `${QUAD[i.core_context_quadrant].label}. ${QUAD[i.core_context_quadrant].line}`]);
    if (i.economics_result && !i.stage2_skipped) facts.push(['Economics', `Money ${TERN[i.money]}, time ${TERN[i.time]}, delegation ${TERN[i.delegation]}`]);
    if (i.due_date) facts.push(['Due', i.due_date]);
    if (i.mandatory) facts.push(['Must happen', i.mandatory_reason || 'Yes']);

    const primary = [];
    if (i.open) {
      if (!evaluated) primary.push(`<button class="btn" data-act="evaluate" data-id="${i.id}">Evaluate now</button>`);
      else primary.push(`<button class="btn" data-act="make-project" data-id="${i.id}">Make it a project</button>`);
      if (i.mandatory) primary.push(`<button class="btn soft" data-act="idea-status" data-s="decided" data-id="${i.id}">Mark as done</button>`);
    } else {
      primary.push(`<button class="btn soft" data-act="idea-status" data-s="parked" data-id="${i.id}">Reopen</button>`);
    }
    const more = [];
    if (evaluated && i.open) more.push(`<button class="btn text" data-act="evaluate" data-id="${i.id}">Answer the questions again</button>`);
    if (i.review_due) more.push(`<button class="btn text" data-act="review" data-type="idea" data-id="${i.id}">Review the quadrant (it has been 90 days)</button>`);
    if (S.config.ai_enabled && i.open) more.push(`<button class="btn text" data-act="suggest" data-id="${i.id}">Ask my local model for suggestions</button>`);
    if (i.status === 'evaluated') more.push(`<button class="btn text" data-act="idea-status" data-s="parked" data-id="${i.id}">Park it for later</button>`);
    if (i.open && !i.mandatory) more.push(`<button class="btn text" data-act="idea-status" data-s="dropped" data-id="${i.id}">Drop it</button>`);
    more.push(`<button class="btn text" data-act="delete-idea" data-id="${i.id}">Delete</button>`);

    openSheet(`${sheetHead('Idea', ideaChip(i))}
      <div class="sheet-body">
        <label class="field"><span>Title</span><input type="text" id="ideaTitle" maxlength="200" value="${esc(i.title)}"></label>
        <label class="field"><span>Notes</span><textarea id="ideaNotes" maxlength="5000" placeholder="Why now? What happens if you do not do it?">${esc(i.notes)}</textarea></label>
        ${i.result ? `<div class="result"><div class="r">${esc(i.result)}</div>${explain(i) ? `<div class="why">${esc(explain(i))}</div>` : ''}</div>` : `<div class="result"><div class="r">Parked. That is fine.</div><div class="why">When you are ready, answer a few short questions and Orbital suggests what to do with it.</div></div>`}
        ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
        <div class="more">${more.join('')}</div>
      </div>
      <div class="sheet-foot">${primary.join('')}<span class="quiet small" id="ideaSaved" style="margin-left:auto"></span></div>`);

    const saveText = async () => {
      const title = $('#ideaTitle').value.trim();
      const notes = $('#ideaNotes').value.trim();
      if (!title) return ($('#ideaSaved').textContent = 'A title is needed.');
      if (title === i.title && notes === (i.notes || '')) return;
      try {
        await api('PATCH', `/api/ideas/${i.id}`, { title, notes });
        i.title = title;
        i.notes = notes;
        $('#ideaSaved').textContent = 'Saved';
        loadAll().then(() => current === 'ideas' && render());
      } catch (err) {
        $('#ideaSaved').textContent = err.message;
      }
    };
    $('#ideaTitle').addEventListener('blur', saveText);
    $('#ideaNotes').addEventListener('blur', saveText);
  }

  // ---------- Evaluation wizard ----------
  // One question per step. Choices advance automatically.
  const W = { id: null, a: {}, step: 0, ev: null };

  function wizardSteps() {
    const a = W.a;
    const steps = ['importance', 'urgency', 'core_context', 'mission_critical', 'mandatory'];
    const eq = a.importance && a.urgency;
    const manage = a.core_context === 'context' && a.mission_critical === 'yes';
    if (eq && !a.mandatory && !manage) steps.push('economics');
    steps.push('result');
    return steps;
  }

  function startWizard(id) {
    const i = ideaById(id);
    W.id = id;
    W.a = {
      importance: i.importance, urgency: i.urgency, core_context: i.core_context, mission_critical: i.mission_critical,
      money: i.money, time: i.time, delegation: i.delegation, mandatory: i.mandatory, mandatory_reason: i.mandatory_reason || '',
      due_date: i.due_date, mandatoryTouched: i.status !== 'parked' || i.mandatory,
    };
    W.step = 0;
    renderWizard();
  }

  const choice = (key, value, label, help = '') =>
    `<button class="choice${W.a[key] === value ? ' on' : ''}" data-act="w-pick" data-k="${key}" data-v="${value}">${esc(label)}${help ? `<small>${esc(help)}</small>` : ''}</button>`;

  async function renderWizard() {
    const steps = wizardSteps();
    W.step = Math.min(W.step, steps.length - 1);
    const step = steps[W.step];
    const i = ideaById(W.id);
    const a = W.a;
    let body = '';
    let foot = '';

    if (step === 'importance') {
      body = `<p class="q">Is this important to you?</p><p class="q-help">Important means it moves something you care about. Not every idea has to be.</p>
        <div class="choices">${choice('importance', 'important', 'Yes, important')}${choice('importance', 'not_important', 'Not really')}</div>`;
    } else if (step === 'urgency') {
      body = `<p class="q">Is it urgent?</p><p class="q-help">Urgent means waiting makes it worse soon.</p>
        <div class="choices">${choice('urgency', 'urgent', 'Yes, urgent')}${choice('urgency', 'not_urgent', 'It can wait')}</div>`;
    } else if (step === 'core_context') {
      body = `<p class="q">Would a customer notice if this were gone?</p><p class="q-help">Yes means core: it sets you apart. No means context: needed, but not what people pay you for.</p>
        <div class="choices">${choice('core_context', 'core', 'Yes', 'Core')}${choice('core_context', 'context', 'No', 'Context')}</div>`;
    } else if (step === 'mission_critical') {
      body = `<p class="q">Does it hurt within a week if this fails?</p><p class="q-help">Think of real damage, not mild annoyance.</p>
        <div class="choices">${choice('mission_critical', 'yes', 'Yes, it would hurt')}${choice('mission_critical', 'no', 'No, not that fast')}</div>`;
    } else if (step === 'mandatory') {
      const manage = a.core_context === 'context' && a.mission_critical === 'yes';
      if (manage && !a.mandatoryTouched) {
        a.mandatory = true;
        a.mandatory_reason = a.mandatory_reason || MANAGE_REASON;
      }
      body = `<p class="q">Does this have to happen no matter what?</p>
        <p class="q-help">${manage ? 'This is context work that must keep running (Manage), so Orbital suggests yes. You can change it.' : 'For example a contract, a legal or security duty, or something that blocks other work.'}</p>
        <div class="choices">
          <button class="choice${a.mandatory ? ' on' : ''}" data-act="w-pick" data-k="mandatory" data-v="yes">Yes, it must happen</button>
          <button class="choice${!a.mandatory && a.mandatoryTouched ? ' on' : ''}" data-act="w-pick" data-k="mandatory" data-v="no">No</button>
        </div>
        ${a.mandatory ? `<label class="field" style="margin-top:22px"><span>Why? (optional)</span><input type="text" id="wReason" maxlength="200" value="${esc(a.mandatory_reason)}"></label>
          <div class="filters">${[...(manage ? [MANAGE_REASON] : []), ...REASONS].map((r) => `<button type="button" data-act="w-reason" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>` : ''}`;
      if (a.mandatory) foot = '<button class="btn" data-act="w-next">Continue</button>';
    } else if (step === 'economics') {
      const opt = (k, v) => `<button type="button" class="${a[k] === v ? 'on' : ''}" data-act="w-eco" data-k="${k}" data-v="${v}">${TERN[v]}</button>`;
      const row = (k, q) => `<div><div style="font-weight:600">${q}</div><div class="opts">${opt(k, 'yes')}${opt(k, 'neutral')}${opt(k, 'no')}</div></div>`;
      body = `<p class="q">The economics</p><p class="q-help">${a.importance === 'not_important' ? 'Optional for less important ideas. Skip it if you like.' : 'Three quick questions for a sharper answer. You can skip them.'}</p>
        <div class="mini">${row('money', 'Does it bring money?')}${row('time', 'Is it doable in the time you have?')}${row('delegation', 'Could someone else do it?')}</div>`;
      foot = `<button class="btn" data-act="w-next">${a.money && a.time && a.delegation ? 'Continue' : 'Skip'}</button>`;
    } else if (step === 'result') {
      const payload = {
        importance: a.importance || null, urgency: a.urgency || null, core_context: a.core_context || null, mission_critical: a.mission_critical || null,
        mandatory: Boolean(a.mandatory), mandatory_reason: a.mandatory ? a.mandatory_reason : '',
      };
      const eco = wizardSteps().includes('economics');
      Object.assign(payload, eco ? { money: a.money || null, time: a.time || null, delegation: a.delegation || null } : {});
      try {
        W.ev = await api('POST', '/api/evaluate', payload);
      } catch (err) {
        W.ev = null;
        fail(err);
      }
      const ev = W.ev || {};
      body = `<p class="q">Here is what Orbital suggests</p>
        <div class="result"><div class="r">${esc(ev.result || 'Parked for now')}</div>
        <div class="why">${esc(explain(ev) || (ev.evaluated ? '' : 'Some answers are missing, so the idea stays parked. That is fine.'))}</div></div>
        ${ev.eisenhower_quadrant === 'schedule' ? `<label class="field"><span>When would be a good date?</span><input type="date" id="wDue" value="${esc(a.due_date || '')}"><small>Optional.</small></label>` : ''}
        <dl class="facts">${ev.eisenhower_quadrant ? `<dt>Urgent and important</dt><dd>${EIS[ev.eisenhower_quadrant]}</dd>` : ''}
        ${ev.core_context_quadrant ? `<dt>Core or context</dt><dd>${QUAD[ev.core_context_quadrant].label}</dd>` : ''}</dl>`;
      foot = '<button class="btn" data-act="w-save" autofocus>Save</button>';
    }

    const dots = steps.map((s, n) => `<i class="${n <= W.step ? 'on' : ''}"></i>`).join('');
    openSheet(`${sheetHead(i.title, `<span class="quiet">Step ${W.step + 1} of ${steps.length}</span>`)}
      <div class="sheet-body"><div class="steps" aria-hidden="true">${dots}</div>${body}</div>
      <div class="sheet-foot">${W.step > 0 ? '<button class="btn soft" data-act="w-back">Back</button>' : ''}${foot}
        <button class="btn text" data-act="w-cancel" style="margin-left:auto">Stop here</button></div>`);
    const reason = $('#wReason');
    if (reason) reason.addEventListener('input', () => (W.a.mandatory_reason = reason.value));
    const due = $('#wDue');
    if (due) due.addEventListener('change', () => (W.a.due_date = due.value || null));
  }

  async function saveWizard(anchor) {
    const a = W.a;
    const eco = wizardSteps().includes('economics');
    const body = {
      importance: a.importance || null, urgency: a.urgency || null, core_context: a.core_context || null, mission_critical: a.mission_critical || null,
      mandatory: Boolean(a.mandatory), mandatory_reason: a.mandatory ? (a.mandatory_reason || '').trim() : '',
      money: eco ? a.money || null : null, time: eco ? a.time || null : null, delegation: eco ? a.delegation || null : null,
      due_date: W.ev?.eisenhower_quadrant === 'schedule' ? a.due_date || null : null,
    };
    try {
      const resp = await api('PATCH', `/api/ideas/${W.id}`, body);
      applyResult(resp, anchor);
      if (!resp.reward) toast('Saved.');
      await refresh();
      openIdea(W.id);
    } catch (err) {
      fail(err);
    }
  }

  // ---------- Drift review ----------
  function openReview(type, id) {
    const item = type === 'idea' ? ideaById(id) : projectById(id);
    const r = { core_context: null, mission_critical: null };
    const draw = () => {
      const opt = (k, v, l) => `<button type="button" class="${r[k] === v ? 'on' : ''}" data-act="r-pick" data-k="${k}" data-v="${v}">${l}</button>`;
      const to = r.core_context && r.mission_critical ? (r.core_context === 'core' ? (r.mission_critical === 'yes' ? 'deploy' : 'invent') : r.mission_critical === 'yes' ? 'manage' : 'offload') : null;
      const needNote = item.core_context_quadrant === 'deploy' && to === 'offload';
      openSheet(`${sheetHead('Quadrant review', '<span class="chip sky">Review</span>')}
        <div class="sheet-body">
          <p class="q">${esc(item.title)}</p>
          <p class="q-help">It has been sitting in ${esc(QUAD[item.core_context_quadrant]?.label || 'no quadrant')} for a while. Things drift over time, and that is normal. Answer the two questions again.</p>
          <div class="mini">
            <div><div style="font-weight:600">Would a customer notice if this were gone?</div><div class="opts">${opt('core_context', 'core', 'Yes')}${opt('core_context', 'context', 'No')}</div></div>
            <div><div style="font-weight:600">Does it hurt within a week if this fails?</div><div class="opts">${opt('mission_critical', 'yes', 'Yes')}${opt('mission_critical', 'no', 'No')}</div></div>
          </div>
          ${to ? `<div class="result" style="margin-top:24px"><div class="r">${QUAD[item.core_context_quadrant]?.label || 'None'} to ${QUAD[to].label}</div><div class="why">${esc(QUAD[to].line)}</div></div>` : ''}
          ${needNote ? '<label class="field"><span>A short note, please</span><input type="text" id="rNote" maxlength="1000" placeholder="Why does it go straight from Deploy to Offload?"><small>Jumping two steps at once is allowed. A note helps future you.</small></label>' : ''}
          <div class="error" id="rErr"></div>
        </div>
        <div class="sheet-foot"><button class="btn" data-act="r-save" ${to ? '' : 'disabled'}>Save review</button><button class="btn text" data-act="close">Later</button></div>`);
    };
    W.review = { type, id, r, draw };
    draw();
  }

  async function saveReview(anchor) {
    const { type, id, r } = W.review;
    const body = { ...r };
    const note = $('#rNote')?.value.trim();
    if (note) body.note = note;
    try {
      const resp = await api('POST', `/api/${type === 'idea' ? 'ideas' : 'projects'}/${id}/review`, body);
      if (resp.reward) resp.reward.message = resp.drift.message;
      else toast(resp.drift.message);
      applyResult(resp, anchor);
      closeSheet();
      await refresh();
    } catch (err) {
      $('#rErr').textContent = err.message;
    }
  }

  // ---------- Projects ----------
  function projectLine(p) {
    if (!p.open) return 'Completed.';
    if (!p.tasks.length) return 'No tasks yet. Add the first small step.';
    if (p.tasks_done === p.tasks.length) return 'All tasks done. Ready to complete.';
    return `${p.tasks_done} of ${p.tasks.length} done`;
  }

  function projectCard(p) {
    const open = S.openProject === p.id;
    const needs = p.open && (p.mandatory || p.core_context_quadrant === 'manage');
    const allDone = p.tasks.length > 0 && p.tasks_done === p.tasks.length;
    const tasks = p.tasks
      .map(
        (t) => `<div class="task ${t.status}" data-flash="task-${t.id}">
        <button class="tick" data-act="task-toggle" data-id="${t.id}" aria-label="${t.status === 'done' ? 'Mark as not done' : 'Mark as done'}: ${esc(t.title)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12l5 5L19 7"/></svg></button>
        <div class="tt">${esc(t.title)}${t.status === 'doing' ? ' <span class="chip sky">In progress</span>' : ''}${t.mandatory ? ` <span class="chip sun">Must happen</span>` : ''}</div>
        <button class="btn text small" data-act="task-menu" data-id="${t.id}" aria-label="Options for ${esc(t.title)}">Options</button>
      </div>`,
      )
      .join('');
    return `<li class="project${open ? ' open' : ''}" data-flash="project-${p.id}">
      <button class="row${needs ? ' needs' : ''}" data-act="toggle-project" data-id="${p.id}" aria-expanded="${open}">
        <div class="body"><div class="t">${esc(p.title)}</div><div class="s">${esc(projectLine(p))}</div>
        ${p.tasks.length ? `<div class="progress" aria-hidden="true"><span style="width:${p.progress}%"></span></div>` : ''}</div>
        ${p.review_due ? '<span class="chip sky">Review</span>' : ''}
        <svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform:rotate(${open ? 90 : 0}deg)"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      ${open ? `<div class="tasks">${tasks || '<p class="quiet">No tasks yet.</p>'}
        ${p.open ? `<form class="add-task" data-pid="${p.id}"><input type="text" maxlength="200" placeholder="Add a small next step" aria-label="New task"><button class="btn soft" type="submit">Add</button></form>` : ''}
        <div class="project-foot">
          ${p.open ? `<button class="btn${allDone ? '' : ' soft'}" data-act="complete-project" data-id="${p.id}">Complete project</button>` : `<button class="btn soft" data-act="reopen-project" data-id="${p.id}">Reopen</button>`}
          ${p.open && S.config.ai_enabled ? `<button class="btn text" data-act="ai-steps" data-id="${p.id}">Suggest next steps</button>` : ''}
          <button class="btn text" data-act="project-more" data-id="${p.id}">Details and options</button>
        </div></div>` : ''}
    </li>`;
  }

  VIEWS.projects = () => {
    const active = realProjects().filter((p) => p.open);
    const done = realProjects().filter((p) => !p.open);
    return `<div class="page">
      <h1>Projects</h1>
      <p class="lead">Small steps. Tick them off one by one.</p>
      <div class="actions" style="margin:-12px 0 32px"><button class="btn" data-act="new-project">New project</button></div>
      ${active.length ? `<ul class="list">${active.map(projectCard).join('')}</ul>` : `<div class="empty"><strong>${MSG.emptyProjects}</strong>Most projects start as an idea. Open an idea and choose "Make it a project".</div>`}
      ${done.length ? `<section><details class="fold"><summary>Completed (${done.length})</summary><div><ul class="list">${done.map(projectCard).join('')}</ul></div></details></section>` : ''}
    </div>`;
  };

  VIEWS.projectsAfter = () => {
    for (const form of $$('.add-task')) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = form.querySelector('input');
        const title = input.value.trim();
        if (!title) return input.focus();
        try {
          const resp = await api('POST', '/api/tasks', { project_id: Number(form.dataset.pid), title });
          applyResult(resp);
          await refresh();
          $(`.add-task[data-pid="${form.dataset.pid}"] input`)?.focus();
        } catch (err) {
          fail(err);
        }
      });
    }
  };

  function projectForm(p = null) {
    const v = p || { title: '', notes: '', core_context: null, mission_critical: null, mandatory: false, mandatory_reason: '' };
    const st = { core_context: v.core_context, mission_critical: v.mission_critical, mandatory: v.mandatory, touched: Boolean(p) };
    const draw = () => {
      const opt = (k, val, l) => `<button type="button" class="${st[k] === val ? 'on' : ''}" data-act="p-pick" data-k="${k}" data-v="${val}">${l}</button>`;
      const title = $('#pTitle')?.value ?? v.title;
      const notes = $('#pNotes')?.value ?? v.notes;
      const reason = $('#pReason')?.value ?? v.mandatory_reason;
      openSheet(`${sheetHead(p ? 'Project details' : 'New project', p && !p.open ? '<span class="chip sage">Completed</span>' : '')}
        <div class="sheet-body">
          <label class="field"><span>Name</span><input type="text" id="pTitle" maxlength="200" value="${esc(title)}" ${p ? '' : 'autofocus'}></label>
          <label class="field"><span>Goal or notes</span><textarea id="pNotes" maxlength="5000" placeholder="What is the result? By when?">${esc(notes)}</textarea></label>
          <div class="mini">
            <div><div style="font-weight:600">Would a customer notice if this were gone?</div><div class="opts">${opt('core_context', 'core', 'Yes')}${opt('core_context', 'context', 'No')}</div></div>
            <div><div style="font-weight:600">Does it hurt within a week if this fails?</div><div class="opts">${opt('mission_critical', 'yes', 'Yes')}${opt('mission_critical', 'no', 'No')}</div></div>
          </div>
          <label class="check" style="margin-top:22px"><input type="checkbox" id="pMandatory" ${st.mandatory ? 'checked' : ''}> It must happen no matter what</label>
          ${st.mandatory ? `<label class="field"><span>Why? (optional)</span><input type="text" id="pReason" maxlength="200" value="${esc(reason)}"></label>` : ''}
          ${p ? `<div class="more">
            ${p.review_due ? `<button class="btn text" data-act="review" data-type="project" data-id="${p.id}">Review the quadrant (it has been 90 days)</button>` : ''}
            <button class="btn text" data-act="delete-project" data-id="${p.id}">Delete project and its tasks</button></div>` : ''}
          <div class="error" id="pErr"></div>
        </div>
        <div class="sheet-foot"><button class="btn" data-act="p-save">${p ? 'Save' : 'Create project'}</button><button class="btn text" data-act="close">Cancel</button></div>`);
      $('#pMandatory').onchange = (e) => {
        st.mandatory = e.target.checked;
        st.touched = true;
        draw();
      };
    };
    W.project = { p, st, draw };
    draw();
  }

  async function saveProject(anchor) {
    const { p, st } = W.project;
    const title = $('#pTitle').value.trim();
    if (!title) return ($('#pErr').textContent = 'Give the project a name.');
    const body = {
      title,
      notes: $('#pNotes').value.trim(),
      core_context: st.core_context,
      mission_critical: st.mission_critical,
      mandatory: st.mandatory,
      mandatory_reason: st.mandatory ? ($('#pReason')?.value || '').trim() : '',
    };
    try {
      const resp = p ? await api('PATCH', `/api/projects/${p.id}`, body) : await api('POST', '/api/projects', body);
      applyResult(resp, anchor);
      closeSheet();
      S.openProject = resp.item.id;
      if (current !== 'projects') location.hash = 'projects';
      await refresh();
    } catch (err) {
      $('#pErr').textContent = err.message;
    }
  }

  async function taskMenu(id) {
    const task = S.projects.flatMap((p) => p.tasks).find((t) => t.id === id);
    modal.innerHTML = `<div class="modal-inner"><h2 id="modalTitle">${esc(task.title)}</h2>
      <div class="choices">
        ${task.status !== 'doing' ? '<button class="choice" data-v="doing">I am working on it<small>Shows it as in progress</small></button>' : '<button class="choice" data-v="todo">Not working on it right now</button>'}
        <button class="choice" data-v="mandatory">${task.mandatory ? 'It does not have to happen after all' : 'It must happen no matter what'}</button>
        <button class="choice" data-v="move">Move to ${S.projects.find((p) => p.id === task.project_id)?.kind === 'inbox' ? 'a project' : 'another place'}</button>
        <button class="choice" data-v="rename">Rename</button>
        <button class="choice" data-v="delete">Delete</button>
      </div><div class="actions"><button class="btn soft" data-v="close">Close</button></div></div>`;
    modal.showModal();
    const v = await new Promise((resolve) => {
      modal.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => resolve(b.dataset.v)));
      modal.oncancel = () => resolve('close');
    });
    if (modal.open) modal.close();
    try {
      if (v === 'doing' || v === 'todo') applyResult(await api('PATCH', `/api/tasks/${id}`, { status: v }));
      if (v === 'mandatory') {
        let reason = '';
        if (!task.mandatory) {
          reason = await prompted('Why must it happen?', 'Reason (optional)', '', { suggestions: REASONS });
          if (reason === null) return;
        }
        applyResult(await api('PATCH', `/api/tasks/${id}`, { mandatory: !task.mandatory, mandatory_reason: reason }));
      }
      if (v === 'move') {
        const places = S.projects.filter((p) => p.open && p.id !== task.project_id);
        if (!places.length) return toast('There is no other place yet. Create a project first.');
        modal.innerHTML = `<div class="modal-inner"><h2 id="modalTitle">Move "${esc(task.title)}"</h2><div class="choices">
          ${places.map((p) => `<button class="choice" data-to="${p.id}">${p.kind === 'inbox' ? 'To-do list' : esc(p.title)}</button>`).join('')}
          </div><div class="actions"><button class="btn soft" data-to="">Cancel</button></div></div>`;
        modal.showModal();
        const to = await new Promise((resolve) => {
          modal.querySelectorAll('[data-to]').forEach((b) => (b.onclick = () => resolve(b.dataset.to)));
          modal.oncancel = () => resolve('');
        });
        if (modal.open) modal.close();
        if (!to) return;
        await api('PATCH', `/api/tasks/${id}`, { project_id: Number(to) });
        toast('Moved.');
      }
      if (v === 'rename') {
        const title = await prompted('Rename task', 'Task', task.title);
        if (!title) return;
        await api('PATCH', `/api/tasks/${id}`, { title });
      }
      if (v === 'delete') {
        if (!(await ask('Delete this task?', task.title, 'Delete', { danger: true }))) return;
        await api('DELETE', `/api/tasks/${id}`);
      }
      if (v !== 'close') await refresh();
    } catch (err) {
      fail(err);
    }
  }

  // ---------- To-do: a simple list, no project needed ----------
  function todoRow(t) {
    return `<div class="task ${t.status}" data-flash="task-${t.id}">
      <button class="tick" data-act="task-toggle" data-id="${t.id}" aria-label="${t.status === 'done' ? 'Mark as not done' : 'Mark as done'}: ${esc(t.title)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12l5 5L19 7"/></svg></button>
      <div class="tt">${esc(t.title)}${t.status === 'doing' ? ' <span class="chip sky">In progress</span>' : ''}${t.mandatory ? ' <span class="chip sun">Must happen</span>' : ''}</div>
      <button class="btn text small" data-act="task-menu" data-id="${t.id}" aria-label="Options for ${esc(t.title)}">Options</button>
    </div>`;
  }

  VIEWS.todo = () => {
    const list = todoList();
    const tasks = list ? list.tasks : [];
    const open = tasks.filter((t) => t.status !== 'done').sort((a, b) => Number(b.mandatory) - Number(a.mandatory) || Number(b.status === 'doing') - Number(a.status === 'doing'));
    const done = tasks.filter((t) => t.status === 'done');
    return `<div class="page">
      <h1>To-do</h1>
      <p class="lead">Little things. No project needed.</p>
      <form class="capture" id="todoForm" autocomplete="off">
        <input type="text" id="todoInput" maxlength="200" placeholder="Add a to-do" aria-label="New to-do">
        <button class="btn" type="submit">Add</button>
      </form>
      ${open.length
        ? `<div class="panel todo-list">${open.map(todoRow).join('')}</div>`
        : `<div class="empty"><strong>${done.length ? 'All done.' : 'Nothing on the list.'}</strong>${done.length ? 'A pause is fine.' : 'Type the first little thing above.'}</div>`}
      ${done.length ? `<section><details class="fold"><summary>Done (${done.length})</summary><div>
        <div class="todo-list">${done.map(todoRow).join('')}</div>
        <div class="actions"><button class="btn soft small" data-act="clear-done">Clear done items</button></div>
      </div></details></section>` : ''}
    </div>`;
  };

  VIEWS.todoAfter = () => {
    const input = $('#todoInput');
    if (!input) return;
    $('#todoForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return input.focus();
      try {
        const list = todoList() || (await api('GET', '/api/todo'));
        const resp = await api('POST', '/api/tasks', { project_id: list.id, title });
        input.value = '';
        applyResult(resp);
        await refresh();
        flash('task', resp.item.id);
        $('#todoInput')?.focus();
      } catch (err) {
        fail(err);
      }
    });
    // Several pasted lines: review them first, each line becomes a to-do.
    input.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text') || '';
      if (text.split(/\r?\n/).filter((l) => l.trim()).length < 2) return;
      e.preventDefault();
      openInbox({ origin: 'paste', text: text.replace(/\r\n/g, '\n'), kind: 'task' }).catch(fail);
    });
    if (!matchMedia('(pointer: coarse)').matches) input.focus();
  };

  // ---------- Guide ----------
  VIEWS.guide = () => {
    const r = S.rules;
    if (!r) {
      api('GET', '/api/rules').then((x) => {
        S.rules = x;
        if (current === 'guide') render();
      }, fail);
      return '<div class="page"><h1>Guide</h1><p class="lead">Loading.</p></div>';
    }
    const eco = r.economics.map((x) => `<tr><td>${TERN[x.money]}</td><td>${TERN[x.time]}</td><td>${TERN[x.delegation]}</td><td>${esc(x.result)}</td></tr>`).join('');
    const cell = (q) => `<button type="button" class="${q}" tabindex="-1" style="cursor:default"${q === 'manage' ? ` title="${esc(MANAGE_TIP)}"` : ''}><div class="k" style="margin-top:0">${QUAD[q].label}</div><div class="d">${esc(QUAD[q].line)}</div></button>`;
    return `<div class="page">
      <h1>How Orbital decides</h1>
      <p class="lead">Three short steps. Things that must happen always come first.</p>
      <details class="fold" open><summary>Step 1: urgent and important</summary><div>
        <p>Every idea gets these two questions first (Eisenhower).</p>
        <table class="guide-table"><thead><tr><th></th><th>Urgent</th><th>Not urgent</th></tr></thead>
        <tbody><tr><th>Important</th><td>Do now</td><td>Schedule</td></tr><tr><th>Not important</th><td>Delegate</td><td>Drop or defer</td></tr></tbody></table>
      </div></details>
      <details class="fold"><summary>Step 2: core or context</summary><div>
        <div class="quad" style="margin:6px 0 16px">${cell('invent')}${cell('deploy')}${cell('offload')}${cell('manage')}</div>
        <p>Core is what customers notice and pay for. Context is everything else that keeps the business alive. Things drift clockwise: what differentiates today is standard in a few years.</p>
        <p class="quiet">Based on Geoffrey Moore, Dealing with Darwin (2005).</p>
        <p>Every ${r.review_after_days} days Orbital quietly offers a quick review of the quadrant.</p>
      </div></details>
      <details class="fold"><summary>Step 3: the economics (optional)</summary><div>
        <p>Money, time and delegation. These nine combinations have a fixed answer. Anything else uses a marked fallback. Skipped for things that must happen and for Manage.</p>
        <table class="guide-table"><thead><tr><th>Money</th><th>Time</th><th>Delegation</th><th>Result</th></tr></thead><tbody>${eco}</tbody></table>
      </div></details>
      <details class="fold"><summary>Things that must happen</summary><div>
        <p>Contracts, legal and security duties, or blockers can be marked as "must happen" on any idea, project or task. They skip the economics, stay at the top and are never hidden, even if the matrix says drop or stop. Context work that is mission-critical (Manage) suggests this automatically.</p>
      </div></details>
      <details class="fold"><summary>Points and streaks</summary><div>
        <table class="guide-table"><tbody>
          <tr><td>Finish a task</td><td>+${r.xp.task_done}</td></tr><tr><td>Finish something that must happen</td><td>+${r.xp.mandatory_done}</td></tr>
          <tr><td>Complete a project</td><td>+${r.xp.project_completed}</td></tr><tr><td>Evaluate an idea</td><td>+${r.xp.evaluate}</td></tr>
          <tr><td>Review a quadrant when it is due</td><td>+${r.xp.quadrant_review}</td></tr><tr><td>Park an evaluated idea</td><td>+${r.xp.park}</td></tr>
          <tr><td>Drop an idea on purpose</td><td>+${r.xp.drop}</td></tr><tr><td>Sort the scratchpad to empty (once a day)</td><td>+${r.xp.inbox_zero}</td></tr>
          <tr><td>New idea (first ${r.idea_create_daily_cap} each day)</td><td>+${r.xp.idea_create}</td></tr></tbody></table>
        <p>One rewarded action a day keeps a streak going. Missing a day simply starts a new one. A pause is fine.</p>
      </div></details>
    </div>`;
  };

  // ---------- Scratch ----------
  const scratch = { content: '', dirty: false, timer: 0, saved: '' };
  const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
  const pad = () => $('#scratch');

  async function loadScratch() {
    const s = await api('GET', '/api/scratch');
    if (!scratch.dirty) scratch.content = s.content;
    scratch.saved = s.updated_at ? `Saved ${timeOf(s.updated_at)}` : '';
    $('#scratchDot').hidden = !scratch.content.trim();
  }

  function setSaved(text) {
    scratch.saved = text;
    const el = $('#scratchSaved');
    if (el) el.textContent = text;
  }

  async function saveScratch() {
    clearTimeout(scratch.timer);
    if (!scratch.dirty) return;
    scratch.dirty = false;
    try {
      const s = await api('PUT', '/api/scratch', { content: scratch.content });
      setSaved(`Saved ${timeOf(s.updated_at)}`);
    } catch (err) {
      scratch.dirty = true;
      setSaved(`Not saved yet. ${err.message}`);
      scratch.timer = setTimeout(saveScratch, 3000);
    }
  }

  VIEWS.scratch = () => `<div class="page wide">
    <h1>Scratch</h1>
    <p class="lead">Type anything. Sort it into ideas and tasks later.</p>
    <textarea id="scratch" spellcheck="false" aria-label="Scratchpad" placeholder="Just start typing.&#10;&#10;- lines starting with a dash become to-dos&#10;questions end with a question mark?&#10;everything else becomes a parked idea"></textarea>
    <div class="scratch-bar">
      <button class="btn" data-act="sort" title="Ctrl or Cmd + Enter">Sort into Orbital</button>
      <button class="btn text" data-act="history">Snapshots and history</button>
      <span class="saved" id="scratchSaved" aria-live="polite"></span>
    </div>
  </div>`;

  VIEWS.scratchAfter = () => {
    const ta = pad();
    ta.value = scratch.content;
    $('#scratchSaved').textContent = scratch.saved;
    ta.addEventListener('input', () => {
      scratch.content = ta.value;
      scratch.dirty = true;
      $('#scratchDot').hidden = !ta.value.trim();
      setSaved('Typing');
      clearTimeout(scratch.timer);
      scratch.timer = setTimeout(saveScratch, 1000);
    });
    ta.addEventListener('blur', saveScratch);
    setTimeout(() => ta.focus(), 0);
  };

  window.addEventListener('beforeunload', () => {
    if (!scratch.dirty) return;
    fetch('/api/scratch', { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Orbital': '1' }, body: JSON.stringify({ content: scratch.content }) });
  });

  document.addEventListener('keydown', (e) => {
    if ($('#shell').hidden) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
      e.preventDefault();
      closeAll();
      if (current !== 'scratch') location.hash = 'scratch';
      else pad()?.focus();
    } else if (mod && e.key === 'Enter' && document.activeElement === pad()) {
      e.preventDefault();
      sortScratch().catch(fail);
    }
  });

  // ---------- Inbox review ----------
  const inbox = { origin: null, lines: null, range: null, items: [], source: 'rules', text: '' };

  function selectedLines() {
    const ta = pad();
    const v = ta.value;
    const lines = v.split('\n');
    const a = ta.selectionStart;
    let b = ta.selectionEnd;
    if (a === b) return { lines, range: [0, lines.length - 1] };
    if (b > a && v[b - 1] === '\n') b -= 1;
    return { lines, range: [v.slice(0, a).split('\n').length - 1, v.slice(0, b).split('\n').length - 1] };
  }

  async function sortScratch() {
    scratch.content = pad().value;
    await saveScratch();
    const { lines, range } = selectedLines();
    const text = lines.slice(range[0], range[1] + 1).join('\n');
    if (!text.trim()) return toast('The scratchpad is empty. Nothing to sort.');
    await openInbox({ origin: 'scratch', text, lines, range });
  }

  async function openInbox({ origin, text, lines = null, range = null, kind = null }) {
    Object.assign(inbox, { origin, text, lines, range, source: 'rules' });
    const r = await api('POST', '/api/inbox/preview', { text });
    let idx = range ? range[0] : 0;
    const src = lines || text.split('\n');
    inbox.items = r.items.map((it) => {
      while (idx < src.length && src[idx].trim() !== it.source) idx += 1;
      const line = idx;
      idx += 1;
      return { ...it, kind: kind || it.kind, notes: kind ? '' : it.notes, on: true, line };
    });
    renderInbox();
  }

  function renderInbox(msg = '') {
    const n = inbox.items.filter((i) => i.on).length;
    openSheet(`${sheetHead('Sort into Orbital', `<span class="quiet">${plural(inbox.items.length, 'line')}</span>`)}
      <div class="sheet-body">
        <p class="q-help">Here is what Orbital would make of it. Nothing is created until you say so.${inbox.origin === 'scratch' && inbox.source === 'rules' ? ' Unticked lines stay in your scratchpad.' : ''}</p>
        <div>${inbox.items
          .map(
            (it, i) => `<div class="inbox-row${it.on ? '' : ' off'}">
            <input type="checkbox" style="width:22px;height:22px;margin-top:12px;accent-color:var(--sun)" data-i="${i}" data-f="on" ${it.on ? 'checked' : ''} aria-label="Include">
            <div class="grow"><input type="text" data-i="${i}" data-f="title" maxlength="200" value="${esc(it.title)}" aria-label="Title">
              <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><select data-i="${i}" data-f="kind" aria-label="Becomes"><option value="idea" ${it.kind === 'idea' ? 'selected' : ''}>Becomes an idea</option><option value="task" ${it.kind === 'task' ? 'selected' : ''}>Becomes a to-do</option></select>
              ${it.notes ? `<span class="quiet small">${esc(it.notes)}</span>` : ''}${it.reason ? `<span class="quiet small">${esc(it.reason)}</span>` : ''}</div></div></div>`,
          )
          .join('')}</div>
        <div class="error" id="inboxMsg">${esc(msg)}</div>
      </div>
      <div class="sheet-foot"><button class="btn" data-act="inbox-accept" ${n ? '' : 'disabled'}>${n === inbox.items.length ? 'Accept all' : `Accept ${n}`}</button>
        ${S.config.ai_enabled && inbox.source === 'rules' ? '<button class="btn soft" data-act="inbox-ai">Ask my local model</button>' : ''}
        <button class="btn text" data-act="close" style="margin-left:auto">Discard</button></div>`);
    const onField = (e) => {
      const f = e.target.dataset.f;
      if (!f) return;
      const it = inbox.items[Number(e.target.dataset.i)];
      it[f] = f === 'on' ? e.target.checked : e.target.value;
      if (f === 'on') renderInbox();
    };
    sheet.querySelectorAll('[data-f]').forEach((el) => el.addEventListener(el.type === 'text' ? 'input' : 'change', onField));
  }

  async function acceptInbox(anchor) {
    const chosen = inbox.items.filter((it) => it.on && String(it.title).trim());
    const body = {
      items: chosen.map((it) => {
        const out = { kind: it.kind, title: String(it.title).trim().slice(0, 200) };
        if (it.notes) out.notes = it.notes;
        if (it.kind === 'idea' && it.core_context && it.mission_critical) Object.assign(out, { core_context: it.core_context, mission_critical: it.mission_critical });
        return out;
      }),
      source_text: inbox.text,
    };
    if (inbox.origin === 'scratch') {
      const keep = new Set(inbox.source === 'rules' ? inbox.items.filter((it) => !it.on).map((it) => it.line) : []);
      const [a, b] = inbox.range;
      const remaining = inbox.lines.filter((l, i) => i < a || i > b || keep.has(i));
      while (remaining.length && !remaining[remaining.length - 1].trim()) remaining.pop();
      body.scratch_content = remaining.join('\n');
    }
    try {
      const resp = await api('POST', '/api/inbox/apply', body);
      closeSheet();
      if (inbox.origin === 'scratch') {
        scratch.content = resp.scratch.content;
        scratch.dirty = false;
        scratch.saved = `Saved ${timeOf(resp.scratch.updated_at)}`;
        $('#scratchDot').hidden = !scratch.content.trim();
      }
      const c = resp.created;
      toast(`Sorted: ${plural(c.ideas.length, 'idea')} and ${plural(c.tasks.length, 'task')}.`);
      applyResult(resp, anchor);
      await refresh();
    } catch (err) {
      $('#inboxMsg').textContent = err.message;
    }
  }

  async function openHistory() {
    const [snaps, sorted] = await Promise.all([api('GET', '/api/scratch/snapshots'), api('GET', '/api/inbox/history')]);
    openSheet(`${sheetHead('Snapshots and history')}
      <div class="sheet-body">
        <h3>Daily snapshots</h3>
        <p class="quiet">One per day, kept for 30 days. Restore one if something got deleted by accident.</p>
        ${snaps.length ? snaps.map((s) => `<div class="panel" style="padding:16px 18px;margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><strong>${esc(new Date(`${s.day}T12:00:00`).toLocaleDateString())}</strong><button class="btn soft small" data-act="restore" data-day="${esc(s.day)}">Restore</button></div><p class="quiet small" style="white-space:pre-wrap;margin:8px 0 0">${esc(s.content.slice(0, 240))}</p></div>`).join('') : '<p class="quiet">No snapshots yet.</p>'}
        <h3 style="margin-top:26px">Sorted lately</h3>
        ${sorted.length ? sorted.map((h) => `<div class="panel" style="padding:16px 18px;margin-bottom:10px"><strong>${esc(new Date(h.sorted_at).toLocaleString())}</strong><p class="quiet small" style="white-space:pre-wrap;margin:6px 0 0">${esc(h.text.slice(0, 240))}</p></div>`).join('') : '<p class="quiet">Nothing sorted in the last 30 days.</p>'}
      </div>`);
  }

  // ---------- Local AI ----------
  async function openSuggest(id, anchor) {
    anchor.disabled = true;
    anchor.textContent = 'Asking your local model';
    try {
      const r = await api('POST', `/api/ai/suggest/${id}`);
      const s = r.suggestion;
      const opt = (map, v, name) => `<select id="${name}"><option value="">Not sure</option>${Object.entries(map).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
      openSheet(`${sheetHead('Suggestion', '<span class="chip sky">Local model</span>')}
        <div class="sheet-body">
          <p class="q-help">Change anything you like. Nothing is saved until you accept.</p>
          <label class="field"><span>Title</span><input type="text" id="sgTitle" maxlength="200" value="${esc(s.title)}"></label>
          <label class="field"><span>Small steps, one per line</span><textarea id="sgTasks" rows="6">${esc(s.tasks.join('\n'))}</textarea></label>
          <label class="check"><input type="checkbox" id="sgProject" ${s.tasks.length ? 'checked' : ''}> Make it a project with these steps</label>
          <label class="field" style="margin-top:16px"><span>Important?</span>${opt({ important: 'Important', not_important: 'Not important' }, s.importance, 'sgImp')}</label>
          <label class="field"><span>Urgent?</span>${opt({ urgent: 'Urgent', not_urgent: 'Not urgent' }, s.urgency, 'sgUrg')}</label>
          <label class="field"><span>Would a customer notice if it were gone?</span>${opt({ core: 'Yes, core', context: 'No, context' }, s.core_context, 'sgCc')}</label>
          <label class="field"><span>Does it hurt within a week if it fails?</span>${opt({ yes: 'Yes', no: 'No' }, s.mission_critical, 'sgMc')}</label>
          ${s.reason ? `<p class="quiet">${esc(s.reason)}</p>` : ''}
          <p class="quiet small">${esc(r.model)}, ${r.latency_ms} ms, prompt ${esc(r.prompt.name)} v${r.prompt.version}</p>
          <div class="error" id="sgErr"></div>
        </div>
        <div class="sheet-foot"><button class="btn" data-act="sg-accept" data-id="${id}">Accept</button><button class="btn text" data-act="open-idea" data-id="${id}">Discard</button></div>`);
    } catch (err) {
      fail(err);
      anchor.disabled = false;
      anchor.textContent = 'Ask my local model for suggestions';
    }
  }

  async function acceptSuggest(id, anchor) {
    const patch = { title: $('#sgTitle').value.trim() };
    for (const [sel, key] of [['#sgImp', 'importance'], ['#sgUrg', 'urgency'], ['#sgCc', 'core_context'], ['#sgMc', 'mission_critical']]) {
      if ($(sel).value) patch[key] = $(sel).value;
    }
    if (!patch.title) return ($('#sgErr').textContent = 'A title is needed.');
    const tasks = $('#sgTasks').value.split('\n').map((t) => t.trim()).filter(Boolean);
    try {
      const resp = await api('PATCH', `/api/ideas/${id}`, patch);
      applyResult(resp, anchor);
      if ($('#sgProject').checked && tasks.length && resp.item.open) {
        const pr = await api('POST', `/api/ideas/${id}/make-project`);
        for (const title of tasks) await api('POST', '/api/tasks', { project_id: pr.item.id, title: title.slice(0, 200) });
        S.openProject = pr.item.id;
        closeSheet();
        location.hash = 'projects';
      } else {
        closeSheet();
      }
      await refresh();
    } catch (err) {
      $('#sgErr').textContent = err.message;
    }
  }

  // ---------- AI: next small steps for a project ----------
  const stepsDraft = { id: null, steps: [] };
  async function openAiSteps(id, btn) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Asking your local model';
    try {
      const r = await api('POST', `/api/ai/project-steps/${id}`);
      stepsDraft.id = id;
      stepsDraft.steps = r.steps.map((title) => ({ title, on: true }));
      const p = projectById(id);
      openSheet(`${sheetHead('Next small steps', '<span class="chip sky">Local model</span>')}
        <div class="sheet-body">
          <p class="q">${esc(p.title)}</p>
          <p class="q-help">Untick what does not fit and change the wording if you like. Nothing is added until you accept.</p>
          ${stepsDraft.steps.map((s, i) => `<div class="inbox-row"><input type="checkbox" data-step-on="${i}" checked style="width:22px;height:22px;margin-top:12px;accent-color:var(--sun)" aria-label="Include">
            <div class="grow"><input type="text" data-step-title="${i}" maxlength="200" value="${esc(s.title)}" aria-label="Step"></div></div>`).join('')}
          ${r.reason ? `<p class="quiet">${esc(r.reason)}</p>` : ''}
          <p class="quiet small">${esc(r.model)}, ${r.latency_ms} ms</p>
          <div class="error" id="stepsErr"></div>
        </div>
        <div class="sheet-foot"><button class="btn" data-act="steps-accept" data-id="${id}">Add these steps</button><button class="btn text" data-act="close">Discard</button></div>`);
      sheet.querySelectorAll('[data-step-on]').forEach((el) => el.addEventListener('change', () => (stepsDraft.steps[el.dataset.stepOn].on = el.checked)));
      sheet.querySelectorAll('[data-step-title]').forEach((el) => el.addEventListener('input', () => (stepsDraft.steps[el.dataset.stepTitle].title = el.value)));
    } catch (err) {
      fail(err);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  async function acceptAiSteps(id, btn) {
    const chosen = stepsDraft.steps.filter((s) => s.on && s.title.trim());
    if (!chosen.length) return ($('#stepsErr').textContent = 'Nothing ticked. Use Discard to leave the project as it is.');
    btn.disabled = true;
    try {
      for (const s of chosen) await api('POST', '/api/tasks', { project_id: id, title: s.title.trim().slice(0, 200) });
      closeSheet();
      toast(`Added ${plural(chosen.length, 'step')}.`);
      S.openProject = id;
      await refresh();
    } catch (err) {
      $('#stepsErr').textContent = err.message;
      btn.disabled = false;
    }
  }

  // ---------- Settings ----------
  VIEWS.settings = () => {
    const g = S.game;
    const admin = S.user.role === 'admin';
    return `<div class="page">
      <h1>Settings</h1>
      <p class="lead">Make Orbital comfortable for you.</p>
      <p class="settings-guide"><a href="#guide">How Orbital decides (the guide)</a></p>
      <div class="panel"><h2>You</h2>
        <form id="profileForm"><label class="field"><span>Your name</span><input type="text" id="setName" maxlength="80" value="${esc(S.user.display_name)}"></label>
        <button class="btn soft" type="submit">Save name</button></form>
        <form id="pwForm" style="margin-top:26px"><h3>Change password</h3>
          <label class="field"><span>Current password</span><input type="password" id="pwOld" autocomplete="current-password"></label>
          <label class="field"><span>New password</span><input type="password" id="pwNew" autocomplete="new-password"><small>At least 8 characters. Other devices get signed out.</small></label>
          <button class="btn soft" type="submit">Change password</button><div class="error" id="pwMsg"></div></form>
        <div class="actions"><button class="btn line" data-act="logout">Sign out</button></div>
      </div>
      <div class="panel"><h2>Your companion</h2>
        <form id="companionForm"><label class="field"><span>Name</span><input type="text" id="setCompanion" maxlength="24" value="${esc(cname())}"></label>
        <div class="swatches" role="radiogroup" aria-label="Colour">${Object.entries(COMPANION_COLORS)
          .map(([id, c]) => `<button type="button" role="radio" aria-checked="${g.settings.companion_color === id}" data-color="${id}" class="swatch${(g.settings.companion_color || 'moon') === id ? ' on' : ''}"><span style="background:${c.hex}"></span>${c.label}</button>`)
          .join('')}</div>
        <div class="actions"><button class="btn soft" type="submit">Save</button><button class="btn text" type="button" data-act="rerun-setup">Run the setup again</button></div></form>
      </div>
      <div class="panel"><h2>Comfort</h2>
        <label class="check"><input type="checkbox" id="setEffects" ${g.settings.effects !== false ? 'checked' : ''}> Celebrations (${esc(cname())} moves, a little confetti)</label>
        <label class="check"><input type="checkbox" id="setSound" ${g.settings.sound ? 'checked' : ''}> A soft sound when something is done</label>
        <p class="quiet small" style="margin-top:8px">If your system asks for reduced motion, Orbital stays still anyway.</p>
      </div>
      <div class="panel"><h2>Backup</h2>
        <p>Save everything of yours as a file, or load a file from Orbital or the old Planer.</p>
        <div class="actions" style="margin-top:8px"><button class="btn soft" data-act="export">Download my data</button><button class="btn soft" data-act="import">Load a file</button><input type="file" id="importFile" accept=".json,application/json" hidden></div>
        <label class="check" style="margin-top:12px"><input type="checkbox" id="importReplace"> Replace my current data when loading (restore)</label>
        <div class="error" id="importMsg"></div>
      </div>
      ${S.config.ai_enabled ? `<div class="panel" id="aiPanel"><h2>Local AI</h2><p class="quiet">Loading.</p></div>` : ''}
      ${admin ? '<div class="panel" id="peoplePanel"><h2>People</h2><p class="quiet">Loading.</p></div>' : ''}
    </div>`;
  };

  VIEWS.settingsAfter = () => {
    $('#profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api('PATCH', '/api/auth/profile', { display_name: $('#setName').value.trim() });
        S.user = r.user;
        $('#whoLabel').textContent = S.user.display_name || S.user.username;
        toast('Name saved.');
      } catch (err) {
        fail(err);
      }
    });
    let pickedColor = S.game.settings.companion_color || 'moon';
    $$('#companionForm [data-color]').forEach((b) =>
      b.addEventListener('click', () => {
        pickedColor = b.dataset.color;
        $$('#companionForm [data-color]').forEach((x) => {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-checked', String(x === b));
        });
        applyCompanion(COMPANION_COLORS[pickedColor].hex);
      }),
    );
    $('#companionForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        S.game = await api('PATCH', '/api/gamification', { settings: { companion_name: $('#setCompanion').value.trim() || 'Orbit', companion_color: pickedColor } });
        renderStatus();
        toast(`Saved. Say hi to ${cname()}.`);
      } catch (err) {
        fail(err);
      }
    });
    $('#pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('POST', '/api/auth/password', { current_password: $('#pwOld').value, new_password: $('#pwNew').value });
        $('#pwOld').value = '';
        $('#pwNew').value = '';
        $('#pwMsg').innerHTML = '<span class="ok">Password changed.</span>';
      } catch (err) {
        $('#pwMsg').textContent = err.message;
      }
    });
    for (const [sel, key] of [['#setEffects', 'effects'], ['#setSound', 'sound']]) {
      $(sel).addEventListener('change', async (e) => {
        try {
          S.game = await api('PATCH', '/api/gamification', { settings: { [key]: e.target.checked } });
          renderStatus();
          if (key === 'sound' && e.target.checked) chime();
        } catch (err) {
          fail(err);
        }
      });
    }
    $('#importFile').addEventListener('change', importFile);
    if (S.config.ai_enabled) renderAiPanel().catch(fail);
    if (S.user.role === 'admin') renderPeople().catch(fail);
  };

  async function importFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const replace = $('#importReplace').checked;
    if (replace && !(await ask('Replace your data?', 'Your current ideas, projects and points are replaced by the file. Other people are not affected.', 'Replace'))) return;
    try {
      const data = JSON.parse(await file.text());
      const r = await api('POST', `/api/import?mode=${replace ? 'replace' : 'merge'}`, data);
      S.home = null;
      await loadScratch();
      await refresh();
      $('#importMsg').innerHTML = `<span class="ok">Loaded ${plural(r.imported.ideas, 'idea')}, ${plural(r.imported.projects, 'project')} and ${plural(r.imported.tasks, 'task')}.</span>`;
    } catch (err) {
      $('#importMsg').textContent = err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message;
    }
  }

  async function renderAiPanel() {
    const s = await api('GET', '/api/ai/settings');
    const admin = S.user.role === 'admin';
    const field = (id, label, value, extra = '') => `<label class="field"><span>${label}</span><input type="text" id="${id}" value="${esc(value)}" ${admin ? '' : 'disabled'} ${extra}></label>`;
    $('#aiPanel').innerHTML = `<h2>Local AI</h2>
      <p>Orbital only talks to this address, and only when you press a button.</p>
      <p class="quiet" style="overflow-wrap:anywhere">${esc(s.endpoint || 'No valid address yet')}</p>
      ${field('aiBase', 'Server address', s.base_url, 'placeholder="http://host.docker.internal:11434/v1"')}
      <label class="field"><span>Model</span>
        ${admin ? `<div style="display:flex;gap:8px"><select id="aiModel" style="flex:1"><option value="${esc(s.model)}">${esc(s.model)}</option></select><button class="btn soft small" type="button" data-act="ai-models">Refresh list</button></div>` : `<input type="text" id="aiModel" value="${esc(s.model)}" disabled>`}
        <small id="aiModelsHint">The list comes from your AI server.</small></label>
      ${admin ? `<label class="field"><span>API key (optional)</span><input type="password" id="aiKey" autocomplete="off" placeholder="${s.api_key_set ? 'Set. Leave empty to keep it.' : 'Not needed for Ollama or LM Studio'}"></label>` : ''}
      ${field('aiTimeout', 'Timeout in milliseconds', s.timeout_ms, 'inputmode="numeric"')}
      ${field('aiTokens', 'Max tokens', s.max_tokens, 'inputmode="numeric"')}
      ${admin ? '' : '<p class="quiet small">Only admins can change these.</p>'}
      <div class="actions" style="margin-top:4px">${admin ? '<button class="btn soft" data-act="ai-save">Save</button>' : ''}<button class="btn soft" data-act="ai-test">Test the connection</button></div>
      <div class="error" id="aiMsg"></div>`;
    if (admin) loadModels(s.model).catch(() => {});
  }

  async function loadModels(currentModel) {
    const sel = $('#aiModel');
    if (!sel) return;
    try {
      const r = await api('GET', '/api/ai/models');
      const list = r.models.includes(currentModel) ? r.models : [currentModel, ...r.models];
      sel.innerHTML = list.map((m) => `<option value="${esc(m)}" ${m === currentModel ? 'selected' : ''}>${esc(m)}</option>`).join('');
      $('#aiModelsHint').textContent = r.models.length ? `${plural(r.models.length, 'model')} available.` : 'The server has no models yet. With Ollama: ollama pull llama3.2:3b';
    } catch (err) {
      $('#aiModelsHint').textContent = `Could not load the model list. ${err.message}`;
    }
  }

  async function renderPeople() {
    const users = await api('GET', '/api/users');
    $('#peoplePanel').innerHTML = `<h2>People</h2>
      <p>Everyone gets their own private orbit. Nobody sees anyone else's ideas.</p>
      <div>${users
        .map(
          (u) => `<div class="person"><div class="grow"><strong>${esc(u.display_name || u.username)}</strong> <span class="quiet">@${esc(u.username)}</span><br>
          <span class="quiet small">${u.role === 'admin' ? 'Admin' : 'Member'}${u.disabled ? ', paused' : ''}${u.id === S.user.id ? ', that is you' : ''}</span></div>
          ${u.id === S.user.id ? '' : `<button class="btn text small" data-act="user-reset" data-id="${u.id}">New password</button>
            <button class="btn text small" data-act="user-role" data-id="${u.id}" data-role="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'Make member' : 'Make admin'}</button>
            <button class="btn text small" data-act="user-pause" data-id="${u.id}" data-v="${u.disabled ? 'false' : 'true'}">${u.disabled ? 'Allow again' : 'Pause'}</button>
            <button class="btn text small" data-act="user-delete" data-id="${u.id}" data-name="${esc(u.username)}">Delete</button>`}</div>`,
        )
        .join('')}</div>
      <form id="addUser" style="margin-top:22px"><h3>Add a person</h3>
        <label class="field"><span>Name</span><input type="text" name="display_name" maxlength="80"></label>
        <label class="field"><span>Username</span><input type="text" name="username" maxlength="32" autocapitalize="none" spellcheck="false"></label>
        <label class="field"><span>First password</span><input type="password" name="password" autocomplete="new-password"><small>Share it with them in person. They can change it in Settings.</small></label>
        <button class="btn soft" type="submit">Add person</button><div class="error" id="addUserMsg"></div></form>`;
    $('#addUser').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('POST', '/api/users', Object.fromEntries(new FormData(e.target)));
        toast('Person added.');
        await renderPeople();
      } catch (err) {
        $('#addUserMsg').textContent = err.message;
      }
    });
  }

  // ---------- Home: entry to the 3D house ----------
  const HOME_ROOMS = [
    { id: 'living', name: 'Living room', text: 'Sofa, plants, a lamp. Hang out with your companion.', icon: '<path d="M4 13v5h16v-5"/><path d="M6 13V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><path d="M4 13a2 2 0 0 1 4 0v2h8v-2a2 2 0 0 1 4 0"/>' },
    { id: 'workshop', name: 'Workshop', text: 'Workbench, printer, the homelab rack.', icon: '<path d="M14 6l4 4-8 8H6v-4z"/><path d="M13 7l4 4"/>' },
    { id: 'garden', name: 'Garden', text: 'Lawn, hammock, a pond. Mow it with a swipe.', icon: '<path d="M12 21v-7"/><path d="M12 14c-4 0-6-3-6-6 3 0 6 2 6 6z"/><path d="M12 12c0-4 3-7 6-7 0 4-2 7-6 7z"/><path d="M4 21h16"/>' },
  ];
  VIEWS.home = () => `<div class="page">
    <h1>Your house</h1>
    <p class="lead">A small house that fills up as you finish things. Just for fun. Nothing here costs you anything but points you already earned.</p>
    <div class="home-rooms">${HOME_ROOMS.map((r) => `<button class="home-room" data-act="room" data-room="${r.id}">
      <span class="ico"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${r.icon}</svg></span>
      <span><span class="t">${r.name}</span><br><span class="s">${r.text}</span></span></button>`).join('')}</div>
    <p class="quiet" style="margin-top:22px">Tip: tapping ${esc(cname())} or your level opens the living room from anywhere.</p>
  </div>`;

  // ---------- 3D living room ----------
  let roomOpen = false;
  async function openLivingRoom(room = 'living') {
    if (roomOpen) return;
    if (!S.config.home_enabled) return toast('The home is switched off on this server.');
    roomOpen = true;
    try {
      const mod = await import('./room.js');
      if (!mod.supported()) {
        roomOpen = false;
        toast('This device cannot show 3D, so the house is not available here. Everything else works.');
        return;
      }
      S.home = await api('GET', '/api/home');
      mod.openRoom({
        api,
        home: S.home,
        room,
        companion: { name: cname(), color: ccolor() },
        aiEnabled: Boolean(S.config.ai_enabled),
        effects: effectsOn(),
        message: S.game?.alert_count ? MSG.alert : null,
        toast,
        celebrate: (m) => {
          celebrate(m);
          chime();
        },
        onState: (state, game) => {
          S.home.state = state;
          if (game) S.game = game;
          renderStatus();
        },
        onClose: () => {
          roomOpen = false;
          render();
        },
      });
    } catch (err) {
      roomOpen = false;
      fail(err);
    }
  }

  // ---------- Actions (one delegated handler) ----------
  async function act(btn, e) {
    const a = btn.dataset.act;
    const id = Number(btn.dataset.id);
    switch (a) {
      case 'close': return closeSheet();
      case 'room': return openLivingRoom(btn.dataset.room || 'living');
      case 'rerun-setup': return showOnboarding();
      case 'open-idea': return openIdea(id);
      case 'open-project': S.openProject = id; closeSheet(); if (current !== 'projects') location.hash = 'projects'; else render(); return;
      case 'open-task':
        if (projectById(id)?.kind === 'inbox') {
          location.hash = 'todo';
          return;
        }
        S.openProject = id;
        location.hash = 'projects';
        return;
      case 'clear-done': {
        const list = todoList();
        const doneItems = list ? list.tasks.filter((t) => t.status === 'done') : [];
        if (!doneItems.length) return;
        if (!(await ask('Clear done to-dos?', `${plural(doneItems.length, 'done item')} will be removed from the list. Your points stay.`, 'Clear'))) return;
        for (const t of doneItems) await api('DELETE', `/api/tasks/${t.id}`);
        return refresh();
      }
      case 'quad': S.quadFilter = btn.dataset.q; S.ideaFilter = 'open'; location.hash = 'ideas'; return;
      case 'quad-clear': S.quadFilter = ''; return render();
      case 'ifilter': S.ideaFilter = btn.dataset.f; return render();
      case 'evaluate': return startWizard(id);
      case 'w-pick': {
        const k = btn.dataset.k;
        const v = btn.dataset.v;
        if (k === 'mandatory') {
          W.a.mandatory = v === 'yes';
          W.a.mandatoryTouched = true;
          if (!W.a.mandatory) {
            W.step += 1;
          }
          return renderWizard();
        }
        W.a[k] = v;
        W.step += 1;
        return renderWizard();
      }
      case 'w-reason': W.a.mandatory_reason = btn.dataset.v; return renderWizard();
      case 'w-eco': W.a[btn.dataset.k] = W.a[btn.dataset.k] === btn.dataset.v ? null : btn.dataset.v; return renderWizard();
      case 'w-next': W.step += 1; return renderWizard();
      case 'w-back': W.step = Math.max(0, W.step - 1); return renderWizard();
      case 'w-cancel': return openIdea(W.id);
      case 'w-save': return saveWizard(btn);
      case 'make-project': {
        const resp = await api('POST', `/api/ideas/${id}/make-project`);
        applyResult(resp, btn);
        toast('Now a project. Add the first small step.');
        closeSheet();
        S.openProject = resp.item.id;
        await loadAll();
        if (current !== 'projects') location.hash = 'projects';
        else render();
        return;
      }
      case 'idea-status': {
        const resp = await api('PATCH', `/api/ideas/${id}`, { status: btn.dataset.s });
        applyResult(resp, btn);
        if (!resp.reward) toast({ parked: 'Parked again.', decided: 'Done.', dropped: 'Dropped.' }[btn.dataset.s] || 'Saved.');
        await refresh();
        return openIdea(id);
      }
      case 'delete-idea': {
        const i = ideaById(id);
        if (!(await ask('Delete this idea?', `"${i.title}" will be gone for good. Dropping it keeps a record instead.`, 'Delete', { danger: true }))) return;
        await api('DELETE', `/api/ideas/${id}`);
        closeSheet();
        return refresh();
      }
      case 'review': return openReview(btn.dataset.type, id);
      case 'r-pick': W.review.r[btn.dataset.k] = btn.dataset.v; return W.review.draw();
      case 'r-save': return saveReview(btn);
      case 'suggest': return openSuggest(id, btn);
      case 'sg-accept': return acceptSuggest(id, btn);
      case 'today-done': {
        const resp = await api('PATCH', `/api/tasks/${id}`, { status: 'done' });
        applyResult(resp, btn);
        if (!resp.reward) toast('Done.');
        return refresh();
      }
      case 'today-skip': S.skipped.add(id); return render();
      case 'digest': {
        btn.disabled = true;
        btn.textContent = 'Writing';
        try {
          const r = await api('POST', '/api/ai/digest');
          $('#digestOut').innerHTML = `<p style="white-space:pre-wrap">${esc(r.text)}</p><p class="quiet small">${esc(r.from)} to ${esc(r.to)}, ${esc(r.model)}</p>`;
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Write my weekly digest';
          fail(err);
        }
        return;
      }
      case 'toggle-project': S.openProject = S.openProject === id ? null : id; return render();
      case 'new-project': return projectForm();
      case 'project-more': return projectForm(projectById(id));
      case 'p-pick': {
        const st = W.project.st;
        st[btn.dataset.k] = st[btn.dataset.k] === btn.dataset.v ? null : btn.dataset.v;
        if (st.core_context === 'context' && st.mission_critical === 'yes' && !st.touched) st.mandatory = true;
        return W.project.draw();
      }
      case 'p-save': return saveProject(btn);
      case 'delete-project': {
        const p = projectById(id);
        if (!(await ask('Delete this project?', `"${p.title}" and its ${plural(p.tasks.length, 'task')} will be gone for good.`, 'Delete', { danger: true }))) return;
        await api('DELETE', `/api/projects/${id}`);
        closeSheet();
        return refresh();
      }
      case 'complete-project':
      case 'reopen-project': {
        const resp = await api('PATCH', `/api/projects/${id}`, { status: a === 'complete-project' ? 'completed' : 'active' });
        applyResult(resp, btn);
        if (a === 'complete-project') S.openProject = null;
        return refresh();
      }
      case 'task-toggle': {
        const task = S.projects.flatMap((p) => p.tasks).find((t) => t.id === id);
        const resp = await api('PATCH', `/api/tasks/${id}`, { status: task.status === 'done' ? 'todo' : 'done' });
        applyResult(resp, btn);
        await refresh();
        return flash('task', id);
      }
      case 'task-menu': return taskMenu(id);
      case 'ai-steps': return openAiSteps(id, btn);
      case 'steps-accept': return acceptAiSteps(id, btn);
      case 'sort': return sortScratch();
      case 'history': return openHistory();
      case 'restore': {
        const day = btn.dataset.day;
        if (!(await ask('Restore this snapshot?', 'Your scratchpad gets the text from that day. Today\'s text is kept as a snapshot.', 'Restore'))) return;
        scratch.content = pad()?.value ?? scratch.content;
        await saveScratch();
        const s = await api('POST', `/api/scratch/snapshots/${day}/restore`);
        scratch.content = s.content;
        scratch.saved = `Restored, saved ${timeOf(s.updated_at)}`;
        closeSheet();
        return render();
      }
      case 'inbox-accept': return acceptInbox(btn);
      case 'inbox-ai': {
        btn.disabled = true;
        btn.textContent = 'Asking your local model';
        try {
          const r = await api('POST', '/api/ai/inbox', { text: inbox.text });
          inbox.items = r.items.map((it) => ({ ...it, on: true, line: null }));
          inbox.source = 'ai';
          return renderInbox();
        } catch (err) {
          return renderInbox(err.message);
        }
      }
      case 'logout':
        await api('POST', '/api/auth/logout');
        S.user = null;
        location.hash = '';
        return showAuth();
      case 'export': {
        const data = await api('GET', '/api/export');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `orbital_${S.user.username}_${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        return;
      }
      case 'import': return $('#importFile').click();
      case 'ai-save': {
        const body = { base_url: $('#aiBase').value.trim(), model: $('#aiModel').value.trim(), timeout_ms: Number($('#aiTimeout').value), max_tokens: Number($('#aiTokens').value) };
        if ($('#aiKey')?.value.trim()) body.api_key = $('#aiKey').value.trim();
        try {
          await api('PATCH', '/api/ai/settings', body);
          await renderAiPanel();
          $('#aiMsg').innerHTML = '<span class="ok">Saved.</span>';
        } catch (err) {
          $('#aiMsg').textContent = err.message;
        }
        return;
      }
      case 'ai-models': return loadModels($('#aiModel').value);
      case 'ai-test': {
        $('#aiMsg').textContent = 'Testing.';
        try {
          const r = await api('POST', '/api/ai/test');
          $('#aiMsg').innerHTML = `<span class="ok">It works. ${esc(r.model)} answered in ${r.latency_ms} ms.</span>`;
        } catch (err) {
          $('#aiMsg').textContent = err.message;
        }
        return;
      }
      case 'user-reset': {
        const pw = await prompted('Set a new password', 'New password (at least 8 characters)');
        if (!pw) return;
        await api('PATCH', `/api/users/${id}`, { password: pw });
        toast('Password set. They are signed out everywhere.');
        return renderPeople();
      }
      case 'user-role': await api('PATCH', `/api/users/${id}`, { role: btn.dataset.role }); return renderPeople();
      case 'user-pause': await api('PATCH', `/api/users/${id}`, { disabled: btn.dataset.v === 'true' }); return renderPeople();
      case 'user-delete': {
        if (!(await ask(`Delete @${btn.dataset.name}?`, 'Their account and all of their ideas, projects and points are deleted for good.', 'Delete', { danger: true }))) return;
        await api('DELETE', `/api/users/${id}`);
        return renderPeople();
      }
      default:
        void e;
    }
  }

  for (const root of [document.body]) {
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.disabled) return;
      if (btn.tagName === 'A') return;
      e.preventDefault();
      act(btn, e).catch(fail);
    });
  }
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) closeSheet();
  });

  // ---------- Start ----------
  async function start() {
    $('#orbitSlot').innerHTML = orbitSvg(64);
    try {
      S.config = await api('GET', '/api/config');
      $('.nav a[data-tab="home"]').hidden = !S.config.home_enabled;
      const status = await api('GET', '/api/auth/status');
      if (!status.user) return showAuth();
      S.user = status.user;
      await enterApp();
    } catch (err) {
      fail(err);
    }
  }
  start();
})();
