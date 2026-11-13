// A tiny procedural skeleton. Characters face local +Z; their left is +X.
// Poses are plain objects { jointName: [rx, ry, rz], y: hipOffset, sx: bodyPitch }.
import * as THREE from 'three';

import { canvasTex, normalTex } from '../world/builder.js';

// Shared surface detail: beaten metal, woven cloth, and a grain for skin, leather and bark.
let DET = null;
function detail() {
  if (DET) return DET;
  const hammer = canvasTex(128, (g, s) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) { const x = Math.random() * s, y = Math.random() * s, r = 5 + Math.random() * 12, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(40,40,40,.5)'); gr.addColorStop(1, 'rgba(128,128,128,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(${Math.random() < 0.5 ? 20 : 235},${Math.random() < 0.5 ? 20 : 235},128,${Math.random() * 0.35})`; g.lineWidth = 0.6; g.beginPath(); const x = Math.random() * s, y = Math.random() * s, a = Math.random() * 6.3, l = 4 + Math.random() * 26; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  }, 1, 1);
  const weave = canvasTex(64, (g, s) => {
    g.fillStyle = '#707070'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 4) for (let x = 0; x < s; x += 4) { g.fillStyle = ((x + y) / 4) % 2 ? '#b8b8b8' : '#484848'; g.fillRect(x, y + (((x / 4) % 2) ? 0 : 2), 3, 2); }
  }, 3, 3);
  const grain = canvasTex(128, (g, s) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2400; i++) { const v = Math.random() < 0.5 ? 30 : 225; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.3})`; g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2.5, 1 + Math.random() * 5); }
  }, 1, 1);
  DET = { hammer: normalTex(hammer, 1.6), weave: normalTex(weave, 1.3), grain: normalTex(grain, 1.3) };
  return DET;
}

export const flat = (color, o = {}) => {
  const d = detail(), metal = (o.metalness || 0) > 0.4, cloth = o.roughness === 1, k = metal ? 0.55 : cloth ? 0.7 : 0.45;
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, normalMap: metal ? d.hammer : cloth ? d.weave : d.grain, normalScale: new THREE.Vector2(k, k), ...o });
};
export const glowMat = (color, intensity = 2.5) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });

/** Box with eased edges: corners pulled onto a small radius and given blended normals. */
function roundedBox(w, h, d) {
  const r = Math.min(0.05, Math.min(w, h, d) * 0.3), g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const p = g.attributes.position, n = g.attributes.normal, H = [w / 2, h / 2, d / 2], v = [0, 0, 0], c = [0, 0, 0];
  for (let i = 0; i < p.count; i++) {
    v[0] = p.getX(i); v[1] = p.getY(i); v[2] = p.getZ(i);
    let l = 0;
    for (let a = 0; a < 3; a++) {
      const outer = Math.abs(v[a]) > H[a] * 0.9, sg = Math.sign(v[a]);
      c[a] = sg * (H[a] - r); v[a] = outer ? sg * r : 0; l += v[a] * v[a];
    }
    l = Math.sqrt(l);
    if (l > 1e-7) { p.setXYZ(i, c[0] + (v[0] / l) * r, c[1] + (v[1] / l) * r, c[2] + (v[2] / l) * r); n.setXYZ(i, v[0] / l, v[1] / l, v[2] / l); }
    else p.setXYZ(i, c[0], c[1], c[2]);
  }
  return g;
}
function faceted(g) { const f = g.toNonIndexed(); f.computeVertexNormals(); g.dispose(); return f; }

function mesh(g, mat, x, y, z, rx, ry, rz) { const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; return m; }
export const bx = (w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => mesh(roundedBox(w, h, d), mat, x, y, z, rx, ry, rz);
export const cy = (rt, rb, h, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 7) => mesh(new THREE.CylinderGeometry(rt, rb, h, Math.max(seg, 12)), mat, x, y, z, rx, ry, rz);
export const cn = (r, h, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 5) => mesh(faceted(new THREE.ConeGeometry(r, h, seg)), mat, x, y, z, rx, ry, rz);
export function sp(r, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 7) { const m = mesh(new THREE.SphereGeometry(r, Math.max(seg, 14), 10), mat, x, y, z, 0, 0, 0); m.scale.set(sx, sy, sz); return m; }

export function humanoid(d = {}) {
  const o = { hipY: 0.98, pelvisH: 0.14, torsoH: 0.56, shoulderW: 0.3, upperArm: 0.32, foreArm: 0.3, hipW: 0.13, thigh: 0.46, shin: 0.46, ...d };
  const G = () => new THREE.Group();
  const root = G(), spin = G(), hips = G(), chest = G(), head = G();
  spin.position.y = o.hipY; root.add(spin); spin.add(hips);
  chest.position.y = o.pelvisH; hips.add(chest);
  head.position.y = o.torsoH; chest.add(head);
  const j = { hips, chest, head };
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    const sh = G(), el = G(), ha = G();
    sh.position.set(sg * o.shoulderW, o.torsoH - 0.07, 0); el.position.y = -o.upperArm; ha.position.y = -o.foreArm;
    chest.add(sh); sh.add(el); el.add(ha);
    const hp = G(), kn = G();
    hp.position.set(sg * o.hipW, 0, 0); kn.position.y = -o.thigh; hips.add(hp); hp.add(kn);
    j[s + 'Sh'] = sh; j[s + 'El'] = el; j[s + 'Ha'] = ha; j[s + 'Hip'] = hp; j[s + 'Kn'] = kn;
  }
  return { root, spin, j, o };
}

const NAMES = ['hips', 'chest', 'head', 'lSh', 'lEl', 'lHa', 'rSh', 'rEl', 'rHa', 'lHip', 'lKn', 'rHip', 'rKn'];
const ZERO = [0, 0, 0];
export class Rig {
  constructor(h) { this.h = h; this.j = h.j; this.baseY = h.spin.position.y; }
  /** Ease every joint toward the pose. rate >= 100 snaps. */
  pose(p, rate, dt) {
    const k = rate >= 100 ? 1 : 1 - Math.exp(-rate * dt);
    for (const n of NAMES) {
      const t = p[n] || ZERO, r = this.j[n].rotation;
      r.x += (t[0] - r.x) * k; r.y += (t[1] - r.y) * k; r.z += (t[2] - r.z) * k;
    }
    const s = this.h.spin;
    s.position.y += (this.baseY + (p.y || 0) - s.position.y) * k;
    s.rotation.x += ((p.sx || 0) - s.rotation.x) * k;
    s.rotation.z += ((p.sz || 0) - s.rotation.z) * k;
  }
}
