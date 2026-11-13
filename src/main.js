import * as THREE from 'three';
import { Pipeline } from './gfx/post.js';
import { Input, KEY } from './core/input.js';
import { TouchControls } from './core/touch.js';
import { AudioSys } from './audio/audio.js';
import { Music } from './audio/music.js';
import { Ambience } from './audio/ambience.js';
import { FX } from './gfx/fx.js';
import { World } from './world/world.js';
import { groundHeight, corruption, inChurch, pathDist, SQUARE, CHURCH, START } from './world/terrain.js';
import { AREAS } from './world/story.js';
import { Player } from './game/player.js';
import { Enemy } from './game/enemies.js';
import { Templar, Priest, Bies } from './game/bosses.js';
import { Hazards } from './game/hazards.js';
import { UI } from './game/ui.js';
import { clamp, damp, dampAngle, angDiff, rand } from './core/util.js';

const MOON = new THREE.Vector3(-0.45, 0.55, 0.7).normalize(), RIFT = new THREE.Vector3(0, 0.5, -1).normalize();
const _v = new THREE.Vector3();
// the same hints, for thumbs
const TOUCH_HINTS = {
  move: 'Left thumb moves  ·  Right thumb looks  ·  Push the stick further to sprint',
  flute: '♫ — play your flute. The old song lends strength, but you are defenceless while you play.',
  fight: 'Strike  ·  Whirl  ·  Roll  ·  Lock',
  flask: 'Tap the flask to drink',
  graves: 'The air here feels like a held breath…  (♫)',
};

class Game {
  constructor() {
    const canvas = document.getElementById('game');
    // phones and tablets get a lighter frame: less multisampling, a smaller shadow map, thinner grass
    const lite = this.lite = matchMedia('(pointer: coarse)').matches || /[?&]lite=1/.test(location.search);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.75;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.FogExp2(0x0b1118, 0.021);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.2, 900);
    this.scene.add(new THREE.HemisphereLight(0x7890c4, 0x2a221c, 1.45));
    this.moon = new THREE.DirectionalLight(0xa9bdf0, 2.6); this.moon.castShadow = true;
    const s = this.moon.shadow; s.mapSize.set(lite ? 2048 : 4096, lite ? 2048 : 4096); s.camera.left = s.camera.bottom = -40; s.camera.right = s.camera.top = 40; s.camera.near = 1; s.camera.far = 230; s.bias = -0.0006; s.normalBias = 0.05;
    this.scene.add(this.moon, this.moon.target);
    this.fill = new THREE.PointLight(0x93a8d8, 14, 15, 1.5); this.scene.add(this.fill);

    this.post = new Pipeline(r, this.scene, this.camera, lite ? 2 : 4); this.grade = this.post.grade;
    this.post.sources.push({ dir: RIFT, strength: 1 }, { dir: MOON, strength: 0.5 });

    this.input = new Input(canvas); this.touch = new TouchControls(this.input);
    this.world = new World(this.scene, lite); this.world.bakeEnv(r); this.scene.environmentIntensity = 1.0;
    this.fx = new FX(this.scene);
    this.ui = new UI(this);
    this.haz = new Hazards(this);
    this.audio = null; this.music = null;
    this.player = new Player(this);
    this.enemies = this.world.spawns.map((sp, i) => new Enemy(this, sp, i + 1));
    this.templar = new Templar(this); this.priest = new Priest(this);
    this._targets = [];

    this.cam = { yaw: 0, pitch: 0.2, dist: 6.4, focus: new THREE.Vector3(START.x, 2, START.z), shake: 0 };
    this.state = 'title'; this.time = 0; this.playTime = 0; this.stop = 0; this.inputEnabled = true; this.god = false;
    this.found = new Set(['contract']); this.seenAreas = new Set(); this.hints = new Set(); this.timers = [];
    this.checkpoint = { x: START.x, z: START.z, yaw: Math.PI };
    this.boss = null; this.combatLevel = 0; this.combatHold = 0; this.hurt = 0; this.deaths = 0; this.stain = null; this.bies = null; this.finale = false; this.ended = false; this.levels = 0;

    addEventListener('resize', () => this.resize()); this.resize();
    document.getElementById('startBtn').addEventListener('click', () => this.start());
    document.getElementById('endRestart').addEventListener('click', () => location.reload());
    this.last = performance.now();
    this.frame = this.frame.bind(this); requestAnimationFrame(this.frame);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false); this.post.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.fx.resize(h);
  }

  start() {
    if (this.state !== 'title') return;
    this.audio = new AudioSys(this.lite); this.audio.resume(); this.music = new Music(this.audio); this.music.setState('explore'); this.amb = new Ambience(this.audio);
    this.ui.hideTitle(); this.ui.showHud(true); this.state = 'play'; this.touch.immerse();
    if (!this.touch.enabled) { this.input.wantLock = true; this.input.lock(); }
    this.ui.fade(true); setTimeout(() => this.ui.fade(false), 60);
    this.after(1.2, () => this.ui.area(AREAS[0].title, AREAS[0].sub)); this.seenAreas.add('road');
    this.after(6.5, () => this.ui.say('“Three hundred grivnas. I have walked into worse places for less.”', 5));
    this.after(12, () => this.hint('move', 'WASD move  ·  Mouse look  ·  Shift sprint  ·  Space roll'));
    this.after(40, () => { if (this.player.buff <= 0) this.hint('flute', 'F — play your flute. The old song lends strength, but you are defenceless while you play.'); });
  }
  after(sec, fn) { this.timers.push({ t: sec, fn }); }
  hint(id, text) { if (this.hints.has(id)) return; this.hints.add(id); this.ui.toast((this.touch.enabled && TOUCH_HINTS[id]) || text, 6); }

  // ---------- services used by actors ----------
  targets() { return this._targets; }
  hitstop(s) { this.stop = Math.max(this.stop, s); }
  shake(a, x, z) { if (x !== undefined) a *= clamp(1 - Math.hypot(x - this.player.pos.x, z - this.player.pos.z) / 32, 0, 1); this.cam.shake = Math.max(this.cam.shake, a); }
  attackSlot(e) { let n = 0; for (const o of this.enemies) if (o !== e && !o.dead && o.state === 'attack' && o.type !== 'wailer') n++; return n < 2; }
  clampArena(p, r) {
    if (this.arena === 'church') { p.x = clamp(p.x, CHURCH.minX + r, CHURCH.maxX - r); p.z = clamp(p.z, CHURCH.minZ + r, CHURCH.maxZ - r); }
  }
  knowsSong() { return this.found.has('confession') || this.found.has('echo_dedko') || this.found.has('dedko'); }
  levelCost() { const n = this.levels; return 120 + n * 95 + n * n * 22; }
  buyLevel(k) {
    if (this.state !== 'shrine') return; const p = this.player, c = this.levelCost();
    if (p.silver < c) { this.audio.sfx.deny(); return; }
    p.silver -= c; p.lv[k]++; this.levels++; p.recalc(); p.restore(); this.audio.sfx.levelUp(); this.ui.refreshShrine();
  }

  onPlayerHurt(amount) { if (amount > 0) { this.hurt = Math.min(1, this.hurt + 0.35 + amount / 60); this.shake(0.35 + amount / 80); if (this.player.flasks > 0) this.hint('flask', 'R — drink from your flask'); } }
  onEnemyKilled(e) { this.giveSilver(e.def.silver * (e.sp.sexton ? 2 : 1), e.pos); }
  giveSilver(n, pos) { this.player.silver += Math.round(n); this.fx.silver(pos.x, pos.y + 0.5, pos.z, 10); this.audio.sfx.silver(); }

  startBoss(b) {
    if (b.active || b.dead) return;
    b.wake(); this.boss = b;
    if (b === this.templar) { this.world.setBarrier('sqS', true); this.world.setBarrier('sqN', true); this.ui.area('Square of the Pale Sun', 'Something kneels at its heart. It has been kneeling a long time.'); }
    else { this.world.setBarrier('door', true); this.arena = 'church'; }
  }
  onTemplarDead(t) {
    this.giveSilver(t.silver, t.pos); this.player.lock = null;
    this.ui.banner('THE LOCK IS BROKEN', 'Aldric, the Rooted Templar');
    this.world.setBarrier('sqS', false); this.world.setBarrier('sqN', false);
    this.after(2.8, () => { this.boss = null; this.audio.sfx.chainBreak(); this.audio.sfx.bell(0.7); this.world.breakSeal(); this.world.setBarrier('door', false); this.shake(0.5); });
    this.after(6.2, () => { this.found.add('lastpage'); this.audio.sfx.pickup(); if (this.state === 'play' && !this.player.dead) this.read('lastpage'); else this.ui.toast("Found: Aldric's Last Page  (Tab)", 6); });
  }
  onPriestPhase2() { for (const l of this.world.lights) if (l.z < -110 && l.prio >= 2 && !l.pulse && !l._c) { l._c = l.color; l._i = l.i; l.color = 0xff3a14; l.i *= 1.3; } }
  onPriestDying(p) {
    this.player.lock = null; this.finale = true; this.inputHold = 0;
    this.after(1.5, () => this.ui.banner('THE VESSEL FALLS', 'Father Radomir', 3.5));
    this.after(4.6, () => { this.boss = null; this.bies = new Bies(this, p.pos.x, p.pos.y, p.pos.z); this.audio.sfx.roar(0.6, 1.3); this.shake(0.8); });
  }
  onFlute() {
    const p = this.player;
    if (this.bies && !this.ended) { this.endGame('good'); return; }
    for (const l of this.world.listen) {
      if (this.found.has(l.id) || Math.hypot(l.x - p.pos.x, l.z - p.pos.z) > l.r) continue;
      this.found.add(l.id); this.audio.sfx.whisper(); this.fx.burst(l.x, groundHeight(l.x, l.z) + 1.5, l.z, 0.45, 0.7, 1, 60, 5, 0.35, 1.6);
      this.after(1.1, () => { this.audio.sfx.pickup(); this.read(l.id); }); return;
    }
    if (this.priest.hearSong()) return;
    this.hint('buff', "Shepherd's Lament — your blows land harder and your breath returns faster.");
  }
  endGame(kind) {
    this.ended = true; this.inputEnabled = false;
    if (kind === 'good') {
      this.bies.banish(); this.bies = null; this.audio.sfx.bell(0.6); this.audio.sfx.buff(); this.music.setState('ending'); this.ui.say('The last note hangs in the ruined church.', 5);
      this.world.skyMat.uniforms.rift.value = 0; this.world.bakeEnv(this.renderer); this.world.lights.forEach((l) => { if (l.pulse) l.i *= 0.15; });
      this.after(6.5, () => this.showEnding('good'));
    } else {
      this.audio.sfx.die(); this.audio.sfx.roar(0.8, 0.5); this.music.setState('doom'); this.hurt = 1; this.shake(1.2); this.player.state = 'rest';
      this.after(2.2, () => this.showEnding('bad'));
    }
  }
  showEnding(kind) { this.ui.fade(true); setTimeout(() => { this.state = 'ending'; this.input.wantLock = false; this.input.unlock(); this.ui.showHud(false); this.ui.ending(kind, this.found, this.deaths, this.playTime); }, 1100); }

  onPlayerDeath() {
    this.deaths++; this.ui.death(true); this.music.setState('silence'); this.ui.prompt(null);
    this.after(4.4, () => { this.ui.fade(true); });
    this.after(5.5, () => this.respawn());
  }
  respawn() {
    const p = this.player, c = this.checkpoint;
    if (p.silver > 0) { this.stain = { x: p.pos.x, z: p.pos.z, y: p.pos.y, n: p.silver }; p.silver = 0; }
    p.respawn(c.x, c.z, c.yaw); this.cam.yaw = c.yaw + Math.PI; this.cam.focus.set(c.x, p.pos.y + 1.7, c.z);
    this.resetWorld(); this.ui.death(false); this.ui.fade(false); this.hurt = 0;
  }
  resetWorld() {
    for (const e of this.enemies) e.reset();
    this.haz.clear(); this.arena = null; this.boss = null;
    if (!this.templar.dead) { this.templar.reset(); this.world.setBarrier('sqS', false); this.world.setBarrier('sqN', true); }
    if (!this.priest.dead) { this.priest.reset(); this.world.setBarrier('door', !this.templar.dead); for (const l of this.world.lights) if (l._c) { l.color = l._c; l.i = l._i; l._c = 0; } }
  }

  read(id) { this.touch.reset(); this.state = 'read'; this.ui.openReader(id); this.ui.clues(this.found.size - 1); this.audio.sfx.page(); this.ui.prompt(null); }
  rest(s) {
    const p = this.player;
    if (!s.lit) { this.world.lightShrine(s); this.audio.sfx.kindle(); this.ui.banner('SHRINE KINDLED', 'The dark steps back a pace.', 3); }
    this.checkpoint = { x: s.x + Math.sin(s.rot) * 1.6, z: s.z + Math.cos(s.rot) * 1.6, yaw: s.rot + Math.PI };
    p.restore(); p.state = 'rest'; p.lock = null; p.vel.set(0, 0, 0); this.resetWorld();
    this.touch.reset(); this.state = 'shrine'; this.ui.openShrine(); this.ui.prompt(null);
  }

  // ---------- main loop ----------
  frame(now) {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000)); this.last = now;
    this.input.poll(dt);
    if (!this.frozen) this.tick(dt);
    this.render(dt);
    this.input.endFrame();
  }

  tick(dt) {
    this.time += dt;
    const inp = this.input, p = this.player, w = this.world;
    if (this.state === 'title') { this.titleCam(dt); this.ambient(dt, this.camera.position.x, this.camera.position.z); return; }
    this.music.update(dt);
    if (this.state === 'read') { if (inp.hit(KEY.interact) || inp.hit(KEY.back) || inp.hit(['Enter', 'Space'])) { this.ui.closeReader(); this.state = 'play'; } this.ui.frame(dt); return; }
    if (this.state === 'journal') {
      if (inp.hit(KEY.journal) || inp.hit(KEY.back)) { this.ui.closeJournal(); this.state = 'play'; }
      if (inp.hit(['ArrowDown', 'KeyS', 'PadDown'])) this.ui.selectJournal(this.ui.jSel + 1); if (inp.hit(['ArrowUp', 'KeyW', 'PadUp'])) this.ui.selectJournal(this.ui.jSel - 1);
      inp.dx = inp.dy = 0; this.ui.frame(dt); return;
    }
    if (this.state === 'shrine') {
      if (inp.hit(['Digit1'])) this.buyLevel('vigor'); if (inp.hit(['Digit2'])) this.buyLevel('endurance'); if (inp.hit(['Digit3'])) this.buyLevel('strength');
      if (inp.hit(KEY.interact) || inp.hit(KEY.back)) { this.ui.closeShrine(); this.state = 'play'; p.state = 'idle'; }
      p.animate(dt); this.updateCamera(dt); this.ambient(dt, p.pos.x, p.pos.z); this.ui.frame(dt); return;
    }
    if (this.state === 'ending') { this.ambient(dt, p.pos.x, p.pos.z); return; }

    this.playTime += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; if ((t.t -= dt) <= 0) { this.timers.splice(i, 1); t.fn(); if (this.state !== 'play') return; } }
    let sdt = dt; if (this.stop > 0) { this.stop -= dt; sdt = dt * 0.04; }

    // who can be hit this frame
    const T = this._targets; T.length = 0;
    for (const e of this.enemies) if (!e.dead && Math.abs(e.pos.x - p.pos.x) + Math.abs(e.pos.z - p.pos.z) < 60) T.push(e);
    if (!this.templar.dead) T.push(this.templar); if (!this.priest.dead) T.push(this.priest);

    p.update(sdt);
    let hunted = false;
    for (const e of this.enemies) {
      const far = Math.abs(e.pos.x - p.pos.x) + Math.abs(e.pos.z - p.pos.z);
      if (far > 75) { e.model.root.visible = false; continue; }
      if (!(e.dead && e.t > 4.6)) e.model.root.visible = true;
      e.update(sdt); if (e.aggro && !e.dead && far < 40) hunted = true;
    }
    if (Math.abs(this.templar.pos.z - p.pos.z) < 90) this.templar.update(sdt);
    if (Math.abs(this.priest.pos.z - p.pos.z) < 90) this.priest.update(sdt);
    this.separate();
    this.haz.update(sdt);
    if (this.bies && !this.ended) { if (this.bies.update(sdt) === 'bad') this.endGame('bad'); }

    this.triggers(dt, hunted);
    this.interactions();
    this.updateCamera(dt);
    this.ambient(dt, p.pos.x, p.pos.z);
    this.ui.frame(dt);
    if (inp.hit(KEY.god) && !p.dead && this.state === 'play') { this.god = !this.god; if (this.god) p.restore(); this.ui.toast(this.god ? 'GOD MODE ON' : 'GOD MODE OFF', 2); }
    if (inp.hit(KEY.journal) && !p.dead && this.state === 'play') { this.touch.reset(); this.state = 'journal'; this.ui.openJournal(this.found); }
  }

  ambient(dt, x, z) {
    const w = this.world, p = this.player, cor = corruption(x, z);
    w.update(dt, this.time, x, p.pos.y, z, this.fx, this.found);
    const inside = inChurch(x, z) && z < -110;
    this.scene.fog.color.copy(w.fogColor); this.scene.fog.density = this.dbgFog ? 0.002 : damp(this.scene.fog.density, inside ? 0.011 : 0.021, 2, dt);
    this.fx.setFog(w.fogColor, this.scene.fog.density);
    this.fx.ambient(dt, x, p.pos.y, z, cor, inside ? 0 : 1); this.fx.update(dt);
    if (this.audio) this.soundscape(dt, x, z, cor, inside);
  }

  /** Where the ears are, what room they are in, what is underfoot, and which fire is nearest. */
  soundscape(dt, x, z, cor, inside) {
    const p = this.player, a = this.audio, cam = this.camera;
    cam.getWorldDirection(_v); a.listen(x, p.pos.y + 1.6, z, _v.x, _v.y, _v.z);
    a.setSpace(inside ? 1 : 0);
    a.sfx.surface = inChurch(x, z) || Math.hypot(x - SQUARE.x, z - SQUARE.z) < SQUARE.r ? 'stone' : pathDist(x, z) < 3.2 ? 'mud' : 'grass';
    let fire = null, fd = 24;
    for (const l of this.world.lights) { if (!l.flicker || l.i <= 0) continue; const d = Math.hypot(l.x - x, l.z - z); if (d < fd) { fd = d; fire = l; } }
    if (fire) fire.d = fd;
    a.setMuffle(p.dead ? 0.75 : clamp(1 - p.hp / (p.maxHp * 0.3), 0, 1) * 0.3);
    this.amb.update(dt, { x, y: p.pos.y, z, cor, inside, fire, quiet: this.combatLevel });
  }

  separate() {
    const p = this.player, list = this._targets;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]; if (a.untargetable || a.lift > 1.5) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]; if (b.isBoss || a.isBoss) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), m = a.radius + b.radius;
        if (d < m && d > 1e-4) { const k = (m - d) / d * 0.5; a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k; }
      }
      if (p.state === 'roll' || p.dead || a.state === 'dormant') continue;
      const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z, d = Math.hypot(dx, dz), m = a.radius + p.radius;
      if (d < m && d > 1e-4) { const k = (m - d) / d; if (a.isBoss || a.type === 'brute') { p.pos.x += dx * k; p.pos.z += dz * k; } else { p.pos.x += dx * k * 0.6; p.pos.z += dz * k * 0.6; a.pos.x -= dx * k * 0.4; a.pos.z -= dz * k * 0.4; } }
    }
  }

  triggers(dt, hunted) {
    const p = this.player, x = p.pos.x, z = p.pos.z;
    for (const a of AREAS) if (!this.seenAreas.has(a.id) && a.test(x, z) && !this.boss) { this.seenAreas.add(a.id); this.ui.area(a.title, a.sub); }
    if (!this.templar.dead && !this.templar.active && Math.hypot(x - SQUARE.x, z - SQUARE.z) < SQUARE.r - 3.5) this.startBoss(this.templar);
    if (!this.priest.dead && !this.priest.active && Math.abs(x) < 10 && z < CHURCH.maxZ - 1.2 && z > CHURCH.minZ - 4) this.startBoss(this.priest);
    if (hunted) { this.combatHold = 3.5; this.hint('fight', 'C slash  ·  X whirlwind  ·  Space roll  ·  Q lock on'); } else this.combatHold -= dt;
    const fighting = this.combatHold > 0 || (this.boss && this.boss.active && !this.boss.dead);
    this.combatLevel = damp(this.combatLevel, fighting ? 1 : 0, 3, dt);
    if (this.stain && !p.dead) {
      const s = this.stain; if (Math.random() < dt * 20) this.fx.silver(s.x, s.y, s.z, 1); this.world.dyn.push({ x: s.x, y: s.y + 1, z: s.z, color: 0xbfd8ff, i: 10, r: 9 });
      if (Math.hypot(s.x - x, s.z - z) < 1.6) { p.silver += s.n; this.stain = null; this.audio.sfx.pickup(); this.ui.toast(`Silver recovered  (+${s.n})`); }
    }
    // music follows the fight
    let ms = 'explore';
    if (this.ended) ms = this.music.state; else if (this.finale) ms = 'finale'; else if (p.dead) ms = 'silence';
    else if (this.priest.active && !this.priest.dead) ms = this.priest.phase === 2 ? 'boss2' : this.priest.state === 'intro' ? 'finale' : 'boss';
    else if (this.templar.active && !this.templar.dead) ms = 'miniboss'; else if (this.combatHold > 0) ms = 'combat';
    this.music.setState(ms);
    const b = this.boss; this.ui.boss(b && b.active && !b.dead && b.state !== 'intro' ? b.name : null, b ? b.hp / b.maxHp : 0);
    this.hurt = Math.max(0, this.hurt - dt * 1.6);
  }

  interactions() {
    const p = this.player, inp = this.input; let best = null, bd = 1e9;
    if (p.state === 'idle' && !this.finale) for (const it of this.world.interact) { const d = Math.hypot(it.x - p.pos.x, it.z - p.pos.z); if (d < it.r && d < bd) { bd = d; best = it; } }
    if (!best) { this.ui.prompt(null); return; }
    if (best.kind === 'clue') {
      this.ui.prompt(this.found.has(best.id) ? 'Read again' : best.label);
      if (inp.hit(KEY.interact)) { if (!this.found.has(best.id)) { this.found.add(best.id); this.audio.sfx.pickup(); if (best.id === 'graves') this.hint('graves', 'The air here feels like a held breath…  (F)'); } this.read(best.id); }
    } else {
      this.ui.prompt(best.shrine.lit ? 'Rest at the shrine' : 'Kindle the shrine');
      if (inp.hit(KEY.interact)) { if (this.combatHold > 0 || this.boss) { this.ui.toast('Not while they hunt you.'); this.audio.sfx.deny(); } else this.rest(best.shrine); }
    }
  }

  titleCam(dt) {
    const t = this.time * 0.05, c = this.camera;
    c.position.set(Math.sin(t) * 5, groundHeight(0, 86) + 2.6 + Math.sin(t * 2) * 0.3, 88 + Math.cos(t) * 3);
    c.lookAt(0, 9, 20);
    this.moon.position.copy(c.position).addScaledVector(MOON, 100); this.moon.target.position.copy(c.position); this.fill.position.copy(this.player.pos).y += 2.4;
    this.player.animate(dt);
  }

  updateCamera(dt) {
    const c = this.cam, p = this.player, inp = this.input, cam = this.camera, lock = p.lock;
    if (this.state === 'play') { c.yaw -= inp.dx * 0.0026; c.pitch = clamp(c.pitch + inp.dy * 0.0022, -0.35, 1.15); }
    const boss = this.boss && this.boss.active && !this.boss.dead ? this.boss : null;
    let tx = p.pos.x, ty = p.pos.y + 1.75, tz = p.pos.z, wantDist = boss ? (boss === this.priest ? 9.2 : 8.4) : 6.4;
    if (lock) {
      const dx = p.pos.x - lock.pos.x, dz = p.pos.z - lock.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.8) c.yaw = dampAngle(c.yaw, Math.atan2(dx, dz), 5.5, dt);
      c.pitch = damp(c.pitch, clamp(0.3 - (lock.height - 2) * 0.035 + 0.5 / Math.max(3, d), 0.1, 0.42), 3, dt);
      const k = Math.min(lock.isBoss ? 0.22 : 0.3, 1.7 / Math.max(d, 0.1)); tx += (lock.pos.x - p.pos.x) * k; tz += (lock.pos.z - p.pos.z) * k; ty += Math.min(1.2, (lock.height - 2) * 0.25);
    }
    c.focus.x = damp(c.focus.x, tx, 12, dt); c.focus.y = damp(c.focus.y, ty, 9, dt); c.focus.z = damp(c.focus.z, tz, 12, dt);
    c.dist = damp(c.dist, wantDist, 2.5, dt);
    const cp = Math.cos(c.pitch), dxn = Math.sin(c.yaw) * cp, dyn = Math.sin(c.pitch), dzn = Math.cos(c.yaw) * cp;
    let dist = c.dist; const inside = inChurch(p.pos.x, p.pos.z) && p.pos.z < -110;
    if (!inside) for (let i = 1; i <= 12; i++) { const s = (c.dist * i) / 12; if (this.world.occluded(c.focus.x + dxn * s, c.focus.y + dyn * s, c.focus.z + dzn * s)) { dist = Math.max(1.2, s - 0.6); break; } }
    if (inside) {
      // shorten the boom so the camera stays inside the nave (or looks in through the open door)
      const f = c.focus; let t = c.dist;
      if (dxn > 1e-4) t = Math.min(t, (10.5 - f.x) / dxn); else if (dxn < -1e-4) t = Math.min(t, (-10.5 - f.x) / dxn);
      if (dzn < -1e-4) t = Math.min(t, (-149.3 - f.z) / dzn);
      if (dyn > 1e-4) t = Math.min(t, (CHURCH.y + 10.2 - f.y) / dyn);
      if (dzn > 1e-4) { const ts = (-110.6 - f.z) / dzn; if (ts < t && !(Math.abs(f.x + dxn * ts) < 2.1 && f.y + dyn * ts < CHURCH.y + 5)) t = ts; }
      dist = Math.max(1.7, t - 0.15);
    }
    c.cur = c.cur === undefined ? dist : dist < c.cur ? dist : damp(c.cur, dist, 4, dt);
    cam.position.set(c.focus.x + dxn * c.cur, c.focus.y + dyn * c.cur, c.focus.z + dzn * c.cur);
    if (c.cur < 3.6) cam.position.y += (3.6 - c.cur) * 0.45;
    cam.position.y = Math.max(cam.position.y, groundHeight(cam.position.x, cam.position.z) + 0.45);
    if (c.shake > 0.001) { const a = c.shake * 0.42; cam.position.x += rand(-a, a); cam.position.y += rand(-a, a); cam.position.z += rand(-a, a); c.shake = Math.max(0, c.shake - dt * (1.6 + c.shake * 3)); }
    cam.lookAt(c.focus.x, c.focus.y + 0.25, c.focus.z);
    this.moon.position.copy(p.pos).addScaledVector(MOON, 100); this.moon.target.position.copy(p.pos);
    this.fill.position.set(p.pos.x + Math.cos(c.yaw) * -2.2 + Math.sin(c.yaw) * 1.2, p.pos.y + 4.3, p.pos.z - Math.sin(c.yaw) * -2.2 + Math.cos(c.yaw) * 1.2);
    if (lock && !lock.untargetable) { _v.set(lock.pos.x, lock.pos.y + lock.lift + Math.min(3.2, lock.height * 0.6), lock.pos.z).project(cam); if (_v.z < 1) this.ui.lockDot((_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight); else this.ui.lockDot(null); } else this.ui.lockDot(null);
  }

  render() {
    const u = this.grade.uniforms, p = this.player;
    u.time.value = this.time % 100; u.hurt.value = this.hurt; u.low.value = p.dead ? 0 : clamp(1 - p.hp / (p.maxHp * 0.35), 0, 1);
    u.desat.value = damp(u.desat.value, p.dead ? 0.75 : 0, 2, 0.016); u.warm.value = damp(u.warm.value, p.buff > 0 ? 1 : 0, 3, 0.016);
    this.post.sources[0].strength = this.world.skyMat.uniforms.rift.value;
    this.post.render();
  }
}

window.game = new Game();
// debug: game.tp(x, z, camYaw) teleports the hero
window.game.dbg = function (on = true) { this.scene.traverse((o) => { if (o.isHemisphereLight) o.intensity = on ? 5 : 1.45; }); this.dbgFog = on; return 'ok'; };
window.game.shot = function (act, t, front = 0.7, dist = 5) { this.frozen = false; const p = this.player; p.state = 'idle'; p.t = 0; p.buf = act ? { a: act, t: 1 } : null; this.cam.yaw = p.yaw + front; this.cam.dist = this.cam.cur = dist; this.frozen = true; let acc = 0; this.tick(0.001); while (acc < t) { this.tick(0.016); acc += 0.016; } this.cam.dist = this.cam.cur = dist; this.updateCamera(0.001); return p.state + ' ' + p.t.toFixed(2); };
window.game.tp = function (x, z, yaw = 0, pitch = 0.25) { const p = this.player; p.pos.set(x, groundHeight(x, z), z); this.cam.yaw = yaw; this.cam.pitch = pitch; this.cam.focus.set(x, p.pos.y + 1.7, z); p.yaw = yaw + Math.PI; return 'ok'; };
