import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundAt, constrain, pushOutOfHouses, pathInfo, pointAt, CORRIDOR, steerAround } from '../world/level.js';
import { angleDiff, clamp } from '../core/noise.js';
import { makeArmorTextures } from '../world/textures.js';
import { D } from '../data/difficulty.js';
import { applyGates, gateWaypoint } from '../world/gates.js';

// ------------------------------------------------------------------ geometry (vertex-coloured, merged per part)
function colored(geo, rgb) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const T = (g, x, y, z) => { g.translate(x, y, z); return g; };
const lathe = (pts, seg = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

const BLUE = [0.12, 0.2, 0.42], BLUE2 = [0.08, 0.12, 0.26], IRON = [0.24, 0.25, 0.27], LEATHER = [0.2, 0.13, 0.08], SKIN = [0.75, 0.55, 0.42], BRASS = [0.55, 0.42, 0.18], RED = [0.55, 0.06, 0.05], WOOD = [0.3, 0.2, 0.12], STEEL = [0.7, 0.72, 0.75];

function buildParts() {
  // body: origin at hips pivot
  const torso = colored(lathe([[0.001, -0.02], [0.15, 0], [0.155, 0.2], [0.19, 0.38], [0.17, 0.5], [0.08, 0.56], [0.001, 0.57]], 14).scale(1, 1, 0.72), BLUE);
  const vest = colored(lathe([[0.165, 0.12], [0.2, 0.36], [0.182, 0.5]], 14).scale(1.02, 1, 0.76), IRON);
  const belt = colored(new THREE.TorusGeometry(0.155, 0.03, 6, 16).rotateX(Math.PI / 2).scale(1, 1, 0.74), LEATHER);
  const skirt = colored(lathe([[0.16, 0.02], [0.2, -0.18], [0.25, -0.42]], 14).scale(1, 1, 0.8), BLUE2);
  const shoulders = [-1, 1].map((sx) => colored(T(new THREE.SphereGeometry(0.085, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1), sx * 0.2, 0.47, 0), IRON));
  const body = mergeGeometries([torso, vest, belt, skirt, ...shoulders]);
  // head: origin at neck base
  const neck = colored(T(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), 0, 0.04, 0), SKIN);
  const face = colored(T(new THREE.SphereGeometry(0.095, 12, 10).scale(0.9, 1.1, 1), 0, 0.15, 0.005), SKIN);
  const helm = colored(T(new THREE.ConeGeometry(0.125, 0.2, 12, 1, true), 0, 0.29, -0.005), IRON);
  const brim = colored(T(new THREE.CylinderGeometry(0.128, 0.13, 0.04, 12), 0, 0.2, -0.005), IRON);
  const tassel = colored(T(new THREE.ConeGeometry(0.04, 0.12, 6).rotateX(Math.PI), 0, 0.42, -0.005), RED);
  const flap = colored(T(new THREE.CylinderGeometry(0.13, 0.15, 0.12, 10, 1, true, Math.PI * 0.6, Math.PI * 0.8), 0, 0.14, -0.01), IRON);
  const head = mergeGeometries([neck, face, helm, brim, tassel, flap]);
  const upperArm = mergeGeometries([colored(T(new THREE.CapsuleGeometry(0.05, 0.2, 3, 8), 0, -0.14, 0), BLUE)]);
  const lowerArm = mergeGeometries([colored(T(new THREE.CapsuleGeometry(0.043, 0.18, 3, 8), 0, -0.12, 0), BLUE), colored(T(new THREE.CylinderGeometry(0.05, 0.046, 0.14, 8), 0, -0.16, 0), LEATHER), colored(T(new THREE.BoxGeometry(0.07, 0.08, 0.08), 0, -0.27, 0), SKIN)]);
  const upperLeg = mergeGeometries([colored(T(new THREE.CapsuleGeometry(0.068, 0.28, 3, 8), 0, -0.21, 0), BLUE2)]);
  const lowerLeg = mergeGeometries([colored(T(new THREE.CapsuleGeometry(0.055, 0.28, 3, 8), 0, -0.19, 0), LEATHER), colored(T(new THREE.CylinderGeometry(0.064, 0.058, 0.22, 8), 0, -0.2, 0), [0.5, 0.45, 0.38]), colored(T(new THREE.BoxGeometry(0.09, 0.08, 0.22), 0, -0.42, 0.04), LEATHER)]);
  // weapons along -Y of the forearm, origin at hand
  const spear = mergeGeometries([
    colored(T(new THREE.CylinderGeometry(0.016, 0.018, 2.4, 6), 0, -0.4, 0), WOOD),
    colored(T(new THREE.ConeGeometry(0.035, 0.26, 4).rotateX(Math.PI), 0, -1.72, 0), STEEL),
    colored(T(new THREE.ConeGeometry(0.04, 0.1, 6), 0, -1.56, 0), RED),
  ]);
  const sword = mergeGeometries([
    colored(T(new THREE.BoxGeometry(0.05, 0.75, 0.012), 0, -0.48, 0), STEEL),
    colored(T(new THREE.BoxGeometry(0.12, 0.025, 0.04), 0, -0.1, 0), BRASS),
    colored(T(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 6), 0, 0.0, 0), LEATHER),
  ]);
  const shield = mergeGeometries([
    colored(T(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16).rotateZ(Math.PI / 2), 0.05, -0.2, 0), [0.32, 0.12, 0.08]),
    colored(T(new THREE.SphereGeometry(0.07, 8, 6).scale(0.5, 1, 1), 0.08, -0.2, 0), BRASS),
    colored(T(new THREE.TorusGeometry(0.27, 0.018, 6, 20).rotateY(Math.PI / 2), 0.07, -0.2, 0), IRON),
  ]);
  return { body, head, upperArm, lowerArm, upperLeg, lowerLeg, spear, sword, shield };
}

// ------------------------------------------------------------------ matrix helpers
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3(), _sc = new THREE.Vector3();
function child(out, parent, x, y, z, rx, ry, rz) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _v.set(x, y, z);
  _m.compose(_v, _q, _one);
  return out.multiplyMatrices(parent, _m);
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export const MAX_GRUNTS = 170;

// ------------------------------------------------------------------ crowd
// Strongest officer command reaching a point: full within 18 m, fading out by 30 m.
function commandAt(cmds, x, z) {
  let c = 0;
  for (const o of cmds) {
    const k = Math.min(1, Math.max(0, (30 - Math.hypot(o.pos.x - x, o.pos.z - z)) / 12));
    c = Math.max(c, o.def.command * k);
  }
  return c;
}

export class Crowd {
  constructor(scene) {
    const parts = buildParts();
    const at = makeArmorTextures();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.2, roughnessMap: at.rough, normalMap: at.normal, normalScale: new THREE.Vector2(0.8, 0.8) });
    const mk = (geo, mult = 1) => {
      const m = new THREE.InstancedMesh(geo, mat, MAX_GRUNTS * mult);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      for (let i = 0; i < MAX_GRUNTS * mult; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, new THREE.Color(1, 1, 1)); }
      m.count = MAX_GRUNTS * mult;
      scene.add(m);
      return m;
    };
    this.meshes = {
      body: mk(parts.body), head: mk(parts.head), upperArm: mk(parts.upperArm, 2), lowerArm: mk(parts.lowerArm, 2),
      upperLeg: mk(parts.upperLeg, 2), lowerLeg: mk(parts.lowerLeg, 2), spear: mk(parts.spear), sword: mk(parts.sword), shield: mk(parts.shield),
    };
    this.g = [];
    for (let i = 0; i < MAX_GRUNTS; i++) this.g.push({ id: i, active: false });
    this.tmpM = Array.from({ length: 12 }, () => new THREE.Matrix4());
    this.col = new THREE.Color();
    this.attackers = 0;
    this.maxAttackers = 4;
    this.tokenCd = 0;
    this.commanders = [];   // officers whose Leadership (def.command) sharpens nearby soldiers
    this.cmdAtHero = 0;
    this.grid = new Map();
    this.activeCount = 0;
    this.onKO = null; this.onPlayerHit = null; this.fx = null; this.audio = null;
  }

  spawn(x, z, opts = {}) {
    const g = this.g.find((q) => !q.active);
    if (!g) return null;
    const captain = !!opts.captain;
    Object.assign(g, {
      active: true, alive: true, x, z, y: groundAt(x, z), vx: 0, vz: 0, vy: 0, yaw: opts.yaw ?? Math.random() * 6.28,
      state: 'chase', t: 0, hp: opts.hp ?? (captain ? 110 : 45) * D.gruntHp, maxHp: opts.hp ?? (captain ? 110 : 45) * D.gruntHp, type: opts.type ?? (Math.random() < 0.6 ? 'spear' : 'sword'),
      scale: opts.scale ?? (captain ? 1.12 : 0.94 + Math.random() * 0.1), phase: Math.random(), speed: 3.4 + Math.random() * 1.3,
      slot: Math.random() * Math.PI * 2, ring: 3.2 + Math.random() * 2.2, hasToken: false, flash: 0, pitch: 0, roll: 0, spin: 0,
      captain, hitIds: new Set(), lastHitWindow: -1, downT: 0, deadT: 0, airborne: false, sink: 0, idleT: Math.random() * 2,
      dragged: false, aggro: opts.aggro ?? 1, post: opts.post ?? null, keep: !!opts.keep, gateCaptain: opts.gateCaptain ?? null, def: opts.def ?? null, _gateSide: {}, cmd: 0, tint: 0.82 + Math.random() * 0.3, hue: (Math.random() - 0.5) * 0.12,
    });
    return g;
  }

  release(g) {
    if (g.hasToken) { g.hasToken = false; this.attackers--; }
    g.active = false;
    const i = g.id;
    const M = this.meshes;
    for (const k of ['body', 'head', 'spear', 'sword', 'shield']) M[k].setMatrixAt(i, ZERO);
    for (const k of ['upperArm', 'lowerArm', 'upperLeg', 'lowerLeg']) { M[k].setMatrixAt(i * 2, ZERO); M[k].setMatrixAt(i * 2 + 1, ZERO); }
  }

  clear() { for (const g of this.g) if (g.active) this.release(g); this.attackers = 0; }

  // Apply a hit from the hero. Returns true if this hit landed.
  hit(g, h, from, dmgMul = 1) {
    if (!g.alive) return false;
    const dx = g.x - from.x, dz = g.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d, nz = dz / d;
    g.hp -= h.dmg * dmgMul;
    g.flash = 1;
    if (g.hasToken) { g.hasToken = false; this.attackers--; }
    const f = h.force ?? 2;
    g.yaw = Math.atan2(-nx, -nz);
    const react = g.hp <= 0 && h.react === 'stagger' ? 'knockback' : h.react;
    if (react === 'drag') {
      g.state = 'stagger'; g.t = 0; g.dragged = true; g.vx = 0; g.vz = 0;
    } else if (react === 'stagger' && !g.airborne) {
      g.state = 'stagger'; g.t = 0; g.vx = nx * f * 2.2; g.vz = nz * f * 2.2;
    } else {
      // airborne reactions (knockback/launch) and juggles
      const up = h.up ?? (react === 'launch' ? 7 : 3);
      g.airborne = true; g.state = 'air'; g.t = 0;
      g.vy = g.airborne && g.vy > 0 ? Math.max(g.vy, up * 0.6) : up;
      if (react === 'stagger') g.vy = Math.max(g.vy, 3.5);
      g.vx = nx * f * 1.5; g.vz = nz * f * 1.5;
      g.spin = (react === 'launch' ? 7 : 5) * (Math.random() < 0.5 ? -1 : 1);
    }
    if (g.hp <= 0) {
      g.alive = false;
      if (!g.airborne) { g.airborne = true; g.state = 'air'; g.vy = 3; g.vx = nx * 4; g.vz = nz * 4; g.spin = 5; }
      this.onKO?.(g);
    }
    return true;
  }

  rebuildGrid() {
    const grid = this.grid; grid.clear();
    for (const g of this.g) {
      if (!g.active || !g.alive) continue;
      const k = ((Math.floor(g.x / 2) + 512) << 10) | (Math.floor(g.z / 2) + 512);
      let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(g);
    }
  }

  near(x, z, r, fn) {
    const r2 = r * r;
    for (const g of this.g) {
      if (!g.active) continue;
      const dx = g.x - x, dz = g.z - z;
      if (dx * dx + dz * dz < r2) fn(g);
    }
  }

  update(dt, hero, colliders, time) {
    const hx = hero.pos.x, hz = hero.pos.z;
    this.rebuildGrid();
    this.tokenCd -= dt;
    const cmds = this.commanders.filter((o) => o.active && o.alive && o.def.command > 0);
    this.cmdAtHero = commandAt(cmds, hx, hz);
    this.frontAttackers = 0;
    for (const g of this.g) {
      if (!g.active || !g.hasToken) continue;
      const ax = g.x - hx, az = g.z - hz;
      if ((ax * hero.forward.x + az * hero.forward.z) / (Math.hypot(ax, az) || 1) > 0.3) this.frontAttackers++;
    }
    let active = 0;
    for (const g of this.g) {
      if (!g.active) continue;
      active++;
      g.t += dt;
      g.flash = Math.max(0, g.flash - dt * 6);
      const dx = hx - g.x, dz = hz - g.z;
      const dist = Math.hypot(dx, dz) || 1;

      if (g.airborne) {
        g.vy -= 22 * dt;
        g.x += g.vx * dt; g.z += g.vz * dt; g.y += g.vy * dt;
        applyGates(g, g, 0.4);
        g.vx *= Math.exp(-0.6 * dt); g.vz *= Math.exp(-0.6 * dt);
        g.pitch -= g.spin * dt * 0.5;
        const gy = groundAt(g.x, g.z);
        if (g.y <= gy && g.vy < 0) {
          g.y = gy;
          if (g.vy < -6) { g.vy = -g.vy * 0.28; g.vx *= 0.5; g.vz *= 0.5; this.fx?.dust({ x: g.x, y: gy, z: g.z }, 4, 0.5, 1.2); }
          else {
            g.airborne = false; g.vy = 0; g.vx = 0; g.vz = 0;
            g.state = g.alive ? 'down' : 'dead'; g.t = 0;
            g.pitch = -Math.PI / 2;
            this.fx?.dust({ x: g.x, y: gy, z: g.z }, 5, 0.6, 1.5);
          }
        }
      } else if (!g.alive) {
        if (g.state !== 'dead') { g.state = 'dead'; g.t = 0; }
        g.y = groundAt(g.x, g.z);
        if (g.t > 2.6) g.sink += dt * 0.35;
        if (g.sink > 0.6 || dist > 90) { this.release(g); continue; }
      } else {
        g.cmd = cmds.length ? commandAt(cmds, g.x, g.z) : 0;
        this.think(g, dt, dist, dx, dz, hero, time);
        g.x += g.vx * dt; g.z += g.vz * dt;
        if (g.state === 'stagger') { g.vx *= Math.exp(-7 * dt); g.vz *= Math.exp(-7 * dt); }
        // separation
        const cx = Math.floor(g.x / 2), cz = Math.floor(g.z / 2);
        for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
          const c = this.grid.get(((cx + ox + 512) << 10) | (cz + oz + 512));
          if (!c) continue;
          for (const o of c) {
            if (o === g) continue;
            const sx = g.x - o.x, sz = g.z - o.z, d2 = sx * sx + sz * sz;
            if (d2 < 0.8 && d2 > 1e-6) { const d = Math.sqrt(d2), k = (0.9 - d) * 0.5 / d; g.x += sx * k; g.z += sz * k; }
          }
        }
        // keep off the hero
        if (dist < 0.85) { g.x -= dx / dist * (0.85 - dist); g.z -= dz / dist * (0.85 - dist); }
        for (const c of colliders) {
          const sx = g.x - c.x, sz = g.z - c.z, d2 = sx * sx + sz * sz, rr = c.r + 0.35;
          if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1; g.x = c.x + sx / d * rr; g.z = c.z + sz / d * rr; }
        }
        pushOutOfHouses(g, 0.4);
        constrain(g, 0.4);
        applyGates(g, g, 0.4);
        g.y = groundAt(g.x, g.z);
        if (dist > 95 && !g.keep) { this.release(g); continue; }
      }
      this.pose(g, time);
    }
    this.activeCount = active;
    for (const m of Object.values(this.meshes)) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  think(g, dt, dist, dx, dz, hero, time) {
    const faceHero = Math.atan2(dx, dz);
    const turn = (target, rate) => { g.yaw += angleDiff(g.yaw, target) * Math.min(1, rate * dt); };
    if (g.state === 'stagger') {
      if (g.dragged) {
        // carried along in front of the hero during the dash thrust
        const f = hero.forward;
        const tx = hero.pos.x + f.x * 1.7 + (g.id % 3 - 1) * 0.5 * f.z, tz = hero.pos.z + f.z * 1.7 - (g.id % 3 - 1) * 0.5 * f.x;
        g.x += (tx - g.x) * Math.min(1, dt * 12); g.z += (tz - g.z) * Math.min(1, dt * 12);
        g.vx = 0; g.vz = 0;
        if (!hero.dragging) { g.dragged = false; g.t = 0.2; }
        return;
      }
      if (g.t > 0.5) { g.state = 'chase'; g.t = 0; }
      return;
    }
    if (g.state === 'down') { if (g.t > 1.0) { g.state = 'getup'; g.t = 0; } return; }
    if (g.state === 'getup') { g.pitch = -Math.PI / 2 * Math.max(0, 1 - g.t / 0.45); if (g.t > 0.5) { g.pitch = 0; g.state = 'chase'; g.t = 0; } return; }
    if (g.state === 'windup') {
      // a commanded soldier keeps stepping in so the hero can't just walk out of his reach
      const reach = g.type === 'spear' ? 1.9 : 1.35;
      const step = dist > reach ? Math.min(g.speed, (dist - reach) * 4) * g.cmd : 0;
      g.vx = dx / dist * step; g.vz = dz / dist * step;
      turn(faceHero, 5);
      if (g.t > 0.6 - 0.07 * g.cmd) { g.state = 'strike'; g.t = 0; this.audio?.play('swing', 0.4); }
      return;
    }
    if (g.state === 'strike') {
      const reach = g.type === 'spear' ? 2.4 : 1.8;
      if (g.t < 0.05 && !g.struck) {
        g.struck = true;
        const ang = Math.abs(angleDiff(g.yaw, faceHero));
        if (dist < reach && ang < 0.8) this.onPlayerHit?.(g, (g.captain ? 16 : 8) * D.enemyDmg);
      }
      const lunge = g.t < 0.12 ? 3.5 : 0;
      g.vx = Math.sin(g.yaw) * lunge; g.vz = Math.cos(g.yaw) * lunge;
      if (g.t > 0.55) { g.state = 'chase'; g.t = 0; g.struck = false; if (g.hasToken) { g.hasToken = false; this.attackers--; } g.cool = (1.5 + Math.random() * 2) * D.gruntCool * (1 - 0.3 * g.cmd); }
      return;
    }
    // chase / surround. Soldiers near a well-led officer (g.cmd, from his Leadership) commit more
    // attackers, recover faster, come at the hero's blind side and close off his escape route.
    // Their movement speed is unchanged.
    const c = g.cmd, hv = hero.vel;
    g.cool = (g.cool ?? 0) - dt;
    const base = this.maxAttackers + D.extraAttackers;
    const cap = Math.max(base, Math.min(8, base + Math.round(this.cmdAtHero * 2))); // command adds up to 2, never past 8
    if (!g.hasToken && this.tokenCd <= 0 && this.attackers < cap && dist < 6 && g.cool <= 0 && hero.alive) {
      // a commanded squad keeps at most two attackers in front of the hero; the rest go in from his sides and back
      const inFront = (-dx * hero.forward.x - dz * hero.forward.z) / dist > 0.3;
      if (!(c > 0.3 && inFront && this.frontAttackers >= 2) && Math.random() < dt * 3 * g.aggro * D.aggro * (1 + c)) {
        g.hasToken = true; this.attackers++; this.tokenCd = (0.25 + Math.random() * 0.4) * D.tokenGap * (1 - 0.4 * c);
        if (inFront) this.frontAttackers++;
      }
    }
    let tx, tz, desired;
    if (g.hasToken) {
      desired = g.type === 'spear' ? 1.9 : 1.35;
      tx = hero.pos.x + hv.x * 0.3 * c; tz = hero.pos.z + hv.z * 0.3 * c;
      if (dist < desired + 0.2) { g.state = 'windup'; g.t = 0; g.struck = false; this.fx?.weaponGlint?.(g); return; }
    } else {
      g.slot += dt * 0.25 * (g.id % 2 ? 1 : -1);
      desired = g.ring * (1 - 0.25 * c);
      tx = hero.pos.x + Math.sin(g.slot) * desired; tz = hero.pos.z + Math.cos(g.slot) * desired;
      const vs = Math.hypot(hv.x, hv.z);
      if (c > 0 && vs > 0.5) { const lead = Math.min(4, vs * 0.6 * c); tx += hv.x / vs * lead; tz += hv.z / vs * lead; }
    }
    // gate captains hold their post when the hero strays too far from it
    if (g.post && Math.hypot(hero.pos.x - g.post.x, hero.pos.z - g.post.z) > g.post.r) {
      if (g.hasToken) { g.hasToken = false; this.attackers--; }
      tx = g.post.x; tz = g.post.z;
    }
    const gw = gateWaypoint(g.x, g.z, tx, tz);
    const wp = gw ?? steerAround(g.x, g.z, tx, tz, 1.0);
    if (wp.x !== tx || wp.z !== tz) { tx = wp.x; tz = wp.z; }
    const ex = tx - g.x, ez = tz - g.z, ed = Math.hypot(ex, ez);
    const moving = ed > (g.hasToken ? 0.1 : 0.6);
    const sp = dist > 14 ? g.speed * 1.15 : g.hasToken ? g.speed : g.speed * 0.6;
    const tvx = moving ? ex / ed * sp : 0, tvz = moving ? ez / ed * sp : 0;
    g.vx += (tvx - g.vx) * Math.min(1, dt * 6); g.vz += (tvz - g.vz) * Math.min(1, dt * 6);
    turn(dist < 9 ? faceHero : Math.atan2(g.vx, g.vz), 8);
    g.moving = Math.hypot(g.vx, g.vz);
  }

  // Procedural pose -> instance matrices
  pose(g, time) {
    const i = g.id, M = this.meshes, tm = this.tmpM;
    const spd = g.alive && !g.airborne && (g.state === 'chase') ? Math.min(1, (g.moving ?? 0) / 4) : 0;
    g.phase += (g.moving ?? 0) * 0.016 * 0.55;
    const ph = g.phase * Math.PI * 2;
    const s = Math.sin(ph), c = Math.cos(ph);
    let lean = 0.12 * spd, twist = 0, bob = -Math.abs(c) * 0.05 * spd, head = 0;
    let rUx = -0.35, rUz = -0.2, rEl = -1.3, lUx = -0.2, lUz = 0.25, lEl = -1.0;
    let thL = -s * 0.75 * spd, thR = s * 0.75 * spd, knL = Math.max(0, c) * 1.0 * spd + 0.15, knR = Math.max(0, -c) * 1.0 * spd + 0.15;
    if (spd > 0) { lUx = s * 0.6 * spd - 0.1; }
    const idle = Math.sin(time * 2 + g.id) * 0.03;
    const st = g.state, t = g.t;
    if (st === 'chase' && spd < 0.1) { bob = idle * 0.5 - 0.03; knL = knR = 0.25; thL = -0.15; thR = 0.12; }
    if (st === 'windup') {
      const k = Math.min(1, t / 0.25);
      if (g.type === 'spear') { rUx = -0.35 + 0.65 * k; rEl = -1.3 - 0.5 * k; twist = -0.4 * k; lean = -0.05; }
      else { rUx = -0.35 - 2.4 * k; rEl = -1.3 + 0.5 * k; rUz = -0.3; twist = -0.3 * k; lean = -0.1 * k; }
      thL = -0.35; thR = 0.3; knL = 0.3; knR = 0.35; bob = -0.06;
    } else if (st === 'strike') {
      const k = Math.min(1, t / 0.08);
      if (g.type === 'spear') { rUx = 0.3 - 1.6 * k; rEl = -1.8 + 1.7 * k; twist = -0.4 + 0.7 * k; lean = 0.25 * k; }
      else { rUx = -2.75 + 2.3 * k; rEl = -0.8 + 0.5 * k; twist = -0.3 + 0.7 * k; lean = 0.3 * k; }
      thL = -0.6; thR = 0.4; knL = 0.4; knR = 0.3; bob = -0.1;
    } else if (st === 'stagger') {
      const k = Math.sin(Math.min(1, t / 0.45) * Math.PI);
      lean = -0.45 * k; head = -0.4 * k; rUz = -0.8 * k - 0.2; lUz = 0.8 * k + 0.25; rUx = -0.6; bob = -0.08 * k;
    } else if (g.airborne || st === 'down' || st === 'dead' || st === 'getup') {
      const flail = g.airborne ? Math.sin(time * 18 + g.id) * 0.5 : 0;
      rUx = -2.6 + flail; rUz = -0.5; rEl = -0.3; lUx = -2.4 - flail; lUz = 0.5; lEl = -0.4;
      thL = -0.3 + flail * 0.5; thR = 0.1 - flail * 0.5; knL = 0.5; knR = 0.3; head = -0.2;
      if (st === 'getup') { rUx = -0.8; lUx = -0.8; thL = -1.2; thR = -0.8; knL = 1.6; knR = 1.4; }
    }
    if (!g.airborne && st !== 'down' && st !== 'dead' && st !== 'getup') g.pitch = 0;
    const sc = g.scale;
    const lyingLift = (st === 'down' || st === 'dead') ? 0.16 : st === 'getup' ? 0.16 * Math.abs(Math.sin(g.pitch)) : 0;
    // root
    _e.set(g.pitch, g.yaw, 0, 'YXZ'); _q.setFromEuler(_e);
    _v.set(g.x, g.y + lyingLift - g.sink, g.z);
    tm[0].compose(_v, _q, _sc.set(sc, sc, sc));
    child(tm[1], tm[0], 0, 0.95 + bob, 0, lean, twist, 0);        // hips/body
    M.body.setMatrixAt(i, tm[1]);
    child(tm[2], tm[1], 0, 0.55, 0, head, 0, 0);                    // head
    M.head.setMatrixAt(i, tm[2]);
    child(tm[3], tm[1], -0.2, 0.46, 0, rUx, 0, rUz);                // right upper arm
    child(tm[4], tm[3], 0, -0.28, 0, rEl, 0, 0);                    // right forearm
    M.upperArm.setMatrixAt(i * 2, tm[3]); M.lowerArm.setMatrixAt(i * 2, tm[4]);
    child(tm[5], tm[1], 0.2, 0.46, 0, lUx, 0, lUz);
    child(tm[6], tm[5], 0, -0.28, 0, lEl, 0, 0);
    M.upperArm.setMatrixAt(i * 2 + 1, tm[5]); M.lowerArm.setMatrixAt(i * 2 + 1, tm[6]);
    child(tm[7], tm[0], 0.1, 0.92 + bob, 0, thL, 0, 0.04);
    child(tm[8], tm[7], 0, -0.44, 0, knL, 0, 0);
    M.upperLeg.setMatrixAt(i * 2, tm[7]); M.lowerLeg.setMatrixAt(i * 2, tm[8]);
    child(tm[9], tm[0], -0.1, 0.92 + bob, 0, thR, 0, -0.04);
    child(tm[10], tm[9], 0, -0.44, 0, knR, 0, 0);
    M.upperLeg.setMatrixAt(i * 2 + 1, tm[9]); M.lowerLeg.setMatrixAt(i * 2 + 1, tm[10]);
    child(tm[11], tm[4], 0, -0.27, 0, 0, 0, 0);
    const dropW = !g.alive && !g.airborne;
    if (g.type === 'spear') { M.spear.setMatrixAt(i, dropW ? ZERO : tm[11]); M.sword.setMatrixAt(i, ZERO); M.shield.setMatrixAt(i, ZERO); }
    else {
      M.sword.setMatrixAt(i, dropW ? ZERO : tm[11]); M.spear.setMatrixAt(i, ZERO);
      child(tm[11], tm[6], 0.06, -0.1, 0, 0, 0, 0);
      M.shield.setMatrixAt(i, tm[11]);
    }
    // colour: hit flash & captain tint
    const f = 1 + g.flash * g.flash * 0.7;
    const k = g.tint;
    this.col.setRGB(f * k * (g.captain ? 1.35 : 1 + g.hue), f * k * (g.captain ? 0.9 : 1), f * k * (g.captain ? 0.75 : 1 - g.hue));
    if (st === 'windup' && Math.floor(t * 12) % 2 === 0 && t > 0.15) this.col.multiplyScalar(1.6);
    M.body.setColorAt(i, this.col); M.head.setColorAt(i, this.col);
    for (const key of ['upperArm', 'lowerArm', 'upperLeg', 'lowerLeg']) { M[key].setColorAt(i * 2, this.col); M[key].setColorAt(i * 2 + 1, this.col); }
  }
}
