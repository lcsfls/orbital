// Orbital – the house as a small 3D game (three.js, vendored locally).
// Loaded only when the house is opened. Purely cosmetic: nothing here gives XP.
// Mobile first: tap to move or use things, drag furniture with a finger, drag the floor to turn,
// pinch to zoom, swipe over the lawn to mow it. Every gesture also has a button.

import * as THREE from '/vendor/three/three.module.js';
import { createFurniture } from './furniture.js';

const F = createFurniture(THREE);
const ITEM_SCALE = 1.15;
const HOVER = 0.95;
const WALL_H = 2.4;
const ROOMS = {
  living: { label: 'Living room', hello: 'Welcome home.' },
  workshop: { label: 'Workshop', hello: 'Time to tinker. Or not.' },
  garden: { label: 'Garden', hello: 'Fresh air.' },
};
const DEFAULT_SLOTS = [[1, 1], [4, 1], [1, 3], [4, 3], [2, 2], [5, 2]];

// What Orbit does with each thing. Calm, short, no exclamation marks.
const ACTIONS = {
  rug: { verb: 'Dance a little', fx: 'dance', say: ['A little dance.', 'Spin. Done beats perfect.'] },
  sofa: { verb: 'Sit down', fx: 'sit', say: ['A short rest counts too.', 'Comfy. No rush.'] },
  armchair: { verb: 'Sit down', fx: 'sit', say: ['Just sitting for a bit.', 'This chair is nice.'] },
  'floor-lamp': { verb: 'Switch the light', fx: 'light', say: ['Warm light on.', 'Lights low. Cozy.'] },
  bookshelf: { verb: 'Read a page', fx: 'read', say: ['Reading one page. That is enough.', 'A good book, slowly.'] },
  monstera: { verb: 'Water the plant', fx: 'water', say: ['Watered. It grows at its own pace.', 'Plants do not hurry either.'] },
  tv: { verb: 'Watch something', fx: 'screen', say: ['Something light on TV.', 'One episode, then we see.'] },
  aquarium: { verb: 'Say hi to the fish', fx: 'fish', say: ['The fish say hi.', 'Blub. That means hello.'] },
  telescope: { verb: 'Look at the stars', fx: 'stars', say: ['Looking at the stars. One more lap.', 'So much space out there.'] },
  workbench: { verb: 'Build something small', fx: 'sparks', say: ['Built a tiny thing. It counts.', 'Measure twice, relax once.'] },
  toolbox: { verb: 'Sort the tools', fx: 'sparks', say: ['Tools sorted. Future you says thanks.', 'Everything has its place.'] },
  pegboard: { verb: 'Hang up a tool', fx: 'sparks', say: ['Back on its hook.', 'Tidy wall, tidy mind.'] },
  '3d-printer': { verb: 'Print a little gear', fx: 'print', say: ['Printing a little gear.', 'Layer by layer. Like everything.'] },
  'server-rack': { verb: 'Check the lights', fx: 'leds', say: ['All green. The homelab is happy.', 'Blinking means working.'] },
  stool: { verb: 'Take a seat', fx: 'sit', say: ['Short break on the stool.', 'Sitting is allowed.'] },
  'desk-lamp': { verb: 'Switch the lamp', fx: 'light', say: ['Lamp on. Good for small work.', 'Lamp off.'] },
  bike: { verb: 'Spin the wheels', fx: 'wheels', say: ['Wheels spin fine.', 'Ready for a ride. Someday.'] },
  hammock: { verb: 'Lie down', fx: 'sit', say: ['Swinging slowly. A pause is fine.', 'Nothing to do right now.'] },
  car: { verb: 'Wash the car', fx: 'wash', say: ['Shiny again.', 'Bubbles everywhere.'] },
  tree: { verb: 'Pick an apple', fx: 'apple', say: ['One apple. Crunchy.', 'The tree has plenty.'] },
  'flower-bed': { verb: 'Water the flowers', fx: 'water', say: ['The flowers look happy.', 'Watered. Slowly they grow.'] },
  bench: { verb: 'Sit on the bench', fx: 'sit', say: ['Sitting in the sun.', 'A bench is for pausing.'] },
  pond: { verb: 'Watch the ripples', fx: 'ripple', say: ['Ripples. Calm.', 'The water is quiet today.'] },
  'bird-house': { verb: 'Wait for a bird', fx: 'bird', say: ['A bird came by.', 'Tschilp. That is bird for hello.'] },
  grill: { verb: 'Light the grill', fx: 'grill', say: ['The grill is warm.', 'Something nice is coming.'] },
  lantern: { verb: 'Switch the lantern', fx: 'light', say: ['Lantern on.', 'Lantern off. Stars are enough.'] },
};
const TAP_ORBIT = ['Hi. Nice to see you.', 'Orbiting the core. Nothing urgent.', 'Parking is deciding, not failing.', 'One more lap.', 'I like it when you visit.', 'Pat pat. Thank you.'];
const TICKLE = ['That tickles.', 'Hehe. Again?', 'Okay, okay. One spin for you.'];
// {item} and {room} are filled in.
const THANKS = [
  'Thank you for the {item}. My {room} feels more like home.',
  'A {item}. I love it. Thank you.',
  'You upgraded my {room}. Thank you, really.',
  'Look at this {item}. You earned it, and I get to enjoy it too.',
];
const PLACED = ['Right there. Good spot.', 'Nice. That fits.', 'Oh, that looks good there.', 'Better. I like it.'];
// Small talk about things in the room, said now and then while you are around.
const TALK = {
  sofa: 'This sofa is the best place for a short break.',
  armchair: 'The armchair is my reading spot. Sometimes.',
  'floor-lamp': 'The lamp makes evenings softer.',
  bookshelf: 'So many books. One page at a time.',
  monstera: 'I think the monstera grew a little.',
  tv: 'We could watch something later. No pressure.',
  aquarium: 'The fish look calm today.',
  telescope: 'Tonight the stars should be clear.',
  rug: 'The rug is perfect for a little dance.',
  workbench: 'The workbench is waiting for small projects.',
  'server-rack': 'All the lights are green. Good.',
  '3d-printer': 'I could print a tiny you.',
  toolbox: 'Everything is in its place.',
  hammock: 'The hammock is calling. Quietly.',
  tree: 'The apples look good this year.',
  pond: 'The pond is very still.',
  'bird-house': 'A bird was here earlier.',
  car: 'The car is shiny. Mostly.',
};
const GENERIC_TALK = ['I like what you did with the place.', 'It is cozy here.', 'Thanks for spending a moment with me.'];
const ASK_CHIPS = ['What should I do next?', 'I am tired.', 'Cheer me up.'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function supported() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

export function openRoom(opts) {
  const { api, home, effects, toast, celebrate, onClose, onState, message, aiEnabled } = opts;
  const today = opts.today || { done: 0, userName: '' };
  const NAME = opts.companion?.name || 'Orbit';
  const BODY = new THREE.Color(opts.companion?.color || '#f3effa');
  let state = home.state;
  const grids = home.grids;
  const FLAT = new Set(home.flat_items || ['rug', 'pond']);
  const catalogue = Object.fromEntries(home.catalogue.map((i) => [i.id, i]));
  const motion = effects;
  let roomId = ROOMS[opts.room] ? opts.room : 'living';
  let GRID = grids[roomId];

  // ---------- DOM ----------
  const root = document.createElement('div');
  root.className = 'room';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Your house');
  root.innerHTML = `
    <div class="room-top">
      <button class="btn soft room-back" data-r="close">Back</button>
      <div class="room-title"><strong data-r="title"></strong><span class="quiet small" data-r="sub"></span></div>
      <div class="room-turn">
        <button class="close" data-r="left" aria-label="Turn the view left"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg></button>
        <button class="close" data-r="right" aria-label="Turn the view right"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg></button>
      </div>
    </div>
    <div class="room-tabs" role="tablist" aria-label="Rooms">
      ${Object.entries(ROOMS).map(([id, r]) => `<button role="tab" data-r="room" data-v="${id}">${r.label}</button>`).join('')}
    </div>
    <div class="room-stage" data-r="stage">
      <div class="room-bubble" data-r="bubble" hidden></div>
      <div class="room-float" data-r="float" hidden></div>
      <div class="room-ghost" data-r="ghost" hidden></div>
    </div>
    <div class="room-panel">
      <div class="room-modes" role="group" aria-label="Mode">
        <button data-r="mode" data-v="play">Hang out</button>
        <button data-r="mode" data-v="arrange">Arrange</button>
      </div>
      <div class="room-ctx" data-r="ctx" aria-live="polite"></div>
    </div>`;
  document.body.appendChild(root);
  document.body.classList.add('room-open');
  const $r = (k) => root.querySelector(`[data-r="${k}"]`);
  const stage = $r('stage');
  const bubble = $r('bubble');
  const float = $r('float');
  const ghost = $r('ghost');
  const haptic = (ms = 8) => {
    if (motion && navigator.vibrate) navigator.vibrate(ms);
  };

  // ---------- Renderer, camera, light ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', `A 3D view of your house with ${NAME}`);
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  let yaw = Math.PI / 4;
  let yawTarget = yaw;
  const pitch = THREE.MathUtils.degToRad(33);
  let zoom = 1;
  const hemi = new THREE.HemisphereLight(0xf3effa, 0x3a3150, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2bd, 1.6);
  sun.position.set(6, 10, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.03, ...extra });
  const cellCenter = (x, z) => new THREE.Vector3(x + 0.5 - GRID.w / 2, 0, z + 0.5 - GRID.d / 2);
  const inGrid = (x, z) => x >= 0 && z >= 0 && x < GRID.w && z < GRID.d;

  function canvasTexture(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(...repeat);
    }
    return t;
  }
  const textures = {
    planks: () => canvasTexture(512, 384, (g) => {
      g.fillStyle = '#b98b5e';
      g.fillRect(0, 0, 512, 384);
      for (let row = 0; row < 12; row += 1) {
        let x = (row % 2) * -60;
        while (x < 512) {
          const w = 110 + ((row * 37 + x) % 70);
          g.fillStyle = `hsl(28, ${36 + ((row * 13 + x) % 9)}%, ${50 + ((row * 7 + x) % 8)}%)`;
          g.fillRect(x + 1, row * 32 + 1, w - 2, 30);
          x += w;
        }
      }
    }),
    concrete: () => canvasTexture(256, 256, (g) => {
      g.fillStyle = '#9a9aa2';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 1800; i += 1) {
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '60,60,70' : '230,230,235'},${Math.random() * 0.12})`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
      g.fillStyle = 'rgba(40,40,50,.18)';
      g.beginPath();
      g.ellipse(170, 150, 34, 22, 0.4, 0, Math.PI * 2);
      g.fill();
    }, [2, 2]),
    bricks: () => canvasTexture(256, 128, (g) => {
      g.fillStyle = '#c9b8b0';
      g.fillRect(0, 0, 256, 128);
      for (let row = 0; row < 8; row += 1) {
        for (let col = -1; col < 6; col += 1) {
          const x = col * 48 + (row % 2) * 24;
          g.fillStyle = `hsl(${12 + ((row + col) % 3) * 4}, 38%, ${58 + ((row * 3 + col) % 4) * 3}%)`;
          g.fillRect(x + 2, row * 16 + 2, 44, 12);
        }
      }
    }, [3, 2]),
    grass: () => canvasTexture(256, 256, (g) => {
      g.fillStyle = '#5f9e5b';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i += 1) {
        g.fillStyle = `hsla(${95 + Math.random() * 30}, 45%, ${32 + Math.random() * 22}%, .5)`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
      }
    }, [3, 2]),
  };

  function clearGroup(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    });
    scene.remove(g);
  }

  // ---------- Environment per room ----------
  let env = new THREE.Group();
  scene.add(env);
  let walls = [];
  let grass = null; // { mesh, cells: [{ x, z, mowed }], seeds }

  function buildEnv() {
    clearGroup(env);
    env = new THREE.Group();
    scene.add(env);
    walls = [];
    grass = null;
    GRID = grids[roomId];
    const garden = roomId === 'garden';
    root.classList.toggle('outdoor', garden);
    hemi.intensity = garden ? 1.35 : 1.15;
    sun.intensity = garden ? 2 : 1.6;

    const floorTex = roomId === 'living' ? textures.planks() : roomId === 'workshop' ? textures.concrete() : textures.grass();
    const side = mat(garden ? 0x6b4f37 : roomId === 'workshop' ? 0x6f6f78 : 0x8a6542);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(GRID.w, 0.14, GRID.d), [side, side, mat(0xffffff, { map: floorTex }), side, side, side]);
    floor.position.y = -0.07;
    floor.receiveShadow = true;
    env.add(floor);

    if (garden) buildGarden();
    else buildIndoor();
  }

  function addWall(len, x, z, ry, normal, decorate) {
    const g = new THREE.Group();
    const wallMat = roomId === 'workshop' ? mat(0xffffff, { map: textures.bricks() }) : mat(0xddd6e8);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, WALL_H, 0.14), wallMat);
    wall.position.y = WALL_H / 2;
    wall.receiveShadow = true;
    g.add(wall);
    const base = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.18), mat(roomId === 'workshop' ? 0x55606e : 0x9c8fb8));
    base.position.y = 0.07;
    g.add(base);
    if (decorate) decorate(g, len);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    g.userData.normal = normal;
    env.add(g);
    walls.push(g);
  }

  function windowOn(g, x, y = 1.45, w = 1.4, h = 0.95, curtains = true) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.18), mat(0xf3effa));
    frame.position.set(x, y, 0);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: roomId === 'workshop' ? 0x9cbfe0 : 0xb3d2f5 }));
    glass.position.set(x, y, 0.1);
    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.04), mat(0xf3effa));
    barV.position.set(x, y, 0.11);
    const barH = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.04), mat(0xf3effa));
    barH.position.set(x, y, 0.11);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.05, 0.18), mat(0xe9e2f2));
    sill.position.set(x, y - h / 2 - 0.1, 0.12);
    g.add(frame, glass, barV, barH, sill);
    if (curtains) {
      for (const sgn of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.22, h + 0.4, 0.05), mat(0xf2b36b, { roughness: 0.95 }));
        c.position.set(x + sgn * (w / 2 + 0.14), y - 0.05, 0.16);
        g.add(c);
      }
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, w + 0.8, 8), mat(0x3a3e55));
      rod.rotation.z = Math.PI / 2;
      rod.position.set(x, y + h / 2 + 0.2, 0.17);
      g.add(rod);
    }
  }
  function frameOn(g, x, y, w, h, color) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), mat(0x3a3e55));
    f.position.set(x, y, 0.09);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.08), mat(color, { roughness: 0.6 }));
    art.position.set(x, y, 0.112);
    const sunDot = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, h) * 0.16, 20), mat(0xf2b36b));
    sunDot.position.set(x + w * 0.15, y + h * 0.12, 0.114);
    const hill = new THREE.Mesh(new THREE.CircleGeometry(w * 0.38, 24, 0, Math.PI), mat(0x9fd3b5));
    hill.position.set(x - w * 0.05, y - h / 2 + 0.05, 0.114);
    g.add(f, art, sunDot, hill);
  }
  function doorOn(g, x, color = 0x8a6542) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.04, 2.0, 0.06), mat(0xf3effa));
    frame.position.set(x, 1.0, 0.05);
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.08), mat(color));
    d.position.set(x, 0.95, 0.08);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), mat(0xf2b36b, { metalness: 0.4 }));
    knob.position.set(x + 0.32, 0.95, 0.14);
    g.add(frame, d, knob);
  }

  function buildIndoor() {
    const L = roomId === 'living';
    const hw = GRID.w / 2 + 0.07;
    const hd = GRID.d / 2 + 0.07;
    addWall(GRID.w, 0, -hd, 0, new THREE.Vector3(0, 0, 1), (g) => {
      if (L) {
        windowOn(g, 0.9);
        frameOn(g, -1.7, 1.55, 0.8, 0.6, 0x8fb8e8);
      } else {
        windowOn(g, 1.2, 1.55, 1.2, 0.7, false);
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.3), mat(0x8a5a36));
        shelf.position.set(-1.4, 1.35, 0.18);
        g.add(shelf);
        [0xe86a5f, 0x8fb8e8, 0xf2b36b].forEach((c, i) => {
          const can = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 14), mat(c));
          can.position.set(-1.9 + i * 0.4, 1.48, 0.18);
          g.add(can);
        });
      }
    });
    addWall(GRID.d, -hw, 0, Math.PI / 2, new THREE.Vector3(1, 0, 0), (g) => {
      if (L) {
        doorOn(g, -1.4);
        frameOn(g, 0.9, 1.6, 0.6, 0.8, 0xe9a3c8);
        frameOn(g, 1.65, 1.45, 0.5, 0.5, 0x9fd3b5);
      } else {
        const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 0.06), mat(0xc9ccd6));
        door.position.set(0.4, 1.0, 0.09);
        g.add(door);
        for (let i = 1; i < 10; i += 1) {
          const line = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.015, 0.02), mat(0x8b93a7));
          line.position.set(0.4, i * 0.2, 0.13);
          g.add(line);
        }
      }
    });
    addWall(GRID.w, 0, hd, Math.PI, new THREE.Vector3(0, 0, -1), (g) => {
      if (L) windowOn(g, -0.8);
    });
    addWall(GRID.d, hw, 0, -Math.PI / 2, new THREE.Vector3(-1, 0, 0), (g) => {
      if (L) frameOn(g, 0, 1.5, 0.9, 0.6, 0xf2b36b);
      else windowOn(g, 0, 1.55, 1.0, 0.7, false);
    });
    if (!L) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.8, 6), mat(0x23232b));
      cord.position.set(0, 2.6, 0);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.18, 18, 1, true), mat(0x2b2b33, { side: THREE.DoubleSide }));
      shade.position.set(0, 2.15, 0);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), mat(0xfff3d6, { emissive: 0xffd59a, emissiveIntensity: 1 }));
      bulb.position.set(0, 2.07, 0);
      const l = new THREE.PointLight(0xffd59a, 1.2, 7, 1.4);
      l.position.set(0, 2.0, 0);
      env.add(cord, shade, bulb, l);
    }
  }

  function buildGarden() {
    const hd = GRID.d / 2 + 0.07;
    addWall(GRID.w, 0, -hd, 0, new THREE.Vector3(0, 0, 1), (g) => {
      doorOn(g, -1.2, 0x9c8fb8);
      windowOn(g, 1.3, 1.5, 1.2, 0.8, false);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(GRID.w + 0.4, 0.14, 0.7), mat(0xb5352d));
      roof.position.set(0, WALL_H + 0.05, 0.25);
      g.add(roof);
    });
    const fence = new THREE.Group();
    const postMat = mat(0xf3effa);
    const post = (x, z) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.04), postMat);
      p.position.set(x, 0.25, z);
      p.castShadow = true;
      fence.add(p);
    };
    for (let x = -GRID.w / 2; x <= GRID.w / 2 + 0.001; x += 0.25) post(x, GRID.d / 2 + 0.05);
    for (let z = -GRID.d / 2; z <= GRID.d / 2 + 0.001; z += 0.25) {
      post(-GRID.w / 2 - 0.05, z);
      post(GRID.w / 2 + 0.05, z);
    }
    env.add(fence);
    for (let i = 0; i < 4; i += 1) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 14), mat(0xb9b6c2));
      st.position.set(-1.2 + (i % 2) * 0.12, 0.015, -GRID.d / 2 + 0.5 + i * 0.6);
      st.receiveShadow = true;
      env.add(st);
    }
    buildGrass();
  }

  // Lawn: blades per cell. Height follows the grass level (capped at 3 of 5 on the server).
  function buildGrass() {
    const perCell = 16;
    const cells = [];
    for (let x = 0; x < GRID.w; x += 1) for (let z = 0; z < GRID.d; z += 1) cells.push({ x, z, mowed: state.grass_level === 0 });
    const geo = new THREE.ConeGeometry(0.025, 1, 4);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, mat(0x6fbf6a, { roughness: 1 }), cells.length * perCell);
    mesh.receiveShadow = true;
    const seeds = [];
    for (const c of cells) {
      for (let i = 0; i < perCell; i += 1) {
        seeds.push({ cell: c, x: c.x + 0.08 + ((i * 37) % 84) / 100, z: c.z + 0.08 + ((i * 53 + c.x * 7) % 84) / 100, r: (i * 1.7) % Math.PI, s: 0.8 + ((i * 13) % 5) / 10 });
      }
    }
    grass = { mesh, cells, seeds };
    updateGrass();
    env.add(mesh);
  }
  function updateGrass() {
    if (!grass) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const tall = 0.07 + state.grass_level * 0.07;
    grass.seeds.forEach((sd, i) => {
      const h = (sd.cell.mowed ? 0.035 : tall) * sd.s;
      q.setFromAxisAngle(up, sd.r);
      m.compose(new THREE.Vector3(sd.x - GRID.w / 2, 0, sd.z - GRID.d / 2), q, new THREE.Vector3(1, h, 1));
      grass.mesh.setMatrixAt(i, m);
    });
    grass.mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- Furniture ----------
  const items = new Map(); // id -> { group, meshes, fx, cell, rot }
  const lit = new Set();
  const itemLights = new Map();
  const roomItems = () => home.catalogue.filter((i) => i.room === roomId);

  function blockedAt(x, z, movingId) {
    if (FLAT.has(movingId)) return false;
    for (const [id, it] of items) if (id !== movingId && !FLAT.has(id) && it.cell[0] === x && it.cell[1] === z) return true;
    return false;
  }
  function freeCellNear(x, z, movingId) {
    let best = null;
    for (let cx = 0; cx < GRID.w; cx += 1) {
      for (let cz = 0; cz < GRID.d; cz += 1) {
        if (blockedAt(cx, cz, movingId)) continue;
        const d = (cx - x) ** 2 + (cz - z) ** 2;
        if (!best || d < best.d) best = { x: cx, z: cz, d };
      }
    }
    return best ? [best.x, best.z] : [x, z];
  }
  function positionItem(it, cell, rot, lift = 0) {
    const c = cellCenter(cell[0], cell[1]);
    it.group.position.set(c.x, lift, c.z);
    it.group.rotation.y = -rot * (Math.PI / 2);
  }

  function syncFurniture() {
    const here = state.placements.filter((p) => catalogue[p.item]?.room === roomId && (p.pos || p.slot));
    const wanted = new Set(here.map((p) => p.item));
    for (const [id, it] of items) {
      if (!wanted.has(id)) {
        clearGroup(it.group);
        items.delete(id);
        lit.delete(id);
        removeLight(id);
      }
    }
    here.sort((a, b) => (b.pos ? 1 : 0) - (a.pos ? 1 : 0));
    for (const p of here) {
      let it = items.get(p.item);
      if (!it) {
        it = F.build(catalogue[p.item]);
        it.group.scale.setScalar(ITEM_SCALE);
        it.cell = [-99, -99];
        items.set(p.item, it);
        scene.add(it.group);
      }
      if (p.pos) {
        it.cell = [p.pos.x, p.pos.z];
        it.rot = p.pos.rot;
      } else {
        const idx = Number(String(p.slot).split('-')[1] || 1) - 1;
        it.cell = freeCellNear(...(DEFAULT_SLOTS[idx] || [2, 2]), p.item);
        it.rot = 0;
      }
      positionItem(it, it.cell, it.rot);
    }
    for (const id of lit) applyLight(id);
    highlight();
  }

  const worldOf = (it, local) => local.clone().multiplyScalar(ITEM_SCALE).applyAxisAngle(new THREE.Vector3(0, 1, 0), it.group.rotation.y).add(it.group.position);
  function applyLight(id) {
    const it = items.get(id);
    if (!it?.fx.glow) return;
    const on = lit.has(id);
    for (const m of it.fx.glow) {
      m.material.emissive = new THREE.Color(on ? 0xffc46b : 0x000000);
      m.material.emissiveIntensity = on ? 1.3 : 0;
    }
    if (on) {
      let l = itemLights.get(id);
      if (!l) {
        l = new THREE.PointLight(0xffd59a, 2, 5, 1.6);
        scene.add(l);
        itemLights.set(id, l);
      }
      l.position.copy(worldOf(it, it.fx.light));
    } else removeLight(id);
  }
  function removeLight(id) {
    const l = itemLights.get(id);
    if (l) {
      scene.remove(l);
      itemLights.delete(id);
    }
  }

  // ---------- Orbit ----------
  const orbit = new THREE.Group();
  const bs = new THREE.Shape();
  {
    const s = 0.2;
    const r = 0.07;
    bs.moveTo(-s + r, -s);
    bs.lineTo(s - r, -s);
    bs.quadraticCurveTo(s, -s, s, -s + r);
    bs.lineTo(s, s - r);
    bs.quadraticCurveTo(s, s, s - r, s);
    bs.lineTo(-s + r, s);
    bs.quadraticCurveTo(-s, s, -s, s - r);
    bs.lineTo(-s, -s + r);
    bs.quadraticCurveTo(-s, -s, -s + r, -s);
  }
  const bodyGeo = new THREE.ExtrudeGeometry(bs, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 4, curveSegments: 8 });
  bodyGeo.translate(0, 0, -0.15);
  const body = new THREE.Mesh(bodyGeo, mat(BODY, { roughness: 0.45, emissive: BODY, emissiveIntensity: 0.22 }));
  body.castShadow = true;
  const ink = new THREE.MeshBasicMaterial({ color: 0x23213a });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), ink);
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.08, 0.04, 0.2);
  eyeR.position.set(0.08, 0.04, 0.2);
  const cheekMat = new THREE.MeshBasicMaterial({ color: 0xf2a3b8, transparent: true, opacity: 0 });
  const cheekL = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), cheekMat);
  const cheekR = cheekL.clone();
  cheekL.position.set(-0.14, -0.03, 0.205);
  cheekR.position.set(0.14, -0.03, 0.205);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 8, 20, Math.PI), ink);
  mouth.position.set(0, -0.06, 0.2);
  mouth.rotation.z = Math.PI;
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), mat(0x8fb8e8));
  antenna.position.set(0, 0.33, 0);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), mat(0x8fb8e8, { emissive: 0x2a4a70 }));
  tip.position.set(0, 0.43, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: 0xf2b36b, transparent: true, opacity: 0.55 }));
  ring.rotation.x = Math.PI / 2.4;
  // An invisible, larger hit area, so tapping the small robot works on a phone too.
  const hitBox = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  orbit.add(body, eyeL, eyeR, cheekL, cheekR, mouth, antenna, tip, ring, hitBox);
  orbit.traverse((o) => (o.userData.orbit = true));
  orbit.scale.setScalar(1.3);
  const shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
  shadowDisc.rotation.x = -Math.PI / 2;
  scene.add(orbit, shadowDisc);

  const bot = { pos: new THREE.Vector3(0, HOVER, 0.5), target: null, onArrive: null, face: 0, happyUntil: 0, act: null, actUntil: 0, nextWander: 0, blinkAt: 0 };
  function moveTo(vec, then) {
    bot.target = vec.clone();
    bot.onArrive = then || null;
    if (!motion) {
      bot.pos.copy(bot.target);
      arrive();
    }
  }
  function arrive() {
    bot.target = null;
    const fn = bot.onArrive;
    bot.onArrive = null;
    if (fn) fn();
  }
  const lookAt = (p) => (bot.face = Math.atan2(p.x - bot.pos.x, p.z - bot.pos.z));

  let bubbleTimer = 0;
  function say(text, ms = 3400) {
    bubble.textContent = text;
    bubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => (bubble.hidden = true), ms);
  }

  // ---------- Effects ----------
  const particles = [];
  const timed = [];
  function burst(kind, at, n = 14) {
    if (!motion) return;
    const colors = { water: 0x8fb8e8, stars: 0xf2d27b, sparks: 0xf2b36b, bubbles: 0xf3effa, smoke: 0xb1adc6, hearts: 0xf2a3b8 };
    for (let i = 0; i < n; i += 1) {
      const geo = kind === 'hearts' ? heartGeo() : new THREE.SphereGeometry(kind === 'bubbles' ? 0.05 : 0.03, 8, 6);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[kind], transparent: true, opacity: kind === 'bubbles' ? 0.7 : 1, side: THREE.DoubleSide }));
      if (kind === 'hearts') m.rotation.y = Math.random() * Math.PI;
      m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.2, (Math.random() - 0.5) * 0.5));
      const up = kind === 'water' ? -1 - Math.random() : 0.4 + Math.random() * 0.8;
      const spread = kind === 'smoke' ? 0.2 : 0.7;
      const v = new THREE.Vector3((Math.random() - 0.5) * spread, up, (Math.random() - 0.5) * spread);
      scene.add(m);
      particles.push({ m, v, life: 0, max: kind === 'smoke' ? 2 : 0.9 + Math.random() * 0.5 });
    }
  }
  function heartGeo() {
    const h = new THREE.Shape();
    h.moveTo(0, -0.05);
    h.bezierCurveTo(-0.08, 0.0, -0.06, 0.07, 0, 0.035);
    h.bezierCurveTo(0.06, 0.07, 0.08, 0.0, 0, -0.05);
    return new THREE.ShapeGeometry(h);
  }
  const heartsAt = (p, n = 8) => burst('hearts', p.clone(), n);
  const fill = (line, item) => line.replace('{item}', item.name.toLowerCase()).replace('{room}', ROOMS[roomId].label.toLowerCase());

  function during(ms, tick, done) {
    if (!motion) {
      if (done) done();
      return;
    }
    timed.push({ start: performance.now(), until: performance.now() + ms, tick, done });
  }

  let fishGroup = null;
  // Returns the index of the line to say, or null for a random one.
  function runEffect(id, it) {
    const fx = (ACTIONS[id] || {}).fx;
    const top = it.group.position.clone().setY(0.9);
    switch (fx) {
      case 'light':
        if (lit.has(id)) lit.delete(id);
        else lit.add(id);
        applyLight(id);
        renderTop();
        return lit.has(id) ? 0 : 1;
      case 'screen': {
        it.screenOn = !it.screenOn;
        it.fx.screen.material.emissive = new THREE.Color(it.screenOn ? 0x6fa8ff : 0x000000);
        it.fx.screen.material.emissiveIntensity = it.screenOn ? 0.9 : 0;
        return null;
      }
      case 'water':
        burst('water', top.setY(1.1));
        if (it.fx.leaves) during(1600, (k) => it.fx.leaves.forEach((l, i) => (l.rotation.x = Math.sin(k * 12 + i) * 0.12)));
        return null;
      case 'stars':
        burst('stars', top.setY(1.6), 18);
        return null;
      case 'sparks':
        burst('sparks', top.setY(0.8), 10);
        return null;
      case 'fish':
        if (!fishGroup && it.fx.tank) {
          fishGroup = [];
          for (let i = 0; i < 3; i += 1) {
            const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 8), mat([0xf2b36b, 0xe9a3c8, 0x8fb8e8][i], { emissive: 0x221100 }));
            f.rotation.z = Math.PI / 2;
            it.group.add(f);
            fishGroup.push({ f, phase: i * 2.1, base: it.fx.tank });
          }
          for (const f of fishGroup) f.f.position.copy(f.base);
        }
        return null;
      case 'print':
        during(3000, (k) => {
          it.fx.head.position.x = Math.sin(k * 30) * 0.15;
          it.fx.print.scale.y = 1 + k * 7;
        });
        return null;
      case 'leds':
        during(2600, (k) => it.fx.leds.forEach((l, i) => (l.visible = Math.sin(k * 40 + i * 1.3) > -0.3)), () => it.fx.leds.forEach((l) => (l.visible = true)));
        return null;
      case 'wheels':
        during(2200, (k, dt) => it.fx.wheels.forEach((w) => (w.rotation.z -= dt * 14 * (1 - k))));
        return null;
      case 'wash':
        burst('bubbles', top.setY(0.6), 22);
        return null;
      case 'apple': {
        const apple = it.fx.apples.find((ap) => ap.visible);
        if (!apple) return null;
        const startY = apple.position.y;
        const reset = () => {
          apple.visible = false;
          setTimeout(() => {
            apple.position.y = startY;
            apple.visible = true;
          }, 6000);
        };
        during(900, (k) => (apple.position.y = Math.max(0.05, startY - k * k * startY)), () => setTimeout(reset, 1200));
        return null;
      }
      case 'ripple': {
        if (!motion) return null;
        const ringM = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.07, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
        ringM.rotation.x = -Math.PI / 2;
        ringM.position.copy(it.group.position).setY(0.05);
        scene.add(ringM);
        during(1800, (k) => {
          ringM.scale.setScalar(1 + k * 5);
          ringM.material.opacity = 0.7 * (1 - k);
        }, () => clearGroup(ringM));
        return null;
      }
      case 'bird': {
        const bird = new THREE.Group();
        const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), mat(0x8fb8e8));
        const b2 = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.04, 6), mat(0xf2b36b));
        b2.rotation.x = Math.PI / 2;
        b2.position.z = 0.05;
        bird.add(b1, b2);
        bird.position.copy(worldOf(it, it.fx.perch));
        scene.add(bird);
        const base = bird.position.y;
        if (motion) during(4200, (k) => (bird.position.y = base + Math.abs(Math.sin(k * 20)) * 0.03), () => clearGroup(bird));
        else setTimeout(() => clearGroup(bird), 3000);
        return null;
      }
      case 'grill':
        it.fx.coals.material.emissive = new THREE.Color(0xff6a2a);
        it.fx.coals.material.emissiveIntensity = 1.2;
        burst('smoke', top.setY(1.0), 8);
        setTimeout(() => (it.fx.coals.material.emissiveIntensity = 0), 7000);
        return null;
      default:
        return null;
    }
  }

  function interact(id) {
    const it = items.get(id);
    if (!it) return;
    const a = ACTIONS[id] || { verb: 'Have a look', fx: 'look', say: ['Nice spot.', 'I like it here.'] };
    const center = it.group.position.clone();
    const seat = it.fx.seatY;
    let target;
    if (seat !== undefined) target = center.clone().setY(seat * ITEM_SCALE + 0.4);
    else if (a.fx === 'dance' || FLAT.has(id)) target = center.clone().setY(HOVER);
    else {
      const [nx, nz] = freeCellNear(it.cell[0], it.cell[1] + 1, '__orbit');
      target = cellCenter(nx, nz).setY(HOVER);
    }
    if (motion) say(`${a.verb}.`, 1300);
    moveTo(target, () => {
      lookAt(center);
      bot.happyUntil = performance.now() + 3600;
      bot.act = a.fx;
      bot.actUntil = performance.now() + (a.fx === 'sit' ? 4000 : 2400);
      const idx = runEffect(id, it);
      say(idx === null || idx === undefined ? pick(a.say) : a.say[idx]);
    });
  }

  // ---------- Thumbnails for the tray ----------
  const thumbs = new Map();
  let thumbRenderer = null;
  function thumb(id) {
    if (thumbs.has(id)) return thumbs.get(id);
    let url = '';
    try {
      if (!thumbRenderer) {
        thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        thumbRenderer.setSize(112, 112);
        thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
      }
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight(0xffffff, 0x554466, 1.4));
      const dl = new THREE.DirectionalLight(0xffffff, 1.4);
      dl.position.set(3, 5, 4);
      sc.add(dl);
      const it = F.build(catalogue[id]);
      sc.add(it.group);
      const cam = new THREE.OrthographicCamera(-0.75, 0.75, 0.85, -0.65, 0.1, 20);
      cam.position.set(3, 2.6, 3);
      cam.lookAt(0, 0.4, 0);
      thumbRenderer.render(sc, cam);
      url = thumbRenderer.domElement.toDataURL('image/png');
      it.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    } catch {
      url = '';
    }
    thumbs.set(id, url);
    return url;
  }

  // ---------- Panel ----------
  let mode = 'play';
  let selected = null;
  let tray = 'mine';
  let shopPick = null;
  let mowing = false;
  let orbitReply = '';
  let suppressClick = false;
  let pets = [];
  let lastActive = performance.now();
  let nextTalk = performance.now() + 45000;
  let wished = false;
  const owned = () => new Set(state.owned_items);
  const cozy = () => Math.min(100, items.size * 14 + lit.size * 8);

  function renderTop() {
    $r('title').textContent = ROOMS[roomId].label;
    $r('sub').textContent = `${state.xp_balance} XP to spend · cozy ${cozy()}%`;
    root.querySelectorAll('[data-r="room"]').forEach((b) => {
      b.classList.toggle('on', b.dataset.v === roomId);
      b.setAttribute('aria-selected', String(b.dataset.v === roomId));
    });
    root.querySelectorAll('[data-r="mode"]').forEach((b) => {
      b.classList.toggle('on', b.dataset.v === mode);
      b.setAttribute('aria-pressed', String(b.dataset.v === mode));
    });
  }

  function renderPanel() {
    renderTop();
    marker.visible = false;
    gridLines.visible = mode === 'arrange';
    highlight();
    renderFloat();
    const ctx = $r('ctx');
    const here = roomItems();
    if (mode === 'play') {
      const placed = here.filter((i) => items.has(i.id));
      let html = '';
      if (roomId === 'garden' && grass) {
        const left = grass.cells.filter((c) => !c.mowed).length;
        if (mowing) {
          html += `<div class="room-mow"><strong>Swipe over the lawn to mow it.</strong>
            <div class="progress" aria-hidden="true" style="margin:8px 0"><span style="width:${Math.round((100 * (grass.cells.length - left)) / grass.cells.length)}%"></span></div>
            <div class="room-chips"><button data-r="mow-all">Mow the rest for me</button><button data-r="mow-stop">Stop</button></div></div>`;
        } else if (state.grass_level > 0 && left > 0) {
          html += '<div class="room-chips" style="margin-bottom:10px"><button data-r="mow" class="primary">Mow the lawn</button></div>';
        } else {
          html += '<p class="quiet">The lawn is fresh. Grass grows a little on days without finished tasks, never more than halfway.</p>';
        }
      }
      html += placed.length
        ? `<p class="quiet">Tap the floor and ${esc(NAME)} floats there. Tap a thing to use it.</p>
           <div class="room-chips">${placed.map((i) => `<button data-r="use" data-id="${i.id}">${esc((ACTIONS[i.id] || { verb: 'Look at' }).verb)}</button>`).join('')}</div>`
        : '<p class="quiet">Nothing here yet. Switch to Arrange to bring in your first thing.</p>';
      html += `<form class="room-ask" data-r="ask-form" autocomplete="off">
          <input type="text" data-r="ask" maxlength="500" placeholder="Ask ${esc(NAME)} something" aria-label="Ask ${esc(NAME)}">
          <button class="btn small" type="submit">Ask</button></form>
        <div class="room-chips">${ASK_CHIPS.map((q) => `<button data-r="ask-chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        ${orbitReply ? `<p class="room-reply">${esc(orbitReply)}</p>` : ''}
        ${aiEnabled ? '' : `<p class="quiet small">${esc(NAME)} answers from your open tasks. With local AI turned on, it can say more.</p>`}`;
      ctx.innerHTML = html;
      $r('ask-form').addEventListener('submit', (e) => {
        e.preventDefault();
        ask($r('ask').value);
      });
      return;
    }
    const mine = here.filter((i) => owned().has(i.id)).sort((a, b) => Number(items.has(a.id)) - Number(items.has(b.id)));
    const shop = here.filter((i) => !owned().has(i.id));
    const card = (i, kind) => {
      const inRoom = items.has(i.id);
      const img = thumb(i.id);
      const label = kind === 'shop' ? (shopPick === i.id ? `Get it for ${i.price} XP` : `${i.price} XP`) : inRoom ? 'In the room' : 'Drag up or tap';
      return `<button class="room-card${inRoom ? ' placed' : ''}${shopPick === i.id ? ' picked' : ''}" data-r="${kind === 'shop' ? 'shop' : 'card'}" data-id="${i.id}"
        ${kind === 'shop' && state.xp_balance < i.price ? 'disabled' : ''} aria-label="${esc(i.name)}, ${esc(label)}">
        ${img ? `<img src="${img}" alt="" draggable="false">` : '<span class="room-card-ph"></span>'}
        <span class="n">${esc(i.name)}</span><span class="quiet">${esc(label)}</span></button>`;
    };
    const affordable = shop.some((i) => state.xp_balance >= i.price);
    let body;
    if (tray === 'mine') {
      body = mine.length
        ? `<div class="room-tray">${mine.map((i) => card(i, 'mine')).join('')}</div><p class="quiet small">Drag a thing up into the room, or tap it. Drag things in the room to move them.</p>`
        : '<p class="quiet">You do not own anything for this room yet. Have a look in the shop.</p>';
    } else {
      body = shop.length
        ? `<div class="room-tray">${shop.map((i) => card(i, 'shop')).join('')}</div>
           <p class="quiet small">${affordable ? 'Tap once to see the price, tap again to get it.' : 'Finishing tasks earns points for new things. No hurry.'}</p>`
        : '<p class="quiet">You have everything for this room.</p>';
    }
    ctx.innerHTML = `${selectionBar()}
      <div class="room-tray-tabs" role="group" aria-label="Show">
        <button data-r="tray" data-v="mine" class="${tray === 'mine' ? 'on' : ''}">Your things (${mine.length})</button>
        <button data-r="tray" data-v="shop" class="${tray === 'shop' ? 'on' : ''}">Shop (${shop.length})</button>
      </div>${body}`;
    bindTrayDrag();
  }

  function highlight() {
    for (const [id, it] of items) {
      for (const m of it.meshes) {
        if (it.fx.glow?.includes(m) && lit.has(id)) continue;
        if (m === it.fx.screen && it.screenOn) continue;
        if (m === it.fx.coals) continue;
        m.material.emissive = new THREE.Color(mode === 'arrange' && id === selected ? 0x4a3010 : 0x000000);
        m.material.emissiveIntensity = 1;
      }
    }
  }

  // Actions for the selected thing live in a fixed place in the panel (predictable, never covers the room).
  function renderFloat() {
    float.hidden = true;
  }
  function selectionBar() {
    if (!selected || !items.has(selected)) return '';
    return `<div class="room-selected"><div><strong>${esc(catalogue[selected].name)}</strong><div class="quiet small">Drag it in the room, or use the buttons.</div></div>
      <div class="room-chips"><button data-r="rotate" class="primary">Turn</button><button data-r="store">Put away</button><button data-r="deselect">Done</button></div></div>`;
  }

  async function saveLayout(id, x, z, rot) {
    try {
      const resp = await api('PATCH', '/api/home/layout', { item_id: id, x, z, rot });
      state = resp.state;
      onState(state);
      haptic(12);
      syncFurniture();
      renderPanel();
      return true;
    } catch (err) {
      toast(err.message, { warn: true });
      syncFurniture();
      return false;
    }
  }

  async function buy(id) {
    try {
      const resp = await api('POST', '/api/home/buy', { item_id: id });
      state = resp.state;
      onState(state, resp.gamification);
      shopPick = null;
      tray = 'mine';
      selected = id;
      const [x, z] = freeCellNear(Math.floor(GRID.w / 2), Math.floor(GRID.d / 2), id);
      await saveLayout(id, x, z, 0);
      celebrate('One more lap.');
      const it = items.get(id);
      const thanks = fill(pick(THANKS), catalogue[id]);
      if (it) {
        const spot = it.group.position.clone().setY(HOVER);
        moveTo(spot.clone().add(new THREE.Vector3(0, 0.2, 0.6)), () => {
          lookAt(it.group.position);
          bot.act = 'dance';
          bot.actUntil = performance.now() + 1600;
          heartsAt(spot.clone().setY(1.4), 10);
        });
      }
      bot.happyUntil = performance.now() + 5000;
      say(thanks, 5200);
    } catch (err) {
      toast(err.message, { warn: true });
    }
  }

  async function ask(text) {
    const q = String(text || '').trim();
    if (!q) return;
    orbitReply = `${NAME} is thinking.`;
    renderPanel();
    say('Hmm, let me think.', 8000);
    try {
      const r = await api('POST', '/api/orbit/ask', { message: q });
      orbitReply = r.text;
      bot.happyUntil = performance.now() + 4000;
      say(r.text, Math.min(14000, 4000 + r.text.length * 45));
    } catch (err) {
      orbitReply = err.message;
      bubble.hidden = true;
    }
    if (mode === 'play') renderPanel();
  }

  function switchRoom(id) {
    if (id === roomId) return;
    for (const [, it] of items) clearGroup(it.group);
    items.clear();
    for (const lid of [...itemLights.keys()]) removeLight(lid);
    lit.clear();
    fishGroup = null;
    selected = null;
    mowing = false;
    mower.visible = false;
    roomId = id;
    buildEnv();
    rebuildGrid();
    resize();
    syncFurniture();
    bot.pos.set(0, HOVER, 0.5);
    bot.target = null;
    renderPanel();
    say(ROOMS[id].hello);
  }

  async function finishMowing() {
    if (!grass) return;
    for (const c of grass.cells) c.mowed = true;
    updateGrass();
    mowing = false;
    mower.visible = false;
    try {
      const resp = await api('POST', '/api/home/mow');
      state = resp.state;
      onState(state);
      say(resp.message);
      bot.happyUntil = performance.now() + 3600;
    } catch (err) {
      toast(err.message, { warn: true });
    }
    renderPanel();
  }

  async function onPanel(btn) {
    const k = btn.dataset.r;
    const id = btn.dataset.id;
    switch (k) {
      case 'close':
        return close();
      case 'left':
      case 'right':
        yawTarget += (k === 'left' ? -1 : 1) * (Math.PI / 2);
        if (!motion) yaw = yawTarget;
        return;
      case 'room':
        return switchRoom(btn.dataset.v);
      case 'mode':
        mode = btn.dataset.v;
        selected = null;
        shopPick = null;
        mowing = false;
        mower.visible = false;
        return renderPanel();
      case 'tray':
        tray = btn.dataset.v;
        shopPick = null;
        return renderPanel();
      case 'use':
        return interact(id);
      case 'ask-chip':
        return ask(btn.dataset.q);
      case 'mow':
        mowing = true;
        mower.visible = true;
        mower.position.set(0, 0, 0);
        say('Swipe over the grass.', 2400);
        return renderPanel();
      case 'mow-all':
        return finishMowing();
      case 'mow-stop':
        mowing = false;
        mower.visible = false;
        return renderPanel();
      case 'deselect':
        selected = null;
        return renderPanel();
      case 'rotate': {
        const it = items.get(selected);
        if (it) await saveLayout(selected, it.cell[0], it.cell[1], ((it.rot || 0) + 1) % 4);
        return;
      }
      case 'store':
        try {
          const resp = await api('PATCH', '/api/home/placements', { item_id: selected, slot: null });
          state = resp.state;
          onState(state);
          selected = null;
          syncFurniture();
          renderPanel();
        } catch (err) {
          toast(err.message, { warn: true });
        }
        return;
      case 'card': {
        if (suppressClick) return;
        selected = id;
        if (items.has(id)) return renderPanel();
        const [x, z] = freeCellNear(Math.floor(GRID.w / 2), Math.floor(GRID.d / 2), id);
        await saveLayout(id, x, z, 0);
        return;
      }
      case 'shop':
        if (shopPick === id) return buy(id);
        shopPick = id;
        return renderPanel();
      default:
    }
  }
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-r]');
    if (btn && !btn.disabled) onPanel(btn);
  });

  // ---------- Grid lines, drop marker, mower ----------
  let gridLines = new THREE.Group();
  function rebuildGrid() {
    clearGroup(gridLines);
    gridLines = new THREE.Group();
    const m = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    const line = (a, b) => gridLines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), m));
    for (let x = 0; x <= GRID.w; x += 1) line(new THREE.Vector3(x - GRID.w / 2, 0.012, -GRID.d / 2), new THREE.Vector3(x - GRID.w / 2, 0.012, GRID.d / 2));
    for (let z = 0; z <= GRID.d; z += 1) line(new THREE.Vector3(-GRID.w / 2, 0.012, z - GRID.d / 2), new THREE.Vector3(GRID.w / 2, 0.012, z - GRID.d / 2));
    gridLines.visible = mode === 'arrange';
    scene.add(gridLines);
  }
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), new THREE.MeshBasicMaterial({ color: 0x9fd3b5, transparent: true, opacity: 0.55 }));
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);
  function showMarker(x, z, ok) {
    const c = cellCenter(x, z);
    marker.position.set(c.x, 0.016, c.z);
    marker.material.color.set(ok ? 0x9fd3b5 : 0xe9a3a3);
    marker.visible = true;
  }
  const mower = new THREE.Group();
  {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.3), mat(0xe86a5f));
    b.position.y = 0.14;
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), mat(0x2b2b33));
    h.position.set(-0.28, 0.35, 0);
    h.rotation.z = 0.8;
    mower.add(b, h);
    for (const [x, z] of [[-0.14, 0.16], [0.14, 0.16], [-0.14, -0.16], [0.14, -0.16]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), mat(0x23232b));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.06, z);
      mower.add(w);
    }
    mower.traverse((o) => (o.castShadow = true));
    mower.visible = false;
    scene.add(mower);
  }

  // ---------- Pointer input ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function setRay(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function floorPoint() {
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(floorPlane, p) ? p : null;
  }
  function hit(clientX, clientY) {
    setRay(clientX, clientY);
    const targets = [hitBox, ...[...items.values()].flatMap((i) => i.meshes)];
    const h = ray.intersectObjects(targets, false)[0];
    const p = floorPoint();
    if (h?.object.userData.orbit) return { orbit: true, point: p };
    if (h?.object.userData.itemId) return { item: h.object.userData.itemId, point: p || h.point };
    return p ? { floor: true, point: p } : null;
  }
  const toCell = (p) => [Math.floor(p.x + GRID.w / 2), Math.floor(p.z + GRID.d / 2)];
  const overStage = (x, y) => {
    const r2 = renderer.domElement.getBoundingClientRect();
    return x >= r2.left && x <= r2.right && y >= r2.top && y <= r2.bottom;
  };

  function mowAt(p) {
    mower.position.set(p.x, 0, p.z);
    if (!grass) return;
    let changed = false;
    const gx = p.x + GRID.w / 2;
    const gz = p.z + GRID.d / 2;
    for (const c of grass.cells) {
      if (!c.mowed && Math.abs(c.x + 0.5 - gx) < 0.7 && Math.abs(c.z + 0.5 - gz) < 0.7) {
        c.mowed = true;
        changed = true;
      }
    }
    if (changed) {
      updateGrass();
      haptic(5);
      // Good enough counts: the last corners are mowed for you.
      const share = grass.cells.filter((c) => c.mowed).length / grass.cells.length;
      if (share >= 0.85) finishMowing();
      else renderPanel();
    }
  }

  const pointers = new Map();
  let drag = null;
  let pinch = null;
  let itemDrag = null;
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => {
    lastActive = performance.now();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* not every pointer can be captured */
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      drag = null;
      if (itemDrag && !itemDrag.mow) positionItem(items.get(itemDrag.id), itemDrag.start, items.get(itemDrag.id).rot);
      itemDrag = null;
      return;
    }
    const h = hit(e.clientX, e.clientY);
    if (mode === 'play' && mowing && h?.point) {
      itemDrag = { mow: true };
      mowAt(h.point);
      return;
    }
    if (mode === 'arrange' && h?.item) {
      const it = items.get(h.item);
      itemDrag = { id: h.item, start: [...it.cell], cell: [...it.cell], ok: true, moved: false, sx: e.clientX, sy: e.clientY };
      return;
    }
    drag = { x: e.clientX, y: e.clientY, yaw: yawTarget, moved: false };
  });
  el.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      zoom = THREE.MathUtils.clamp((pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, 0.7, 2.4);
      return;
    }
    if (itemDrag?.mow) {
      const h = hit(e.clientX, e.clientY);
      if (h?.point) mowAt(h.point);
      return;
    }
    if (itemDrag) {
      if (!itemDrag.moved && Math.hypot(e.clientX - itemDrag.sx, e.clientY - itemDrag.sy) < 8) return;
      if (!itemDrag.moved) {
        itemDrag.moved = true;
        selected = itemDrag.id;
        highlight();
        float.hidden = true;
        haptic(10);
      }
      setRay(e.clientX, e.clientY);
      const p = floorPoint();
      if (!p) return;
      const [cx, cz] = toCell(p);
      if (!inGrid(cx, cz)) return;
      if (cx !== itemDrag.cell[0] || cz !== itemDrag.cell[1]) haptic(4);
      itemDrag.cell = [cx, cz];
      itemDrag.ok = !blockedAt(cx, cz, itemDrag.id);
      const it = items.get(itemDrag.id);
      positionItem(it, itemDrag.cell, it.rot, motion ? 0.18 : 0);
      showMarker(cx, cz, itemDrag.ok);
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 8 || Math.abs(e.clientY - drag.y) > 8) drag.moved = true;
      if (drag.moved) {
        yawTarget = drag.yaw - dx * 0.008;
        yaw = yawTarget;
      }
    }
  });
  const end = async (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size) return;
    pinch = null;
    if (itemDrag?.mow) {
      itemDrag = null;
      return;
    }
    if (itemDrag) {
      const d = itemDrag;
      itemDrag = null;
      marker.visible = false;
      if (!d.moved) {
        selected = d.id === selected ? null : d.id;
        renderPanel();
        return;
      }
      const it = items.get(d.id);
      if (d.ok && (d.cell[0] !== d.start[0] || d.cell[1] !== d.start[1])) {
        it.cell = d.cell;
        positionItem(it, d.cell, it.rot);
        await saveLayout(d.id, d.cell[0], d.cell[1], it.rot);
        if (Math.random() < 0.35) say(pick(PLACED), 2200);
      } else {
        positionItem(it, d.start, it.rot);
        if (!d.ok) toast('Something already stands there.');
        renderPanel();
      }
      return;
    }
    if (drag && !drag.moved) onTap(e.clientX, e.clientY);
    drag = null;
    // Settle on the nearest quarter turn, so the view stays predictable.
    yawTarget = Math.round((yawTarget - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
    if (!motion) yaw = yawTarget;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.7, 2.4);
  }, { passive: false });

  function onTap(x, y) {
    const h = hit(x, y);
    if (!h) return;
    if (mode === 'play') {
      if (h.orbit) {
        const now = performance.now();
        pets = pets.filter((t) => now - t < 1500);
        pets.push(now);
        bot.happyUntil = now + 3000;
        heartsAt(orbit.position.clone().add(new THREE.Vector3(0, 0.5, 0)), pets.length >= 3 ? 12 : 5);
        if (pets.length >= 3) {
          bot.act = 'dance';
          bot.actUntil = now + 1400;
          pets = [];
          say(pick(TICKLE), 2600);
        } else say(message || pick(TAP_ORBIT));
        return;
      }
      if (h.item) {
        interact(h.item);
        return;
      }
      const [cx, cz] = toCell(h.point);
      if (inGrid(cx, cz)) moveTo(cellCenter(cx, cz).setY(HOVER));
      return;
    }
    if (selected) {
      selected = null;
      renderPanel();
    }
  }

  // Drag a card from the tray up into the room.
  function bindTrayDrag() {
    root.querySelectorAll('.room-card[data-r="card"]').forEach((cardEl) => {
      cardEl.addEventListener('pointerdown', (e) => {
        const id = cardEl.dataset.id;
        const start = { x: e.clientX, y: e.clientY };
        let active = false;
        let cell = null;
        let ok = false;
        let preview = null;
        const dropPreview = () => {
          if (preview) {
            clearGroup(preview.group);
            preview = null;
          }
        };
        function cleanup() {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          ghost.hidden = true;
        }
        function move(ev) {
          const dx = ev.clientX - start.x;
          const dy = ev.clientY - start.y;
          if (!active) {
            if (dy < -12 && Math.abs(dy) > Math.abs(dx)) {
              active = true;
              suppressClick = true;
              ghost.innerHTML = cardEl.querySelector('img')?.outerHTML || '';
              ghost.hidden = false;
              haptic(10);
            } else if (Math.abs(dx) > 12) {
              cleanup();
              return;
            } else return;
          }
          ev.preventDefault();
          const sr = stage.getBoundingClientRect();
          ghost.style.left = `${ev.clientX - sr.left}px`;
          ghost.style.top = `${ev.clientY - sr.top}px`;
          if (overStage(ev.clientX, ev.clientY)) {
            setRay(ev.clientX, ev.clientY);
            const p = floorPoint();
            if (p) {
              const [cx, cz] = toCell(p);
              if (inGrid(cx, cz)) {
                cell = [cx, cz];
                ok = !blockedAt(cx, cz, id);
                showMarker(cx, cz, ok);
                if (!preview) {
                  preview = F.build(catalogue[id]);
                  preview.group.scale.setScalar(ITEM_SCALE);
                  preview.meshes.forEach((m) => {
                    m.material.transparent = true;
                    m.material.opacity = 0.7;
                  });
                  scene.add(preview.group);
                }
                ghost.hidden = true;
                positionItem(preview, cell, 0, motion ? 0.15 : 0);
                return;
              }
            }
          }
          cell = null;
          marker.visible = false;
          dropPreview();
          ghost.hidden = false;
        }
        async function up() {
          cleanup();
          if (!active) return;
          setTimeout(() => (suppressClick = false), 60);
          dropPreview();
          marker.visible = false;
          if (cell && ok) {
            selected = id;
            await saveLayout(id, cell[0], cell[1], 0);
            bot.happyUntil = performance.now() + 2500;
            say(pick(PLACED), 2400);
          } else if (cell) toast('Something already stands there.');
        }
        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
    });
  }

  // Keyboard: arrows move the selected thing, R turns it, Q and E turn the view.
  const onKey = (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'Escape') return close();
    if (e.key === 'q' || e.key === 'Q') return onPanel({ dataset: { r: 'left' } });
    if (e.key === 'e' || e.key === 'E') return onPanel({ dataset: { r: 'right' } });
    if (mode !== 'arrange' || !selected || !items.has(selected)) return;
    const it = items.get(selected);
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dz] = moves[e.key];
      const nx = it.cell[0] + dx;
      const nz = it.cell[1] + dz;
      if (inGrid(nx, nz) && !blockedAt(nx, nz, selected)) saveLayout(selected, nx, nz, it.rot);
    }
    if (e.key === 'r' || e.key === 'R') saveLayout(selected, it.cell[0], it.cell[1], (it.rot + 1) % 4);
  };
  document.addEventListener('keydown', onKey);

  // ---------- Resize and loop ----------
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    const aspect = w / Math.max(h, 1);
    // Fit the whole room: its diagonal footprint across, its height with walls up.
    const halfW = ((GRID.w + GRID.d) * 0.71) / 2 + 0.45;
    const halfH = Math.max(((GRID.w + GRID.d) * 0.41) / 2 + 1.3, halfW / aspect);
    camera.left = -halfH * aspect;
    camera.right = halfH * aspect;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  let raf = 0;
  let running = true;
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();
    const t = now / 1000;

    yaw += (yawTarget - yaw) * Math.min(1, dt * 8);
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * 20, Math.sin(pitch) * 20, Math.cos(yaw) * Math.cos(pitch) * 20);
    camera.lookAt(0, 0.6, 0);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();

    // Cutaway: hide walls between camera and room.
    tmp.set(camera.position.x, 0, camera.position.z).normalize();
    for (const w of walls) w.visible = w.userData.normal.dot(tmp) > -0.2;

    if (bot.target) {
      const d = bot.target.clone().sub(bot.pos);
      const dist = d.length();
      if (dist < 0.02) {
        bot.pos.copy(bot.target);
        arrive();
      } else {
        bot.pos.add(d.normalize().multiplyScalar(Math.min(dist, dt * 2.3)));
        if (Math.hypot(d.x, d.z) > 0.01) bot.face = Math.atan2(d.x, d.z);
      }
    } else if (motion && mode === 'play' && !mowing && !bot.act && now > bot.nextWander) {
      if (bot.nextWander) moveTo(cellCenter(Math.floor(Math.random() * GRID.w), Math.floor(Math.random() * GRID.d)).setY(HOVER));
      bot.nextWander = now + 9000 + Math.random() * 8000;
    }
    if (mode === 'play' && !mowing && bubble.hidden && now > nextTalk) {
      nextTalk = now + 45000 + Math.random() * 30000;
      if (now - lastActive < 90000) {
        const here = [...items.keys()];
        const affordable = home.catalogue.filter((i) => i.room === roomId && !state.owned_items.includes(i.id) && state.xp_balance >= i.price);
        if (!wished && affordable.length && Math.random() < 0.5) {
          wished = true;
          const w = pick(affordable);
          say(`If you like, a ${w.name.toLowerCase()} would fit nicely here. You have the points. No rush.`, 6000);
        } else {
          const known = here.filter((id) => TALK[id]);
          say(known.length && Math.random() < 0.75 ? TALK[pick(known)] : pick(GENERIC_TALK), 4200);
        }
      }
    }
    if (bot.act && now > bot.actUntil) {
      if (bot.act === 'sit') bot.pos.y = HOVER;
      bot.act = null;
    }
    const bob = motion && bot.act !== 'sit' ? Math.sin(t * 2.2) * 0.05 : 0;
    orbit.position.set(bot.pos.x, bot.pos.y + bob, bot.pos.z);
    const turn = bot.face - orbit.rotation.y;
    let rotY = orbit.rotation.y + Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 6);
    if (motion && bot.act === 'dance') rotY += dt * 9;
    orbit.rotation.y = rotY;
    orbit.rotation.x = motion && bot.act === 'stars' ? -0.35 : 0;
    if (motion) ring.rotation.z = t * 0.9;
    shadowDisc.position.set(bot.pos.x, 0.014, bot.pos.z);
    shadowDisc.scale.setScalar(bot.act === 'sit' ? 0.6 : 1);

    const happy = now < bot.happyUntil;
    let eyeY = happy ? 0.45 : 1;
    if (motion && now > bot.blinkAt) {
      eyeY = 0.1;
      if (now > bot.blinkAt + 120) bot.blinkAt = now + 3000 + Math.random() * 3000;
    }
    if (bot.act === 'sit') eyeY = Math.min(eyeY, 0.35);
    eyeL.scale.y = eyeR.scale.y = eyeY;
    mouth.scale.set(happy ? 1.3 : 1, happy ? 1.3 : 1, 1);
    cheekMat.opacity = happy ? 0.8 : 0;

    for (let i = timed.length - 1; i >= 0; i -= 1) {
      const tm = timed[i];
      const k = Math.min(1, (now - tm.start) / (tm.until - tm.start));
      tm.tick?.(k, dt);
      if (k >= 1) {
        timed.splice(i, 1);
        tm.done?.();
      }
    }
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life += dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.material.opacity = Math.max(0, 1 - p.life / p.max);
      if (p.life > p.max) {
        scene.remove(p.m);
        p.m.geometry.dispose();
        p.m.material.dispose();
        particles.splice(i, 1);
      }
    }
    if (fishGroup && motion) {
      for (const f of fishGroup) {
        const a = t * 1.1 + f.phase;
        f.f.position.set(f.base.x + Math.cos(a) * 0.22, f.base.y + Math.sin(a * 2) * 0.05, f.base.z + Math.sin(a) * 0.1);
        f.f.rotation.y = -a;
      }
    }

    if (!bubble.hidden) {
      tmp.set(orbit.position.x, orbit.position.y + 0.75, orbit.position.z).project(camera);
      bubble.style.left = `${((tmp.x + 1) / 2) * stage.clientWidth}px`;
      bubble.style.top = `${((1 - tmp.y) / 2) * stage.clientHeight}px`;
    }
    if (!float.hidden && selected && items.has(selected)) {
      tmp.copy(items.get(selected).group.position).setY(1.3).project(camera);
      float.style.left = `${((tmp.x + 1) / 2) * stage.clientWidth}px`;
      float.style.top = `${((1 - tmp.y) / 2) * stage.clientHeight}px`;
    }
    renderer.render(scene, camera);
  }

  const onVisibility = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!running) {
      running = true;
      clock.getDelta();
      frame();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  function close() {
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    });
    renderer.dispose();
    thumbRenderer?.dispose();
    root.remove();
    document.body.classList.remove('room-open');
    onClose();
  }

  buildEnv();
  rebuildGrid();
  resize();
  syncFurniture();
  renderPanel();
  frame();
  const hi = today.userName ? `Hi, ${today.userName}.` : 'Hi.';
  const greet = today.done > 0
    ? `${hi} You finished ${today.done === 1 ? 'one thing' : `${today.done} things`} today. Thank you for coming by.`
    : items.size
      ? `${hi} ${ROOMS[roomId].hello}`
      : `${hi} ${ROOMS[roomId].hello} It is a bit empty still. Arrange lets you bring things in.`;
  setTimeout(() => {
    say(greet, 4600);
    if (today.done > 0) heartsAt(orbit.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 6);
  }, motion ? 400 : 0);
  $r('close').focus();
  return { close };
}
