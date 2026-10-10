'use strict';

// Home (phase 2, behind HOME_ENABLED). A cosmetic trophy room. Never nags.
// Items are drawn by the frontend from simple isometric primitives:
//   box:  { t:'box', x, y, z, w, d, h, c }   (units are slot-local, 1 = one tile)
//   ball: { t:'ball', x, y, z, r, c }
//   pole: { t:'pole', x, y, z, h, c }

const { daysBetween, dayOf } = require('./gamification');

const ROOMS = [
  { id: 'living', name: 'Living room', slots: ['living-1', 'living-2', 'living-3', 'living-4', 'living-5'] },
  { id: 'workshop', name: 'Workshop', slots: ['workshop-1', 'workshop-2', 'workshop-3', 'workshop-4', 'workshop-5'] },
  { id: 'garden', name: 'Garden', slots: ['garden-1', 'garden-2', 'garden-3', 'garden-4', 'garden-5', 'garden-6'] },
];

const box = (x, y, z, w, d, h, c) => ({ t: 'box', x, y, z, w, d, h, c });
const ball = (x, y, z, r, c) => ({ t: 'ball', x, y, z, r, c });
const pole = (x, y, z, h, c) => ({ t: 'pole', x, y, z, h, c });

const CATALOGUE = [
  // Living room
  { id: 'rug', name: 'Round rug', room: 'living', price: 40, parts: [box(0.1, 0.1, 0, 0.8, 0.8, 0.03, '#7c3aed')] },
  { id: 'sofa', name: 'Sofa', room: 'living', price: 120, parts: [box(0.1, 0.3, 0, 0.8, 0.5, 0.25, '#3b82f6'), box(0.1, 0.7, 0.25, 0.8, 0.12, 0.25, '#2563eb')] },
  { id: 'armchair', name: 'Armchair', room: 'living', price: 80, parts: [box(0.25, 0.3, 0, 0.5, 0.5, 0.22, '#f97316'), box(0.25, 0.68, 0.22, 0.5, 0.12, 0.25, '#ea580c')] },
  { id: 'floor-lamp', name: 'Floor lamp', room: 'living', price: 50, parts: [pole(0.5, 0.5, 0, 0.8, '#8b93a7'), ball(0.5, 0.5, 0.85, 0.16, '#fde68a')] },
  { id: 'bookshelf', name: 'Bookshelf', room: 'living', price: 90, parts: [box(0.15, 0.6, 0, 0.7, 0.3, 0.9, '#92400e'), box(0.2, 0.58, 0.55, 0.6, 0.05, 0.12, '#f87171'), box(0.2, 0.58, 0.25, 0.6, 0.05, 0.12, '#4ade80')] },
  { id: 'monstera', name: 'Monstera', room: 'living', price: 35, parts: [box(0.35, 0.35, 0, 0.3, 0.3, 0.25, '#b45309'), ball(0.5, 0.5, 0.5, 0.28, '#16a34a')] },
  { id: 'tv', name: 'Small TV', room: 'living', price: 110, parts: [box(0.3, 0.4, 0, 0.4, 0.3, 0.3, '#262b36'), box(0.15, 0.5, 0.3, 0.7, 0.06, 0.4, '#0f1115')] },
  { id: 'aquarium', name: 'Aquarium', room: 'living', price: 140, parts: [box(0.2, 0.3, 0, 0.6, 0.4, 0.3, '#262b36'), box(0.2, 0.3, 0.3, 0.6, 0.4, 0.35, '#38bdf8')] },
  { id: 'telescope', name: 'Telescope for Orbit', room: 'living', price: 200, parts: [pole(0.4, 0.4, 0, 0.5, '#8b93a7'), pole(0.6, 0.4, 0, 0.5, '#8b93a7'), pole(0.5, 0.65, 0, 0.5, '#8b93a7'), box(0.35, 0.35, 0.5, 0.18, 0.5, 0.18, '#e8eaf0')] },

  // Workshop
  { id: 'workbench', name: 'Workbench', room: 'workshop', price: 100, parts: [box(0.05, 0.3, 0.4, 0.9, 0.5, 0.08, '#a16207'), pole(0.1, 0.35, 0, 0.4, '#713f12'), pole(0.9, 0.35, 0, 0.4, '#713f12'), pole(0.1, 0.75, 0, 0.4, '#713f12'), pole(0.9, 0.75, 0, 0.4, '#713f12')] },
  { id: 'toolbox', name: 'Toolbox', room: 'workshop', price: 45, parts: [box(0.3, 0.35, 0, 0.4, 0.3, 0.25, '#dc2626'), box(0.42, 0.45, 0.25, 0.16, 0.1, 0.06, '#262b36')] },
  { id: 'pegboard', name: 'Pegboard', room: 'workshop', price: 55, parts: [box(0.1, 0.85, 0.3, 0.8, 0.05, 0.6, '#d6d3d1'), box(0.25, 0.83, 0.6, 0.1, 0.03, 0.2, '#8b93a7'), box(0.55, 0.83, 0.55, 0.2, 0.03, 0.08, '#fbbf24')] },
  { id: '3d-printer', name: '3D printer', room: 'workshop', price: 160, parts: [box(0.25, 0.3, 0, 0.5, 0.5, 0.08, '#262b36'), pole(0.27, 0.32, 0.08, 0.5, '#8b93a7'), pole(0.73, 0.32, 0.08, 0.5, '#8b93a7'), box(0.25, 0.3, 0.55, 0.5, 0.5, 0.06, '#4ade80')] },
  { id: 'server-rack', name: 'Homelab rack', room: 'workshop', price: 180, parts: [box(0.25, 0.3, 0, 0.5, 0.5, 0.95, '#1f2937'), box(0.28, 0.28, 0.75, 0.44, 0.03, 0.05, '#4ade80'), box(0.28, 0.28, 0.55, 0.44, 0.03, 0.05, '#4ade80'), box(0.28, 0.28, 0.35, 0.44, 0.03, 0.05, '#fbbf24')] },
  { id: 'stool', name: 'Stool', room: 'workshop', price: 25, parts: [pole(0.5, 0.5, 0, 0.3, '#713f12'), box(0.35, 0.35, 0.3, 0.3, 0.3, 0.05, '#a16207')] },
  { id: 'desk-lamp', name: 'Desk lamp', room: 'workshop', price: 30, parts: [box(0.4, 0.4, 0, 0.2, 0.2, 0.04, '#262b36'), pole(0.5, 0.5, 0.04, 0.45, '#8b93a7'), ball(0.5, 0.5, 0.52, 0.1, '#fde68a')] },
  { id: 'bike', name: 'Bike on a stand', room: 'workshop', price: 130, parts: [ball(0.25, 0.5, 0.2, 0.18, '#0f1115'), ball(0.75, 0.5, 0.2, 0.18, '#0f1115'), box(0.25, 0.47, 0.3, 0.5, 0.06, 0.06, '#f87171')] },

  // Garden
  { id: 'hammock', name: 'Hammock', room: 'garden', price: 120, parts: [pole(0.1, 0.5, 0, 0.6, '#713f12'), pole(0.9, 0.5, 0, 0.6, '#713f12'), box(0.1, 0.4, 0.3, 0.8, 0.2, 0.05, '#fbbf24')] },
  { id: 'car', name: 'A small car', room: 'garden', price: 300, parts: [box(0.05, 0.2, 0.1, 0.9, 0.6, 0.25, '#f87171'), box(0.25, 0.25, 0.35, 0.5, 0.5, 0.2, '#93c5fd'), ball(0.2, 0.2, 0.08, 0.1, '#0f1115'), ball(0.8, 0.2, 0.08, 0.1, '#0f1115')] },
  { id: 'tree', name: 'Apple tree', room: 'garden', price: 90, parts: [pole(0.5, 0.5, 0, 0.5, '#713f12'), ball(0.5, 0.5, 0.75, 0.35, '#15803d'), ball(0.4, 0.4, 0.75, 0.05, '#f87171'), ball(0.6, 0.45, 0.85, 0.05, '#f87171')] },
  { id: 'flower-bed', name: 'Flower bed', room: 'garden', price: 40, parts: [box(0.1, 0.3, 0, 0.8, 0.4, 0.1, '#78350f'), ball(0.25, 0.5, 0.18, 0.08, '#f472b6'), ball(0.5, 0.5, 0.18, 0.08, '#fbbf24'), ball(0.75, 0.5, 0.18, 0.08, '#a78bfa')] },
  { id: 'bench', name: 'Garden bench', room: 'garden', price: 60, parts: [box(0.1, 0.4, 0.2, 0.8, 0.3, 0.05, '#a16207'), box(0.1, 0.68, 0.25, 0.8, 0.05, 0.25, '#a16207'), pole(0.15, 0.45, 0, 0.2, '#262b36'), pole(0.85, 0.45, 0, 0.2, '#262b36')] },
  { id: 'pond', name: 'Small pond', room: 'garden', price: 110, parts: [box(0.15, 0.15, 0, 0.7, 0.7, 0.02, '#0ea5e9'), ball(0.4, 0.45, 0.04, 0.06, '#4ade80')] },
  { id: 'bird-house', name: 'Bird house', room: 'garden', price: 35, parts: [pole(0.5, 0.5, 0, 0.6, '#713f12'), box(0.38, 0.38, 0.6, 0.24, 0.24, 0.22, '#fbbf24')] },
  { id: 'grill', name: 'Grill', room: 'garden', price: 70, parts: [pole(0.5, 0.5, 0, 0.35, '#262b36'), ball(0.5, 0.5, 0.42, 0.18, '#1f2937')] },
  { id: 'lantern', name: 'Garden lantern', room: 'garden', price: 30, parts: [pole(0.5, 0.5, 0, 0.55, '#262b36'), ball(0.5, 0.5, 0.6, 0.09, '#fde68a')] },
];

const MOW_MESSAGES = ['Fresh start.', 'Pause is fine.'];

// 3D rooms: a grid of cells per room. Placements may carry pos { x, z, rot }.
const GRIDS = { living: { w: 6, d: 5 }, workshop: { w: 6, d: 5 }, garden: { w: 7, d: 5 } };
// Flat items that other things may stand on.
const FLAT_ITEMS = new Set(['rug', 'pond']);
const GRASS_CAP = 3; // of 5, so the garden never looks neglected
const GRASS_MAX = 5;

const SLOT_ROOM = Object.fromEntries(ROOMS.flatMap((r) => r.slots.map((s) => [s, r.id])));
const ITEM = Object.fromEntries(CATALOGUE.map((i) => [i.id, i]));

function parseList(text) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function createHome(db, clock, game, uid) {
  const row = () => db.prepare('SELECT * FROM home_state WHERE user_id = ?').get(uid());

  function grassLevel(state) {
    const lastTask = db
      .prepare("SELECT MAX(t.done_at) AS d FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.status = 'done' AND p.user_id = ?")
      .get(uid()).d;
    const ref = [lastTask, state.last_mow_at].filter(Boolean).sort().pop();
    if (!ref) return 0;
    const days = daysBetween(dayOf(new Date(ref), clock.timeZone), dayOf(clock.now(), clock.timeZone));
    return Math.max(0, Math.min(GRASS_CAP, days));
  }

  function state() {
    const r = row();
    const owned = parseList(r.owned_items);
    const placements = parseList(r.placements);
    return {
      owned_items: owned,
      placements,
      grass_level: grassLevel(r),
      grass_max: GRASS_MAX,
      last_mow_at: r.last_mow_at,
      xp_balance: game.state().xp_balance,
    };
  }

  function write(owned, placements) {
    db.prepare('UPDATE home_state SET owned_items = ?, placements = ? WHERE user_id = ?').run(
      JSON.stringify(owned),
      JSON.stringify(placements),
      uid(),
    );
  }

  // Returns { ok, error? }. Buying never gives XP.
  function buy(itemId) {
    const item = ITEM[itemId];
    if (!item) return { error: 'unknown_item' };
    const s = state();
    if (s.owned_items.includes(itemId)) return { error: 'already_owned' };
    if (s.xp_balance < item.price) return { error: 'not_enough_xp' };
    const owned = [...s.owned_items, itemId];
    const placements = [...s.placements];
    const room = ROOMS.find((r) => r.id === item.room);
    const used = new Set(placements.map((p) => p.slot));
    const free = room.slots.find((slot) => !used.has(slot));
    if (free) placements.push({ slot: free, item: itemId });
    db.transaction(() => {
      game.spend(item.price);
      write(owned, placements);
    })();
    return { ok: true };
  }

  // Places an owned item in a slot of its room (or removes it with slot = null).
  function place(itemId, slot) {
    const s = state();
    if (!s.owned_items.includes(itemId)) return { error: 'not_owned' };
    let placements = s.placements.filter((p) => p.item !== itemId);
    if (slot) {
      if (SLOT_ROOM[slot] !== ITEM[itemId].room) return { error: 'wrong_room' };
      placements = placements.filter((p) => p.slot !== slot);
      placements.push({ slot, item: itemId });
    }
    write(s.owned_items, placements);
    return { ok: true };
  }

  function mow() {
    const now = clock.now().toISOString();
    db.prepare('UPDATE home_state SET last_mow_at = ? WHERE user_id = ?').run(now, uid());
    return MOW_MESSAGES[Math.floor(Math.random() * MOW_MESSAGES.length)];
  }

  function importState(data) {
    const owned = Array.isArray(data.owned_items) ? data.owned_items.filter((id) => ITEM[id]) : [];
    const placements = Array.isArray(data.placements)
      ? data.placements
          .filter((p) => p && ITEM[p.item] && owned.includes(p.item))
          .filter((p) => (p.slot ? SLOT_ROOM[p.slot] === ITEM[p.item].room : Boolean(p.pos)))
          .map((p) => {
            const out = { slot: p.slot || null, item: p.item };
            const ok = (v, max) => Number.isInteger(v) && v >= 0 && v < max;
            const g = GRIDS[ITEM[p.item].room];
            if (p.pos && ok(p.pos.x, g.w) && ok(p.pos.z, g.d) && ok(p.pos.rot, 4)) out.pos = { x: p.pos.x, z: p.pos.z, rot: p.pos.rot };
            return out;
          })
      : [];
    write(owned, placements);
    db.prepare('UPDATE home_state SET last_mow_at = ? WHERE user_id = ?').run(
      typeof data.last_mow_at === 'string' ? data.last_mow_at : null,
      uid(),
    );
  }

  // Free placement in a 3D room. rot is a quarter turn (0..3).
  function layout(itemId, x, z, rot) {
    const s = state();
    if (!s.owned_items.includes(itemId)) return { error: 'not_owned' };
    const room = ITEM[itemId].room;
    const grid = GRIDS[room];
    if (x < 0 || z < 0 || x >= grid.w || z >= grid.d) return { error: 'out_of_room' };
    const flat = FLAT_ITEMS.has(itemId);
    const blocked = s.placements.some(
      (p) => p.item !== itemId && ITEM[p.item]?.room === room && p.pos && p.pos.x === x && p.pos.z === z && !flat && !FLAT_ITEMS.has(p.item),
    );
    if (blocked) return { error: 'cell_taken' };
    const placements = s.placements.filter((p) => p.item !== itemId);
    const prev = s.placements.find((p) => p.item === itemId);
    let slot = prev?.slot || null;
    if (!slot) {
      const used = new Set(placements.map((p) => p.slot).filter(Boolean));
      slot = ROOMS.find((r) => r.id === room).slots.find((sl) => !used.has(sl)) || null;
    }
    placements.push({ slot, item: itemId, pos: { x, z, rot } });
    write(s.owned_items, placements);
    return { ok: true };
  }

  return { state, buy, place, layout, mow, importState };
}

module.exports = { ROOMS, CATALOGUE, MOW_MESSAGES, GRASS_CAP, GRASS_MAX, GRIDS, FLAT_ITEMS, createHome };
