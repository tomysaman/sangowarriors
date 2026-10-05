import * as THREE from 'three';

// Instanced billboard particles, CPU simulated. Modes: additive glow, stretched sparks, alpha smoke.
export class Particles {
  constructor(scene, max, { additive = true, stretch = 0, texture = null, depthTest = true, lit = false } = {}) {
    this.max = max;
    this.count = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(this.vel, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iVel', this.aVel); g.setAttribute('iCol', this.aCol);
    g.setAttribute('iSize', this.aSize); g.setAttribute('iRot', this.aRot);
    g.instanceCount = 0;
    // simulation state (not uploaded)
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    this.grow = new Float32Array(max); this.baseA = new Float32Array(max); this.rotV = new Float32Array(max);
    this.size0 = new Float32Array(max); this.fadeIn = new Float32Array(max);
    this.rgb = new Float32Array(max * 3); this.cool = new Float32Array(max);

    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, stretch: { value: stretch }, useMap: { value: texture ? 1 : 0 }, sunCol: { value: new THREE.Color(1.0, 0.8, 0.6) } },
      vertexShader: /* glsl */`
        attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute float iSize; attribute float iRot;
        uniform float stretch;
        varying vec2 vUv; varying vec4 vCol; varying float vFog;
        void main() {
          vUv = uv; vCol = iCol;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          vec2 c = position.xy;
          if (stretch > 0.0) {
            vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
            vec2 sv = vv.xy / max(-mv.z, 0.5) * 6.0;
            float l = length(sv);
            vec2 d = l > 1e-4 ? sv / l : vec2(1.0, 0.0);
            vec2 n = vec2(-d.y, d.x);
            float len = iSize + length(vv.xy) * stretch;
            mv.xy += d * c.x * len + n * c.y * iSize;
          } else {
            float s = sin(iRot), co = cos(iRot);
            mv.xy += mat2(co, s, -s, co) * c * iSize;
          }
          vFog = clamp(1.0 - exp(-0.0042 * -mv.z), 0.0, 1.0);
          vCol.a *= smoothstep(0.4, 2.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map; uniform float useMap;
        varying vec2 vUv; varying vec4 vCol; varying float vFog;
        void main() {
          float a;
          if (useMap > 0.5) a = texture2D(map, vUv).a;
          else { float d = length(vUv - 0.5) * 2.0; a = pow(max(0.0, 1.0 - d), 1.8); }
          a *= vCol.a * (1.0 - vFog * 0.85);
          if (a < 0.003) discard;
          gl_FragColor = vec4(vCol.rgb * ${additive ? 'a' : '1.0'}, ${additive ? '1.0' : 'a'});
        }`,
      transparent: true, depthWrite: false, depthTest,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    if (additive) { mat.blending = THREE.CustomBlending; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor; }
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 10 : 5;
    this.geo = g;
    scene.add(this.mesh);
  }

  emit(x, y, z, vx, vy, vz, o) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.rgb[i * 3] = o.r; this.rgb[i * 3 + 1] = o.g; this.rgb[i * 3 + 2] = o.b;
    this.baseA[i] = o.a ?? 1;
    this.life[i] = this.maxLife[i] = o.life;
    this.drag[i] = o.drag ?? 1; this.grav[i] = o.grav ?? 0;
    this.size0[i] = o.size; this.grow[i] = o.grow ?? 0;
    this.rot[i] = o.rot ?? Math.random() * 6.28; this.rotV[i] = o.rotV ?? 0;
    this.fadeIn[i] = o.fadeIn ?? 0;
    this.cool[i] = o.cool ?? 0;
  }

  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        if (i !== n) this.copy(n, i);
        i--; continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.rot[i] += this.rotV[i] * dt;
      const age = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.size0[i] * (1 + this.grow[i] * age);
      const fi = this.fadeIn[i] > 0 ? Math.min(1, age / this.fadeIn[i]) : 1;
      const a = this.baseA[i] * fi * (1 - age) * (1 - age * 0.3);
      // optional cooling toward red (sparks/embers)
      const c = this.cool[i] * age;
      this.col[i * 4] = this.rgb[i * 3] * (1 - c * 0.2);
      this.col[i * 4 + 1] = this.rgb[i * 3 + 1] * (1 - c * 0.7);
      this.col[i * 4 + 2] = this.rgb[i * 3 + 2] * (1 - c);
      this.col[i * 4 + 3] = a;
    }
    this.count = n;
    this.geo.instanceCount = n;
    for (const a of [this.aPos, this.aVel, this.aCol, this.aSize, this.aRot]) {
      a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true;
    }
  }

  copy(from, to) {
    const c3 = (arr) => { arr[to * 3] = arr[from * 3]; arr[to * 3 + 1] = arr[from * 3 + 1]; arr[to * 3 + 2] = arr[from * 3 + 2]; };
    c3(this.pos); c3(this.vel); c3(this.rgb);
    for (let j = 0; j < 4; j++) this.col[to * 4 + j] = this.col[from * 4 + j];
    for (const arr of [this.size, this.rot, this.life, this.maxLife, this.drag, this.grav, this.grow, this.baseA, this.rotV, this.size0, this.fadeIn, this.cool]) arr[to] = arr[from];
  }
}
