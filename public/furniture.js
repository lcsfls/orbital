// Orbital – detailed low-poly furniture for the 3D house.
// Every item fits one grid cell: x and z from -0.5 to 0.5, y up from the floor, front faces +z.
// build(THREE, def) returns { group, meshes, fx } where fx holds parts that interactions animate.

export function createFurniture(THREE) {
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.04, ...extra });

  function add(g, geo, color, x, y, z, extra) {
    const m = new THREE.Mesh(geo, mat(color, extra));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }
  // y is the bottom of the box.
  const box = (g, w, h, d, c, x = 0, y = 0, z = 0, e) => add(g, new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z, e);
  const cyl = (g, rt, rb, h, c, x = 0, y = 0, z = 0, seg = 18, e) => add(g, new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y + h / 2, z, e);
  const sph = (g, r, c, x, y, z, e) => add(g, new THREE.SphereGeometry(r, 18, 12), c, x, y, z, e);

  // A box with rounded vertical edges (cushions, car body, cabinets).
  function rbox(g, w, h, d, r, c, x = 0, y = 0, z = 0, e) {
    const s = new THREE.Shape();
    const hw = w / 2 - r;
    const hd = d / 2 - r;
    s.moveTo(-hw, -d / 2);
    s.lineTo(hw, -d / 2);
    s.quadraticCurveTo(w / 2, -d / 2, w / 2, -hd);
    s.lineTo(w / 2, hd);
    s.quadraticCurveTo(w / 2, d / 2, hw, d / 2);
    s.lineTo(-hw, d / 2);
    s.quadraticCurveTo(-w / 2, d / 2, -w / 2, hd);
    s.lineTo(-w / 2, -hd);
    s.quadraticCurveTo(-w / 2, -d / 2, -hw, -d / 2);
    const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: Math.min(r, h / 3), bevelSize: Math.min(r, h / 3) * 0.6, bevelSegments: 3, curveSegments: 6 });
    geo.rotateX(-Math.PI / 2);
    const m = add(g, geo, c, x, y, z, e);
    return m;
  }
  const leg = (g, x, z, h, c = 0x3a2a1f, r = 0.025) => cyl(g, r, r * 0.8, h, c, x, 0, z, 8);

  const BUILD = {
    // ---------------- Living room ----------------
    rug(g) {
      cyl(g, 0.48, 0.48, 0.02, 0x7c5cc4, 0, 0, 0, 40);
      cyl(g, 0.38, 0.38, 0.025, 0x9d84dc, 0, 0, 0, 40);
      cyl(g, 0.24, 0.24, 0.03, 0xf2b36b, 0, 0, 0, 32);
      cyl(g, 0.1, 0.1, 0.035, 0x7c5cc4, 0, 0, 0, 24);
    },
    sofa(g, fx) {
      const c = 0x4f7fd6;
      rbox(g, 0.94, 0.16, 0.5, 0.04, 0x3d64ad, 0, 0.08, 0.02);
      rbox(g, 0.42, 0.1, 0.4, 0.05, c, -0.22, 0.24, 0.06);
      rbox(g, 0.42, 0.1, 0.4, 0.05, c, 0.22, 0.24, 0.06);
      rbox(g, 0.94, 0.36, 0.12, 0.05, 0x3d64ad, 0, 0.12, -0.2);
      rbox(g, 0.1, 0.24, 0.48, 0.04, 0x355a9c, -0.47, 0.12, 0.02);
      rbox(g, 0.1, 0.24, 0.48, 0.04, 0x355a9c, 0.47, 0.12, 0.02);
      rbox(g, 0.18, 0.16, 0.06, 0.04, 0xf2b36b, -0.28, 0.33, -0.12);
      for (const [x, z] of [[-0.42, 0.2], [0.42, 0.2], [-0.42, -0.18], [0.42, -0.18]]) leg(g, x, z, 0.08);
      fx.seatY = 0.36;
    },
    armchair(g, fx) {
      rbox(g, 0.6, 0.14, 0.52, 0.04, 0xd9783b, 0, 0.08, 0.02);
      rbox(g, 0.44, 0.1, 0.42, 0.05, 0xea8a4a, 0, 0.22, 0.06);
      rbox(g, 0.6, 0.38, 0.12, 0.05, 0xd9783b, 0, 0.12, -0.2);
      rbox(g, 0.09, 0.22, 0.5, 0.04, 0xc76a30, -0.27, 0.12, 0.02);
      rbox(g, 0.09, 0.22, 0.5, 0.04, 0xc76a30, 0.27, 0.12, 0.02);
      for (const [x, z] of [[-0.25, 0.22], [0.25, 0.22], [-0.25, -0.2], [0.25, -0.2]]) leg(g, x, z, 0.08);
      fx.seatY = 0.34;
    },
    'floor-lamp'(g, fx) {
      cyl(g, 0.14, 0.16, 0.03, 0x3a3e55);
      cyl(g, 0.018, 0.018, 1.0, 0x8b93a7, 0, 0.03);
      const shade = cyl(g, 0.12, 0.2, 0.22, 0xf6dfb0, 0, 1.0, 0, 24, { side: THREE.DoubleSide });
      const bulb = sph(g, 0.05, 0xfff3d6, 0, 1.04, 0);
      fx.glow = [shade, bulb];
      fx.light = new THREE.Vector3(0, 1.05, 0);
    },
    bookshelf(g) {
      const wood = 0x8a5a36;
      box(g, 0.86, 0.04, 0.3, wood, 0, 0, -0.28);
      box(g, 0.86, 0.04, 0.3, wood, 0, 1.06, -0.28);
      box(g, 0.04, 1.1, 0.3, wood, -0.41, 0, -0.28);
      box(g, 0.04, 1.1, 0.3, wood, 0.41, 0, -0.28);
      box(g, 0.86, 1.1, 0.02, 0x6e4529, 0, 0, -0.42);
      const colors = [0xe9a3a3, 0x8fb8e8, 0x9fd3b5, 0xf2b36b, 0xc4a3e9, 0xf3effa, 0x6c8fd6];
      for (let shelf = 0; shelf < 3; shelf += 1) {
        const y = 0.04 + shelf * 0.34;
        if (shelf) box(g, 0.78, 0.03, 0.28, wood, 0, y - 0.03, -0.28);
        let x = -0.36;
        let n = shelf * 3;
        while (x < 0.3) {
          const w = 0.05 + ((n * 7) % 4) * 0.012;
          const h = 0.2 + ((n * 5) % 5) * 0.022;
          const tilt = n % 6 === 5;
          const b = box(g, w, h, 0.22, colors[n % colors.length], x + w / 2, y, -0.28);
          if (tilt) b.rotation.z = 0.25;
          x += w + 0.008;
          n += 1;
        }
      }
      cyl(g, 0.05, 0.04, 0.08, 0xb45309, 0.25, 1.1, -0.28);
      sph(g, 0.07, 0x3f9d5a, 0.25, 1.24, -0.28);
    },
    monstera(g, fx) {
      cyl(g, 0.17, 0.13, 0.28, 0xd8d2c4, 0, 0, 0, 20);
      cyl(g, 0.16, 0.16, 0.02, 0x4a3426, 0, 0.27, 0, 20);
      const leaves = [];
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2;
        const stem = cyl(g, 0.008, 0.01, 0.42 + (i % 3) * 0.08, 0x2f7d47, Math.cos(a) * 0.04, 0.28, Math.sin(a) * 0.04, 6);
        stem.rotation.z = Math.cos(a) * 0.35;
        stem.rotation.x = -Math.sin(a) * 0.35;
        const leaf = add(g, new THREE.SphereGeometry(0.13, 12, 8), i % 2 ? 0x2f9e55 : 0x3db365, Math.cos(a) * 0.2, 0.68 + (i % 3) * 0.08, Math.sin(a) * 0.2);
        leaf.scale.set(1, 0.18, 0.7);
        leaf.rotation.y = -a;
        leaf.rotation.z = 0.3;
        leaves.push(leaf);
      }
      fx.leaves = leaves;
    },
    tv(g, fx) {
      rbox(g, 0.9, 0.3, 0.36, 0.03, 0x5b4636, 0, 0.06, -0.08);
      box(g, 0.42, 0.22, 0.01, 0x6e5644, -0.22, 0.1, 0.11);
      box(g, 0.42, 0.22, 0.01, 0x6e5644, 0.22, 0.1, 0.11);
      for (const x of [-0.4, 0.4]) leg(g, x, 0.05, 0.06, 0x2b2b33);
      box(g, 0.2, 0.03, 0.12, 0x23232b, 0, 0.42, -0.12);
      box(g, 0.04, 0.1, 0.04, 0x23232b, 0, 0.44, -0.14);
      box(g, 0.82, 0.48, 0.04, 0x16161c, 0, 0.52, -0.14);
      const screen = box(g, 0.76, 0.42, 0.005, 0x0c0e18, 0, 0.55, -0.118);
      fx.screen = screen;
    },
    aquarium(g, fx) {
      rbox(g, 0.8, 0.36, 0.42, 0.03, 0x2d3044, 0, 0, 0);
      const water = box(g, 0.74, 0.34, 0.36, 0x5fb6e6, 0, 0.38, 0, { transparent: true, opacity: 0.55, roughness: 0.1 });
      box(g, 0.72, 0.04, 0.34, 0xd9c79c, 0, 0.38, 0);
      for (let i = 0; i < 4; i += 1) {
        const p = cyl(g, 0.012, 0.016, 0.16 + i * 0.03, 0x3db365, -0.25 + i * 0.16, 0.42, -0.08, 6);
        p.rotation.z = (i % 2 ? 1 : -1) * 0.15;
      }
      box(g, 0.8, 0.04, 0.42, 0x23263a, 0, 0.72, 0);
      fx.water = water;
      fx.tank = new THREE.Vector3(0, 0.55, 0);
    },
    telescope(g, fx) {
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2;
        const l = cyl(g, 0.012, 0.015, 0.66, 0x8b93a7, Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, 6);
        l.rotation.z = Math.cos(a) * 0.32;
        l.rotation.x = -Math.sin(a) * 0.32;
      }
      const tube = new THREE.Group();
      tube.position.set(0, 0.66, 0);
      tube.rotation.x = -0.7;
      g.add(tube);
      cyl(tube, 0.07, 0.06, 0.62, 0xf3effa, 0, -0.2, 0, 18);
      cyl(tube, 0.08, 0.08, 0.06, 0x3a3e55, 0, 0.4, 0, 18);
      cyl(tube, 0.025, 0.025, 0.1, 0x23232b, 0, -0.28, 0, 10);
      fx.tube = tube;
    },

    // ---------------- Workshop ----------------
    workbench(g) {
      box(g, 0.94, 0.06, 0.56, 0xb7834d, 0, 0.5, 0);
      for (const [x, z] of [[-0.42, 0.22], [0.42, 0.22], [-0.42, -0.22], [0.42, -0.22]]) box(g, 0.06, 0.5, 0.06, 0x7a5232, x, 0, z);
      box(g, 0.86, 0.03, 0.46, 0x8f6239, 0, 0.14, 0);
      box(g, 0.16, 0.08, 0.1, 0x55606e, 0.3, 0.56, 0.18);
      box(g, 0.2, 0.03, 0.05, 0xd8b04a, -0.2, 0.56, 0.05);
      box(g, 0.05, 0.03, 0.16, 0x3a2a1f, -0.05, 0.56, -0.1);
      cyl(g, 0.04, 0.04, 0.12, 0xe9a3a3, -0.36, 0.56, -0.15, 12);
      box(g, 0.3, 0.12, 0.18, 0x5b6b8a, 0.1, 0.17, -0.05);
    },
    toolbox(g) {
      rbox(g, 0.5, 0.26, 0.28, 0.03, 0xd8443a, 0, 0, 0);
      box(g, 0.52, 0.03, 0.3, 0xb5352d, 0, 0.26, 0);
      box(g, 0.24, 0.03, 0.04, 0x2b2b33, 0, 0.36, 0);
      box(g, 0.03, 0.08, 0.04, 0x2b2b33, -0.11, 0.29, 0);
      box(g, 0.03, 0.08, 0.04, 0x2b2b33, 0.11, 0.29, 0);
      for (const x of [-0.16, 0.16]) box(g, 0.06, 0.04, 0.01, 0xc9ccd6, x, 0.2, 0.145);
    },
    pegboard(g) {
      box(g, 0.9, 0.8, 0.04, 0xcfb58e, 0, 0.35, -0.44);
      for (let ix = 0; ix < 8; ix += 1) for (let iy = 0; iy < 7; iy += 1) cyl(g, 0.008, 0.008, 0.01, 0x8a7350, -0.38 + ix * 0.11, 0.4 + iy * 0.11, -0.418, 6).rotation.x = Math.PI / 2;
      box(g, 0.04, 0.3, 0.03, 0x8a5a36, -0.25, 0.65, -0.4);
      box(g, 0.14, 0.06, 0.05, 0x55606e, -0.25, 0.92, -0.4);
      const w = box(g, 0.04, 0.26, 0.02, 0xc9ccd6, 0.05, 0.7, -0.4);
      w.rotation.z = 0.2;
      for (let i = 0; i < 3; i += 1) box(g, 0.03, 0.14 + i * 0.03, 0.02, [0xf2b36b, 0x8fb8e8, 0xe9a3a3][i], 0.24 + i * 0.07, 0.8, -0.4);
    },
    '3d-printer'(g, fx) {
      box(g, 0.6, 0.08, 0.56, 0x2b2b33, 0, 0, 0);
      for (const [x, z] of [[-0.27, -0.25], [0.27, -0.25], [-0.27, 0.25], [0.27, 0.25]]) box(g, 0.04, 0.62, 0.04, 0x8b93a7, x, 0.08, z);
      box(g, 0.6, 0.04, 0.56, 0x2b2b33, 0, 0.7, 0);
      box(g, 0.4, 0.02, 0.4, 0x8fb8e8, 0, 0.16, 0);
      const head = new THREE.Group();
      head.position.set(0, 0.48, 0);
      g.add(head);
      box(head, 0.56, 0.03, 0.04, 0x55606e, 0, 0, 0);
      box(head, 0.08, 0.08, 0.08, 0xf2b36b, 0, -0.06, 0);
      cyl(g, 0.12, 0.12, 0.06, 0x4ade80, 0.2, 0.74, 0, 20).rotation.x = Math.PI / 2;
      const print = cyl(g, 0.06, 0.06, 0.01, 0xf2b36b, 0, 0.18, 0, 12);
      fx.head = head;
      fx.print = print;
    },
    'server-rack'(g, fx) {
      rbox(g, 0.56, 1.0, 0.56, 0.02, 0x1d2230, 0, 0, 0);
      const leds = [];
      for (let i = 0; i < 6; i += 1) {
        box(g, 0.48, 0.1, 0.01, 0x2d3346, 0, 0.12 + i * 0.14, 0.285);
        for (let j = 0; j < 3; j += 1) leds.push(box(g, 0.02, 0.02, 0.01, j === 2 && i % 2 ? 0xf2b36b : 0x4ade80, 0.14 + j * 0.04, 0.16 + i * 0.14, 0.292, { emissive: j === 2 && i % 2 ? 0xa86a1c : 0x1f8a46 }));
      }
      fx.leds = leds;
    },
    stool(g, fx) {
      cyl(g, 0.19, 0.19, 0.05, 0xb7834d, 0, 0.42, 0, 24);
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2;
        const l = cyl(g, 0.018, 0.022, 0.44, 0x7a5232, Math.cos(a) * 0.11, 0, Math.sin(a) * 0.11, 8);
        l.rotation.z = Math.cos(a) * 0.15;
        l.rotation.x = -Math.sin(a) * 0.15;
      }
      cyl(g, 0.13, 0.13, 0.015, 0x7a5232, 0, 0.18, 0, 20);
      fx.seatY = 0.47;
    },
    'desk-lamp'(g, fx) {
      cyl(g, 0.12, 0.13, 0.03, 0x2b2b33);
      const a1 = cyl(g, 0.014, 0.014, 0.34, 0xf2b36b, 0.02, 0.03, 0, 8);
      a1.rotation.z = -0.35;
      const a2 = cyl(g, 0.014, 0.014, 0.28, 0xf2b36b, 0.14, 0.32, 0, 8);
      a2.rotation.z = 0.9;
      const head = cyl(g, 0.04, 0.1, 0.12, 0x2b2b33, 0.02, 0.48, 0, 18, { side: THREE.DoubleSide });
      head.rotation.z = 0.5;
      const bulb = sph(g, 0.035, 0xfff3d6, 0.0, 0.47, 0);
      fx.glow = [bulb];
      fx.light = new THREE.Vector3(0, 0.45, 0);
    },
    bike(g, fx) {
      const wheels = [];
      for (const x of [-0.3, 0.3]) {
        const w = add(g, new THREE.TorusGeometry(0.17, 0.025, 8, 28), 0x23232b, x, 0.2, 0);
        add(w, new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8), 0x8b93a7, 0, 0, 0).rotation.x = Math.PI / 2;
        wheels.push(w);
      }
      const bar = (x1, y1, x2, y2) => {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const m = cyl(g, 0.016, 0.016, len, 0x4f7fd6, (x1 + x2) / 2, (y1 + y2) / 2 - len / 2, 0, 8);
        m.rotation.z = Math.atan2(x1 - x2, y2 - y1);
        return m;
      };
      bar(-0.3, 0.2, -0.02, 0.2);
      bar(-0.02, 0.2, 0.2, 0.44);
      bar(-0.3, 0.2, -0.1, 0.44);
      bar(-0.1, 0.44, 0.2, 0.44);
      bar(0.3, 0.2, 0.22, 0.5);
      box(g, 0.12, 0.03, 0.06, 0x23232b, -0.12, 0.47, 0);
      box(g, 0.03, 0.03, 0.22, 0x23232b, 0.22, 0.52, 0);
      box(g, 0.5, 0.03, 0.06, 0x55606e, 0, 0, 0);
      fx.wheels = wheels;
    },

    // ---------------- Garden ----------------
    hammock(g, fx) {
      for (const x of [-0.44, 0.44]) {
        box(g, 0.07, 0.8, 0.07, 0x7a5232, x, 0, 0);
        box(g, 0.2, 0.04, 0.07, 0x7a5232, x, 0.78, 0);
      }
      const n = 9;
      for (let i = 0; i < n; i += 1) {
        const t = i / (n - 1);
        const x = -0.38 + t * 0.76;
        const y = 0.62 - Math.sin(t * Math.PI) * 0.28;
        const seg = box(g, 0.1, 0.02, 0.34, i % 2 ? 0xf2b36b : 0xe9a3a3, x, y, 0);
        seg.rotation.z = Math.cos(t * Math.PI) * 0.55;
      }
      fx.seatY = 0.4;
    },
    car(g, fx) {
      rbox(g, 0.9, 0.2, 0.52, 0.08, 0xe86a5f, 0, 0.1, 0);
      rbox(g, 0.5, 0.16, 0.46, 0.06, 0xe86a5f, -0.04, 0.3, 0);
      box(g, 0.46, 0.11, 0.47, 0x9fc7f0, -0.04, 0.33, 0, { roughness: 0.15 });
      for (const [x, z] of [[-0.28, 0.25], [0.28, 0.25], [-0.28, -0.25], [0.28, -0.25]]) {
        const w = cyl(g, 0.1, 0.1, 0.07, 0x23232b, x, 0.1, z, 18);
        w.rotation.x = Math.PI / 2;
        w.position.y = 0.1;
      }
      for (const z of [-0.16, 0.16]) box(g, 0.02, 0.05, 0.08, 0xfff3d6, 0.45, 0.18, z, { emissive: 0x554422 });
      box(g, 0.04, 0.04, 0.4, 0x8b93a7, -0.46, 0.12, 0);
      fx.body = g.children[0];
    },
    tree(g, fx) {
      cyl(g, 0.07, 0.1, 0.62, 0x6e4529, 0, 0, 0, 10);
      const crown = [];
      for (const [x, y, z, r] of [[0, 0.86, 0, 0.32], [0.16, 0.74, 0.08, 0.22], [-0.15, 0.76, -0.06, 0.22], [0.02, 1.1, 0.02, 0.2]]) {
        crown.push(add(g, new THREE.IcosahedronGeometry(r, 1), 0x3f9d5a, x, y, z, { flatShading: true }));
      }
      const apples = [];
      for (const [x, y, z] of [[0.24, 0.8, 0.18], [-0.2, 0.9, 0.2], [0.1, 0.62, 0.27], [-0.05, 1.05, 0.22]]) apples.push(sph(g, 0.045, 0xe0443a, x, y, z));
      fx.apples = apples;
      fx.crown = crown;
    },
    'flower-bed'(g, fx) {
      box(g, 0.86, 0.12, 0.5, 0x8a5a36, 0, 0, 0);
      box(g, 0.8, 0.02, 0.44, 0x4a3426, 0, 0.11, 0);
      const flowers = [];
      const colors = [0xf472b6, 0xfbbf24, 0xa78bfa, 0xf3effa, 0xe9a3a3];
      for (let i = 0; i < 10; i += 1) {
        const x = -0.33 + (i % 5) * 0.165;
        const z = i < 5 ? -0.1 : 0.1;
        cyl(g, 0.008, 0.008, 0.16, 0x2f7d47, x, 0.12, z, 5);
        flowers.push(sph(g, 0.045, colors[(i * 3) % colors.length], x, 0.3, z));
      }
      fx.leaves = flowers;
    },
    bench(g, fx) {
      for (let i = 0; i < 3; i += 1) box(g, 0.9, 0.03, 0.09, 0xb7834d, 0, 0.36, -0.1 + i * 0.11);
      for (let i = 0; i < 2; i += 1) {
        const b = box(g, 0.9, 0.08, 0.03, 0xb7834d, 0, 0.5 + i * 0.12, -0.2);
        b.rotation.x = -0.15;
      }
      for (const x of [-0.38, 0.38]) {
        box(g, 0.05, 0.36, 0.05, 0x2b2b33, x, 0, 0.1);
        box(g, 0.05, 0.62, 0.05, 0x2b2b33, x, 0, -0.18);
        box(g, 0.05, 0.04, 0.32, 0x2b2b33, x, 0.5, -0.03);
      }
      fx.seatY = 0.4;
    },
    pond(g, fx) {
      for (let i = 0; i < 14; i += 1) {
        const a = (i / 14) * Math.PI * 2;
        const st = add(g, new THREE.DodecahedronGeometry(0.07 + (i % 3) * 0.012, 0), i % 2 ? 0x9a9aa5 : 0x7f808c, Math.cos(a) * 0.4, 0.03, Math.sin(a) * 0.4, { flatShading: true });
        st.scale.y = 0.6;
      }
      const water = cyl(g, 0.36, 0.36, 0.02, 0x3d8fd0, 0, 0, 0, 32, { roughness: 0.1, emissive: 0x0b2a44 });
      const pad = cyl(g, 0.08, 0.08, 0.01, 0x3db365, 0.12, 0.022, -0.06, 16);
      sph(g, 0.03, 0xf9c4dd, 0.12, 0.05, -0.06);
      fx.water = water;
      fx.pad = pad;
    },
    'bird-house'(g, fx) {
      box(g, 0.05, 0.62, 0.05, 0x7a5232, 0, 0, 0);
      box(g, 0.24, 0.22, 0.22, 0xf2b36b, 0, 0.62, 0);
      for (const s of [-1, 1]) {
        const r = box(g, 0.17, 0.02, 0.28, 0xb5352d, s * 0.07, 0.86, 0);
        r.rotation.z = -s * 0.6;
      }
      cyl(g, 0.04, 0.04, 0.01, 0x2b2420, 0, 0.73, 0.112, 14).rotation.x = Math.PI / 2;
      box(g, 0.08, 0.01, 0.04, 0x7a5232, 0, 0.66, 0.13);
      fx.perch = new THREE.Vector3(0, 0.7, 0.16);
    },
    grill(g, fx) {
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        const l = cyl(g, 0.012, 0.012, 0.42, 0x2b2b33, Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13, 6);
        l.rotation.z = Math.cos(a) * 0.25;
        l.rotation.x = -Math.sin(a) * 0.25;
      }
      const kettle = add(g, new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0x23232b, 0, 0.6, 0, { side: THREE.DoubleSide });
      const coals = cyl(g, 0.19, 0.19, 0.02, 0x2b2420, 0, 0.5, 0, 20);
      const lid = add(g, new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), 0x2b2b33, 0, 0.62, 0);
      sph(g, 0.025, 0x8b93a7, 0, 0.84, 0);
      fx.coals = coals;
      fx.lid = lid;
      fx.kettle = kettle;
    },
    lantern(g, fx) {
      cyl(g, 0.06, 0.08, 0.04, 0x2b2b33);
      cyl(g, 0.02, 0.02, 0.62, 0x2b2b33, 0, 0.04);
      box(g, 0.14, 0.02, 0.14, 0x2b2b33, 0, 0.66);
      const glass = box(g, 0.11, 0.16, 0.11, 0xfff3d6, 0, 0.68, 0, { transparent: true, opacity: 0.85 });
      const cap = cyl(g, 0.01, 0.1, 0.07, 0x2b2b33, 0, 0.84, 0, 4);
      cap.rotation.y = Math.PI / 4;
      fx.glow = [glass];
      fx.light = new THREE.Vector3(0, 0.76, 0);
    },
  };

  // Fallback for anything without a hand-made model: the simple catalogue parts.
  function fromParts(g, def) {
    for (const p of def.parts) {
      if (p.t === 'box') box(g, p.w, Math.max(p.h, 0.01), p.d, p.c, p.x + p.w / 2 - 0.5, p.z, p.y + p.d / 2 - 0.5);
      else if (p.t === 'ball') sph(g, p.r, p.c, p.x - 0.5, p.z, p.y - 0.5);
      else cyl(g, 0.03, 0.03, p.h, p.c, p.x - 0.5, p.z, p.y - 0.5, 8);
    }
  }

  function build(def) {
    const group = new THREE.Group();
    const fx = {};
    if (BUILD[def.id]) BUILD[def.id](group, fx);
    else fromParts(group, def);
    const meshes = [];
    group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = !['rug', 'pond'].includes(def.id);
        o.receiveShadow = true;
        o.userData.itemId = def.id;
        meshes.push(o);
      }
    });
    group.userData.itemId = def.id;
    return { group, meshes, fx };
  }

  return { build };
}
