// Touch controls: a floating stick on the left, drag-to-look on the right, and a thumb
// cluster of buttons. Buttons feed the same key codes the keyboard does, so nothing
// downstream knows the difference.
const LOOK = 2.4;            // touch pixels -> mouse pixels
const RADIUS = 58;           // stick travel, px
const SPRINT_AT = 1.3;       // push this far past the ring to sprint

export class TouchControls {
  constructor(input) {
    this.input = input; this.enabled = false;
    this.layer = document.getElementById('touch'); this.stick = document.getElementById('stick'); this.knob = document.getElementById('stickKnob');
    this.ptr = new Map();    // pointerId -> { kind: 'btn' | 'stick' | 'look', ... }
    const force = /[?&]touch=1/.test(location.search);
    if (force || matchMedia('(pointer: coarse)').matches) this.enable();
    else addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.enable(); }, { passive: true });
  }

  enable() {
    if (this.enabled) return; this.enabled = true;
    document.body.classList.add('touch'); document.documentElement.classList.add('touch');
    const L = this.layer;
    L.addEventListener('pointerdown', (e) => this.down(e));
    L.addEventListener('pointermove', (e) => this.move(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) L.addEventListener(ev, (e) => this.up(e));
    L.addEventListener('contextmenu', (e) => e.preventDefault());
    // close buttons and tap-to-dismiss inside the overlays
    document.querySelectorAll('[data-tap]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); this.input.tap(el.dataset.tap); }));
    // ---- keep iOS from zooming the page ----
    // iOS Safari ignores user-scalable=no, and cancelling pointer events does not cancel the touch
    // behind them, so fast taps read as double-tap-to-zoom and a tap while the other thumb holds the
    // stick can read as a pinch. Every guard below stands down while the page is already zoomed,
    // so whatever got through, two fingers can always pinch back out.
    const vv = window.visualViewport, zoomed = () => !!vv && vv.scale > 1.02;
    const scrollable = (t) => t && t.closest && t.closest('.parchment, .jlist, .titlebox, .endbox');
    const block = (e) => { if (!zoomed() && e.cancelable) e.preventDefault(); };
    // the control layer only listens for pointer events, so nothing on it needs the touch defaults
    for (const ev of ['touchstart', 'touchmove', 'touchend']) L.addEventListener(ev, block, { passive: false });
    // anywhere: a second finger never starts a gesture, and nothing pans except the scrolling text
    document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) block(e); }, { passive: false });
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || !scrollable(e.target)) block(e); }, { passive: false });
    // menus: swallow the second tap of a quick pair (taps on the controls don't arm this)
    let lastEnd = 0;
    document.addEventListener('touchend', (e) => {
      if (L.contains(e.target)) return;
      const t = performance.now(); if (t - lastEnd < 380 && e.touches.length === 0) block(e); lastEnd = t;
    }, { passive: false });
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, block, { passive: false });
    document.addEventListener('dblclick', block, { passive: false });
    // while zoomed, lift the CSS lock too and say how to get back
    if (vv) vv.addEventListener('resize', () => {
      const z = zoomed(); if (z === document.body.classList.contains('zoomed')) return;
      document.body.classList.toggle('zoomed', z);
      document.getElementById('unzoom').classList.toggle('hidden', !z);
    });
  }

  /** Ask for fullscreen landscape where the browser allows it (called from the start tap). */
  immerse() {
    if (!this.enabled) return;
    try {
      const el = document.documentElement, p = el.requestFullscreen && el.requestFullscreen({ navigationUI: 'hide' });
      if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } catch (e) { /* not supported: the rotate notice covers portrait */ }
  }

  down(e) {
    e.preventDefault();
    const btn = e.target.closest('[data-code]');
    try { this.layer.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (btn) { this.input.press(btn.dataset.code); btn.classList.add('on'); this.ptr.set(e.pointerId, { kind: 'btn', el: btn, code: btn.dataset.code }); return; }
    const hasStick = [...this.ptr.values()].some((p) => p.kind === 'stick');
    if (e.clientX < innerWidth * 0.45 && !hasStick) {
      this.ptr.set(e.pointerId, { kind: 'stick', x: e.clientX, y: e.clientY });
      this.stick.style.left = e.clientX + 'px'; this.stick.style.top = e.clientY + 'px'; this.stick.classList.add('on'); this.setStick(0, 0);
    } else this.ptr.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
  }
  move(e) {
    const p = this.ptr.get(e.pointerId); if (!p) return;
    if (p.kind === 'look') { this.input.dx += (e.clientX - p.x) * LOOK; this.input.dy += (e.clientY - p.y) * LOOK; p.x = e.clientX; p.y = e.clientY; }
    else if (p.kind === 'stick') this.setStick((e.clientX - p.x) / RADIUS, (e.clientY - p.y) / RADIUS);
  }
  up(e) {
    const p = this.ptr.get(e.pointerId); if (!p) return; this.ptr.delete(e.pointerId);
    if (p.kind === 'btn') { this.input.release(p.code); p.el.classList.remove('on'); }
    else if (p.kind === 'stick') { this.stick.classList.remove('on', 'sprint'); this.input.touchAxes[0] = this.input.touchAxes[1] = 0; this.input.release('ShiftLeft'); }
  }
  setStick(x, y) {
    const l = Math.hypot(x, y), k = l > 1 ? 1 / l : 1, inp = this.input, sprint = l > SPRINT_AT;
    const dead = l < 0.14 ? 0 : 1;
    inp.touchAxes[0] = x * k * dead; inp.touchAxes[1] = -y * k * dead;
    this.knob.style.transform = `translate(${x * k * RADIUS}px, ${y * k * RADIUS}px)`;
    if (sprint !== this.stick.classList.contains('sprint')) { this.stick.classList.toggle('sprint', sprint); if (sprint) inp.press('ShiftLeft'); else inp.release('ShiftLeft'); }
  }
  /** Let go of everything (the game calls this when a menu opens over the controls). */
  reset() { for (const [id, p] of this.ptr) this.up({ pointerId: id }); }
}
