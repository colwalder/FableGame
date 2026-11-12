import * as THREE from 'three';
import { Actor } from './enemies.js';
import { makeTemplar, makePriest } from '../chars/models.js';
import * as A from '../chars/anims.js';
import { groundHeight, SQUARE, CHURCH } from '../world/terrain.js';
import { clamp, damp, lerp, angDiff, rand, TAU, ease, pick } from '../core/util.js';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
const PI = Math.PI;

class Boss extends Actor {
  constructor(game, model, x, z) { super(game, model, x, z); this.isBoss = true; this.active = false; this.phase = 1; this.cd = 0; this.tempo = 1; this.seq = null; }
  takeDamage(dmg, poise, from, a) {
    if (this.dead || this.invuln) return false;
    if (!this.active) this.game.startBoss(this);
    if (this.vuln) dmg *= 1.3;
    this.hp -= dmg; this.flash = 0.1; this.poise -= poise;
    if (this.hp <= 0) { this.hp = 0; this.die(); return true; }
    this.onDamaged();
    if (this.poise <= 0 && this.canStagger()) { this.poise = this.maxPoise; this.seq = null; this.set('stagger'); this.game.audio.sfx.clang(); this.game.ui.toast('Staggered!'); this.glint(0); }
    return true;
  }
  onDamaged() {}
  canStagger() { return true; }
  glint(v) { this.model.weaponGlow.emissiveIntensity = v; }
  /** Start a string of melee swings. */
  melee(steps, rec) { this.seq = { steps, i: 0, ts: 0, rec }; this.set('melee'); this.swung = false; }
  /** Returns a pose; drives timing, hit checks, effects. */
  runMelee(dt) {
    const q = this.seq, s = q.steps[q.i], g = this.game, sfx = g.audio.sfx;
    q.ts += dt * this.tempo; const t = q.ts, k = clamp((t - s.wind) / s.act, 0, 1);
    if (t < s.wind) { this.face(this._a, t < s.wind - 0.2 ? (s.track || 3.2) : 0.4, dt); this.glint(Math.pow(t / s.wind, 3) * 5); }
    else {
      this.glint(0);
      if (!this.swung) { this.swung = true; sfx.whoosh(true); }
      if (t < s.wind + s.act) {
        this.step(s.lunge || 3, dt);
        if (!this.hitDone && k > 0.25 && this.strike(s.range, s.arc, s.dmg, { knock: s.knock || 6, heavy: s.heavy })) { this.hitDone = true; sfx.flesh(); g.shake(0.4); }
      } else if (!q.landed) {
        q.landed = true;
        if (s.kind === 'over') { const p = this.tip(); const gy = groundHeight(p.x, p.z); g.fx.dust(p.x, gy, p.z, 18, 1.5, 0.22); g.fx.sparks(p.x, gy + 0.2, p.z, 16); sfx.thud(1); g.shake(0.7, this.pos.x, this.pos.z); if (s.wave) g.haz.wave(p.x, p.z, s.wave.speed, s.wave.maxR, s.wave.dmg); }
      }
    }
    let pose = s.kind === 'over' ? A.overhead(k) : A.sweep(k, s.dir || 1);
    if (s.shield) { pose.lSh = [-0.9, 0, 0.15]; pose.lEl = [-1.2, 0, 0]; }
    this.poseRate = t < s.wind ? (s.windRate || 7) : t < s.wind + s.act + 0.05 ? 34 : 6;
    if (t >= s.wind + s.act + (s.hold || 0.14)) {
      q.i++; q.ts = 0; q.landed = false; this.hitDone = false; this.swung = false;
      if (q.i >= q.steps.length) { this.seq = null; this.recT = q.rec; this.set('recover'); }
    }
    return pose;
  }
  clampTo(b) { this.pos.x = clamp(this.pos.x, b.minX + this.radius * 0.5, b.maxX - this.radius * 0.5); this.pos.z = clamp(this.pos.z, b.minZ + this.radius * 0.5, b.maxZ - this.radius * 0.5); }
}

// ===========================================================================
//  ALDRIC, THE ROOTED TEMPLAR — the lock on the church door
// ===========================================================================
export class Templar extends Boss {
  constructor(game) {
    super(game, makeTemplar(), SQUARE.x, SQUARE.z - 2);
    this.name = 'Aldric, the Rooted Templar'; this.maxHp = 980; this.radius = 1.25; this.maxPoise = 135; this.silver = 900;
    this.reset();
  }
  reset() {
    this.pos.set(SQUARE.x, groundHeight(SQUARE.x, SQUARE.z - 2), SQUARE.z - 2); this.yaw = 0; this.hp = this.maxHp; this.poise = this.maxPoise;
    this.dead = false; this.active = false; this.phase = 1; this.tempo = 1; this.cd = 0; this.seq = null; this.kx = this.kz = 0; this.invuln = false; this.rootsLeft = 0;
    this.set('kneel'); this.model.root.visible = true; this.rig.pose(A.templarKneel(0), 100, 0); this.glint(0); this.beatT = 0; this.sync(0);
  }
  wake() { this.active = true; this.set('intro'); }
  onDamaged() {
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; this.tempo = 1.14; this.seq = null; this.set('enrage'); this.invuln = true; this.glint(0); }
  }
  canStagger() { return this.state !== 'enrage' && this.state !== 'intro'; }
  die() {
    this.dead = true; this.set('dead'); this.seq = null; this.glint(0);
    this.game.audio.sfx.bossDie(); this.game.onTemplarDead(this);
  }
  choose() {
    const d = this._d, r = Math.random(), p2 = this.phase === 2;
    const SW = (dir, wind) => ({ kind: 'sweep', dir, wind, act: 0.26, range: 6.4, arc: 3.0, dmg: 27, knock: 7, lunge: 3.5, shield: true });
    const OV = (wind, wave) => ({ kind: 'over', wind, act: 0.2, range: 7.0, arc: 0.85, dmg: 37, heavy: true, knock: 8, lunge: 4, shield: true, hold: 0.3, wave: wave ? { speed: 11, maxR: 12, dmg: 18 } : null });
    if (d > 9.5) { if (r < 0.55) return this.set('charge'); if (p2 && r < 0.9) return this.startRoots(); return false; }
    if (d < 6.6) {
      if (r < 0.3) return this.melee([SW(Math.random() < 0.5 ? 1 : -1, 0.8)], 0.9);
      if (r < 0.56) return this.melee([OV(1.0, true)], 1.15);
      if (p2 && r < 0.72) return this.startRoots();
      return this.melee(p2 ? [SW(1, 0.7), SW(-1, 0.5), OV(0.62, true)] : [SW(1, 0.75), SW(-1, 0.55)], 1.2);
    }
    return false;
  }
  startRoots() { this.set('roots'); this.rootsLeft = 4; this.rootT = 0; }

  update(dt) {
    const g = this.game, pl = g.player, sfx = g.audio.sfx, m = this.model;
    this.t += dt; this.time += dt; this.cd -= dt; this.look();
    let pose, rate = 9; this.poseRate = 0;
    // the heartbeat that holds the seal
    const beat = g.world.pulse;
    m.heart.emissiveIntensity = this.dead ? Math.max(0, 2 - this.t * 1.5) : 1.2 + beat * (this.phase === 2 ? 6 : 3.5);
    m.light.intensity = this.dead ? 0 : (2 + beat * 8) * (this.phase === 2 ? 1.8 : 1);
    m.eye.emissiveIntensity = this.dead ? 0 : this.active ? 3.5 : 0.6;
    if (!this.active && !this.dead && this._d < 30) { if ((this.beatT -= dt) <= 0) { this.beatT = 1 / 1.15; sfx.heartbeat(0.3 * clamp(1 - this._d / 30, 0, 1)); } }

    switch (this.state) {
      case 'kneel': pose = A.templarKneel(this.time); rate = 4; break;
      case 'intro':
        if (this.t < 1.3) { pose = A.mix(A.templarKneel(this.time), A.heavyWalk(0, 0, this.time), ease(this.t / 1.3)); rate = 5; }
        else { pose = A.roarPose(this.time); rate = 8; if (!this.hitDone) { this.hitDone = true; sfx.roar(0.7, 0.8); g.shake(0.6); g.ui.say('“...another one. It sends... another one.”', 4); } }
        this.face(this._a, 2, dt);
        if (this.t > 3.1) this.set('walk');
        break;
      case 'enrage':
        pose = A.roarPose(this.time); rate = 8;
        if (!this.hitDone && this.t > 0.3) { this.hitDone = true; sfx.roar(0.8, 0.7); g.shake(0.9); g.haz.wave(this.pos.x, this.pos.z, 13, 10, 0, { knock: 11 }); g.fx.burst(this.pos.x, this.pos.y + 3, this.pos.z, 1, 0.2, 0.05, 50, 9, 0.5, 1); g.ui.say('“I... am... a LOCK.”', 3.5); }
        if (this.t > 1.9) { this.invuln = false; this.set('walk'); this.cd = 0.2; }
        break;
      case 'walk': {
        this.face(this._a, 3.4, dt);
        const sp = this._d > 4.6 ? (this.phase === 2 ? 3.7 : 3.0) : 0;
        if (sp) { this.step(sp, dt); this.ph += sp * dt * 1.15; if (Math.sin(this.ph) * Math.sin(this.ph - sp * dt * 1.15) < 0) { sfx.step(true); sfx.thud(0.18); g.shake(0.08, this.pos.x, this.pos.z); } }
        pose = A.heavyWalk(this.ph, sp ? 1 : 0, this.time); pose.lSh = [-0.9, 0, 0.15]; pose.lEl = [-1.2, 0, 0];
        if (pl.dead) break;
        if (this.cd <= 0 && Math.abs(angDiff(this.yaw, this._a)) < 0.6) this.choose();
        break;
      }
      case 'melee': pose = this.runMelee(dt); rate = this.poseRate; break;
      case 'recover': pose = A.heavyWalk(this.ph, 0, this.time); rate = 5; this.face(this._a, 1.2, dt); if (this.t > this.recT / this.tempo) { this.set('walk'); this.cd = rand(0.15, 0.6); } break;
      case 'charge': {
        const w = 0.85 / this.tempo;
        if (this.t < w) { this.face(this._a, 5, dt); pose = A.templarCharge(0, 0); rate = 8; this.cdir = this.yaw; this.glint(Math.pow(this.t / w, 3) * 4); if (!this.hitDone && this.t > 0.1) { this.hitDone = true; sfx.groan(0.5, 0.4); } if (this.t + dt >= w) this.hitDone = false; }
        else if (this.t < w + 1.0) {
          this.glint(0); this.cdir += clamp(angDiff(this.cdir, this._a), -0.7 * dt, 0.7 * dt); this.yaw = this.cdir;
          this.step(15.5, dt); this.ph += dt * 16; pose = A.templarCharge(1, this.ph); rate = 16;
          if (Math.random() < dt * 40) g.fx.dust(this.pos.x, this.pos.y, this.pos.z, 2, 0.8, 0.22);
          if (Math.sin(this.ph) * Math.sin(this.ph - dt * 16) < 0) { sfx.thud(0.35); g.shake(0.2, this.pos.x, this.pos.z); }
          if (!this.hitDone && this.strike(2.7, 2.4, 30, { heavy: true, knock: 12 })) { this.hitDone = true; sfx.clang(); g.shake(0.8); this.t = w + 1.0; }
          const cd = Math.hypot(this.pos.x - SQUARE.x, this.pos.z - SQUARE.z);
          if (cd > SQUARE.r - 3 && this.t > w + 0.25) { this.t = w + 1.0; if (!this.hitDone) { sfx.thud(0.9); g.shake(0.5); g.fx.dust(this.pos.x, this.pos.y, this.pos.z, 16, 1.5, 0.25); } }
        } else { pose = A.heavyStagger(); rate = 7; if (this.t > w + 1.0 + (this.hitDone ? 0.7 : 1.5)) { this.set('walk'); this.cd = 0.3; } }
        break;
      }
      case 'roots': {
        const k = clamp(this.t / 0.9, 0, 1);
        pose = A.templarPlunge(this.t < 0.9 ? 0 : 1); rate = this.t < 0.9 ? 6 : 24; this.glint(this.t < 0.9 ? k * k * 5 : 0);
        if (this.t >= 0.9) {
          if (!this.hitDone) { this.hitDone = true; sfx.thud(1); g.shake(0.6); const p = this.tip(); g.fx.dust(p.x, this.pos.y, p.z, 16, 1.2, 0.2); this.rootT = 0.1; }
          if (this.rootsLeft > 0 && (this.rootT -= dt) <= 0) {
            this.rootT = 0.55; this.rootsLeft--;
            const lead = this.rootsLeft % 2 === 0 ? 0 : 0.35;
            g.haz.telegraph(pl.pos.x + pl.vel.x * lead, pl.pos.z + pl.vel.z * lead, 2.7, 0.85, 23, { kind: 'roots' });
            if (this.rootsLeft === 0) for (let i = 0; i < 5; i++) { const a = rand(TAU), r = rand(4, 15); g.haz.telegraph(SQUARE.x + Math.sin(a) * r, SQUARE.z + Math.cos(a) * r, 2.4, 1.1 + i * 0.1, 23, { kind: 'roots' }); }
          }
          if (this.rootsLeft === 0 && this.rootT < -0.5) { this.recT = 0.6; this.set('recover'); }
        }
        break;
      }
      case 'stagger': pose = A.heavyStagger(); rate = 10; if (this.t > 2.4) { this.set('walk'); this.cd = 0.4; } break;
      case 'dead':
        pose = this.t < 1.6 ? A.heavyStagger() : A.heavyDead(); rate = this.t < 1.6 ? 5 : 3.5;
        if (this.t < 3 && Math.random() < dt * 30) g.fx.curseMote(this.pos.x + rand(-1.5, 1.5), this.pos.y + rand(0.5, 3.5), this.pos.z + rand(-1.5, 1.5));
        break;
    }
    if (this.state !== 'kneel') { this.physics(dt, false); const cd = Math.hypot(this.pos.x - SQUARE.x, this.pos.z - SQUARE.z), max = SQUARE.r - 1.9; if (cd > max) { this.pos.x = SQUARE.x + (this.pos.x - SQUARE.x) / cd * max; this.pos.z = SQUARE.z + (this.pos.z - SQUARE.z) / cd * max; } }
    this.rig.pose(pose, rate, dt);
    const sp = this.state === 'charge' ? 1 : 0.2;
    m.cape.forEach((c, i) => { c.rotation.x = damp(c.rotation.x, 0.1 + sp * (0.4 + i * 0.15) + Math.sin(this.time * 2.2 + i) * 0.06, 6, dt); });
    this.sync(dt);
  }
}

// ===========================================================================
//  FATHER RADOMIR, VESSEL OF THE BIES
// ===========================================================================
const HOME = { x: CHURCH.x, z: -138.5 };
export class Priest extends Boss {
  constructor(game) {
    super(game, makePriest(), HOME.x, HOME.z);
    this.name = 'Father Radomir, Vessel of the Bies'; this.maxHp = 1400; this.radius = 1.35; this.maxPoise = 150; this.silver = 3000;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 1, 8, 1, true).rotateX(PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xff5a28, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.beam.visible = false; this.beam.frustumCulled = false; game.scene.add(this.beam);
    this.reset();
  }
  reset() {
    this.pos.set(HOME.x, groundHeight(HOME.x, HOME.z), HOME.z); this.yaw = PI; this.hp = this.maxHp; this.poise = this.maxPoise;
    this.dead = false; this.active = false; this.phase = 1; this.tempo = 1; this.cd = 0; this.seq = null; this.kx = this.kz = 0; this.invuln = false; this.untargetable = false; this.vuln = false;
    this.lift = 0; this.songCd = 0; this.wing = 0; this.strafe = 1; this.last = '';
    this.set('pray'); this.model.root.visible = true; this.rig.pose(A.priestPray(0), 100, 0); this.glint(0); this.beam.visible = false;
    for (const w of this.model.wings) w.scale.setScalar(0.001);
    this.sync(0);
  }
  wake() { this.active = true; this.set('intro'); this.said = 0; }
  onDamaged() { if (this.phase === 1 && this.hp < this.maxHp * 0.55) this.startTransition(); }
  canStagger() { return !['transition', 'intro', 'tele', 'dive', 'song'].includes(this.state); }
  startTransition() { this.phase = 2; this.tempo = 1.12; this.seq = null; this.beam.visible = false; this.lift = 0; this.set('transition'); this.invuln = true; this.glint(0); this.game.haz.clear(); }
  die() {
    this.dead = true; this.seq = null; this.beam.visible = false; this.glint(0); this.set('dying'); this.untargetable = false;
    this.game.haz.clear(); this.game.audio.sfx.bossDie(); this.game.onPriestDying(this);
  }
  /** The old song. It cannot abide the old song. */
  hearSong() {
    if (!this.active || this.dead || this.songCd > 0 || ['transition', 'intro', 'tele', 'dive'].includes(this.state)) return false;
    this.songCd = 28; this.seq = null; this.beam.visible = false; this.lift = 0; this.glint(0); this.set('song'); this.vuln = true;
    this.game.audio.sfx.roar(0.6, 1.5); this.game.ui.say('“THAT SONG — WHO TAUGHT YOU THAT —”', 3.2, true); this.game.shake(0.6);
    return true;
  }
  spot(minD, maxD) {
    const p = this.game.player.pos; let bx = HOME.x, bz = HOME.z;
    for (let i = 0; i < 14; i++) { const a = rand(TAU), r = rand(minD, maxD), x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r; if (x > CHURCH.minX + 1.5 && x < CHURCH.maxX - 1.5 && z > CHURCH.minZ + 1.5 && z < CHURCH.maxZ - 2) { bx = x; bz = z; break; } }
    return [bx, bz];
  }
  choose() {
    const d = this._d, p2 = this.phase === 2, opts = [];
    const SW = (dir, wind) => ({ kind: 'sweep', dir, wind, act: 0.25, range: 7.4, arc: 3.0, dmg: 25, knock: 7, lunge: 4, windRate: 6 });
    const OV = (wind) => ({ kind: 'over', wind, act: 0.2, range: 8, arc: 0.8, dmg: 34, heavy: true, lunge: 4.5, hold: 0.3, wave: { speed: 12, maxR: 13, dmg: 18 } });
    if (d < 8) { opts.push('swing', 'swing', 'lunge', 'pillars', 'tele'); if (p2) opts.push('nova', 'dive', 'beam'); }
    else { opts.push('volley', 'volley', 'pillars', 'lunge'); if (p2) opts.push('beam', 'beam', 'nova', 'dive'); }
    let c = pick(opts); if (c === this.last) c = pick(opts); this.last = c;
    if (c === 'swing') return this.melee(p2 ? [SW(1, 0.7), SW(-1, 0.5), OV(0.6)] : [SW(1, 0.78), SW(-1, 0.55)], 1.0);
    this.set(c); this.fired = 0; this.sub = 0;
  }
  fireOrb(n, of, speed, homing, hand) {
    const g = this.game, m = this.model, p = g.player.pos;
    (hand || (n % 2 ? m.handL : m.handR)).getWorldPosition(v1);
    const a = this._a + (of || 0), ty = p.y + 1.2, dist = Math.max(4, this._d);
    g.haz.orb(v1.x, v1.y, v1.z, Math.sin(a) * speed, (ty - v1.y) / (dist / speed), Math.cos(a) * speed, { homing, homeT: 1.3, dmg: 16, color: 0xff3a18, r: 0.32, life: 4.5, bounds: CHURCH });
    g.audio.sfx.orb();
  }

  update(dt) {
    const g = this.game, pl = g.player, sfx = g.audio.sfx, m = this.model;
    this.t += dt; this.time += dt; this.cd -= dt; this.songCd -= dt; this.look();
    let pose, rate = 8; this.poseRate = 0; const p2 = this.phase === 2;
    const beat = g.world.pulse, live = this.active && !this.dead;
    m.eye.emissiveIntensity = this.dead ? Math.max(0, 3 - this.t) : live ? 4.5 + beat * 2 : 1;
    m.inner.emissiveIntensity = this.dead ? Math.max(0, 2 - this.t) : (p2 ? 3.5 : 1.6) + beat * 2.5;
    m.halo.emissiveIntensity = this.dead ? 0 : p2 ? 4 + beat * 3 : live ? 1.8 : 0.5;
    m.haloRing.rotation.z = this.time * (p2 ? 1.4 : 0.3);
    m.light.intensity = this.dead ? 0 : live ? (p2 ? 26 : 12) + beat * 8 : 3;
    m.chain.rotation.x = Math.sin(this.time * 2.3) * 0.25; m.chain.rotation.z = Math.cos(this.time * 1.9) * 0.2;
    this.wing = damp(this.wing, p2 && !this.dead ? 1 : 0, 2.5, dt);
    m.wings.forEach((w, i) => { w.scale.setScalar(Math.max(0.001, this.wing)); w.rotation.y = (i ? -1 : 1) * (0.5 + Math.sin(this.time * 2.4) * 0.22 * this.wing); });
    if (live && Math.random() < dt * 9) { m.censerPos.getWorldPosition(v1); g.fx.smoke(v1.x, v1.y, v1.z, 1, 0.05, 0.35); g.fx.flame(v1.x, v1.y, v1.z, 0.6); }

    switch (this.state) {
      case 'pray': pose = A.priestPray(this.time); rate = 4; break;
      case 'intro':
        this.face(this._a, 1.6, dt); pose = this.t < 1.5 ? A.priestPray(this.time) : A.priestIdle(this.time); rate = 2.5;
        if (this.said === 0 && this.t > 0.6) { this.said = 1; g.ui.say('“You came. I wrote for the strongest sword that silver could buy.”', 4.2, true); sfx.whisper(); }
        if (this.said === 1 && this.t > 5) { this.said = 2; g.ui.say('“This house is old. The roof leaks. Come closer — let me see what I have purchased.”', 4.6, true); sfx.roar(0.5, 1.2); g.shake(0.4); }
        if (this.t > 7.2) { this.set('float'); this.cd = 0.5; }
        break;
      case 'float': {
        this.face(this._a, 4.5, dt);
        const sp = p2 ? 4.6 : 3.3;
        if (this._d > 8.5) this.step(sp, dt); else if (this._d < 4) this.step(-sp * 0.6, dt);
        this.step(sp * 0.4 * this.strafe, dt, this.yaw + PI / 2); if (Math.random() < dt * 0.35) this.strafe *= -1;
        pose = A.priestIdle(this.time); rate = 6;
        if (!pl.dead && this.cd <= 0) this.choose();
        break;
      }
      case 'melee': pose = this.runMelee(dt); rate = this.poseRate; pose.y = (pose.y || 0) * 2; break;
      case 'recover': pose = A.priestIdle(this.time); rate = 5; this.face(this._a, 1.5, dt); if (this.t > this.recT / this.tempo) { this.set('float'); this.cd = rand(0.1, 0.5) / this.tempo; } break;
      case 'volley': {
        const w = 0.9 / this.tempo, n = p2 ? 8 : 5;
        this.face(this._a, 5, dt); pose = A.priestCast(clamp(this.t / w, 0, 1), this.time); rate = 7; this.glint(this.t < w ? (this.t / w) * 3 : 0);
        if (this.t < w && Math.random() < dt * 40) { (Math.random() < 0.5 ? m.handL : m.handR).getWorldPosition(v1); g.fx.add.spawn(v1.x, v1.y, v1.z, rand(-1, 1), rand(0, 1.5), rand(-1, 1), 0.5, 0.4, 0.03, 1, 0.25, 0.08, 0.9); }
        if (!this.hitDone && this.t >= w) { this.hitDone = true; sfx.cast(); }
        if (this.t >= w && this.fired < n && this.t >= w + this.fired * 0.2) { this.fireOrb(this.fired, (this.fired - (n - 1) / 2) * 0.16, 11.5, 1.6); this.fired++; }
        if (this.t > w + n * 0.2 + 0.7) { this.set('float'); this.cd = 0.5; }
        break;
      }
      case 'nova': {
        const w = 1.0 / this.tempo;
        pose = A.priestCast(clamp(this.t / w, 0, 1), this.time); rate = 7; this.glint(this.t < w ? (this.t / w) * 4 : 0);
        for (let k = 0; k < 2; k++) if (this.sub === k && this.t >= w + k * 0.75) {
          this.sub++; sfx.cast(); sfx.erupt(); g.shake(0.4);
          for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + k * 0.224; g.haz.orb(this.pos.x + Math.sin(a) * 1.5, this.pos.y + 1.3, this.pos.z + Math.cos(a) * 1.5, Math.sin(a) * 8.5, 0, Math.cos(a) * 8.5, { dmg: 15, color: 0xff3a18, r: 0.32, life: 4, bounds: CHURCH }); }
        }
        if (this.t > w + 1.7) { this.set('float'); this.cd = 0.3; }
        break;
      }
      case 'lunge': {
        const w = 0.85 / this.tempo;
        if (this.t < w) { this.face(this._a, 6, dt); pose = A.priestLunge(0); rate = 7; this.ldir = this.yaw; this.glint(Math.pow(this.t / w, 3) * 4); if (!this.hitDone && this.t > 0.05) { this.hitDone = true; sfx.screech(0.25); } if (this.t + dt >= w) { this.hitDone = false; sfx.whoosh(true); } }
        else if (this.t < w + 0.55) {
          this.glint(0); pose = A.priestLunge(1); rate = 26; this.yaw = this.ldir; if (!this.hitDone) this.step(19, dt);
          if (Math.random() < dt * 50) g.fx.smoke(this.pos.x, this.pos.y + 1.5, this.pos.z, 1, 0.04, 1);
          if (!this.hitDone && this.strike(3.4, 2.2, 34, { heavy: true, knock: 9 })) { this.hitDone = true; sfx.flesh(); g.shake(0.7); }
        } else { pose = A.priestLunge(1); rate = 4; if (this.t > w + 0.55 + 1.0) { this.set('float'); this.cd = 0.3; } }
        break;
      }
      case 'pillars': {
        const w = 1.2 / this.tempo;
        this.face(this._a, 3, dt); pose = A.priestCast(clamp(this.t / (w * 0.6), 0, 1), this.time); rate = 6; this.glint(this.t < w ? 3 : 0);
        if (!this.hitDone && this.t > 0.25) {
          this.hitDone = true; sfx.bell(0.5); sfx.whisper();
          g.haz.telegraph(pl.pos.x, pl.pos.z, 2.9, 1.15, 28, { kind: 'fire', follow: 2.2, lockAt: 0.6 });
          for (let i = 0; i < (p2 ? 9 : 6); i++) { const x = rand(CHURCH.minX + 1.5, CHURCH.maxX - 1.5), z = rand(CHURCH.minZ + 2, CHURCH.maxZ - 2); g.haz.telegraph(x, z, 2.8, 1.25 + i * 0.13, 28, { kind: 'fire' }); }
        }
        if (p2 && this.sub === 0 && this.t > 1.5) { this.sub = 1; g.haz.telegraph(pl.pos.x + pl.vel.x * 0.4, pl.pos.z + pl.vel.z * 0.4, 3.2, 0.95, 28, { kind: 'fire' }); }
        if (this.t > w + 1.1) { this.set('float'); this.cd = 0.2; }
        break;
      }
      case 'tele': {
        pose = A.priestCast(0.4, this.time); rate = 8;
        if (this.sub === 0) {
          this.invuln = true; this.untargetable = true;
          if (Math.random() < dt * 80) g.fx.smoke(this.pos.x + rand(-1, 1), this.pos.y + rand(0, 4.5), this.pos.z + rand(-1, 1), 2, 0.03, 1.5);
          if (this.t > 0.45) { this.sub = 1; m.root.visible = false; const [x, z] = this.spot(9, 14); this.pos.x = x; this.pos.z = z; sfx.whisper(); }
        } else if (this.sub === 1) {
          if (this.t > 0.95) { this.sub = 2; m.root.visible = true; this.look(); this.yaw = this._a; g.fx.smoke(this.pos.x, this.pos.y + 2, this.pos.z, 16, 0.03, 1.6); g.fx.burst(this.pos.x, this.pos.y + 2.5, this.pos.z, 1, 0.15, 0.05, 30, 6, 0.4, 0.7); sfx.cast(); }
        } else if (this.t > 1.25) { this.invuln = false; this.untargetable = false; this.set(p2 && Math.random() < 0.4 ? 'nova' : 'volley'); this.fired = 0; this.sub = 0; }
        break;
      }
      case 'beam': {
        const w = 1.3 / this.tempo, dur = 2.3;
        pose = A.priestBeam(this.time); rate = 7; m.mouth.getWorldPosition(v1);
        if (this.t < w) {
          this.face(this._a, 5, dt); this.bdir = Math.random() < 0.5 ? 1 : -1; this.bang = this.yaw - this.bdir * 1.05; this.bfrom = this.bang;
          if (Math.random() < dt * 60) g.fx.add.spawn(v1.x + rand(-1.5, 1.5), v1.y + rand(-1.5, 1.5), v1.z + rand(-1.5, 1.5), 0, 0, 0, 0.3, 0.3, 0.02, 1, 0.3, 0.1, 1);
          g.world.dyn.push({ x: v1.x, y: v1.y, z: v1.z, color: 0xff5a28, i: 60 * (this.t / w), r: 14, prio: 3 });
          if (this.t + dt >= w) { sfx.beam(); this.btick = 0; }
        } else if (this.t < w + dur) {
          const k = (this.t - w) / dur; this.bang = this.bfrom + this.bdir * ease(k) * 2.5; this.yaw = this.bang;
          const len = 34, tx = this.pos.x + Math.sin(this.bang) * len, tz = this.pos.z + Math.cos(this.bang) * len, aimD = 9;
          v2.set(this.pos.x + Math.sin(this.bang) * aimD, this.pos.y + 0.6, this.pos.z + Math.cos(this.bang) * aimD);
          this.beam.visible = true; this.beam.position.copy(v1); this.beam.lookAt(v2); this.beam.scale.set(1 + Math.sin(this.time * 50) * 0.2, 1 + Math.sin(this.time * 50) * 0.2, len);
          g.fx.sparks(v2.x + rand(-0.3, 0.3), this.pos.y + 0.15, v2.z + rand(-0.3, 0.3), 2); g.fx.flame(v2.x, this.pos.y + 0.1, v2.z, 1.6);
          g.world.dyn.push({ x: v2.x, y: this.pos.y + 1.5, z: v2.z, color: 0xff5a28, i: 90, r: 16, prio: 3 });
          g.shake(0.06);
          // 2D test: distance from the player to the beam line on the floor
          const px = pl.pos.x - this.pos.x, pz = pl.pos.z - this.pos.z, along = px * Math.sin(this.bang) + pz * Math.cos(this.bang), perp = Math.abs(px * Math.cos(this.bang) - pz * Math.sin(this.bang));
          if ((this.btick -= dt) <= 0 && along > 2.2 && along < len && perp < 0.85) { if (pl.takeDamage(31, this.pos, { knock: 6 })) this.btick = 0.6; }
        } else { this.beam.visible = false; if (this.t > w + dur + 0.9) { this.set('float'); this.cd = 0.3; } }
        break;
      }
      case 'dive': {
        pose = this.sub < 2 ? A.priestCast(1, this.time) : A.priestLunge(1); rate = 8;
        if (this.sub === 0) {
          this.invuln = true; this.untargetable = true; this.lift = damp(this.lift, 13, 5, dt);
          if (this.t > 0.7) { this.sub = 1; sfx.screech(0.25); this.tele = g.haz.telegraph(pl.pos.x, pl.pos.z, 4.3, 2.1, 0, { kind: 'fire', follow: 3.2, lockAt: 1.6 }); this.tele.onErupt = () => {}; }
        } else if (this.sub === 1) {
          this.pos.x = this.tele.x; this.pos.z = this.tele.z; this.lift = 13;
          if (this.t > 0.7 + 1.95) this.sub = 2;
        } else if (this.sub === 2) {
          this.lift = Math.max(0, this.lift - dt * 90);
          if (this.lift <= 0) {
            this.sub = 3; this.t = 0; this.invuln = false; this.untargetable = false; sfx.thud(1); sfx.erupt(); g.shake(1.1);
            g.fx.dust(this.pos.x, this.pos.y, this.pos.z, 30, 3, 0.2); g.haz.wave(this.pos.x, this.pos.z, 13, 14, 18);
            if (Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) < 4.4) pl.takeDamage(38, this.pos, { heavy: true, knock: 10 });
          }
        } else { pose = A.priestStun(this.time * 0.3); rate = 5; if (this.t > 1.7) { this.set('float'); this.cd = 0.3; } }
        break;
      }
      case 'transition':
        pose = this.t < 1.2 ? A.priestStun(this.time) : A.roarPose(this.time); rate = 6; this.lift = damp(this.lift, this.t > 1.2 ? 0.8 : 0, 3, dt);
        if (!this.hitDone && this.t > 1.2) {
          this.hitDone = true; sfx.roar(0.9, 0.6); sfx.bell(0.7); g.shake(1.2); g.haz.wave(this.pos.x, this.pos.z, 14, 16, 0, { knock: 13 });
          g.fx.burst(this.pos.x, this.pos.y + 3, this.pos.z, 1, 0.15, 0.04, 90, 12, 0.6, 1.2); g.ui.say('“RADOMIR IS TIRED. I AM NOT.”', 4, true); g.onPriestPhase2();
        }
        if (this.t > 1.2 && Math.random() < dt * 40) g.fx.curseMote(this.pos.x + rand(-2, 2), this.pos.y + rand(0, 5), this.pos.z + rand(-2, 2));
        if (this.t > 3.6) { this.invuln = false; this.lift = 0; this.set('float'); this.cd = 0.2; }
        break;
      case 'stagger': pose = A.priestStun(this.time); rate = 9; if (this.t > 2.3) { this.set('float'); this.cd = 0.3; } break;
      case 'song':
        pose = A.priestStun(this.time); rate = 10;
        if (Math.random() < dt * 30) g.fx.note(this.pos.x + rand(-1.5, 1.5), this.pos.y + rand(1, 4.5), this.pos.z + rand(-1.5, 1.5));
        if (this.t > 3.4) { this.vuln = false; this.set('float'); this.cd = 0.2; }
        break;
      case 'dying':
        pose = this.t < 2.2 ? A.priestStun(this.time) : A.priestDead(); rate = this.t < 2.2 ? 8 : 2.2; this.lift = damp(this.lift, 0, 4, dt);
        if (this.t < 3.5 && Math.random() < dt * 60) g.fx.curseMote(this.pos.x + rand(-1.5, 1.5), this.pos.y + rand(0.5, 4.5), this.pos.z + rand(-1.5, 1.5));
        if (!this.hitDone && this.t > 0.6) { this.hitDone = true; g.ui.say('“...sellsword... the song... play the—”', 4); }
        break;
    }
    if (this.state !== 'pray') { this.physics(dt, false); this.clampTo(CHURCH); }
    if (this.state !== 'dive' && this.state !== 'transition' && !this.dead) this.lift = damp(this.lift, 0, 6, dt);
    this.rig.pose(pose, rate, dt);
    this.sync(dt);
  }
}

// ===========================================================================
//  THE BIES — what was inside him. It cannot be cut.
// ===========================================================================
export class Bies {
  constructor(game, x, y, z) {
    this.game = game; this.pos = new THREE.Vector3(x, y + 2.5, z); this.t = 0; this.done = false; this.said = 0;
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2a0c, fog: false });
    this.eyes = new THREE.Group();
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mat); e.position.set(s * 0.3, 0, 0); e.scale.set(1.5, 0.6, 1); this.eyes.add(e); }
    game.scene.add(this.eyes);
  }
  update(dt) {
    const g = this.game, pl = g.player, fx = g.fx; this.t += dt;
    const dx = pl.pos.x - this.pos.x, dy = pl.pos.y + 1.5 - this.pos.y, dz = pl.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const playing = pl.state === 'flute';
    if (this.t < 5) this.pos.y += dt * 0.5;
    else {
      const sp = clamp(1.1 + (this.t - 5) * 0.28, 1.1, 6.5) * (playing ? 0.12 : 1);
      this.pos.x += dx / (d || 1) * sp * dt; this.pos.z += dz / (d || 1) * sp * dt; this.pos.y += dy * Math.min(1, dt * 1.2);
    }
    this.eyes.position.copy(this.pos); this.eyes.lookAt(pl.pos.x, pl.pos.y + 1.6, pl.pos.z);
    const n = playing ? 5 : 9;
    for (let i = 0; i < n; i++) { const a = rand(TAU), r = rand(0.2, 1.8), e = rand(-1.4, 1.6); fx.alp.spawn(this.pos.x + Math.sin(a) * r, this.pos.y + e, this.pos.z + Math.cos(a) * r, rand(-0.6, 0.6) + (playing ? -dx * 0.1 : 0), rand(-0.3, 0.9), rand(-0.6, 0.6), rand(0.5, 1.1), 1.2, 2.6, 0.012, 0.004, 0.008, 0.85, 0, 0.5); }
    if (Math.random() < dt * 14) fx.curseMote(this.pos.x, this.pos.y - 1, this.pos.z);
    g.world.dyn.push({ x: this.pos.x, y: this.pos.y, z: this.pos.z, color: 0xff1a08, i: 30, r: 14, prio: 3 });
    if (this.said === 0 && this.t > 2.4) { this.said = 1; g.ui.say('“A STRONGER HOUSE.”', 3.4, true); g.audio.sfx.whisper(); }
    if (this.said === 1 && this.t > 6.5) { this.said = 2; g.ui.say('“HOLD STILL, SELLSWORD. THIS IS WHAT YOU WERE PAID FOR.”', 4.5, true); g.audio.sfx.roar(0.4, 1.4); }
    if (this.said === 2 && this.t > 8.5 && g.knowsSong() && !playing) { this.said = 3; g.ui.toast("Dedko's song — play it!  [F]", 6); }
    if (this.t > 5 && d < 1.3 && Math.abs(dy) < 1.6) return 'bad';
    return null;
  }
  banish() { const g = this.game; g.fx.burst(this.pos.x, this.pos.y, this.pos.z, 1, 0.8, 0.4, 120, 12, 0.5, 1.6); g.fx.smoke(this.pos.x, this.pos.y, this.pos.z, 30, 0.02, 2); this.remove(); }
  remove() { this.game.scene.remove(this.eyes); this.done = true; }
}
