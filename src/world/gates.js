// Wei palisade gates that span the whole corridor. A closed gate blocks every actor;
// an open gate only lets actors through its doorway. Gates open when their captain falls
// (or, for the rear gate, when Zhang He falls), so the player can't outrun the chapter.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pointAt, pathInfo, heightAt, PASS } from './level.js';
import { makeWoodTexture, makeBarkTexture, makeBannerTexture } from './textures.js';
import { windCloth } from './props.js';
import { mulberry32 } from '../core/noise.js';

export const GATE_HALF = 60;   // wall half-length; reaches past the corridor edges (46 m)
export const DOOR_HALF = 3.2;  // half-width of the doorway
const BAND = 7;                // only actors this close to the wall line are tested

export const GATES = [];

// Gate layout, by distance along the path.
function gateDefs() {
  return [
    { id: 'camp', s: pathInfo(30, -128).s, phase: 'start', opener: 'captain' },
    { id: 'pass', s: pathInfo(18, 0).s, phase: 'escape', opener: 'captain' },
    { id: 'rear', s: pathInfo(PASS.x, PASS.z).s + 26, phase: 'zhanghe', opener: 'zhanghe' },
  ];
}

export function buildGates(scene) {
  const wood = makeWoodTexture(), bark = makeBarkTexture();
  const logMat = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normal, color: 0xb59a7a, roughness: 0.95 });
  const beamMat = new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normal, color: 0x8a6a4a, roughness: 0.85 });
  const doorMat = new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normal, color: 0x6a4630, roughness: 0.8 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, metalness: 0.8, roughness: 0.45 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.9 });
  const flagMat = windCloth(new THREE.MeshStandardMaterial({ map: makeBannerTexture('曹', '#1d2c5a', '#e8dcc0', '#0e1530'), side: THREE.DoubleSide, roughness: 0.85 }));

  const logGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.17, 0.2, 1, 7).translate(0, 0.5, 0),
    new THREE.ConeGeometry(0.17, 0.42, 7).translate(0, 1.21, 0),
  ]);
  const beamGeo = new THREE.BoxGeometry(1, 0.16, 0.14);
  const rnd = mulberry32(4242);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();

  for (const def of gateDefs()) {
    const p = pointAt(def.s);
    const tx = Math.sin(p.dir), tz = Math.cos(p.dir);     // along the path (towards the bridge)
    const lx = Math.cos(p.dir), lz = -Math.sin(p.dir);    // along the wall
    const gate = { ...def, x: p.x, z: p.z, tx, tz, lx, lz, open: false, openT: 0, captain: null, banner: null, doors: [] };
    const at = (lat, fwd = 0) => [p.x + lx * lat + tx * fwd, p.z + lz * lat + tz * fwd];
    const yaw = Math.atan2(lx, lz); // local +x along the wall

    // palisade logs
    const logs = [];
    for (let lat = -GATE_HALF; lat <= GATE_HALF; lat += 0.4) {
      if (Math.abs(lat) < DOOR_HALF + 1.5) continue;
      const [x, z] = at(lat, (rnd() - 0.5) * 0.12);
      const h = 3.0 + rnd() * 0.8;
      e.set((rnd() - 0.5) * 0.06, rnd() * 6, (rnd() - 0.5) * 0.06); q.setFromEuler(e);
      sc.set(1, h, 1); v.set(x, heightAt(x, z) - 0.35, z);
      logs.push(m4.compose(v, q, sc).clone());
    }
    const logMesh = new THREE.InstancedMesh(logGeo, logMat, logs.length);
    logs.forEach((m, i) => logMesh.setMatrixAt(i, m));
    logMesh.castShadow = true; logMesh.receiveShadow = true;
    scene.add(logMesh);

    // two rails on each face, segmented so they follow the ground
    const beams = [];
    for (const side of [-1, 1]) {
      for (let lat = -GATE_HALF; lat < GATE_HALF; lat += 3) {
        if (Math.abs(lat + 1.5) < DOOR_HALF + 2.5) continue;
        const [x0, z0] = at(lat, side * 0.22), [x1, z1] = at(lat + 3, side * 0.22);
        const y0 = heightAt(x0, z0), y1 = heightAt(x1, z1);
        for (const hh of [0.9, 2.3]) {
          v.set((x0 + x1) / 2, (y0 + y1) / 2 + hh, (z0 + z1) / 2);
          e.set(0, yaw - Math.PI / 2, Math.atan2(y1 - y0, 3), 'YXZ'); q.setFromEuler(e);
          sc.set(3.1, 1, 1);
          beams.push(m4.compose(v, q, sc).clone());
        }
      }
    }
    const beamMesh = new THREE.InstancedMesh(beamGeo, beamMat, beams.length);
    beams.forEach((m, i) => beamMesh.setMatrixAt(i, m));
    beamMesh.castShadow = true;
    scene.add(beamMesh);

    // gatehouse: two towers, a lintel and a pair of doors
    const house = new THREE.Group();
    const [cx, cz] = at(0);
    house.position.set(cx, heightAt(cx, cz), cz);
    house.rotation.y = yaw - Math.PI / 2;
    scene.add(house);
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; house.add(m); return m;
    };
    for (const sgn of [-1, 1]) {
      const ox = sgn * (DOOR_HALF + 1.2);
      for (const px of [-0.9, 0.9]) for (const pz of [-0.9, 0.9]) box(0.32, 6.4, 0.32, beamMat, ox + px, 2.6, pz);
      box(2.6, 0.2, 2.6, beamMat, ox, 4.6, 0);
      for (const pz of [-1.2, 1.2]) box(2.5, 0.7, 0.1, beamMat, ox, 5.05, pz);
      for (const px of [-1.2, 1.2]) box(0.1, 0.7, 2.5, beamMat, ox + px, 5.05, 0);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.3, 4), roofMat);
      roof.position.set(ox, 6.45, 0); roof.rotation.y = Math.PI / 4; roof.castShadow = true; house.add(roof);
      const pole = box(0.06, 3.4, 0.06, beamMat, ox + sgn * 0.9, 7.6, 0.9);
      pole.castShadow = true;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.0, 10, 5).translate(0.55, 0, 0), flagMat);
      flag.position.set(ox + sgn * 0.9, 8.1, 0.9); flag.rotation.y = sgn > 0 ? 0 : Math.PI; flag.castShadow = true;
      house.add(flag);
    }
    box(2 * DOOR_HALF + 3.4, 0.45, 0.5, beamMat, 0, 4.25, 0);
    // doors hinge at the inner tower posts and swing away from the approaching player
    for (const sgn of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(sgn * DOOR_HALF, 0, 0);
      house.add(hinge);
      const leaf = new THREE.Group();
      leaf.position.x = -sgn * DOOR_HALF / 2;
      hinge.add(leaf);
      for (let k = 0; k < 6; k++) {
        const w = DOOR_HALF / 6;
        const plank = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 3.7 + (k % 2) * 0.12, 0.16), doorMat);
        plank.position.set(-DOOR_HALF / 2 + w * (k + 0.5), 1.9, 0); plank.castShadow = true; leaf.add(plank);
      }
      for (const y of [0.8, 2.0, 3.2]) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(DOOR_HALF * 0.98, 0.18, 0.08), ironMat);
        brace.position.set(0, y, -0.12); leaf.add(brace);
      }
      gate.doors.push({ hinge, sgn });
    }
    GATES.push(gate);
  }
  return GATES;
}

export function gateById(id) { return GATES.find((g) => g.id === id); }

export function setGateOpen(gate, open, instant = false) {
  gate.open = open;
  if (instant) { gate.openT = open ? 1 : 0; poseDoors(gate); }
}

function poseDoors(gate) {
  const k = gate.openT, e = k * k * (3 - 2 * k);
  for (const d of gate.doors) d.hinge.rotation.y = d.sgn * e * 1.85;
}

export function updateGates(dt) {
  for (const g of GATES) {
    const target = g.open ? 1 : 0;
    if (g.openT !== target) {
      g.openT = target > g.openT ? Math.min(1, g.openT + dt / 1.4) : Math.max(0, g.openT - dt / 0.6);
      poseDoors(g);
    }
  }
}

// Signed distance past the wall (positive = bridge side) and position along it.
export function gateFrame(g, x, z) {
  const dx = x - g.x, dz = z - g.z;
  return { sd: dx * g.tx + dz * g.tz, lat: dx * g.lx + dz * g.lz };
}

// Keep an actor on the side of each wall it came from. `actor` stores the remembered side.
export function applyGates(actor, pos, r = 0.5) {
  const mem = actor._gateSide || (actor._gateSide = {});
  for (const g of GATES) {
    const { sd, lat } = gateFrame(g, pos.x, pos.z);
    const sign = sd >= 0 ? 1 : -1;
    if (Math.abs(lat) > GATE_HALF + r || Math.abs(sd) > BAND) { mem[g.id] = sign; continue; }
    if (g.open && Math.abs(lat) < DOOR_HALF - r) { mem[g.id] = sign; continue; }
    const side = mem[g.id] ?? sign;
    const minD = r + 0.3;
    if (sd * side < minD) {
      const push = side * minD - sd;
      pos.x += g.tx * push; pos.z += g.tz * push;
    }
    mem[g.id] = side;
  }
}

// Waypoint toward the doorway if a straight line to the target crosses a wall.
export function gateWaypoint(x, z, tx, tz) {
  for (const g of GATES) {
    const a = gateFrame(g, x, z), b = gateFrame(g, tx, tz);
    if ((a.sd >= 0) === (b.sd >= 0) || Math.abs(a.sd) > 40) continue;
    const k = a.sd / (a.sd - b.sd);
    const latX = a.lat + (b.lat - a.lat) * k;
    if (Math.abs(latX) > GATE_HALF) continue;
    if (!g.open) continue;                                   // nothing to route through
    if (Math.abs(latX) < DOOR_HALF - 0.7 && Math.abs(a.lat) < DOOR_HALF + 2) continue;
    const side = a.sd >= 0 ? 1 : -1;
    if (Math.abs(a.lat) < DOOR_HALF - 0.6) return { x: g.x - g.tx * side * 2, z: g.z - g.tz * side * 2 };
    return { x: g.x + g.tx * side * 1.6, z: g.z + g.tz * side * 1.6 };
  }
  return null;
}

// First closed gate ahead of a path distance (used to keep spawns on the near side).
export function nextClosedGate(s) {
  let best = null;
  for (const g of GATES) if (!g.open && g.s > s - 4 && (!best || g.s < best.s)) best = g;
  return best;
}
