import * as THREE from 'three';
import { heightAt, pathInfo, MAP_HALF, VILLAGE, HOUSES, riverZ, setHeightGrid } from './level.js';
import { makeNoise2D, fbm, smoothstep } from '../core/noise.js';

export function buildTerrain(tex) {
  const SIZE = MAP_HALF * 2, SEG = 300;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const n = pos.count;
  const splat = new Float32Array(n * 3);
  const color = new Float32Array(n * 3);
  const noise = makeNoise2D(91);

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
  }
  geo.computeVertexNormals();
  {
    const N = SEG + 1, hg = new Float32Array(N * N);
    // PlaneGeometry rows go from +y (world -z after rotation) ... vertex (ix, iy): x = -S/2 + ix*step, z = -S/2 + iy*step
    for (let i = 0; i < n; i++) {
      const ix = Math.round((pos.getX(i) + SIZE / 2) / SIZE * SEG), iz = Math.round((pos.getZ(i) + SIZE / 2) / SIZE * SEG);
      hg[iz * N + ix] = pos.getY(i);
    }
    setHeightGrid(hg, N, SIZE);
  }
  const nor = geo.attributes.normal;

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const p = pathInfo(x, z);
    const brk = fbm(noise, x * 0.15, z * 0.15, 3) * 2.2;
    let road = 1 - smoothstep(2.2, 6.5, p.d + brk);
    const vd = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
    road = Math.max(road, (1 - smoothstep(14, 26, vd + brk * 3)) * 0.85);
    const slope = 1 - nor.getY(i);
    let rock = smoothstep(0.12, 0.3, slope + fbm(noise, x * 0.03, z * 0.03, 2) * 0.08);
    const dr = Math.abs(z - riverZ(x));
    const mud = 1 - smoothstep(8, 16, dr + brk);
    road = Math.max(road, mud);
    rock = Math.max(rock * (1 - road), 0);
    const grass = Math.max(0, 1 - road - rock);
    splat[i * 3] = grass; splat[i * 3 + 1] = road; splat[i * 3 + 2] = rock;

    // macro tint
    const dry = fbm(noise, x * 0.01 + 40, z * 0.01, 3) * 0.5 + 0.5;
    let r = 0.95 + dry * 0.25, g = 1.0 + (1 - dry) * 0.08, b = 0.85;
    // scorch near burning houses
    for (const h of HOUSES) {
      if (!h[5]) continue;
      const hd = Math.hypot(x - h[0], z - h[1]);
      const s = 1 - smoothstep(4, 13, hd + brk * 2);
      r *= 1 - s * 0.7; g *= 1 - s * 0.72; b *= 1 - s * 0.68;
    }
    // wet riverbank darkening
    const wet = 1 - smoothstep(6, 11, dr);
    r *= 1 - wet * 0.45; g *= 1 - wet * 0.42; b *= 1 - wet * 0.38;
    // distant hills slightly hazier/bluer handled by fog; height-based snow-less greying
    const hh = smoothstep(30, 80, y);
    r = r * (1 - hh * 0.2); g = g * (1 - hh * 0.15);
    color[i * 3] = r; color[i * 3 + 1] = g; color[i * 3 + 2] = b;
  }
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0,
    normalMap: tex.grassN, normalScale: new THREE.Vector2(1, 1),
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tGrass = { value: tex.grass };
    sh.uniforms.tDirt = { value: tex.dirt };
    sh.uniforms.tRock = { value: tex.rock };
    sh.uniforms.tGrassN = { value: tex.grassN };
    sh.uniforms.tDirtN = { value: tex.dirtN };
    sh.uniforms.tRockN = { value: tex.rockN };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 splat;\nvarying vec3 vSplat;\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSplat = splat;\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass, tDirt, tRock, tGrassN, tDirtN, tRockN;
        varying vec3 vSplat; varying vec3 vWPos;
        vec3 splatW() {
          vec3 w = vSplat;
          // height-blend style sharpening using rock texture luminance as breakup
          float hb = texture2D(tRock, vWPos.xz / 7.0).r;
          w.y = clamp(w.y + (hb - 0.5) * 0.6 * w.y * (1.0 - w.y) * 4.0, 0.0, 1.0);
          w = pow(w, vec3(1.6));
          return w / max(w.x + w.y + w.z, 1e-3);
        }`)
      .replace('#include <map_fragment>', `
        vec3 sw = splatW();
        vec2 wuv = vWPos.xz;
        vec3 cg = mix(texture2D(tGrass, wuv / 4.5).rgb, texture2D(tGrass, wuv / 23.0).rgb, 0.4);
        vec3 cd = mix(texture2D(tDirt, wuv / 3.5).rgb, texture2D(tDirt, wuv / 19.0).rgb, 0.35);
        vec3 cr = mix(texture2D(tRock, wuv / 6.0).rgb, texture2D(tRock, wuv / 31.0).rgb, 0.4);
        diffuseColor.rgb *= cg * sw.x + cd * sw.y + cr * sw.z;
      `)
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `
        vec3 mapN = (texture2D(tGrassN, vWPos.xz / 4.5).xyz * sw.x + texture2D(tDirtN, vWPos.xz / 3.5).xyz * sw.y + texture2D(tRockN, vWPos.xz / 6.0).xyz * sw.z) * 2.0 - 1.0;
      `);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// Distant mountain ring for depth and silhouette.
export function buildFarMountains() {
  const group = new THREE.Group();
  const noise = makeNoise2D(5150);
  const layers = [
    { r0: 380, r1: 640, h: 110, col: new THREE.Color(0x56664f), haze: 0.35, seed: 0 },
    { r0: 660, r1: 1050, h: 230, col: new THREE.Color(0x7a8a94), haze: 0.62, seed: 50 },
  ];
  const hazeCol = new THREE.Color(0xb8b4a6);
  for (const L of layers) {
    const segA = 480, segR = 18;
    const geo = new THREE.BufferGeometry();
    const verts = [], cols = [], idx = [];
    for (let j = 0; j <= segR; j++) {
      const t = j / segR;
      const r = L.r0 + (L.r1 - L.r0) * t;
      for (let i = 0; i <= segA; i++) {
        const a = (i / segA) * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const ca = Math.cos(a) * 2.2 + L.seed, sa = Math.sin(a) * 2.2 + t * 1.4;
        const broad = fbm(noise, ca, sa, 3) * 0.5 + 0.5;
        const ridge = 1 - Math.abs(fbm(noise, ca * 2.5 + 7, sa * 2.5, 3));
        const env = Math.pow(Math.sin(t * Math.PI), 0.7);
        const y = (Math.pow(broad, 1.6) * 0.75 + ridge * ridge * 0.25) * L.h * env - 8;
        verts.push(x, y, z);
        // aerial perspective baked into vertex colour: higher & farther -> hazier
        const k = Math.min(1, L.haze + t * 0.25 + (y / L.h) * 0.1);
        const c = L.col.clone().lerp(hazeCol, k);
        cols.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < segR; j++) for (let i = 0; i < segA; i++) {
      const a = j * (segA + 1) + i, b = a + segA + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    group.add(m);
  }
  return group;
}
