// Telegraphed ground eruptions, shockwaves and hex-orbs.
import * as THREE from 'three';
import { groundHeight } from '../world/terrain.js';
import { rand, TAU, clamp } from '../core/util.js';

const PI = Math.PI;

export class Hazards {
  constructor(game) {
    this.g = game; this.list = [];
    this.disc = new THREE.CircleGeometry(1, 36).rotateX(-PI / 2);
    this.rim = new THREE.RingGeometry(0.9, 1, 48).rotateX(-PI / 2);
    this.waveGeo = new THREE.RingGeometry(0.86, 1, 64).rotateX(-PI / 2);
    this.orbGeo = new THREE.SphereGeometry(1, 9, 7);
    this.spikeGeo = new THREE.ConeGeometry(0.22, 1, 5).translate(0, 0.5, 0);
    this.spikeMat = new THREE.MeshStandardMaterial({ color: 0x1b1115, roughness: 0.6, flatShading: true });
  }
  _mat(color, opacity) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }); }

  telegraph(x, z, r, delay, dmg, o = {}) {
    const y = groundHeight(x, z) + 0.06, color = o.color || 0xff2a0c, g = new THREE.Group();
    const d = new THREE.Mesh(this.disc, this._mat(color, 0.05)), rim = new THREE.Mesh(this.rim, this._mat(color, 0.9));
    d.scale.setScalar(r); rim.scale.setScalar(r); g.add(d, rim); g.position.set(x, y, z); g.renderOrder = 8; this.g.scene.add(g);
    const h = { type: 'tele', x, y, z, r, delay, dmg, t: 0, g, d, rim, kind: o.kind || 'fire', heavy: o.heavy, done: false, spikes: [], follow: o.follow, lockAt: o.lockAt, onErupt: o.onErupt };
    this.list.push(h); return h;
  }
  wave(x, z, speed, maxR, dmg, o = {}) {
    const m = new THREE.Mesh(this.waveGeo, this._mat(o.color || 0xff5a20, 0.9));
    m.position.set(x, groundHeight(x, z) + 0.14, z); m.renderOrder = 8; this.g.scene.add(m);
    this.list.push({ type: 'wave', x, z, R: o.r0 || 0.5, speed, maxR, dmg, m, hit: false, knock: o.knock || 6 });
  }
  orb(x, y, z, vx, vy, vz, o = {}) {
    const color = o.color || 0xff3a18, m = new THREE.Mesh(this.orbGeo, new THREE.MeshBasicMaterial({ color, fog: false }));
    const r = o.r || 0.3; m.scale.setScalar(r); m.position.set(x, y, z); this.g.scene.add(m);
    this.list.push({ type: 'orb', m, vx, vy, vz, r, dmg: o.dmg || 15, life: o.life || 5, homing: o.homing || 0, homeT: o.homeT || 1.2, t: 0, color: new THREE.Color(color), hex: color, speed: Math.hypot(vx, vy, vz), bounds: o.bounds });
  }
  clear() { for (const h of this.list) this._remove(h); this.list.length = 0; }
  _remove(h) {
    if (h.g) this.g.scene.remove(h.g); if (h.m) this.g.scene.remove(h.m);
    if (h.d) { h.d.material.dispose(); h.rim.material.dispose(); } else if (h.m) h.m.material.dispose();
    for (const s of h.spikes || []) this.g.scene.remove(s);
  }

  update(dt) {
    const g = this.g, p = g.player, fx = g.fx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i]; let dead = false;
      if (h.type === 'tele') {
        h.t += dt;
        if (!h.done) {
          if (h.follow && h.t < (h.lockAt || h.delay)) { h.x += (p.pos.x - h.x) * Math.min(1, dt * h.follow); h.z += (p.pos.z - h.z) * Math.min(1, dt * h.follow); h.g.position.set(h.x, groundHeight(h.x, h.z) + 0.06, h.z); }
          const k = clamp(h.t / h.delay, 0, 1);
          h.d.material.opacity = 0.05 + k * k * 0.4; h.d.scale.setScalar(h.r * (0.2 + 0.8 * k)); h.rim.material.opacity = 0.5 + 0.5 * Math.sin(h.t * 22);
          if (h.t >= h.delay) {
            h.done = true; h.t = 0; h.g.visible = false;
            g.audio.sfx.at(h).erupt(); g.shake(0.35, h.x, h.z);
            if (h.kind === 'roots') {
              for (let n = 0; n < 7; n++) { const a = rand(TAU), d = Math.sqrt(Math.random()) * h.r * 0.85; const s = new THREE.Mesh(this.spikeGeo, this.spikeMat); s.position.set(h.x + Math.sin(a) * d, h.y - 0.2, h.z + Math.cos(a) * d); s.rotation.set(rand(-0.35, 0.35), rand(TAU), rand(-0.35, 0.35)); s.userData.h = rand(1.6, 3.4); s.scale.set(1.3, 0.01, 1.3); s.castShadow = true; g.scene.add(s); h.spikes.push(s); }
              fx.dust(h.x, h.y, h.z, 14, h.r * 0.7, 0.12); fx.sparks(h.x, h.y + 0.3, h.z, 10, 1, 0.2, 0.08);
            } else { fx.pillar(h.x, h.y, h.z, h.r); fx.sparks(h.x, h.y + 0.5, h.z, 18); }
            g.world.dyn.push({ x: h.x, y: h.y + 2, z: h.z, color: 0xff4a18, i: 80, r: 16, prio: 3 });
            if (h.dmg > 0 && Math.hypot(p.pos.x - h.x, p.pos.z - h.z) < h.r + 0.25) p.takeDamage(h.dmg, { x: h.x, z: h.z }, { heavy: h.heavy, knock: 5 });
            if (h.onErupt) h.onErupt(h);
          }
        } else {
          const k = h.t;
          for (const s of h.spikes) s.scale.y = s.userData.h * (k < 0.1 ? k / 0.1 : k < 0.7 ? 1 : Math.max(0.01, 1 - (k - 0.7) / 0.35));
          if (h.kind === 'fire' && k < 0.35) g.world.dyn.push({ x: h.x, y: h.y + 2, z: h.z, color: 0xff4a18, i: 80 * (1 - k / 0.35), r: 16, prio: 3 });
          if (k > 1.05) dead = true;
        }
      } else if (h.type === 'wave') {
        h.R += h.speed * dt; h.m.scale.setScalar(h.R); h.m.material.opacity = 0.95 * (1 - h.R / h.maxR);
        if (Math.random() < 0.7) { const a = rand(TAU); fx.dust(h.x + Math.sin(a) * h.R, h.m.position.y, h.z + Math.cos(a) * h.R, 1, 0.5, 0.2); }
        const d = Math.hypot(p.pos.x - h.x, p.pos.z - h.z);
        if (!h.hit && Math.abs(d - h.R) < 0.8 && h.R > 1.2) { if (p.takeDamage(h.dmg, { x: h.x, z: h.z }, { knock: h.knock })) h.hit = true; }
        if (h.R >= h.maxR) dead = true;
      } else if (h.type === 'orb') {
        h.t += dt; const m = h.m.position, ty = p.pos.y + 1.15;
        if (h.homing > 0 && h.t < h.homeT) {
          const dx = p.pos.x - m.x, dy = ty - m.y, dz = p.pos.z - m.z, l = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, h.homing * dt);
          h.vx += (dx / l * h.speed - h.vx) * k; h.vy += (dy / l * h.speed - h.vy) * k; h.vz += (dz / l * h.speed - h.vz) * k;
        }
        m.x += h.vx * dt; m.y += h.vy * dt; m.z += h.vz * dt;
        h.m.scale.setScalar(h.r * (1 + Math.sin(h.t * 30) * 0.12));
        fx.add.spawn(m.x, m.y, m.z, rand(-0.4, 0.4), rand(-0.4, 0.4), rand(-0.4, 0.4), 0.4, h.r * 2.6, 0.05, h.color.r, h.color.g, h.color.b, 0.8, 0, 0);
        if (i % 3 === 0) g.world.dyn.push({ x: m.x, y: m.y, z: m.z, color: h.hex, i: 12, r: 7 });
        const hitP = Math.hypot(p.pos.x - m.x, ty - m.y, p.pos.z - m.z) < h.r + 0.6;
        if (hitP && p.takeDamage(h.dmg, { x: m.x - h.vx, z: m.z - h.vz }, { knock: 3 })) dead = true;
        const b = h.bounds;
        if (h.t > h.life || m.y < groundHeight(m.x, m.z) + 0.1 || (b && (m.x < b.minX - 1.4 || m.x > b.maxX + 1.4 || m.z < b.minZ - 5 || m.z > b.maxZ + 1))) dead = true;
        if (dead) { fx.burst(m.x, m.y, m.z, h.color.r, h.color.g, h.color.b, 12, 4, 0.25, 0.5); g.audio.sfx.at(m).orb(); }
      }
      if (dead) { this._remove(h); this.list.splice(i, 1); }
    }
  }
}
