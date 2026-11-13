// The valley's own voice: gusting wind, the hum of the curse, the stone hush of the nave,
// the nearest fire, and things heard once and far off — a crow, an owl, a wolf, old timber.
import { damp } from '../core/util.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export class Ambience {
  constructor(sys) {
    this.sys = sys; const c = this.c = sys.ctx, out = this.out = sys.ambBus;
    const loop = (buf, rate = 1) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * buf.duration); return s; };
    const filt = (type, f, q = 0.7) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const lfo = (rate, depth, target) => { const o = c.createOscillator(); o.frequency.value = rate; const g = c.createGain(); g.gain.value = depth; o.connect(g); g.connect(target); o.start(); };

    // wind: a broad body, and a thin whistle through the palisade that comes and goes with the gusts
    const wind = loop(sys.pinkBuf);
    const body = filt('bandpass', 380, 0.6), bodyG = this.windG = c.createGain(); bodyG.gain.value = 0;
    lfo(0.09, 190, body.frequency); lfo(0.053, 90, body.frequency);
    this.gust = c.createGain(); this.gust.gain.value = 0.75; lfo(0.07, 0.3, this.gust.gain); lfo(0.19, 0.16, this.gust.gain);
    wind.connect(body); body.connect(this.gust); this.gust.connect(bodyG); bodyG.connect(out);
    const whistle = filt('bandpass', 1150, 14), whG = this.whG = c.createGain(); whG.gain.value = 0;
    lfo(0.13, 260, whistle.frequency); const whA = c.createGain(); whA.gain.value = 0.5; lfo(0.11, 0.5, whA.gain);
    loop(sys.pinkBuf, 1.31).connect(whistle); whistle.connect(whA); whA.connect(whG); whG.connect(out);
    const low = filt('lowpass', 95), lowG = this.lowG = c.createGain(); lowG.gain.value = 0; loop(sys.pinkBuf, 0.7).connect(low); low.connect(lowG); lowG.connect(out);

    // the curse: a detuned drone you feel more than hear, swelling toward the church
    const curseG = this.curseG = c.createGain(); curseG.gain.value = 0; curseG.connect(out);
    const cf = filt('lowpass', 240, 2); cf.connect(curseG); lfo(0.05, 90, cf.frequency);
    for (const f of [36.7, 55.2, 73.9, 110.9]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = c.createGain(); g.gain.value = 0.25; o.connect(g); g.connect(cf); o.start(); lfo(rnd(0.03, 0.09), f * 0.012, o.frequency); }

    // the nave: room tone and a breath of organ pipes with no organist
    const naveG = this.naveG = c.createGain(); naveG.gain.value = 0; naveG.connect(out); const nw = c.createGain(); nw.gain.value = 0.6; naveG.connect(nw); nw.connect(sys.reverb);
    const tone = filt('bandpass', 210, 1.2); loop(sys.pinkBuf, 0.5).connect(tone); tone.connect(naveG);
    for (const f of [73.4, 110, 146.8]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = c.createGain(); g.gain.value = 0.05; lfo(rnd(0.05, 0.12), 0.04, g.gain); o.connect(g); g.connect(naveG); o.start(); }

    // fire: one crackling loop that follows whichever flame is closest
    this.firePan = sys.panner(0, 0, 0, 2.5, 1.6); this.fireG = c.createGain(); this.fireG.gain.value = 0;
    loop(this._crackle()).connect(this.fireG); this.fireG.connect(this.firePan); this.firePan.connect(out);
    const fs = c.createGain(); fs.gain.value = 0.15; this.firePan.connect(fs); fs.connect(sys.reverb);

    this.lv = { wind: 0, curse: 0, nave: 0, fire: 0 };
    this.next = { bird: rnd(6, 14), creak: rnd(4, 9), far: rnd(18, 40), drip: 2, murmur: rnd(10, 20) };
  }

  _crackle() {
    const c = this.c, n = c.sampleRate * 4, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let lp = 0, pop = 0, popF = 0.5;
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.00055) { pop = 0.5 + Math.random(); popF = 0.2 + Math.random() * 0.7; }
      lp += ((Math.random() * 2 - 1) - lp) * 0.04;                          // the low roar of the flame
      const w = Math.random() * 2 - 1; d[i] = lp * 0.5 + w * pop * popF; pop *= 0.992 - popF * 0.03;
    }
    for (let i = 0; i < 2000; i++) { const k = i / 2000; d[i] *= k; d[n - 1 - i] *= k; }
    return b;
  }

  /** A sound somewhere out in the dark, at a bearing and distance from the listener. */
  _far(x, y, z, dist, fn) {
    const a = Math.random() * Math.PI * 2, p = this.sys.panner(x + Math.sin(a) * dist, y + rnd(2, 10), z + Math.cos(a) * dist, 14, 0.8), w = this.c.createGain();
    w.gain.value = 0.9; p.connect(this.out); p.connect(w); w.connect(this.sys.reverb); fn(p, this.c.currentTime + 0.05);
  }
  _env(dest, t, a, peak, d) { const g = this.c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.linearRampToValueAtTime(0, t + d); g.connect(dest); return g; }
  _osc(type, t, d, pts, dest) { const o = this.c.createOscillator(); o.type = type; pts.forEach(([k, f], i) => o.frequency[i ? 'linearRampToValueAtTime' : 'setValueAtTime'](f, t + k * d)); o.connect(dest); o.start(t); o.stop(t + d + 0.05); return o; }

  crow(p, t) {
    const n = 2 + ((Math.random() * 3) | 0), f = rnd(430, 520);
    for (let i = 0; i < n; i++) {
      const s = t + i * rnd(0.27, 0.34), g = this._env(p, s, 0.02, 0.5, 0.2), bp = this.c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.6; bp.connect(g);
      const o = this._osc('sawtooth', s, 0.2, [[0, f * 1.1], [0.3, f], [1, f * 0.78]], bp), am = this.c.createOscillator(), ag = this.c.createGain();
      am.type = 'square'; am.frequency.value = 62; ag.gain.value = f * 0.25; am.connect(ag); ag.connect(o.frequency); am.start(s); am.stop(s + 0.25);
    }
  }
  owl(p, t) {
    const f = rnd(310, 350);
    for (const [s, d] of [[0, 0.22], [0.36, 0.14], [0.56, 0.5]]) { const g = this._env(p, t + s, 0.05, 0.5, d); this._osc('sine', t + s, d, [[0, f * 0.97], [0.3, f], [1, f * 0.93]], g); this._osc('sine', t + s, d, [[0, f * 2], [1, f * 1.9]], this._env(p, t + s, 0.05, 0.05, d)); }
  }
  wolf(p, t) {
    const f = rnd(300, 360), d = rnd(2.4, 3.4), g = this._env(p, t, 0.5, 0.45, d), lp = this.c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300; lp.connect(g);
    for (const m of [1, 2, 3]) { const og = this.c.createGain(); og.gain.value = 0.6 / (m * m); og.connect(lp); this._osc(m === 1 ? 'triangle' : 'sine', t, d, [[0, f * 0.7 * m], [0.22, f * 1.3 * m], [0.7, f * 1.26 * m], [1, f * 0.85 * m]], og); }
  }
  creak(p, t) {
    const d = rnd(0.5, 1.1), f = rnd(110, 210), g = this._env(p, t, 0.08, 0.35, d), bp = this.c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 4.5; bp.Q.value = 5; bp.connect(g);
    const o = this._osc('sawtooth', t, d, [[0, f], [0.5, f * rnd(1.1, 1.35)], [1, f * rnd(0.9, 1.2)]], bp), am = this.c.createOscillator(), ag = this.c.createGain();
    am.type = 'sawtooth'; am.frequency.value = rnd(14, 30); ag.gain.value = f * 0.3; am.connect(ag); ag.connect(o.frequency); am.start(t); am.stop(t + d + 0.05);
  }
  drip(p, t) { const f = rnd(1300, 2300), g = this._env(p, t, 0.004, 0.3, 0.12); this._osc('sine', t, 0.12, [[0, f], [0.25, f * 1.5], [1, f * 0.8]], g); }

  /** s: { x, y, z, cor (0..1), inside, fire: {x,y,z,d} | null, quiet (0..1: combat pushes ambience back) } */
  update(dt, s) {
    const L = this.lv, t = this.c.currentTime, N = this.next, open = s.inside ? 0 : 1;
    L.wind = damp(L.wind, (s.inside ? 0.12 : 1) * (1 - s.quiet * 0.5), 1.2, dt);
    L.curse = damp(L.curse, s.cor * s.cor * (1 - s.quiet * 0.6), 0.8, dt);
    L.nave = damp(L.nave, s.inside ? 1 : 0, 1, dt);
    L.fire = damp(L.fire, s.fire ? Math.max(0, 1 - s.fire.d / 22) : 0, 3, dt);
    this.windG.gain.setTargetAtTime(L.wind * 0.42, t, 0.1); this.whG.gain.setTargetAtTime(L.wind * (0.05 + s.cor * 0.05), t, 0.1); this.lowG.gain.setTargetAtTime(L.wind * 0.5, t, 0.1);
    this.curseG.gain.setTargetAtTime(L.curse * 0.2, t, 0.1); this.naveG.gain.setTargetAtTime(L.nave * 0.5, t, 0.1); this.fireG.gain.setTargetAtTime(L.fire * 0.9, t, 0.05);
    if (s.fire) { const p = this.firePan; if (p.positionX) { p.positionX.setTargetAtTime(s.fire.x, t, 0.08); p.positionY.setTargetAtTime(s.fire.y, t, 0.08); p.positionZ.setTargetAtTime(s.fire.z, t, 0.08); } else p.setPosition(s.fire.x, s.fire.y, s.fire.z); }
    if (s.quiet > 0.5) return;
    // the living things thin out as the corruption deepens; what replaces them is worse
    if (open && (N.bird -= dt) <= 0) { N.bird = rnd(9, 24) * (1 + s.cor * 2); if (s.cor < 0.75) this._far(s.x, s.y, s.z, rnd(25, 60), (p, at) => (Math.random() < 0.35 + s.cor * 0.5 ? this.crow(p, at) : this.owl(p, at))); }
    if (open && (N.far -= dt) <= 0) { N.far = rnd(35, 80); if (s.cor < 0.5) this._far(s.x, s.y, s.z, rnd(70, 110), (p, at) => this.wolf(p, at)); }
    if ((N.creak -= dt) <= 0) { N.creak = rnd(5, 14); this._far(s.x, s.y, s.z, rnd(6, 18), (p, at) => this.creak(p, at)); }
    if (s.inside && (N.drip -= dt) <= 0) { N.drip = rnd(0.8, 4); this._far(s.x, s.y, s.z, rnd(4, 14), (p, at) => this.drip(p, at)); }
    if ((N.murmur -= dt) <= 0) { N.murmur = rnd(12, 30); if (s.cor > 0.55 && Math.random() < s.cor) { const a = Math.random() * 6.28, d = rnd(5, 12); this.sys.sfx.at({ x: s.x + Math.sin(a) * d, y: s.y, z: s.z + Math.cos(a) * d }).whisper(); } }
  }
}
