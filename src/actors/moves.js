import { makePose, BASE } from './pose.js';

// Keyframe helper: K(time, overrides, ease, base)
const K = (t, o = {}, ease, base = BASE) => ({ t, p: makePose(o, base), ease });
const TAU = Math.PI * 2;

// Hit window fields:
//  t0,t1  active time; dmg; react: 'stagger'|'knockback'|'launch'|'slam'; force (horizontal); up (vertical)
//  stop (hitstop seconds); shake; area: {r, x, z} -> radial hit around character-space point instead of weapon sweep
//  arc: also counts a frontal arc in addition to weapon geometry (generosity)

// ------------------------------------------------------------------ Zhao Yun: Dragon spear
const fwdFeet = { footL: [0.17, 0.08, 0.5], footR: [-0.2, 0.08, -0.22] };

export const HERO_MOVES = {
  N1: {
    dur: 0.56, chainAt: 0.3, bufferFrom: 0.06,
    keys: [
      K(0, {}),
      K(0.09, { hips: [0, -0.9, 0], spine: [0.05, -0.2, 0], chest: [0.05, -0.35, 0], head: [0, 0.9, 0], grip: [-0.32, 1.18, 0.02], spear: [-1.5, 0.12, 0], lgrip: 0.38, footL: [0.17, 0.08, 0.38], footR: [-0.2, 0.08, -0.26] }, 'out'),
      K(0.2, { hipsY: -0.12, hips: [0, 0.5, 0], spine: [0.1, 0.25, 0], chest: [0.1, 0.35, 0], head: [0, -0.6, 0], grip: [0.08, 1.18, 0.42], spear: [1.25, 0.05, -0.3], lgrip: 0.38, hipsOff: [0, 0.12], ...fwdFeet, footL: [0.17, 0.08, 0.55] }, 'snap'),
      K(0.32, { hipsY: -0.12, hips: [0, 0.65, 0], chest: [0.1, 0.45, 0], head: [0, -0.7, 0], grip: [0.15, 1.12, 0.3], spear: [1.6, -0.05, -0.4], lgrip: 0.38, ...fwdFeet, footL: [0.17, 0.08, 0.55] }),
      K(0.56, { ...fwdFeet }),
    ],
    hits: [{ t0: 0.1, t1: 0.25, dmg: 30, react: 'stagger', force: 2.5, stop: 0.05, shake: 0.15 }],
    advance: [[0.02, 0.22, 1.3]],
    next: { attack: 'N2', charge: 'C2' }, sfx: [[0.1, 'swing']],
  },
  N2: {
    dur: 0.54, chainAt: 0.28, bufferFrom: 0.05,
    keys: [
      K(0, { hips: [0, 0.6, 0], chest: [0.1, 0.45, 0], head: [0, -0.6, 0], grip: [0.15, 1.15, 0.3], spear: [1.55, 0.05, -0.3], ...fwdFeet }),
      K(0.07, { hips: [0, 0.75, 0], chest: [0.1, 0.5, 0], head: [0, -0.7, 0], grip: [0.18, 1.18, 0.25], spear: [1.85, 0.1, -0.3], ...fwdFeet }, 'out'),
      K(0.19, { hipsY: -0.12, hips: [0, -0.7, 0], spine: [0.1, -0.3, 0], chest: [0.1, -0.4, 0], head: [0, 0.9, 0], grip: [-0.35, 1.2, 0.3], spear: [-1.4, 0.1, 0.3], footR: [-0.22, 0.08, 0.3], footL: [0.2, 0.08, 0.05], hipsOff: [0, 0.1] }, 'snap'),
      K(0.3, { hipsY: -0.12, hips: [0, -0.85, 0], chest: [0.1, -0.5, 0], head: [0, 1.0, 0], grip: [-0.38, 1.15, 0.2], spear: [-1.75, 0, 0.35], footR: [-0.22, 0.08, 0.3], footL: [0.2, 0.08, 0.05] }),
      K(0.54, { footR: [-0.22, 0.08, 0.25], footL: [0.2, 0.08, 0.05] }),
    ],
    hits: [{ t0: 0.08, t1: 0.23, dmg: 30, react: 'stagger', force: 2.5, stop: 0.05, shake: 0.15 }],
    advance: [[0.02, 0.2, 1.2]],
    next: { attack: 'N3', charge: 'C3' }, sfx: [[0.08, 'swing']],
  },
  N3: {
    dur: 0.52, chainAt: 0.3, bufferFrom: 0.05,
    keys: [
      K(0, { footR: [-0.22, 0.08, 0.2], footL: [0.2, 0.08, 0.05] }),
      K(0.1, { hipsY: -0.1, hips: [0, -0.7, 0], chest: [0, -0.2, 0], head: [0, 0.7, 0], grip: [-0.25, 1.2, -0.3], spear: [0.12, 0.06, 0], lgrip: 0.55, footL: [0.18, 0.08, 0.2], footR: [-0.2, 0.08, -0.35] }, 'out'),
      K(0.18, { hipsY: -0.16, hips: [0, -0.3, 0], spine: [0.15, 0, 0], chest: [0.15, 0.05, 0], head: [0, 0.3, 0], grip: [-0.05, 1.2, 0.62], spear: [0.02, 0.03, 0], lgrip: 0.6, hipsOff: [0, 0.25], footL: [0.18, 0.08, 0.85], footR: [-0.2, 0.08, -0.35] }, 'snap'),
      K(0.3, { hipsY: -0.16, hips: [0, -0.3, 0], spine: [0.15, 0, 0], chest: [0.15, 0.05, 0], head: [0, 0.3, 0], grip: [-0.05, 1.2, 0.58], spear: [0.02, 0.03, 0], lgrip: 0.6, hipsOff: [0, 0.25], footL: [0.18, 0.08, 0.85], footR: [-0.2, 0.08, -0.35] }),
      K(0.52, { footL: [0.18, 0.08, 0.6], footR: [-0.2, 0.08, -0.3] }),
    ],
    hits: [{ t0: 0.11, t1: 0.22, dmg: 34, react: 'stagger', force: 3.5, stop: 0.06, shake: 0.2 }],
    advance: [[0.1, 0.2, 1.6]],
    next: { attack: 'N4', charge: 'C4' }, sfx: [[0.11, 'thrust']],
  },
  N4: {
    dur: 0.62, chainAt: 0.4, bufferFrom: 0.08,
    keys: [
      K(0, {}),
      K(0.08, { hipsY: -0.14, bodyYaw: 0.7, hips: [0, -0.2, 0], chest: [0.05, -0.3, 0], head: [0, 0.4, 0], grip: [-0.35, 1.2, 0.15], spear: [-1.3, 0.05, 0.2], lgrip: 0.3, footL: [0.25, 0.08, 0.15], footR: [-0.25, 0.08, -0.15] }, 'out'),
      K(0.22, { hipsY: -0.14, bodyYaw: -2.2, hips: [0, -0.2, 0], chest: [0.05, -0.3, 0], head: [0, 0.4, 0], grip: [-0.35, 1.2, 0.15], spear: [-1.3, 0.05, 0.2], lgrip: 0.3, footL: [0.25, 0.08, 0.15], footR: [-0.25, 0.08, -0.15] }),
      K(0.34, { hipsY: -0.14, bodyYaw: -5.6, hips: [0, -0.2, 0], chest: [0.05, -0.3, 0], head: [0, 0.4, 0], grip: [-0.35, 1.2, 0.15], spear: [-1.3, 0.05, 0.2], lgrip: 0.3, footL: [0.25, 0.08, 0.15], footR: [-0.25, 0.08, -0.15] }),
      K(0.42, { hipsY: -0.12, bodyYaw: -TAU - 0.1, grip: [-0.3, 1.15, 0.2], spear: [-1.0, 0, 0], lgrip: 0.35, footL: [0.22, 0.08, 0.2], footR: [-0.22, 0.08, -0.2] }),
      K(0.62, { bodyYaw: -TAU }),
    ],
    hits: [{ t0: 0.1, t1: 0.42, dmg: 32, react: 'knockback', force: 5, up: 2.5, stop: 0.05, shake: 0.2 }],
    advance: [[0.08, 0.4, 1.5]],
    next: { attack: 'N5', charge: 'C5' }, sfx: [[0.1, 'swing'], [0.25, 'swing']],
  },
  N5: {
    dur: 0.52, chainAt: 0.34, bufferFrom: 0.06,
    keys: [
      K(0, {}),
      K(0.07, { hips: [0, -0.6, 0], head: [0, 0.6, 0], grip: [-0.25, 1.18, -0.25], spear: [0.1, 0.05, 0], lgrip: 0.55 }, 'out'),
      K(0.14, { hipsY: -0.14, hips: [0, -0.25, 0], chest: [0.12, 0.05, 0], head: [0, 0.25, 0], grip: [-0.05, 1.2, 0.6], spear: [0.04, 0.04, 0], lgrip: 0.6, hipsOff: [0, 0.2], footL: [0.18, 0.08, 0.7] }, 'snap'),
      K(0.22, { hipsY: -0.12, hips: [0, -0.5, 0], head: [0, 0.5, 0], grip: [-0.22, 1.2, -0.15], spear: [-0.05, 0.08, 0], lgrip: 0.55, footL: [0.18, 0.08, 0.6] }, 'out'),
      K(0.29, { hipsY: -0.16, hips: [0, -0.2, 0], chest: [0.15, 0.05, 0], head: [0, 0.2, 0], grip: [-0.02, 1.22, 0.65], spear: [-0.02, 0.06, 0], lgrip: 0.6, hipsOff: [0, 0.25], footL: [0.18, 0.08, 0.85] }, 'snap'),
      K(0.52, { footL: [0.18, 0.08, 0.55] }),
    ],
    hits: [
      { t0: 0.09, t1: 0.16, dmg: 22, react: 'stagger', force: 2, stop: 0.04, shake: 0.12 },
      { t0: 0.24, t1: 0.32, dmg: 24, react: 'stagger', force: 3, stop: 0.05, shake: 0.15 },
    ],
    advance: [[0.05, 0.3, 1.8]],
    next: { attack: 'N6', charge: 'C6' }, sfx: [[0.09, 'thrust'], [0.24, 'thrust']],
  },
  N6: {
    dur: 0.78, chainAt: 0.7, bufferFrom: 0.5,
    keys: [
      K(0, {}),
      K(0.14, { hipsY: -0.02, hips: [0, -0.3, 0], chest: [-0.15, 0, 0], head: [-0.1, 0.3, 0], grip: [-0.1, 1.62, -0.05], spear: [0.05, 1.3, 0], lgrip: 0.35, lift: 0.18, footL: [0.17, 0.12, 0.35] }, 'out'),
      K(0.26, { hipsY: -0.22, spine: [0.2, 0, 0], chest: [0.35, 0.05, 0], head: [-0.2, 0.3, 0], grip: [-0.05, 0.95, 0.55], spear: [0.05, -0.38, 0], lgrip: 0.45, hipsOff: [0, 0.2], lift: 0, footL: [0.2, 0.08, 0.75], footR: [-0.2, 0.08, -0.3] }, 'in'),
      K(0.48, { hipsY: -0.22, spine: [0.2, 0, 0], chest: [0.35, 0.05, 0], head: [-0.2, 0.3, 0], grip: [-0.05, 0.97, 0.52], spear: [0.05, -0.36, 0], lgrip: 0.45, hipsOff: [0, 0.2], footL: [0.2, 0.08, 0.75], footR: [-0.2, 0.08, -0.3] }),
      K(0.78, { footL: [0.2, 0.08, 0.5] }),
    ],
    hits: [
      { t0: 0.16, t1: 0.27, dmg: 30, react: 'stagger', force: 2, stop: 0.04 },
      { t0: 0.26, t1: 0.3, dmg: 45, react: 'knockback', force: 7, up: 4, stop: 0.09, shake: 0.5, area: { r: 3.4, x: 0, z: 2.0 }, fx: 'slam' },
    ],
    advance: [[0.1, 0.26, 1.4]],
    next: {}, sfx: [[0.14, 'swing'], [0.26, 'slam']],
  },

  // ---- charge attacks
  C1: {
    dur: 0.66, chainAt: 0.6, bufferFrom: 0.4,
    keys: [
      K(0, {}),
      K(0.12, { hipsY: -0.2, chest: [0.3, 0, 0], head: [-0.2, 0.25, 0], grip: [-0.25, 0.85, 0.0], spear: [0.1, -0.45, 0], lgrip: 0.4, footL: [0.18, 0.08, 0.45] }, 'out'),
      K(0.22, { hipsY: 0, chest: [-0.2, 0, 0], head: [-0.25, 0.25, 0], grip: [-0.05, 1.45, 0.3], spear: [0.05, 1.05, 0], lgrip: 0.4, lift: 0.12, footL: [0.18, 0.1, 0.5] }, 'snap'),
      K(0.4, { hipsY: 0, chest: [-0.2, 0, 0], head: [-0.25, 0.25, 0], grip: [-0.05, 1.45, 0.3], spear: [0.05, 1.0, 0], lgrip: 0.4, footL: [0.18, 0.08, 0.5] }),
      K(0.66, {}),
    ],
    hits: [{ t0: 0.12, t1: 0.26, dmg: 30, react: 'launch', force: 1.2, up: 8, stop: 0.07, shake: 0.25 }],
    advance: [[0.08, 0.22, 1.0]], next: {}, sfx: [[0.12, 'heavy']],
  },
  C2: {
    dur: 0.68, chainAt: 0.62, bufferFrom: 0.4,
    keys: [
      K(0, {}),
      K(0.1, { hipsY: -0.2, hips: [0, -0.7, 0], chest: [0.2, -0.4, 0], head: [0, 0.7, 0], grip: [-0.35, 0.95, 0.1], spear: [-1.3, -0.4, 0.3], lgrip: 0.35 }, 'out'),
      K(0.28, { hipsY: 0, hips: [0, 0.5, 0], chest: [-0.1, 0.4, 0], head: [-0.2, -0.4, 0], grip: [0.1, 1.5, 0.3], spear: [1.3, 0.9, -0.5], lgrip: 0.35, lift: 0.7, footL: [0.15, 0.3, 0.2], footR: [-0.15, 0.2, -0.1] }, 'snap'),
      K(0.45, { hips: [0, 0.5, 0], chest: [-0.1, 0.4, 0], grip: [0.1, 1.45, 0.3], spear: [1.4, 0.8, -0.5], lift: 0.35, footL: [0.15, 0.2, 0.2], footR: [-0.15, 0.15, -0.1] }),
      K(0.68, { hipsY: -0.12 }),
    ],
    hits: [{ t0: 0.1, t1: 0.3, dmg: 36, react: 'launch', force: 1.5, up: 8.5, stop: 0.07, shake: 0.25 }],
    advance: [[0.1, 0.3, 1.4]], next: {}, sfx: [[0.1, 'heavy']],
  },
  C3: (() => {
    const keys = [K(0, {})];
    const hits = [];
    for (let i = 0; i < 6; i++) {
      const tb = 0.06 + i * 0.09, tf = tb + 0.045;
      const yaw = (i % 2 ? 0.18 : -0.12) + Math.sin(i * 2.3) * 0.05;
      keys.push(K(tb, { hipsY: -0.14, hips: [0, -0.45, 0], chest: [0.12, 0.05, 0], head: [0, 0.4, 0], grip: [-0.2, 1.2, -0.12], spear: [yaw, 0.06, 0], lgrip: 0.55, footL: [0.2, 0.08, 0.6] }, 'out'));
      keys.push(K(tf, { hipsY: -0.16, hips: [0, -0.25, 0], chest: [0.16, 0.08, 0], head: [0, 0.25, 0], grip: [-0.03, 1.22, 0.65], spear: [yaw * 0.6, 0.04 + (i % 3) * 0.04, 0], lgrip: 0.6, hipsOff: [0, 0.2], footL: [0.2, 0.08, 0.65] }, 'snap'));
      hits.push({ t0: tf - 0.03, t1: tf + 0.025, dmg: 11, react: 'stagger', force: 0.6, stop: 0.025, shake: 0.06, arc: 2.6 });
    }
    keys.push(K(0.68, { hipsY: -0.12, hips: [0, -0.8, 0], chest: [0.05, -0.2, 0], head: [0, 0.8, 0], grip: [-0.28, 1.2, -0.38], spear: [0.06, 0.05, 0], lgrip: 0.55, footL: [0.2, 0.08, 0.4] }, 'out'));
    keys.push(K(0.8, { hipsY: -0.2, hips: [0, -0.2, 0], spine: [0.2, 0, 0], chest: [0.2, 0.05, 0], head: [0, 0.2, 0], grip: [0, 1.22, 0.75], spear: [0.02, 0.03, 0], lgrip: 0.62, hipsOff: [0, 0.3], footL: [0.2, 0.08, 0.95], footR: [-0.2, 0.08, -0.45] }, 'snap'));
    keys.push(K(0.98, { hipsY: -0.2, hips: [0, -0.2, 0], spine: [0.2, 0, 0], chest: [0.2, 0.05, 0], head: [0, 0.2, 0], grip: [0, 1.22, 0.72], spear: [0.02, 0.03, 0], lgrip: 0.62, hipsOff: [0, 0.3], footL: [0.2, 0.08, 0.95], footR: [-0.2, 0.08, -0.45] }));
    keys.push(K(1.18, { footL: [0.2, 0.08, 0.6] }));
    hits.push({ t0: 0.74, t1: 0.84, dmg: 42, react: 'knockback', force: 9, up: 3, stop: 0.1, shake: 0.45, arc: 3.2 });
    return { dur: 1.18, chainAt: 1.1, bufferFrom: 0.9, keys, hits, advance: [[0.05, 0.6, 1.0], [0.74, 0.8, 1.6]], next: {}, sfx: [0.1, 0.19, 0.28, 0.37, 0.46, 0.55].map((t) => [t - 0.03, 'thrust']).concat([[0.74, 'heavy']]) };
  })(),
  C4: {
    dur: 0.98, chainAt: 0.92, bufferFrom: 0.7,
    keys: [
      K(0, {}),
      K(0.1, { hipsY: -0.22, bodyYaw: 0.6, grip: [-0.35, 1.15, 0.15], spear: [-1.3, 0.1, 0.2], lgrip: 0.3, footL: [0.25, 0.08, 0.15], footR: [-0.25, 0.08, -0.15] }, 'out'),
      K(0.3, { hipsY: -0.05, bodyYaw: -2.5, lift: 0.9, grip: [-0.35, 1.2, 0.15], spear: [-1.3, 0.05, 0.2], lgrip: 0.3, footL: [0.15, 0.35, 0.1], footR: [-0.15, 0.3, -0.1] }),
      K(0.5, { hipsY: -0.05, bodyYaw: -6.6, lift: 1.1, grip: [-0.35, 1.2, 0.15], spear: [-1.3, 0.0, 0.2], lgrip: 0.3, footL: [0.15, 0.35, 0.1], footR: [-0.15, 0.3, -0.1] }),
      K(0.66, { hipsY: -0.1, bodyYaw: -2 * TAU - 0.3, lift: 0.2, grip: [-0.3, 1.15, 0.2], spear: [-1.0, -0.1, 0], lgrip: 0.35, footL: [0.2, 0.15, 0.15], footR: [-0.2, 0.12, -0.15] }),
      K(0.74, { hipsY: -0.22, bodyYaw: -2 * TAU, lift: 0, grip: [-0.3, 1.1, 0.2], spear: [-0.8, -0.15, 0], footL: [0.22, 0.08, 0.2], footR: [-0.22, 0.08, -0.2] }),
      K(0.98, { bodyYaw: -2 * TAU }),
    ],
    hits: [
      { t0: 0.12, t1: 0.42, dmg: 30, react: 'knockback', force: 5, up: 4, stop: 0.05, shake: 0.2 },
      { t0: 0.42, t1: 0.68, dmg: 32, react: 'knockback', force: 6, up: 5, stop: 0.06, shake: 0.25 },
    ],
    advance: [[0.1, 0.66, 2.5]], next: {}, sfx: [[0.12, 'swing'], [0.3, 'swing'], [0.48, 'swing']],
  },
  C5: {
    dur: 1.05, chainAt: 1.0, bufferFrom: 0.8,
    keys: [
      K(0, {}),
      K(0.12, { hipsY: -0.25, grip: [-0.1, 1.5, -0.05], spear: [0.05, 1.2, 0], lgrip: 0.35, chest: [0.1, 0, 0] }, 'out'),
      K(0.38, { hipsY: 0, lift: 2.0, chest: [-0.2, 0, 0], head: [0.2, 0.25, 0], grip: [-0.1, 1.68, -0.05], spear: [0.05, 1.5, 0], lgrip: 0.35, footL: [0.15, 0.4, 0.15], footR: [-0.15, 0.3, -0.15] }, 'out'),
      K(0.52, { hipsY: -0.25, lift: 0, spine: [0.25, 0, 0], chest: [0.4, 0, 0], head: [-0.3, 0.25, 0], grip: [-0.05, 0.9, 0.55], spear: [0.05, -0.5, 0], lgrip: 0.45, footL: [0.2, 0.08, 0.6], footR: [-0.2, 0.08, -0.3] }, 'in'),
      K(0.8, { hipsY: -0.25, spine: [0.25, 0, 0], chest: [0.4, 0, 0], head: [-0.3, 0.25, 0], grip: [-0.05, 0.92, 0.52], spear: [0.05, -0.48, 0], lgrip: 0.45, footL: [0.2, 0.08, 0.6], footR: [-0.2, 0.08, -0.3] }),
      K(1.05, {}),
    ],
    hits: [{ t0: 0.5, t1: 0.56, dmg: 60, react: 'launch', force: 4, up: 7, stop: 0.12, shake: 0.8, area: { r: 5.2, x: 0, z: 1.5 }, fx: 'bigslam' }],
    advance: [[0.1, 0.5, 3.0]], next: {}, sfx: [[0.12, 'jump'], [0.5, 'slam']],
  },
  C6: (() => {
    const hits = [];
    for (let t = 0.2; t < 0.6; t += 0.08) hits.push({ t0: t, t1: t + 0.06, dmg: 8, react: 'drag', force: 0, stop: 0.015, shake: 0.06, arc: 2.2 });
    hits.push({ t0: 0.66, t1: 0.76, dmg: 48, react: 'knockback', force: 12, up: 4, stop: 0.12, shake: 0.6, arc: 3.2, fx: 'burst' });
    const lunge = { hipsY: -0.2, spine: [0.25, 0, 0], chest: [0.25, 0.05, 0], head: [-0.2, 0.2, 0], grip: [-0.05, 1.15, 0.72], spear: [0.02, 0.02, 0], lgrip: 0.6, hipsOff: [0, 0.3], footL: [0.2, 0.08, 0.9], footR: [-0.2, 0.3, -0.55], lift: 0.12 };
    return {
      dur: 1.0, chainAt: 0.95, bufferFrom: 0.8,
      keys: [
        K(0, {}),
        K(0.12, { hipsY: -0.18, hips: [0, -0.6, 0], chest: [0.25, -0.1, 0], head: [0, 0.5, 0], grip: [-0.25, 1.15, -0.3], spear: [0.05, 0.02, 0], lgrip: 0.55, footL: [0.2, 0.08, 0.4] }, 'out'),
        K(0.2, lunge, 'snap'),
        K(0.6, lunge),
        K(0.72, { ...lunge, grip: [0, 1.2, 0.85], lift: 0 }, 'snap'),
        K(1.0, {}),
      ],
      hits, advance: [[0.15, 0.65, 8.5]], next: {}, sfx: [[0.15, 'dash'], [0.66, 'heavy']], drag: [0.18, 0.66],
    };
  })(),

  // ---- misc
  JUMP_ATTACK: {
    dur: 0.5, chainAt: 0.5, bufferFrom: 1,
    keys: [
      K(0, { lift: 0, footL: [0.15, 0.4, 0.15], footR: [-0.15, 0.3, -0.15] }),
      K(0.08, { grip: [-0.15, 1.5, 0.0], spear: [0.0, 0.4, 0], footL: [0.15, 0.4, 0.15], footR: [-0.15, 0.3, -0.15] }, 'out'),
      K(0.2, { chest: [0.45, 0, 0], grip: [-0.05, 1.0, 0.45], spear: [0.0, -0.9, 0], lgrip: 0.45, footL: [0.15, 0.3, 0.2], footR: [-0.15, 0.25, -0.2] }, 'snap'),
      K(0.5, { chest: [0.45, 0, 0], grip: [-0.05, 1.0, 0.45], spear: [0.0, -0.9, 0], lgrip: 0.45, footL: [0.15, 0.3, 0.2], footR: [-0.15, 0.25, -0.2] }),
    ],
    hits: [{ t0: 0.1, t1: 0.5, dmg: 26, react: 'knockback', force: 3, up: 3, stop: 0.05, shake: 0.2 }],
    advance: [], next: {}, air: true, sfx: [[0.1, 'thrust']],
  },
  LAND_SLAM: {
    dur: 0.42, chainAt: 0.3, bufferFrom: 0.2,
    keys: [
      K(0, { hipsY: -0.28, chest: [0.45, 0, 0], grip: [-0.05, 0.9, 0.5], spear: [0.0, -0.6, 0], lgrip: 0.45 }),
      K(0.42, {}),
    ],
    hits: [{ t0: 0, t1: 0.06, dmg: 20, react: 'knockback', force: 4, up: 3, stop: 0.06, shake: 0.35, area: { r: 2.6, x: 0, z: 0.6 }, fx: 'slam' }],
    advance: [], next: { attack: 'N1' }, sfx: [[0, 'slam']],
  },
  DODGE: {
    dur: 0.42, chainAt: 0.3, bufferFrom: 0.15, iframes: [0.0, 0.3],
    keys: [
      K(0, {}),
      K(0.08, { hipsY: -0.25, spine: [0.3, 0, 0], chest: [0.3, 0, 0], grip: [-0.3, 0.95, -0.05], spear: [Math.PI + 0.3, 0.1, 0], lfree: 1, lpos: [0.3, 0.9, -0.2], footL: [0.2, 0.15, 0.35], footR: [-0.2, 0.2, -0.45] }, 'out'),
      K(0.28, { hipsY: -0.22, spine: [0.25, 0, 0], chest: [0.25, 0, 0], grip: [-0.3, 0.95, -0.05], spear: [Math.PI + 0.3, 0.1, 0], lfree: 1, lpos: [0.3, 0.9, -0.2], footL: [0.2, 0.08, 0.4], footR: [-0.22, 0.08, -0.35] }),
      K(0.42, {}),
    ],
    hits: [], advance: [[0.0, 0.3, 4.6]], next: { attack: 'N1', charge: 'C1' }, sfx: [[0, 'dash']],
  },
  HURT: {
    dur: 0.36, chainAt: 0.36, bufferFrom: 1,
    keys: [
      K(0, {}),
      K(0.06, { hipsY: -0.12, spine: [-0.2, 0, 0], chest: [-0.3, 0.1, 0.1], head: [-0.35, 0.2, 0], grip: [-0.2, 1.0, 0.0], spear: [0.3, 0.3, 0] }, 'snap'),
      K(0.36, {}),
    ],
    hits: [], advance: [[0, 0.15, -0.6]], next: {},
  },
  KNOCKDOWN: {
    dur: 1.6, chainAt: 1.6, bufferFrom: 2, iframes: [0, 1.5],
    keys: [
      K(0, {}),
      K(0.25, { hipsY: -0.15, bodyPitch: -0.9, lift: 0.6, chest: [-0.4, 0, 0], head: [-0.3, 0, 0], grip: [-0.3, 1.2, 0.2], spear: [0.4, 0.8, 0], lfree: 1, lpos: [0.4, 1.3, 0.2] }),
      K(0.55, { hipsY: -0.2, bodyPitch: -1.45, lift: 0.22, chest: [-0.2, 0, 0], head: [0.3, 0, 0], grip: [-0.35, 1.0, 0.1], spear: [0.3, 0.1, 0], lfree: 1, lpos: [0.4, 1.0, 0.0], footL: [0.15, 0.08, 0.25], footR: [-0.15, 0.08, 0.2] }, 'in'),
      K(1.05, { hipsY: -0.2, bodyPitch: -1.45, lift: 0.22, chest: [-0.2, 0, 0], head: [0.3, 0, 0], grip: [-0.35, 1.0, 0.1], spear: [0.3, 0.1, 0], lfree: 1, lpos: [0.4, 1.0, 0.0], footL: [0.15, 0.08, 0.25], footR: [-0.15, 0.08, 0.2] }),
      K(1.3, { hipsY: -0.45, chest: [0.4, 0, 0], grip: [-0.25, 0.7, 0.3], spear: [0.2, -0.1, 0], footL: [0.2, 0.08, 0.35], footR: [-0.2, 0.3, -0.3] }),
      K(1.6, {}),
    ],
    hits: [], advance: [[0, 0.5, -2.8]], next: {},
  },
  DEFEAT: {
    dur: 2.0, chainAt: 99, bufferFrom: 99,
    keys: [
      K(0, {}),
      K(0.4, { hipsY: -0.35, chest: [0.4, 0, 0], head: [0.4, 0, 0], grip: [-0.25, 0.75, 0.35], spear: [0.1, -0.7, 0], lgrip: 0.4, footL: [0.2, 0.08, 0.35], footR: [-0.2, 0.08, -0.2] }),
      K(1.2, { hipsY: -0.55, chest: [0.5, 0, 0], head: [0.5, 0, 0], grip: [-0.25, 0.6, 0.4], spear: [0.1, -1.1, 0], lgrip: 0.35, footL: [0.2, 0.08, 0.4], footR: [-0.2, 0.25, -0.35] }),
      K(2.0, { hipsY: -0.55, chest: [0.55, 0, 0], head: [0.6, 0, 0], grip: [-0.25, 0.6, 0.4], spear: [0.1, -1.1, 0], lgrip: 0.35, footL: [0.2, 0.08, 0.4], footR: [-0.2, 0.25, -0.35] }),
    ],
    hits: [], advance: [], next: {},
  },
  VICTORY: {
    dur: 2.5, chainAt: 99, bufferFrom: 99,
    keys: [
      K(0, {}),
      K(0.4, { hips: [0, 0, 0], chest: [-0.05, 0, 0], head: [-0.15, 0, 0], grip: [-0.25, 1.15, 0.3], spear: [0.3, 1.8, 0], lgrip: 0.35, lfree: 1, lpos: [0.28, 1.0, 0.15], footL: [0.16, 0.08, 0.15], footR: [-0.16, 0.08, -0.1] }, 'out'),
      K(0.9, { hips: [0, 0, 0], chest: [-0.12, 0, 0], head: [-0.25, 0, 0], grip: [-0.2, 1.75, 0.05], spear: [0.0, 1.55, 0], lgrip: 0.35, lfree: 1, lpos: [0.28, 1.0, 0.15], footL: [0.16, 0.08, 0.15], footR: [-0.16, 0.08, -0.1] }, 'snap'),
      K(2.5, { hips: [0, 0, 0], chest: [-0.12, 0, 0], head: [-0.25, 0, 0], grip: [-0.2, 1.75, 0.05], spear: [0.0, 1.55, 0], lgrip: 0.35, lfree: 1, lpos: [0.28, 1.0, 0.15], footL: [0.16, 0.08, 0.15], footR: [-0.16, 0.08, -0.1] }),
    ],
    hits: [], advance: [], next: {},
  },
};

// Musou: "Soaring Dragon" — overhead twirl, thrust flurry, then a dragon burst.
HERO_MOVES.MUSOU = (() => {
  const keys = [K(0, {})];
  const hits = [];
  const sfx = [[0, 'musou']];
  // overhead twirl (spear spins around vertical axis above head)
  for (let i = 0; i <= 8; i++) {
    const t = 0.15 + i * 0.09;
    keys.push(K(t, { hipsY: -0.12, chest: [-0.05, 0, 0], head: [-0.1, 0, 0], grip: [-0.05, 1.72, 0.05], spear: [0.6 + i * 1.65, 0.12, 0], lgrip: 0.3, lfree: 1, lpos: [0.3, 1.25, 0.25], footL: [0.22, 0.08, 0.15], footR: [-0.22, 0.08, -0.15] }));
    if (i % 2 === 0 && i < 8) { hits.push({ t0: t, t1: t + 0.1, dmg: 14, react: 'stagger', force: 1.5, stop: 0.02, shake: 0.1, area: { r: 3.8, x: 0, z: 0 } }); sfx.push([t, 'swing']); }
  }
  // thrust flurry while advancing
  for (let i = 0; i < 12; i++) {
    const tb = 0.95 + i * 0.11, tf = tb + 0.05;
    const yaw = Math.sin(i * 1.9) * 0.35;
    keys.push(K(tb, { hipsY: -0.14, hips: [0, -0.45, 0], chest: [0.12, 0.05, 0], head: [0, 0.4, 0], grip: [-0.2, 1.2, -0.12], spear: [yaw, 0.06 + Math.cos(i) * 0.08, 0], lgrip: 0.55, footL: [0.2, 0.08, 0.6] }, 'out'));
    keys.push(K(tf, { hipsY: -0.16, hips: [0, -0.25, 0], chest: [0.16, 0.08, 0], head: [0, 0.25, 0], grip: [-0.03, 1.22, 0.68], spear: [yaw * 0.7, 0.04, 0], lgrip: 0.6, hipsOff: [0, 0.2], footL: [0.2, 0.08, 0.65] }, 'snap'));
    hits.push({ t0: tf - 0.03, t1: tf + 0.03, dmg: 14, react: 'stagger', force: 0.8, stop: 0.015, shake: 0.08, arc: 3.6, area: { r: 3.0, x: 0, z: 2.0 } });
    sfx.push([tf - 0.03, 'thrust']);
  }
  // finisher
  keys.push(K(2.4, { hipsY: -0.05, hips: [0, -0.3, 0], chest: [-0.2, 0, 0], head: [-0.2, 0.3, 0], grip: [-0.15, 1.7, -0.1], spear: [0.05, 1.35, 0], lgrip: 0.35, lift: 0.4, footL: [0.17, 0.2, 0.3] }, 'out'));
  keys.push(K(2.55, { hipsY: -0.24, spine: [0.25, 0, 0], chest: [0.35, 0.05, 0], head: [-0.2, 0.3, 0], grip: [-0.02, 1.0, 0.7], spear: [0.03, -0.25, 0], lgrip: 0.5, hipsOff: [0, 0.25], lift: 0, footL: [0.2, 0.08, 0.85], footR: [-0.2, 0.08, -0.4] }, 'in'));
  keys.push(K(3.0, { hipsY: -0.24, spine: [0.25, 0, 0], chest: [0.35, 0.05, 0], head: [-0.2, 0.3, 0], grip: [-0.02, 1.0, 0.68], spear: [0.03, -0.24, 0], lgrip: 0.5, hipsOff: [0, 0.25], footL: [0.2, 0.08, 0.85], footR: [-0.2, 0.08, -0.4] }));
  keys.push(K(3.3, {}));
  hits.push({ t0: 2.55, t1: 2.62, dmg: 140, react: 'launch', force: 9, up: 9, stop: 0.18, shake: 1.2, area: { r: 8.5, x: 0, z: 2.5 }, fx: 'dragon' });
  sfx.push([2.55, 'boom']);
  return { dur: 3.3, chainAt: 99, bufferFrom: 99, keys, hits, advance: [[0.95, 2.3, 5.0]], next: {}, sfx, iframes: [0, 3.3], musou: true };
})();

// ------------------------------------------------------------------ Officer movesets
const SW = {
  hips: [0, -0.5, 0], chest: [0.05, 0.15, 0], head: [0, 0.3, 0], grip: [-0.28, 1.12, 0.32], spear: [0.15, 0.5, 0], lfree: 1, lpos: [0.22, 1.0, -0.05],
  footL: [0.18, 0.08, 0.3], footR: [-0.2, 0.08, -0.3],
};
const KS = (t, o, e) => K(t, o, e, { ...BASE, ...SW });

export const SWORD_MOVES = {
  S1: {
    dur: 1.0, keys: [
      KS(0, {}),
      KS(0.42, { hips: [0, -0.9, 0], chest: [0, -0.4, 0], head: [0, 0.9, 0], grip: [-0.35, 1.5, 0.0], spear: [-0.6, 1.0, -0.8] }, 'out'),
      KS(0.55, { hipsY: -0.14, hips: [0, 0.3, 0], chest: [0.15, 0.3, 0], head: [0, -0.3, 0], grip: [0.15, 1.0, 0.45], spear: [0.9, -0.5, -0.4], footL: [0.18, 0.08, 0.6], hipsOff: [0, 0.15] }, 'snap'),
      KS(0.75, { hipsY: -0.14, hips: [0, 0.35, 0], chest: [0.15, 0.3, 0], grip: [0.18, 1.0, 0.4], spear: [1.0, -0.55, -0.4], footL: [0.18, 0.08, 0.6] }),
      KS(1.0, {}),
    ],
    hits: [{ t0: 0.44, t1: 0.6, dmg: 24, react: 'stagger', force: 2 }], advance: [[0.36, 0.55, 2.2]], tele: 0.42, sfx: [[0.44, 'swing']],
  },
  S2: {
    dur: 0.9, keys: [
      KS(0, {}),
      KS(0.32, { hips: [0, 0.5, 0], chest: [0, 0.5, 0], head: [0, -0.5, 0], grip: [0.15, 1.3, 0.25], spear: [1.3, 0.3, 0.6] }, 'out'),
      KS(0.45, { hipsY: -0.12, hips: [0, -0.7, 0], chest: [0.1, -0.4, 0], head: [0, 0.7, 0], grip: [-0.4, 1.1, 0.4], spear: [-1.3, -0.1, 0.4], footL: [0.18, 0.08, 0.5] }, 'snap'),
      KS(0.9, {}),
    ],
    hits: [{ t0: 0.34, t1: 0.5, dmg: 24, react: 'stagger', force: 2 }], advance: [[0.28, 0.45, 1.8]], tele: 0.32, sfx: [[0.34, 'swing']],
  },
  S3: {
    dur: 1.0, keys: [
      KS(0, {}),
      KS(0.45, { hipsY: -0.1, hips: [0, -0.8, 0], head: [0, 0.8, 0], grip: [-0.25, 1.3, -0.15], spear: [0.05, 0.05, 1.57] }, 'out'),
      KS(0.55, { hipsY: -0.16, hips: [0, -0.3, 0], chest: [0.15, 0, 0], head: [0, 0.3, 0], grip: [-0.08, 1.28, 0.62], spear: [0.0, 0.0, 1.57], footL: [0.18, 0.08, 0.8], hipsOff: [0, 0.25] }, 'snap'),
      KS(0.8, { hipsY: -0.16, hips: [0, -0.3, 0], grip: [-0.08, 1.28, 0.6], spear: [0.0, 0.0, 1.57], footL: [0.18, 0.08, 0.8] }),
      KS(1.0, {}),
    ],
    hits: [{ t0: 0.47, t1: 0.6, dmg: 34, react: 'knockback', force: 6, up: 2 }], advance: [[0.42, 0.56, 3.2]], tele: 0.45, sfx: [[0.47, 'thrust']],
  },
};

// Officers wielding polearms reuse the hero's moves with a telegraph hold on the windup.
function officerVariant(m, holdAt, hold, dmgScale = 0.65) {
  return {
    ...m, hold: { at: holdAt, dur: hold }, tele: holdAt + hold,
    hits: m.hits.map((h) => ({ ...h, dmg: Math.round(h.dmg * dmgScale), stop: 0 })),
  };
}
export const POLEARM_MOVES = {
  P1: officerVariant(HERO_MOVES.N1, 0.09, 0.32),
  P2: officerVariant(HERO_MOVES.N2, 0.07, 0.28),
  P3: officerVariant(HERO_MOVES.N3, 0.1, 0.36),
  P4: officerVariant(HERO_MOVES.N4, 0.08, 0.4, 0.45),
  P5: officerVariant(HERO_MOVES.C4, 0.1, 0.45, 0.4),
};

export function mappedTime(move, t) {
  if (!move.hold) return t;
  const { at, dur } = move.hold;
  if (t < at) return t;
  if (t < at + dur) return at;
  return t - dur;
}
export function moveDuration(move) { return move.dur + (move.hold ? move.hold.dur : 0); }
