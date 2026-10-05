import * as THREE from 'three';
import { heightAt, pathInfo, CORRIDOR, MAP_HALF, VILLAGE, riverZ, insideHouse } from './level.js';
import { mulberry32, makeNoise2D, fbm, smoothstep } from '../core/noise.js';

export const grassUniforms = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3() } };

function bladeGeometry() {
  const segs = 4, w = 0.045;
  const pos = [], uv = [], nor = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const ww = w * (1 - t * 0.92);
    const bend = t * t * 0.18;
    pos.push(-ww, t, bend, ww, t, bend);
    uv.push(0, t, 1, t);
    nor.push(0, 1, 0.2, 0, 1, 0.2);
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function buildGrass(scene, density = 1) {
  const geo = bladeGeometry();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide, color: 0xffffff });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = grassUniforms.uTime;
    sh.uniforms.uPlayer = grassUniforms.uPlayer;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uPlayer;\nvarying float vH;')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
        mvPosition.xz += gWind;
        mvPosition.y -= length(gWind) * 0.35 * vH;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
      `)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
        float h = uv.y; vH = h;
        float gust = sin(uTime * 0.9 + ip.x * 0.05 + ip.z * 0.03) * 0.5 + 0.5;
        float w = sin(uTime * 2.3 + ip.x * 0.35 + ip.z * 0.27) * 0.5 + sin(uTime * 3.7 + ip.x * 0.9) * 0.18;
        vec2 wind = vec2(0.8, 0.45) * (w * 0.35 + gust * 0.5) * h * h;
        // push away from player
        vec2 away = ip.xz - uPlayer.xz;
        float dl = length(away);
        float push = (1.0 - smoothstep(0.3, 1.6, dl)) * h * 1.1;
        wind += normalize(away + 1e-4) * push;
        vec2 gWind = wind;
      `);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.25, 0.9, vH);
      `);
  };

  const noise = makeNoise2D(404);
  const rnd = mulberry32(12);
  const CH = 24;
  const chunks = [];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const perM2 = 9 * density;
  for (let cz = -MAP_HALF; cz < MAP_HALF; cz += CH) {
    for (let cx = -MAP_HALF; cx < MAP_HALF; cx += CH) {
      const ccx = cx + CH / 2, ccz = cz + CH / 2;
      if (pathInfo(ccx, ccz).d > CORRIDOR + 22) continue;
      const target = Math.floor(CH * CH * perM2);
      const mats = [], cols = [];
      for (let i = 0; i < target; i++) {
        const x = cx + rnd() * CH, z = cz + rnd() * CH;
        const p = pathInfo(x, z);
        const patch = fbm(noise, x * 0.06, z * 0.06, 3);
        if (p.d < 5.5 + patch * 3) continue;
        if (Math.abs(z - riverZ(x)) < 13) continue;
        if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 24 + patch * 6) continue;
        if (insideHouse(x, z, 0.2)) continue;
        if (patch < -0.35 && rnd() < 0.8) continue;
        const y = heightAt(x, z);
        const hgt = (0.25 + rnd() * 0.4) * (0.8 + patch * 0.5 + smoothstep(8, 30, p.d) * 0.4);
        dummy.position.set(x, y - 0.03, z);
        dummy.rotation.set((rnd() - 0.5) * 0.25, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.25);
        dummy.scale.set(0.8 + rnd() * 0.6, hgt, 1);
        dummy.updateMatrix();
        mats.push(dummy.matrix.clone());
        const dry = fbm(noise, x * 0.012 + 40, z * 0.012, 3) * 0.5 + 0.5;
        const g = rnd();
        col.setRGB(0.13 + dry * 0.12 + g * 0.04, 0.2 + g * 0.06 + (1 - dry) * 0.05, 0.05 + g * 0.02);
        if (rnd() < 0.012) col.setRGB(0.55, 0.42, 0.12); // dry yellow tufts
        if (rnd() < 0.004) col.setRGB(0.5, 0.15, 0.12); // red wildflowers
        cols.push(col.clone());
      }
      if (!mats.length) continue;
      const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
      for (let i = 0; i < mats.length; i++) { mesh.setMatrixAt(i, mats[i]); mesh.setColorAt(i, cols[i]); }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.userData.center = new THREE.Vector3(ccx, 0, ccz);
      scene.add(mesh);
      chunks.push(mesh);
    }
  }
  return {
    chunks,
    update(time, player, camPos) {
      grassUniforms.uTime.value = time;
      grassUniforms.uPlayer.value.copy(player);
      for (const c of chunks) {
        const d = Math.hypot(c.userData.center.x - camPos.x, c.userData.center.z - camPos.z);
        c.visible = d < 120;
      }
    },
  };
}
