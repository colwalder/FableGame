// All sound in the game is synthesised at runtime with WebAudio — no samples.
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function impulse(c, secs, decay) {
  const n = (c.sampleRate * secs) | 0;
  const b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const w = Math.random() * 2 - 1;
      lp += (w - lp) * (0.75 - k * 0.55);          // darker tail, like stone and old timber
      d[i] = lp * Math.pow(1 - k, decay);
    }
  }
  return b;
}
function noiseBuffer(c, secs) {
  const n = (c.sampleRate * secs) | 0;
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
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
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 0.985, t); o.frequency.linearRampToValueAtTime(f, t + 0.06);
  const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
  const g2 = c.createGain(); g2.gain.value = 0.14;
  const lfo = c.createOscillator(); lfo.frequency.value = 5.1;
  const lg = c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.45));
  lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
  o.connect(g); o2.connect(g2); g2.connect(g);
  const n = c.createBufferSource(); n.buffer = sys.noiseBuf; n.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 1.5;
  const ng = c.createGain(); ng.gain.setValueAtTime(0.5, t); ng.gain.linearRampToValueAtTime(0.12, t + 0.12);
  n.connect(bp); bp.connect(ng); ng.connect(g);
  const end = t + dur + 0.2;
  o.start(t); o2.start(t); lfo.start(t); n.start(t, Math.random());
  o.stop(end); o2.stop(end); lfo.stop(end); n.stop(end);
}

export class AudioSys {
  constructor() {
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = c.createGain(); this.master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
    this.master.connect(comp); comp.connect(c.destination);
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 1024; comp.connect(this.analyser);
    this.reverb = c.createConvolver(); this.reverb.buffer = impulse(c, 3.6, 2.4);
    const rg = c.createGain(); rg.gain.value = 0.55; this.reverb.connect(rg); rg.connect(this.master);
    this.noiseBuf = noiseBuffer(c, 2);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.62; this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.85; this.sfxBus.connect(this.master);
    const sr = c.createGain(); sr.gain.value = 0.22; this.sfxBus.connect(sr); sr.connect(this.reverb);
    this.sfx = new Sfx(this);
  }
  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }
  /** Peak output level (debug / tests). */
  level() {
    const a = new Float32Array(this.analyser.fftSize); this.analyser.getFloatTimeDomainData(a);
    let p = 0; for (const v of a) p = Math.max(p, Math.abs(v)); return p;
  }
}

export class Sfx {
  constructor(sys) { this.sys = sys; this.c = sys.ctx; this.out = sys.sfxBus; this.last = {}; }

  /** Rate limit by name so twenty husks don't all scream on one frame. */
  _ok(name, gap) { const t = this.c.currentTime; if (t - (this.last[name] || -9) < gap) return false; this.last[name] = t; return true; }

  noise(dur, type, f0, f1, vol, q = 1, delay = 0) {
    const c = this.c, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.sys.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.2)); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(type, f0, f1, dur, vol, delay = 0, attack = 0.005) {
    const c = this.c, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  whoosh(big = false) { this.noise(big ? 0.42 : 0.26, 'bandpass', big ? 260 : 480, big ? 1500 : 2600, big ? 0.55 : 0.36, 1.3); }
  hit(big = false) {
    this.noise(0.13, 'lowpass', 2800, 260, 0.75);
    this.tone('sine', big ? 130 : 170, 42, big ? 0.3 : 0.2, 0.8);
    this.tone('square', 760, 180, 0.05, 0.12);
    if (big) this.noise(0.3, 'lowpass', 600, 80, 0.5);
  }
  flesh() { this.noise(0.11, 'bandpass', 900, 300, 0.55, 0.8); this.tone('sine', 110, 50, 0.14, 0.5); }
  clang() { for (const [f, d] of [[820, 0.5], [1970, 0.35], [3140, 0.22], [4480, 0.14]]) this.tone('triangle', f, f * 0.99, d, 0.16); this.noise(0.05, 'highpass', 5000, 3000, 0.3); }
  thud(vol = 0.8) { this.tone('sine', 85, 30, 0.45, vol); this.noise(0.25, 'lowpass', 500, 60, vol * 0.7); }
  roll() { this.noise(0.3, 'lowpass', 900, 250, 0.3); this.noise(0.08, 'bandpass', 2500, 1800, 0.1, 2, 0.05); }
  step(heavy = false) { if (!this._ok('step', 0.12)) return; this.noise(0.07, 'lowpass', heavy ? 500 : 800, 200, heavy ? 0.22 : 0.12); }
  hurt() { this.noise(0.18, 'bandpass', 700, 250, 0.6, 0.7); this.tone('sawtooth', 210, 120, 0.22, 0.22); }
  die() { this.tone('sawtooth', 160, 45, 1.4, 0.3); this.tone('sine', 80, 28, 1.8, 0.6); this.noise(1.4, 'lowpass', 1200, 60, 0.4); }
  groan(pitch = 1, vol = 0.22) {
    if (!this._ok('groan', 0.35)) return;
    const c = this.c, t = c.currentTime, d = 0.7 + Math.random() * 0.5;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const f0 = (70 + Math.random() * 30) * pitch;
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.5), t + d);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(820, t + d * 0.5); f.frequency.linearRampToValueAtTime(380, t + d);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.12); g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(f); f.connect(g); g.connect(this.out); o.start(t); o.stop(t + d + 0.05);
  }
  screech(vol = 0.25) {
    if (!this._ok('screech', 0.3)) return;
    this.tone('sawtooth', 900, 1500, 0.35, vol * 0.5); this.tone('square', 1320, 640, 0.4, vol * 0.3); this.noise(0.4, 'bandpass', 2500, 4000, vol, 3);
  }
  wail(vol = 0.2) {
    if (!this._ok('wail', 0.6)) return;
    const c = this.c, t = c.currentTime;
    for (const m of [1, 1.5]) {
      const o = c.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(440 * m, t); o.frequency.linearRampToValueAtTime(700 * m, t + 0.5); o.frequency.linearRampToValueAtTime(520 * m, t + 1.1);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol / m, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 1.15);
      o.connect(g); g.connect(this.out); g.connect(this.sys.reverb); o.start(t); o.stop(t + 1.2);
    }
  }
  roar(vol = 0.6, low = 1) {
    const c = this.c, t = c.currentTime, d = 1.9;
    const ws = c.createWaveShaper(); const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); } ws.curve = curve;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.15); g.gain.linearRampToValueAtTime(vol * 0.7, t + d * 0.6); g.gain.linearRampToValueAtTime(0, t + d);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1600, t + 0.4); f.frequency.linearRampToValueAtTime(400, t + d);
    for (const fr of [52, 78, 104.5]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(fr * low * 1.3, t); o.frequency.exponentialRampToValueAtTime(fr * low * 0.75, t + d);
      const lf = c.createOscillator(); lf.frequency.value = 23 + Math.random() * 9; const lg = c.createGain(); lg.gain.value = fr * 0.12;
      lf.connect(lg); lg.connect(o.frequency); lf.start(t); lf.stop(t + d);
      const og = c.createGain(); og.gain.value = 0.33; o.connect(og); og.connect(ws); o.start(t); o.stop(t + d);
    }
    ws.connect(f); f.connect(g); g.connect(this.out); g.connect(this.sys.reverb);
    this.noise(d, 'bandpass', 500, 1400, vol * 0.5, 0.6);
  }
  cast() { this.tone('sine', 300, 900, 0.5, 0.2, 0, 0.2); this.noise(0.5, 'bandpass', 1200, 3200, 0.14, 4); }
  orb() { if (!this._ok('orb', 0.08)) return; this.tone('triangle', 620, 240, 0.25, 0.2); this.noise(0.18, 'bandpass', 2400, 800, 0.16, 2); }
  erupt() { if (!this._ok('erupt', 0.07)) return; this.noise(0.5, 'lowpass', 2400, 120, 0.6); this.tone('sine', 120, 36, 0.5, 0.6); }
  beam() { this.tone('sawtooth', 110, 104, 2.3, 0.22, 0, 0.2); this.tone('square', 880, 820, 2.3, 0.05, 0, 0.3); this.noise(2.3, 'bandpass', 3000, 2400, 0.2, 2); }
  pickup() { this.tone('sine', 880, 880, 0.3, 0.14); this.tone('sine', 1320, 1320, 0.45, 0.12, 0.09); this.tone('sine', 1760, 1760, 0.7, 0.09, 0.18); }
  silver() { if (!this._ok('silver', 0.05)) return; this.tone('sine', 2100 + Math.random() * 500, 2000, 0.18, 0.07); }
  page() { this.noise(0.22, 'highpass', 2200, 4500, 0.2); this.noise(0.1, 'bandpass', 1500, 900, 0.14, 1, 0.12); }
  kindle() { this.noise(0.9, 'bandpass', 400, 2400, 0.3, 0.8); for (const [m, d] of [[62, 0], [69, 0.12], [74, 0.24], [77, 0.36]]) this.tone('sine', mtof(m), mtof(m), 1.6, 0.11, d, 0.05); }
  drink() { for (let i = 0; i < 3; i++) this.tone('sine', 300 + i * 60, 180, 0.12, 0.2, i * 0.17); this.tone('sine', 660, 990, 0.7, 0.1, 0.55, 0.2); }
  buff() { for (const [m, d] of [[74, 0], [77, 0.08], [81, 0.16], [86, 0.26]]) this.tone('sine', mtof(m), mtof(m), 1.5, 0.12, d, 0.04); this.noise(1.2, 'highpass', 5000, 9000, 0.06); }
  levelUp() { for (const [m, d] of [[62, 0], [66, 0.1], [69, 0.2], [74, 0.3], [78, 0.42]]) this.tone('triangle', mtof(m), mtof(m), 1.2, 0.12, d, 0.02); }
  deny() { this.tone('square', 140, 110, 0.14, 0.12); }
  bell(vol = 0.5) {
    const f0 = 98;
    for (const [r, a, d] of [[0.5, 1, 7], [1, 0.9, 6], [1.19, 0.5, 4.5], [1.5, 0.4, 3.5], [2, 0.5, 3], [2.51, 0.25, 2.2], [3.01, 0.2, 1.6], [4.1, 0.1, 1]]) {
      const c = this.c, t = c.currentTime;
      const o = c.createOscillator(); o.frequency.value = f0 * r * 2;
      const g = c.createGain(); g.gain.setValueAtTime(a * vol * 0.3, t); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
      o.connect(g); g.connect(this.out); g.connect(this.sys.reverb); o.start(t); o.stop(t + d);
    }
    this.noise(0.04, 'bandpass', 2000, 900, vol * 0.5);
  }
  chainBreak() { this.clang(); this.noise(0.6, 'highpass', 3000, 900, 0.3, 1, 0.1); this.thud(0.9); for (let i = 0; i < 5; i++) this.tone('triangle', 1400 + Math.random() * 1800, 900, 0.12, 0.1, 0.15 + i * 0.07); }
  heartbeat(vol = 0.5) { this.tone('sine', 62, 34, 0.22, vol); this.tone('sine', 56, 30, 0.26, vol * 0.8, 0.26); }
  whisper() { if (!this._ok('whisper', 2)) return; this.noise(1.4, 'bandpass', 2600, 3400, 0.09, 6); this.noise(1.1, 'bandpass', 1700, 2100, 0.07, 8, 0.3); }
  bossDie() { this.roar(0.7, 0.7); this.tone('sine', 55, 22, 3.5, 0.7); this.noise(3, 'lowpass', 3000, 60, 0.45); }

  /** The Shepherd's Lament, as played in the field. Returns a handle so a blow can cut it short. */
  fluteSong() {
    const c = this.c, g = c.createGain(); g.gain.value = 1;
    g.connect(this.out); const rv = c.createGain(); rv.gain.value = 0.7; g.connect(rv); rv.connect(this.sys.reverb);
    let t = c.currentTime + 0.12;
    for (const [m, d] of [[69, 0.34], [74, 0.34], [76, 0.2], [77, 0.5], [76, 0.34], [74, 0.2], [73, 0.22], [74, 0.7]]) { fluteNote(this.sys, t, m, d * 0.92, g, 0.34); t += d; }
    return { stop: () => { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0, n, 0.03); this.tone('sine', 1500, 500, 0.12, 0.12); } };
  }
}
