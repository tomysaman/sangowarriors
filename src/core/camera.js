import * as THREE from 'three';
import { groundAt } from '../world/level.js';
import { damp, dampAngle, clamp } from './noise.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; this.pitch = 0.22; this.dist = 6.2; this.targetDist = 6.2;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.trauma = 0;
    this.time = 0;
    this.fovKick = 0;
    this.cine = null; // {pos, look, lerp}
    this.cinePos = new THREE.Vector3(); this.cineLook = new THREE.Vector3();
    this.mode = 'follow';
  }

  shake(a) { this.trauma = Math.min(1.2, this.trauma + a); }

  snapBehind(yaw) { this.yaw = yaw + Math.PI; }

  setCinematic(pos, look, speed = 2.5) {
    this.mode = 'cine';
    this.cineTarget = { pos: pos.clone(), look: look.clone(), speed };
    if (!this.cineInit) { this.cinePos.copy(this.camera.position); this.cineLook.copy(this.smoothTarget); this.cineInit = true; }
  }
  clearCinematic() { this.mode = 'follow'; this.cineInit = false; this.cineTarget = null; }

  update(dt, input, focus, heroYaw, moving) {
    this.time += dt;
    if (this.mode === 'cine' && this.cineTarget) {
      const k = 1 - Math.exp(-this.cineTarget.speed * dt);
      this.cinePos.lerp(this.cineTarget.pos, k);
      this.cineLook.lerp(this.cineTarget.look, k);
      this.camera.position.copy(this.cinePos);
      this.camera.lookAt(this.cineLook);
      this.applyShake(dt);
      return;
    }
    const sens = 0.0023;
    this.yaw -= input.mouseDX * sens + input.lookX * dt * 2.6;
    this.pitch += input.mouseDY * sens + input.lookY * dt * 1.8;
    this.pitch = clamp(this.pitch, -0.25, 1.1);
    if (input.keys.has('KeyQ')) this.yaw = dampAngle(this.yaw, heroYaw + Math.PI, 10, dt);

    this.target.copy(focus);
    this.smoothTarget.x = damp(this.smoothTarget.x, this.target.x, 12, dt);
    this.smoothTarget.z = damp(this.smoothTarget.z, this.target.z, 12, dt);
    this.smoothTarget.y = damp(this.smoothTarget.y, this.target.y, 6, dt);
    this.dist = damp(this.dist, this.targetDist, 4, dt);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const off = new THREE.Vector3(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp).multiplyScalar(this.dist);
    // shoulder offset to the right of the view
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(0.0);
    const pos = this.smoothTarget.clone().add(off).add(right);
    const g = groundAt(pos.x, pos.z) + 0.5;
    if (pos.y < g) pos.y = g;
    this.camera.position.copy(pos);
    this.camera.lookAt(this.smoothTarget.clone().add(right).add(new THREE.Vector3(0, 0.15, 0)));
    this.applyShake(dt);
  }

  applyShake(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma;
    if (s > 0) {
      const t = this.time * 40;
      this.camera.rotateX((Math.sin(t * 1.1) + Math.sin(t * 2.3)) * 0.008 * s);
      this.camera.rotateY((Math.sin(t * 1.3 + 2) + Math.sin(t * 2.9)) * 0.008 * s);
      this.camera.rotateZ(Math.sin(t * 0.9 + 4) * 0.012 * s);
    }
    this.fovKick = damp(this.fovKick, 0, 5, dt);
    const fov = 55 + this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }
}
