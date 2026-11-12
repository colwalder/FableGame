// Procedural low-poly character models. Each returns { root, h, rig, mats, ... }.
import * as THREE from 'three';
import { humanoid, Rig, flat, glowMat, bx, cy, cn, sp } from './rig.js';
import { rng, TAU } from '../core/util.js';

const PI = Math.PI;
function kit() { const mats = []; return { mats, M: (c, o) => { const m = flat(c, o); mats.push(m); return m; } }; }
function marker(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }
function done(h, mats, extra = {}) {
  h.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return { root: h.root, h, rig: new Rig(h), mats, ...extra };
}
/** Black thorny growths bursting out of a body part. */
function thorns(parent, mat, n, r, seed, x = 0, y = 0, z = 0, len = 0.35) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) { const a = R() * TAU, e = R() * 1.2 - 0.2, l = len * (0.6 + R()); const c = cn(0.035 + R() * 0.04, l, mat, x + Math.sin(a) * r, y + e * r, z + Math.cos(a) * r - r * 0.3, 0, 0, 0, 4); c.rotation.set(Math.cos(a) * 1.1 - 0.5, 0, -Math.sin(a) * 1.1); parent.add(c); }
}

// ---------------------------------------------------------------------------
export function makeHero() {
  const { mats, M } = kit();
  const steel = M(0x565c66, { metalness: 0.75, roughness: 0.42 }), dark = M(0x262a30, { metalness: 0.55, roughness: 0.55 }), leather = M(0x3a2b1f), fur = M(0x6a5b4a, { roughness: 1 });
  const cloth = M(0x2e100d, { roughness: 1, side: THREE.DoubleSide }), bladeM = M(0xa4abb4, { metalness: 0.55, roughness: 0.5 }), brass = M(0x9a7a34, { metalness: 0.7, roughness: 0.45 }), black = M(0x040404);
  const h = humanoid({}), j = h.j;
  j.hips.add(bx(0.46, 0.24, 0.3, leather, 0, 0.04, 0), bx(0.5, 0.07, 0.34, brass, 0, 0.13, 0));
  j.hips.add(bx(0.22, 0.4, 0.05, cloth, -0.13, -0.26, 0.17), bx(0.22, 0.34, 0.05, cloth, 0.13, -0.23, 0.17), bx(0.5, 0.42, 0.05, cloth, 0, -0.26, -0.17));
  j.chest.add(bx(0.56, 0.5, 0.34, steel, 0, 0.27, 0), bx(0.34, 0.34, 0.07, dark, 0, 0.3, 0.17), bx(0.06, 0.4, 0.09, steel, 0, 0.3, 0.19));
  j.chest.add(bx(0.84, 0.18, 0.5, fur, 0, 0.54, -0.03), bx(0.6, 0.14, 0.2, fur, 0, 0.5, -0.24));
  j.chest.add(sp(0.19, steel, 0.4, 0.5, 0, 1.15, 0.85, 1.15), sp(0.23, steel, -0.42, 0.53, 0, 1.2, 0.95, 1.2), bx(0.3, 0.05, 0.3, dark, -0.43, 0.42, 0));
  j.head.add(bx(0.13, 0.1, 0.13, leather, 0, 0.03, 0), cy(0.155, 0.17, 0.3, steel, 0, 0.2, 0, 0, 0, 0, 8), sp(0.158, steel, 0, 0.34, 0, 1, 0.62, 1, 8));
  j.head.add(bx(0.22, 0.04, 0.06, black, 0, 0.23, 0.14), bx(0.035, 0.24, 0.05, dark, 0, 0.17, 0.165), bx(0.03, 0.2, 0.3, dark, 0, 0.42, -0.02));
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    j[s + 'Sh'].add(bx(0.14, 0.32, 0.14, dark, 0, -0.16, 0)); j[s + 'El'].add(bx(0.13, 0.28, 0.13, steel, 0, -0.14, 0), sp(0.085, steel, 0, 0, -0.02));
    j[s + 'Ha'].add(bx(0.12, 0.13, 0.14, leather, 0, -0.05, 0));
    j[s + 'Hip'].add(bx(0.18, 0.46, 0.19, dark, 0, -0.23, 0), bx(0.2, 0.2, 0.05, steel, sg * 0.01, -0.14, 0.1));
    j[s + 'Kn'].add(bx(0.16, 0.44, 0.17, steel, 0, -0.22, 0), sp(0.095, steel, 0, 0, 0.07), bx(0.17, 0.1, 0.32, leather, 0, -0.43, 0.06));
  }
  // cape: four hinged strips
  const cape = []; let parent = j.chest;
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(); g.position.set(0, i === 0 ? 0.5 : -0.29, i === 0 ? -0.2 : 0);
    g.add(bx(0.56 - i * 0.07, 0.3, 0.03, cloth, (i % 2) * 0.02, -0.145, 0)); parent.add(g); cape.push(g); parent = g;
  }
  // the sword
  const sword = new THREE.Group();
  sword.add(cy(0.036, 0.04, 0.64, leather, 0, 0, -0.04, PI / 2, 0, 0, 6), sp(0.075, brass, 0, 0, -0.4), bx(0.66, 0.085, 0.11, dark, 0, 0, 0.3), bx(0.09, 0.12, 0.16, brass, 0, 0, 0.3));
  sword.add(bx(0.32, 0.055, 2.35, bladeM, 0, 0, 1.52), bx(0.09, 0.07, 2.0, dark, 0, 0, 1.4), bx(0.34, 0.03, 0.5, dark, 0, 0, 0.62));
  const tip = cn(0.16, 0.44, bladeM, 0, 0, 2.91, PI / 2, 0, 0, 4); tip.scale.z = 0.18; sword.add(tip);
  sword.position.set(0, -0.07, 0);
  j.rHa.add(sword);
  const sBase = marker(sword, 0, 0, 0.5), sTip = marker(sword, 0, 0, 3.1);
  // flute, hidden until played
  const flute = cy(0.014, 0.016, 0.42, M(0xb89a6a), 0.12, 0.44, 0.27, 0, 0, PI / 2 - 0.2, 5); flute.visible = false; j.chest.add(flute);
  // faint aura when buffed
  const aura = new THREE.PointLight(0xffd070, 0, 7, 1.8); aura.position.set(0, 1.3, 0); h.root.add(aura);
  return done(h, mats, { cape, sword, sBase, sTip, flute, aura, bladeM });
}

// ---------------------------------------------------------------------------
export function makeHusk(seed = 1) {
  const R = rng(seed * 101 + 7), { mats, M } = kit();
  const skinC = [0x7f8a74, 0x6f7a6c, 0x8a8a78, 0x66705e][(R() * 4) | 0];
  const skin = M(skinC), linen = M([0x9a927c, 0x8a846e, 0x7c7462][(R() * 3) | 0], { roughness: 1 }), red = M(0x7a1c14), trouser = M([0x3a3228, 0x2e2c30, 0x40362a][(R() * 3) | 0]), dark = M(0x1c1410), root = M(0x1b1115);
  const eye = glowMat(0xffd28a, 2.2);
  const woman = R() < 0.4, sc = 0.92 + R() * 0.18;
  const h = humanoid({ hipY: 0.94, shoulderW: woman ? 0.24 : 0.28 }), j = h.j;
  j.hips.add(bx(0.4, 0.22, 0.26, trouser, 0, 0.04, 0));
  if (woman) j.hips.add(cy(0.22, 0.42, 0.85, M([0x4a3030, 0x30384a, 0x3a3a2a][(R() * 3) | 0], { roughness: 1 }), 0, -0.36, 0, 0, 0, 0, 7), bx(0.3, 0.6, 0.03, linen, 0, -0.3, 0.3, -0.13, 0, 0));
  j.chest.add(bx(woman ? 0.42 : 0.48, 0.52, 0.28, linen, 0, 0.27, 0), bx(0.1, 0.36, 0.3, red, 0, 0.34, 0), bx(woman ? 0.44 : 0.5, 0.06, 0.3, red, 0, 0.03, 0));
  j.head.add(bx(0.11, 0.1, 0.11, skin, 0, 0.03, 0), bx(0.24, 0.27, 0.25, skin, 0, 0.2, 0.01), bx(0.2, 0.09, 0.2, skin, 0, 0.02, 0.06, 0.35, 0, 0));
  j.head.add(sp(0.028, eye, 0.065, 0.23, 0.13), sp(0.028, eye, -0.065, 0.23, 0.13), bx(0.12, 0.05, 0.04, dark, 0, 0.1, 0.13));
  if (woman) j.head.add(bx(0.29, 0.24, 0.3, red, 0, 0.27, -0.03), bx(0.26, 0.3, 0.08, red, 0, 0.1, -0.15));
  else if (R() < 0.5) j.head.add(cy(0.15, 0.17, 0.14, M(0x3a3028, { roughness: 1 }), 0, 0.38, 0, 0, 0, 0, 7)); else j.head.add(bx(0.2, 0.2, 0.1, M(0x4a4640), 0, 0.02, 0.1));
  const missing = R() < 0.25 ? (R() < 0.5 ? 'l' : 'r') : '';
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    j[s + 'Sh'].add(bx(0.12, 0.3, 0.12, linen, 0, -0.15, 0));
    if (s !== missing) { j[s + 'El'].add(bx(0.1, 0.3, 0.1, skin, 0, -0.15, 0), bx(0.12, 0.05, 0.12, red, 0, -0.02, 0)); j[s + 'Ha'].add(bx(0.1, 0.16, 0.06, skin, 0, -0.07, 0)); }
    else thorns(j[s + 'El'], root, 4, 0.05, seed * 7 + 1, 0, -0.1, 0, 0.4);
    if (!woman) j[s + 'Hip'].add(bx(0.16, 0.46, 0.17, trouser, 0, -0.23, 0));
    j[s + 'Kn'].add(bx(0.13, 0.44, 0.14, woman ? skin : trouser, 0, -0.22, 0), bx(0.14, 0.09, 0.26, dark, 0, -0.43, 0.04));
  }
  if (R() < 0.6) { thorns(j.chest, root, 3 + ((R() * 4) | 0), 0.2, seed * 3, (R() - 0.5) * 0.3, 0.4, -0.1, 0.45); j.chest.add(sp(0.08, glowMat(0xff3a14, 2), (R() - 0.5) * 0.3, 0.42, -0.14)); }
  h.root.scale.setScalar(sc);
  return done(h, mats, { height: 1.9 * sc });
}

// ---------------------------------------------------------------------------
export function makeStrzyga(seed = 1) {
  const { mats, M } = kit();
  const skin = M(0xa2a69a), dark = M(0x2a2428), rag = M(0x4a443c, { roughness: 1 }), tooth = M(0xd8d0b8), eye = glowMat(0xff2a10, 3.5);
  const h = humanoid({ hipY: 1.0, torsoH: 0.62, shoulderW: 0.26, upperArm: 0.46, foreArm: 0.5, thigh: 0.5, shin: 0.5 }), j = h.j;
  j.hips.add(bx(0.32, 0.2, 0.22, rag, 0, 0.03, 0), bx(0.3, 0.3, 0.04, rag, 0, -0.18, -0.12));
  j.chest.add(bx(0.4, 0.34, 0.26, skin, 0, 0.42, 0), bx(0.3, 0.3, 0.2, skin, 0, 0.14, 0));
  for (let i = 0; i < 5; i++) j.chest.add(cn(0.035, 0.16, dark, 0, 0.1 + i * 0.12, -0.15, -1.2, 0, 0, 4));
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) j.chest.add(bx(0.16, 0.025, 0.22, dark, s * 0.11, 0.2 + i * 0.09, 0.02));
  j.head.add(bx(0.1, 0.12, 0.1, skin, 0, 0.04, 0), bx(0.22, 0.2, 0.26, skin, 0, 0.2, 0.03));
  const jaw = new THREE.Group(); jaw.position.set(0, 0.11, -0.02); jaw.rotation.x = 0.55;
  jaw.add(bx(0.2, 0.06, 0.24, skin, 0, -0.03, 0.1)); for (let i = 0; i < 5; i++) jaw.add(cn(0.014, 0.07, tooth, -0.07 + i * 0.035, 0.03, 0.2, 0, 0, 0, 4));
  j.head.add(jaw);
  for (let i = 0; i < 5; i++) j.head.add(cn(0.014, 0.07, tooth, -0.07 + i * 0.035, 0.08, 0.15, PI, 0, 0, 4));
  j.head.add(sp(0.032, eye, 0.07, 0.23, 0.15), sp(0.032, eye, -0.07, 0.23, 0.15));
  for (let i = 0; i < 7; i++) j.head.add(bx(0.03, 0.4 + (i % 3) * 0.14, 0.02, dark, -0.1 + i * 0.033, 0.1 - (i % 3) * 0.05, -0.12 - (i % 2) * 0.02, 0.35, 0, (i - 3) * 0.06));
  for (const s of ['l', 'r']) {
    j[s + 'Sh'].add(bx(0.09, 0.46, 0.09, skin, 0, -0.23, 0)); j[s + 'El'].add(bx(0.075, 0.5, 0.075, skin, 0, -0.25, 0));
    j[s + 'Ha'].add(bx(0.1, 0.1, 0.07, skin, 0, -0.04, 0)); for (let i = 0; i < 4; i++) j[s + 'Ha'].add(cn(0.014, 0.22, dark, -0.04 + i * 0.027, -0.18, 0.02, PI + 0.25, 0, 0, 4));
    j[s + 'Hip'].add(bx(0.11, 0.5, 0.12, skin, 0, -0.25, 0)); j[s + 'Kn'].add(bx(0.09, 0.5, 0.1, skin, 0, -0.25, 0), bx(0.1, 0.06, 0.26, skin, 0, -0.5, 0.07));
  }
  return done(h, mats, { jaw, height: 1.2 });
}

// ---------------------------------------------------------------------------
export function makeWailer(seed = 1) {
  const { mats, M } = kit();
  const dress = M(0x0f0d12, { roughness: 1 }), veil = M(0x1c1a22, { roughness: 1, transparent: true, opacity: 0.86, side: THREE.DoubleSide }), skin = M(0xc8ccd0), eye = glowMat(0x9ad8ff, 3.2);
  const h = humanoid({ hipY: 1.25, shoulderW: 0.23, upperArm: 0.36, foreArm: 0.42 }), j = h.j;
  j.hips.add(cy(0.2, 0.62, 1.4, dress, 0, -0.6, 0, 0, 0, 0, 8));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; j.hips.add(cn(0.14, 0.5, dress, Math.sin(a) * 0.5, -1.45, Math.cos(a) * 0.5, PI, 0, 0, 4)); }
  j.chest.add(bx(0.38, 0.54, 0.24, dress, 0, 0.27, 0), bx(0.14, 0.14, 0.03, M(0x8a8a90, { metalness: 0.6 }), 0, 0.36, 0.13));
  j.head.add(bx(0.1, 0.1, 0.1, skin, 0, 0.03, 0), bx(0.21, 0.27, 0.22, skin, 0, 0.2, 0), bx(0.1, 0.13, 0.03, eye, 0, 0.11, 0.11), sp(0.03, eye, 0.055, 0.25, 0.11), sp(0.03, eye, -0.055, 0.25, 0.11));
  j.head.add(bx(0.3, 0.34, 0.3, veil, 0, 0.24, -0.02), bx(0.34, 0.75, 0.06, veil, 0, -0.05, -0.17, 0.12, 0, 0));
  for (const s of ['l', 'r']) {
    j[s + 'Sh'].add(bx(0.1, 0.36, 0.1, dress, 0, -0.18, 0), bx(0.16, 0.4, 0.03, veil, 0, -0.3, -0.07));
    j[s + 'El'].add(bx(0.07, 0.42, 0.07, skin, 0, -0.21, 0)); for (let i = 0; i < 4; i++) j[s + 'Ha'].add(bx(0.016, 0.22, 0.016, skin, -0.035 + i * 0.024, -0.1, 0, 0, 0, (i - 1.5) * 0.12));
  }
  const hand = marker(j.rHa, 0, -0.1, 0), hand2 = marker(j.lHa, 0, -0.1, 0);
  return done(h, mats, { hand, hand2, height: 2.0 });
}

// ---------------------------------------------------------------------------
export function makeBrute(seed = 1, sexton = false) {
  const { mats, M } = kit();
  const skin = M(0x74786a), apron = M(sexton ? 0x24201e : 0x3a2a1e, { roughness: 1 }), pants = M(0x2a2622), root = M(0x1b1115), iron = M(0x3a3836, { metalness: 0.8, roughness: 0.5 }), beard = M(sexton ? 0x8a8a88 : 0x2a211c, { roughness: 1 });
  const eye = glowMat(0xff7a20, 3), hot = glowMat(sexton ? 0x6ad0ff : 0xff5a10, sexton ? 1.4 : 2.2);
  const h = humanoid({ hipY: 1.0, torsoH: 0.62, shoulderW: 0.42, upperArm: 0.36, foreArm: 0.34, hipW: 0.17 }), j = h.j;
  j.hips.add(bx(0.62, 0.3, 0.44, pants, 0, 0.02, 0), bx(0.5, 0.7, 0.06, apron, 0, -0.3, 0.24));
  j.chest.add(bx(0.78, 0.6, 0.5, skin, 0, 0.3, 0), sp(0.36, skin, 0, 0.1, 0.1, 1.05, 0.9, 0.9), bx(0.52, 0.6, 0.06, apron, 0, 0.26, 0.27), sp(0.26, skin, 0.36, 0.56, 0, 1, 0.8, 1), sp(0.3, root, -0.38, 0.58, 0, 1, 0.9, 1));
  thorns(j.chest, root, 7, 0.3, seed + 5, -0.3, 0.6, -0.05, 0.6); j.chest.add(sp(0.1, glowMat(0xff3a14, 2.4), -0.3, 0.5, -0.24), sp(0.07, glowMat(0xff3a14, 2.4), -0.1, 0.3, -0.27));
  j.head.add(bx(0.2, 0.1, 0.2, skin, 0, 0.02, 0), bx(0.3, 0.3, 0.3, skin, 0, 0.2, 0.02), bx(0.3, 0.26, 0.14, beard, 0, 0.04, 0.14), sp(0.035, eye, 0.08, 0.24, 0.16), sp(0.035, eye, -0.08, 0.24, 0.16));
  if (sexton) j.head.add(cy(0.24, 0.26, 0.1, apron, 0, 0.38, 0, 0, 0, 0, 8), cy(0.15, 0.17, 0.16, apron, 0, 0.47, 0, 0, 0, 0, 8));
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    const am = s === 'r' ? root : skin;
    j[s + 'Sh'].add(bx(0.2, 0.36, 0.2, am, 0, -0.18, 0)); j[s + 'El'].add(bx(0.17, 0.34, 0.17, am, 0, -0.17, 0)); j[s + 'Ha'].add(bx(0.16, 0.16, 0.16, am, 0, -0.06, 0));
    j[s + 'Hip'].add(bx(0.24, 0.46, 0.26, pants, 0, -0.23, 0)); j[s + 'Kn'].add(bx(0.2, 0.44, 0.22, pants, 0, -0.22, 0), bx(0.22, 0.1, 0.36, iron, 0, -0.43, 0.06));
  }
  thorns(j.rEl, root, 4, 0.1, seed + 9, 0, -0.1, 0, 0.3);
  const wp = new THREE.Group();
  wp.add(cy(0.04, 0.045, 2.0, M(0x3a2e25), 0, 0, 0.75, PI / 2, 0, 0, 6));
  if (sexton) wp.add(bx(0.42, 0.04, 0.55, iron, 0, 0, 1.95), bx(0.06, 0.07, 0.3, iron, 0, 0, 1.65), bx(0.44, 0.045, 0.06, hot, 0, 0, 2.2));
  else wp.add(bx(0.34, 0.34, 0.6, iron, 0, 0, 1.7), bx(0.36, 0.36, 0.14, hot, 0, 0, 1.7));
  wp.position.y = -0.07; j.rHa.add(wp);
  const sBase = marker(wp, 0, 0, 0.6), sTip = marker(wp, 0, 0, 2.1);
  h.root.scale.setScalar(1.5);
  return done(h, mats, { sBase, sTip, height: 3.0 });
}

// ---------------------------------------------------------------------------
export function makeTemplar() {
  const { mats, M } = kit();
  const plate = M(0x8e9296, { metalness: 0.7, roughness: 0.5 }), dark = M(0x3a3c40, { metalness: 0.6, roughness: 0.6 }), tabard = M(0xb4ad9c, { roughness: 1, side: THREE.DoubleSide }), sun = M(0xb8963a, { metalness: 0.5 }), root = M(0x1b1115), wood = M(0x2a211c);
  const heart = glowMat(0xff3010, 2.5), eye = glowMat(0xff5a20, 3), weaponGlow = glowMat(0xffc878, 0);
  const h = humanoid({ hipY: 1.0, torsoH: 0.62, shoulderW: 0.4, upperArm: 0.36, foreArm: 0.34, hipW: 0.16 }), j = h.j;
  j.hips.add(bx(0.56, 0.26, 0.4, dark, 0, 0.03, 0), bx(0.4, 0.62, 0.04, tabard, 0, -0.33, 0.21), bx(0.44, 0.7, 0.04, tabard, 0, -0.36, -0.21), bx(0.6, 0.08, 0.44, wood, 0, 0.13, 0));
  j.chest.add(bx(0.7, 0.6, 0.44, plate, 0, 0.3, 0), bx(0.46, 0.62, 0.05, tabard, 0, 0.28, 0.23));
  // the Pale Sun on his chest, split by a glowing wound
  j.chest.add(cy(0.13, 0.13, 0.02, sun, 0, 0.34, 0.26, PI / 2, 0, 0, 10));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; j.chest.add(bx(0.03, 0.1, 0.02, sun, Math.sin(a) * 0.2, 0.34 + Math.cos(a) * 0.2, 0.26, 0, 0, -a)); }
  j.chest.add(bx(0.05, 0.42, 0.06, heart, 0.03, 0.3, 0.255, 0, 0, 0.3), bx(0.04, 0.2, 0.06, heart, -0.06, 0.2, 0.255, 0, 0, -0.5));
  j.chest.add(sp(0.27, plate, -0.46, 0.56, 0, 1.2, 0.9, 1.2), sp(0.3, root, 0.46, 0.58, 0, 1.2, 1, 1.2));
  thorns(j.chest, root, 9, 0.34, 71, 0.38, 0.62, -0.05, 0.7); thorns(j.chest, root, 5, 0.25, 72, -0.1, 0.3, -0.25, 0.5);
  // great helm crowned with thorns
  j.head.add(bx(0.2, 0.1, 0.2, dark, 0, 0.02, 0), cy(0.2, 0.21, 0.36, plate, 0, 0.24, 0, 0, 0, 0, 8), cy(0.19, 0.2, 0.04, dark, 0, 0.43, 0, 0, 0, 0, 8));
  j.head.add(bx(0.3, 0.035, 0.05, eye, 0, 0.28, 0.185), bx(0.035, 0.26, 0.05, dark, 0, 0.22, 0.2));
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; const c = cn(0.03, 0.3 + (i % 3) * 0.14, root, Math.sin(a) * 0.17, 0.5, Math.cos(a) * 0.17, 0, 0, 0, 4); c.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); j.head.add(c); }
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    const am = s === 'l' ? root : plate;
    j[s + 'Sh'].add(bx(0.2, 0.36, 0.2, s === 'l' ? root : dark, 0, -0.18, 0)); j[s + 'El'].add(bx(0.18, 0.34, 0.18, am, 0, -0.17, 0), sp(0.11, am, 0, 0, -0.02)); j[s + 'Ha'].add(bx(0.16, 0.16, 0.17, s === 'l' ? root : dark, 0, -0.06, 0));
    j[s + 'Hip'].add(bx(0.24, 0.46, 0.26, dark, 0, -0.23, 0), bx(0.26, 0.24, 0.06, plate, 0, -0.14, 0.13)); j[s + 'Kn'].add(bx(0.21, 0.44, 0.23, plate, 0, -0.22, 0), sp(0.12, plate, 0, 0, 0.09), bx(0.22, 0.1, 0.38, dark, 0, -0.43, 0.07));
  }
  thorns(j.lEl, root, 6, 0.11, 73, 0, -0.15, 0, 0.4);
  // kite shield, grown into the arm
  const shield = new THREE.Group();
  shield.add(bx(0.66, 0.95, 0.06, plate, 0, 0, 0), cn(0.33, 0.5, plate, 0, -0.72, 0, PI, PI / 4, 0, 4), bx(0.7, 0.07, 0.08, dark, 0, 0.46, 0), cy(0.14, 0.14, 0.03, sun, 0, 0.05, 0.04, PI / 2, 0, 0, 10));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; shield.add(bx(0.035, 0.11, 0.02, sun, Math.sin(a) * 0.22, 0.05 + Math.cos(a) * 0.22, 0.04, 0, 0, -a)); }
  shield.children[1].scale.z = 0.12;
  shield.position.set(0.14, -0.1, 0.02); shield.rotation.set(0, PI / 2, 0); j.lEl.add(shield);
  // flanged mace on a long haft
  const wp = new THREE.Group();
  wp.add(cy(0.045, 0.05, 2.5, wood, 0, 0, 0.95, PI / 2, 0, 0, 6), sp(0.07, dark, 0, 0, -0.32), sp(0.2, dark, 0, 0, 2.2, 1, 1, 1.4));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const f = bx(0.05, 0.3, 0.5, plate, Math.sin(a) * 0.2, Math.cos(a) * 0.2, 2.2); f.rotation.z = -a; wp.add(f); }
  wp.add(cn(0.07, 0.3, plate, 0, 0, 2.6, PI / 2, 0, 0, 4));
  const glint = sp(0.26, weaponGlow, 0, 0, 2.2, 1, 1, 1.4); wp.add(glint);
  wp.position.y = -0.07; j.rHa.add(wp);
  const sBase = marker(wp, 0, 0, 0.9), sTip = marker(wp, 0, 0, 2.7);
  // tattered cloak
  const cape = []; let parent = j.chest;
  for (let i = 0; i < 4; i++) { const g = new THREE.Group(); g.position.set(0, i === 0 ? 0.56 : -0.36, i === 0 ? -0.24 : 0); g.add(bx(0.7 - i * 0.08, 0.36, 0.03, tabard, (i % 2) * 0.04, -0.18, 0)); parent.add(g); cape.push(g); parent = g; }
  const light = new THREE.PointLight(0xff3a10, 0, 9, 1.8); light.position.set(0, 1.5, 0.5); h.root.add(light);
  h.root.scale.setScalar(2.25);
  return done(h, mats, { sBase, sTip, cape, heart, eye, weaponGlow, light, height: 4.6 });
}

// ---------------------------------------------------------------------------
export function makePriest() {
  const { mats, M } = kit();
  const robe = M(0x0c0a0d, { roughness: 1 }), robe2 = M(0x1a1216, { roughness: 1 }), skin = M(0x9a9a8c), bone = M(0xc8c0a8), gold = M(0x9a7a34, { metalness: 0.75, roughness: 0.4 }), root = M(0x1b1115), beard = M(0x8a8a86, { roughness: 1 }), wing = M(0x2a0808, { roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.88 });
  const eye = glowMat(0xff2a0c, 4), inner = glowMat(0xff3a10, 2.4), halo = glowMat(0xff2008, 1.6), censer = glowMat(0xff8a30, 3), weaponGlow = glowMat(0xffc878, 0);
  const h = humanoid({ hipY: 2.7, pelvisH: 0.2, torsoH: 1.3, shoulderW: 0.58, upperArm: 1.15, foreArm: 1.25 }), j = h.j;
  // robe skirt down to the floor, ragged hem
  j.hips.add(cy(0.5, 1.25, 2.75, robe, 0, -1.3, 0, 0, 0, 0, 9), cy(0.56, 0.6, 0.2, gold, 0, 0.05, 0, 0, 0, 0, 9));
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; j.hips.add(cn(0.3, 0.7, robe, Math.sin(a) * 1.05, -2.75, Math.cos(a) * 1.05, PI, 0, 0, 4)); }
  j.hips.add(bx(0.34, 2.3, 0.04, robe2, 0, -1.2, 0.86, -0.27, 0, 0), bx(0.08, 2.2, 0.05, gold, 0, -1.2, 0.88, -0.27, 0, 0));
  // gaunt torso; the ribs have split and something glows between them
  j.chest.add(bx(0.86, 1.3, 0.5, robe, 0, 0.65, 0), bx(0.2, 0.9, 0.1, inner, 0, 0.62, 0.22));
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { const r = bx(0.36, 0.05, 0.06, bone, s * 0.24, 0.3 + i * 0.17, 0.27); r.rotation.set(0, s * 0.5, s * 0.25); j.chest.add(r); }
  j.chest.add(sp(0.36, robe2, 0.6, 1.2, 0, 1.2, 0.8, 1), sp(0.36, robe2, -0.6, 1.2, 0, 1.2, 0.8, 1));
  // small, human arms still clasped in prayer
  for (const s of [-1, 1]) { j.chest.add(bx(0.11, 0.5, 0.11, robe2, s * 0.36, 0.78, 0.18, -0.5, 0, s * -0.25), bx(0.08, 0.42, 0.08, skin, s * 0.16, 0.8, 0.42, -1.9, 0, s * -0.55)); }
  j.chest.add(bx(0.14, 0.2, 0.1, skin, 0, 0.98, 0.52));
  // head: tall kamilavka, split by horns
  j.head.add(bx(0.2, 0.2, 0.2, skin, 0, 0.06, 0), bx(0.36, 0.48, 0.38, skin, 0, 0.38, 0.02), cn(0.2, 0.9, beard, 0, -0.05, 0.2, PI, 0, 0, 5));
  j.head.add(bx(0.09, 0.05, 0.05, eye, 0.09, 0.44, 0.2), bx(0.09, 0.05, 0.05, eye, -0.09, 0.44, 0.2), bx(0.05, 0.22, 0.05, eye, 0, 0.26, 0.2));
  j.head.add(cy(0.24, 0.2, 0.62, robe, 0, 0.9, 0, 0, 0, 0, 8), bx(0.5, 0.75, 0.05, robe, 0, 0.5, -0.2, 0.15, 0, 0), bx(0.07, 0.4, 0.03, gold, 0, 0.92, 0.22), bx(0.22, 0.06, 0.03, gold, 0, 0.98, 0.22));
  for (const s of [-1, 1]) { const a = cn(0.085, 0.7, bone, s * 0.24, 0.92, -0.02, 0, 0, 0, 5); a.rotation.set(-0.25, 0, -s * 0.75); const b = cn(0.055, 0.6, bone, s * 0.56, 1.36, -0.16, 0, 0, 0, 5); b.rotation.set(-0.5, 0, -s * 0.1); j.head.add(a, b); }
  const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.035, 5, 28), halo); haloRing.position.set(0, 0.55, -0.34); j.head.add(haloRing);
  const spikes = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const c = cn(0.035, 0.34, halo, Math.sin(a) * 0.92, 0.55 + Math.cos(a) * 0.92, -0.34, 0, 0, 0, 4); c.rotation.z = -a; j.head.add(c); spikes.push(c); }
  // the long arms are not his
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    j[s + 'Sh'].add(bx(0.19, 1.15, 0.19, robe2, 0, -0.57, 0), bx(0.36, 0.7, 0.05, robe, 0, -0.55, -0.13));
    j[s + 'El'].add(bx(0.14, 1.25, 0.14, root, 0, -0.62, 0), sp(0.13, bone, 0, 0, -0.03)); j[s + 'Ha'].add(bx(0.24, 0.24, 0.12, root, 0, -0.1, 0));
    for (let i = 0; i < 4; i++) { const c = cn(0.035, 0.5, bone, -0.09 + i * 0.06, -0.42, 0.04, PI + 0.3, 0, 0, 4); j[s + 'Ha'].add(c); }
  }
  thorns(j.lEl, root, 5, 0.1, 91, 0, -0.5, 0, 0.5); thorns(j.rEl, root, 5, 0.1, 92, 0, -0.5, 0, 0.5);
  // crozier, with a burning censer on a chain
  const wp = new THREE.Group();
  wp.add(cy(0.05, 0.06, 4.4, gold, 0, 0, 1.6, PI / 2, 0, 0, 6));
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 5, 12, PI * 1.4), gold); hook.position.set(0, 0.34, 3.8); hook.rotation.set(0, PI / 2, -0.4); wp.add(hook);
  wp.add(bx(0.08, 0.5, 0.08, gold, 0, 0, 3.55), bx(0.4, 0.07, 0.07, gold, 0, 0.0, 3.4, 0, PI / 2, 0));
  const chain = new THREE.Group(); chain.position.set(0, 0.5, 3.9);
  chain.add(cy(0.012, 0.012, 0.9, gold, 0, -0.45, 0), sp(0.17, gold, 0, -1.0, 0, 1, 1.2, 1), sp(0.13, censer, 0, -1.0, 0, 1.15, 0.8, 1.15), cn(0.08, 0.2, gold, 0, -0.72, 0));
  wp.add(chain);
  const glint = sp(0.3, weaponGlow, 0, 0.2, 3.8); wp.add(glint);
  wp.position.y = -0.1; j.rHa.add(wp);
  const sBase = marker(wp, 0, 0, 1.0), sTip = marker(wp, 0, 0, 4.0), censerPos = marker(chain, 0, -1, 0);
  // wings of rib and shadow: folded away until the second phase
  const wings = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 0.3, 1.0, -0.26); g.scale.setScalar(0.001);
    for (let i = 0; i < 5; i++) {
      const a = 0.25 + i * 0.42, len = 3.4 - i * 0.35;
      const f = cn(0.06, len, bone, s * Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5, -0.1 * i, 0, 0, 0, 4); f.rotation.z = s * (a - PI / 2) ; g.add(f);
      if (i < 4) { const a2 = a + 0.42, l2 = len - 0.35; const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, s * Math.cos(a) * len * 0.9, Math.sin(a) * len * 0.9, -0.1 * i, s * Math.cos(a2) * l2 * 0.9, Math.sin(a2) * l2 * 0.9, -0.1 * (i + 1)], 3)); geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, wing)); }
    }
    j.chest.add(g); wings.push(g);
  }
  const mouth = marker(j.head, 0, 0.3, 0.3);
  const handL = marker(j.lHa, 0, -0.3, 0), handR = marker(j.rHa, 0, -0.3, 0);
  const light = new THREE.PointLight(0xff2a0c, 0, 16, 1.8); light.position.set(0, 3.6, 0.8); h.root.add(light);
  return done(h, mats, { sBase, sTip, wings, halo, haloRing, eye, inner, weaponGlow, chain, censerPos, mouth, handL, handR, light, height: 5.2 });
}
