// Pose library. Everything is a pure function returning a pose object for Rig.pose().
import { lerp, ease } from '../core/util.js';

const S = Math.sin, Co = Math.cos, mx = Math.max;
const KEYS = ['hips', 'chest', 'head', 'lSh', 'lEl', 'lHa', 'rSh', 'rEl', 'rHa', 'lHip', 'lKn', 'rHip', 'rKn'];
const Z = [0, 0, 0];
export function mix(A, B, t) {
  const o = { y: lerp(A.y || 0, B.y || 0, t), sx: lerp(A.sx || 0, B.sx || 0, t), sz: lerp(A.sz || 0, B.sz || 0, t) };
  for (const k of KEYS) { const a = A[k] || Z, b = B[k] || Z; o[k] = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  return o;
}

// ---------- shared two-handed weapon work (hero, brute, templar, priest) ----------
/** Horizontal cleave. k: 0 = wound up, 1 = followed through. dir 1 = right-to-left. */
export function sweep(k, dir = 1) {
  const tw = lerp(-1.95, 1.8, k) * dir;
  return {
    hips: [0, tw * 0.28, 0], chest: [0.22, tw * 0.72, 0], head: [0, -tw * 0.45, 0],
    rSh: [-1.45, 0, dir > 0 ? -0.1 : 0.45], rEl: [-0.2, 0, 0], rHa: [1.55, 0, 0],
    lSh: [-1.35, 0, -0.6], lEl: [-0.6, 0, 0],
    lHip: [-0.4, 0, 0.14], lKn: [0.55, 0, 0], rHip: [0.32, 0, -0.14], rKn: [0.4, 0, 0], y: -0.13,
  };
}
/** Overhead chop. k: 0 = raised, 1 = buried in the ground. */
export function overhead(k) {
  return {
    hips: [lerp(-0.1, 0.25, k), 0, 0], chest: [lerp(-0.42, 0.7, k), 0, 0], head: [lerp(0.25, -0.35, k), 0, 0],
    rSh: [lerp(-3.0, -0.9, k), 0, -0.15], rEl: [lerp(-0.7, -0.12, k), 0, 0], rHa: [lerp(0.2, 1.3, k), 0, 1.57],
    lSh: [lerp(-2.8, -0.95, k), 0, -0.4], lEl: [lerp(-0.9, -0.4, k), 0, 0],
    lHip: [lerp(-0.25, -0.75, k), 0, 0.08], lKn: [lerp(0.3, 0.95, k), 0, 0], rHip: [lerp(0.2, 0.4, k), 0, -0.08], rKn: [lerp(0.2, 0.75, k), 0, 0], y: lerp(0.02, -0.32, k),
  };
}

// ---------- hero ----------
export function heroMove(t, a, ph, guard) {
  const s = S(ph), c = Co(ph);
  const p = {
    hips: [0, s * 0.1 * a, 0], chest: [0.06 + 0.2 * a, -s * 0.14 * a, 0], head: [-0.1 * a, 0, 0],
    rSh: [-0.5, 0, -0.5], rEl: [-2.0, 0, 0], rHa: [-0.3, 0.35, 0.3],
    lSh: [s * 0.75 * a + 0.05, 0, 0.14], lEl: [-0.3 - 0.5 * a, 0, 0],
    lHip: [-s * 0.8 * a, 0, 0.03], lKn: [mx(0, c) * 1.3 * a + 0.06, 0, 0], rHip: [s * 0.8 * a, 0, -0.03], rKn: [mx(0, -c) * 1.3 * a + 0.06, 0, 0],
    y: -Math.abs(c) * 0.06 * a + S(t * 1.7) * 0.008,
  };
  if (guard) { p.rSh = [-0.85, 0, -0.5]; p.rEl = [-1.55, 0, 0]; p.rHa = [0.0, 0.4, 0.35]; p.lSh = [-1.15, 0, -0.8]; p.lEl = [-1.65, 0, 0]; p.chest[1] -= 0.25; p.y -= 0.07; p.lKn[0] += 0.2; p.rKn[0] += 0.2; p.lHip[0] -= 0.12; p.rHip[0] += 0.1; }
  return p;
}
export const heroRoll = () => ({ chest: [1.0, 0, 0], head: [0.7, 0, 0], hips: [0.3, 0, 0], rSh: [-0.6, 0, -0.3], rEl: [-2.2, 0, 0], rHa: [0.2, 0, 0], lSh: [-1.2, 0, -0.3], lEl: [-2.0, 0, 0], lHip: [-1.9, 0, 0], lKn: [2.2, 0, 0], rHip: [-1.7, 0, 0], rKn: [2.1, 0, 0], y: -0.45 });
export const heroHit = (k) => ({ chest: [-0.45 + k * 0.3, 0.35, 0.1], head: [-0.4, 0.2, 0], hips: [-0.1, 0, 0], rSh: [-0.2, 0, -0.5], rEl: [-1.5, 0, 0], rHa: [0.5, 0, 0], lSh: [-0.4, 0, 0.8], lEl: [-0.9, 0, 0], lHip: [-0.3, 0, 0.1], lKn: [0.5, 0, 0], rHip: [0.3, 0, -0.1], rKn: [0.5, 0, 0], y: -0.12 });
export const heroDown = () => ({ sx: -1.5, y: -0.76, chest: [-0.1, 0, 0], head: [-0.2, 0.3, 0], rSh: [-0.3, 0, -1.1], rEl: [-0.4, 0, 0], rHa: [1.2, 0, 0], lSh: [0.2, 0, 1.2], lEl: [-0.3, 0, 0], lHip: [-0.2, 0, 0.2], lKn: [0.3, 0, 0], rHip: [-0.5, 0, -0.2], rKn: [0.9, 0, 0] });
export const heroDead = () => ({ sx: 1.5, y: -0.78, chest: [0.05, 0, 0], head: [0.3, 0.6, 0], rSh: [-2.6, 0, -0.5], rEl: [-0.5, 0, 0], rHa: [0, 0, 0], lSh: [-0.4, 0, 0.9], lEl: [-0.8, 0, 0], lHip: [0.1, 0, 0.15], lKn: [0.3, 0, 0], rHip: [0, 0, -0.2], rKn: [0.6, 0, 0] });
export const heroFlask = (k) => ({ chest: [-0.12 - k * 0.15, 0, 0], head: [-0.25 - k * 0.3, 0, 0], rSh: [-0.42, 0, -0.2], rEl: [-2.05, 0, 0], rHa: [0.28, 0, 0], lSh: [-1.15 - k * 0.35, 0, -0.35], lEl: [-2.0, 0, 0], lHip: [-0.08, 0, 0.06], lKn: [0.12, 0, 0], rHip: [0.06, 0, -0.06], rKn: [0.1, 0, 0] });
export const heroFlute = (t) => ({ chest: [0.05 + S(t * 2.1) * 0.05, S(t * 1.3) * 0.08, 0], head: [0.18, 0.12, S(t * 2.1) * 0.06], rSh: [-1.05, 0, 0.5], rEl: [-1.95, 0, 0], lSh: [-1.25, 0, -0.45], lEl: [-1.85, 0, 0], lHip: [-0.06, 0, 0.08], lKn: [0.1, 0, 0], rHip: [0.05, 0, -0.08], rKn: [0.1, 0, 0], y: S(t * 2.1) * 0.012 });
export const heroKneel = () => ({ y: -0.48, chest: [0.4, 0, 0], head: [0.45, 0, 0], rSh: [-0.9, 0, -0.2], rEl: [-0.5, 0, 0], rHa: [2.6, 0, 0], lSh: [-0.7, 0, -0.3], lEl: [-1.2, 0, 0], lHip: [-1.5, 0, 0.1], lKn: [1.55, 0, 0], rHip: [0.05, 0, 0], rKn: [1.6, 0, 0] });

// ---------- husk ----------
export function huskIdle(t, s) {
  return { chest: [0.42 + S(t * 1.1 + s) * 0.05, S(t * 0.7 + s) * 0.12, 0.08], head: [0.25, S(t * 0.5 + s) * 0.35, 0.35], lSh: [0.12, 0, 0.1], lEl: [-0.3, 0, 0], rSh: [0.05 + S(t * 0.9 + s) * 0.1, 0, -0.14], rEl: [-0.5, 0, 0], lHip: [-0.1, 0, 0.06], lKn: [0.22, 0, 0], rHip: [0.05, 0, -0.08], rKn: [0.2, 0, 0], y: -0.05 };
}
export function huskWalk(ph, s) {
  const a = S(ph), c = Co(ph);
  return { chest: [0.5, a * 0.16, a * 0.1], head: [0.05, 0, 0.3 + S(ph * 0.5 + s) * 0.15], lSh: [-1.3 + a * 0.16, 0, -0.12], lEl: [-0.25, 0, 0], rSh: [-0.95 - a * 0.16, 0, 0.18], rEl: [-0.65, 0, 0],
    lHip: [-a * 0.5, 0, 0.05], lKn: [mx(0, c) * 0.75 + 0.15, 0, 0], rHip: [a * 0.32 + 0.1, 0, -0.08], rKn: [mx(0, -c) * 0.4 + 0.12, 0, 0], y: -0.06 - Math.abs(c) * 0.03 };
}
export function huskAttack(k) {   // 0 reared back, 1 slammed down
  return { chest: [lerp(-0.3, 0.85, k), 0, 0], head: [lerp(-0.3, 0.2, k), 0, 0.2], lSh: [lerp(-2.75, -0.95, k), 0, lerp(0.35, -0.3, k)], lEl: [lerp(-0.9, -0.15, k), 0, 0], rSh: [lerp(-2.55, -0.85, k), 0, lerp(-0.35, 0.3, k)], rEl: [lerp(-0.9, -0.15, k), 0, 0],
    lHip: [lerp(0.1, -0.6, k), 0, 0.06], lKn: [lerp(0.2, 0.7, k), 0, 0], rHip: [0.25, 0, -0.06], rKn: [0.35, 0, 0], y: lerp(0, -0.16, k) };
}
export const huskStagger = () => ({ chest: [-0.5, 0.35, 0.1], head: [-0.45, 0, 0.25], lSh: [-0.5, 0, 0.9], lEl: [-0.6, 0, 0], rSh: [0.35, 0, -0.8], rEl: [-0.4, 0, 0], lHip: [-0.35, 0, 0.1], lKn: [0.5, 0, 0], rHip: [0.3, 0, -0.1], rKn: [0.4, 0, 0], y: -0.1 });
export const huskDead = () => ({ sx: -1.5, y: -0.8, chest: [-0.1, 0.2, 0], head: [-0.3, 0.5, 0], lSh: [0.2, 0, 1.1], lEl: [-0.4, 0, 0], rSh: [-0.3, 0, -0.8], rEl: [-0.7, 0, 0], lHip: [-0.3, 0, 0.25], lKn: [0.5, 0, 0], rHip: [0, 0, -0.2], rKn: [0.2, 0, 0] });
export const huskLying = () => ({ sx: 1.5, y: -0.82, chest: [0.05, 0, 0], head: [0.2, 0.7, 0], lSh: [-2.4, 0, 0.5], lEl: [-0.6, 0, 0], rSh: [-0.3, 0, -0.7], rEl: [-0.9, 0, 0], lHip: [0.05, 0, 0.12], lKn: [0.1, 0, 0], rHip: [0, 0, -0.2], rKn: [0.5, 0, 0] });

// ---------- strzyga (runs on all fours) ----------
export function strzIdle(t) {
  return { sx: 1.05, y: -0.42, head: [-0.95 + S(t * 2.3) * 0.1, S(t * 1.3) * 0.45, 0], chest: [S(t * 2.3) * 0.04, 0, 0], lSh: [-1.15, 0, 0.25], lEl: [-0.3, 0, 0], rSh: [-1.15, 0, -0.25], rEl: [-0.3, 0, 0], lHip: [-2.0, 0, 0.3], lKn: [1.9, 0, 0], rHip: [-2.0, 0, -0.3], rKn: [1.9, 0, 0] };
}
export function strzRun(ph) {
  const a = S(ph), b = S(ph + 0.7), c = S(ph + Math.PI), d = S(ph + Math.PI + 0.7);
  return { sx: 1.05 + S(ph * 2) * 0.07, y: -0.4 + Math.abs(a) * 0.1, head: [-0.9, 0, 0], chest: [a * 0.12, 0, 0],
    lSh: [-1.2 + a * 0.75, 0, 0.2], lEl: [-0.3 - mx(0, Co(ph)) * 0.7, 0, 0], rSh: [-1.2 + b * 0.75, 0, -0.2], rEl: [-0.3 - mx(0, Co(ph + 0.7)) * 0.7, 0, 0],
    lHip: [-2.0 + c * 0.65, 0, 0.25], lKn: [1.8 - c * 0.5, 0, 0], rHip: [-2.0 + d * 0.65, 0, -0.25], rKn: [1.8 - d * 0.5, 0, 0] };
}
export const strzCrouch = () => ({ sx: 1.2, y: -0.6, head: [-1.2, 0, 0], chest: [-0.2, 0, 0], lSh: [-0.7, 0, 0.5], lEl: [-1.1, 0, 0], rSh: [-0.7, 0, -0.5], rEl: [-1.1, 0, 0], lHip: [-2.4, 0, 0.35], lKn: [2.4, 0, 0], rHip: [-2.4, 0, -0.35], rKn: [2.4, 0, 0] });
export const strzLeap = () => ({ sx: 1.3, y: 0.1, head: [-1.1, 0, 0], chest: [-0.15, 0, 0], lSh: [-2.7, 0, 0.45], lEl: [-0.35, 0, 0], rSh: [-2.7, 0, -0.45], rEl: [-0.35, 0, 0], lHip: [-0.5, 0, 0.2], lKn: [0.5, 0, 0], rHip: [-0.3, 0, -0.2], rKn: [0.8, 0, 0] });
export const strzStagger = () => ({ sx: 0.5, y: -0.3, head: [-0.5, 0.5, 0.3], chest: [-0.3, 0.3, 0], lSh: [-0.8, 0, 1], lEl: [-0.8, 0, 0], rSh: [-0.2, 0, -0.9], rEl: [-0.8, 0, 0], lHip: [-1.2, 0, 0.3], lKn: [1.4, 0, 0], rHip: [-0.9, 0, -0.3], rKn: [1.2, 0, 0] });
export const strzDead = () => ({ sx: 1.55, y: -0.85, sz: 0.4, head: [0.2, 0.8, 0], lSh: [-2.2, 0, 0.8], lEl: [-0.8, 0, 0], rSh: [-0.5, 0, -0.9], rEl: [-1.2, 0, 0], lHip: [-0.3, 0, 0.4], lKn: [0.9, 0, 0], rHip: [0.1, 0, -0.3], rKn: [0.3, 0, 0] });

// ---------- wailer (floats; no legs) ----------
export function wailIdle(t) {
  return { y: S(t * 1.4) * 0.09, chest: [0.12, S(t * 0.6) * 0.18, S(t * 0.9) * 0.05], head: [-0.15 + S(t * 0.8) * 0.12, 0, S(t * 0.5) * 0.25], lSh: [0.05, 0, 0.3 + S(t) * 0.06], lEl: [-0.45, 0, 0], rSh: [0.05, 0, -0.3 - S(t + 1) * 0.06], rEl: [-0.45, 0, 0] };
}
export function wailCast(k, t) {  // k 0..1 gather, >1 release
  if (k <= 1) return { y: 0.1 + k * 0.25, chest: [-0.3 * k, 0, 0], head: [-0.75 * k, 0, S(t * 30) * 0.05 * k], lSh: [-2.5 * k, 0, 0.7], lEl: [-0.5, 0, 0], rSh: [-2.5 * k, 0, -0.7], rEl: [-0.5, 0, 0] };
  return { y: 0.1, chest: [0.45, 0, 0], head: [0.1, 0, 0], lSh: [-1.35, 0, -0.15], lEl: [-0.1, 0, 0], rSh: [-1.35, 0, 0.15], rEl: [-0.1, 0, 0] };
}
export const wailStagger = () => ({ y: -0.1, chest: [-0.55, 0.3, 0.15], head: [-0.6, 0, 0.3], lSh: [-1, 0, 1.1], lEl: [-0.5, 0, 0], rSh: [-0.6, 0, -1.2], rEl: [-0.5, 0, 0] });
export const wailDead = () => ({ sx: -1.45, y: -1.05, chest: [-0.1, 0, 0], head: [-0.4, 0.4, 0], lSh: [-0.3, 0, 1.2], lEl: [-0.3, 0, 0], rSh: [-0.6, 0, -1.0], rEl: [-0.6, 0, 0] });

// ---------- heavy two-handers (brute, templar) ----------
export function heavyWalk(ph, a, t = 0) {
  const s = S(ph), c = Co(ph);
  return { hips: [0, s * 0.08 * a, 0], chest: [0.22 + S(t * 1.5) * 0.02, -s * 0.14 * a, s * 0.05 * a], head: [0.05, 0, 0],
    rSh: [-0.55, 0, -0.28], rEl: [-0.95, 0, 0], rHa: [0.95, 0, 0], lSh: [-0.75, 0, -0.35], lEl: [-1.15, 0, 0],
    lHip: [-s * 0.5 * a - 0.05, 0, 0.14], lKn: [mx(0, c) * 0.8 * a + 0.18, 0, 0], rHip: [s * 0.5 * a + 0.05, 0, -0.14], rKn: [mx(0, -c) * 0.8 * a + 0.18, 0, 0], y: -0.06 - Math.abs(c) * 0.05 * a };
}
export const heavyStagger = () => ({ y: -0.42, chest: [0.55, 0.2, 0.1], head: [0.5, 0, 0.2], rSh: [-0.7, 0, -0.3], rEl: [-0.3, 0, 0], rHa: [2.6, 0, 0], lSh: [-0.4, 0, 0.5], lEl: [-0.8, 0, 0], lHip: [-1.4, 0, 0.12], lKn: [1.5, 0, 0], rHip: [0.1, 0, -0.1], rKn: [1.5, 0, 0] });
export const heavyDead = () => ({ sx: 1.45, y: -0.82, chest: [0.1, 0.2, 0], head: [0.3, 0.6, 0], rSh: [-2.5, 0, -0.6], rEl: [-0.4, 0, 0], rHa: [0.5, 0, 0], lSh: [-0.5, 0, 1.0], lEl: [-0.7, 0, 0], lHip: [0.1, 0, 0.2], lKn: [0.4, 0, 0], rHip: [0, 0, -0.25], rKn: [0.7, 0, 0] });
export const templarKneel = (t) => ({ y: -0.46, chest: [0.42 + S(t * 0.9) * 0.02, 0, 0], head: [0.5, 0, 0], rSh: [-0.85, 0, -0.2], rEl: [-0.25, 0, 0], rHa: [2.55, 0, 0], lSh: [-0.5, 0, 0.25], lEl: [-0.9, 0, 0], lHip: [-1.5, 0, 0.12], lKn: [1.55, 0, 0], rHip: [0.05, 0, -0.05], rKn: [1.6, 0, 0] });
export function templarCharge(k, ph) { // k: 0 brace, 1 running
  const s = S(ph), c = Co(ph);
  return { chest: [lerp(0.3, 0.6, k), 0.35, 0], head: [-0.3, -0.3, 0], lSh: [-1.45, 0, -0.55], lEl: [-0.75, 0, 0], rSh: [0.55, 0, -0.35], rEl: [-0.35, 0, 0], rHa: [1.3, 0, 0],
    lHip: [-s * 0.9 * k - 0.3, 0, 0.1], lKn: [mx(0, c) * 1.2 * k + 0.5, 0, 0], rHip: [s * 0.9 * k + 0.3, 0, -0.1], rKn: [mx(0, -c) * 1.2 * k + 0.5, 0, 0], y: -0.18 };
}
export const templarPlunge = (k) => ({ y: lerp(-0.05, -0.4, k), chest: [lerp(-0.2, 0.6, k), 0, 0], head: [0.3, 0, 0], rSh: [lerp(-2.6, -0.9, k), 0, -0.1], rEl: [-0.3, 0, 0], rHa: [lerp(1.6, 2.5, k), 0, 0], lSh: [lerp(-2.4, -1.0, k), 0, -0.5], lEl: [-0.6, 0, 0], lHip: [lerp(-0.2, -1.3, k), 0, 0.12], lKn: [lerp(0.3, 1.4, k), 0, 0], rHip: [0.1, 0, -0.1], rKn: [lerp(0.2, 1.4, k), 0, 0] });
export const roarPose = (t) => ({ y: -0.1, chest: [-0.5, 0, 0], head: [-0.7, 0, S(t * 34) * 0.06], rSh: [-0.6, 0, -1.1], rEl: [-0.6, 0, 0], rHa: [0.8, 0, 0], lSh: [-0.5, 0, 1.1], lEl: [-0.7, 0, 0], lHip: [-0.3, 0, 0.25], lKn: [0.4, 0, 0], rHip: [0.2, 0, -0.25], rKn: [0.4, 0, 0] });

// ---------- the priest ----------
export function priestIdle(t) {
  return { y: S(t * 1.2) * 0.12, chest: [0.18 + S(t * 0.8) * 0.04, S(t * 0.5) * 0.1, 0], head: [0.2 + S(t * 0.7) * 0.08, S(t * 0.45) * 0.2, S(t * 0.6) * 0.12],
    rSh: [-0.55, 0, -0.35], rEl: [-0.9, 0, 0], rHa: [0.75, 0, 0], lSh: [-0.25 + S(t * 0.9) * 0.08, 0, 0.55], lEl: [-0.7 + S(t * 1.1) * 0.1, 0, 0] };
}
export const priestPray = (t) => ({ y: -0.9, chest: [0.7 + S(t * 0.7) * 0.03, 0, 0], head: [0.6, 0, 0], rSh: [-1.0, 0, 0.5], rEl: [-1.6, 0, 0], rHa: [0.2, 0, 0], lSh: [-1.0, 0, -0.5], lEl: [-1.6, 0, 0] });
export function priestCast(k, t) {
  return { y: 0.25 * k + S(t * 1.2) * 0.08, chest: [-0.35 * k, 0, 0], head: [-0.5 * k, 0, S(t * 28) * 0.04 * k], rSh: [lerp(-0.55, -2.7, k), 0, -0.5], rEl: [-0.3, 0, 0], rHa: [1.5, 0, 0], lSh: [lerp(-0.3, -2.5, k), 0, 0.8], lEl: [-0.5, 0, 0] };
}
export function priestLunge(k) { // 0 arms flung wide, 1 grabbing forward
  return { y: lerp(0.15, -0.25, k), chest: [lerp(-0.5, 0.75, k), 0, 0], head: [lerp(-0.4, -0.5, k), 0, 0], rSh: [lerp(-0.9, -1.5, k), 0, lerp(-1.4, 0.35, k)], rEl: [lerp(-0.9, -0.2, k), 0, 0], rHa: [1.2, 0, 0], lSh: [lerp(-0.9, -1.5, k), 0, lerp(1.4, -0.35, k)], lEl: [lerp(-0.9, -0.2, k), 0, 0] };
}
export const priestStun = (t) => ({ y: -0.55, chest: [0.55, S(t * 9) * 0.12, S(t * 11) * 0.08], head: [0.5, S(t * 13) * 0.3, 0], rSh: [-2.3, 0, 0.6], rEl: [-2.1, 0, 0], rHa: [0, 0, 0], lSh: [-2.3, 0, -0.6], lEl: [-2.1, 0, 0] });
export const priestDead = () => ({ sx: 1.2, y: -2.1, chest: [0.3, 0, 0], head: [0.6, 0.4, 0], rSh: [-2.2, 0, -0.7], rEl: [-0.5, 0, 0], lSh: [-0.6, 0, 1.2], lEl: [-0.9, 0, 0] });
export const priestBeam = (t) => ({ y: 0.35, chest: [-0.15, 0, 0], head: [-0.1, 0, S(t * 40) * 0.03], rSh: [-0.4, 0, -1.3], rEl: [-0.4, 0, 0], rHa: [1, 0, 0], lSh: [-0.4, 0, 1.3], lEl: [-0.4, 0, 0] });
export { ease };
