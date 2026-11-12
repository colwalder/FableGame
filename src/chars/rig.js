// A tiny procedural skeleton. Characters face local +Z; their left is +X.
// Poses are plain objects { jointName: [rx, ry, rz], y: hipOffset, sx: bodyPitch }.
import * as THREE from 'three';

export const flat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });
export const glowMat = (color, intensity = 2.5) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, flatShading: true });

function mesh(g, mat, x, y, z, rx, ry, rz) { const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; return m; }
export const bx = (w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz);
export const cy = (rt, rb, h, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 7) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
export const cn = (r, h, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 5) => mesh(new THREE.ConeGeometry(r, h, seg), mat, x, y, z, rx, ry, rz);
export function sp(r, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 7) { const m = mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), mat, x, y, z, 0, 0, 0); m.scale.set(sx, sy, sz); return m; }

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
