import * as THREE from 'three';
import { buildWarrior } from './rig.js';
import { Animator } from './animator.js';
import { HERO_MOVES, SWORD_MOVES, POLEARM_MOVES } from './moves.js';
import { makePose } from './pose.js';
import { groundAt, constrain, pushOutOfHouses, steerAround } from '../world/level.js';
import { angleDiff, dampAngle } from '../core/noise.js';
import { sweepHits } from './combat.js';

const DIE = { ...HERO_MOVES.KNOCKDOWN, dur: 1.05, keys: HERO_MOVES.KNOCKDOWN.keys.slice(0, 4), advance: [[0, 0.5, -3]], iframes: null };
const _w = new THREE.Matrix4(), _b = new THREE.Vector3(), _t = new THREE.Vector3();

export class Officer {
  constructor(scene, def, ctx) {
    this.def = def; this.ctx = ctx;
    this.rig = buildWarrior(def);
    scene.add(this.rig.root);
    this.style = def.style === 'sword' ? 'sword' : 'spear';
    this.anim = new Animator(this.rig, this.style);
    this.moves = def.moves.map((k) => (this.style === 'sword' ? SWORD_MOVES[k] : POLEARM_MOVES[k]));
    this.pos = this.rig.root.position;
    this.yaw = 0;
    this.hp = this.maxHp = def.hp;
    this.alive = true; this.state = 'idle'; this.t = 0;
    this.move = null; this.serial = 0; this.hitDone = new Set();
    this.poise = def.poise; this.cool = 1.0; this.guardT = 0;
    this.radius = 0.55; this.height = 1.8 * (def.scale ?? 1);
    this.active = false;
    this.flash = 0;
    this.vel = new THREE.Vector3();
    this.firedSfx = new Set();
    this.rig.root.visible = false;
  }

  spawn(x, z, yaw) {
    this.pos.set(x, groundAt(x, z), z); this.yaw = yaw;
    this.rig.root.rotation.y = yaw;
    this.rig.root.visible = true; this.active = true;
    this.anim.update(0.016);
  }

  play(move, speed = 1) {
    this.move = move; this.serial++; this.hitDone.clear(); this.firedSfx.clear();
    this.anim.play(move, 0.1, speed);
    this.teleFired = false;
  }

  get busy() { return this.move && !this.anim.done; }

  hit(h, from, dmgMul = 1) {
    if (!this.alive) return 'none';
    if (this.state === 'down') return 'none'; // grounded officers can't be juggled
    const toFrom = Math.atan2(from.x - this.pos.x, from.z - this.pos.z);
    const frontal = Math.abs(angleDiff(this.yaw, toFrom)) < 1.0;
    if (this.state === 'guard' && frontal && (h.react === 'stagger' || h.react === 'drag') && h.dmg < 40) {
      this.ctx.onGuard?.(this);
      return 'guard';
    }
    this.hp -= h.dmg * dmgMul * 0.9;
    this.flash = 1;
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false; this.state = 'dead';
      this.yaw = toFrom; this.play(DIE);
      this.ctx.onOfficerDown?.(this);
      return 'hit';
    }
    const armored = this.armorT > 0 || (this.state === 'attack' && this.moveArmor) || (this.state === 'attack' && this.move && this.anim.mt > (this.move.tele ?? 0) && this.anim.mt < (this.move.hits.at(-1)?.t1 ?? 0) + 0.05);
    const heavy = h.react === 'launch' || (h.react === 'knockback' && (h.force ?? 0) >= 6);
    this.poise -= heavy ? 3 : 1;
    if (this.poise <= 0 || (heavy && !armored)) {
      this.poise = this.def.poise; this.yaw = toFrom;
      this.state = 'down'; this.play(HERO_MOVES.KNOCKDOWN);
    } else if (!armored) {
      this.flinches = (this.flinches ?? 0) + 1;
      if (this.flinches >= 4) {
        // shrug it off: brief super armour and an immediate counter-attack
        this.flinches = 0; this.armorT = 1.6; this.yaw = toFrom;
        this.state = 'attack'; this.combo = 2;
        this.play(this.moves[Math.floor(Math.random() * this.moves.length)]);
        this.ctx.onTelegraph?.(this);
      } else { this.state = 'hurt'; this.yaw = toFrom; this.play(HERO_MOVES.HURT); }
    }
    // guard more after being hit
    if (Math.random() < this.def.guard * 0.6) this.wantGuard = true;
    return 'hit';
  }

  update(dt, hero, colliders) {
    if (!this.active) return;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.armorT = Math.max(0, (this.armorT ?? 0) - dt);
    this.flinchDecay = (this.flinchDecay ?? 0) + dt;
    if (this.flinchDecay > 2.5) { this.flinchDecay = 0; this.flinches = Math.max(0, (this.flinches ?? 0) - 1); }
    const dx = hero.pos.x - this.pos.x, dz = hero.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const face = Math.atan2(dx, dz);
    this.cool -= dt;
    let speed = 0;
    if (this.state === 'idle') {
      this.yaw = dampAngle(this.yaw, face, 4, dt);
      if (this.engaged) this.state = 'chase';
    } else if (this.state === 'chase') {
      const wp = steerAround(this.pos.x, this.pos.z, hero.pos.x, hero.pos.z);
      const routed = wp.x !== hero.pos.x || wp.z !== hero.pos.z;
      this.yaw = dampAngle(this.yaw, routed ? Math.atan2(wp.x - this.pos.x, wp.z - this.pos.z) : face, 6, dt);
      const want = routed ? 0 : this.style === 'sword' ? 1.8 : 2.4;
      if (routed) speed = this.def.speed;
      else if (dist > want) speed = Math.min(this.def.speed, (dist - want) * 3);
      if (this.wantGuard && dist < 4) { this.wantGuard = false; this.state = 'guard'; this.guardT = 0.8 + Math.random() * 0.7; this.anim.stop(0.1); }
      else if (!routed && dist < want + 0.6 && this.cool <= 0 && hero.alive) {
        this.state = 'attack';
        this.moveArmor = Math.random() < 0.55;
        this.combo = 1 + Math.floor(Math.random() * (this.style === 'sword' ? 2 : 3));
        this.play(this.moves[Math.floor(Math.random() * this.moves.length)]);
      }
    } else if (this.state === 'guard') {
      this.yaw = dampAngle(this.yaw, face, 8, dt);
      this.guardT -= dt;
      if (this.guardT <= 0) { this.state = 'chase'; this.cool = 0.2; }
    } else if (this.state === 'attack') {
      const m = this.move, mt = this.anim.mt;
      if (mt < (m.tele ?? 0.3) - 0.05) this.yaw = dampAngle(this.yaw, face, 7, dt);
      if (!this.teleFired && m.tele && mt >= (m.hold?.at ?? 0)) { this.teleFired = true; this.ctx.onTelegraph?.(this); }
      let adv = 0;
      for (const [t0, t1, d] of m.advance) if (mt >= t0 && mt < t1) adv += d / (t1 - t0);
      speed = adv * (dist < 1.3 ? 0.2 : 1);
      if (m.sfx) for (const [t, s] of m.sfx) if (mt >= t && !this.firedSfx.has(t)) { this.firedSfx.add(t); this.ctx.audio?.play(s, 0.8); }
      // weapon sweep vs hero
      m.hits.forEach((h, i) => {
        if (mt >= h.t0 && mt <= h.t1 && !this.hitDone.has(i)) {
          const segs = [];
          for (let s = 0; s <= 2; s++) {
            this.anim.weaponMatrixAt(_w, Math.max(0, this.anim.t - dt * (s / 2)));
            const w = this.rig.weapon.info;
            segs.push([_b.set(0, 0, w.bladeStart - 0.6).applyMatrix4(_w).clone(), _t.set(0, 0, w.tip + 0.2).applyMatrix4(_w).clone()]);
          }
          const p = sweepHits(segs, hero.pos.x, hero.pos.y, hero.pos.z, 0.6, 1.7);
          const areaOK = (h.area && dist < h.area.r) || (dist < 1.6 && Math.abs(angleDiff(this.yaw, face)) < 1.0);
          if (p || areaOK) {
            this.hitDone.add(i);
            const heavy = h.react === 'knockback' || h.react === 'launch';
            if (hero.takeHit(Math.max(10, h.dmg), this.pos, heavy)) this.ctx.onHeroHurt?.(p || hero.pos, heavy);
          }
        }
      });
      if (this.anim.done) {
        this.combo--;
        if (this.combo > 0 && dist < 3.5) this.play(this.moves[Math.floor(Math.random() * this.moves.length)]);
        else { this.state = 'chase'; this.anim.stop(0.2); this.move = null; this.cool = (1.3 + Math.random() * 1.2) * (1.4 - this.def.aggression); if (Math.random() < this.def.guard) this.wantGuard = true; }
      }
    } else if (this.state === 'hurt' || this.state === 'down') {
      const m = this.move, mt = this.anim.mt;
      let adv = 0;
      for (const [t0, t1, d] of m.advance) if (mt >= t0 && mt < t1) adv += d / (t1 - t0);
      speed = adv;
      if (this.anim.done) {
        if (this.state === 'down') { this.armorT = 1.2; this.flinches = 0; this.cool = 0; }
        else this.cool = 0.4;
        this.state = 'chase'; this.anim.stop(0.2); this.move = null;
      }
    } else if (this.state === 'dead') {
      const m = this.move, mt = this.anim.mt;
      let adv = 0;
      for (const [t0, t1, d] of m.advance) if (mt >= t0 && mt < t1) adv += d / (t1 - t0);
      speed = adv;
    }
    this.vel.set(Math.sin(this.yaw) * speed, 0, Math.cos(this.yaw) * speed);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (dist < 1.0 && this.alive) { this.pos.x -= dx / dist * (1.0 - dist) * 0.5; this.pos.z -= dz / dist * (1.0 - dist) * 0.5; }
    for (const c of colliders) {
      const sx = this.pos.x - c.x, sz = this.pos.z - c.z, d2 = sx * sx + sz * sz, rr = c.r + 0.45;
      if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1; this.pos.x = c.x + sx / d * rr; this.pos.z = c.z + sz / d * rr; }
    }
    pushOutOfHouses(this.pos, 0.5);
    constrain(this.pos, 0.5);
    this.pos.y = groundAt(this.pos.x, this.pos.z);
    this.rig.root.rotation.y = this.yaw;
    const sp = this.state === 'chase' ? speed : 0;
    this.anim.speed01 = sp / this.def.speed;
    this.anim.phase = (this.anim.phase + sp * dt / 2.2) % 1;
    if (this.state === 'guard' && !this.anim.override) this.anim.setOverride(GUARD[this.style], 0.1);
    if (this.state !== 'guard' && this.anim.override) this.anim.override = null;
    this.anim.update(dt);
    // hit flash on cloth via emissive
    const e = this.flash * 0.6;
    this.rig.mats.cloth.emissive.setRGB(e, e, e); this.rig.mats.armor.emissive.setRGB(e, e, e);
  }
}

const GUARD = {
  spear: makePose({ hipsY: -0.14, hips: [0, -0.3, 0], chest: [0.05, 0.2, 0], head: [0, 0.1, 0], grip: [-0.2, 1.2, 0.3], spear: [1.3, 0.35, 0], lgrip: 0.6, footL: [0.2, 0.08, 0.35], footR: [-0.2, 0.08, -0.3] }),
  sword: makePose({ hipsY: -0.14, hips: [0, -0.3, 0], chest: [0.05, 0.2, 0], head: [0, 0.1, 0], grip: [-0.15, 1.3, 0.35], spear: [1.2, 0.45, 0], lfree: 1, lpos: [0.15, 1.35, 0.3], footL: [0.2, 0.08, 0.35], footR: [-0.2, 0.08, -0.3] }),
};

// Non-combat characters posed for scenes.
export class NPC {
  constructor(scene, def, pose, style = 'none') {
    this.def = def;
    this.rig = buildWarrior(def);
    scene.add(this.rig.root);
    this.anim = new Animator(this.rig, style);
    this.anim.setOverride(pose, 0.01);
    this.pos = this.rig.root.position;
    this.anim.update(0.016);
  }
  place(x, z, yaw) { this.pos.set(x, groundAt(x, z), z); this.rig.root.rotation.y = yaw; }
  update(dt) { this.anim.update(dt); }
}

export const NPC_POSES = {
  heroAtEase: makePose({ hipsY: -0.04, hips: [0, -0.1, 0], spine: [0.05, 0.05, 0], chest: [0.05, 0.05, 0], head: [0.15, 0, 0], grip: [-0.3, 1.02, 0.12], spear: [0.0, 1.5, 0], lfree: 1, lpos: [0.26, 1.0, 0.05], footL: [0.14, 0.08, 0.1], footR: [-0.14, 0.08, -0.08] }),
  ladyMiKneel: makePose({ hipsY: -0.56, hips: [0.1, 0, 0], spine: [0.15, 0, 0], chest: [0.15, 0, 0], head: [0.25, 0, 0], grip: [-0.1, 0.9, 0.22], spear: [0, 0, 0], lfree: 1, lpos: [0.1, 0.92, 0.22], footL: [0.15, 0.07, -0.35], footR: [-0.15, 0.07, -0.38] }),
  ladyMiStand: makePose({ hipsY: -0.03, hips: [0, 0, 0], spine: [0, 0, 0], chest: [0.05, 0, 0], head: [0.1, 0, 0], grip: [-0.12, 1.08, 0.2], spear: [0, 0, 0], lfree: 1, lpos: [0.12, 1.08, 0.2], footL: [0.1, 0.08, 0.04], footR: [-0.1, 0.08, -0.04] }),
  zhangFeiStand: makePose({ hipsY: -0.08, hips: [0, -0.2, 0], spine: [-0.05, 0.1, 0], chest: [-0.08, 0.1, 0], head: [-0.05, 0.1, 0], grip: [-0.32, 1.0, 0.15], spear: [0.0, 1.45, 0], lgrip: 0.5, lfree: 1, lpos: [0.3, 1.05, 0.0], footL: [0.22, 0.08, 0.15], footR: [-0.22, 0.08, -0.15] }),
  zhangFeiRoar: makePose({ hipsY: -0.15, hips: [0, -0.4, 0], spine: [-0.1, 0.1, 0], chest: [-0.2, 0.25, 0], head: [-0.3, 0.1, 0], grip: [-0.15, 1.1, 0.4], spear: [0.2, 0.25, 0], lgrip: 0.6, footL: [0.25, 0.08, 0.45], footR: [-0.25, 0.08, -0.3] }),
};
