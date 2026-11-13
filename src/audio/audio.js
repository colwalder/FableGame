// All sound in the game is synthesised at runtime with WebAudio — no samples.
// Signal flow: sfx (dry, or through a 3D panner) / music / ambience -> master -> EQ -> glue
// compressor -> limiter. One reverb send feeds two spaces (open valley, stone nave) that
// crossfade as the hero walks indoors.
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rv = (a = 0.1) => 1 + (Math.random() - 0.5) * a;      // round-robin variation

/** Stereo impulse response: early reflections, then a tail that darkens as it decays. */
function impulse(c, secs, bright, early, damp) {
  const n = (c.sampleRate * secs) | 0, b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n, w = Math.random() * 2 - 1;
      lp += (w - lp) * Math.max(0.03, bright * (1 - k * damp));
      d[i] = lp * Math.exp(-6.2 * k) * Math.min(1, i / (c.sampleRate * 0.012));
    }
    for (let e = 0; e < early; e++) {
      const i = ((0.006 + Math.random() * 0.085) * c.sampleRate) | 0, a = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.5) * (1 - e / early * 0.5);
      for (let j = 0; j < 24 && i + j < n; j++) d[i + j] += a * Math.exp(-j / 5) * (Math.random() * 0.6 + 0.4);
    }
  }
  return b;
}
function noiseBuffer(c, secs) {
  const n = (c.sampleRate * secs) | 0, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
/** Pink-ish stereo noise (Paul Kellet's filter) for wind and room tone. */
function pinkBuffer(c, secs) {
  const n = (c.sampleRate * secs) | 0, b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
  }
  return b;
}

/** One breathy flute note. Shared by the hero's flute and the score. */
export function fluteNote(sys, t, midi, dur, dest, vol = 0.3) {
  const c = sys.ctx, f = mtof(midi);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.07);
  g.gain.linearRampToValueAtTime(vol * 0.8, t + Math.max(0.09, dur - 0.04));
  g.gain.linearRampToValueAtTime(0, t + dur + 0.14);
  g.connect(dest);
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 0.972, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
  const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
  const g2 = c.createGain(); g2.gain.value = 0.13;
  const o3 = c.createOscillator(); o3.type = 'sine'; o3.frequency.value = f * 3; const g3 = c.createGain(); g3.gain.value = 0.05;
  const lfo = c.createOscillator(); lfo.frequency.value = 4.9 + Math.random() * 0.5;
  const lg = c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.011, t + Math.min(dur, 0.45));
  lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
  const trem = c.createGain(); trem.gain.value = 0.07; lfo.connect(trem); trem.connect(g.gain);
  o.connect(g); o2.connect(g2); g2.connect(g); o3.connect(g3); g3.connect(g);
  // breath: a chiff at the attack, then air riding on the note
  const n = c.createBufferSource(); n.buffer = sys.noiseBuf; n.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 1.3;
  const ng = c.createGain(); ng.gain.setValueAtTime(0.75, t); ng.gain.exponentialRampToValueAtTime(0.11, t + 0.13);
  n.connect(bp); bp.connect(ng); ng.connect(g);
  const end = t + dur + 0.2;
  for (const x of [o, o2, o3, lfo]) { x.start(t); x.stop(end); }
  n.start(t, Math.random()); n.stop(end);
}

export class AudioSys {
  constructor(lite = false) {
    this.lite = lite;                                   // phones: cheaper panning
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = c.createGain(); this.master.gain.value = 0.9;
    const lo = c.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 110; lo.gain.value = 2.5;
    const hi = c.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 6500; hi.gain.value = 2;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 16; comp.ratio.value = 3.5; comp.attack.value = 0.008; comp.release.value = 0.25;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    this.master.connect(lo); lo.connect(hi); hi.connect(comp); comp.connect(lim); lim.connect(c.destination);
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 1024; lim.connect(this.analyser);

    // one send, two rooms
    this.reverb = c.createGain();
    const open = c.createConvolver(); open.buffer = impulse(c, 3.2, 0.5, 6, 0.9);
    const nave = c.createConvolver(); nave.buffer = impulse(c, 6.5, 0.8, 14, 0.75);
    this.openG = c.createGain(); this.openG.gain.value = 0.5; this.naveG = c.createGain(); this.naveG.gain.value = 0;
    this.reverb.connect(open); open.connect(this.openG); this.openG.connect(this.master);
    this.reverb.connect(nave); nave.connect(this.naveG); this.naveG.connect(this.master);

    this.noiseBuf = noiseBuffer(c, 2); this.pinkBuf = pinkBuffer(c, 5);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.62;
    this.musicLP = c.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 20000; this.musicLP.Q.value = 0.5;
    this.duckG = c.createGain();
    this.musicBus.connect(this.musicLP); this.musicLP.connect(this.duckG); this.duckG.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.85; this.sfxBus.connect(this.master);
    this.sfxSend = c.createGain(); this.sfxSend.gain.value = 0.2; this.sfxBus.connect(this.sfxSend); this.sfxSend.connect(this.reverb);
    this.ambBus = c.createGain(); this.ambBus.gain.value = 0.8; this.ambBus.connect(this.master);
    this.space = 0;
    this.sfx = new Sfx(this);
  }
  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }
  /** 0 = open air, 1 = inside the church. */
  setSpace(k) {
    if (Math.abs(k - this.space) < 0.01) return; this.space = k; const t = this.ctx.currentTime;
    this.openG.gain.setTargetAtTime(0.5 * (1 - k * 0.8), t, 0.3); this.naveG.gain.setTargetAtTime(0.75 * k, t, 0.3); this.sfxSend.gain.setTargetAtTime(0.2 + k * 0.25, t, 0.3);
  }
  /** Close the music down to a murmur (0..1): near death, and after it. */
  setMuffle(k) { this.musicLP.frequency.setTargetAtTime(20000 * Math.pow(0.02, k), this.ctx.currentTime, 0.25); }
  /** Pull the score back for a moment so a heavy blow owns the mix. */
  duck(depth = 0.45, hold = 0.25) {
    const t = this.ctx.currentTime, g = this.duckG.gain;
    g.cancelScheduledValues(t); g.setTargetAtTime(1 - depth, t, 0.015); g.setTargetAtTime(1, t + hold, 0.35);
  }
  /** Ears at the hero, facing where the camera faces. */
  listen(x, y, z, fx, fy, fz) {
    const l = this.ctx.listener, t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(x, t, 0.03); l.positionY.setTargetAtTime(y, t, 0.03); l.positionZ.setTargetAtTime(z, t, 0.03);
      l.forwardX.setTargetAtTime(fx, t, 0.03); l.forwardY.setTargetAtTime(fy, t, 0.03); l.forwardZ.setTargetAtTime(fz, t, 0.03);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(x, y, z); l.setOrientation(fx, fy, fz, 0, 1, 0); }
  }
  panner(x, y, z, ref = 5, roll = 0.7) {
    const p = this.ctx.createPanner();
    p.panningModel = this.lite ? 'equalpower' : 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 120;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    return p;
  }
  /** Peak output level (debug / tests). */
  level() {
    const a = new Float32Array(this.analyser.fftSize); this.analyser.getFloatTimeDomainData(a);
    let p = 0; for (const v of a) p = Math.max(p, Math.abs(v)); return p;
  }
}

export class Sfx {
  constructor(sys) { this.sys = sys; this.c = sys.ctx; this.out = sys.sfxBus; this.last = {}; this.surface = 'grass'; }

  /** The same sound set, but placed in the world: `sfx.at(enemy.pos).groan()`. */
  at(p) {
    const s = Object.create(this), sys = this.sys; let node = null;
    Object.defineProperty(s, 'out', { get() { if (!node) { node = sys.panner(p.x, (p.y || 0) + 1.2, p.z); node.connect(sys.sfxBus); } return node; } });
    return s;
  }

  /** Rate limit by name so twenty husks don't all scream on one frame. */
  _ok(name, gap) { const t = this.c.currentTime; if (t - (this.last[name] || -9) < gap) return false; this.last[name] = t; return true; }

  noise(dur, type, f0, f1, vol, q = 1, delay = 0, dest = null) {
    const c = this.c, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.sys.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.2)); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.out);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(type, f0, f1, dur, vol, delay = 0, attack = 0.005, dest = null) {
    const c = this.c, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest || this.out);
    o.start(t); o.stop(t + dur + 0.05);
  }
  /** A tiny click of filtered noise: grit, jingles, crackle, pebbles. */
  tick(f, vol, delay = 0, len = 0.012, q = 3) { this.noise(len, 'bandpass', f, f * 0.8, vol, q, delay); }
  /** Struck metal: inharmonic partials, each a slightly mistuned pair so the ring beats. */
  ring(base, partials, vol, decay = 1, delay = 0, wet = 0.3) {
    const c = this.c, t = c.currentTime + delay, bus = c.createGain(); bus.gain.value = 1; bus.connect(this.out);
    if (wet > 0) { const w = c.createGain(); w.gain.value = wet; bus.connect(w); w.connect(this.sys.reverb); }
    partials.forEach(([r, a, d], i) => {
      for (const det of [1, 1.004 + i * 0.0013]) {
        const o = c.createOscillator(); o.type = i < 2 ? 'triangle' : 'sine'; o.frequency.value = base * r * det;
        const g = c.createGain(); g.gain.setValueAtTime(a * vol * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0004, t + d * decay);
        o.connect(g); g.connect(bus); o.start(t); o.stop(t + d * decay + 0.05);
      }
    });
  }
  /** A throat: buzzing source plus breath, shaped by moving formants. path = [[time 0..1, f0, F1, F2]]. */
  voice(dur, path, vol, o = {}) {
    const c = this.c, t = c.currentTime + (o.delay || 0), fry = o.fry || 0, breath = o.breath ?? 0.25;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (o.attack || 0.05)); g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(this.out); if (o.wet) { const w = c.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(this.sys.reverb); }
    const src = c.createGain();
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    const osc2 = c.createOscillator(); osc2.type = 'sawtooth'; osc2.detune.value = o.detune ?? 14;
    const F = [c.createBiquadFilter(), c.createBiquadFilter(), c.createBiquadFilter()], amp = [1, 0.6, 0.2];
    F.forEach((f, i) => { f.type = 'bandpass'; f.Q.value = i === 2 ? 9 : 6; const a = c.createGain(); a.gain.value = amp[i]; src.connect(f); f.connect(a); a.connect(g); });
    F[2].frequency.value = o.f3 || 2700;
    path.forEach(([k, f0, f1, f2], i) => {
      const at = t + k * dur, set = i === 0 ? 'setValueAtTime' : 'linearRampToValueAtTime';
      osc.frequency[set](f0, at); osc2.frequency[set](f0, at); F[0].frequency[set](f1, at); F[1].frequency[set](f2, at);
    });
    const og = c.createGain(); og.gain.value = 0.5; osc.connect(og); osc2.connect(og); og.connect(src);
    if (fry > 0) { const l = c.createOscillator(); l.type = 'square'; l.frequency.value = 22 + Math.random() * 16; const lg = c.createGain(); lg.gain.value = 0.5 * fry; l.connect(lg); lg.connect(og.gain); l.start(t); l.stop(t + dur + 0.05); }
    if (o.vib) { const l = c.createOscillator(); l.frequency.value = o.vibRate || 6; const lg = c.createGain(); lg.gain.value = o.vib; l.connect(lg); lg.connect(osc.frequency); lg.connect(osc2.frequency); l.start(t); l.stop(t + dur + 0.05); }
    const n = c.createBufferSource(); n.buffer = this.sys.noiseBuf; n.loop = true; const ng = c.createGain(); ng.gain.value = breath; n.connect(ng); ng.connect(src);
    osc.start(t); osc2.start(t); n.start(t, Math.random()); osc.stop(t + dur + 0.05); osc2.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
  }

  // ---------- combat ----------
  whoosh(big = false) {
    const c = this.c, t = c.currentTime, d = (big ? 0.44 : 0.26) * rv(0.2), dir = Math.random() < 0.5 ? -1 : 1, v = big ? 0.6 : 0.4;
    const pan = c.createStereoPanner(); pan.pan.setValueAtTime(-dir * 0.7, t); pan.pan.linearRampToValueAtTime(dir * 0.7, t + d); pan.connect(this.out);
    for (const [f0, fp, f1, q, a] of [[big ? 220 : 420, big ? 1500 : 2600, big ? 500 : 900, 1.6, v], [2500, 7000, 3500, 0.8, v * 0.3]]) {
      const s = c.createBufferSource(); s.buffer = this.sys.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
      f.frequency.setValueAtTime(f0 * rv(), t); f.frequency.exponentialRampToValueAtTime(fp * rv(), t + d * 0.5); f.frequency.exponentialRampToValueAtTime(f1, t + d);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + d * 0.45); g.gain.linearRampToValueAtTime(0, t + d);
      s.connect(f); f.connect(g); g.connect(pan); s.start(t, Math.random()); s.stop(t + d + 0.05);
    }
    if (big) this.tone('sine', 2100 * rv(), 1500, 0.3, 0.035, 0.08, 0.1, pan);            // the blade sings
  }
  hit(big = false) {
    const p = rv(0.16);
    this.noise(0.018, 'highpass', 3500, 2500, 0.7);                                         // edge
    this.noise(0.14, 'lowpass', 3000 * p, 240, 0.75);                                       // crunch
    this.noise(0.1, 'bandpass', 950 * p, 380, 0.5, 1.2, 0.012);                             // wet
    this.tone('sine', (big ? 125 : 165) * p, 40, big ? 0.32 : 0.2, 0.85);                   // weight
    this.ring(1250 * p, [[1, 0.5, 0.22], [2.32, 0.3, 0.16], [3.9, 0.2, 0.1]], 0.18, 1, 0, 0.2);
    if (big) { this.noise(0.34, 'lowpass', 620, 70, 0.55); this.tone('sine', 62, 30, 0.5, 0.6, 0.01); this.sys.duck(0.4, 0.2); }
  }
  flesh() {
    const p = rv(0.2);
    this.noise(0.12, 'bandpass', 900 * p, 280, 0.6, 0.8); this.noise(0.06, 'lowpass', 1800, 500, 0.35, 1, 0.02);
    this.tone('sine', 115 * p, 48, 0.16, 0.55); this.sys.duck(0.25, 0.12);
  }
  clang() {
    const b = 760 * rv(0.12);
    this.ring(b, [[1, 1, 1.3], [2.41, 0.7, 0.9], [3.87, 0.5, 0.6], [5.52, 0.35, 0.4], [7.3, 0.2, 0.25]], 0.36, 1, 0, 0.5);
    this.noise(0.03, 'highpass', 6000, 3500, 0.5); this.tone('sine', 190, 70, 0.12, 0.4); this.sys.duck(0.35, 0.15);
  }
  thud(vol = 0.8) {
    const p = rv(0.2);
    this.tone('sine', 88 * p, 28, 0.5, vol); this.tone('triangle', 150 * p, 50, 0.12, vol * 0.4);
    this.noise(0.26, 'lowpass', 520, 55, vol * 0.75);
    for (let i = 0; i < 4; i++) this.tick(800 + Math.random() * 2400, vol * 0.12, 0.05 + Math.random() * 0.25, 0.02);      // grit settling
    if (vol > 0.6) this.sys.duck(0.3, 0.2);
  }
  roll() {
    this.noise(0.32, 'lowpass', 950, 220, 0.34); this.noise(0.2, 'bandpass', 2600, 1500, 0.1, 1.5, 0.04);
    for (let i = 0; i < 5; i++) this.tick(3800 + Math.random() * 3500, 0.06, 0.04 + Math.random() * 0.26, 0.015, 8);       // buckles and mail
    this.tone('sine', 95, 45, 0.14, 0.3, 0.2);
  }
  step(heavy = false) {
    if (!this._ok('step', 0.12)) return;
    const s = this.surface, p = rv(0.3), v = heavy ? 1.9 : 1;
    if (s === 'stone') { this.noise(0.035, 'bandpass', 1900 * p, 900, 0.16 * v, 1.2); this.tone('sine', 150 * p, 70, 0.07, 0.14 * v); this.noise(0.09, 'lowpass', 700, 200, 0.08 * v, 1, 0.01, this.sys.reverb); }
    else if (s === 'mud') { this.noise(0.09, 'lowpass', 650 * p, 160, 0.17 * v); this.noise(0.07, 'bandpass', 500, 1300 * p, 0.06 * v, 3, 0.05); }                      // press, then suck
    else { this.noise(0.08, 'lowpass', 800 * p, 200, 0.12 * v); this.noise(0.11, 'highpass', 4200 * p, 2600, 0.035 * v, 0.7, 0.01); }                                     // turf and dry stalks
    if (heavy) this.tone('sine', 70, 34, 0.2, 0.3); else if (Math.random() < 0.6) this.tick(4200 + Math.random() * 3000, 0.022, 0.02 + Math.random() * 0.05, 0.012, 9);
  }

  // ---------- voices ----------
  hurt() { this.voice(0.26, [[0, 205 * rv(), 720, 1150], [0.4, 180, 640, 1050], [1, 118, 480, 900]], 0.5, { attack: 0.015, breath: 0.35, fry: 0.3 }); this.noise(0.16, 'bandpass', 700, 240, 0.4, 0.7); }
  die() {
    this.voice(1.5, [[0, 170, 700, 1100], [0.3, 140, 560, 950], [1, 62, 330, 720]], 0.45, { attack: 0.04, breath: 0.4, fry: 0.6, wet: 0.5 });
    this.tone('sine', 80, 28, 1.8, 0.6); this.noise(1.4, 'lowpass', 1200, 60, 0.35);
  }
  groan(pitch = 1, vol = 0.22) {
    if (!this._ok('groan', 0.35)) return;
    const f = (72 + Math.random() * 30) * pitch, d = 0.75 + Math.random() * 0.6, up = Math.random() < 0.5;
    this.voice(d, [[0, f, 420, 820], [0.45, f * (up ? 1.18 : 0.9), 640, 1060], [1, f * 0.72, 330, 700]], vol * 2.1, { attack: 0.12, fry: 0.85, breath: 0.3, wet: 0.25, detune: 22 });
  }
  screech(vol = 0.25) {
    if (!this._ok('screech', 0.3)) return;
    const f = 760 * rv(0.25);
    this.voice(0.42, [[0, f, 1500, 2700], [0.35, f * 1.65, 2100, 3400], [1, f * 0.8, 1300, 2500]], vol * 1.6, { attack: 0.02, fry: 0.5, vib: 60, vibRate: 43, breath: 0.6, f3: 4200, wet: 0.3 });
    this.noise(0.4, 'bandpass', 2600, 4200, vol * 0.7, 3);
  }
  wail(vol = 0.2) {
    if (!this._ok('wail', 0.6)) return;
    const f = 430 * rv(0.12);
    this.voice(1.25, [[0, f, 620, 1100], [0.4, f * 1.55, 850, 1300], [0.75, f * 1.4, 800, 1250], [1, f * 1.1, 500, 950]], vol * 2.2, { attack: 0.3, vib: 9, vibRate: 5.6, breath: 0.2, wet: 0.9, detune: 9 });
    this.voice(1.25, [[0, f * 1.5, 700, 1200], [0.4, f * 2.33, 900, 1400], [1, f * 1.65, 600, 1000]], vol, { attack: 0.4, vib: 12, vibRate: 5.1, breath: 0.1, wet: 0.9 });
  }
  roar(vol = 0.6, low = 1) {
    const c = this.c, t = c.currentTime, d = 2.0;
    const ws = c.createWaveShaper(); const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4.5); } ws.curve = curve;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.14); g.gain.linearRampToValueAtTime(vol * 0.7, t + d * 0.6); g.gain.linearRampToValueAtTime(0, t + d);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(450, t); f.frequency.linearRampToValueAtTime(1900, t + 0.4); f.frequency.linearRampToValueAtTime(380, t + d);
    const mouth = c.createBiquadFilter(); mouth.type = 'peaking'; mouth.Q.value = 3; mouth.gain.value = 10; mouth.frequency.setValueAtTime(380, t); mouth.frequency.linearRampToValueAtTime(900, t + 0.5); mouth.frequency.linearRampToValueAtTime(420, t + d);
    for (const fr of [52, 78, 104.5, 157]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(fr * low * 1.3, t); o.frequency.exponentialRampToValueAtTime(fr * low * 0.72, t + d);
      const lf = c.createOscillator(); lf.frequency.value = 23 + Math.random() * 9; const lg = c.createGain(); lg.gain.value = fr * 0.13;
      lf.connect(lg); lg.connect(o.frequency); lf.start(t); lf.stop(t + d);
      const og = c.createGain(); og.gain.value = 0.28; o.connect(og); og.connect(ws); o.start(t); o.stop(t + d);
    }
    ws.connect(f); f.connect(mouth); mouth.connect(g); g.connect(this.out); const w = c.createGain(); w.gain.value = 0.8; g.connect(w); w.connect(this.sys.reverb);
    this.noise(d, 'bandpass', 500, 1500, vol * 0.5, 0.6); this.tone('sine', 46 * low, 30, d * 0.8, vol * 0.7, 0, 0.1);
    this.sys.duck(0.5, 1.0);
  }

  // ---------- sorcery ----------
  cast() { this.tone('sine', 300, 900, 0.5, 0.18, 0, 0.2); this.tone('sine', 451, 1352, 0.5, 0.08, 0, 0.25); this.noise(0.55, 'bandpass', 1200, 3400, 0.14, 5); this.noise(0.5, 'highpass', 7000, 9000, 0.04, 1, 0.1, this.sys.reverb); }
  orb() { if (!this._ok('orb', 0.08)) return; const p = rv(0.2); this.tone('triangle', 620 * p, 240, 0.25, 0.2); this.noise(0.2, 'bandpass', 2400, 700, 0.18, 2); this.tone('sine', 140, 60, 0.12, 0.25); }
  erupt() { if (!this._ok('erupt', 0.07)) return; this.noise(0.55, 'lowpass', 2600, 110, 0.6); this.tone('sine', 120 * rv(0.2), 34, 0.55, 0.65); this.noise(0.5, 'bandpass', 900, 2800, 0.16, 1.5, 0.03); for (let i = 0; i < 5; i++) this.tick(1500 + Math.random() * 3000, 0.09, 0.1 + Math.random() * 0.4, 0.02); }
  beam() { this.tone('sawtooth', 110, 104, 2.3, 0.2, 0, 0.2); this.tone('sawtooth', 165.5, 156, 2.3, 0.1, 0, 0.2); this.tone('square', 880, 820, 2.3, 0.045, 0, 0.3); this.noise(2.3, 'bandpass', 3000, 2400, 0.2, 2); this.noise(2.3, 'lowpass', 180, 120, 0.3); }
  whisper() {
    if (!this._ok('whisper', 2)) return;
    const w = this.sys.reverb;
    for (let i = 0; i < 7; i++) { const d = i * 0.19 + Math.random() * 0.08, f = 1500 + Math.random() * 2200; this.noise(0.12 + Math.random() * 0.12, 'bandpass', f, f * (0.7 + Math.random() * 0.7), 0.09, 7, d); this.noise(0.2, 'bandpass', f, f, 0.05, 7, d, w); }
  }

  // ---------- things and places ----------
  pickup() { for (const [f, d, a] of [[880, 0, 0.13], [1320, 0.09, 0.11], [1760, 0.18, 0.09], [2640, 0.27, 0.05]]) this.tone('sine', f, f, 0.6 + d, a, d, 0.005); this.noise(0.5, 'highpass', 8000, 11000, 0.025, 1, 0.1, this.sys.reverb); }
  silver() { if (!this._ok('silver', 0.05)) return; const f = 2300 + Math.random() * 900; this.ring(f, [[1, 0.6, 0.22], [2.7, 0.3, 0.12]], 0.12, 1, 0, 0.3); }
  page() { this.noise(0.24, 'highpass', 2200, 4800, 0.2); this.noise(0.1, 'bandpass', 1500, 900, 0.14, 1, 0.13); for (let i = 0; i < 3; i++) this.tick(3000 + Math.random() * 2500, 0.05, 0.03 + i * 0.06, 0.02, 2); }
  kindle() {
    this.noise(0.9, 'bandpass', 400, 2400, 0.3, 0.8); for (let i = 0; i < 9; i++) this.tick(1200 + Math.random() * 3000, 0.1, 0.1 + Math.random() * 0.9, 0.01);
    for (const [m, d] of [[62, 0], [69, 0.12], [74, 0.24], [77, 0.36]]) { this.tone('sine', mtof(m), mtof(m), 1.8, 0.1, d, 0.05); this.tone('sine', mtof(m + 12), mtof(m + 12), 1.2, 0.03, d, 0.05, this.sys.reverb); }
  }
  drink() { for (let i = 0; i < 3; i++) { this.tone('sine', (300 + i * 60) * rv(), 170, 0.12, 0.2, i * 0.17); this.noise(0.05, 'bandpass', 700, 1500, 0.08, 4, i * 0.17 + 0.03); } this.tone('sine', 660, 990, 0.7, 0.09, 0.55, 0.2); this.voice(0.3, [[0, 120, 500, 900], [1, 100, 420, 800]], 0.12, { delay: 0.62, breath: 1.2, attack: 0.08 }); }
  buff() { for (const [m, d] of [[74, 0], [77, 0.08], [81, 0.16], [86, 0.26]]) { this.tone('sine', mtof(m), mtof(m), 1.6, 0.11, d, 0.04); this.tone('triangle', mtof(m) * 2.005, mtof(m) * 2, 1.2, 0.02, d, 0.04, this.sys.reverb); } this.noise(1.2, 'highpass', 5000, 9000, 0.06); }
  levelUp() { for (const [m, d] of [[62, 0], [66, 0.1], [69, 0.2], [74, 0.3], [78, 0.42]]) { this.tone('triangle', mtof(m), mtof(m), 1.3, 0.11, d, 0.02); this.tone('sine', mtof(m - 12), mtof(m - 12), 1.3, 0.06, d, 0.04); } this.noise(1, 'highpass', 6000, 10000, 0.03, 1, 0.3, this.sys.reverb); }
  deny() { this.tone('square', 140, 110, 0.14, 0.1); this.tone('square', 105, 82, 0.16, 0.07, 0.02); }
  bell(vol = 0.5) {
    this.ring(98, [[1, 1, 7], [2, 0.9, 6], [2.38, 0.5, 4.5], [3, 0.4, 3.5], [4, 0.5, 3], [5.02, 0.25, 2.2], [6.02, 0.2, 1.6], [8.2, 0.1, 1]], vol * 0.6, 1, 0, 0.9);
    this.noise(0.05, 'bandpass', 2200, 900, vol * 0.5); this.tone('sine', 98, 96, 3, vol * 0.25, 0, 0.01);
  }
  chainBreak() { this.clang(); this.noise(0.6, 'highpass', 3000, 900, 0.3, 1, 0.1); this.thud(0.9); for (let i = 0; i < 9; i++) this.ring(1400 + Math.random() * 2600, [[1, 0.6, 0.18], [2.6, 0.3, 0.1]], 0.1, 1, 0.12 + i * 0.055 + Math.random() * 0.03, 0.4); }
  heartbeat(vol = 0.5) { this.tone('sine', 62, 34, 0.22, vol); this.noise(0.05, 'lowpass', 200, 80, vol * 0.5); this.tone('sine', 56, 30, 0.26, vol * 0.8, 0.26); this.noise(0.05, 'lowpass', 180, 70, vol * 0.4, 1, 0.26); }
  bossDie() { this.roar(0.7, 0.7); this.tone('sine', 55, 22, 3.5, 0.7); this.noise(3, 'lowpass', 3000, 60, 0.45); this.noise(2.5, 'highpass', 4000, 9000, 0.05, 1, 0.5, this.sys.reverb); }

  /** The Shepherd's Lament, as played in the field. Returns a handle so a blow can cut it short. */
  fluteSong() {
    const c = this.c, g = c.createGain(); g.gain.value = 1;
    g.connect(this.out); const rv2 = c.createGain(); rv2.gain.value = 0.8; g.connect(rv2); rv2.connect(this.sys.reverb);
    let t = c.currentTime + 0.12;
    for (const [m, d] of [[69, 0.34], [74, 0.34], [76, 0.2], [77, 0.5], [76, 0.34], [74, 0.2], [73, 0.22], [74, 0.7]]) { fluteNote(this.sys, t, m, d * 0.92, g, 0.34); t += d; }
    this.sys.duck(0.55, 3);
    return { stop: () => { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0, n, 0.03); this.tone('sine', 1500, 500, 0.12, 0.12); } };
  }
}
