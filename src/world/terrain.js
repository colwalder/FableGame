import { sstep, fbm, clamp } from '../core/util.js';

// North is -Z. The road runs from the forest (z≈+100) through the village to the church (z≈-130).
export const START = { x: 0, z: 96 };
export const BOUNDS = { minX: -46, maxX: 46, minZ: -152, maxZ: 103 };
export const SQUARE = { x: 0, z: -45, r: 21 };
export const CHURCH = { x: 0, z: -130, y: 5.3, minX: -9.3, maxX: 9.3, minZ: -144.6, maxZ: -111.3, doorZ: -109.6 };

const PATH = [[0, 108], [0, 70], [2, 46], [-1, 22], [0, -4], [0, -25], [0, -66], [2, -86], [0, -104]];
export function pathDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const ax = PATH[i][0], az = PATH[i][1], bx = PATH[i + 1][0], bz = PATH[i + 1][1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) best = d;
  }
  return best;
}

export function inChurch(x, z) {
  return (Math.abs(x) < 11.9 && z < -109.2 && z > -150.9) || (Math.abs(x) < 3.9 && z >= -109.2 && z < -103.3);
}

/** Bare earth, without floors. */
export function terrainHeight(x, z) {
  const hill = sstep(-66, -100, z) * 5;
  const sq = sstep(27, 22, Math.hypot(x - SQUARE.x, z - SQUARE.z));
  const flat = Math.max(sq, sstep(-94, -100.5, z), sstep(4.5, 1.5, pathDist(x, z)) * 0.8);
  const n = (fbm(x * 0.06 + 11, z * 0.06 + 5) - 0.5) * 1.3;
  const rim = sstep(47, 85, Math.abs(x)) * 7 + sstep(-153, -190, z) * 5;
  return hill + n * (1 - flat) + rim;
}
/** What you stand on. */
export function groundHeight(x, z) { return terrainHeight(x, z) + (inChurch(x, z) ? 0.3 : 0); }

/** 0 at the forest road, 1 at the church door. */
export function corruption(x, z) {
  return clamp(sstep(66, -112, z) * 0.95 + (fbm(x * 0.05 + 3, z * 0.05) - 0.5) * 0.35, 0, 1);
}
