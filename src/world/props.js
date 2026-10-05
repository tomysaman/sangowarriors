import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  heightAt, pathInfo, PATH, HOUSES, VILLAGE, WELL, BRIDGE, WATER_Y, riverZ, CORRIDOR, insideHouse, PASS, START, MAP_HALF,
} from './level.js';
import { mulberry32, makeNoise2D, fbm } from '../core/noise.js';
import { SUN_DIR } from './sky.js';
import {
  makeBarkTexture, makeWoodTexture, makePlasterTexture, makeTileTexture, makeBannerTexture, normalFromHeight,
} from './textures.js';

export const clothUniforms = { uTime: { value: 0 } };

export function windCloth(mat, amp = 0.35) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = clothUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        vec4 wp0 = modelMatrix * vec4(0.0,0.0,0.0,1.0);
        float ph = wp0.x * 0.37 + wp0.z * 0.21;
        float k = uv.x; // 0 at pole, 1 at free edge
        float wave = sin(uTime * 4.2 - uv.x * 5.0 + uv.y * 1.6 + ph) * 0.6 + sin(uTime * 7.1 - uv.x * 9.0 + ph * 2.0) * 0.25;
        transformed.z += wave * ${amp.toFixed(2)} * k;
        transformed.x -= abs(wave) * 0.06 * k;
      `);
  };
  return mat;
}

function scatter(rnd, count, test, tries = 20) {
  const out = [];
  for (let i = 0; i < count * tries && out.length < count; i++) {
    const x = (rnd() * 2 - 1) * MAP_HALF, z = (rnd() * 2 - 1) * MAP_HALF;
    if (test(x, z)) out.push([x, z]);
  }
  return out;
}

// ---------------------------------------------------------------- Trees
function pineGeometries(rnd, noise) {
  // trunk: bent tube
  const pts = [];
  const lean = (rnd() - 0.5) * 1.6;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector3(Math.sin(t * 2.4 + rnd()) * 0.5 * t + lean * t * t, t * 9, Math.cos(t * 1.7) * 0.3 * t));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunk = new THREE.TubeGeometry(curve, 16, 0.32, 7, false);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    const s = 1 - (y / 9) * 0.65;
    const c = curve.getPoint(Math.min(1, Math.max(0, y / 9)));
    tp.setX(i, c.x + (tp.getX(i) - c.x) * s);
    tp.setZ(i, c.z + (tp.getZ(i) - c.z) * s);
  }
  trunk.computeVertexNormals();
  // foliage pads: flattened displaced blobs on branch tips
  const pads = [];
  const nPads = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < nPads; i++) {
    const t = 0.45 + (i / nPads) * 0.55;
    const c = curve.getPoint(Math.min(1, t));
    const a = rnd() * Math.PI * 2, r = (1 - t) * 3.2 + 0.6;
    const g = new THREE.IcosahedronGeometry(1, 2);
    const gp = g.attributes.position;
    for (let j = 0; j < gp.count; j++) {
      const v = new THREE.Vector3().fromBufferAttribute(gp, j);
      const n = noise(v.x * 1.7 + i * 3, v.z * 1.7 + v.y) * 0.35;
      v.multiplyScalar(1 + n);
      gp.setXYZ(j, v.x, v.y, v.z);
    }
    const sx = 1.6 + rnd() * 1.2;
    g.scale(sx, 0.55 + rnd() * 0.25, sx * (0.8 + rnd() * 0.4));
    g.translate(c.x + Math.cos(a) * r, c.y + 0.2, c.z + Math.sin(a) * r);
    // branch to the pad
    const br = new THREE.CylinderGeometry(0.06, 0.12, r, 5);
    br.rotateZ(Math.PI / 2); br.translate(r / 2, 0, 0); br.rotateY(-a); br.translate(c.x, c.y, c.z);
    pads.push(g);
    trunk.userData.branches = trunk.userData.branches || [];
    trunk.userData.branches.push(br);
  }
  const top = new THREE.IcosahedronGeometry(1.4, 2); top.scale(1.6, 0.7, 1.6);
  const tc = curve.getPoint(1); top.translate(tc.x, tc.y + 0.3, tc.z);
  pads.push(top);
  const foliage = mergeGeometries(pads.map((p) => (p.index ? p.toNonIndexed() : p)));
  const trunkAll = mergeGeometries([trunk.toNonIndexed(), ...trunk.userData.branches.map((b) => { const nb = b.index ? b.toNonIndexed() : b; nb.deleteAttribute('uv'); nb.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(nb.attributes.position.count * 2), 2)); return nb; })]);
  return { trunk: trunkAll, foliage };
}

function bambooGeometries() {
  const stalks = [];
  for (let i = 0; i < 1; i++) {
    const g = new THREE.CylinderGeometry(0.07, 0.09, 11, 6, 22);
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const y = p.getY(j) + 5.5;
      const node = Math.abs(((y / 0.5) % 1) - 0.5) < 0.04 ? 1.25 : 1;
      p.setX(j, p.getX(j) * node + y * y * 0.004);
      p.setZ(j, p.getZ(j) * node);
      p.setY(j, y);
    }
    g.computeVertexNormals();
    stalks.push(g);
  }
  // leaves: small quads near top
  const leaves = [];
  const rnd = mulberry32(8);
  for (let i = 0; i < 60; i++) {
    const q = new THREE.PlaneGeometry(0.12, 0.7);
    q.translate(0, -0.35, 0);
    q.rotateZ(0.8 + rnd() * 0.9);
    q.rotateY(rnd() * Math.PI * 2);
    const y = 6 + rnd() * 5;
    q.translate(y * y * 0.004 + (rnd() - 0.5) * 1.2, y, (rnd() - 0.5) * 1.2);
    leaves.push(q);
  }
  return { stalk: stalks[0], leaves: mergeGeometries(leaves) };
}

function placeInstanced(scene, geo, mat, transforms, { cast = true, receive = true } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, transforms.length);
  transforms.forEach((t, i) => m.setMatrixAt(i, t));
  m.instanceMatrix.needsUpdate = true;
  m.castShadow = cast; m.receiveShadow = receive;
  m.computeBoundingSphere();
  scene.add(m);
  return m;
}

// ---------------------------------------------------------------- Roofs
function roofGeometry(len, depth, rise, overhang = 1.2, upturn = 0.9) {
  const L = len / 2 + overhang, D = depth / 2 + overhang;
  const segU = 16, segV = 8;
  const pos = [], uv = [], idx = [];
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= segV; j++) {
      const v = j / segV;
      for (let i = 0; i <= segU; i++) {
        const u = (i / segU) * 2 - 1;
        const x = u * L * (1 + v * 0.04);
        const z = side * v * D;
        const curve = Math.pow(1 - v, 1.8);
        const y = rise * curve + upturn * Math.pow(Math.abs(u), 6) * (0.4 + v) + upturn * 0.35 * Math.pow(v, 3);
        pos.push(x, y, z);
        uv.push(u * L / 2, v * D / 1.5);
      }
    }
    for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
      const a = base + j * (segU + 1) + i, b = a + segU + 1;
      if (side > 0) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- Main
export function buildProps(scene, quality = 1) {
  const rnd = mulberry32(1234);
  const noise = makeNoise2D(55);
  const fires = [];        // {x,y,z,size}
  const smokes = [];
  const colliders = [];    // circles {x,z,r}

  const bark = makeBarkTexture();
  const wood = makeWoodTexture();
  const plaster = makePlasterTexture();
  const tile = makeTileTexture();

  const barkMat = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normal, roughness: 0.95 });
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x2c3d1f, roughness: 0.9 });
  pineMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vLP;
      float h3(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float nn = h3(floor(vLP * 9.0));
        diffuseColor.rgb *= 0.7 + nn * 0.5;
        diffuseColor.rgb *= mix(0.55, 1.15, smoothstep(0.0, 10.0, vLP.y));`);
  };
  const woodMat = new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normal, roughness: 0.8 });
  const darkWoodMat = new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normal, color: 0x5a3020, roughness: 0.7 });
  const charMat = new THREE.MeshStandardMaterial({ map: wood.map, color: 0x1a1410, roughness: 1, emissive: 0x200800 });
  const plasterMat = new THREE.MeshStandardMaterial({ map: plaster.map, normalMap: plaster.normal, roughness: 0.95 });
  const scorchMat = new THREE.MeshStandardMaterial({ map: plaster.map, normalMap: plaster.normal, color: 0x4a3c34, roughness: 1 });
  tile.map.repeat.set(1, 1);
  const roofMat = new THREE.MeshStandardMaterial({ map: tile.map, normalMap: tile.normal, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.9, normalMap: plaster.normal });

  // --- Trees (pines) ---
  const variants = [0, 1, 2].map(() => pineGeometries(rnd, noise));
  const treeT = [[], [], []];
  const treeSpots = scatter(rnd, 900, (x, z) => {
    const p = pathInfo(x, z);
    if (p.d < 14) return false;
    if (Math.abs(z - riverZ(x)) < 16) return false;
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 36) return false;
    if (p.d > 220) return false;
    const n = fbm(noise, x * 0.02, z * 0.02, 3);
    return n > -0.05 || (p.d < CORRIDOR && rnd() < 0.05);
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  for (const [x, z] of treeSpots) {
    const v = Math.floor(rnd() * 3);
    const s = 0.8 + rnd() * 0.7;
    e.set((rnd() - 0.5) * 0.08, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.08);
    q.setFromEuler(e); sv.set(s, s * (0.9 + rnd() * 0.3), s); pv.set(x, heightAt(x, z) - 0.3, z);
    treeT[v].push(m4.compose(pv, q, sv).clone());
    if (pathInfo(x, z).d < CORRIDOR + 2) colliders.push({ x, z, r: 0.6 * s });
  }
  variants.forEach((g, i) => {
    if (!treeT[i].length) return;
    placeInstanced(scene, g.trunk, barkMat, treeT[i]);
    placeInstanced(scene, g.foliage, pineMat, treeT[i]);
  });

  // --- Bamboo groves near the village and the pass ---
  const bam = bambooGeometries();
  const bamT = [];
  const groves = [[12, -100, 9], [84, -88, 10], [-2, 36, 8], [-40, 80, 10], [-36, 50, 7], [24, -14, 6], [20, 150, 8]];
  for (const [gx, gz, r] of groves) {
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
      const x = gx + Math.cos(a) * d, z = gz + Math.sin(a) * d;
      if (pathInfo(x, z).d < 6 || insideHouse(x, z, 1)) continue;
      e.set((rnd() - 0.5) * 0.2, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.2);
      q.setFromEuler(e); const s = 0.7 + rnd() * 0.5; sv.set(s, s, s); pv.set(x, heightAt(x, z) - 0.2, z);
      bamT.push(m4.compose(pv, q, sv).clone());
    }
  }
  const bamMat = new THREE.MeshStandardMaterial({ color: 0x7d8a3a, roughness: 0.55 });
  const bamLeafMat = windCloth(new THREE.MeshStandardMaterial({ color: 0x4f6a24, roughness: 0.7, side: THREE.DoubleSide }), 0.05);
  placeInstanced(scene, bam.stalk, bamMat, bamT);
  placeInstanced(scene, bam.leaves, bamLeafMat, bamT);

  // --- Rocks ---
  let rockGeo = new THREE.IcosahedronGeometry(1, 3);
  rockGeo.deleteAttribute('uv'); rockGeo.deleteAttribute('normal');
  rockGeo = mergeVertices(rockGeo);
  {
    const p = rockGeo.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, j);
      const n = fbm(noise, v.x * 1.3 + 9, v.z * 1.3 + v.y * 1.1, 4) * 0.4;
      v.multiplyScalar(1 + n);
      if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.2;
      p.setXYZ(j, v.x, v.y * 0.75, v.z);
    }
    rockGeo.computeVertexNormals();
    const uvs = new Float32Array(p.count * 2);
    for (let j = 0; j < p.count; j++) { uvs[j * 2] = Math.atan2(p.getZ(j), p.getX(j)) / Math.PI + 1; uvs[j * 2 + 1] = p.getY(j); }
    rockGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  const rockTex = makeRockMats();
  const rockT = [];
  for (const [x, z] of scatter(rnd, 260, (x, z) => { const d = pathInfo(x, z).d; return d > 8 && d < 160 && Math.abs(z - riverZ(x)) > 12 && Math.hypot(x - VILLAGE.x, z - VILLAGE.z) > 30; })) {
    const s = 0.4 + rnd() ** 3 * 4;
    e.set(rnd() * 0.3, rnd() * 6, rnd() * 0.3); q.setFromEuler(e); sv.set(s * (0.8 + rnd() * 0.6), s, s * (0.8 + rnd() * 0.6)); pv.set(x, heightAt(x, z) - s * 0.15, z);
    rockT.push(m4.compose(pv, q, sv).clone());
    if (s > 1 && pathInfo(x, z).d < CORRIDOR + 2) colliders.push({ x, z, r: s * 0.9 });
  }
  // riverbank boulders
  for (let i = 0; i < 60; i++) {
    const x = (rnd() * 2 - 1) * 120; const z = riverZ(x) + (rnd() < 0.5 ? -1 : 1) * (9 + rnd() * 5);
    if (Math.abs(x) < BRIDGE.width + 3) continue;
    const s = 0.5 + rnd() * 1.8;
    e.set(rnd(), rnd() * 6, rnd()); q.setFromEuler(e); sv.set(s, s * 0.7, s); pv.set(x, heightAt(x, z), z);
    rockT.push(m4.compose(pv, q, sv).clone());
  }
  placeInstanced(scene, rockGeo, rockTex, rockT);

  // --- Village houses ---
  const village = new THREE.Group();
  for (const [hx, hz, w, d, rot, burning] of HOUSES) {
    const g = new THREE.Group();
    const y0 = heightAt(hx, hz);
    const wallH = 3.2;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), burning ? scorchMat : plasterMat);
    walls.position.y = wallH / 2; walls.castShadow = walls.receiveShadow = true; g.add(walls);
    // stone plinth
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), stoneMat);
    plinth.position.y = 0.15; plinth.receiveShadow = true; g.add(plinth);
    // pillars
    const pil = new THREE.CylinderGeometry(0.16, 0.18, wallH + 0.3, 8);
    for (const sx of [-1, -0.33, 0.33, 1]) for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(pil, burning ? charMat : darkWoodMat);
      p.position.set(sx * (w / 2 + 0.05), wallH / 2 + 0.1, sz * (d / 2 + 0.05)); p.castShadow = true; g.add(p);
    }
    // beam
    for (const sz of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.28, 0.3), burning ? charMat : darkWoodMat);
      b.position.set(0, wallH + 0.1, sz * (d / 2 + 0.05)); g.add(b);
    }
    // door & window frames
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.1), darkWoodMat);
    door.position.set(0, 1.1, d / 2 + 0.03); g.add(door);
    for (const sx of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.08), burning ? charMat : woodMat);
      win.position.set(sx * w * 0.3, 1.9, d / 2 + 0.04); g.add(win);
      for (let k = -2; k <= 2; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, 0.1), darkWoodMat);
        bar.position.set(sx * w * 0.3 + k * 0.2, 1.9, d / 2 + 0.07); g.add(bar);
      }
    }
    // roof
    const roof = new THREE.Mesh(roofGeometry(w, d, 2.0, 1.1, 0.7), roofMat);
    roof.position.y = wallH + 0.25; roof.castShadow = true; roof.receiveShadow = true;
    if (burning) { roof.rotation.z = (rnd() - 0.5) * 0.12; roof.rotation.x = (rnd() - 0.5) * 0.08; roof.material = roofMat; }
    g.add(roof);
    // ridge ornament
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + 2.4, 0.3, 0.35), roofMat);
    ridge.position.y = wallH + 2.35; g.add(ridge);
    for (const sx of [-1, 1]) {
      const curl = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.1, 6, 10, Math.PI * 1.2), roofMat);
      curl.position.set(sx * (w / 2 + 1.2), wallH + 2.6, 0); curl.rotation.y = Math.PI / 2; g.add(curl);
    }
    g.position.set(hx, y0, hz);
    g.rotation.y = -rot;
    village.add(g);
    if (burning) {
      const loc = (lx, ly, lz) => {
        const c = Math.cos(rot), s = Math.sin(rot);
        return { x: hx + lx * c - lz * s, y: y0 + ly, z: hz + lx * s + lz * c };
      };
      fires.push({ ...loc(0, wallH + 1.6, 0), size: 2.6 });
      fires.push({ ...loc(w * 0.3, wallH + 0.8, d * 0.3), size: 1.6 });
      fires.push({ ...loc(-w * 0.35, 1.0, d / 2 + 0.6), size: 1.2 });
      smokes.push({ ...loc(0, wallH + 3, 0), size: 1 });
    }
  }
  scene.add(village);

  // --- Well ---
  {
    const g = new THREE.Group();
    const y0 = heightAt(WELL.x, WELL.z);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 1.0, 20, 1, true), stoneMat);
    ring.position.y = 0.5; ring.castShadow = true; g.add(ring);
    const ringIn = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.0, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a3632, side: THREE.BackSide }));
    ringIn.position.y = 0.5; g.add(ringIn);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.2, 8, 24), stoneMat);
    lip.rotation.x = Math.PI / 2; lip.position.y = 1.0; g.add(lip);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1.0, 20), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    hole.rotation.x = -Math.PI / 2; hole.position.y = 0.4; g.add(hole);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), darkWoodMat);
      post.position.set(sx * 1.4, 1.3, 0); post.castShadow = true; g.add(post);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.9, 8), woodMat);
    axle.rotation.z = Math.PI / 2; axle.position.y = 2.1; g.add(axle);
    const wroof = new THREE.Mesh(roofGeometry(2.4, 1.4, 0.7, 0.4, 0.3), roofMat);
    wroof.position.y = 2.6; wroof.castShadow = true; g.add(wroof);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 4), woodMat);
    rope.position.set(0.3, 1.45, 0); g.add(rope);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.35, 10), woodMat);
    bucket.position.set(1.7, 0.18, 0.6); g.add(bucket);
    g.position.set(WELL.x, y0, WELL.z);
    scene.add(g);
    colliders.push({ x: WELL.x, z: WELL.z, r: 1.6 });
  }

  // --- Bridge (Changban) ---
  {
    const g = new THREE.Group();
    const planks = [];
    const N = 60;
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1)) * 2 - 1;
      const z = BRIDGE.z + t * BRIDGE.len / 2;
      const y = BRIDGE.deckY + (1 - t * t) * 1.1;
      const b = new THREE.BoxGeometry(BRIDGE.width, 0.18, BRIDGE.len / N * 0.92);
      const slope = -2 * t * 1.1 / (BRIDGE.len / 2);
      b.rotateX(-Math.atan(slope)); b.translate(BRIDGE.x + (rnd() - 0.5) * 0.05, y - 0.09, z);
      planks.push(b);
    }
    const deck = new THREE.Mesh(mergeGeometries(planks), woodMat);
    deck.castShadow = deck.receiveShadow = true; g.add(deck);
    const posts = [];
    for (let i = 0; i <= 12; i++) {
      const t = (i / 12) * 2 - 1;
      const z = BRIDGE.z + t * BRIDGE.len / 2;
      const y = BRIDGE.deckY + (1 - t * t) * 1.1;
      for (const sx of [-1, 1]) {
        const p = new THREE.BoxGeometry(0.2, 1.1, 0.2); p.translate(BRIDGE.x + sx * (BRIDGE.width / 2 - 0.1), y + 0.5, z); posts.push(p);
        if (i % 3 === 0) {
          const pil = new THREE.CylinderGeometry(0.3, 0.35, y - WATER_Y + 4, 8);
          pil.translate(BRIDGE.x + sx * (BRIDGE.width / 2 - 0.4), (y + WATER_Y - 4) / 2, z); posts.push(pil);
        }
      }
    }
    const postGeo = mergeGeometries(posts.map((p) => (p.index ? p.toNonIndexed() : p)));
    const postMesh = new THREE.Mesh(postGeo, darkWoodMat); postMesh.castShadow = true; g.add(postMesh);
    for (const sx of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const t = (i / 20) * 2 - 1;
        pts.push(new THREE.Vector3(BRIDGE.x + sx * (BRIDGE.width / 2 - 0.1), BRIDGE.deckY + (1 - t * t) * 1.1 + 1.05, BRIDGE.z + t * BRIDGE.len / 2));
      }
      const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.08, 6), darkWoodMat);
      rail.castShadow = true; g.add(rail);
    }
    scene.add(g);
  }

  // --- River water: analytic waves, fresnel sky reflection, sun glint ---
  const waterU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSun: { value: SUN_DIR.clone() } }]);
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterU, fog: true, transparent: true, depthWrite: true,
    vertexShader: `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSun;
      varying vec3 vW;
      #include <common>
      #include <fog_pars_fragment>
      vec2 wave(vec2 p, vec2 d, float f, float s, float a) { float ph = dot(p, d) * f + uTime * s; return d * cos(ph) * a * f; }
      vec3 skyCol(vec3 d) {
        float h = max(d.y, 0.0);
        vec3 c = mix(vec3(1.0, 0.82, 0.62), vec3(0.32, 0.46, 0.74), pow(h, 0.5));
        float s = max(dot(d, uSun), 0.0);
        return c + vec3(1.0, 0.75, 0.45) * pow(s, 12.0) * 1.5;
      }
      void main() {
        vec2 p = vW.xz;
        vec2 g = wave(p, normalize(vec2(1.0, 0.25)), 0.9, 1.6, 0.025) + wave(p, normalize(vec2(0.7, -0.6)), 1.7, 2.3, 0.02)
               + wave(p, normalize(vec2(-0.8, -0.45)), 1.3, 1.9, 0.02) + wave(p, normalize(vec2(0.2, 0.9)), 2.3, 2.7, 0.014)
               + wave(p, normalize(vec2(-0.3, 1.0)), 3.1, 3.1, 0.012) + wave(p, normalize(vec2(0.95, 0.1)), 5.3, 4.2, 0.006)
               + wave(p * 1.7, normalize(vec2(1.0, -0.2)), 8.0, 6.0, 0.003);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vW);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        vec3 refl = skyCol(r) * 0.7;
        vec3 deep = vec3(0.025, 0.075, 0.07);
        vec3 col = mix(deep, refl, fres);
        float spec = pow(max(dot(r, uSun), 0.0), 220.0);
        col += vec3(1.0, 0.85, 0.6) * spec * 6.0;
        gl_FragColor = vec4(col, 0.94);
        #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(MAP_HALF * 2, 60, 1, 1).rotateX(-Math.PI / 2), waterMat);
  water.position.set(0, WATER_Y, BRIDGE.z);
  water.userData.noAO = true;
  scene.add(water);

  // --- Banners on poles ---
  const weiTex = makeBannerTexture('曹', '#1d2c5a', '#e8dcc0', '#0e1530');
  const liuTex = makeBannerTexture('劉', '#2e5a2a', '#f0e6c8', '#16301a');
  const zhaoTex = makeBannerTexture('趙', '#e8e4da', '#1d3b26', '#2a6a3a');
  const bannerGeo = new THREE.PlaneGeometry(1.3, 2.6, 12, 6); bannerGeo.translate(0.65, 0, 0);
  const mk = (tex) => windCloth(new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }));
  const weiMat = mk(weiTex), liuMat = mk(liuTex), zhaoMat = mk(zhaoTex);
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.06, 6, 6);
  const finial = new THREE.ConeGeometry(0.1, 0.4, 6);
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.35 });
  const placeBanner = (x, z, mat, ry = 0) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, darkWoodMat); pole.position.y = 3; pole.castShadow = true; g.add(pole);
    const f = new THREE.Mesh(finial, gold); f.position.y = 6.2; g.add(f);
    const b = new THREE.Mesh(bannerGeo, mat); b.position.set(0.05, 4.4, 0); b.castShadow = true; g.add(b);
    g.position.set(x, heightAt(x, z), z); g.rotation.y = ry;
    scene.add(g);
  };
  // Wei banners along the route & around camp at the pass
  for (let i = 0; i < 26; i++) {
    const s = 40 + i * 17;
    const pi = Math.min(PATH.length - 2, Math.floor((s / 520) * (PATH.length - 1)));
    const [ax, az] = PATH[pi], [bx, bz] = PATH[pi + 1];
    const t = rnd();
    const side = rnd() < 0.5 ? -1 : 1;
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    const x = ax + dx * t + (-dz / L) * side * (9 + rnd() * 18), z = az + dz * t + (dx / L) * side * (9 + rnd() * 18);
    if (Math.abs(z - riverZ(x)) < 14 || insideHouse(x, z, 1)) continue;
    placeBanner(x, z, weiMat, rnd() * 6);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    placeBanner(PASS.x + Math.cos(a) * 15, PASS.z + Math.sin(a) * 12, weiMat, a);
  }
  // Liu banners at start (retreating column) and across the bridge
  for (const [x, z] of [[-6, -238], [7, -236], [-10, -222], [11, -226]]) placeBanner(x, z, liuMat, 1.0);
  for (const [x, z] of [[-6, 228], [6, 230], [-4, 238]]) placeBanner(x, z, rnd() < 0.5 ? liuMat : zhaoMat, -2.2);
  placeBanner(4, -232, zhaoMat, 0.4);

  // --- Battlefield litter: arrows stuck in ground, barricades, crates ---
  const arrowGeo = (() => {
    const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4); shaft.translate(0, 0.45, 0);
    const fl = new THREE.PlaneGeometry(0.06, 0.16); fl.translate(0, 0.82, 0);
    const fl2 = fl.clone().rotateY(Math.PI / 2);
    return mergeGeometries([shaft, fl, fl2].map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; }));
  })();
  const arrowT = [];
  for (let i = 0; i < 700; i++) {
    const s = rnd() * 500;
    const pi = Math.min(PATH.length - 2, Math.floor((s / 520) * (PATH.length - 1)));
    const [ax, az] = PATH[pi], [bx, bz] = PATH[pi + 1];
    const t = rnd();
    const x = ax + (bx - ax) * t + (rnd() - 0.5) * 70, z = az + (bz - az) * t + (rnd() - 0.5) * 70;
    if (Math.abs(z - riverZ(x)) < 12 || insideHouse(x, z, 0.3)) continue;
    e.set((rnd() - 0.5) * 0.9, rnd() * 6, (rnd() - 0.5) * 0.9); q.setFromEuler(e); sv.set(1, 1, 1); pv.set(x, heightAt(x, z) - 0.25, z);
    arrowT.push(m4.compose(pv, q, sv).clone());
  }
  placeInstanced(scene, arrowGeo, new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.8, side: THREE.DoubleSide }), arrowT, { cast: true });

  // cheval-de-frise barricades
  const spike = new THREE.CylinderGeometry(0.07, 0.07, 3.2, 5); spike.translate(0, 1.6, 0);
  const tip = new THREE.ConeGeometry(0.07, 0.3, 5); tip.translate(0, 3.35, 0);
  const spikeGeo = mergeGeometries([spike, tip]);
  const barT = [];
  const barricades = [[PASS.x - 10, PASS.z - 4, 0.8], [PASS.x + 12, PASS.z + 2, -0.6], [30, -150, 0.3], [-14, 120, 1.2], [14, 112, -0.5], [56, -110, 0.2]];
  for (const [bx, bz, br] of barricades) {
    for (let k = -3; k <= 3; k++) {
      for (const sgn of [-1, 1]) {
        e.set(sgn * 0.75, br, 0, 'YXZ'); q.setFromEuler(e); sv.set(1, 1, 1);
        const ox = Math.cos(br) * k * 0.7, oz = -Math.sin(br) * k * 0.7;
        pv.set(bx + ox, heightAt(bx + ox, bz + oz), bz + oz);
        barT.push(m4.compose(pv, q, sv).clone());
      }
    }
    colliders.push({ x: bx, z: bz, r: 2.2 });
  }
  placeInstanced(scene, spikeGeo, woodMat, barT);

  // crates & sacks around the village
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const crateT = [];
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, d = 10 + rnd() * 22;
    const x = VILLAGE.x + Math.cos(a) * d, z = VILLAGE.z + Math.sin(a) * d;
    if (insideHouse(x, z, 0.8) || Math.hypot(x - WELL.x, z - WELL.z) < 4) continue;
    const s = 0.6 + rnd() * 0.5;
    e.set(0, rnd() * 3, 0); q.setFromEuler(e); sv.set(s, s, s); pv.set(x, heightAt(x, z) + s / 2, z);
    crateT.push(m4.compose(pv, q, sv).clone());
  }
  placeInstanced(scene, crateGeo, woodMat, crateT);

  // Campfires/torches along route add warm accents
  for (const [x, z] of [[18, -176], [-14, 96], [10, 136], [-28, 70], [-6, 58], [36, -130]]) {
    fires.push({ x, y: heightAt(x, z) + 0.3, z, size: 0.9 });
    const logs = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 5), charMat);
    logs.rotation.z = Math.PI / 2; logs.position.set(x, heightAt(x, z) + 0.1, z); scene.add(logs);
    const logs2 = logs.clone(); logs2.rotation.y = 1.4; scene.add(logs2);
  }

  return {
    fires, smokes, colliders,
    update(time) {
      clothUniforms.uTime.value = time;
      waterU.uTime.value = time;
    },
  };

  function makeRockMats() {
    const S = 128; const n3 = makeNoise2D(77);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) h[i] = fbm(n3, (i % S) * 0.08, Math.floor(i / S) * 0.08, 5) * 0.5 + 0.5;
    const nm = normalFromHeight(h, S, 6);
    nm.repeat.set(2, 2);
    const m = new THREE.MeshStandardMaterial({ color: 0x8c8780, roughness: 0.92, normalMap: nm });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRN;').replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvRN = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRN;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(vec3(0.62,0.6,0.55), vec3(0.78,0.82,0.6), smoothstep(0.6, 0.95, vRN.y));');
    };
    return m;
  }
}
