// Chapter map layout: Changban, Jing Province, 208 AD.
import { makeNoise2D, fbm, smoothstep, lerp } from '../core/noise.js';

export const PATH = [
  [0, -235], [8, -190], [26, -140], [40, -95], [42, -60], [30, -20],
  [6, 20], [-18, 62], [-20, 100], [-8, 140], [0, 175], [0, 200], [0, 228], [0, 250],
];

export const VILLAGE = { x: 44, z: -62, r: 34 };
export const WELL = { x: 56, z: -50 };
export const PASS = { x: -18, z: 66 };      // Zhang He's ambush
export const BRIDGE = { x: 0, z: 200, len: 36, width: 5.5, deckY: 1.6 };
export const RIVER_Z = 200;
export const WATER_Y = -2.2;
export const START = { x: 0, z: -228 };
export const CORRIDOR = 46;                   // playable half-width around the path
export const MAP_HALF = 300;

const noise = makeNoise2D(2088);
const noise2 = makeNoise2D(777);

// Precompute path segments
const segs = [];
let acc = 0;
for (let i = 0; i < PATH.length - 1; i++) {
  const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
  const len = Math.hypot(bx - ax, bz - az);
  segs.push({ ax, az, bx, bz, len, start: acc });
  acc += len;
}
export const PATH_LENGTH = acc;

export function pathInfo(x, z) {
  let best = 1e9, bx = 0, bz = 0, bt = 0;
  for (const s of segs) {
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    let t = ((x - s.ax) * dx + (z - s.az) * dz) / (s.len * s.len);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.ax + dx * t, pz = s.az + dz * t;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < best) { best = d; bx = px; bz = pz; bt = s.start + s.len * t; }
  }
  return { d: Math.sqrt(best), x: bx, z: bz, s: bt };
}

export function pointAt(s) {
  for (const seg of segs) {
    if (s <= seg.start + seg.len) {
      const t = Math.max(0, (s - seg.start) / seg.len);
      return { x: lerp(seg.ax, seg.bx, t), z: lerp(seg.az, seg.bz, t), dir: Math.atan2(seg.bx - seg.ax, seg.bz - seg.az) };
    }
  }
  const l = segs[segs.length - 1];
  return { x: l.bx, z: l.bz, dir: Math.atan2(l.bx - l.ax, l.bz - l.az) };
}

export function riverZ(x) { return RIVER_Z + Math.sin(x * 0.018) * 7 + Math.sin(x * 0.051) * 2; }

// Raw terrain height (no bridge)
export function heightAt(x, z) {
  const p = pathInfo(x, z);
  const d = p.d;
  const base = fbm(noise, x * 0.008, z * 0.008, 4) * 5 + fbm(noise2, x * 0.05, z * 0.05, 3) * 0.6;
  const road = 1 - smoothstep(2.5, 9, d);
  let h = base * (1 - road * 0.65);
  // hills rising away from corridor
  const ridge = (fbm(noise2, x * 0.0045, z * 0.0045, 5) * 0.5 + 0.5);
  h += smoothstep(26, 120, d) * (14 + ridge * 62);
  h += smoothstep(60, 140, d) * Math.abs(fbm(noise, x * 0.012, z * 0.012, 4)) * 30;
  // village plaza flatten
  const vd = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
  h = lerp(h, base * 0.15 + 0.3, 1 - smoothstep(VILLAGE.r * 0.6, VILLAGE.r * 1.2, vd));
  // river channel
  const dr = Math.abs(z - riverZ(x));
  const bank = 1 - smoothstep(9, 24, dr);
  h = lerp(h, -5.5 + smoothstep(0, 9, dr) * 2.5, bank);
  return h;
}

export function bridgeHeight(x, z) {
  // Arched deck. Returns null when off the bridge.
  const half = BRIDGE.len / 2;
  if (Math.abs(x - BRIDGE.x) > BRIDGE.width / 2 || Math.abs(z - BRIDGE.z) > half) return null;
  const t = (z - BRIDGE.z) / half;
  return BRIDGE.deckY + (1 - t * t) * 1.1;
}

// Cached height grid (filled by terrain builder) for fast lookups.
let grid = null, gridN = 0, gridSize = 0;
export function setHeightGrid(arr, n, size) { grid = arr; gridN = n; gridSize = size; }
export function fastHeight(x, z) {
  if (!grid) return heightAt(x, z);
  const fx = ((x + gridSize / 2) / gridSize) * (gridN - 1), fz = ((z + gridSize / 2) / gridSize) * (gridN - 1);
  const ix = Math.max(0, Math.min(gridN - 2, Math.floor(fx))), iz = Math.max(0, Math.min(gridN - 2, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - ix)), tz = Math.min(1, Math.max(0, fz - iz));
  const a = grid[iz * gridN + ix], b = grid[iz * gridN + ix + 1], c = grid[(iz + 1) * gridN + ix], d = grid[(iz + 1) * gridN + ix + 1];
  // match PlaneGeometry triangulation (a,c,b) / (c,d,b)
  if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
  return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
}

// Height a character stands on
export function groundAt(x, z) {
  const b = bridgeHeight(x, z);
  const h = fastHeight(x, z);
  if (b !== null) return Math.max(b, h);
  return h;
}

// Keep actors inside the corridor; also block walking into the river except via bridge.
export function constrain(pos, radius = 0.5) {
  const p = pathInfo(pos.x, pos.z);
  if (p.d > CORRIDOR) {
    const k = CORRIDOR / p.d;
    pos.x = p.x + (pos.x - p.x) * k;
    pos.z = p.z + (pos.z - p.z) * k;
  }
  const rz = riverZ(pos.x);
  const dr = pos.z - rz;
  const onBridgeX = Math.abs(pos.x - BRIDGE.x) < BRIDGE.width / 2 - radius;
  if (Math.abs(dr) < 13 && !onBridgeX) {
    // push back to nearest bank, or onto bridge lane if close
    if (Math.abs(pos.x - BRIDGE.x) < BRIDGE.width / 2 + 1.2 && Math.abs(pos.z - BRIDGE.z) < BRIDGE.len / 2) {
      pos.x = BRIDGE.x + Math.sign(pos.x - BRIDGE.x || 1) * (BRIDGE.width / 2 - radius);
    } else {
      pos.z = rz + Math.sign(dr || -1) * 13;
    }
  }
  pos.x = Math.max(-MAP_HALF + 5, Math.min(MAP_HALF - 5, pos.x));
  pos.z = Math.max(-MAP_HALF + 5, Math.min(MAP_HALF - 5, pos.z));
  return pos;
}

// House footprints for the village (x, z, w, d, rot, burning)
export const HOUSES = [
  [22, -78, 9, 7, 0.1, true], [30, -40, 10, 7, -0.2, false], [64, -76, 8, 8, 0.4, true],
  [70, -44, 9, 6, -0.5, false], [48, -90, 11, 7, 0.05, false], [20, -56, 7, 6, 1.5, true],
  [62, -26, 8, 6, 0.9, true], [36, -26, 6, 6, 0.3, false], [76, -62, 7, 7, 1.2, false],
];

export function insideHouse(x, z, pad = 0.6) {
  for (const [hx, hz, w, d, rot] of HOUSES) {
    const c = Math.cos(-rot), s = Math.sin(-rot);
    const lx = (x - hx) * c - (z - hz) * s, lz = (x - hx) * s + (z - hz) * c;
    if (Math.abs(lx) < w / 2 + pad && Math.abs(lz) < d / 2 + pad) return { hx, hz, w, d, rot, lx, lz };
  }
  return null;
}

export function pushOutOfHouses(pos, pad = 0.6) {
  const h = insideHouse(pos.x, pos.z, pad);
  if (!h) return pos;
  let { lx, lz } = h;
  const ex = h.w / 2 + pad - Math.abs(lx), ez = h.d / 2 + pad - Math.abs(lz);
  if (ex < ez) lx += Math.sign(lx) * ex; else lz += Math.sign(lz) * ez;
  const c = Math.cos(h.rot), s = Math.sin(h.rot);
  pos.x = h.hx + lx * c - lz * s;
  pos.z = h.hz + lx * s + lz * c;
  return pos;
}

// Route around houses: if the straight line to the target crosses a house footprint,
// return the best corner of the (padded) footprint as an intermediate waypoint.
const _wp = { x: 0, z: 0 };
export function steerAround(x, z, tx, tz, pad = 1.4) {
  _wp.x = tx; _wp.z = tz;
  let bestT = 2, hit = null;
  for (const hs of HOUSES) {
    const [hx, hz, w, d, rot] = hs;
    const c = Math.cos(-rot), s = Math.sin(-rot);
    const ax = (x - hx) * c - (z - hz) * s, az = (x - hx) * s + (z - hz) * c;
    const bx = (tx - hx) * c - (tz - hz) * s, bz = (tx - hx) * s + (tz - hz) * c;
    const ex = w / 2 + 0.5, ez = d / 2 + 0.5;
    // slab test of segment a->b against box [-ex,ex]x[-ez,ez]
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dz = bz - az;
    let ok = true;
    for (const [p, dd, e] of [[ax, dx, ex], [az, dz, ez]]) {
      if (Math.abs(dd) < 1e-6) { if (Math.abs(p) > e) { ok = false; break; } continue; }
      let ta = (-e - p) / dd, tb = (e - p) / dd;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < bestT) { bestT = t0; hit = hs; }
  }
  if (!hit) return _wp;
  const [hx, hz, w, d, rot] = hit;
  const c = Math.cos(rot), s = Math.sin(rot);
  let best = 1e9;
  for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const lx = cx * (w / 2 + pad), lz = cz * (d / 2 + pad);
    const wx = hx + lx * c - lz * s, wz = hz + lx * s + lz * c;
    const cost = Math.hypot(wx - x, wz - z) + Math.hypot(tx - wx, tz - wz);
    if (cost < best) { best = cost; _wp.x = wx; _wp.z = wz; }
  }
  return _wp;
}
