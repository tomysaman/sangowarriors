import * as THREE from 'three';

// Verlet cape pinned to the chest bone. Simulated in world space.
export class Cape {
  constructor(scene, rig, material, { cols = 9, rows = 14, width = 0.52, length = 1.25 } = {}) {
    this.rig = rig; this.cols = cols; this.rows = rows;
    this.width = width; this.len = length;
    const n = cols * rows;
    this.p = new Float32Array(n * 3); this.pp = new Float32Array(n * 3);
    this.rest = length / (rows - 1); this.restW = width / (cols - 1);
    const geo = new THREE.PlaneGeometry(width, length, cols - 1, rows - 1);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.anchor = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.colliders = [];
    this.init = false;
    this.wind = new THREE.Vector3(0.6, 0, 0.3);
    this.time = 0;
  }

  anchorPoint(out, i) {
    // pinned across the upper back, slightly curved
    const u = i / (this.cols - 1) - 0.5;
    out.set(u * this.width * 0.85, 0.27, -0.185 + Math.abs(u) * 0.05);
    return this.rig.B.chest.localToWorld(out);
  }

  reset() {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      this.anchorPoint(this.tmp, c);
      const i = (r * this.cols + c) * 3;
      this.p[i] = this.pp[i] = this.tmp.x;
      this.p[i + 1] = this.pp[i + 1] = this.tmp.y - r * this.rest;
      this.p[i + 2] = this.pp[i + 2] = this.tmp.z;
    }
    this.init = true;
  }

  update(dt, groundY) {
    if (!this.init) this.reset();
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    const { cols, rows, p, pp } = this;
    const g = -9.8 * dt * dt;
    const B = this.rig.B;
    // colliders: torso, hips, thighs (spheres in world space)
    const col = this.colliders;
    col.length = 0;
    const sph = (bone, x, y, z, r) => { const v = new THREE.Vector3(x, y, z); bone.localToWorld(v); col.push([v, r]); };
    sph(B.chest, 0, 0.12, -0.02, 0.22); sph(B.spine, 0, 0.05, -0.02, 0.2); sph(B.hips, 0, -0.05, -0.02, 0.21);
    sph(B.thighL, 0, -0.2, 0, 0.12); sph(B.thighR, 0, -0.2, 0, 0.12);
    sph(B.shinL, 0, -0.15, 0, 0.1); sph(B.shinR, 0, -0.15, 0, 0.1);
    const gust = 0.5 + Math.sin(this.time * 1.3) * 0.3 + Math.sin(this.time * 3.1) * 0.15;
    const wx = this.wind.x * gust * dt * dt * 4, wz = this.wind.z * gust * dt * dt * 4;
    // integrate
    for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 3;
      const k = 0.985;
      const vx = (p[i] - pp[i]) * k, vy = (p[i + 1] - pp[i + 1]) * k, vz = (p[i + 2] - pp[i + 2]) * k;
      pp[i] = p[i]; pp[i + 1] = p[i + 1]; pp[i + 2] = p[i + 2];
      p[i] += vx + wx; p[i + 1] += vy + g; p[i + 2] += vz + wz;
    }
    // pin top row
    for (let c = 0; c < cols; c++) {
      this.anchorPoint(this.tmp, c);
      p[c * 3] = pp[c * 3] = this.tmp.x; p[c * 3 + 1] = pp[c * 3 + 1] = this.tmp.y; p[c * 3 + 2] = pp[c * 3 + 2] = this.tmp.z;
    }
    const sat = (a, b, rest) => {
      const ia = a * 3, ib = b * 3;
      const dx = p[ib] - p[ia], dy = p[ib + 1] - p[ia + 1], dz = p[ib + 2] - p[ia + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const diff = (d - rest) / d;
      const pinA = a < cols, pinB = b < cols;
      const wa = pinA ? 0 : pinB ? 1 : 0.5, wb = pinB ? 0 : pinA ? 1 : 0.5;
      p[ia] += dx * diff * wa; p[ia + 1] += dy * diff * wa; p[ia + 2] += dz * diff * wa;
      p[ib] -= dx * diff * wb; p[ib + 1] -= dy * diff * wb; p[ib + 2] -= dz * diff * wb;
    };
    const diag = Math.hypot(this.rest, this.restW);
    for (let it = 0; it < 5; it++) {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c < cols - 1) sat(i, i + 1, this.restW);
        if (r < rows - 1) sat(i, i + cols, this.rest);
        if (it < 2 && r < rows - 1 && c < cols - 1) { sat(i, i + cols + 1, diag); sat(i + 1, i + cols, diag); }
      }
      // collisions
      for (let i = cols; i < cols * rows; i++) {
        const ix = i * 3;
        for (const [cpos, rad] of col) {
          const dx = p[ix] - cpos.x, dy = p[ix + 1] - cpos.y, dz = p[ix + 2] - cpos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < rad * rad) {
            const d = Math.sqrt(d2) || 1e-5, k = (rad - d) / d;
            p[ix] += dx * k; p[ix + 1] += dy * k; p[ix + 2] += dz * k;
          }
        }
        if (p[ix + 1] < groundY + 0.03) p[ix + 1] = groundY + 0.03;
      }
    }
    // write geometry (PlaneGeometry vertex order: rows top->bottom, cols left->right)
    const pos = this.geo.attributes.position;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      pos.setXYZ(i, p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }

  setVisible(v) { this.mesh.visible = v; }
}
