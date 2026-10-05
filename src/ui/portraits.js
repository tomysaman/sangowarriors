import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWarrior } from '../actors/rig.js';
import { Animator } from '../actors/animator.js';
import { makePose } from '../actors/pose.js';

// Painted portraits from KOEI's Romance of the Three Kingdoms XI, named by character id
// (src/assets/portraits/<id>.png). Characters without one get a rendered portrait.
const ART = Object.fromEntries(Object.entries(import.meta.glob('../assets/portraits/*.png', { eager: true, import: 'default' }))
  .map(([path, url]) => [path.match(/([^/]+)\.png$/)[1], url]));

export function loadPortraits(defs) {
  const missing = defs.filter((d) => !ART[d.id]);
  return { ...(missing.length ? renderPortraits(missing) : {}), ...ART };
}

// Render head-and-shoulders portraits of characters into data URLs (one-off offscreen renderer).
export function renderPortraits(defs) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  r.setSize(size, size, false);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  const out = {};
  const pm = new THREE.PMREMGenerator(r);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  for (const def of defs) {
    const scene = new THREE.Scene();
    scene.environment = env; scene.environmentIntensity = 0.55;
    scene.background = new THREE.Color(def.bg ?? 0x1a120c);
    const key = new THREE.DirectionalLight(0xffd2a0, 3.2); key.position.set(-1.2, 1.6, 2); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 2.5); rim.position.set(1.5, 1.0, -1.5); scene.add(rim);
    // backdrop gradient disc
    const bg = new THREE.Mesh(new THREE.CircleGeometry(3, 32), new THREE.MeshBasicMaterial({ color: def.bgGlow ?? 0x5a3a20 }));
    bg.position.set(0, 1.5, -1.6); scene.add(bg);
    const rig = buildWarrior(def);
    scene.add(rig.root);
    const anim = new Animator(rig, def.weapon ? 'spear' : 'none');
    anim.setOverride(makePose({ hipsY: 0, hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0.1, 0], head: [0.05, -0.15, 0], grip: [-0.25, 1.0, 0.2], spear: [0, 1.4, 0], lfree: 1, lpos: [0.25, 1.0, 0.1], footL: [0.1, 0.08, 0], footR: [-0.1, 0.08, 0] }), 0.001);
    anim.update(0.1);
    if (rig.weapon) rig.weapon.group.visible = false;
    const head = new THREE.Vector3(); rig.B.head.getWorldPosition(head);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
    cam.position.set(head.x + 0.25, head.y + 0.03, head.z + 1.05);
    cam.lookAt(head.x + 0.02, head.y + 0.01, head.z);
    r.render(scene, cam);
    out[def.id] = canvas.toDataURL('image/jpeg', 0.9);
    scene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
  pm.dispose();
  r.dispose();
  r.forceContextLoss();
  return out;
}
