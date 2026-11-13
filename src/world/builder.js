// Static world geometry is assembled from primitives, optionally warped (the curse
// twists buildings), then merged into a handful of meshes per material and region.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lerp } from '../core/util.js';

export function canvasTex(size, draw, rx = 1, ry = 1, res = 2) {
  const c = document.createElement('canvas'); c.width = c.height = size * res;
  const g = c.getContext('2d', { willReadFrequently: true }); g.scale(res, res);
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Tangent-space normal map from the brightness of a canvas texture (bright = raised). */
export function normalTex(src, strength = 2) {
  const c = src.image, w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data;
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const o = out.getContext('2d'), img = o.createImageData(w, h), q = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = (x - 1 + w) % w, xr = (x + 1) % w, yu = (y - 1 + h) % h, yd = (y + 1) % h;
    const dx = (H[y * w + xr] - H[y * w + xl] + (H[yu * w + xr] - H[yu * w + xl] + H[yd * w + xr] - H[yd * w + xl]) * 0.5) * strength;
    const dy = (H[yd * w + x] - H[yu * w + x] + (H[yd * w + xl] - H[yu * w + xl] + H[yd * w + xr] - H[yu * w + xr]) * 0.5) * strength;
    const l = 1 / Math.hypot(dx, dy, 1), k = (y * w + x) * 4;
    q[k] = (-dx * l * 0.5 + 0.5) * 255; q[k + 1] = (dy * l * 0.5 + 0.5) * 255; q[k + 2] = (l * 0.5 + 0.5) * 255; q[k + 3] = 255;
  }
  o.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.copy(src.repeat); t.anisotropy = 8;
  return t;
}

export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const cache = new Map();
function cylGeo(rt, rb, seg) {
  const k = `c${rt.toFixed(3)}_${rb.toFixed(3)}_${seg}`;
  if (!cache.has(k)) cache.set(k, new THREE.CylinderGeometry(rt, rb, 1, seg));
  return cache.get(k);
}
function sphGeo(seg) {
  const k = 's' + seg;
  if (!cache.has(k)) cache.set(k, new THREE.SphereGeometry(1, seg, Math.max(4, seg - 1)));
  return cache.get(k);
}

/** Triangular prism: triangle (base w, height h) in XY, extruded d along Z, base at y=0. */
export function prismGeo(w, h, d) {
  const a = w / 2, e = d / 2;
  const A = [-a, 0, e], B = [a, 0, e], C = [0, h, e], A2 = [-a, 0, -e], B2 = [a, 0, -e], C2 = [0, h, -e];
  const tris = [A, B, C, B2, A2, C2, A2, A, C, A2, C, C2, B, B2, C2, B, C2, C, A2, B2, B, A2, B, A];
  const pos = new Float32Array(tris.flat());
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = (pos[i * 3] + pos[i * 3 + 2]) / Math.max(w, d) + 0.5; uv[i * 2 + 1] = pos[i * 3 + 1] / h; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Tapered tube along a spline — roots, tendrils, ropes. */
export function tubeGeo(points, r0, r1, seg = 10, rad = 5) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  const pos = g.attributes.position, P = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, P);
    const r = lerp(r0, r1, i / seg);
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j;
      v.fromBufferAttribute(pos, k).sub(P).multiplyScalar(r).add(P);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  return g;
}

/** Onion dome profile, radius r, total height ~2.6r. */
export function onionGeo(r, seg = 10) {
  const pts = [];
  const prof = [[0.55, 0], [0.9, 0.25], [1.0, 0.55], [0.92, 0.9], [0.68, 1.3], [0.38, 1.7], [0.16, 2.1], [0.05, 2.5], [0.0, 2.7]];
  for (const [x, y] of prof) pts.push(new THREE.Vector2(x * r, y * r));
  return new THREE.LatheGeometry(pts, seg);
}

const _v = new THREE.Vector3(), _c = new THREE.Color();
function prep(geo, m, color, deform, world, jitter) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(m);
  if (deform) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); deform(_v); p.setXYZ(i, _v.x, _v.y, _v.z); }
  }
  if (world) g.applyMatrix4(world);
  if (!g.attributes.normal) g.computeVertexNormals();           // keep authored normals: round things stay round
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  _c.set(color);
  const k = 1 + (Math.random() - 0.5) * jitter;                 // one shade per piece; the textures carry the fine detail
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

export class Batch {
  constructor() { this.groups = new Map(); }
  push(mat, g, bucket) { const k = mat + '|' + bucket; let a = this.groups.get(k); if (!a) this.groups.set(k, (a = [])); a.push(g); }
  build(scene, mats) {
    const out = [];
    for (const [k, list] of this.groups) {
      const mat = mats[k.split('|')[0]];
      const g = mergeGeometries(list, false);
      if (!g) { console.warn('merge failed for', k); continue; }
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = !mat.userData.noShadow; mesh.receiveShadow = !mat.userData.noShadow;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh); out.push(mesh);
      for (const x of list) x.dispose();
    }
    this.groups.clear();
    return out;
  }
}

export class Builder {
  constructor() { this.items = []; }
  geo(mat, geometry, m, color = 0xffffff) { this.items.push({ geo: geometry, mat, m: m || new THREE.Matrix4(), color }); return this; }
  box(mat, w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) { return this.geo(mat, UNIT_BOX, mat4(x, y, z, rx, ry, rz, w, h, d), color); }
  cyl(mat, rt, rb, h, x, y, z, color, rx = 0, ry = 0, rz = 0, seg = 10) {
    const m = Math.max(rt, rb, 1e-4);
    return this.geo(mat, cylGeo(rt / m, rb / m, seg), mat4(x, y, z, rx, ry, rz, m, h, m), color);
  }
  cone(mat, r, h, x, y, z, color, rx = 0, ry = 0, rz = 0, seg = 6) { return this.cyl(mat, 0, r, h, x, y, z, color, rx, ry, rz, seg); }
  sph(mat, r, x, y, z, color, sx = 1, sy = 1, sz = 1, seg = 10) { return this.geo(mat, sphGeo(seg), mat4(x, y, z, 0, 0, 0, r * sx, r * sy, r * sz), color); }
  /** Tapered limb from point a to point b. */
  between(mat, a, b, r0, r1, color, seg = 6) {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = Math.max(r0, r1);
    const mm = new THREE.Matrix4().compose(A.add(Bv).multiplyScalar(0.5), q, new THREE.Vector3(m, len, m));
    return this.geo(mat, cylGeo(r1 / m, r0 / m, seg), mm, color);
  }
  flush(batch, world, deform = null, jitter = 0.14, bz = null) {
    const bucket = Math.round((bz !== null ? bz : world ? new THREE.Vector3().setFromMatrixPosition(world).z : 0) / 44);
    for (const it of this.items) batch.push(it.mat, prep(it.geo, it.m, it.color, deform, world, jitter), bucket);
    this.items.length = 0;
  }
}

// ---------- textures & materials ----------
function speckle(g, s, n, colors, w = 40, h = 1, alpha = 0.15) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${colors[(Math.random() * colors.length) | 0]},${Math.random() * alpha})`;
    g.fillRect(Math.random() * s, Math.random() * s, 4 + Math.random() * w, h + Math.random() * h);
  }
}
export function makeMaterials() {
  const logs = canvasTex(256, (g, s) => {
    for (let i = 0; i < 4; i++) {
      const y = (i * s) / 4, gr = g.createLinearGradient(0, y, 0, y + s / 4);
      gr.addColorStop(0, '#2a221c'); gr.addColorStop(0.2, '#b3a595'); gr.addColorStop(0.55, '#9a8c7c'); gr.addColorStop(0.92, '#4a3e34'); gr.addColorStop(1, '#17120e');
      g.fillStyle = gr; g.fillRect(0, y, s, s / 4);
    }
    speckle(g, s, 700, ['20,14,10', '220,210,190', '60,45,35'], 70, 1, 0.22);
  }, 2, 1);
  const plank = canvasTex(256, (g, s) => {
    for (let i = 0; i < 6; i++) {
      const x = (i * s) / 6, v = 130 + Math.random() * 70;
      g.fillStyle = `rgb(${v},${v * 0.93},${v * 0.85})`; g.fillRect(x, 0, s / 6, s);
      g.fillStyle = '#1a1410'; g.fillRect(x, 0, 2.5, s);
    }
    for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,14,10' : '230,220,200'},${Math.random() * 0.16})`; g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random(), 8 + Math.random() * 60); }
  }, 1, 1);
  const thatch = canvasTex(256, (g, s) => {
    g.fillStyle = '#a89a78'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const v = 70 + Math.random() * 150;
      g.fillStyle = `rgba(${v},${v * 0.9},${v * 0.66},${0.2 + Math.random() * 0.4})`;
      g.fillRect(Math.random() * s, Math.random() * s, 1.5, 10 + Math.random() * 40);
    }
    for (let y = 0; y < s; y += s / 5) { g.fillStyle = 'rgba(20,15,8,.35)'; g.fillRect(0, y, s, 5); }
  }, 2, 2);
  const stone = canvasTex(256, (g, s) => {
    g.fillStyle = '#2a2826'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = 120 + Math.random() * 100, ox = (y % 2) * 16;
      g.fillStyle = `rgb(${v},${v * 0.98},${v * 0.94})`;
      g.beginPath(); g.roundRect(x * 32 + ox - 14 + Math.random() * 3, y * 32 + 2 + Math.random() * 3, 26 - Math.random() * 4, 26 - Math.random() * 4, 7); g.fill();
    }
    speckle(g, s, 400, ['10,10,10', '240,240,230'], 6, 3, 0.15);
  }, 2, 2);
  const shingle = canvasTex(256, (g, s) => {
    g.fillStyle = '#1c1816'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 8; y++) for (let x = -1; x < 8; x++) {
      const v = 110 + Math.random() * 90;
      g.fillStyle = `rgb(${v},${v * 0.95},${v * 0.9})`;
      g.beginPath(); g.roundRect(x * 32 + (y % 2) * 16 + 1.5, y * 32 - 6, 29, 36, [0, 0, 12, 12]); g.fill();
    }
  }, 3, 3);
  // fine grain for everything that has no picture of its own: hewn timber, cloth, beaten iron, bark
  const grain = canvasTex(128, (g, s) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) { const v = Math.random() < 0.5 ? 30 : 225; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.3})`; g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2.5, 1 + Math.random() * 7); }
  }, 2, 2);
  const weave = canvasTex(64, (g, s) => {
    g.fillStyle = '#707070'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 4) for (let x = 0; x < s; x += 4) { g.fillStyle = ((x + y) / 4) % 2 ? '#b8b8b8' : '#484848'; g.fillRect(x, y + (((x / 4) % 2) ? 0 : 2), 3, 2); }
  }, 6, 6);
  const nGrain = normalTex(grain, 1.4), nWeave = normalTex(weave, 1.2);
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, ...o });
  const N = (t, k, sc = 1) => ({ map: t, normalMap: normalTex(t, k), normalScale: new THREE.Vector2(sc, sc) });
  const M = {
    wood: std({ ...N(logs, 3.2), roughness: 0.82 }), plank: std({ ...N(plank, 2.6), roughness: 0.85 }), thatch: std({ ...N(thatch, 3), roughness: 1 }),
    stone: std({ ...N(stone, 3.4), roughness: 0.78 }), shingle: std({ ...N(shingle, 3), roughness: 0.7 }),
    plain: std({ normalMap: nGrain, normalScale: new THREE.Vector2(0.5, 0.5) }), cloth: std({ side: THREE.DoubleSide, roughness: 1, normalMap: nWeave, normalScale: new THREE.Vector2(0.6, 0.6) }),
    metal: std({ roughness: 0.38, metalness: 0.85, normalMap: nGrain, normalScale: new THREE.Vector2(0.35, 0.35) }),
    root: std({ roughness: 0.5, normalMap: nGrain, normalScale: new THREE.Vector2(0.9, 0.9) }),
    glow: new THREE.MeshStandardMaterial({ color: 0x1a0503, emissive: 0xff3210, emissiveIntensity: 2.4, roughness: 0.4 }),
    fire: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa044, emissiveIntensity: 3.2 }),
    window: new THREE.MeshStandardMaterial({ color: 0x100404, emissive: 0xc02c10, emissiveIntensity: 1.5 }),
    gild: new THREE.MeshStandardMaterial({ color: 0x8a6a2a, emissive: 0x5a3a08, emissiveIntensity: 0.5, roughness: 0.32, metalness: 0.9, vertexColors: true, normalMap: nGrain, normalScale: new THREE.Vector2(0.3, 0.3) }),
  };
  M.detail = { grain: nGrain, weave: nWeave };
  for (const k of ['glow', 'fire', 'window']) M[k].userData.noShadow = true;
  return M;
}

/** Merge everything in a Builder into one vertex-coloured geometry (for instancing). */
export function bake(B, jitter = 0.1) {
  const list = B.items.map((it) => prep(it.geo, it.m, it.color, null, null, jitter));
  B.items.length = 0;
  return mergeGeometries(list, false);
}
