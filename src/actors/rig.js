import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solveTwoBone, aimBone } from './ik.js';
import { makeArmorTextures, makeBrocadeTexture } from '../world/textures.js';
import { POSE_SIZE } from './pose.js';

let armorTex = null;

// ------------------------------------------------------------------ materials
export function makeMaterials(pal) {
  armorTex ??= makeArmorTextures();
  const metal = (color, rough = 0.3) => new THREE.MeshPhysicalMaterial({
    color, metalness: 1, roughness: rough, roughnessMap: armorTex.rough, normalMap: armorTex.normal,
    normalScale: new THREE.Vector2(0.4, 0.4), clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 1.3,
  });
  const silk = (color, motif) => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: makeBrocadeTexture(color, motif), roughness: 0.62, sheen: 1, sheenRoughness: 0.35,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5), side: THREE.DoubleSide,
  });
  const armor = metal(pal.armor, pal.armorRough ?? 0.28);
  const armorDS = armor.clone(); armorDS.side = THREE.DoubleSide;
  return {
    armor, armorDS,
    armorDark: metal(pal.armorDark ?? 0x3a3f46, 0.45),
    trim: metal(pal.trim, 0.22),
    cloth: silk(pal.cloth, pal.motif),
    cloth2: silk(pal.cloth2, pal.motif2 ?? pal.motif),
    pants: new THREE.MeshStandardMaterial({ color: pal.pants, roughness: 0.8 }),
    leather: new THREE.MeshStandardMaterial({ color: pal.leather ?? 0x2a1d14, roughness: 0.55, metalness: 0.1 }),
    skin: new THREE.MeshPhysicalMaterial({ color: pal.skin ?? 0xe0b896, roughness: 0.6, sheen: 0.25, sheenColor: new THREE.Color(0xff9a7a), sheenRoughness: 0.6 }),
    hair: new THREE.MeshPhysicalMaterial({ color: pal.hair ?? 0x14100e, roughness: 0.45, sheen: 1, sheenColor: new THREE.Color(0x6a5a50), sheenRoughness: 0.3 }),
    plume: new THREE.MeshStandardMaterial({ color: pal.plume ?? 0xb3121a, roughness: 0.9 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.2 }),
    cape: new THREE.MeshPhysicalMaterial({ color: pal.cape ?? 0xf4f1ea, roughness: 0.8, sheen: 0.35, sheenColor: new THREE.Color(0xd8d4cc), sheenRoughness: 0.6, side: THREE.DoubleSide }),
    // optional per-character pieces; each falls back to the shared material it used to be
    helmet: pal.helmet != null ? metal(pal.helmet, pal.helmetRough ?? 0.3) : armor,
    helmetTrim: pal.helmetTrim != null ? metal(pal.helmetTrim, 0.22) : null,
    tassel: pal.tassel != null ? new THREE.MeshStandardMaterial({ color: pal.tassel, roughness: 0.9 }) : null,
    scarf: pal.scarf ? silk(pal.scarf, pal.scarfMotif ?? pal.scarf) : null,
    knot: pal.knot != null ? new THREE.MeshStandardMaterial({ color: pal.knot, roughness: 0.7 }) : null,
    headband: pal.headband ? silk(pal.headband, pal.headbandMotif ?? pal.headband) : null,
    gem: new THREE.MeshPhysicalMaterial({ color: pal.gem ?? 0x2a9ad0, roughness: 0.05, clearcoat: 1 }),
    lips: pal.lips != null ? new THREE.MeshStandardMaterial({ color: pal.lips, roughness: 0.45 }) : null,
    teeth: new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.35 }),
    flower: new THREE.MeshStandardMaterial({ color: pal.flower ?? 0xf08aa8, roughness: 0.6 }),
  };
}

function lathe(profile, seg = 20, zScale = 1) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.scale(1, 1, zScale);
  return g;
}

function add(parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos); m.rotation.set(...rot); m.scale.set(...scale);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Lamellar armor: rows of small plates on an elliptic cylinder band, as one InstancedMesh.
function lamellar(parent, mat, { rows, cols, y0, dy, r0, r1, zScale = 0.75, arc = Math.PI * 2, start = 0, pw = 0.048, ph = 0.07, tilt = 0.18 }) {
  const plate = new THREE.BoxGeometry(pw, ph, 0.012, 1, 1, 1);
  // round the plate bottom a bit
  const p = plate.attributes.position;
  for (let i = 0; i < p.count; i++) { if (p.getY(i) < 0) p.setX(i, p.getX(i) * 0.82); }
  plate.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(plate, mat, rows * cols);
  const d = new THREE.Object3D();
  let k = 0;
  for (let r = 0; r < rows; r++) {
    const t = rows > 1 ? r / (rows - 1) : 0;
    const rad = r0 + (r1 - r0) * t;
    for (let c = 0; c < cols; c++) {
      const a = start + (c + (r % 2) * 0.5) / cols * arc;
      d.position.set(Math.sin(a) * rad, y0 - r * dy, Math.cos(a) * rad * zScale);
      d.rotation.set(tilt, a, 0, 'YXZ');
      d.updateMatrix();
      mesh.setMatrixAt(k++, d.matrix);
    }
  }
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// ------------------------------------------------------------------ weapons
export function buildWeapon(type, mats) {
  const g = new THREE.Group();
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xe8edf2, metalness: 1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.8 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x66c8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const info = { tip: 2.05, butt: -0.6, glow: null, tassel: [], length: 2.65, bladeStart: 1.6 };
  const bladeShape = (len, wid, waves = 0) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    const N = 24;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const w = wid * Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - t * 0.2) + (waves ? Math.sin(t * Math.PI * waves) * wid * 0.35 * (1 - t) : 0);
      s.lineTo(w, t * len);
    }
    for (let i = N - 1; i >= 1; i--) {
      const t = i / N;
      const w = wid * Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - t * 0.2) + (waves ? Math.sin(t * Math.PI * waves + 0.5) * wid * 0.35 * (1 - t) : 0);
      s.lineTo(-w, t * len);
    }
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 4 });
    geo.translate(0, 0, -0.003);
    geo.rotateX(Math.PI / 2); // shape +Y -> +Z (blade points along spear axis, flat in XZ)
    return geo;
  };

  if (type === 'spear' || type === 'serpent' || type === 'glaive') {
    const L = type === 'serpent' ? 3.0 : 2.6;
    const butt = -0.6;
    info.butt = butt;
    const shaftLen = L - 0.45;
    const shaft = new THREE.CylinderGeometry(0.019, 0.023, shaftLen, 10);
    shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, butt + shaftLen / 2);
    const shaftMat = new THREE.MeshPhysicalMaterial({ color: type === 'spear' ? 0xd9d6cf : 0x2a1a12, metalness: type === 'spear' ? 0.85 : 0.1, roughness: 0.3, clearcoat: 0.5 });
    add(g, shaft, shaftMat);
    // helical dragon wrap (gold) near grips
    const helix = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const a = t * Math.PI * 14;
      helix.push(new THREE.Vector3(Math.cos(a) * 0.026, Math.sin(a) * 0.026, -0.25 + t * 0.9));
    }
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 240, 0.006, 5), mats.trim);
    for (const z of [-0.55, -0.3, 0.68, 1.35]) add(g, new THREE.TorusGeometry(0.026, 0.008, 6, 14), mats.trim, [0, 0, z]);
    const headZ = butt + shaftLen;
    // collar: dragon mouth
    const collar = lathe([[0.02, 0], [0.045, 0.03], [0.05, 0.08], [0.032, 0.14], [0.018, 0.18]], 14);
    collar.rotateX(Math.PI / 2); collar.translate(0, 0, headZ - 0.12);
    add(g, collar, mats.trim);
    // blade
    let blade;
    if (type === 'glaive') {
      const s = new THREE.Shape();
      s.moveTo(-0.02, 0); s.lineTo(0.05, 0); s.quadraticCurveTo(0.13, 0.35, 0.02, 0.62); s.quadraticCurveTo(0.0, 0.4, -0.03, 0.15); s.lineTo(-0.02, 0);
      blade = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
      blade.rotateX(Math.PI / 2);
      blade.rotateZ(Math.PI / 2);
    } else {
      blade = bladeShape(type === 'serpent' ? 0.6 : 0.46, type === 'serpent' ? 0.05 : 0.055, type === 'serpent' ? 5 : 0);
    }
    const glowGeo = blade.clone().scale(1.9, 3.5, 1.12);
    blade.translate(0, 0, headZ + 0.04);
    glowGeo.translate(0, 0, headZ + 0.02);
    add(g, blade, steel);
    info.tip = headZ + (type === 'serpent' ? 0.64 : type === 'glaive' ? 0.6 : 0.5);
    info.bladeStart = headZ;
    // glow shell for musou
    const glow = new THREE.Mesh(glowGeo, glowMat);
    g.add(glow); info.glow = glow;
    // red tassel (hongying): strands hanging from collar
    const tassel = new THREE.Group();
    tassel.position.set(0, 0, headZ - 0.08);
    const strand = new THREE.ConeGeometry(0.01, 0.22, 4); strand.translate(0, -0.11, 0);
    for (let i = 0; i < 16; i++) {
      const s = add(tassel, strand, mats.tassel ?? mats.plume, [Math.cos(i) * 0.02, 0, Math.sin(i * 1.7) * 0.02], [0, 0, (Math.random() - 0.5) * 0.4], [1, 0.8 + Math.random() * 0.5, 1], false);
      s.userData.base = s.rotation.z;
    }
    g.add(tassel); info.tassel.push(tassel);
    // butt spike
    const bs = new THREE.ConeGeometry(0.022, 0.12, 8); bs.rotateX(-Math.PI / 2); bs.translate(0, 0, butt - 0.06);
    add(g, bs, mats.trim);
    info.length = info.tip - butt;
  } else if (type === 'sword') {
    // Qinggang jian: straight double-edged blade
    const blade = bladeShape(0.95, 0.03);
    const p = blade.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z > 0.1 && z < 0.85) p.setX(i, Math.sign(p.getX(i)) * Math.min(Math.abs(p.getX(i)), 0.032)); }
    const swGlow = blade.clone().scale(2.5, 3, 1.03);
    blade.translate(0, 0, 0.12); swGlow.translate(0, 0, 0.11);
    add(g, blade, steel);
    const guard = new THREE.BoxGeometry(0.16, 0.03, 0.04); guard.translate(0, 0, 0.1); add(g, guard, mats.trim);
    const grip = new THREE.CylinderGeometry(0.016, 0.018, 0.2, 8); grip.rotateX(Math.PI / 2); grip.translate(0, 0, 0.0); add(g, grip, mats.leather);
    const pommel = new THREE.SphereGeometry(0.025, 10, 8); pommel.translate(0, 0, -0.11); add(g, pommel, mats.trim);
    const glow = new THREE.Mesh(swGlow, glowMat); g.add(glow); info.glow = glow;
    info.tip = 1.07; info.butt = -0.1; info.bladeStart = 0.12; info.length = 1.17;
  }
  return { group: g, info };
}

// ------------------------------------------------------------------ character
export function buildWarrior(def) {
  const pal = def.palette;
  const mats = makeMaterials(pal);
  const S = def.scale ?? 1;
  const bulk = def.bulk ?? 1;
  const root = new THREE.Group();
  const body = new THREE.Group(); // scaled
  body.scale.setScalar(S);
  root.add(body);

  const B = {};
  const bone = (name, parent, pos) => { const b = new THREE.Group(); b.name = name; b.position.set(...pos); parent.add(b); B[name] = b; return b; };

  bone('hips', body, [0, 1.0, 0]);
  bone('spine', B.hips, [0, 0.1, 0]);
  bone('chest', B.spine, [0, 0.22, 0]);
  bone('neck', B.chest, [0, 0.30, 0]);
  bone('head', B.neck, [0, 0.1, 0]);
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    bone('shoulder' + side, B.chest, [sx * 0.2 * bulk, 0.245, -0.01]);
    bone('upperArm' + side, B['shoulder' + side], [0, 0, 0]);
    bone('foreArm' + side, B['upperArm' + side], [0, -0.3, 0]);
    bone('hand' + side, B['foreArm' + side], [0, -0.27, 0]);
    bone('thigh' + side, B.hips, [sx * 0.1, -0.04, 0]);
    bone('shin' + side, B['thigh' + side], [0, -0.46, 0]);
    bone('foot' + side, B['shin' + side], [0, -0.46, 0]);
  }

  const robe = def.style === 'robe';
  const armored = !robe;
  // --- torso
  add(B.hips, lathe([[0.001, -0.14], [0.15, -0.12], [0.17 * bulk, -0.02], [0.155 * bulk, 0.1], [0.001, 0.12]], 18, 0.75), mats.pants);
  add(B.spine, lathe([[0.15 * bulk, 0], [0.152 * bulk, 0.12], [0.165 * bulk, 0.23]], 18, 0.74), mats.cloth);
  add(B.chest, lathe([[0.165 * bulk, -0.01], [0.2 * bulk, 0.12], [0.205 * bulk, 0.2], [0.175 * bulk, 0.27], [0.1, 0.305], [0.05, 0.32]], 20, 0.72), mats.cloth);
  if (armored) {
    // lamellar cuirass
    lamellar(B.chest, mats.armor, { rows: 3, cols: 26, y0: 0.255, dy: 0.055, r0: 0.188 * bulk, r1: 0.214 * bulk, zScale: 0.76, pw: 0.05, ph: 0.065, tilt: -0.05 });
    lamellar(B.chest, mats.armor, { rows: 3, cols: 26, y0: 0.1, dy: 0.055, r0: 0.214 * bulk, r1: 0.19 * bulk, zScale: 0.76, pw: 0.05, ph: 0.065, tilt: 0.12 });
    lamellar(B.spine, mats.armor, { rows: 3, cols: 24, y0: 0.2, dy: 0.06, r0: 0.175 * bulk, r1: 0.168 * bulk, zScale: 0.78, pw: 0.045, ph: 0.065, tilt: 0.05 });
    // mirror plates (hu xin jing)
    for (const zs of [1, -1]) {
      const disc = add(B.chest, new THREE.CylinderGeometry(0.075, 0.075, 0.015, 28), mats.armor, [0, 0.13, zs * 0.163 * bulk], [Math.PI / 2 - zs * 0.12, 0, 0]);
      add(disc, new THREE.TorusGeometry(0.076, 0.009, 8, 28), mats.trim, [0, 0, 0], [Math.PI / 2, 0, 0]);
      add(disc, new THREE.SphereGeometry(0.02, 10, 8), mats.trim, [0, zs * 0.008, 0], [0, 0, 0], [1, 0.4, 1]);
    }
    // belt + beast-face buckle
    add(B.spine, new THREE.TorusGeometry(0.162 * bulk, 0.028, 8, 28), mats.leather, [0, 0.0, 0], [Math.PI / 2, 0, 0], [1, 0.76, 1]);
    const buckle = add(B.spine, new THREE.CylinderGeometry(0.055, 0.055, 0.02, 6), mats.trim, [0, 0.0, 0.125 * bulk], [Math.PI / 2, 0, 0]);
    add(buckle, new THREE.SphereGeometry(0.018, 8, 6), mats.armor, [0, 0.012, 0]);
    // collar
    add(B.chest, new THREE.TorusGeometry(0.08, 0.025, 8, 20), mats.cloth2, [0, 0.29, 0], [Math.PI / 2, 0, 0], [1, 0.85, 1]);
    if (mats.scarf) {
      // silk scarf: a cowl over the shoulders, a roll around the neck and a knot with two tails in front
      add(B.chest, lathe([[0.075, 0.36], [0.11, 0.32], [0.17 * bulk, 0.27], [0.215 * bulk, 0.2], [0.225 * bulk, 0.16]], 22, 0.78), mats.scarf);
      add(B.chest, new THREE.TorusGeometry(0.088, 0.034, 8, 22), mats.scarf, [0, 0.31, 0], [Math.PI / 2, 0, 0], [1, 0.9, 1]);
      add(B.chest, new THREE.SphereGeometry(0.034, 10, 8), mats.knot ?? mats.scarf, [0, 0.25, 0.165 * bulk], [0, 0, 0], [1.2, 0.9, 0.8]);
      for (const sx of [1, -1]) add(B.chest, new THREE.BoxGeometry(0.05, 0.17, 0.014), mats.knot ?? mats.scarf, [sx * 0.025, 0.16, 0.172 * bulk], [-0.12, 0, sx * 0.18]);
    }
  } else {
    // robe: layered silk with sash
    add(B.spine, new THREE.TorusGeometry(0.16, 0.035, 8, 24), mats.cloth2, [0, 0.03, 0], [Math.PI / 2, 0, 0], [1, 0.75, 1]);
    add(B.chest, new THREE.TorusGeometry(0.075, 0.03, 8, 20), mats.cloth2, [0, 0.29, 0], [Math.PI / 2, 0, 0]);
  }

  // --- neck & head
  add(B.neck, new THREE.CylinderGeometry(0.048, 0.056, 0.13, 12), mats.skin, [0, 0.03, 0]);
  const face = add(B.head, new THREE.SphereGeometry(0.1, 24, 18), mats.skin, [0, 0.05, 0.005], [0, 0, 0], [0.9, 1.12, 1.0]);
  add(B.head, new THREE.SphereGeometry(0.06, 16, 12), mats.skin, [0, -0.015, 0.035], [0, 0, 0], [1.05, 0.9, 1.0]); // jaw
  add(B.head, new THREE.ConeGeometry(0.013, 0.045, 6), mats.skin, [0, 0.04, 0.102], [-0.35, 0, 0], [1, 1, 0.8]); // nose
  const look = def.face ?? {};
  if (look.grin) {
    // wide open grin with teeth
    add(B.head, new THREE.BoxGeometry(0.046, 0.016, 0.01), mats.eye, [0, 0.0, 0.092]);
    add(B.head, new THREE.BoxGeometry(0.04, 0.008, 0.011), mats.teeth, [0, 0.004, 0.094]);
  } else {
    add(B.head, new THREE.BoxGeometry(0.024, 0.004, 0.008), mats.lips ?? mats.eye, [0, 0.002, 0.093], [0, 0, 0], mats.lips ? [1, 1.8, 1] : [1, 1, 1]); // mouth
  }
  // brows: 'thick' (heavy, scowling) or 'fine' (thin, gently arched)
  const brow = look.brows === 'thick' ? { s: [1.25, 2.0, 1.2], tilt: -0.38 } : look.brows === 'fine' ? { s: [0.95, 0.55, 1], tilt: 0.08 } : { s: [1, 1, 1], tilt: -0.22 };
  for (const sx of [1, -1]) {
    add(B.head, new THREE.SphereGeometry(0.011, 10, 8), mats.eye, [sx * 0.033, 0.062, 0.091], [0, 0, 0], [1.7, 0.9, 0.6]);
    add(B.head, new THREE.BoxGeometry(0.036, 0.009, 0.012), mats.hair, [sx * 0.035, 0.087, 0.094], [0, 0, sx * brow.tilt], brow.s);
    add(B.head, new THREE.SphereGeometry(0.018, 8, 8), mats.skin, [sx * 0.09, 0.05, 0.0], [0, 0, 0], [0.5, 1, 0.8]); // ears
  }
  // hair mass
  add(B.head, new THREE.SphereGeometry(0.108, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), mats.hair, [0, 0.07, -0.018], [0.55, 0, 0], [0.98, 1.05, 1.06]);
  if (def.beard) {
    // a grinning face keeps the beard below the mouth
    if (look.grin) add(B.head, new THREE.SphereGeometry(0.075, 14, 10), mats.hair, [0, -0.072, 0.03], [0.3, 0, 0], [1.25, 0.85, 0.95]);
    else add(B.head, new THREE.SphereGeometry(0.075, 14, 10), mats.hair, [0, -0.02, 0.04], [0.3, 0, 0], [1.25, 1.1, 1.0]);
    add(B.head, new THREE.ConeGeometry(0.06, 0.16, 10), mats.hair, [0, look.grin ? -0.13 : -0.1, 0.06], [Math.PI + 0.25, 0, 0]);
    if (look.grin) for (const sx of [1, -1]) add(B.head, new THREE.CapsuleGeometry(0.009, 0.04, 4, 6), mats.hair, [sx * 0.026, 0.016, 0.097], [0, 0, sx * 1.2]);
  }
  // ponytail / long hair tail
  const tail = new THREE.CatmullRomCurve3([[0, 0.1, -0.09], [0, 0.03, -0.14], [0, -0.12, -0.16], [0, -0.32, -0.14]].map((p) => new THREE.Vector3(...p)));
  const tailGeo = new THREE.TubeGeometry(tail, 16, 0.032, 8);
  { const p = tailGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const s = THREE.MathUtils.mapLinear(y, 0.1, -0.32, 1, 0.3); p.setX(i, p.getX(i) * s); } }
  if (def.hairTail !== false) add(B.head, tailGeo, mats.hair);
  if (def.bun) add(B.head, new THREE.SphereGeometry(0.06, 14, 10), mats.hair, [0, 0.16, -0.05]);
  if (def.flowers) for (const [x, y, z, r] of [[0.06, 0.15, -0.02, 0.018], [0.075, 0.12, 0.0, 0.014], [0.05, 0.18, -0.06, 0.013]]) add(B.head, new THREE.SphereGeometry(r, 8, 6), mats.flower, [x, y, z]);

  // helmet
  if (def.helmet) {
    const hg = new THREE.Group(); hg.position.set(0, 0.128, -0.01); hg.scale.setScalar(1.08); B.head.add(hg);
    const hTrim = mats.helmetTrim ?? mats.trim;
    add(hg, new THREE.SphereGeometry(0.122, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), mats.helmet, [0, 0, 0], [0, 0, 0], [1, 1.05, 1.08]);
    add(hg, new THREE.TorusGeometry(0.122, 0.012, 8, 30), hTrim, [0, 0.0, 0], [Math.PI / 2, 0, 0], [1, 1.08, 1]);
    // ridges
    if (def.ridges !== false) for (let i = 0; i < 8; i++) add(hg, new THREE.TorusGeometry(0.124, 0.004, 4, 20, Math.PI / 2), hTrim, [0, 0, 0], [0, (i / 8) * Math.PI * 2, Math.PI / 2], [1, 1.05, 1]);
    // brim/visor
    add(hg, new THREE.CylinderGeometry(0.14, 0.15, 0.012, 28, 1, true, -Math.PI * 0.45, Math.PI * 0.9), hTrim, [0, -0.005, 0.0], [0.15, 0, 0]);
    if (def.crest === 'gem') {
      // plain steel cap with a jewelled badge on the brow
      add(hg, new THREE.CylinderGeometry(0.026, 0.026, 0.01, 6), hTrim, [0, 0.045, 0.126], [Math.PI / 2 - 0.35, 0, 0]);
      add(hg, new THREE.SphereGeometry(0.017, 12, 8), mats.gem, [0, 0.046, 0.131], [0, 0, 0], [1, 1.2, 0.6]);
    } else if (def.crest === 'wings') {
      // gilded face frame: a raised brow plate and flared wings over the temples
      add(hg, new THREE.CylinderGeometry(0.135, 0.138, 0.05, 28, 1, true, -Math.PI * 0.42, Math.PI * 0.84), hTrim, [0, 0.012, 0.004], [0.12, 0, 0]);
      const ws = new THREE.Shape();
      ws.moveTo(0, 0); ws.bezierCurveTo(0.03, 0.05, 0.07, 0.09, 0.1, 0.15); ws.bezierCurveTo(0.06, 0.12, 0.02, 0.1, -0.01, 0.1); ws.lineTo(0, 0);
      const wing = new THREE.ExtrudeGeometry(ws, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1 });
      for (const sx of [1, -1]) add(hg, wing, hTrim, [sx * 0.118, -0.08, 0.05], [0, sx * 1.25, sx * -0.35], [sx, 1, 1]);
    } else {
      // golden crest: flame-shaped front ornament
      const cs = new THREE.Shape();
      cs.moveTo(0, 0); cs.bezierCurveTo(0.09, 0.05, 0.1, 0.14, 0.03, 0.22); cs.bezierCurveTo(0.05, 0.13, 0.02, 0.08, 0, 0.07);
      cs.bezierCurveTo(-0.02, 0.08, -0.05, 0.13, -0.03, 0.22); cs.bezierCurveTo(-0.1, 0.14, -0.09, 0.05, 0, 0);
      const crest = new THREE.ExtrudeGeometry(cs, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
      add(hg, crest, hTrim, [0, 0.07, 0.11], [-0.4, 0, 0], [0.7 * (def.crestScale ?? 1), 0.7 * (def.crestScale ?? 1), 1]);
    }
    // top spike + plume tassel (hongying), or a long flowing mane
    const mane = def.plume === 'mane';
    add(hg, new THREE.CylinderGeometry(0.008, 0.02, 0.1, 8), hTrim, [0, 0.14, -0.01]);
    const plume = new THREE.Group(); plume.position.set(0, mane ? 0.16 : 0.19, mane ? -0.03 : -0.01); hg.add(plume); B.plume = plume;
    const strands = [];
    const nStrands = mane ? 40 : 18;
    for (let i = 0; i < nStrands; i++) {
      const a = (i / 18) * Math.PI * 2, sp = 0.04 + (i % 3) * 0.015;
      const L = mane ? 0.42 + ((i * 7) % 6) * 0.05 : 0.38 + ((i * 7) % 5) * 0.04;
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        if (mane) {
          // fans out to both sides of the helmet, then falls past the cheeks and down the back
          // side strands run longest; the ones down the back are shorter and wavy so they don't hide the cape
          const f = -1 + (2 * i) / (nStrands - 1), Lf = L * (0.55 + 0.45 * Math.abs(f));
          const wave = Math.sin(t * Math.PI * 2 + i) * 0.025 * t;
          pts.push(new THREE.Vector3(f * (0.05 + 0.15 * Math.min(1, t * 3)) + wave, 0.04 * Math.sin(t * Math.PI) - t * Lf * 0.9, -0.03 - t * Lf * (0.6 - Math.abs(f) * 0.3)));
        } else {
          pts.push(new THREE.Vector3(Math.cos(a) * sp * t * 1.5, 0.05 * Math.sin(t * Math.PI) - t * t * L * 0.75, -t * L * 0.85 + Math.sin(a) * sp * t));
        }
      }
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, mane ? 0.02 : 0.012, 5);
      const tp = tg.attributes.position;
      // taper toward the tip
      for (let j = 0; j < tp.count; j++) {
        const k = Math.floor(j / 6) / 10, c = pts[0].clone().lerp(pts[6], k);
        const cx = new THREE.CatmullRomCurve3(pts).getPoint(k);
        const f = 1 - k * 0.8;
        tp.setXYZ(j, cx.x + (tp.getX(j) - cx.x) * f, cx.y + (tp.getY(j) - cx.y) * f, cx.z + (tp.getZ(j) - cx.z) * f);
      }
      strands.push(tg);
    }
    const plumeGeo = mergeGeometries(strands);
    plumeGeo.computeVertexNormals();
    add(plume, plumeGeo, mats.plume, [0, 0, 0], [0, 0, 0], [1, 1, 1], false);
    add(plume, new THREE.SphereGeometry(0.03, 10, 8), mats.trim);
    // neck guard (lamellar flap) & cheek guards
    lamellar(hg, mats.armor, { rows: 2, cols: 12, y0: -0.03, dy: 0.05, r0: 0.125, r1: 0.135, zScale: 1.05, arc: Math.PI * 0.95, start: Math.PI * 0.525, pw: 0.04, ph: 0.06, tilt: 0.3 });
    for (const sx of [1, -1]) add(hg, new THREE.CylinderGeometry(0.128, 0.13, 0.11, 10, 1, true, sx > 0 ? 0.9 : Math.PI * 2 - 0.9 - 0.7, 0.7), mats.armor, [0, -0.07, 0.01]);
  } else if (def.headband === 'bandana') {
    // cloth wrapped over the crown, a jewelled band at the brow and two tails knotted at the back
    const bm = mats.headband ?? mats.cloth2;
    add(B.head, new THREE.SphereGeometry(0.112, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), bm, [0, 0.085, -0.012], [0.22, 0, 0], [0.98, 0.95, 1.06]);
    add(B.head, new THREE.TorusGeometry(0.104, 0.016, 6, 26), bm, [0, 0.1, -0.005], [Math.PI / 2 + 0.2, 0, 0]);
    add(B.head, new THREE.TorusGeometry(0.106, 0.006, 5, 26, Math.PI * 0.5), mats.trim, [0, 0.105, 0.0], [Math.PI / 2 + 0.2, 0, Math.PI * 0.25]);
    add(B.head, new THREE.SphereGeometry(0.016, 8, 6), mats.trim, [0, 0.122, 0.1], [0, 0, 0], [1.4, 1, 0.6]);
    add(B.head, new THREE.SphereGeometry(0.025, 8, 6), bm, [0, 0.08, -0.115]);
    for (const sx of [1, -1]) add(B.head, new THREE.BoxGeometry(0.035, 0.16, 0.012), bm, [sx * 0.03, 0.0, -0.12], [0.25, 0, sx * 0.3]);
  } else if (def.headband) {
    add(B.head, new THREE.TorusGeometry(0.103, 0.014, 6, 26), mats.cloth2, [0, 0.1, -0.005], [Math.PI / 2 + 0.2, 0, 0]);
  }
  if (def.hairpin) add(B.head, new THREE.CylinderGeometry(0.004, 0.004, 0.22, 5), mats.trim, [0, 0.17, -0.05], [0, 0, Math.PI / 2]);

  // --- arms
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const ua = B['upperArm' + side], fa = B['foreArm' + side], hd = B['hand' + side];
    add(ua, new THREE.CapsuleGeometry(0.058 * bulk, 0.2, 6, 12), def.bareArms ? mats.skin : mats.cloth2, [0, -0.14, 0]);
    add(fa, new THREE.CapsuleGeometry(0.048 * bulk, 0.18, 6, 12), def.bareArms ? mats.skin : mats.cloth, [0, -0.12, 0]);
    if (armored) {
      // pauldron: three layered shells
      for (let k = 0; k < 3; k++) {
        const sh = add(B['shoulder' + side], new THREE.SphereGeometry(0.105 * bulk + k * 0.012, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), mats.armorDS,
          [sx * 0.035, 0.03 - k * 0.05, 0], [0, 0, sx * -0.45], [1, 0.8, 0.95]);
        add(sh, new THREE.TorusGeometry(Math.sin(Math.PI * 0.42) * (0.105 * bulk + k * 0.012), 0.006, 5, 24), mats.trim, [0, Math.cos(Math.PI * 0.42) * (0.105 * bulk + k * 0.012), 0], [Math.PI / 2, 0, 0]);
      }
      add(B['shoulder' + side], new THREE.SphereGeometry(0.028, 10, 8), mats.trim, [sx * 0.1, 0.08, 0]); // lion stud
      // bracer
      add(fa, lathe([[0.056, 0], [0.06, 0.1], [0.052, 0.19], [0.05, 0.2]], 14), mats.armor, [0, -0.25, 0]);
      add(fa, new THREE.TorusGeometry(0.058, 0.008, 6, 16), mats.trim, [0, -0.06, 0], [Math.PI / 2, 0, 0]);
      add(fa, new THREE.TorusGeometry(0.052, 0.008, 6, 16), mats.trim, [0, -0.245, 0], [Math.PI / 2, 0, 0]);
    } else {
      // wide flowing sleeves
      add(fa, lathe([[0.05, 0.05], [0.08, -0.05], [0.12, -0.24], [0.125, -0.26]], 16), mats.cloth, [0, 0, 0]);
    }
    add(hd, new THREE.BoxGeometry(0.075, 0.09, 0.085), robe ? mats.skin : mats.leather, [0, -0.02, 0.0]);
    add(hd, new THREE.CapsuleGeometry(0.018, 0.04, 4, 6), robe ? mats.skin : mats.leather, [sx * -0.04, -0.035, 0.03], [0.6, 0, 0]);
  }

  // --- legs
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const th = B['thigh' + side], sh = B['shin' + side], ft = B['foot' + side];
    add(th, new THREE.CapsuleGeometry(0.072 * bulk, 0.3, 6, 12), mats.pants, [0, -0.22, 0]);
    add(sh, new THREE.CapsuleGeometry(0.058 * bulk, 0.3, 6, 12), mats.pants, [0, -0.2, 0]);
    if (armored) {
      add(sh, lathe([[0.056, 0], [0.064, 0.14], [0.06, 0.28], [0.052, 0.32]], 16, 1), mats.armorDark, [0, -0.4, 0.008], [0, 0, 0], [1 * bulk, 1, 1.08]);
      add(sh, new THREE.TorusGeometry(0.058, 0.006, 6, 18), mats.trim, [0, -0.36, 0.008], [Math.PI / 2, 0, 0]);
      const knee = add(sh, new THREE.SphereGeometry(0.065, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.trim, [0, -0.02, 0.035], [Math.PI / 2 - 0.3, 0, 0], [1, 0.6, 1]);
      knee.scale.multiplyScalar(bulk);
      // thigh tassets (lamellar panels that follow the leg)
      const tg = new THREE.Group(); tg.position.set(sx * 0.02, -0.02, 0); th.add(tg);
      lamellar(tg, mats.armor, { rows: 4, cols: 7, y0: -0.02, dy: 0.06, r0: 0.105 * bulk, r1: 0.115 * bulk, zScale: 0.9, arc: Math.PI * 0.75, start: sx > 0 ? Math.PI * 0.12 : Math.PI * 1.13, pw: 0.052, ph: 0.07, tilt: 0.12 });
    }
    add(ft, new THREE.BoxGeometry(0.1, 0.09, 0.25), mats.leather, [0, -0.04, 0.05]);
    add(ft, new THREE.CapsuleGeometry(0.06, 0.1, 4, 8), mats.leather, [0, 0.05, 0]);
  }
  // front & back cloth aprons (follow thighs)
  const apronGeo = new THREE.PlaneGeometry(robe ? 0.36 : 0.3, robe ? 0.95 : 0.66, 4, 8);
  apronGeo.translate(0, robe ? -0.47 : -0.33, 0);
  { const ap = apronGeo.attributes.position; for (let i = 0; i < ap.count; i++) { const x = ap.getX(i); ap.setZ(i, x * x * 1.2); ap.setX(i, x * (1 + Math.max(0, -ap.getY(i)) * 0.35)); } apronGeo.computeVertexNormals(); }
  const hemGeo = new THREE.BoxGeometry(robe ? 0.36 : 0.36, 0.035, 0.012); hemGeo.translate(0, robe ? -0.93 : -0.64, 0.0);
  const apronF = new THREE.Group(); apronF.position.set(0, 0.02, 0.135 * bulk); B.hips.add(apronF);
  add(apronF, apronGeo, mats.cloth2);
  if (!robe) add(apronF, hemGeo, mats.trim, [0, 0, 0.045]);
  const apronB = new THREE.Group(); apronB.position.set(0, 0.02, -0.135 * bulk); B.hips.add(apronB);
  add(apronB, apronGeo, mats.cloth2, [0, 0, 0], [0, Math.PI, 0]);
  if (!robe) add(apronB, hemGeo, mats.trim, [0, 0, -0.045]);
  B.apronF = apronF; B.apronB = apronB;
  if (robe) {
    // long skirt lathe
    const skirt = new THREE.Group(); B.hips.add(skirt); B.skirt = skirt;
    add(skirt, lathe([[0.16, 0.05], [0.2, -0.3], [0.27, -0.7], [0.32, -0.98]], 24, 0.85), mats.cloth);
  }

  // --- weapon
  let weapon = null;
  if (def.weapon) {
    weapon = buildWeapon(def.weapon, mats);
    body.add(weapon.group);
  }
  // sheathed Qinggang sword on the back (hidden until obtained)
  const backSword = buildWeapon('sword', mats);
  backSword.group.position.set(0.05, 0.1, -0.2);
  backSword.group.rotation.set(-Math.PI / 2 + 0.3, 0, 0.5);
  backSword.group.scale.setScalar(0.9);
  backSword.group.visible = false;
  B.chest.add(backSword.group);
  // A Dou bundle on chest (hidden until rescued)
  const bundle = new THREE.Group();
  add(bundle, new THREE.SphereGeometry(0.11, 14, 10), mats.cape, [0, 0, 0], [0, 0, 0], [1, 0.8, 1.5]);
  add(bundle, new THREE.SphereGeometry(0.045, 12, 10), mats.skin, [0, 0.03, 0.12]);
  add(bundle, new THREE.TorusGeometry(0.17, 0.015, 6, 20), mats.cloth2, [0, 0.0, 0], [0, 0, 0.6], [1, 1.2, 1]);
  bundle.position.set(0, 0.06, 0.21); bundle.rotation.x = -0.4; bundle.visible = false;
  B.chest.add(bundle);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow !== false; } });

  return new Rig(root, body, B, weapon, mats, def, { backSword, bundle });
}

// ------------------------------------------------------------------ pose application
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _pole = new THREE.Vector3(), _hint = new THREE.Vector3();
const _q = new THREE.Quaternion(), _mq = new THREE.Quaternion(), _e = new THREE.Euler();
const _target = new THREE.Vector3(), _grip = new THREE.Vector3(), _sh = new THREE.Vector3(), _dir = new THREE.Vector3(), _tmp = new THREE.Vector3();

export class Rig {
  constructor(root, body, bones, weapon, mats, def, extras) {
    this.root = root; this.body = body; this.B = bones; this.weapon = weapon; this.mats = mats; this.def = def;
    this.extras = extras;
    this.pose = new Float32Array(POSE_SIZE);
    this.tasselVel = 0; this.tasselAng = 0;
    this.plumeAng = new THREE.Vector2(); this.plumeVel = new THREE.Vector2();
    this.lastSpearQ = new THREE.Quaternion();
    const S = def.scale ?? 1;
    this.upperLen = 0.3 * S; this.lowerLen = 0.27 * S; this.thighLen = 0.46 * S; this.shinLen = 0.46 * S;
    // cached world-space spear segment (for hit tests)
    this.tipWorld = new THREE.Vector3(); this.buttWorld = new THREE.Vector3(); this.bladeWorld = new THREE.Vector3();
    this.prevTip = new THREE.Vector3(); this.prevButt = new THREE.Vector3(); this.prevBlade = new THREE.Vector3();
  }

  // Character-space point -> world
  toWorld(out, x, y, z) {
    out.set(x, y, z);
    return this.body.localToWorld(out);
  }

  apply(p, dt = 0.016) {
    const B = this.B;
    this.body.position.y = p[30];
    this.body.rotation.set(p[34], p[33], 0, 'YXZ');
    B.hips.position.set(p[31], 1.0 + p[0], p[32]);
    B.hips.rotation.set(p[1], p[2], p[3], 'YXZ');
    B.spine.rotation.set(p[4], p[5], p[6], 'YXZ');
    B.chest.rotation.set(p[7], p[8], p[9], 'YXZ');
    B.head.rotation.set(p[10], p[11], p[12], 'YXZ');
    this.root.updateMatrixWorld(true);
    const reach = 0.57 * 0.985;

    // weapon / right-hand target, pulled within reach of the right shoulder
    const w = this.weapon;
    _grip.set(p[13], p[14], p[15]);
    B.upperArmR.getWorldPosition(_sh); this.body.worldToLocal(_sh);
    _sh.divideScalar(1); // body space already accounts for scale
    {
      const d = _grip.distanceTo(_sh);
      if (d > reach) _grip.sub(_sh).multiplyScalar(reach / d).add(_sh);
    }
    if (w) {
      w.group.position.copy(_grip);
      w.group.rotation.set(-p[17], p[16], p[18], 'YXZ');
      w.group.updateMatrixWorld(true);
    }
    this.toWorld(_target, _grip.x, _grip.y, _grip.z);
    solveTwoBone(B.upperArmR, B.foreArmR, this.upperLen, this.lowerLen, _target, this.toWorld(_pole, -0.9, 1.0 + p[0], -0.6), null);
    this.orientHand(B.handR, w ? w.group : null, -1);

    // left hand: slides along the shaft to the nearest reachable point, or goes to free target
    {
      const free = p[20];
      B.upperArmL.getWorldPosition(_sh); this.body.worldToLocal(_sh);
      _v2.set(p[21], p[22], p[23]);
      if (w && free < 0.999) {
        _dir.set(0, 0, 1).applyQuaternion(w.group.quaternion);
        let t = p[19];
        _v.copy(_grip).addScaledVector(_dir, t);
        if (_v.distanceTo(_sh) > reach) {
          // solve |G + dir*t - S| = reach for t closest to desired
          _tmp.subVectors(_grip, _sh);
          const bq = _tmp.dot(_dir), cq = _tmp.lengthSq() - reach * reach;
          const disc = bq * bq - cq;
          if (disc >= 0) {
            const r = Math.sqrt(disc), t1 = -bq - r, t2 = -bq + r;
            const cands = [t1, t2].filter((x) => x > 0.12 && x < 1.6);
            if (cands.length) t = cands.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
            else { t = Math.max(0.15, -bq); }
          } else t = Math.max(0.15, -bq);
          _v.copy(_grip).addScaledVector(_dir, t);
        }
        _v.lerp(_v2, free);
      } else _v.copy(_v2);
      this.toWorld(_target, _v.x, _v.y, _v.z);
      solveTwoBone(B.upperArmL, B.foreArmL, this.upperLen, this.lowerLen, _target, this.toWorld(_pole, 0.9, 1.0 + p[0], -0.6), null);
      this.orientHand(B.handL, w && free < 0.5 ? w.group : null, 1);
    }
    // legs
    for (const [side, i, sx] of [['L', 24, 1], ['R', 27, -1]]) {
      this.toWorld(_target, p[i], p[i + 1], p[i + 2]);
      this.toWorld(_pole, p[i] + sx * 0.08, 0.9 + p[0], p[i + 2] + 1.2);
      solveTwoBone(B['thigh' + side], B['shin' + side], this.thighLen, this.shinLen, _target, _pole, null);
      const ft = B['foot' + side];
      ft.parent.getWorldQuaternion(_q).invert();
      this.body.getWorldQuaternion(_q2);
      ft.quaternion.copy(_q.multiply(_q2));
    }
    // aprons follow thighs (swing angle in hips space)
    const swing = (th) => { _v.set(0, -1, 0).applyQuaternion(th.quaternion); return Math.atan2(_v.z, -_v.y); };
    const sL = swing(B.thighL), sR = swing(B.thighR);
    B.apronF.rotation.x = -Math.max(0, Math.max(sL, sR)) * 0.95 + 0.06;
    B.apronB.rotation.x = -Math.min(0, Math.min(sL, sR)) * 0.95 - 0.06;
    if (B.skirt) B.skirt.rotation.x = -(sL + sR) * 0.15;

    this.updateSecondary(dt);
    this.root.updateMatrixWorld(true);
    this.cacheWeapon();
  }

  orientHand(hand, weaponGroup, sx) {
    if (weaponGroup) {
      // fist axis follows spear: hand -Y roughly perpendicular to shaft
      weaponGroup.getWorldQuaternion(_q);
      _q.multiply(_qHand);
      hand.parent.getWorldQuaternion(_q2).invert();
      hand.quaternion.copy(_q2.multiply(_q));
    } else {
      hand.quaternion.identity();
    }
  }

  updateSecondary(dt) {
    // spear tassel sway driven by weapon angular velocity
    const w = this.weapon;
    if (w && w.info.tassel.length) {
      w.group.getWorldQuaternion(_q);
      const ang = this.lastSpearQ.angleTo(_q);
      this.lastSpearQ.copy(_q);
      this.tasselVel += (ang / Math.max(dt, 1e-3)) * 0.02 - this.tasselAng * 40 * dt - this.tasselVel * 6 * dt;
      this.tasselAng += this.tasselVel * dt;
      const a = THREE.MathUtils.clamp(this.tasselAng, -1.2, 1.2);
      for (const t of w.info.tassel) {
        // keep tassel hanging down in world
        t.rotation.set(0, 0, 0);
        t.updateMatrixWorld(true);
        t.parent.getWorldQuaternion(_q).invert();
        t.quaternion.copy(_q);
        t.rotateX(a * 0.8);
        t.rotateZ(Math.sin(a * 3) * 0.3);
      }
    }
    if (this.B.plume && this.def.plume === 'mane') {
      // a long mane keeps hanging as it would from an upright head (only turning with the body),
      // so it doesn't fan up when the head bows or the body leans
      const p = this.B.plume;
      p.rotation.set(0, 0, 0);
      p.parent.updateMatrixWorld(true);
      p.parent.getWorldQuaternion(_q).invert();
      this.root.getWorldQuaternion(_mq);
      _e.setFromQuaternion(_mq, 'YXZ'); _e.set(0.25 + this.plumeAng.x, _e.y, this.plumeAng.y, 'YXZ');
      p.quaternion.copy(_q).multiply(_mq.setFromEuler(_e));
    } else if (this.B.plume) {
      this.B.plume.rotation.x = 0.25 + this.plumeAng.x;
      this.B.plume.rotation.z = this.plumeAng.y;
    }
  }

  cacheWeapon() {
    const w = this.weapon;
    if (!w) return;
    this.prevTip.copy(this.tipWorld); this.prevButt.copy(this.buttWorld); this.prevBlade.copy(this.bladeWorld);
    this.tipWorld.set(0, 0, w.info.tip).applyMatrix4(w.group.matrixWorld);
    this.buttWorld.set(0, 0, w.info.butt).applyMatrix4(w.group.matrixWorld);
    this.bladeWorld.set(0, 0, w.info.bladeStart).applyMatrix4(w.group.matrixWorld);
  }

  setGlow(v) {
    if (this.weapon?.info.glow) this.weapon.info.glow.material.opacity = v;
  }
}
const _q2 = new THREE.Quaternion();
// hand frame relative to spear: hand -Y across the shaft, fingers wrap
const _qHand = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
