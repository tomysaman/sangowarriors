import * as THREE from 'three';
import { buildWarrior } from './rig.js';
import { Animator } from './animator.js';
import { HERO_MOVES } from './moves.js';
import { makePose } from './pose.js';
import { Cape } from './cloth.js';
import { groundAt, constrain, pushOutOfHouses } from '../world/level.js';
import { angleDiff, dampAngle } from '../core/noise.js';

const AIR = { dur: 999, chainAt: 999, bufferFrom: 999, hits: [], advance: [], next: {}, keys: [
  { t: 0, p: makePose({ hipsY: -0.05, chest: [0.15, 0, 0], grip: [-0.3, 1.05, 0.05], spear: [Math.PI + 0.3, 0.2, 0], lfree: 1, lpos: [0.3, 1.2, 0.1], footL: [0.15, 0.35, 0.2], footR: [-0.15, 0.25, -0.15] }) },
  { t: 999, p: makePose({ hipsY: -0.05, chest: [0.15, 0, 0], grip: [-0.3, 1.05, 0.05], spear: [Math.PI + 0.3, 0.2, 0], lfree: 1, lpos: [0.3, 1.2, 0.1], footL: [0.15, 0.35, 0.2], footR: [-0.15, 0.25, -0.15] }) },
] };

const _w = new THREE.Matrix4(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _bs = new THREE.Vector3();

export class Hero {
  constructor(scene, def, ctx) {
    this.def = def; this.ctx = ctx; // ctx: {fx, audio, onHit(hero, move, h, idx, segments), onMoveEvent}
    this.rig = buildWarrior(def);
    scene.add(this.rig.root);
    this.anim = new Animator(this.rig, 'spear');
    this.anim.update(0.016);
    this.cape = def.cape ? new Cape(scene, this.rig, this.rig.mats.cape) : null;
    this.pos = this.rig.root.position;
    this.vel = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.yaw = 0; this.vy = 0; this.onGround = true;
    this.maxHp = def.stats.hp; this.hp = this.maxHp;
    this.musou = 0; this.alive = true;
    this.state = 'free'; this.move = null; this.moveName = '';
    this.queued = null; this.combo = 0; this.serial = 0;
    this.firedSfx = new Set(); this.firedFx = new Set();
    this.invuln = 0; this.dmgMul = 1; this.hasSword = false; this.hasBaby = false;
    this.segments = [];
    this.stepPhase = 0;
    this.dragging = false;
    this.glow = 0;
    this.speed = def.stats.speed;
    this.controlLocked = false;
  }

  place(x, z, yaw = 0) {
    this.pos.set(x, groundAt(x, z), z);
    this.yaw = yaw; this.rig.root.rotation.y = yaw;
    this.vel.set(0, 0, 0); this.vy = 0;
    this.anim.stop(0.01);
    this.anim.update(0.016);
    this.cape?.reset();
  }

  get invulnerable() {
    if (this.invuln > 0) return true;
    if (this.move?.iframes) { const t = this.anim.mt; return t >= this.move.iframes[0] && t <= this.move.iframes[1]; }
    return false;
  }

  startMove(name, opts = {}) {
    const m = HERO_MOVES[name];
    this.move = m; this.moveName = name;
    this.state = 'move';
    this.queued = null;
    this.serial++;
    this.firedSfx.clear(); this.firedFx.clear();
    this.anim.play(m, opts.blend ?? (name.startsWith('N') ? 0.05 : 0.07));
    if (opts.dir != null) this.yaw = opts.dir;
    if (name === 'MUSOU') this.ctx.onMusou?.(this);
  }

  inputDir(input, camYaw) {
    const mx = input.moveX, my = input.moveY;
    const mag = Math.min(1, Math.hypot(mx, my));
    if (mag < 0.1) return null;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const x = rx * mx + fx * my, z = rz * mx + fz * my;
    return { yaw: Math.atan2(x, z), mag };
  }

  autoAim(dirYaw) {
    if (dirYaw != null) return dirYaw;
    const t = this.ctx.nearestEnemy?.(this.pos, 5.5, this.yaw, 1.9);
    return t ? Math.atan2(t.x - this.pos.x, t.z - this.pos.z) : this.yaw;
  }

  update(dt, input, camYaw, colliders) {
    this.invuln = Math.max(0, this.invuln - dt);
    const dir = this.controlLocked ? null : this.inputDir(input, camYaw);
    const ground = groundAt(this.pos.x, this.pos.z);
    const can = this.alive && !this.controlLocked;

    if (this.state === 'free') {
      if (can && input.consume('musou') && this.musou >= 100) { this.musou = 0; this.startMove('MUSOU', { dir: this.autoAim(dir?.yaw) }); }
      else if (can && input.consume('attack')) { this.combo = 1; this.startMove('N1', { dir: this.autoAim(dir?.yaw) }); }
      else if (can && input.consume('charge')) { this.startMove('C1', { dir: this.autoAim(dir?.yaw) }); }
      else if (can && input.consume('dodge')) { this.startMove('DODGE', { dir: dir ? dir.yaw : this.yaw }); }
      else if (can && input.consume('jump')) {
        this.state = 'air'; this.vy = 7.6; this.onGround = false; this.anim.play(AIR, 0.12);
        if (dir) { this.vel.x = Math.sin(dir.yaw) * this.speed * dir.mag; this.vel.z = Math.cos(dir.yaw) * this.speed * dir.mag; }
        this.ctx.audio?.play('jump');
      } else {
        const target = dir ? this.speed * dir.mag : 0;
        const tx = dir ? Math.sin(dir.yaw) * target : 0, tz = dir ? Math.cos(dir.yaw) * target : 0;
        const k = 1 - Math.exp(-(dir ? 10 : 14) * dt);
        this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k;
        if (dir) this.yaw = dampAngle(this.yaw, dir.yaw, 14, dt);
        const sp = Math.hypot(this.vel.x, this.vel.z);
        this.anim.speed01 = sp / this.speed;
        const prev = this.anim.phase;
        this.anim.phase = (this.anim.phase + sp * dt / 2.4) % 1;
        if ((prev < 0.5 && this.anim.phase >= 0.5) || this.anim.phase < prev) {
          if (sp > 2) { this.ctx.audio?.play('step', 0.8); this.ctx.fx?.dust({ x: this.pos.x, y: ground, z: this.pos.z }, 1, 0.35, 0.6); }
        }
      }
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      this.pos.y = ground;
    } else if (this.state === 'air') {
      this.vy -= 24 * dt;
      if (dir) { this.vel.x += Math.sin(dir.yaw) * 8 * dt; this.vel.z += Math.cos(dir.yaw) * 8 * dt; this.yaw = dampAngle(this.yaw, dir.yaw, 6, dt); }
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vy * dt;
      if (can && input.consume('attack')) { this.startMove('JUMP_ATTACK', { dir: this.autoAim(dir?.yaw) }); this.vy = Math.max(this.vy, 1.5); }
      if (this.pos.y <= ground && this.vy < 0) this.land(ground);
    } else if (this.state === 'move') {
      const m = this.move, mt = this.anim.mt;
      if (can) {
        if (mt >= m.bufferFrom) {
          if (input.consume('attack')) this.queued = 'attack';
          else if (input.consume('charge')) this.queued = 'charge';
        }
        if (input.consume('musou') && this.musou >= 100 && !m.musou) { this.musou = 0; this.startMove('MUSOU', { dir: this.autoAim(dir?.yaw) }); return this.post(dt, colliders); }
        if (mt >= m.chainAt && input.consume('dodge')) { this.startMove('DODGE', { dir: dir ? dir.yaw : this.yaw }); return this.post(dt, colliders); }
      }
      if (this.queued && mt >= m.chainAt) {
        const nx = m.next[this.queued];
        if (nx) {
          if (this.queued === 'attack') this.combo++;
          this.startMove(nx, { dir: this.autoAim(dir?.yaw) });
          return this.post(dt, colliders);
        }
        this.queued = null;
      }
      // root motion
      let adv = 0;
      for (const [t0, t1, d] of m.advance) if (mt >= t0 && mt < t1) adv += d / (t1 - t0);
      if (mt < 0.06 && dir && !m.musou) this.yaw = dampAngle(this.yaw, dir.yaw, 20, dt);
      this.vel.x = Math.sin(this.yaw) * adv; this.vel.z = Math.cos(this.yaw) * adv;
      if (m.musou && dir && mt > 0.9 && mt < 2.3) this.yaw = dampAngle(this.yaw, dir.yaw, 3, dt);
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      this.dragging = !!(m.drag && mt >= m.drag[0] && mt < m.drag[1]);
      if (m.air) {
        this.vy -= 24 * dt; this.pos.y += this.vy * dt;
        if (this.pos.y <= ground) { this.land(ground, true); return this.post(dt, colliders); }
      } else this.pos.y = ground;
      // sfx
      if (m.sfx) for (const [t, s] of m.sfx) if (mt >= t && !this.firedSfx.has(t + s)) { this.firedSfx.add(t + s); this.ctx.audio?.play(s); }
      if (this.anim.done) {
        this.state = this.onGround || !m.air ? 'free' : 'air';
        this.move = null; this.dragging = false;
        if (this.alive && this.moveName !== 'DEFEAT' && this.moveName !== 'VICTORY') this.anim.stop(0.18);
        else this.state = 'frozen';
        if (m.musou) this.ctx.onMusouEnd?.(this);
      }
    }
    this.post(dt, colliders);
  }

  land(ground, fromAttack = false) {
    this.pos.y = ground; this.vy = 0; this.onGround = true;
    this.ctx.fx?.dust({ x: this.pos.x, y: ground, z: this.pos.z }, fromAttack ? 10 : 5, 0.6, 2);
    if (fromAttack) { this.startMove('LAND_SLAM'); this.combo = 0; }
    else { this.state = 'free'; this.anim.stop(0.1); this.ctx.audio?.play('step', 1.5); }
  }

  post(dt, colliders) {
    // world constraints
    for (const c of colliders) {
      const sx = this.pos.x - c.x, sz = this.pos.z - c.z, d2 = sx * sx + sz * sz, rr = c.r + 0.4;
      if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1; this.pos.x = c.x + sx / d * rr; this.pos.z = c.z + sz / d * rr; }
    }
    pushOutOfHouses(this.pos, 0.5);
    constrain(this.pos, 0.5);
    if (this.state !== 'air' && !(this.move?.air)) this.pos.y = groundAt(this.pos.x, this.pos.z);
    this.rig.root.rotation.y = this.yaw;
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  // Called after update: animate, build weapon sweep segments (sub-frame), trail, hits.
  animate(dt) {
    const prevT = this.anim.t;
    this.anim.update(dt);
    const m = this.state === 'move' ? this.move : null;
    this.segments.length = 0;
    const w = this.rig.weapon;
    const attacking = m && m.hits.length;
    const mt = this.anim.mt;
    let activeWindow = false;
    if (attacking) for (const h of m.hits) if (mt >= h.t0 - 0.03 && mt <= h.t1 + 0.04) activeWindow = true;
    const subs = 5;
    for (let s = 1; s <= subs; s++) {
      const tt = prevT + (this.anim.t - prevT) * (s / subs);
      if (m) this.anim.weaponMatrixAt(_w, tt); else _w.copy(w.group.matrixWorld);
      _b.set(0, 0, w.info.bladeStart - 1.0).applyMatrix4(_w);
      _t.set(0, 0, w.info.tip + 0.15).applyMatrix4(_w);
      this.segments.push([_b.clone(), _t.clone()]);
      if (activeWindow) {
        _bs.set(0, 0, w.info.bladeStart - 0.15).applyMatrix4(_w);
        this.ctx.fx?.trail.push(_bs, _t.set(0, 0, w.info.tip).applyMatrix4(_w));
      }
    }
    if (m) {
      m.hits.forEach((h, i) => {
        if (mt >= h.t0 && mt <= h.t1) this.ctx.onHit?.(this, m, h, i);
      });
    }
    // glow: musou / qinggang
    const tg = (m?.musou ? 1 : 0) + (this.hasSword ? 0.12 : 0);
    this.glow += (tg - this.glow) * Math.min(1, dt * 6);
    this.rig.setGlow(this.glow * 0.8);
    if (m?.musou) this.ctx.fx?.musouAura(this.pos, 1);
    if (this.cape) this.cape.update(dt, groundAt(this.pos.x, this.pos.z));
    // plume sway from velocity
    const v = this.rig.plumeVel, a = this.rig.plumeAng;
    const lx = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    const lz = this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw);
    v.x += (-lz * 0.04 - a.x * 30) * dt - v.x * 5 * dt; v.y += (lx * 0.04 - a.y * 30) * dt - v.y * 5 * dt;
    a.x += v.x * dt * 10; a.y += v.y * dt * 10;
  }

  takeHit(dmg, from, heavy = false) {
    if (!this.alive || this.invulnerable) return false;
    this.hp -= dmg;
    this.musou = Math.min(100, this.musou + dmg * 0.35);
    this.invuln = heavy ? 0.9 : 0.25;
    const yaw = Math.atan2(from.x - this.pos.x, from.z - this.pos.z);
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false;
      this.yaw = yaw;
      this.startMove('DEFEAT');
      return true;
    }
    if (heavy) { this.yaw = yaw; this.startMove('KNOCKDOWN'); }
    else if (this.state === 'free' || (this.move && this.anim.mt > (this.move.chainAt ?? 0))) this.startMove('HURT');
    return true;
  }
}
