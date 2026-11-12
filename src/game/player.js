import * as THREE from 'three';
import { makeHero } from '../chars/models.js';
import * as A from '../chars/anims.js';
import { Trail } from '../gfx/fx.js';
import { KEY } from '../core/input.js';
import { groundHeight, START } from '../world/terrain.js';
import { clamp, damp, dampAngle, angDiff, ease, TAU, rand } from '../core/util.js';

// a = hit window opens, b = closes, chain = earliest follow-up
const ATK = {
  l1: { anim: 'sweep', dir: 1, dur: 0.74, a: 0.27, b: 0.43, dmg: 1.0, st: 15, range: 3.7, arc: 2.9, poise: 32, chain: 0.47, next: 'l2', lunge: 3.6, stop: 0.055, shake: 0.22 },
  l2: { anim: 'sweep', dir: -1, dur: 0.72, a: 0.25, b: 0.41, dmg: 1.05, st: 15, range: 3.7, arc: 2.9, poise: 32, chain: 0.46, next: 'l3', lunge: 3.6, stop: 0.055, shake: 0.22 },
  l3: { anim: 'over', dur: 1.0, a: 0.4, b: 0.54, dmg: 1.6, st: 20, range: 4.2, arc: 1.15, poise: 62, chain: 0.74, next: 'l1', lunge: 4.5, stop: 0.09, shake: 0.5, slam: true, big: true },
  heavy: { anim: 'spin', dur: 1.32, a: 0.56, b: 0.88, dmg: 2.1, st: 34, range: 4.0, arc: 7, poise: 88, chain: 1.02, next: 'l1', lunge: 1.6, stop: 0.1, shake: 0.55, big: true },
};
const BASE_DMG = 31, ROLL_DUR = 0.62, FLUTE_DUR = 3.0, FLASK_DUR = 1.15, BUFF_TIME = 45;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.model = makeHero(); this.rig = this.model.rig; game.scene.add(this.model.root);
    this.trail = new Trail(game.scene);
    this.pos = new THREE.Vector3(START.x, groundHeight(START.x, START.z), START.z);
    this.vel = new THREE.Vector3(); this.yaw = Math.PI; this.radius = 0.45;
    this.lv = { vigor: 0, endurance: 0, strength: 0 };
    this.maxFlasks = 4; this.silver = 0;
    this.recalc(); this.restore();
    this.state = 'idle'; this.t = 0; this.ph = 0; this.time = 0; this.buff = 0; this.iframe = 0; this.stDelay = 0;
    this.atk = null; this.atkName = ''; this.combo = 'l1'; this.comboT = 0; this.buf = null; this.hitSet = new Set(); this.lock = null; this.winded = false; this.spinYaw = 0;
    this.dead = false; this.fluteHandle = null; this.planted = false; this.lastStep = 0;
  }
  recalc() { this.maxHp = 100 + this.lv.vigor * 15; this.maxSt = 100 + this.lv.endurance * 11; this.dmgMul = 1 + this.lv.strength * 0.09; }
  restore() { this.hp = this.maxHp; this.st = this.maxSt; this.flasks = this.maxFlasks; }
  get busy() { return this.state !== 'idle'; }

  // ---------- targeting ----------
  findTarget(skip, maxD = 26) {
    const g = this.game, fy = g.cam.yaw + Math.PI; let best = null, bs = 1e9;
    for (const e of g.targets()) {
      if (e === skip || e.untargetable) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > maxD || (skip && !e.aggro && !e.isBoss)) continue;
      const an = Math.abs(angDiff(fy, Math.atan2(dx, dz)));
      if (an > 1.25 && d > 5) continue;
      const s = d + an * 11; if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  toggleLock() { this.lock = this.lock ? null : this.findTarget(); if (this.lock) this.game.audio.sfx.tone('sine', 1300, 1300, 0.08, 0.06); }

  // ---------- actions ----------
  startAttack(name, mx, mz, moving) {
    const g = this.game, a = ATK[name];
    this.state = 'attack'; this.atk = a; this.atkName = name; this.t = 0; this.hitSet.clear(); this.whooshed = false; this.slammed = false; this.connected = false;
    this.st -= a.st; this.stDelay = 0.95; this.combo = a.next;
    if (this.lock) this.yaw = Math.atan2(this.lock.pos.x - this.pos.x, this.lock.pos.z - this.pos.z);
    else {
      if (moving) this.yaw = Math.atan2(mx, mz);
      let best = null, bd = 6.5;
      for (const e of g.targets()) { const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz) - e.radius; if (d < bd && Math.abs(angDiff(this.yaw, Math.atan2(dx, dz))) < 1.0) { bd = d; best = e; } }
      if (best) this.yaw = Math.atan2(best.pos.x - this.pos.x, best.pos.z - this.pos.z);
    }
  }
  startRoll(mx, mz, moving) {
    this.state = 'roll'; this.t = 0; this.st -= 19; this.stDelay = 0.75; this.atk = null;
    this.backstep = !moving;
    if (moving) { const l = Math.hypot(mx, mz); this.rx = mx / l; this.rz = mz / l; this.yaw = Math.atan2(mx, mz); }
    else { this.rx = -Math.sin(this.yaw); this.rz = -Math.cos(this.yaw); }
    this.iframe = this.backstep ? 0.28 : 0.44;
    this.game.audio.sfx.roll();
  }
  tryAction(mx, mz, moving) {
    const b = this.buf, g = this.game; if (!b) return false;
    if (b.a === 'roll') { if (this.st <= 0) return false; this.buf = null; this.startRoll(mx, mz, moving); return true; }
    if (b.a === 'light' || b.a === 'heavy') { if (this.st <= 0) return false; this.buf = null; this.startAttack(b.a === 'heavy' ? 'heavy' : this.combo, mx, mz, moving); return true; }
    this.buf = null;
    if (b.a === 'flask') {
      if (this.flasks <= 0) { g.audio.sfx.deny(); g.ui.toast('The flask is empty.'); return false; }
      this.state = 'flask'; this.t = 0; this.drank = false; this.atk = null; return true;
    }
    if (b.a === 'flute') {
      this.state = 'flute'; this.t = 0; this.atk = null; this.vel.set(0, 0, 0); this.noteT = 0;
      this.fluteHandle = g.audio.sfx.fluteSong(); this.plant(true); return true;
    }
    return false;
  }
  plant(on) {
    const m = this.model; if (this.planted === on) return; this.planted = on;
    if (on) { m.root.add(m.sword); m.sword.position.set(-0.72, 2.75, 0.25); m.sword.rotation.set(Math.PI / 2 - 0.08, 0, 0.06); m.flute.visible = true; }
    else { m.h.j.rHa.add(m.sword); m.sword.position.set(0, -0.07, 0); m.sword.rotation.set(0, 0, 0); m.flute.visible = false; }
  }

  takeDamage(amount, from, o = {}) {
    const g = this.game;
    if (this.dead || this.iframe > 0 || g.god) return false;
    if (this.state === 'flute') { amount *= 1.6; if (this.fluteHandle) this.fluteHandle.stop(); this.fluteHandle = null; g.ui.toast('The song breaks.'); }
    this.plant(false);
    this.hp -= amount; this.atk = null; this.buf = null;
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, l = Math.hypot(dx, dz) || 1, k = o.knock || 4;
    this.vel.set(dx / l * k, 0, dz / l * k);
    if (amount > 0) { g.audio.sfx.hurt(); g.fx.blood(this.pos.x, this.pos.y + 1.2, this.pos.z, dx / l, dz / l, 10, false); }
    g.onPlayerHurt(amount);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.state = 'dead'; this.t = 0; this.lock = null; g.audio.sfx.die(); g.onPlayerDeath(); return true; }
    this.state = 'hit'; this.t = 0; this.down = !!o.heavy; this.hitDur = this.down ? 1.15 : 0.42;
    this.iframe = this.down ? 1.45 : 0.3;
    return true;
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  // ---------- frame ----------
  update(dt) {
    const g = this.game, inp = g.input, sfx = g.audio.sfx, on = g.inputEnabled && !this.dead;
    this.t += dt; this.time += dt; this.iframe = Math.max(0, this.iframe - dt); this.buff = Math.max(0, this.buff - dt);
    const ax = on ? inp.axis() : { x: 0, y: 0 };
    const cy = g.cam.yaw, fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
    let mx = fx * ax.y + rx * ax.x, mz = fz * ax.y + rz * ax.x; const ml = Math.hypot(mx, mz), moving = ml > 0.15;
    if (ml > 1) { mx /= ml; mz /= ml; }
    if (on) {
      if (inp.hit(KEY.light)) this.buf = { a: 'light', t: 0.42 }; else if (inp.hit(KEY.heavy)) this.buf = { a: 'heavy', t: 0.42 };
      else if (inp.hit(KEY.roll)) this.buf = { a: 'roll', t: 0.36 }; else if (inp.hit(KEY.flask)) this.buf = { a: 'flask', t: 0.3 }; else if (inp.hit(KEY.flute)) this.buf = { a: 'flute', t: 0.3 };
      if (inp.hit(KEY.lock)) this.toggleLock();
    }
    if (this.buf && (this.buf.t -= dt) <= 0) this.buf = null;
    if (this.lock && (this.lock.dead || Math.hypot(this.lock.pos.x - this.pos.x, this.lock.pos.z - this.pos.z) > 34)) this.lock = this.lock.dead ? this.findTarget(this.lock, 13) : null;
    const lockYaw = this.lock ? Math.atan2(this.lock.pos.x - this.pos.x, this.lock.pos.z - this.pos.z) : 0;
    if (this.st <= 0) this.winded = true; else if (this.st > 22) this.winded = false;
    let regen = true;

    switch (this.state) {
      case 'idle': {
        const sprint = moving && on && inp.down(KEY.sprint) && !this.winded;
        const sp = sprint ? 7.1 : this.lock ? 4.1 : 4.7;
        this.vel.x = damp(this.vel.x, moving ? mx * sp : 0, moving ? 13 : 16, dt); this.vel.z = damp(this.vel.z, moving ? mz * sp : 0, moving ? 13 : 16, dt);
        if (sprint) { this.st -= 11 * dt; this.stDelay = 0.45; }
        if (this.lock && !sprint) this.yaw = dampAngle(this.yaw, lockYaw, 12, dt); else if (moving) this.yaw = dampAngle(this.yaw, Math.atan2(mx, mz), 13, dt);
        if ((this.comboT += dt) > 0.55) this.combo = 'l1';
        if (this.tryAction(mx, mz, moving)) this.comboT = 0;
        break;
      }
      case 'attack': {
        const a = this.atk, t = this.t; regen = false; this.comboT = 0;
        if (t < a.a && this.lock) this.yaw = dampAngle(this.yaw, lockYaw, 9, dt);
        const lf = t > a.a - 0.14 && t < a.b ? a.lunge : 0;
        this.vel.x = damp(this.vel.x, Math.sin(this.yaw) * lf, 18, dt); this.vel.z = damp(this.vel.z, Math.cos(this.yaw) * lf, 18, dt);
        if (!this.whooshed && t >= a.a - 0.06) { this.whooshed = true; sfx.whoosh(a.big); }
        if (t >= a.a && t <= a.b) this.hitTest(a);
        if (a.slam && !this.slammed && t >= a.b) {
          this.slammed = true; this.model.sTip.getWorldPosition(v1);
          g.fx.dust(v1.x, groundHeight(v1.x, v1.z), v1.z, 9, 0.8, 0.2); g.fx.sparks(v1.x, groundHeight(v1.x, v1.z) + 0.1, v1.z, 8);
          if (!this.connected) { sfx.thud(0.5); g.shake(0.25); }
        }
        if (t >= a.chain && this.buf && this.tryAction(mx, mz, moving)) break;
        if (t >= a.dur) { this.state = 'idle'; this.atk = null; }
        break;
      }
      case 'roll': {
        const d = this.backstep ? 0.4 : ROLL_DUR, k = this.t / d, sp = (this.backstep ? 7.5 : 11) * (1 - k * k * 0.85);
        this.vel.x = this.rx * sp; this.vel.z = this.rz * sp; regen = false;
        if (this.t >= d * 0.8 && this.buf && this.buf.a !== 'roll' && this.tryAction(mx, mz, moving)) { this.model.h.spin.rotation.x = 0; break; }
        if (this.t >= d) { this.state = 'idle'; this.model.h.spin.rotation.x = 0; }
        break;
      }
      case 'hit':
        this.vel.x = damp(this.vel.x, 0, 5, dt); this.vel.z = damp(this.vel.z, 0, 5, dt);
        if (this.t >= this.hitDur) this.state = 'idle';
        break;
      case 'flask': {
        const sp = 1.7;
        this.vel.x = damp(this.vel.x, moving ? mx * sp : 0, 10, dt); this.vel.z = damp(this.vel.z, moving ? mz * sp : 0, 10, dt);
        if (!this.drank && this.t >= 0.6) { this.drank = true; this.flasks--; this.heal(42 + this.lv.vigor * 5); sfx.drink(); g.fx.burst(this.pos.x, this.pos.y + 1.3, this.pos.z, 1, 0.6, 0.2, 14, 2.2, 0.2, 0.9); }
        if (this.t >= FLASK_DUR) this.state = 'idle';
        break;
      }
      case 'flute':
        this.vel.set(0, 0, 0);
        if ((this.noteT -= dt) <= 0) { this.noteT = 0.09; g.fx.note(this.pos.x, this.pos.y + 1.7, this.pos.z); }
        if (this.t >= FLUTE_DUR) {
          this.state = 'idle'; this.fluteHandle = null; this.plant(false);
          this.buff = BUFF_TIME; sfx.buff(); g.fx.burst(this.pos.x, this.pos.y + 1.2, this.pos.z, 1, 0.8, 0.4, 40, 5, 0.3, 1.1);
          g.onFlute();
        }
        break;
      case 'rest': this.vel.set(0, 0, 0); break;
      case 'dead': this.vel.x = damp(this.vel.x, 0, 4, dt); this.vel.z = damp(this.vel.z, 0, 4, dt); regen = false; break;
    }

    if ((this.stDelay -= dt) <= 0 && regen) this.st = Math.min(this.maxSt, this.st + (this.buff > 0 ? 62 : 42) * dt);
    this.st = Math.max(-25, this.st);
    if (this.game.god) { this.st = this.maxSt; this.winded = false; }
    if (this.buff > 0 && !this.dead) this.hp = Math.min(this.maxHp, this.hp + 1.2 * dt);

    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    g.world.resolve(this.pos, this.radius); g.clampArena(this.pos, this.radius);
    this.pos.y = damp(this.pos.y, groundHeight(this.pos.x, this.pos.z), 22, dt);
    this.animate(dt);
  }

  hitTest(a) {
    const g = this.game;
    for (const e of g.targets()) {
      if (this.hitSet.has(e) || e.invuln) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz) - e.radius;
      if (d > a.range) continue;
      if (a.arc < 6 && d > 0.4 && Math.abs(angDiff(this.yaw, Math.atan2(dx, dz))) > a.arc / 2) continue;
      this.hitSet.add(e);
      const dmg = BASE_DMG * a.dmg * this.dmgMul * (this.buff > 0 ? 1.35 : 1) * rand(0.94, 1.06);
      if (e.takeDamage(dmg, a.poise, this.pos, a) === false) continue;
      const l = Math.hypot(dx, dz) || 1;
      g.fx.blood(e.pos.x - dx / l * e.radius * 0.5, e.pos.y + Math.min(2.2, e.height * 0.55), e.pos.z - dz / l * e.radius * 0.5, dx / l, dz / l, a.big ? 22 : 13, true);
      if (this.buff > 0) g.fx.sparks(e.pos.x, e.pos.y + 1.3, e.pos.z, 6, 1, 0.85, 0.4);
      g.audio.sfx.hit(a.big);
      if (!this.connected) { this.connected = true; g.hitstop(a.stop); g.shake(a.shake); }
    }
  }

  animate(dt) {
    const m = this.model, g = this.game, spd = Math.hypot(this.vel.x, this.vel.z);
    let pose, rate = 12; this.spinYaw = 0;
    switch (this.state) {
      case 'attack': {
        const a = this.atk, t = this.t, k = clamp((t - a.a) / (a.b - a.a), 0, 1);
        if (a.anim === 'over') pose = A.overhead(k); else pose = A.sweep(a.anim === 'spin' ? Math.min(1, k * 1.15) : k, a.dir || 1);
        if (a.anim === 'spin') this.spinYaw = ease(k) * TAU;
        rate = t < a.a ? 13 : t < a.b + 0.06 ? 36 : 7;
        if (t > Math.max(a.chain, a.b + 0.1)) pose = A.mix(pose, A.heroMove(this.time, 0, this.ph, true), clamp((t - a.chain) / (a.dur - a.chain), 0, 1));
        break;
      }
      case 'roll':
        if (this.backstep) { pose = A.heroMove(this.time, 0.6, this.ph, true); pose.y = -0.2 + Math.sin((this.t / 0.4) * Math.PI) * 0.18; pose.chest[0] = 0.4; rate = 18; }
        else { pose = A.heroRoll(); rate = 24; }
        break;
      case 'hit': pose = this.down ? (this.t > this.hitDur - 0.3 ? A.heroKneel() : A.heroDown()) : A.heroHit(this.t / this.hitDur); rate = this.down ? 11 : 20; break;
      case 'flask': pose = A.heroFlask(clamp(this.t / 0.5, 0, 1) * (this.t > 0.9 ? clamp((FLASK_DUR - this.t) / 0.25, 0, 1) : 1)); this.walkPhase(spd, dt); break;
      case 'flute': pose = A.heroFlute(this.time); rate = 9; break;
      case 'rest': pose = A.heroKneel(); rate = 6; break;
      case 'dead': pose = A.heroDead(); rate = 5; break;
      default:
        this.walkPhase(spd, dt);
        pose = A.heroMove(this.time, clamp(spd / 6.4, 0, 1.1), this.ph, !!this.lock || g.combatLevel > 0.4);
    }
    this.rig.pose(pose, rate, dt);
    if (this.state === 'roll' && !this.backstep) m.h.spin.rotation.x = ease(this.t / ROLL_DUR) * TAU;
    m.root.position.copy(this.pos); m.root.rotation.y = this.yaw + this.spinYaw;
    const lift = clamp(spd * 0.085, 0, 0.75) + (this.state === 'roll' ? 0.4 : 0) + (this.state === 'attack' ? 0.3 : 0);
    m.cape.forEach((c, i) => { c.rotation.x = damp(c.rotation.x, 0.1 + lift * (0.45 + i * 0.16) + Math.sin(this.time * 3.1 + i * 0.9) * 0.05 * (1 + spd * 0.25), 7, dt); });
    // blade trail
    const a = this.atk;
    if (this.state === 'attack' && this.t > a.a - 0.07 && this.t < a.b + 0.05) { m.root.updateMatrixWorld(true); m.sBase.getWorldPosition(v1); m.sTip.getWorldPosition(v2); this.trail.push(v1, v2); }
    if (this.buff > 0) this.trail.color.setRGB(1, 0.78, 0.35); else this.trail.color.setRGB(0.72, 0.8, 1);
    this.trail.update(dt);
    const b = this.buff > 0 ? Math.min(1, this.buff / 2) : 0;
    m.aura.intensity = b * (5 + Math.sin(this.time * 5) * 1.2);
    m.bladeM.emissive.setRGB(b * 0.55, b * 0.38, b * 0.12);
  }
  walkPhase(spd, dt) {
    const prev = Math.sin(this.ph); this.ph += spd * dt * 2.25;
    if (spd > 1 && prev * Math.sin(this.ph) < 0) this.game.audio.sfx.step(false);
  }

  respawn(x, z, yaw) {
    this.pos.set(x, groundHeight(x, z), z); this.vel.set(0, 0, 0); this.yaw = yaw; this.dead = false; this.state = 'idle'; this.t = 0; this.atk = null; this.buf = null; this.lock = null; this.buff = 0; this.iframe = 1;
    this.plant(false); this.model.h.spin.rotation.set(0, 0, 0); this.restore();
  }
}
export { ATK, FLUTE_DUR };
