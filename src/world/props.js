// Building blocks of Chernobrod. Everything takes the World (w) and adds merged
// static geometry plus colliders / lights / emitters.
import * as THREE from 'three';
import { Builder, mat4, prismGeo, tubeGeo, onionGeo } from './builder.js';
import { groundHeight, CHURCH } from './terrain.js';
import { rng, TAU } from '../core/util.js';

const PI = Math.PI;
const WOODS = [0x6e5a48, 0x5d4c3e, 0x74614f, 0x4f4136, 0x66584c];
const ROOT = 0x1d1216, ROOT2 = 0x2a1418;

/** Log izba with a steep thatched gable roof. Local +Z is the front. */
export function house(w, o) {
  const { x, z, rot = 0, W = 7, D = 6, H = 3, roofH = 3.4, corr = 0, open = false, seed = 1, chimney = true, lit = false, roofMat = 'thatch' } = o;
  const r = rng(seed * 7919 + 13), B = new Builder(), y0 = 0.3;
  const col = o.col || WOODS[(r() * WOODS.length) | 0], trim = 0x9a8e7a, dark = 0x2a2018;
  const roofCol = roofMat === 'thatch' ? [0x8a7a55, 0x7a6e52, 0x6e6248][(r() * 3) | 0] : 0x4a403a;
  B.box('stone', W + 0.5, 1.6, D + 0.5, 0, -0.45, 0, 0x6a6660);
  if (!open) B.box('wood', W, H, D, 0, y0 + H / 2, 0, col);
  else {
    B.box('wood', 0.35, H, D, -W / 2 + 0.17, y0 + H / 2, 0, col); B.box('wood', 0.35, H, D, W / 2 - 0.17, y0 + H / 2, 0, col);
    B.box('wood', W, H, 0.35, 0, y0 + H / 2, -D / 2 + 0.17, col);
    B.box('plank', W - 0.4, 0.12, D - 0.3, 0, y0 + 0.02, 0, 0x5a4a3c);
    B.box('wood', W * 0.2, H, 0.35, -W / 2 + W * 0.1, y0 + H / 2, D / 2 - 0.17, col);
    B.box('wood', W * 0.14, H * 0.5, 0.35, W / 2 - W * 0.07, y0 + H * 0.25, D / 2 - 0.17, col, 0, 0, 0.08);
    B.box('wood', W * 0.5, 0.3, 0.3, W * 0.1, y0 + 0.2, D / 2 + 0.5, col, 0, 0.5, 0.05);     // fallen beams
    B.box('wood', 0.3, 0.3, D * 0.6, -W * 0.15, y0 + 1.1, D * 0.15, col, 0.5, 0.2, 0);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('wood', 0.34, H + 0.1, 0.34, sx * (W / 2 + 0.03), y0 + H / 2, sz * (D / 2 + 0.03), 0x4a3c30);
  const hw = W / 2 + 0.7, L = Math.hypot(hw, roofH), a = Math.atan2(roofH, hw), ry = y0 + H;
  B.box(roofMat, L + 0.3, 0.3, D + 1.5, -hw / 2, ry + roofH / 2, 0, roofCol, 0, 0, a);
  if (!open || r() < 0.5) B.box(roofMat, L + 0.3, 0.3, D + 1.5, hw / 2, ry + roofH / 2, 0, roofCol, 0, 0, -a);
  else { B.box(roofMat, L * 0.55, 0.3, D + 1.5, hw * 0.72, ry + roofH * 0.28, 0, roofCol, 0, 0, -a); for (let i = 0; i < 4; i++) B.box('wood', 0.16, L, 0.16, hw / 2, ry + roofH / 2, -D / 2 + (i + 0.5) * D / 4, 0x3a2e25, 0, 0, PI / 2 - a); }
  for (const s of [-1, 1]) B.geo('plank', prismGeo(hw * 2 - 0.4, roofH - 0.15, 0.16), mat4(0, ry, s * (D / 2 - 0.06)), 0x5d4b3c);
  for (const s of [-1, 1]) B.box('plank', L + 0.5, 0.3, 0.09, s * hw / 2, ry + roofH / 2 - 0.08, D / 2 + 0.78, trim, 0, 0, -s * a);
  // crossed horse-head finials (koniki) at the gable peak
  B.box('plank', 1.6, 0.14, 0.08, Math.cos(a) * 0.5, ry + roofH + Math.sin(a) * 0.5 - 0.05, D / 2 + 0.8, trim, 0, 0, a);
  B.box('plank', 1.6, 0.14, 0.08, -Math.cos(a) * 0.5, ry + roofH + Math.sin(a) * 0.5 - 0.05, D / 2 + 0.82, trim, 0, 0, -a);
  const doorX = (r() - 0.5) * W * 0.3;
  if (!open) {
    B.box('plank', 1.15, 2.05, 0.12, doorX, y0 + 1.02, D / 2 + 0.03, dark);
    B.box('plank', 1.5, 0.16, 0.18, doorX, y0 + 2.14, D / 2 + 0.06, trim);
    const win = (wx, wz, ry2) => {
      const m = mat4(wx, 0, wz, 0, ry2, 0), LB = new Builder();
      LB.box('plank', 1.05, 1.15, 0.1, 0, y0 + 1.8, 0.03, trim);
      LB.box(lit ? 'window' : 'plain', 0.72, 0.82, 0.14, 0, y0 + 1.8, 0.04, 0x08080a);
      LB.box('plank', 0.06, 0.82, 0.16, 0, y0 + 1.8, 0.05, trim);
      LB.geo('plank', prismGeo(1.2, 0.32, 0.1), mat4(0, y0 + 2.38, 0.04), trim);
      if (r() < 0.6) LB.box('plank', 0.4, 0.9, 0.06, -0.75, y0 + 1.7, 0.06, 0x5a6a5c, 0, 0, (r() - 0.5) * 0.5);
      for (const it of LB.items) { it.m.premultiply(m); B.items.push(it); }
    };
    for (const wx of [-W * 0.3, W * 0.3]) if (Math.abs(wx - doorX) > 1.3) win(wx, D / 2, 0);
    win(W / 2, 0, PI / 2); win(-W / 2, 0, -PI / 2);
  }
  if (chimney) B.box('stone', 0.75, roofH + 0.4, 0.75, W * 0.18, ry + roofH * 0.5, -D * 0.2, 0x6a625c);
  B.box('plank', 2, 0.24, 1, doorX, 0.12, D / 2 + 0.55, 0x4a3c30);
  const gy = groundHeight(x, z), world = mat4(x, gy, z, 0, rot, 0);
  const tw = corr * (r() - 0.5) * 0.9, lean = corr * (r() - 0.5) * 0.7, lz = corr * (r() - 0.5) * 0.6;
  const deform = corr > 0.03 ? (p) => {
    const k = Math.max(0, p.y - 0.3), an = tw * k * 0.1, c = Math.cos(an), s = Math.sin(an);
    const px = p.x * c - p.z * s, pz = p.x * s + p.z * c;
    p.x = px + lean * k * k * 0.05; p.z = pz + lz * k * k * 0.05; p.y -= Math.abs(lean) * k * 0.04;
  } : null;
  B.flush(w.batch, world, deform);
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (side, fwd, up = 0) => ({ x: x + side * c + fwd * s, y: gy + up, z: z - side * s + fwd * c });
  if (!open) w.addBox(x, z, W / 2, D / 2, rot, H + roofH);
  else {
    const p1 = at(-W / 2 + 0.17, 0), p2 = at(W / 2 - 0.17, 0), p3 = at(0, -D / 2 + 0.17), p4 = at(-W / 2 + W * 0.1, D / 2 - 0.17);
    w.addBox(p1.x, p1.z, 0.25, D / 2, rot, H); w.addBox(p2.x, p2.z, 0.25, D / 2, rot, H); w.addBox(p3.x, p3.z, W / 2, 0.25, rot, H); w.addBox(p4.x, p4.z, W * 0.1, 0.25, rot, H);
  }
  return { x, z, rot, W, D, H, roofH, gy, at, doorX };
}

/** Roots crawling over a building. */
export function rootsOver(w, h, n = 3, seed = 1) {
  const r = rng(seed * 31 + 7), B = new Builder(), { W, D, H, roofH } = h;
  for (let i = 0; i < n; i++) {
    const zz = (r() - 0.5) * D * 0.9, side = r() < 0.5 ? -1 : 1, rad = 0.14 + r() * 0.2;
    const pts = [[side * (W / 2 + 1.6 + r()), -0.4, zz + (r() - 0.5) * 2], [side * (W / 2 + 0.35), H * 0.6, zz], [side * (W / 2 + 0.5), H + 0.5, zz + (r() - 0.5)],
      [side * W * 0.22, H + roofH * 0.75, zz + (r() - 0.5)], [-side * W * 0.1, H + roofH + 0.35, zz + (r() - 0.5) * 1.5], [-side * (W / 2 + 0.3), H + roofH * 0.2 + r(), zz + (r() - 0.5) * 2]];
    B.geo('root', tubeGeo(pts, rad, rad * 0.25, 16, 5), null, r() < 0.5 ? ROOT : ROOT2);
    if (r() < 0.6) B.sph('glow', 0.18 + r() * 0.2, side * (W / 2 + 0.4), H * (0.4 + r() * 0.5), zz);
  }
  B.flush(w.batch, mat4(h.x, h.gy, h.z, 0, h.rot, 0), null, 0.3);
}

/** A knot of black roots, thorns and glowing pustules erupting from the ground. */
export function growth(w, x, z, size = 1, seed = 1, light = true) {
  const r = rng(seed * 97 + 5), B = new Builder(), y = groundHeight(x, z);
  const n = 3 + ((r() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, len = size * (1.4 + r() * 2.2), h = size * (0.6 + r() * 1.5), sx = Math.sin(a), cz = Math.cos(a), b = (r() - 0.5) * len * 0.5;
    const pts = [[0, -0.3, 0], [sx * len * 0.25 - cz * b * 0.3, h, cz * len * 0.25 + sx * b * 0.3], [sx * len * 0.7 - cz * b, h * 0.7, cz * len * 0.7 + sx * b], [sx * len, -0.4, cz * len]];
    B.geo('root', tubeGeo(pts, size * (0.14 + r() * 0.14), size * 0.05, 10, 5), null, r() < 0.5 ? ROOT : ROOT2);
  }
  const sp = 2 + ((r() * 4) | 0);
  for (let i = 0; i < sp; i++) { const a = r() * TAU, d = r() * size * 0.9, h = size * (0.7 + r() * 1.6); B.cone('root', size * 0.13, h, Math.sin(a) * d, h / 2 - 0.1, Math.cos(a) * d, ROOT, (r() - 0.5) * 0.7, 0, (r() - 0.5) * 0.7, 5); }
  const pu = 1 + ((r() * 3) | 0);
  for (let i = 0; i < pu; i++) { const a = r() * TAU, d = r() * size * 0.6; B.sph('glow', size * (0.14 + r() * 0.18), Math.sin(a) * d, size * (0.2 + r() * 0.5), Math.cos(a) * d, 0xffffff, 1, 1.15, 1); }
  B.flush(w.batch, mat4(x, y, z), null, 0.3);
  if (size > 0.9) w.addCircle(x, z, size * 0.35);
  if (light) w.lights.push({ x, y: y + size * 0.6, z, color: 0xff2408, i: 9 * size, r: 9, pulse: true });
  w.emitters.push({ x, y: y + size * 0.4, z, type: 'curse', rate: 1.2 * size });
}

/** Gnarled dead tree, optionally with something hanging from it. */
export function deadTree(w, x, z, scale = 1, seed = 1, hang = false) {
  const r = rng(seed * 53 + 11), B = new Builder(), col = [0x241d1a, 0x2c2420, 0x1c1614][(r() * 3) | 0];
  const tips = [];
  const branch = (p, dir, len, rad, depth) => {
    const e = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len];
    B.between('root', p, e, rad, rad * 0.62, col, 5);
    if (depth <= 0 || rad < 0.035) { tips.push(e); return; }
    const kids = depth > 2 ? 2 : 2 + ((r() * 2) | 0);
    for (let i = 0; i < kids; i++) {
      const d = [dir[0] + (r() - 0.5) * 1.5, dir[1] * 0.75 + r() * 0.35, dir[2] + (r() - 0.5) * 1.5], l = Math.hypot(d[0], d[1], d[2]);
      branch(e, [d[0] / l, d[1] / l, d[2] / l], len * (0.62 + r() * 0.2), rad * 0.62, depth - 1);
    }
  };
  branch([0, -0.3, 0], [(r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3], 2.4 * scale, 0.34 * scale, 4);
  if (hang && tips.length) {
    const t = tips.filter((p) => p[1] > 3 * scale).sort((a, b) => Math.hypot(a[0], a[2]) - Math.hypot(b[0], b[2])).slice(-3);
    for (const p of t.slice(0, 1 + ((r() * 2) | 0))) {
      const l = p[1] - 1.9 - r() * 0.8;
      B.cyl('plain', 0.025, 0.025, l, p[0], p[1] - l / 2, p[2], 0x6a5c44);
      B.sph('cloth', 0.34, p[0], p[1] - l - 0.6, p[2], 0x3a332c, 0.9, 2.2, 0.9, 6);       // shrouded shape
      B.sph('plain', 0.17, p[0], p[1] - l + 0.18, p[2], 0x4a443c);
    }
  }
  B.flush(w.batch, mat4(x, groundHeight(x, z), z, 0, r() * TAU, 0), null, 0.25);
  w.addCircle(x, z, 0.4 * scale);
}

export function fence(w, x1, z1, x2, z2, collide = true, corr = 0) {
  const B = new Builder(), dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), n = Math.max(1, Math.round(len / 1.6)), r = rng((x1 * 31 + z1 * 17) | 0);
  const rot = Math.atan2(dx, dz);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x1 + dx * t, z = z1 + dz * t, y = groundHeight(x, z);
    B.cyl('plain', 0.07, 0.09, 1.3 + r() * 0.2, x, y + 0.55, z, 0x4a3e33, (r() - 0.5) * 0.25 * (1 + corr * 2), 0, (r() - 0.5) * 0.25 * (1 + corr * 2), 5);
    if (i < n && r() > corr * 0.4) {
      const xm = x1 + dx * (t + 0.5 / n), zm = z1 + dz * (t + 0.5 / n), ym = groundHeight(xm, zm);
      B.box('plank', 0.06, 0.12, len / n + 0.1, xm, ym + 0.45, zm, 0x54463a, (r() - 0.5) * 0.1, rot, 0);
      if (r() > 0.25) B.box('plank', 0.06, 0.12, len / n + 0.1, xm, ym + 0.95, zm, 0x54463a, (r() - 0.5) * 0.14, rot, 0);
    }
  }
  B.flush(w.batch, null, null, 0.14, (z1 + z2) / 2);
  if (collide) w.addBox((x1 + x2) / 2, (z1 + z2) / 2, 0.15, len / 2, rot, 1.2);
}

export function well(w, x, z) {
  const B = new Builder(), y = groundHeight(x, z);
  B.cyl('stone', 1.15, 1.25, 1.1, 0, 0.5, 0, 0x77726a, 0, 0, 0, 10); B.cyl('plain', 0.95, 0.95, 0.1, 0, 1.0, 0, 0x050404, 0, 0, 0, 10);
  for (const s of [-1, 1]) B.box('wood', 0.2, 2.6, 0.2, s * 1.15, 1.3, 0, 0x4a3c30);
  B.box('thatch', 2.2, 0.16, 1.5, -0.62, 2.9, 0, 0x6e6248, 0, 0, 0.6); B.box('thatch', 2.2, 0.16, 1.5, 0.62, 2.9, 0, 0x6e6248, 0, 0, -0.6);
  B.cyl('wood', 0.1, 0.1, 2.3, 0, 2.3, 0, 0x3a2e25, 0, 0, PI / 2); B.cyl('plain', 0.02, 0.02, 1.1, 0.2, 1.75, 0, 0x6a5c44);
  B.cyl('plank', 0.2, 0.16, 0.34, 0.2, 1.15, 0, 0x54463a);
  B.geo('root', tubeGeo([[0, 0.9, 0], [0.5, 1.5, 0.6], [1.5, 0.9, 1.2], [2.4, -0.3, 1.6]], 0.2, 0.05, 10, 5), null, ROOT);
  B.geo('root', tubeGeo([[0, 0.9, 0], [-0.7, 1.4, -0.3], [-1.6, 0.6, -1.3], [-1.9, -0.3, -2.4]], 0.16, 0.04, 10, 5), null, ROOT2);
  B.sph('glow', 0.2, 0.55, 1.3, 0.6);
  B.flush(w.batch, mat4(x, y, z), null);
  w.addCircle(x, z, 1.4);
  w.lights.push({ x, y: y + 1.6, z, color: 0xff2408, i: 7, r: 8, pulse: true });
}

export function cart(w, x, z, rot = 0, broken = false) {
  const B = new Builder();
  B.box('plank', 1.6, 0.14, 3, 0, 0.85, 0, 0x5a4a3c, 0, 0, broken ? 0.22 : 0);
  for (const s of [-1, 1]) B.box('plank', 0.1, 0.55, 3, s * 0.78, 1.15, 0, 0x54463a, 0, 0, broken ? 0.22 : 0);
  B.cyl('wood', 0.65, 0.65, 0.12, -0.9, 0.65, 0.2, 0x3a2e25, 0, 0, PI / 2, 10);
  if (!broken) B.cyl('wood', 0.65, 0.65, 0.12, 0.9, 0.65, 0.2, 0x3a2e25, 0, 0, PI / 2, 10); else B.cyl('wood', 0.65, 0.65, 0.12, 1.5, 0.1, 1, 0x3a2e25, 0.1, 0, 0, 10);
  for (const s of [-1, 1]) B.box('wood', 0.09, 0.09, 2.2, s * 0.5, 0.75, 2.5, 0x4a3c30, 0.25, 0, 0);
  B.flush(w.batch, mat4(x, groundHeight(x, z), z, 0, rot, 0), null);
  w.addBox(x, z, 0.9, 1.6, rot, 1.4);
}
export function barrel(w, x, z, tipped = false) {
  const B = new Builder();
  B.cyl('plank', 0.38, 0.38, 0.95, 0, tipped ? 0.38 : 0.48, 0, 0x5e4d3d, tipped ? PI / 2 : 0, 0, 0, 9);
  B.cyl('metal', 0.4, 0.4, 0.06, 0, tipped ? 0.38 : 0.75, tipped ? 0.25 : 0, 0x3a3836, tipped ? PI / 2 : 0, 0, 0, 9);
  B.flush(w.batch, mat4(x, groundHeight(x, z), z, 0, x * 3.1, 0), null);
  w.addCircle(x, z, 0.42);
}
export function crate(w, x, z, s = 0.8, rot = 0, col = 0x5a4a3c) {
  const B = new Builder();
  B.box('plank', s, s, s, 0, s / 2, 0, col); B.box('plank', s + 0.05, 0.09, s + 0.05, 0, s * 0.82, 0, 0x4a3c30);
  B.flush(w.batch, mat4(x, groundHeight(x, z), z, 0, rot, 0), null);
  w.addBox(x, z, s / 2, s / 2, rot, s);
}
export function hay(w, x, z, rot = 0) {
  const B = new Builder();
  B.cyl('thatch', 0.75, 0.75, 1.3, 0, 0.7, 0, 0x8a7a50, 0, 0, PI / 2, 10);
  B.flush(w.batch, mat4(x, groundHeight(x, z), z, 0, rot, 0), null);
  w.addCircle(x, z, 0.8);
}
export function scarecrow(w, x, z, rot = 0) {
  const B = new Builder();
  B.cyl('plain', 0.07, 0.09, 2.9, 0, 1.4, 0, 0x4a3e33, 0, 0, 0.06); B.cyl('plain', 0.05, 0.05, 2.1, 0, 2.2, 0, 0x4a3e33, 0, 0, PI / 2 + 0.08);
  B.sph('cloth', 0.24, 0.05, 2.75, 0, 0x8a7c5e, 1, 1.15, 1); B.box('cloth', 0.7, 0.9, 0.2, 0, 1.85, 0, 0x4a4136, 0, 0, 0.05);
  for (const s of [-1, 1]) B.box('cloth', 0.6, 0.3, 0.12, s * 0.7, 2.1, 0, 0x4a4136, 0, 0, s * 0.15);
  B.cone('thatch', 0.4, 0.3, 0.05, 3.02, 0, 0x6e6248);
  B.flush(w.batch, mat4(x, groundHeight(x, z), z, 0, rot, 0), null);
  w.addCircle(x, z, 0.2);
}
export function torch(w, x, z, lit = true, h = 2.2) {
  const B = new Builder(), y = groundHeight(x, z);
  B.cyl('plain', 0.06, 0.08, h, 0, h / 2, 0, 0x3a2e25, 0.05, 0, 0.04); B.cyl('metal', 0.14, 0.09, 0.22, 0.02, h + 0.05, 0, 0x2a2826);
  if (lit) B.cone('fire', 0.1, 0.3, 0.02, h + 0.3, 0);
  B.flush(w.batch, mat4(x, y, z), null);
  if (lit) { w.lights.push({ x, y: y + h + 0.5, z, color: 0xff8a3a, i: 26, r: 15, flicker: true }); w.emitters.push({ x, y: y + h + 0.2, z, type: 'flame', rate: 22 }); }
}
/** Orthodox grave cross with a little roof (golubets), a slab, or a child's cross. */
export function grave(w, x, z, kind = 0, rot = 0, seed = 1) {
  const r = rng(seed * 13 + 3), B = new Builder(), tilt = (r() - 0.5) * 0.4, wood = 0x4a4038;
  if (kind === 0) {
    B.box('plank', 0.14, 1.9, 0.12, 0, 0.9, 0, wood); B.box('plank', 0.9, 0.12, 0.1, 0, 1.35, 0, wood); B.box('plank', 0.5, 0.1, 0.1, 0, 1.65, 0, wood); B.box('plank', 0.6, 0.1, 0.1, 0, 0.75, 0, wood, 0, 0, 0.5);
    B.box('plank', 0.8, 0.08, 0.3, -0.25, 1.95, 0, wood, 0, 0, 0.7); B.box('plank', 0.8, 0.08, 0.3, 0.25, 1.95, 0, wood, 0, 0, -0.7);
  } else if (kind === 1) {
    B.box('stone', 0.75, 1.1, 0.2, 0, 0.5, 0, 0x6a6a66); B.cyl('stone', 0.375, 0.375, 0.2, 0, 1.05, 0, 0x6a6a66, PI / 2, 0, 0, 8);
  } else {
    B.box('plank', 0.08, 0.8, 0.07, 0, 0.38, 0, 0x6a5e50); B.box('plank', 0.42, 0.07, 0.06, 0, 0.55, 0, 0x6a5e50); B.box('plank', 0.26, 0.06, 0.06, 0, 0.26, 0, 0x6a5e50, 0, 0, 0.5);
    B.box('plain', 0.7, 0.06, 1.25, 0, 0.0, 0.85, 0x040303);                                     // the open, empty pit
    B.box('plain', 0.9, 0.22, 0.4, 0.75, 0.08, 0.9, 0x2a2018, 0, 0.3, 0);                        // spoil heap, never returned
  }
  B.flush(w.batch, mat4(x, groundHeight(x, z), z, tilt * (kind === 2 ? 0.3 : 1), rot, tilt * 0.6), null);
  if (kind < 2) w.addCircle(x, z, 0.3);
}
export function corpse(w, x, z, rot = 0, templar = false) {
  const B = new Builder(), skin = 0x5a5e52;
  const body = templar ? 0xa8a294 : 0x5a5044, metal = templar ? 'metal' : 'cloth';
  B.box('cloth', 0.5, 0.26, 0.75, 0, 0.16, 0, body); B.box(metal, 0.2, 0.2, 0.7, -0.18, 0.12, -0.72, templar ? 0x6a6d70 : 0x3a332c, 0, 0.12, 0); B.box(metal, 0.2, 0.2, 0.7, 0.2, 0.12, -0.7, templar ? 0x6a6d70 : 0x3a332c, 0, -0.2, 0);
  B.box(metal, 0.16, 0.16, 0.6, -0.5, 0.1, 0.25, templar ? 0x6a6d70 : skin, 0, 0.9, 0); B.box(metal, 0.16, 0.16, 0.6, 0.42, 0.1, 0.4, templar ? 0x6a6d70 : skin, 0, -0.5, 0);
  if (templar) { B.cyl('metal', 0.19, 0.2, 0.34, 0.05, 0.2, 0.55, 0x7a7d80, PI / 2 - 0.2, 0, 0.3, 8); B.cyl('plain', 0.12, 0.12, 0.02, 0, 0.3, 0.05, 0xb89a3a, 0, 0, 0, 8); }
  else B.sph('plain', 0.17, 0.04, 0.17, 0.52, skin);
  B.geo('root', tubeGeo([[0, 0.2, 0], [0.3, 0.7, 0.2], [0.9, 0.4, -0.2], [1.3, -0.2, 0.3]], 0.09, 0.02, 8, 4), null, ROOT);
  B.flush(w.batch, mat4(x, groundHeight(x, z), z, 0, rot, 0), null);
}
/** The Pale Sun — a disc with eight rays. Faces local +Z. */
export function sunEmblem(B, x, y, z, s = 1, ry = 0, color = 0xb89a3a) {
  const LB = new Builder();
  LB.cyl('plain', 0.3 * s, 0.3 * s, 0.03, 0, 0, 0, color, PI / 2, 0, 0, 10);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; LB.box('plain', 0.07 * s, 0.26 * s, 0.03, Math.sin(a) * 0.5 * s, Math.cos(a) * 0.5 * s, 0, color, 0, 0, -a); }
  const m = mat4(x, y, z, 0, ry, 0);
  for (const it of LB.items) { it.m.premultiply(m); B.items.push(it); }
}
export function tent(w, x, z, rot = 0) {
  const B = new Builder();
  B.geo('cloth', prismGeo(3.4, 2.3, 4), mat4(0, 0, 0), 0x9a9484); B.box('plain', 1.1, 1.5, 0.06, 0, 0.75, 2.01, 0x0a0908);
  sunEmblem(B, 0, 1.75, 2.03, 0.5);
  B.cyl('plain', 0.05, 0.05, 2.8, 0, 1.4, 2.05, 0x3a2e25);
  B.flush(w.batch, mat4(x, groundHeight(x, z), z, 0, rot, 0), (p) => { p.x += Math.sin(p.z * 1.3) * 0.08 * p.y; });
  w.addBox(x, z, 1.6, 2, rot, 2.2);
}
export function banner(w, x, z, rot = 0, torn = true) {
  const B = new Builder();
  B.cyl('plain', 0.06, 0.07, 5, 0, 2.5, 0, 0x3a2e25, 0, 0, 0.05); B.box('plain', 1.5, 0.07, 0.07, 0.1, 4.7, 0, 0x3a2e25);
  B.box('cloth', 1.3, torn ? 1.9 : 2.6, 0.03, 0.1, torn ? 3.72 : 3.4, 0, 0xa8a294);
  if (torn) { B.box('cloth', 0.4, 0.8, 0.03, -0.3, 2.45, 0, 0xa8a294, 0, 0, 0.1); B.box('cloth', 0.3, 0.5, 0.03, 0.5, 2.55, 0, 0x8a8478, 0, 0, -0.15); }
  sunEmblem(B, 0.1, 3.9, 0.03, 0.75); sunEmblem(B, 0.1, 3.9, -0.03, 0.75, PI);
  B.flush(w.batch, mat4(x, groundHeight(x, z), z, 0, rot, 0), null);
  w.addCircle(x, z, 0.15);
}
export function gallows(w, x, z, rot = 0) {
  const B = new Builder();
  B.box('plank', 3, 0.2, 2.2, 0, 1.1, 0, 0x4a3c30); for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('wood', 0.2, 1.1, 0.2, sx * 1.35, 0.55, sz * 0.95, 0x3a2e25);
  B.box('wood', 0.22, 3.4, 0.22, -1.2, 2.9, 0, 0x3a2e25); B.box('wood', 2.2, 0.2, 0.2, -0.2, 4.5, 0, 0x3a2e25); B.box('wood', 0.14, 1.2, 0.14, -0.8, 4.05, 0, 0x3a2e25, 0, 0, -0.8);
  B.cyl('plain', 0.025, 0.025, 1.3, 0.6, 3.85, 0, 0x6a5c44); B.cyl('plain', 0.17, 0.17, 0.03, 0.6, 3.2, 0, 0x6a5c44, PI / 2, 0, 0, 8);
  B.flush(w.batch, mat4(x, groundHeight(x, z), z, 0, rot, 0), null);
  w.addBox(x, z, 1.5, 1.1, rot, 1.2);
}
export function stall(w, x, z, rot = 0) {
  const B = new Builder();
  B.box('plank', 2.6, 0.12, 1.2, 0, 0.95, 0, 0x5a4a3c, 0, 0, 0.12); for (const s of [-1, 1]) { B.box('wood', 0.12, 2.3, 0.12, s * 1.25, 1.15, -0.55, 0x3a2e25, 0, 0, s * 0.06); B.box('wood', 0.12, 1, 0.12, s * 1.25, 0.5, 0.55, 0x3a2e25); }
  B.box('cloth', 2.9, 0.05, 1.6, 0, 2.25, 0.1, 0x5a2a22, 0.3, 0, 0.1);
  B.flush(w.batch, mat4(x, groundHeight(x, z), z, 0, rot, 0), null);
  w.addBox(x, z, 1.3, 0.6, rot, 1);
}
/** A small readable thing: a page, on some support. */
export function page(w, x, y, z, rot = 0, upright = false) {
  const B = new Builder();
  if (upright) B.box('plain', 0.42, 0.55, 0.02, 0, 0, 0, 0xcbbd98); else B.box('plain', 0.36, 0.02, 0.5, 0, 0, 0, 0xcbbd98, 0, 0.3, 0);
  B.flush(w.batch, mat4(x, y, z, 0, rot, 0), null, 0.05);
}

// ---------------------------------------------------------------------------
export function church(w) {
  const B = new Builder(), WH = 11, wood = 0x4a3d34, dark = 0x2a211b, cx = CHURCH.x, cy = CHURCH.y, cz = CHURCH.z;
  B.box('plank', 23.6, 0.5, 41.6, 0, -0.25, 0, 0x3a3029);
  B.box('stone', 25, 2.6, 43, 0, -1.56, 0, 0x55504c);
  B.box('wood', 0.8, WH, 41.6, -11.4, WH / 2, 0, wood); B.box('wood', 0.8, WH, 41.6, 11.4, WH / 2, 0, wood);
  B.box('wood', 23.6, WH, 0.8, 0, WH / 2, -20.4, wood);
  B.box('wood', 8.9, WH, 0.8, -6.95, WH / 2, 20.4, wood); B.box('wood', 8.9, WH, 0.8, 6.95, WH / 2, 20.4, wood);
  B.box('wood', 5.2, WH - 5.6, 0.8, 0, 5.6 + (WH - 5.6) / 2, 20.4, wood);
  B.box('plank', 0.5, 5.6, 1.1, -2.6, 2.8, 20.4, dark); B.box('plank', 0.5, 5.6, 1.1, 2.6, 2.8, 20.4, dark); B.box('plank', 5.8, 0.5, 1.1, 0, 5.8, 20.4, dark);
  B.box('plank', 2.4, 5.4, 0.18, -3.5, 2.7, 19.3, 0x33271f, 0, 1.2, 0); B.box('plank', 2.4, 5.4, 0.18, 3.5, 2.7, 19.3, 0x33271f, 0, -1.2, 0);
  for (let i = 0; i < 5; i++) {
    const z = -15 + i * 7.5;
    for (const s of [-1, 1]) { B.box('window', 1.0, 4.2, 1.1, s * 11.4, 5.6, z); B.box('plank', 1.05, 0.3, 1.6, s * 11.4, 7.9, z, dark); B.box('plank', 1.05, 0.3, 1.6, s * 11.4, 3.35, z, dark); B.box('plank', 1.04, 4.2, 0.12, s * 11.4, 5.6, z, dark); }
  }
  B.box('window', 2.4, 3, 1.0, 0, 8.2, 20.4);                                                    // rose window over the door
  const hw = 12.6, rH = 9, L = Math.hypot(hw, rH), a = Math.atan2(rH, hw);
  B.box('shingle', L + 0.4, 0.5, 43.5, -hw / 2, WH + rH / 2, 0, 0x3c3431, 0, 0, a); B.box('shingle', L + 0.4, 0.5, 43.5, hw / 2, WH + rH / 2, 0, 0x3c3431, 0, 0, -a);
  for (const s of [-1, 1]) B.geo('plank', prismGeo(hw * 2 - 0.6, rH - 0.3, 0.6), mat4(0, WH, s * 20.4), 0x3a2f28);
  for (let i = 0; i < 6; i++) { B.box('wood', 22.8, 0.5, 0.5, 0, WH - 0.3, -17 + i * 6.8, 0x2e2520); B.box('wood', 0.35, 4, 0.35, 0, WH + 1.7, -17 + i * 6.8, 0x2e2520); }
  B.cyl('plank', 3.4, 3.8, 7, 0, 20.5, 0, 0x3d322b, 0, 0, 0, 8);
  for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU + 0.39; B.box('window', 0.7, 2.4, 0.3, Math.sin(an) * 3.55, 21, Math.cos(an) * 3.55, 0xffffff, 0, an, 0); }
  B.geo('shingle', onionGeo(4.6, 10), mat4(0, 24, 0), 0x2c2a2e);
  B.box('gild', 0.26, 4, 0.26, 0.4, 38, 0, 0x9a7a3a, 0, 0, 0.28); B.box('gild', 1.7, 0.22, 0.22, 0.25, 38.6, 0, 0x9a7a3a, 0, 0, 0.28); B.box('gild', 0.9, 0.2, 0.2, 0.1, 39.3, 0, 0x9a7a3a, 0, 0, 0.28); B.box('gild', 1.1, 0.2, 0.2, 0.55, 37.5, 0, 0x9a7a3a, 0, 0, 0.75);
  // bell tower / porch
  const tz = 23.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('wood', 0.9, 7, 0.9, sx * 3.2, 3.5, tz + sz * 2.9, wood);
  B.box('plank', 7.6, 0.5, 7, 0, -0.25, tz, 0x3a3029);
  B.box('wood', 7.3, 9.5, 6.7, 0, 11.2, tz, wood);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('wood', 0.7, 4, 0.7, sx * 3.1, 17.9, tz + sz * 2.8, dark);
  B.cyl('metal', 0.8, 1.3, 1.7, 0, 17.6, tz, 0x4a4238, 0, 0, 0.18, 8);
  B.box('plank', 8.2, 0.5, 7.6, 0, 20.1, tz, dark);
  B.geo('shingle', onionGeo(2.7, 8), mat4(0, 20.3, tz), 0x2c2a2e);
  B.box('gild', 0.16, 2.4, 0.16, 0, 28.6, tz, 0x9a7a3a); B.box('gild', 1, 0.14, 0.14, 0, 29, tz, 0x9a7a3a); B.box('gild', 0.6, 0.12, 0.12, 0, 28.3, tz, 0x9a7a3a, 0, 0, 0.5);
  for (let i = 0; i < 3; i++) B.box('stone', 7.4 + i * 0.9, 0.3, 0.8, 0, -0.16 - i * 0.12, 27.4 + i * 0.7, 0x55504c);
  // ---- interior ----
  for (let i = 0; i < 6; i++) { const z = -17 + i * 6.8; for (const s of [-1, 1]) { B.cyl('wood', 0.42, 0.5, WH, s * 10.5, WH / 2, z, 0x2e2520, 0, 0, 0, 8); B.box('wood', 0.3, 0.3, 2.6, s * 9.7, WH - 1.1, z, 0x2e2520, 0, PI / 2, s * 0.8); } }
  B.box('plank', 22.8, 0.5, 5.2, 0, 0.25, -17.9, 0x2c2420);
  B.box('stone', 3.4, 1.2, 1.5, 0, 1.1, -18.2, 0x6a6258); B.box('cloth', 3.6, 0.08, 1.7, 0, 1.74, -18.2, 0x5a1410);
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const h = 3.2 + (4 - Math.abs(i)) * 0.7;
    B.box('gild', 1.9, h, 0.15, i * 2.35, 0.5 + h / 2, -19.85, 0x7a5c24);
    B.box('plain', 1.2, 1.5, 0.2, i * 2.35, 0.5 + h * 0.62, -19.82, 0x0c0808);                   // every painted face has been scratched away
    B.box('plain', 0.9, 0.1, 0.24, i * 2.35, 0.5 + h * 0.62 + 0.3, -19.8, 0x3a0c08, 0, 0, 0.5);
  }
  const r = rng(404);
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) B.box('plank', 0.5, 0.9, 2 + r(), s * (8.9 + r() * 0.6), 0.45, -13 + i * 3.6 + r(), 0x3a2e25, (r() - 0.5) * 0.6, (r() - 0.5) * 0.8, (r() - 0.5) * 0.9);
  const candle = (x, y, z, h = 0.3) => { B.cyl('plain', 0.035, 0.04, h, x, y + h / 2, z, 0xc8bc9a, 0, 0, 0, 5); B.cone('fire', 0.035, 0.11, x, y + h + 0.06, z, 0xffffff, 0, 0, 0, 4); };
  for (const s of [-1, 1]) {
    B.cyl('metal', 0.05, 0.3, 1.4, s * 4.2, 1.2, -16.6, 0x5a4a2a); B.cyl('metal', 0.5, 0.1, 0.1, s * 4.2, 1.95, -16.6, 0x5a4a2a, 0, 0, 0, 8);
    for (let i = 0; i < 7; i++) { const an = (i / 7) * TAU; candle(s * 4.2 + Math.sin(an) * 0.4, 2.0, -16.6 + Math.cos(an) * 0.4, 0.2 + r() * 0.3); }
    for (let i = 0; i < 6; i++) candle(s * (1 + r() * 0.6), 1.78, -18.2 + (r() - 0.5), 0.15 + r() * 0.3);
    for (let i = 0; i < 6; i++) { const z = -17 + i * 6.8; candle(s * 9.9, 0, z + 0.7, 0.3 + r() * 0.3); candle(s * 9.7, 0, z - 0.6, 0.2 + r() * 0.3); }
  }
  // horos (ring chandelier), hanging crooked
  B.cyl('plain', 0.03, 0.03, 4.4, 0, WH - 2.4, 0, 0x2a2826);
  for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU, x = Math.sin(an) * 2.2, z = Math.cos(an) * 2.2; B.box('metal', 1.2, 0.12, 0.1, x, 6.4 + x * 0.08, z, 0x5a4a2a, 0, an, 0); candle(x, 6.46 + x * 0.08, z, 0.24); }
  // the anchor: a heart of root and ember above the altar
  B.sph('glow', 1.5, 0, 7.4, -18.6, 0xffffff, 1, 1.25, 0.9, 9);
  for (let i = 0; i < 14; i++) {
    const an = (i / 14) * TAU + r(), up = r() < 0.5;
    const end = up ? [Math.sin(an) * (4 + r() * 6), WH + 2 + r() * 5, -18 + Math.cos(an) * 3 + r() * 4] : [Math.sin(an) * (3 + r() * 7), -0.4, -18.5 + Math.abs(Math.cos(an)) * (2 + r() * 6)];
    const mid = [end[0] * 0.5 + (r() - 0.5) * 2, up ? 9.5 + r() * 2 : 4 + r() * 3, (end[2] - 18.6) / 2 + (r() - 0.5) * 2];
    B.geo('root', tubeGeo([[0, 7.4, -18.6], [mid[0] * 0.4, 7.4 + (up ? 1 : -0.6), -18.4], mid, end], 0.42, 0.08, 14, 5), null, r() < 0.5 ? ROOT : ROOT2);
  }
  for (let i = 0; i < 7; i++) B.cone('root', 0.2 + r() * 0.25, 1.2 + r() * 2.4, (r() - 0.5) * 16, 0.6 + r(), -17.5 - r() * 2, ROOT, (r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.7, 5);
  // ---- exterior roots swallowing the building ----
  for (let i = 0; i < 12; i++) {
    const s = i % 2 ? 1 : -1, z0 = -19 + r() * 40, z1 = z0 + (r() - 0.5) * 12;
    const pts = [[s * (14.5 + r() * 5), -1.4, z0], [s * 12.3, 3 + r() * 4, z0 + (r() - 0.5) * 3], [s * 12.2, WH + 0.5, (z0 + z1) / 2], [s * 7.5, WH + rH * 0.45 + 0.6, z1], [s * 3.2, WH + rH * 0.82 + 0.6, z1 * 0.4], [s * 2.5, 22 + r() * 4, (r() - 0.5) * 3]];
    B.geo('root', tubeGeo(pts, 0.55 + r() * 0.4, 0.1, 22, 6), null, r() < 0.5 ? ROOT : ROOT2);
    if (r() < 0.7) B.sph('glow', 0.3 + r() * 0.35, s * 12.1, 2 + r() * 6, z0 + (r() - 0.5) * 3);
  }
  for (let i = 0; i < 5; i++) { const s = i % 2 ? 1 : -1; B.geo('root', tubeGeo([[s * (5 + r() * 3), -1, 30 + r() * 3], [s * 4.2, 4, 27.2], [s * 3.9, 11, 26 + r()], [s * 2, 19, 24.5], [0, 23 + r() * 3, 23.6]], 0.4, 0.08, 16, 5), null, ROOT); }
  B.flush(w.batch, mat4(cx, cy, cz), null, 0.18);

  // colliders (world space)
  w.addBox(cx - 11.4, cz, 0.6, 20.9, 0, 30); w.addBox(cx + 11.4, cz, 0.6, 20.9, 0, 30); w.addBox(cx, cz - 20.4, 12, 0.6, 0, 30);
  w.addBox(cx - 6.95, cz + 20.4, 4.45, 0.6, 0, 30); w.addBox(cx + 6.95, cz + 20.4, 4.45, 0.6, 0, 30);
  for (const s of [-1, 1]) w.addCircle(cx + s * 3.2, cz + tz + 2.9, 0.65);
  for (const s of [-1, 1]) w.addCircle(cx + s * 3.2, cz + tz - 2.9, 0.65);
  w.addBox(cx, cz - 18.4, 2, 1, 0, 2);
  // lights
  w.lights.push({ x: cx, y: cy + 6.5, z: cz - 16.5, color: 0xff2a0c, i: 130, r: 34, pulse: true, prio: 3 });
  w.lights.push({ x: cx - 4.2, y: cy + 2.6, z: cz - 15.6, color: 0xffa050, i: 22, r: 14, flicker: true, prio: 2 });
  w.lights.push({ x: cx + 4.2, y: cy + 2.6, z: cz - 15.6, color: 0xffa050, i: 22, r: 14, flicker: true, prio: 2 });
  w.lights.push({ x: cx, y: cy + 6, z: cz, color: 0xffa050, i: 60, r: 24, flicker: true, prio: 3 });
  w.lights.push({ x: cx, y: cy + 5, z: cz + 13, color: 0xff7038, i: 40, r: 22, flicker: true, prio: 2 });
  w.lights.push({ x: cx, y: cy + 4, z: cz + 23.6, color: 0xff3a10, i: 24, r: 14, pulse: true });
  for (const s of [-1, 1]) w.emitters.push({ x: cx + s * 4.2, y: cy + 2.4, z: cz - 16.6, type: 'flame', rate: 14 });
  w.emitters.push({ x: cx, y: cy + 7.4, z: cz - 18, type: 'curse', rate: 9 });
}
