// Keyboard, mouse (pointer lock) and gamepad, unified into "codes" you can query.
const PAD_NAMES = ['PadA', 'PadB', 'PadX', 'PadY', 'PadLB', 'PadRB', 'PadLT', 'PadRT', 'PadBack', 'PadStart', 'PadL3', 'PadR3', 'PadUp', 'PadDown', 'PadLeft', 'PadRight'];

export const KEY = {
  light: ['Mouse0', 'KeyJ', 'PadRB'],
  heavy: ['Mouse2', 'KeyK', 'PadRT'],
  roll: ['Space', 'PadB'],
  sprint: ['ShiftLeft', 'ShiftRight', 'PadA'],
  flask: ['KeyR', 'PadX'],
  flute: ['KeyF', 'PadY'],
  interact: ['KeyE', 'PadA'],
  lock: ['KeyQ', 'Mouse1', 'PadR3'],
  journal: ['Tab', 'PadBack'],
  back: ['Escape', 'PadB'],
};

export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.pressed = new Set();
    this.dx = 0; this.dy = 0;
    this.locked = false;
    this.wantLock = false;
    this.padAxes = [0, 0, 0, 0];
    this.padPrev = new Set();

    addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    el.addEventListener('mousedown', (e) => {
      const k = 'Mouse' + e.button;
      if (this.wantLock && !this.locked) { this.lock(); if (e.button === 0) return; }
      this.keys.add(k); this.pressed.add(k);
      if (e.button === 1) e.preventDefault();
    });
    addEventListener('mouseup', (e) => this.keys.delete('Mouse' + e.button));
    addEventListener('mousemove', (e) => { if (this.locked) { this.dx += e.movementX || 0; this.dy += e.movementY || 0; } });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; });
    addEventListener('blur', () => this.keys.clear());
  }

  lock() {
    try { const p = this.el.requestPointerLock && this.el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  /** Poll the gamepad; call once per frame before reading. */
  poll(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') { gp = p; break; }
    const now = new Set();
    this.padAxes = [0, 0, 0, 0];
    if (gp) {
      gp.buttons.forEach((b, i) => { if (PAD_NAMES[i] && (b.pressed || b.value > 0.5)) now.add(PAD_NAMES[i]); });
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      this.padAxes = [dz(gp.axes[0]), dz(gp.axes[1]), dz(gp.axes[2]), dz(gp.axes[3])];
      this.dx += this.padAxes[2] * 900 * dt;
      this.dy += this.padAxes[3] * 600 * dt;
    }
    for (const n of now) { if (!this.padPrev.has(n)) this.pressed.add(n); this.keys.add(n); }
    for (const n of this.padPrev) if (!now.has(n)) this.keys.delete(n);
    this.padPrev = now;
    // arrow keys turn the camera too (for trackpads / no pointer lock)
    const ax = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    const ay = (this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('ArrowUp') ? 1 : 0);
    this.dx += ax * 1100 * dt; this.dy += ay * 600 * dt;
  }

  down(codes) { for (const c of codes) if (this.keys.has(c)) return true; return false; }
  hit(codes) { for (const c of codes) if (this.pressed.has(c)) return true; return false; }
  /** Movement axis: x = right, y = forward. */
  axis() {
    let x = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + this.padAxes[0];
    let y = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0) - this.padAxes[1];
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  endFrame() { this.pressed.clear(); this.dx = 0; this.dy = 0; }
}
