import * as THREE from 'three';
import { POSE_SIZE, samplePose, lerpPose, locomotionPose } from './pose.js';
import { mappedTime, moveDuration } from './moves.js';

const wrap = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _bm = new THREE.Matrix4();

export class Animator {
  constructor(rig, style = 'spear') {
    this.rig = rig; this.style = style;
    this.pose = new Float32Array(POSE_SIZE);
    this.from = new Float32Array(POSE_SIZE);
    this.tmp = new Float32Array(POSE_SIZE);
    this.sub = new Float32Array(POSE_SIZE);
    this.move = null; this.t = 0; this.blend = 1; this.blendDur = 0.08;
    this.phase = 0; this.speed01 = 0; this.time = 0;
    this.speed = 1;
    this.override = null; // static pose (cutscenes)
    locomotionPose(this.pose, 0, 0, 0, style);
  }

  play(move, blendDur = 0.07, speed = 1) {
    this.from.set(this.pose);
    this.from[33] = wrap(this.from[33]);
    this.move = move; this.t = 0; this.blend = 0; this.blendDur = blendDur; this.speed = speed;
  }

  stop(blendDur = 0.16) {
    this.from.set(this.pose);
    this.from[33] = wrap(this.from[33]);
    this.move = null; this.blend = 0; this.blendDur = blendDur;
  }

  setOverride(p, blendDur = 0.3) {
    this.from.set(this.pose); this.from[33] = wrap(this.from[33]);
    this.override = p; this.move = null; this.blend = 0; this.blendDur = blendDur;
  }

  get done() { return !this.move || this.t >= moveDuration(this.move); }
  get mt() { return this.move ? mappedTime(this.move, this.t) : 0; }

  sampleTarget(out, t) {
    if (this.override) out.set(this.override);
    else if (this.move) samplePose(out, this.move.keys, mappedTime(this.move, t));
    else locomotionPose(out, this.phase, this.speed01, this.time, this.style);
    return out;
  }

  update(dt) {
    this.time += dt;
    if (this.move) this.t += dt * this.speed;
    this.sampleTarget(this.tmp, this.t);
    this.blend = Math.min(1, this.blend + dt / Math.max(this.blendDur, 1e-4));
    const b = 1 - (1 - this.blend) * (1 - this.blend);
    lerpPose(this.pose, this.from, this.tmp, b);
    this.rig.apply(this.pose, dt);
  }

  // World matrix of the weapon for the move at time t (no IK) — for sub-frame trails and sweeps.
  weaponMatrixAt(out, t) {
    const p = this.move ? samplePose(this.sub, this.move.keys, mappedTime(this.move, t)) : this.pose;
    const body = this.rig.body;
    _e.set(p[34], p[33], 0, 'YXZ'); _q.setFromEuler(_e);
    _p.set(0, p[30], 0);
    _bm.compose(_p, _q, body.scale);
    _bm.premultiply(body.parent.matrixWorld);
    _e.set(-p[17], p[16], p[18], 'YXZ'); _q.setFromEuler(_e);
    _p.set(p[13], p[14], p[15]);
    _m.compose(_p, _q, _s);
    return out.multiplyMatrices(_bm, _m);
  }
}
