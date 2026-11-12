// Adaptive score. One step sequencer drives every layer; game state only changes
// which layers are audible, the tempo, and the harmony — so exploration bleeds into
// combat and back without a seam. The Shepherd's Lament is the leitmotif: plucked
// in the village, played by the hero's flute, and twisted into the priest's theme.
import { mtof, fluteNote } from './audio.js';
import { damp, rng } from '../core/util.js';

const CH = {
  Dm: [50, 53, 57], Bb: [46, 50, 53], Gm: [43, 46, 50], A: [45, 49, 52],
  C: [48, 52, 55], F: [53, 57, 60],
};
const PROG = {
  explore: ['Dm', 'Dm', 'Bb', 'A', 'Gm', 'Gm', 'A', 'A'],
  mini: ['Dm', 'C', 'Bb', 'A', 'Dm', 'C', 'Bb', 'A'],
  boss: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'F', 'C', 'A'],
};
// [midi, length in 16ths]
const LAMENT = [[69, 4], [74, 4], [76, 2], [77, 6], [76, 4], [74, 2], [73, 2], [74, 8], [77, 4], [79, 2], [81, 6], [79, 2], [77, 2], [76, 6], [74, 2], [73, 8]];
const THEME = [[74, 6], [69, 2], [74, 4], [76, 4], [77, 8], [76, 4], [74, 4], [79, 6], [77, 2], [76, 4], [74, 4], [73, 8], [76, 4], [69, 4],
  [74, 4], [77, 4], [81, 8], [81, 4], [79, 4], [77, 4], [72, 4], [79, 8], [76, 4], [79, 4], [81, 6], [79, 2], [76, 4], [73, 4]];
function layout(seq) { const m = new Map(); let s = 0; for (const n of seq) { m.set(s, n); s += n[1]; } return m; }
const LAMENT_AT = layout(LAMENT), THEME_AT = layout(THEME);

const VOL = { amb: 0.5, pad: 0.55, choir: 0.5, organ: 0.5, pluck: 0.8, ost: 0.55, brass: 0.5, lead: 0.6, drums: 0.9, perc: 0.5, bell: 0.6, flute: 0.7 };
const REV = { amb: 0, pad: 0.5, choir: 0.8, organ: 0.6, pluck: 0.7, ost: 0.25, brass: 0.5, lead: 0.55, drums: 0.3, perc: 0.3, bell: 0.9, flute: 0.8 };

const STATES = {
  silence: { bpm: 66, prog: 'explore', lv: {} },
  explore: { bpm: 66, prog: 'explore', lv: { amb: 1, pad: 0.8, pluck: 1, bell: 0.5, choir: 0.22 } },
  combat: { bpm: 98, prog: 'explore', lv: { amb: 0.5, pad: 0.7, pluck: 0.35, drums: 0.75, ost: 0.8, choir: 0.35 } },
  miniboss: { bpm: 114, prog: 'mini', lv: { pad: 0.5, drums: 1, perc: 1, ost: 1, brass: 1, choir: 0.6, bell: 0.5 } },
  boss: { bpm: 126, prog: 'boss', lv: { organ: 1, choir: 0.85, drums: 1, ost: 0.9, brass: 0.6, lead: 1, bell: 1 } },
  boss2: { bpm: 140, prog: 'boss', tr: 2, lv: { organ: 1, choir: 1, drums: 1, perc: 1, ost: 1, brass: 1, lead: 1, bell: 1 } },
  finale: { bpm: 60, prog: 'explore', lv: { amb: 1, pad: 0.35, choir: 0.5 } },
  ending: { bpm: 60, prog: 'explore', lv: { amb: 0.5, pad: 0.7, pluck: 0.5, choir: 0.4, flute: 1 } },
  doom: { bpm: 60, prog: 'explore', lv: { amb: 1, organ: 0.5, bell: 1, choir: 0.6 } },
};

export class Music {
  constructor(sys) {
    this.sys = sys; const c = this.c = sys.ctx;
    this.bus = {}; this.lv = {};
    for (const n of Object.keys(VOL)) {
      const g = c.createGain(); g.gain.value = 0; g.connect(sys.musicBus);
      if (REV[n] > 0) { const s = c.createGain(); s.gain.value = REV[n]; g.connect(s); s.connect(sys.reverb); }
      this.bus[n] = g; this.lv[n] = 0;
    }
    this.state = 'silence'; this.bpm = 66; this.step = 0; this.next = 0;
    this.prog = 'explore'; this.tr = 0; this.rnd = rng(77);
    this.organWave = c.createPeriodicWave(new Float32Array(9), new Float32Array([0, 1, 0.55, 0.35, 0.3, 0.05, 0.18, 0, 0.12]));
    this.ks = new Map();
    this._wind();
  }

  setState(s) { if (STATES[s] && s !== this.state) this.state = s; }

  update(dt) {
    const c = this.c, now = c.currentTime, S = STATES[this.state];
    this.bpm = damp(this.bpm, S.bpm, 1.1, dt);
    for (const n in this.bus) {
      const tgt = S.lv[n] || 0;
      this.lv[n] = damp(this.lv[n], tgt, tgt > this.lv[n] ? 1.6 : 0.6, dt);
      this.bus[n].gain.setTargetAtTime(this.lv[n] * VOL[n], now, 0.06);
    }
    if (this.next < now - 0.4) this.next = now + 0.05;
    let guard = 0;
    while (this.next < now + 0.2 && guard++ < 16) {
      this._step(this.step, this.next);
      this.next += 60 / this.bpm / 4; this.step++;
    }
  }

  _step(step, t) {
    const st = step & 15, bar = (step >> 4) & 7, L = this.lv, s16 = 60 / this.bpm / 4, barDur = s16 * 16;
    const S = STATES[this.state], mode = this.state, R = this.rnd;
    if (st === 0) { this.prog = S.prog; this.tr = S.tr || 0; }
    const tr = this.tr;
    const ch = CH[PROG[this.prog][bar]].map((n) => n + tr), root = ch[0];
    const heavy = mode === 'boss' || mode === 'boss2' || mode === 'miniboss';

    if (st === 0) {
      if (L.pad > 0.03) this.pad(t, ch, barDur);
      if (L.choir > 0.03) this.choir(t, mode === 'boss2' ? [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24] : [ch[0] + 12, ch[1] + 12, ch[2] + 12], barDur);
      if (L.organ > 0.03) this.organ(t, [root - 12, ch[0], ch[1], ch[2], ch[0] + 12], barDur);
      if (L.bell > 0.03 && (bar & 3) === 0 && (heavy || R() < 0.55)) this.bell(t, 50 + tr, heavy ? 0.5 : 0.3);
    }

    if (L.pluck > 0.03) {
      const cyc = (step >> 7) & 1;
      if (cyc === 0 && bar < 4) { const n = LAMENT_AT.get(bar * 16 + st); if (n) this.pluck(t, n[0] - 12, 0.8); }
      else if ((st & 3) === 0 && R() < 0.3) { const n = ch[(R() * 3) | 0] + (R() < 0.5 ? 12 : 24); this.pluck(t, n, 0.45); if (R() < 0.35) this.pluck(t + s16 * 2, n + (R() < 0.5 ? -2 : 3), 0.25); }
      if (st === 0 && (bar & 1) === 0) this.pluck(t, root - 12, 0.5);
    }

    if (L.flute > 0.03) { const n = LAMENT_AT.get((bar & 3) * 16 + st); if (n) fluteNote(this.sys, t, n[0], n[1] * s16 * 0.92, this.bus.flute, 0.3); }

    if (L.ost > 0.03) {
      if (!heavy) { if ((st & 1) === 0) { const p = [ch[0], ch[0], ch[2], ch[0], ch[0] + 12, ch[0], ch[2], ch[1]][st >> 1]; this.ost(t, p - 12, s16 * 1.6, st === 0 ? 0.3 : 0.2); } }
      else { const p = [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 12, 7, 3][st]; this.ost(t, root - 12 + (p === 3 ? ch[1] - ch[0] : p), s16 * 1.2, (st & 3) === 0 ? 0.3 : 0.17); }
    }

    if (L.drums > 0.03) {
      if (mode === 'combat' || (!heavy && L.drums > 0.03)) {
        if (st === 0 || st === 6 || st === 10) this.boom(t, st === 0 ? 0.8 : 0.5);
        if (st === 3 || st === 8 || st === 14) this.tom(t, st === 8 ? 130 : 100, 0.35);
        if ((st & 3) === 2) this.hat(t, 0.1);
      } else if (mode === 'miniboss') {
        // a heartbeat: lub-dub, lub-dub — the seal is bound to it
        if (st === 0 || st === 8) this.boom(t, 0.95); if (st === 3 || st === 11) this.boom(t, 0.6);
        if (st === 4 || st === 12) this.snare(t, 0.45);
        if (st === 6 || st === 14 || st === 15) this.tom(t, st === 15 ? 150 : 110, 0.4);
        if ((bar & 3) === 3 && st >= 12) this.tom(t, 90 + (st - 12) * 22, 0.45);
      } else {
        const fast = mode === 'boss2';
        if ([0, 3, 6, 8, 11, 14].includes(st) || (fast && (st === 2 || st === 10))) this.boom(t, (st & 7) === 0 ? 1 : 0.6);
        if (st === 4 || st === 12) this.snare(t, 0.55);
        if (fast && (st & 1)) this.tom(t, 180, 0.14);
        if ((bar & 3) === 3 && st >= 8 && (st & 1) === 0) this.tom(t, 80 + (st - 8) * 14, 0.5);
        if ((bar & 3) === 3 && st >= 12) this.snare(t, 0.3 + (st - 12) * 0.08);
      }
    }
    if (L.perc > 0.03) {
      if (mode === 'miniboss') { if (st === 4 || st === 12) this.anvil(t, 0.3); if (st === 10 && (bar & 1)) this.anvil(t, 0.18); }
      else { this.hat(t, (st & 3) === 0 ? 0.16 : 0.08); if (st === 12 && (bar & 1)) this.anvil(t, 0.2); }
    }

    if (L.brass > 0.03 && heavy) {
      const hits = mode === 'miniboss' ? [0, 6, 12] : [0, 10];
      if (hits.includes(st)) this.brass(t, [root, ch[2], root + 12], s16 * (st === 0 ? 5 : 3), st === 0 ? 0.11 : 0.075);
    }

    if (L.lead > 0.03) { const n = THEME_AT.get(bar * 16 + st); if (n) this.lead(t, n[0] + tr, n[1] * s16); }
  }

  // ---- instruments ----
  _osc(type, f, t, end, det = 0) {
    const o = this.c.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.value = f; o.detune.value = det; o.start(t); o.stop(end); return o;
  }
  _env(t, a, peak, hold, r) {
    const g = this.c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + Math.max(0, hold)); g.gain.linearRampToValueAtTime(0, t + a + Math.max(0, hold) + r);
    return g;
  }
  _noise(t, dur) { const s = this.c.createBufferSource(); s.buffer = this.sys.noiseBuf; s.loop = true; s.start(t, Math.random()); s.stop(t + dur); return s; }
  _filter(type, f, q = 0.7) { const b = this.c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

  pad(t, ch, dur) {
    const f = this._filter('lowpass', 650), g = this._env(t, dur * 0.4, 0.06, dur * 0.4, dur * 0.6);
    f.connect(g); g.connect(this.bus.pad);
    for (const n of [ch[0] - 12, ...ch]) for (const d of [-8, 7]) this._osc('sawtooth', mtof(n), t, t + dur * 1.5, d).connect(f);
  }
  choir(t, notes, dur) {
    for (const n of notes) {
      const g = this._env(t, 0.55, 0.11, dur - 0.7, 0.9); g.connect(this.bus.choir);
      const lfo = this._osc('sine', 4.8 + Math.random(), t, t + dur + 1); const lg = this.c.createGain(); lg.gain.value = 7; lfo.connect(lg);
      const os = [this._osc('sawtooth', mtof(n), t, t + dur + 1, -6), this._osc('sawtooth', mtof(n), t, t + dur + 1, 6)];
      for (const o of os) lg.connect(o.detune);
      for (const [fq, q, a] of [[640, 6, 1], [1080, 8, 0.5], [2650, 9, 0.16]]) {
        const bp = this._filter('bandpass', fq, q), ga = this.c.createGain(); ga.gain.value = a;
        for (const o of os) o.connect(bp); bp.connect(ga); ga.connect(g);
      }
    }
  }
  organ(t, notes, dur) {
    const g = this._env(t, 0.03, 0.055, dur - 0.08, 0.14); g.connect(this.bus.organ);
    for (const n of notes) this._osc(this.organWave, mtof(n), t, t + dur + 0.2).connect(g);
  }
  _ks(midi) {
    let b = this.ks.get(midi); if (b) return b;
    const sr = this.c.sampleRate, N = Math.max(2, Math.round(sr / mtof(midi))), len = (sr * 2.6) | 0;
    b = this.c.createBuffer(1, len, sr); const d = b.getChannelData(0), ring = new Float32Array(N);
    let p = 0; for (let i = 0; i < N; i++) { p += ((Math.random() * 2 - 1) - p) * 0.6; ring[i] = p; }
    for (let i = 0; i < len; i++) { const k = i % N; d[i] = ring[k]; ring[k] = (ring[k] + ring[(k + 1) % N]) * 0.4985; }
    this.ks.set(midi, b); return b;
  }
  pluck(t, midi, vol) {
    const s = this.c.createBufferSource(); s.buffer = this._ks(midi + this.tr);
    const g = this.c.createGain(); g.gain.value = vol; s.connect(g); g.connect(this.bus.pluck); s.start(t);
  }
  ost(t, midi, dur, vol) {
    const f = this._filter('lowpass', 2200, 1.5); f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(420, t + dur);
    const g = this.c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.setTargetAtTime(0, t + 0.02, dur * 0.45);
    f.connect(g); g.connect(this.bus.ost);
    for (const d of [-9, 9]) this._osc('sawtooth', mtof(midi), t, t + dur * 3, d).connect(f);
  }
  brass(t, notes, dur, vol) {
    const f = this._filter('lowpass', 300, 2);
    f.frequency.setValueAtTime(280, t); f.frequency.linearRampToValueAtTime(2300, t + 0.07); f.frequency.setTargetAtTime(800, t + 0.08, 0.16);
    const g = this._env(t, 0.03, vol, dur, 0.16); f.connect(g); g.connect(this.bus.brass);
    for (const n of notes) for (const d of [-11, 0, 10]) this._osc('sawtooth', mtof(n), t, t + dur + 0.3, d).connect(f);
  }
  lead(t, midi, dur) {
    const f = this._filter('lowpass', 3200), g = this._env(t, 0.03, 0.1, dur - 0.06, 0.12); f.connect(g); g.connect(this.bus.lead);
    const os = [this._osc(this.organWave, mtof(midi), t, t + dur + 0.2), this._osc(this.organWave, mtof(midi - 12), t, t + dur + 0.2), this._osc('sawtooth', mtof(midi), t, t + dur + 0.2, 6)];
    const gs = [1, 0.7, 0.35];
    const lfo = this._osc('sine', 5.5, t, t + dur + 0.2), lg = this.c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(9, t + Math.min(dur, 0.4)); lfo.connect(lg);
    os.forEach((o, i) => { lg.connect(o.detune); const gg = this.c.createGain(); gg.gain.value = gs[i]; o.connect(gg); gg.connect(f); });
  }
  boom(t, vol) {
    const o = this.c.createOscillator(); o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.22);
    const g = this.c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g); g.connect(this.bus.drums); o.start(t); o.stop(t + 0.65);
    const n = this._noise(t, 0.12), f = this._filter('lowpass', 480), ng = this.c.createGain(); ng.gain.setValueAtTime(vol * 0.6, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    n.connect(f); f.connect(ng); ng.connect(this.bus.drums);
  }
  tom(t, fq, vol) {
    const o = this.c.createOscillator(); o.frequency.setValueAtTime(fq, t); o.frequency.exponentialRampToValueAtTime(fq * 0.55, t + 0.18);
    const g = this.c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.bus.drums); o.start(t); o.stop(t + 0.32);
  }
  snare(t, vol) {
    const n = this._noise(t, 0.2), f = this._filter('bandpass', 1500, 0.7), g = this.c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
    n.connect(f); f.connect(g); g.connect(this.bus.drums); this.tom(t, 190, vol * 0.5);
  }
  hat(t, vol) {
    const n = this._noise(t, 0.06), f = this._filter('highpass', 8000), g = this.c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    n.connect(f); f.connect(g); g.connect(this.bus.perc.gain.value > 0.01 ? this.bus.perc : this.bus.drums);
  }
  anvil(t, vol) {
    for (const [r, d] of [[1, 0.5], [2.76, 0.32], [5.4, 0.2], [8.93, 0.1]]) {
      const o = this._osc('triangle', 620 * r, t, t + d + 0.05), g = this.c.createGain(); g.gain.setValueAtTime(vol / Math.sqrt(r), t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(this.bus.perc);
    }
  }
  bell(t, midi, vol) {
    const f0 = mtof(midi);
    for (const [r, a, d] of [[0.5, 1, 7], [1, 0.9, 6], [1.19, 0.5, 4.5], [1.5, 0.4, 3.5], [2, 0.5, 3], [2.51, 0.25, 2.2], [3.01, 0.2, 1.6], [4.1, 0.1, 1]]) {
      const o = this._osc('sine', f0 * r, t, t + d), g = this.c.createGain(); g.gain.setValueAtTime(a * vol * 0.3, t); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
      o.connect(g); g.connect(this.bus.bell);
    }
  }
  _wind() {
    const c = this.c;
    const s = c.createBufferSource(); s.buffer = this.sys.noiseBuf; s.loop = true;
    const bp = this._filter('bandpass', 420, 0.9), g = c.createGain(); g.gain.value = 0.22;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.11; const lg = c.createGain(); lg.gain.value = 240; lfo.connect(lg); lg.connect(bp.frequency);
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.07; const lg2 = c.createGain(); lg2.gain.value = 0.12; lfo2.connect(lg2); lg2.connect(g.gain);
    s.connect(bp); bp.connect(g); g.connect(this.bus.amb);
    const lp = this._filter('lowpass', 110), g2 = c.createGain(); g2.gain.value = 0.5; s.connect(lp); lp.connect(g2); g2.connect(this.bus.amb);
    s.start(); lfo.start(); lfo2.start();
  }
}
