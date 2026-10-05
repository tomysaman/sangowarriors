import * as THREE from 'three';
import { Particles } from './particles.js';
import { makeSmokeTexture } from '../world/textures.js';
import { groundAt } from '../world/level.js';

const rand = (a, b) => a + Math.random() * (b - a);

class Trail {
  constructor(scene, n = 40, color = new THREE.Color(0.45, 0.72, 1.25)) {
    this.n = n;
    this.base = []; this.tip = []; this.age = [];
    const g = new THREE.BufferGeometry();
    this.posArr = new Float32Array(n * 2 * 3);
    this.aArr = new Float32Array(n * 2 * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('ta', new THREE.BufferAttribute(this.aArr, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: color }, intensity: { value: 1 } },
      vertexShader: `attribute vec2 ta; varying vec2 vA; void main(){ vA = ta; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float intensity; varying vec2 vA;
        void main(){ float a = pow(clamp(vA.x,0.0,1.0), 1.6) * pow(vA.y, 2.2) * intensity;
          vec3 c = mix(color, vec3(1.0), pow(vA.y, 6.0) * vA.x);
          gl_FragColor = vec4(c * a * 1.15, 1.0); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    scene.add(this.mesh);
    this.maxAge = 0.16;
  }
  push(b, t, intensity = 1) {
    this.base.unshift(b.clone()); this.tip.unshift(t.clone()); this.age.unshift(0);
    this.intensityLast = intensity;
    if (this.base.length > this.n) { this.base.pop(); this.tip.pop(); this.age.pop(); }
  }
  update(dt) {
    for (let i = 0; i < this.age.length; i++) this.age[i] += dt;
    while (this.age.length && this.age[this.age.length - 1] > this.maxAge) { this.base.pop(); this.tip.pop(); this.age.pop(); }
    const m = this.base.length;
    for (let i = 0; i < this.n; i++) {
      const j = Math.min(i, m - 1);
      if (m === 0) { this.posArr.fill(0); break; }
      const b = this.base[j], t = this.tip[j];
      this.posArr.set([b.x, b.y, b.z, t.x, t.y, t.z], i * 6);
      const life = i < m ? 1 - this.age[j] / this.maxAge : 0;
      this.aArr.set([life, 0.0, life, 1.0], i * 4);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.ta.needsUpdate = true;
    this.mesh.visible = m > 1;
  }
}

class Rings {
  constructor(scene) {
    this.pool = [];
    const geo = new THREE.RingGeometry(0.6, 1, 64, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { t: { value: 1 }, color: { value: new THREE.Color() } },
        vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
        fragmentShader: `uniform float t; uniform vec3 color; varying vec3 vP;
          void main(){ float r = length(vP.xz); float edge = smoothstep(0.6, 0.95, r) * smoothstep(1.0, 0.93, r);
            float a = edge * (1.0 - t) * (1.0 - t); gl_FragColor = vec4(color * a * 2.0, 1.0); }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false; m.renderOrder = 12; m.frustumCulled = false;
      scene.add(m);
      this.pool.push({ m, t: 1, dur: 0.5, r: 1 });
    }
  }
  spawn(pos, r, color, dur = 0.45, vertical = false) {
    const s = this.pool.find((p) => p.t >= 1) || this.pool[0];
    s.t = 0; s.dur = dur; s.r = r;
    s.m.position.copy(pos);
    s.m.rotation.set(vertical ? Math.PI / 2 : 0, 0, 0);
    s.m.material.uniforms.color.value.copy(color);
    s.m.visible = true;
  }
  update(dt) {
    for (const s of this.pool) {
      if (s.t >= 1) { s.m.visible = false; continue; }
      s.t = Math.min(1, s.t + dt / s.dur);
      const e = 1 - Math.pow(1 - s.t, 3);
      s.m.scale.setScalar(0.2 + e * s.r);
      s.m.material.uniforms.t.value = s.t;
    }
  }
}

export class Effects {
  constructor(scene, fires = [], smokes = []) {
    this.scene = scene;
    const smokeTex = makeSmokeTexture();
    this.sparks = new Particles(scene, 2500, { additive: true, stretch: 0.045 });
    this.glow = new Particles(scene, 5000, { additive: true });
    this.smoke = new Particles(scene, 2200, { additive: false, texture: smokeTex });
    this.trail = new Trail(scene);
    this.rings = new Rings(scene);
    this.fires = fires; this.smokes = smokes;
    this.fireAcc = 0; this.ambAcc = 0;
    this.fireLights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xff7a2a, 0, 26, 1.6);
      scene.add(l); this.fireLights.push(l);
    }
    this.flash = new THREE.PointLight(0x9fd8ff, 0, 18, 1.5);
    scene.add(this.flash);
    this.flashI = 0;
    this.auraTarget = null;
    this.tmp = new THREE.Vector3();
  }

  hitSpark(p, dir, strength = 1, metal = false) {
    const n = Math.floor(10 * strength) + 4;
    for (let i = 0; i < n; i++) {
      const s = rand(4, 13) * strength;
      const vx = dir.x * s * 0.6 + rand(-1, 1) * s * 0.6, vy = rand(0.5, 1.4) * s * 0.5, vz = dir.z * s * 0.6 + rand(-1, 1) * s * 0.6;
      this.sparks.emit(p.x, p.y, p.z, vx, vy, vz, { r: 3.2, g: 2.2, b: 1.2, life: rand(0.15, 0.4), size: rand(0.012, 0.03), drag: 3, grav: 14, cool: 1 });
    }
    // impact flash
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, { r: metal ? 0.7 : 1.1, g: metal ? 0.85 : 0.65, b: metal ? 1.2 : 0.35, life: 0.07, size: 0.45 * strength + 0.2, grow: 0.8 });
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, { r: 0.5, g: 0.38, b: 0.25, life: 0.12, size: 0.22, grow: 1.5 });
    // slash streak
    for (let i = 0; i < 3; i++) {
      this.sparks.emit(p.x, p.y, p.z, rand(-1, 1) * 18, rand(-0.5, 1) * 10, rand(-1, 1) * 18, { r: 2.5, g: 2.4, b: 2.2, life: 0.07, size: 0.03, drag: 10 });
    }
  }

  clash(p) {
    for (let i = 0; i < 26; i++) {
      const s = rand(4, 12);
      this.sparks.emit(p.x, p.y, p.z, rand(-1, 1) * s, rand(0, 1.2) * s, rand(-1, 1) * s, { r: 3.5, g: 2.8, b: 1.6, life: rand(0.2, 0.5), size: 0.02, drag: 2, grav: 12, cool: 1 });
    }
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, { r: 3, g: 2.6, b: 1.8, life: 0.12, size: 1.6, grow: 1 });
    this.lightFlash(p, 0xffd7a0, 14);
  }

  dust(p, n = 6, size = 0.6, speed = 1.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.emit(p.x + Math.cos(a) * 0.3, p.y + 0.1, p.z + Math.sin(a) * 0.3, Math.cos(a) * speed * rand(0.5, 1.2), rand(0.2, 0.9), Math.sin(a) * speed * rand(0.5, 1.2),
        { r: 0.55, g: 0.47, b: 0.38, a: 0.35, life: rand(0.6, 1.3), size: size * rand(0.7, 1.3), grow: 1.8, drag: 2.5, rotV: rand(-1, 1), fadeIn: 0.1 });
    }
  }

  shockwave(p, r, color = new THREE.Color(1.0, 0.75, 0.45), big = false) {
    const g = this.tmp.set(p.x, groundAt(p.x, p.z) + 0.12, p.z);
    this.rings.spawn(g, r, color, big ? 0.6 : 0.42);
    if (big) this.rings.spawn(g, r * 0.6, new THREE.Color(1, 1, 1), 0.3);
    this.dust(g, big ? 40 : 18, big ? 1.2 : 0.8, r * 1.6);
    for (let i = 0; i < (big ? 60 : 25); i++) {
      const a = Math.random() * Math.PI * 2, s = rand(3, 9) * (big ? 1.4 : 1);
      this.sparks.emit(g.x, g.y + 0.1, g.z, Math.cos(a) * s, rand(2, 7), Math.sin(a) * s, { r: 2.8, g: 1.8, b: 0.9, life: rand(0.3, 0.7), size: 0.025, drag: 1.5, grav: 12, cool: 1 });
    }
    // debris chunks (dark glow-less smoke bits)
    for (let i = 0; i < (big ? 24 : 10); i++) {
      const a = Math.random() * Math.PI * 2, s = rand(2, 6);
      this.smoke.emit(g.x, g.y, g.z, Math.cos(a) * s, rand(4, 8), Math.sin(a) * s, { r: 0.25, g: 0.2, b: 0.15, a: 0.9, life: rand(0.5, 0.9), size: rand(0.1, 0.22), grav: 18, drag: 0.5, rotV: 8 });
    }
    this.lightFlash(g, 0xffb070, big ? 25 : 12);
  }

  dragonBurst(p, dir) {
    const c = new THREE.Color(0.5, 0.85, 1.4);
    this.shockwave(p, 9, c, true);
    this.rings.spawn(this.tmp.set(p.x, p.y + 1.2, p.z), 6, new THREE.Color(0.8, 0.95, 1.4), 0.5, true);
    // spiraling dragon of light rising forward
    for (let i = 0; i < 260; i++) {
      const t = i / 260;
      const a = t * Math.PI * 8;
      const fwd = t * 9;
      const x = p.x + dir.x * fwd + Math.cos(a) * 1.4 * (1 - t * 0.5);
      const z = p.z + dir.z * fwd + Math.sin(a) * 1.4 * (1 - t * 0.5);
      const y = p.y + 0.8 + Math.sin(a) * 0.8 + t * 3;
      this.glow.emit(x, y, z, dir.x * 3, rand(1, 3), dir.z * 3, { r: 0.25 + t * 0.3, g: 0.5, b: 1.1, life: rand(0.5, 1.1) * (0.6 + t * 0.6), size: rand(0.2, 0.45), grow: -0.6, drag: 1, fadeIn: t * 0.3 });
    }
    for (let i = 0; i < 80; i++) {
      this.sparks.emit(p.x + rand(-2, 2), p.y + rand(0, 3), p.z + rand(-2, 2), rand(-1, 1) * 10, rand(3, 12), rand(-1, 1) * 10, { r: 1.0, g: 1.5, b: 2.2, life: rand(0.4, 1), size: 0.025, drag: 1.5, grav: 6 });
    }
    this.lightFlash(p, 0x88ccff, 35);
  }

  musouAura(p, intensity = 1) {
    for (let i = 0; i < 3 * intensity; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.3, 0.8);
      this.glow.emit(p.x + Math.cos(a) * r, p.y + rand(0, 1.8), p.z + Math.sin(a) * r, 0, rand(1.5, 3.5), 0, { r: 0.2, g: 0.45, b: 0.9, life: rand(0.3, 0.6), size: rand(0.08, 0.2), drag: 1 });
    }
  }

  weaponGlowStreak(tip) {
    this.glow.emit(tip.x, tip.y, tip.z, 0, 0, 0, { r: 0.6, g: 1.0, b: 1.8, life: 0.25, size: 0.25, grow: -0.5 });
  }

  pickup(p) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      this.glow.emit(p.x, p.y + 0.5, p.z, Math.cos(a) * 2, rand(1, 4), Math.sin(a) * 2, { r: 2, g: 1.6, b: 0.6, life: rand(0.4, 0.8), size: 0.12, drag: 2 });
    }
  }

  lightFlash(p, color, intensity) {
    this.flash.position.set(p.x, p.y + 1, p.z);
    this.flash.color.set(color);
    this.flashI = Math.max(this.flashI, intensity);
  }

  update(dt, camPos, hero) {
    this.sparks.update(dt); this.glow.update(dt); this.smoke.update(dt);
    this.trail.update(dt); this.rings.update(dt);
    this.flashI *= Math.exp(-dt * 14);
    this.flash.intensity = this.flashI;

    // fires: emit flames & smoke near the camera only
    this.fireAcc += dt;
    const near = [];
    for (const f of this.fires) {
      const d = Math.hypot(f.x - camPos.x, f.z - camPos.z);
      if (d < 140) near.push([d, f]);
    }
    near.sort((a, b) => a[0] - b[0]);
    if (this.fireAcc > 1 / 50) {
      const steps = Math.min(3, Math.floor(this.fireAcc * 50));
      this.fireAcc = 0;
      for (let s = 0; s < steps; s++) for (const [d, f] of near.slice(0, 14)) {
        const n = Math.ceil(f.size * 1.5);
        for (let i = 0; i < n; i++) {
          const sp = f.size * 0.6;
          this.glow.emit(f.x + rand(-sp, sp), f.y + rand(-0.2, 0.3), f.z + rand(-sp, sp), rand(-0.3, 0.3), rand(1.2, 2.6) * (0.6 + f.size * 0.25), rand(-0.3, 0.3),
            { r: 2.4, g: 0.95, b: 0.28, life: rand(0.35, 0.8), size: rand(0.35, 0.8) * f.size * 0.7, grow: -0.6, drag: 0.6, cool: 0.6, fadeIn: 0.15 });
        }
        if (Math.random() < 0.25 * f.size) this.glow.emit(f.x + rand(-1, 1), f.y + 1, f.z + rand(-1, 1), rand(-1, 1), rand(2, 5), rand(-1, 1), { r: 3, g: 1.4, b: 0.4, life: rand(1, 2.5), size: 0.04, drag: 0.4, cool: 1 });
        if (Math.random() < 0.18 * f.size) this.smoke.emit(f.x + rand(-0.5, 0.5), f.y + f.size * 1.2, f.z + rand(-0.5, 0.5), rand(0.2, 0.8), rand(1.5, 2.5), rand(-0.3, 0.3),
          { r: 0.12, g: 0.1, b: 0.09, a: 0.55, life: rand(3, 6), size: rand(1.2, 2.2) * f.size, grow: 2.5, drag: 0.15, rotV: rand(-0.4, 0.4), fadeIn: 0.15 });
      }
    }
    // fire lights on the 3 nearest
    for (let i = 0; i < 3; i++) {
      const l = this.fireLights[i];
      const f = near[i]?.[1];
      if (!f) { l.intensity = 0; continue; }
      l.position.set(f.x, f.y + 0.8, f.z);
      const flick = 0.75 + Math.sin(performance.now() * 0.013 + i * 3) * 0.12 + Math.random() * 0.13;
      l.intensity = 38 * f.size * flick;
    }
    // ambient embers & dust motes around hero
    this.ambAcc += dt;
    if (hero && this.ambAcc > 0.05) {
      this.ambAcc = 0;
      const a = Math.random() * Math.PI * 2, r = rand(3, 22);
      this.glow.emit(hero.x + Math.cos(a) * r, hero.y + rand(0, 4), hero.z + Math.sin(a) * r, rand(0.2, 0.8), rand(0.2, 0.8), rand(-0.3, 0.3),
        { r: 2.2, g: 0.9, b: 0.3, life: rand(2, 4), size: rand(0.02, 0.05), drag: 0.1, cool: 0.5, fadeIn: 0.2 });
    }
  }
}
