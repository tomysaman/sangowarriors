// Flat pose schema shared by all rigged characters (character space, facing +Z, left = +X).
export const POSE_SIZE = 35;
const IDX = {
  hipsY: 0, hips: 1, spine: 4, chest: 7, head: 10, grip: 13, spear: 16, lgrip: 19, lfree: 20, lpos: 21,
  footL: 24, footR: 27, lift: 30, hipsOff: 31, bodyYaw: 33, bodyPitch: 34,
};

export const BASE = {
  hipsY: -0.06, hips: [0, -0.4, 0], spine: [0.05, 0.1, 0], chest: [0.06, 0.05, 0], head: [0, 0.25, 0],
  grip: [-0.12, 1.12, 0.12], spear: [0.25, 0.1, 0], lgrip: 0.42, lfree: 0, lpos: [0.25, 1.0, 0.1],
  footL: [0.17, 0.08, 0.3], footR: [-0.18, 0.08, -0.28], lift: 0, hipsOff: [0, 0], bodyYaw: 0, bodyPitch: 0,
};

export function makePose(over = {}, base = BASE) {
  const o = { ...base, ...over };
  const p = new Float32Array(POSE_SIZE);
  for (const [k, i] of Object.entries(IDX)) {
    const v = o[k];
    if (Array.isArray(v)) v.forEach((x, j) => (p[i + j] = x));
    else p[i] = v;
  }
  return p;
}

export function lerpPose(out, a, b, t) {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

// Catmull-Rom sampling across keyframes [{t, p}]
export function samplePose(out, keys, t) {
  const n = keys.length;
  if (t <= keys[0].t) return out.set(keys[0].p), out;
  if (t >= keys[n - 1].t) return out.set(keys[n - 1].p), out;
  let i = 0;
  while (i < n - 2 && t > keys[i + 1].t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  let u = (t - k1.t) / (k2.t - k1.t);
  const e = k2.ease;
  if (e === 'out') u = 1 - (1 - u) * (1 - u) * (1 - u);
  else if (e === 'in') u = u * u;
  else if (e === 'snap') u = 1 - Math.pow(1 - u, 4);
  const u2 = u * u, u3 = u2 * u;
  for (let c = 0; c < POSE_SIZE; c++) {
    const p0 = k0.p[c], p1 = k1.p[c], p2 = k2.p[c], p3 = k3.p[c];
    // centripetal-ish tension 0.5 catmull-rom, damped to limit overshoot
    const m1 = (p2 - p0) * 0.35, m2 = (p3 - p1) * 0.35;
    out[c] = (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
  }
  return out;
}

const TAU = Math.PI * 2;

// Procedural locomotion: speed01 0 = idle, 1 = full run.
export function locomotionPose(out, phase, speed01, time, style = 'spear') {
  const s = Math.sin(phase * TAU), c = Math.cos(phase * TAU);
  const s2 = Math.sin((phase + 0.5) * TAU), c2 = Math.cos((phase + 0.5) * TAU);
  const breath = Math.sin(time * 2.1) * 0.015;
  const idle = makeIdle(style, breath, time);
  if (speed01 < 0.01) { out.set(idle); return out; }
  const A = 0.42 * Math.min(1, speed01 * 1.2);
  const run = makePose({
    hipsY: -0.1 - Math.abs(Math.cos(phase * TAU * 2)) * 0.05 * speed01,
    hips: [0.05, s * 0.22, 0], spine: [0.2 * speed01, -s * 0.12, 0], chest: [0.08, -s * 0.18, s * 0.03], head: [-0.1, s * 0.15, 0],
    grip: [-0.3, 1.02 + c * 0.02, 0.02 + s * 0.06],
    spear: style === 'none' ? [0, 0, 0] : [Math.PI + 0.32, 0.18, 0], lgrip: 0.4, lfree: 1,
    lpos: [0.24, 1.0 - Math.abs(s2) * 0.04, s2 * 0.26 + 0.05],
    footL: [0.12, 0.08 + Math.max(0, c) * 0.24, s * A + 0.04],
    footR: [-0.12, 0.08 + Math.max(0, c2) * 0.24, s2 * A + 0.04],
    hipsOff: [0, 0.06 * speed01],
  });
  const k = Math.min(1, speed01 * 2.5);
  lerpPose(out, idle, run, k);
  return out;
}

function makeIdle(style, breath, time) {
  if (style === 'sword') {
    return makePose({
      hipsY: -0.07 + breath, hips: [0, -0.5, 0], chest: [0.05 + breath, 0.15, 0], head: [0, 0.3, 0],
      grip: [-0.28, 1.12, 0.32], spear: [0.15, 0.5, 0], lfree: 1, lpos: [0.22, 1.0, -0.05],
      footL: [0.18, 0.08, 0.3], footR: [-0.2, 0.08, -0.3],
    });
  }
  if (style === 'none') {
    return makePose({
      hipsY: -0.02 + breath, hips: [0, 0, 0], spine: [0, 0, 0], chest: [breath, 0, 0], head: [0, 0, 0],
      grip: [-0.2, 0.98, 0.08], spear: [0, 0, 0], lfree: 1, lpos: [0.2, 0.98, 0.08],
      footL: [0.1, 0.08, 0.02], footR: [-0.1, 0.08, -0.02],
    });
  }
  return makePose({ hipsY: -0.06 + breath, chest: [0.06 + breath, 0.05, 0], spear: [0.25, 0.1 + breath * 0.5, 0] });
}

export const P = makePose;
