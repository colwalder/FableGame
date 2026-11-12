import * as THREE from 'three';
import { rand, TAU, lerp } from '../core/util.js';

function spriteTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const VS = `
attribute vec4 pcolor; attribute float psize;
varying vec4 vC; varying float vFog;
uniform float scale; uniform float fogDensity;
void main() {
  vC = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize * scale / max(0.1, -mv.z);
  float d = -mv.z;
  vFog = 1.0 - exp(-fogDensity * fogDensity * d * d);
}`;
const FS = `
uniform sampler2D map; uniform vec3 fogColor; uniform float additive;
varying vec4 vC; varying float vFog;
void main() {
  float a = texture2D(map, gl_PointCoord).a * vC.a;
  if (a < 0.004) discard;
  if (additive > 0.5) gl_FragColor = vec4(vC.rgb, a * (1.0 - vFog));
  else gl_FragColor = vec4(mix(vC.rgb, fogColor, vFog), a);
}`;

class PSys {
  constructor(scene, max, additive, tex) {
    this.max = max; this.i = 0;
    this.p = new Float32Array(max * 3); this.c = new Float32Array(max * 4); this.s = new Float32Array(max);
    this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.age = new Float32Array(max).fill(1e9);
    this.m = new Float32Array(max * 8); // r g b a s0 s1 grav drag
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.c, 4));
    g.setAttribute('psize', new THREE.BufferAttribute(this.s, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 }, fogDensity: { value: 0.02 }, fogColor: { value: new THREE.Color(0x0a0c10) }, additive: { value: additive ? 1 : 0 } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 11 : 10;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0) {
    const i = this.i; this.i = (i + 1) % this.max;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.age[i] = 0;
    const m = this.m, k = i * 8; m[k] = r; m[k + 1] = g; m[k + 2] = b; m[k + 3] = a; m[k + 4] = s0; m[k + 5] = s1; m[k + 6] = grav; m[k + 7] = drag;
  }
  update(dt) {
    const { p, v, c, s, m, age, life, max } = this;
    for (let i = 0; i < max; i++) {
      if (age[i] >= life[i]) { if (s[i] !== 0) { s[i] = 0; c[i * 4 + 3] = 0; } continue; }
      age[i] += dt;
      const k = age[i] / life[i], j = i * 3, q = i * 8;
      v[j + 1] -= m[q + 6] * dt;
      const dr = Math.max(0, 1 - m[q + 7] * dt);
      v[j] *= dr; v[j + 1] *= dr; v[j + 2] *= dr;
      p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      s[i] = lerp(m[q + 4], m[q + 5], k);
      c[i * 4] = m[q]; c[i * 4 + 1] = m[q + 1]; c[i * 4 + 2] = m[q + 2];
      c[i * 4 + 3] = m[q + 3] * Math.min(1, k * 8) * (1 - k) * (k >= 1 ? 0 : 1);
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.pcolor.needsUpdate = true; this.geo.attributes.psize.needsUpdate = true;
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    const tex = spriteTex();
    this.add = new PSys(scene, 3600, true, tex);
    this.alp = new PSys(scene, 2600, false, tex);
    this.ashT = 0;
  }
  setFog(color, density) {
    for (const s of [this.add, this.alp]) { s.mat.uniforms.fogColor.value.copy(color); s.mat.uniforms.fogDensity.value = density; }
  }
  resize(h) { this.add.mat.uniforms.scale.value = this.alp.mat.uniforms.scale.value = h * 0.9; }

  blood(x, y, z, dx, dz, n = 14, ichor = true) {
    for (let i = 0; i < n; i++) {
      const sp = rand(1.5, 6);
      const r = ichor ? rand(0.1, 0.22) : rand(0.4, 0.55);
      this.alp.spawn(x + rand(-0.15, 0.15), y + rand(-0.2, 0.2), z + rand(-0.15, 0.15),
        dx * sp + rand(-2, 2), rand(0.5, 4.5), dz * sp + rand(-2, 2), rand(0.35, 0.8), rand(0.12, 0.28), 0.04,
        r, ichor ? 0.02 : 0.03, ichor ? rand(0.03, 0.08) : 0.03, 0.95, 13, 0.6);
    }
    for (let i = 0; i < 3; i++) this.alp.spawn(x, y, z, dx * 1.5 + rand(-1, 1), rand(0.3, 1.2), dz * 1.5 + rand(-1, 1), 0.5, 0.5, 1.3, 0.2, 0.03, 0.05, 0.4, 0, 2);
  }
  sparks(x, y, z, n = 12, r = 1, g = 0.7, b = 0.3) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), sp = rand(2, 9);
      this.add.spawn(x, y, z, Math.cos(a) * sp, rand(1, 7), Math.sin(a) * sp, rand(0.25, 0.7), rand(0.1, 0.2), 0.02, r, g * rand(0.6, 1), b, 1, 16, 1);
    }
  }
  dust(x, y, z, n = 10, spread = 1, dark = 0.3) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), sp = rand(0.5, 3) * spread, v = dark * rand(0.7, 1.2);
      this.alp.spawn(x + Math.cos(a) * rand(spread * 0.5), y + rand(0.1, 0.3), z + Math.sin(a) * rand(spread * 0.5), Math.cos(a) * sp, rand(0.3, 1.6), Math.sin(a) * sp, rand(0.7, 1.6), rand(0.5, 0.9), rand(1.6, 2.8), v, v * 0.92, v * 0.85, 0.35, -0.2, 2);
    }
  }
  smoke(x, y, z, n = 6, shade = 0.04, size = 1) {
    for (let i = 0; i < n; i++) this.alp.spawn(x + rand(-0.3, 0.3) * size, y + rand(-0.3, 0.3) * size, z + rand(-0.3, 0.3) * size, rand(-0.5, 0.5), rand(0.3, 1.5), rand(-0.5, 0.5), rand(0.8, 2), 0.8 * size, 2.4 * size, shade, shade * 0.7, shade * 0.8, 0.6, -0.1, 1);
  }
  flame(x, y, z, size = 1) {
    this.add.spawn(x + rand(-0.08, 0.08) * size, y, z + rand(-0.08, 0.08) * size, rand(-0.15, 0.15), rand(0.7, 1.6) * size, rand(-0.15, 0.15), rand(0.3, 0.6), 0.5 * size, 0.08 * size, 1, rand(0.35, 0.6), 0.1, 0.8, 0, 0.5);
    if (Math.random() < 0.12) this.add.spawn(x, y + 0.2, z, rand(-0.5, 0.5), rand(1.2, 2.5), rand(-0.5, 0.5), rand(0.8, 1.6), 0.06, 0.02, 1, 0.5, 0.15, 1, -0.5, 0.4);
  }
  curseMote(x, y, z) {
    this.add.spawn(x + rand(-0.6, 0.6), y + rand(0, 0.4), z + rand(-0.6, 0.6), rand(-0.2, 0.2), rand(0.25, 0.9), rand(-0.2, 0.2), rand(1.2, 2.6), 0.09, 0.02, 1, 0.16, 0.05, 0.9, 0, 0.3);
  }
  glint(x, y, z) {
    this.add.spawn(x + rand(-0.25, 0.25), y + rand(-0.1, 0.3), z + rand(-0.25, 0.25), 0, rand(0.15, 0.5), 0, rand(1, 2), 0.16, 0.03, 1, 0.86, 0.55, 0.85, 0, 0);
  }
  echo(x, y, z) {
    const a = rand(TAU), r = rand(0.5, 3.5);
    this.add.spawn(x + Math.cos(a) * r, y + rand(0, 0.5), z + Math.sin(a) * r, 0, rand(0.2, 0.7), 0, rand(1.5, 3), 0.14, 0.04, 0.45, 0.7, 1, 0.7, 0, 0);
  }
  note(x, y, z) {
    const a = rand(TAU);
    this.add.spawn(x + Math.cos(a) * 0.4, y, z + Math.sin(a) * 0.4, Math.cos(a) * 0.7, rand(0.6, 1.5), Math.sin(a) * 0.7, rand(1, 1.8), 0.22, 0.04, 1, 0.84, 0.45, 0.9, -0.2, 0.8);
  }
  burst(x, y, z, r, g, b, n = 24, speed = 6, size = 0.3, life = 0.7) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), e = rand(-1, 1), sp = rand(0.3, 1) * speed, ce = Math.sqrt(1 - e * e);
      this.add.spawn(x, y, z, Math.cos(a) * ce * sp, e * sp, Math.sin(a) * ce * sp, rand(0.5, 1) * life, size, size * 0.1, r, g, b, 1, 0, 2.5);
    }
  }
  pillar(x, y, z, radius, r = 1, g = 0.3, b = 0.08) {
    for (let i = 0; i < 46; i++) {
      const a = rand(TAU), d = Math.sqrt(Math.random()) * radius;
      this.add.spawn(x + Math.cos(a) * d, y + rand(0, 0.5), z + Math.sin(a) * d, 0, rand(5, 15), 0, rand(0.35, 0.8), rand(0.5, 1.1), 0.1, r, g * rand(0.6, 1.3), b, 0.9, 0, 1.2);
    }
  }
  silver(x, y, z, n = 8) {
    for (let i = 0; i < n; i++) { const a = rand(TAU); this.add.spawn(x, y + rand(0.3, 1.2), z, Math.cos(a) * rand(0.5, 2), rand(1.5, 4), Math.sin(a) * rand(0.5, 2), rand(0.6, 1.1), 0.14, 0.02, 0.8, 0.88, 1, 1, 3, 1.5); }
  }
  /** Ambient ash and embers drifting around the camera. */
  ambient(dt, px, py, pz, corruption) {
    this.ashT += dt * (26 + corruption * 40);
    while (this.ashT > 1) {
      this.ashT -= 1;
      const x = px + rand(-24, 24), z = pz + rand(-24, 24), y = py + rand(0.2, 9);
      if (Math.random() < 0.25 + corruption * 0.45) this.add.spawn(x, y, z, rand(-0.5, 0.2), rand(0.1, 0.7), rand(-0.6, 0.1), rand(3, 6), 0.07, 0.03, 1, rand(0.2, 0.45), 0.08, 0.8 * corruption + 0.15, -0.05, 0);
      else { const v = rand(0.25, 0.5); this.alp.spawn(x, y, z, rand(-0.7, 0.1), rand(-0.6, -0.15), rand(-0.6, 0.2), rand(4, 7), rand(0.05, 0.1), 0.05, v, v, v * 1.05, 0.55, 0, 0); }
    }
  }
  update(dt) { this.add.update(dt); this.alp.update(dt); }
}

/** Ribbon that follows the blade through a swing. */
export class Trail {
  constructor(scene, n = 20) {
    this.n = n; this.pts = [];
    this.pos = new Float32Array(n * 2 * 3); this.col = new Float32Array(n * 2 * 4);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 12;
    scene.add(this.mesh);
    this.color = new THREE.Color(0.75, 0.82, 1);
    this.life = 0.2;
  }
  push(base, tip) { this.pts.unshift({ b: base.clone(), t: tip.clone(), age: 0 }); if (this.pts.length > this.n) this.pts.pop(); }
  update(dt) {
    for (const p of this.pts) p.age += dt;
    while (this.pts.length && this.pts[this.pts.length - 1].age > this.life) this.pts.pop();
    const { pos, col, n } = this, c = this.color;
    for (let i = 0; i < n; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)];
      const a = p && i < this.pts.length ? (1 - p.age / this.life) : 0;
      const j = i * 6, k = i * 8;
      if (p) { pos[j] = p.b.x; pos[j + 1] = p.b.y; pos[j + 2] = p.b.z; pos[j + 3] = p.t.x; pos[j + 4] = p.t.y; pos[j + 5] = p.t.z; }
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; col[k + 3] = 0;
      col[k + 4] = c.r; col[k + 5] = c.g; col[k + 6] = c.b; col[k + 7] = a * a * 0.7;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
    this.mesh.visible = this.pts.length > 1;
  }
}
