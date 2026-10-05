import * as THREE from 'three';
import { makeNoise2D, mulberry32 } from '../core/noise.js';

// Procedural canvas textures. All tileable via periodic sampling (torus mapping).

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Tileable fbm by sampling 4D-ish torus: blend of offsets (cheap trick: sample 2D noise on circle coords).
function tileFbm(noise, u, v, freq, oct) {
  let sum = 0, amp = 1, norm = 0, f = freq;
  for (let o = 0; o < oct; o++) {
    // Map to torus using two 2D samples blended (approximate seamless)
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    const r = f / (Math.PI * 2);
    const n = noise(Math.cos(a) * r + Math.sin(b) * r * 0.37 + o * 17.3, Math.sin(a) * r + Math.cos(b) * r + o * 7.1)
      * 0.5 + noise(Math.cos(b) * r + o * 3.3, Math.sin(b) * r + Math.cos(a) * r * 0.29 - o * 11.7) * 0.5;
    sum += n * amp; norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

function heightField(size, seed, freq, oct, shape = (x) => x) {
  const noise = makeNoise2D(seed);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    h[y * size + x] = shape(tileFbm(noise, x / size, y / size, freq, oct) * 0.5 + 0.5, x, y);
  }
  return h;
}

export function normalFromHeight(h, size, strength = 2) {
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = h[y * size + ((x - 1 + size) % size)], xr = h[y * size + ((x + 1) % size)];
    const yu = h[((y - 1 + size) % size) * size + x], yd = h[((y + 1) % size) * size + x];
    let nx = (xl - xr) * strength, ny = (yu - yd) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = nz * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function colorTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function paint(size, h, fn) {
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = fn(h[i], i % size, (i / size) | 0);
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

export function makeTerrainTextures() {
  const S = 512;
  const rnd = mulberry32(42);
  // Grass
  const gh = heightField(S, 11, 24, 5);
  const gc = paint(S, gh, (v) => {
    const c = mix3([58, 72, 30], [128, 132, 62], Math.pow(v, 1.4));
    return mix3(c, [150, 128, 72], Math.max(0, v - 0.72) * 2.2);
  });
  // grass strokes
  const gctx = gc.getContext('2d');
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * S, y = rnd() * S, l = 3 + rnd() * 7, a = -Math.PI / 2 + (rnd() - 0.5) * 0.9;
    const shade = rnd();
    gctx.strokeStyle = `rgba(${mix(40, 170, shade) | 0},${mix(60, 160, shade) | 0},${mix(20, 70, shade) | 0},0.35)`;
    gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(x, y); gctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); gctx.stroke();
  }
  // Dirt road
  const dh = heightField(S, 23, 16, 6);
  const dc = paint(S, dh, (v) => mix3([72, 54, 38], [150, 120, 84], v));
  const dctx = dc.getContext('2d');
  for (let i = 0; i < 2200; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.6 + rnd() * 2.6, s = rnd();
    dctx.fillStyle = `rgba(${mix(60, 190, s) | 0},${mix(50, 170, s) | 0},${mix(40, 140, s) | 0},0.7)`;
    dctx.beginPath(); dctx.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2); dctx.fill();
  }
  // wheel ruts / hoof prints
  dctx.globalAlpha = 0.18;
  for (let i = 0; i < 400; i++) {
    dctx.fillStyle = '#2a1d12';
    dctx.beginPath(); dctx.ellipse(rnd() * S, rnd() * S, 3 + rnd() * 3, 2 + rnd() * 2, rnd() * 3, 0, Math.PI * 2); dctx.fill();
  }
  dctx.globalAlpha = 1;
  // Rock
  const rh = heightField(S, 37, 8, 7, (v, x, y) => Math.pow(v, 1.2));
  const rc = paint(S, rh, (v) => mix3([62, 60, 58], [158, 150, 138], v));

  const grassN = normalFromHeight(gh, S, 3);
  const dirtN = normalFromHeight(dh, S, 5);
  const rockN = normalFromHeight(rh, S, 7);
  return {
    grass: colorTex(gc), dirt: colorTex(dc), rock: colorTex(rc),
    grassN, dirtN, rockN,
  };
}

export function makeArmorTextures() {
  const S = 256;
  const rnd = mulberry32(7);
  const h = heightField(S, 5, 10, 5);
  // roughness map with scratches (green channel used by three for roughness)
  const c = paint(S, h, (v) => { const r = 150 + v * 80; return [r, r, r]; });
  const ctx = c.getContext('2d');
  for (let i = 0; i < 600; i++) {
    const x = rnd() * S, y = rnd() * S, l = 4 + rnd() * 30, a = rnd() * Math.PI;
    ctx.strokeStyle = `rgba(${rnd() < 0.5 ? 60 : 255},${rnd() < 0.5 ? 60 : 255},${rnd() < 0.5 ? 60 : 255},0.25)`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  const rough = colorTex(c, false);
  const normal = normalFromHeight(h, S, 1.2);
  return { rough, normal };
}

// Silk with brocade cloud motif
export function makeBrocadeTexture(base, motif, seed = 3) {
  const S = 512;
  const c = canvas(S), ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  // fine weave
  ctx.globalAlpha = 0.08;
  for (let y = 0; y < S; y += 2) { ctx.fillStyle = y % 4 ? '#000' : '#fff'; ctx.fillRect(0, y, S, 1); }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = motif; ctx.lineWidth = 3; ctx.globalAlpha = 0.55;
  const cloud = (cx, cy, s) => {
    ctx.beginPath();
    ctx.arc(cx, cy, s, Math.PI * 0.9, Math.PI * 2.2);
    ctx.arc(cx + s * 1.3, cy + s * 0.3, s * 0.7, Math.PI * 1.1, Math.PI * 2.4);
    ctx.arc(cx + s * 0.4, cy + s * 0.8, s * 0.5, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + s * 0.3, cy + s * 0.15, s * 0.35, 0, Math.PI * 1.6); ctx.stroke();
  };
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const ox = (y % 2) * 64;
    for (const dx of [-S, 0, S]) cloud(x * 128 + ox + 30 + dx, y * 128 + 50, 22);
  }
  ctx.globalAlpha = 1;
  return colorTex(c);
}

export function makeBannerTexture(char, bg, fg, border) {
  const W = 256, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // fabric noise
  const rnd = mulberry32(char.charCodeAt(0));
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`;
    ctx.fillRect(rnd() * W, rnd() * H, 2, 1 + rnd() * 6);
  }
  ctx.fillStyle = border;
  ctx.fillRect(0, 0, W, 18); ctx.fillRect(0, 0, 18, H); ctx.fillRect(W - 18, 0, 18, H);
  // flame-tooth edge at bottom
  for (let x = 0; x < W; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, H - 40); ctx.lineTo(x + 16, H); ctx.lineTo(x + 32, H - 40); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(W / 2, H * 0.42, 92, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = '170px "Ma Shan Zheng", "KaiTi", "STKaiti", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(char, W / 2, H * 0.43);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function makeSoftTexture(size = 64, power = 2) {
  const c = canvas(size), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, `rgba(255,255,255,${power > 2 ? 0.5 : 0.7})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export function makeSmokeTexture(size = 128) {
  const noise = makeNoise2D(99);
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x / size - 0.5, dy = y / size - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    const n = (noise(x * 0.05, y * 0.05) * 0.5 + noise(x * 0.11, y * 0.11) * 0.3 + 0.5);
    const a = Math.max(0, 1 - r) ** 1.5 * Math.min(1, Math.max(0, n * 1.2));
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

export function makeBarkTexture() {
  const S = 256;
  const noise = makeNoise2D(17);
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S;
    const n = Math.sin((u * 14 + noise(x * 0.02, y * 0.004) * 1.5) * Math.PI) * 0.5 + 0.5;
    h[y * S + x] = n * 0.7 + (noise(x * 0.1, y * 0.03) * 0.5 + 0.5) * 0.3;
  }
  const c = paint(S, h, (v) => mix3([38, 28, 22], [104, 84, 66], v));
  return { map: colorTex(c), normal: normalFromHeight(h, S, 4) };
}

export function makeWoodTexture() {
  const S = 256;
  const noise = makeNoise2D(29);
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const g = Math.sin((y * 0.16 + noise(x * 0.01, y * 0.05) * 4)) * 0.5 + 0.5;
    h[y * S + x] = g * 0.6 + (noise(x * 0.3, y * 0.02) * 0.5 + 0.5) * 0.4;
  }
  const c = paint(S, h, (v) => mix3([70, 46, 28], [140, 102, 64], v));
  return { map: colorTex(c), normal: normalFromHeight(h, S, 2) };
}

export function makePlasterTexture() {
  const S = 256;
  const h = heightField(S, 61, 6, 6);
  const c = paint(S, h, (v) => mix3([150, 136, 112], [212, 198, 170], v));
  return { map: colorTex(c), normal: normalFromHeight(h, S, 2) };
}

export function makeTileTexture() {
  const S = 256;
  const c = canvas(S), ctx = c.getContext('2d');
  ctx.fillStyle = '#2d3133'; ctx.fillRect(0, 0, S, S);
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x % 32) / 32;
    const ridge = Math.sin(u * Math.PI);
    const row = ((y % 24) / 24);
    h[y * S + x] = ridge * 0.8 + row * 0.25;
  }
  const img = paint(S, h, (v) => mix3([30, 33, 36], [92, 96, 98], v));
  return { map: colorTex(img), normal: normalFromHeight(h, S, 6) };
}
