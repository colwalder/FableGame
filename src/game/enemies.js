import * as THREE from 'three';
import { makeHusk, makeStrzyga, makeWailer, makeBrute } from '../chars/models.js';
import * as A from '../chars/anims.js';
import { groundHeight, SQUARE } from '../world/terrain.js';
import { clamp, damp, dampAngle, angDiff, rand, TAU } from '../core/util.js';

const v1 = new THREE.Vector3();

/** Anything that walks, fights and can be hit. */
export class Actor {
  constructor(game, model, x, z) {
    this.game = game; this.model = model; this.rig = model.rig;
    this.pos = new THREE.Vector3(x, groundHeight(x, z), z);
    this.yaw = 0; this.state = 'idle'; this.t = 0; this.time = Math.random() * 10; this.dead = false; this.flash = 0; this.kx = 0; this.kz = 0; this.radius = 0.5;
    this.height = model.height || 1.9; this.lift = 0; this.invuln = false; this.untargetable = false; this.ph = Math.random() * 6;
    game.scene.add(model.root);
  }
  set(s) { this.state = s; this.t = 0; this.hitDone = false; }
  look() { const p = this.game.player.pos; this._dx = p.x - this.pos.x; this._dz = p.z - this.pos.z; this._d = Math.hypot(this._dx, this._dz); this._a = Math.atan2(this._dx, this._dz); }
  face(a, rate, dt) { this.yaw = dampAngle(this.yaw, a, rate, dt); }
  step(speed, dt, yaw = this.yaw) { this.pos.x += Math.sin(yaw) * speed * dt; this.pos.z += Math.cos(yaw) * speed * dt; }
  knock(from, k) { const dx = this.pos.x - from.x, dz = this.pos.z - from.z, l = Math.hypot(dx, dz) || 1; this.kx = dx / l * k; this.kz = dz / l * k; }
  physics(dt, collide = true) {
    this.pos.x += this.kx * dt; this.pos.z += this.kz * dt; this.kx = damp(this.kx, 0, 7, dt); this.kz = damp(this.kz, 0, 7, dt);
    if (collide) this.game.world.resolve(this.pos, this.radius);
    this.pos.y = damp(this.pos.y, groundHeight(this.pos.x, this.pos.z), 18, dt);
  }
  sync(dt) {
    const r = this.model.root; r.position.set(this.pos.x, this.pos.y + this.lift, this.pos.z); r.rotation.y = this.yaw;
    if (this.flash > 0 || this._flashed) {
      this.flash = Math.max(0, this.flash - dt); const f = this.flash * 9; this._flashed = this.flash > 0;
      for (const m of this.model.mats) m.emissive.setRGB(f, f * 0.75, f * 0.6);
    }
  }
  /** Melee check against the player. */
  strike(range, arc, dmg, o = {}) {
    const p = this.game.player, dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d > range + p.radius) return false;
    if (arc < 6 && d > this.radius + 0.7 && Math.abs(angDiff(this.yaw, Math.atan2(dx, dz))) > arc / 2) return false;
    return p.takeDamage(dmg, this.pos, o);
  }
  tip(out = v1) { this.model.root.updateMatrixWorld(true); return this.model.sTip.getWorldPosition(out); }
}

const DEF = {
  husk: { hp: 72, walk: 0.9, run: 2.7, sight: 13, range: 1.75, reach: 2.4, arc: 2.0, dmg: 15, wind: 0.55, act: 0.2, rec: 0.75, poise: 26, silver: 30, r: 0.45, cd: 0.5, pitch: 1 },
  strzyga: { hp: 62, walk: 1.6, run: 5.6, sight: 19, range: 6, reach: 1.7, dmg: 19, wind: 0.5, act: 0.45, rec: 0.6, poise: 30, silver: 55, r: 0.5, cd: 1.1, leap: 13.5, pitch: 2.4 },
  wailer: { hp: 66, walk: 1.2, run: 2.3, sight: 21, range: 16, dmg: 17, wind: 1.0, act: 0.1, rec: 1.0, poise: 30, silver: 70, r: 0.45, cd: 1.5, keep: 9.5, pitch: 3 },
  brute: { hp: 270, walk: 1.2, run: 2.5, sight: 15, range: 3.3, reach: 4.2, arc: 2.3, dmg: 31, wind: 0.85, act: 0.24, rec: 1.05, poise: 115, silver: 190, r: 0.85, cd: 0.6, pitch: 0.6 },
};

export class Enemy extends Actor {
  constructor(game, sp, seed) {
    const model = sp.type === 'husk' ? makeHusk(seed) : sp.type === 'strzyga' ? makeStrzyga(seed) : sp.type === 'wailer' ? makeWailer(seed) : makeBrute(seed, sp.sexton);
    super(game, model, sp.x, sp.z);
    this.type = sp.type; this.sp = sp; this.def = DEF[sp.type]; this.radius = this.def.r; this.seed = seed;
    if (this.type === 'wailer') this.lift = 0.25;
    this.reset();
  }
  reset() {
    const s = this.sp, D = this.def;
    this.pos.set(s.x, groundHeight(s.x, s.z), s.z); this.home = { x: s.x, z: s.z }; this.yaw = s.yaw !== undefined ? s.yaw : rand(TAU);
    this.hp = D.hp * (s.sexton ? 1.25 : 1); this.maxHp = this.hp; this.poise = D.poise; this.dead = false; this.aggro = false; this.cd = 0; this.wt = rand(1, 4); this.wx = s.x; this.wz = s.z; this.kx = this.kz = 0;
    this.set(s.dormant ? 'dormant' : 'idle');
    const r = this.model.root; r.visible = true; r.position.y = this.pos.y;
    if (s.dormant) this.rig.pose(A.huskLying(), 100, 0); else this.rig.pose({}, 100, 0);
    this.sinkY = 0; this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.sync(0);
  }
  takeDamage(dmg, poise, from, a) {
    if (this.dead) return false;
    const g = this.game;
    this.hp -= dmg; this.flash = 0.13; this.poise -= poise;
    if (!this.aggro) { this.aggro = true; }
    if (this.state === 'dormant') this.set('rise');
    this.knock(from, this.type === 'brute' ? 1.5 : a.big ? 7 : 4);
    if (this.hp <= 0) { this.die(from); return true; }
    if (this.poise <= 0) { this.poise = this.def.poise; if (this.state !== 'rise') this.set('stagger'); this.cd = 0.4; }
    else if (this.type === 'brute') g.audio.sfx.at(this.pos).groan(0.6, 0.25);
    return true;
  }
  die(from) {
    const g = this.game; this.dead = true; this.aggro = false; this.set('dead'); this.knock(from, 6);
    { const sfx = g.audio.sfx.at(this.pos); if (this.type === 'strzyga') sfx.screech(0.2); else if (this.type === 'wailer') sfx.wail(0.25); else sfx.groan(this.def.pitch * 0.8, 0.3); }
    g.onEnemyKilled(this);
  }

  update(dt) {
    const g = this.game, pl = g.player, D = this.def, sfx = g.audio.sfx.at(this.pos);
    this.t += dt; this.time += dt; this.cd -= dt; this.look();
    const d = this._d, toP = this._a, near = Math.max(0.15, 1 - d / 30);
    let pose = null, rate = 10, moveSpeed = 0;
    switch (this.state) {
      case 'dormant':
        pose = A.huskLying(); rate = 100;
        if (d < (this.sp.wake || 5.5) && !pl.dead) { this.set('rise'); sfx.groan(D.pitch, 0.3 * near); }
        break;
      case 'rise':
        pose = A.mix(A.huskLying(), A.huskIdle(this.time, this.seed), clamp(this.t / 1.2, 0, 1)); rate = 7; this.face(toP, 3, dt);
        if (this.t > 1.35) { this.aggro = true; this.set('chase'); }
        break;
      case 'idle': {
        if ((this.wt -= dt) <= 0) { this.wt = rand(3, 8); const a = rand(TAU), r = rand(1, 4.5); this.wx = this.home.x + Math.sin(a) * r; this.wz = this.home.z + Math.cos(a) * r; }
        const wx = this.wx - this.pos.x, wz = this.wz - this.pos.z, wd = Math.hypot(wx, wz);
        if (wd > 0.6 && this.type !== 'brute') { this.face(Math.atan2(wx, wz), 2.5, dt); moveSpeed = D.walk; }
        if (!pl.dead && d < D.sight && (d < 4.5 || Math.abs(angDiff(this.yaw, toP)) < 1.35)) this.alert();
        break;
      }
      case 'chase': {
        if (pl.dead) { this.aggro = false; this.set('return'); break; }
        if (Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > 48 || d > 42) { this.aggro = false; this.set('return'); break; }
        if (this.type === 'wailer') {
          this.face(toP, 5, dt);
          if (d < D.keep - 2.5) this.step(-D.run, dt); else if (d > D.keep + 4) this.step(D.run, dt); else this.step(D.walk * this.strafe, dt, this.yaw + Math.PI / 2);
          if (this.cd <= 0 && d < D.range) { this.set('attack'); sfx.wail(0.22 * near); }
        } else if (this.type === 'strzyga') {
          this.face(toP, 7, dt);
          if (d > D.range) moveSpeed = D.run;
          else if (this.cd > 0) { this.step(D.run * 0.55 * this.strafe, dt, this.yaw + Math.PI / 2); if (d < 3.5) this.step(-D.run * 0.5, dt); this.ph += dt * 9; if (Math.random() < dt * 0.4) this.strafe *= -1; }
          else if (g.attackSlot(this)) { this.set('attack'); sfx.screech(0.16 * near); }
        } else {
          this.face(toP, this.type === 'brute' ? 3.2 : 4.5, dt);
          if (d > D.range + pl.radius) moveSpeed = D.run;
          else if (this.cd <= 0 && g.attackSlot(this)) { this.set('attack'); this.variant = this.type === 'brute' && Math.random() < 0.45 ? 'sweep' : 'over'; this.sdir = Math.random() < 0.5 ? 1 : -1; sfx.groan(D.pitch * 1.2, 0.22 * near); }
        }
        break;
      }
      case 'attack': {
        const t = this.t, w = D.wind, k = clamp((t - w) / D.act, 0, 1);
        if (this.type === 'wailer') {
          this.face(toP, 4, dt); pose = A.wailCast(t < w ? t / w : 1.5, this.time); rate = t < w ? 6 : 22;
          if (t < w && Math.random() < dt * 30) { this.model.hand.getWorldPosition(v1); g.fx.add.spawn(v1.x, v1.y, v1.z, rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5), 0.5, 0.3, 0.03, 0.5, 0.8, 1, 0.9); }
          if (!this.hitDone && t >= w) {
            this.hitDone = true; sfx.cast();
            const y = this.pos.y + 2.1, sp = 10.5;
            for (const off of [-0.22, 0.22]) { const a = toP + off; g.haz.orb(this.pos.x + Math.sin(a) * 0.7, y, this.pos.z + Math.cos(a) * 0.7, Math.sin(a) * sp, 1.5, Math.cos(a) * sp, { homing: 2.4, homeT: 1.6, dmg: D.dmg, color: 0x6ac8ff, r: 0.26, life: 4.5 }); }
          }
          if (t > w + D.rec) { this.set('chase'); this.cd = D.cd + rand(0.8); }
        } else if (this.type === 'strzyga') {
          if (t < w) { this.face(toP, 9, dt); pose = A.strzCrouch(); rate = 11; this.ldir = toP; this.ldist = Math.min(d + 1.2, 9); }
          else if (t < w + D.act) {
            pose = A.strzLeap(); rate = 24; this.step(this.ldist / D.act, dt, this.ldir); this.lift = Math.sin(k * Math.PI) * 1.2;
            if (!this.hitDone && d < D.reach && this.strike(D.reach, 7, D.dmg, { knock: 5 })) { this.hitDone = true; sfx.flesh(); }
          } else { this.lift = 0; pose = A.strzIdle(this.time); if (t > w + D.act + D.rec) { this.set('chase'); this.cd = D.cd + rand(0.9); } }
        } else {
          const sweep = this.variant === 'sweep';
          if (t < w) this.face(toP, t < w - 0.18 ? 5 : 0.5, dt);
          if (this.type === 'husk') { pose = A.huskAttack(k); if (t > w - 0.1 && t < w + D.act) this.step(3.2, dt); }
          else { pose = sweep ? A.sweep(k, this.sdir) : A.overhead(k); if (t > w - 0.1 && t < w + D.act) this.step(2.2, dt); }
          rate = t < w ? 9 : t < w + D.act + 0.05 ? 34 : 6;
          if (!this.whoosh && t >= w - 0.05) { this.whoosh = true; if (this.type === 'brute') sfx.whoosh(true); }
          if (!this.hitDone && k > 0.3 && k <= 1 && t < w + D.act) {
            if (this.strike(D.reach, sweep ? 2.9 : D.arc * (this.type === 'brute' ? 0.45 : 1), D.dmg * (sweep ? 0.85 : 1), { knock: this.type === 'brute' ? 8 : 4, heavy: this.type === 'brute' && !sweep })) { this.hitDone = true; sfx.flesh(); }
          }
          if (this.type === 'brute' && !sweep && !this.slam && t >= w + D.act) { this.slam = true; const p = this.tip(); g.fx.dust(p.x, this.pos.y, p.z, 12, 1, 0.2); g.fx.sparks(p.x, this.pos.y + 0.1, p.z, 10); sfx.thud(0.7 * near); g.shake(0.4, this.pos.x, this.pos.z); }
          if (t > w + D.act + D.rec) { this.set('chase'); this.cd = D.cd + rand(0.7); this.whoosh = false; this.slam = false; }
        }
        break;
      }
      case 'stagger': this.lift = this.type === 'wailer' ? 0.25 : 0; if (this.t > (this.type === 'brute' ? 1.3 : 0.6)) this.set('chase'); break;
      case 'return': {
        const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, hd = Math.hypot(hx, hz);
        this.face(Math.atan2(hx, hz), 4, dt); moveSpeed = D.run; this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.3 * dt);
        if (hd < 1.5) this.set('idle');
        if (!pl.dead && d < D.sight * 0.6 && Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) < 30) this.alert();
        break;
      }
      case 'dead':
        this.lift = damp(this.lift, 0, 6, dt);
        if (this.t > 2.6) { this.sinkY -= dt * 0.5; if (Math.random() < dt * 14) g.fx.smoke(this.pos.x + rand(-0.5, 0.5), this.pos.y + 0.2, this.pos.z + rand(-0.5, 0.5), 1, 0.03, 0.6); }
        if (this.t > 4.6) this.model.root.visible = false;
        break;
    }
    if (moveSpeed) { this.step(moveSpeed, dt); this.ph += moveSpeed * dt * (this.type === 'strzyga' ? 2.2 : this.type === 'brute' ? 1.6 : 3.2); }
    this.physics(dt, !this.dead);
    { // the square belongs to Aldric; the lesser dead keep out of it
      const sx = this.pos.x - SQUARE.x, sz = this.pos.z - SQUARE.z, sd = Math.hypot(sx, sz), lim = SQUARE.r + 1.2;
      if (sd < lim && sd > 0.01) { this.pos.x = SQUARE.x + sx / sd * lim; this.pos.z = SQUARE.z + sz / sd * lim; }
    }

    // pose
    if (!pose) {
      const mv = moveSpeed > 0.05;
      if (this.type === 'husk') pose = this.state === 'dead' ? A.huskDead() : this.state === 'stagger' ? A.huskStagger() : mv ? A.huskWalk(this.ph, this.seed) : A.huskIdle(this.time, this.seed);
      else if (this.type === 'strzyga') pose = this.state === 'dead' ? A.strzDead() : this.state === 'stagger' ? A.strzStagger() : (mv || this.state === 'chase') ? A.strzRun(this.ph) : A.strzIdle(this.time);
      else if (this.type === 'wailer') pose = this.state === 'dead' ? A.wailDead() : this.state === 'stagger' ? A.wailStagger() : A.wailIdle(this.time);
      else pose = this.state === 'dead' ? A.heavyDead() : this.state === 'stagger' ? A.heavyStagger() : A.heavyWalk(this.ph, mv ? 1 : 0, this.time);
      rate = this.state === 'stagger' ? 18 : this.state === 'dead' ? 6 : 10;
    }
    this.rig.pose(pose, rate, dt);
    this.sync(dt);
    if (this.sinkY) this.model.root.position.y += this.sinkY;
  }
  alert() {
    if (this.aggro && this.state === 'chase') return;
    this.aggro = true; this.set('chase'); this.cd = rand(0.2, 0.7);
    const near = Math.max(0.2, 1 - this._d / 30), s = this.game.audio.sfx;
    if (this.type === 'strzyga') s.screech(0.2 * near); else if (this.type === 'wailer') s.wail(0.2 * near); else s.groan(this.def.pitch, 0.3 * near);
  }
}
