import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GradeShader } from './gradeShader.js';

export const QUALITY = {
  ultra: { ao: true, aoSamples: 12, shadow: 4096, pr: 1.5, smaa: true, grass: 1.0 },
  high: { ao: true, aoSamples: 8, shadow: 2048, pr: 1.0, smaa: true, grass: 1.0 },
  medium: { ao: false, shadow: 2048, pr: 1.25, smaa: true, grass: 0.7 },
  low: { ao: false, shadow: 1024, pr: 1.0, smaa: false, grass: 0.4 },
};

export function pickQuality() {
  const saved = (() => { try { return localStorage.getItem('sw-quality'); } catch { return null; } })();
  if (saved && QUALITY[saved]) return saved;
  return 'high';
}

export class Renderer {
  constructor(canvas, qualityName) {
    this.qualityName = qualityName;
    this.q = QUALITY[qualityName];
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.q.pr));
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1600);
    this.composer = null;
    window.addEventListener('resize', () => this.resize());
  }

  buildComposer() {
    const { renderer: r, scene, camera } = this;
    const w = window.innerWidth, h = window.innerHeight;
    const composer = new EffectComposer(r);
    composer.setPixelRatio(r.getPixelRatio());
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, camera));
    if (this.q.ao) {
      const ao = new GTAOPass(scene, camera, w, h);
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: this.q.aoSamples ?? 12 });
      ao.blendIntensity = 0.85;
      // keep transparent FX (trails, particles, rings, water) out of the AO depth/normal pass
      ao._overrideVisibility = function () {
        const cache = this._visibilityCache;
        cache.length = 0;
        this.scene.traverse((o) => {
          const m = o.material;
          if (o.visible && (o.isPoints || o.isLine || o.userData.noAO || (m && !Array.isArray(m) && m.transparent))) { o.visible = false; cache.push(o); }
        });
      };
      composer.addPass(ao);
      this.aoPass = ao;
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.42, 1.0);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    composer.addPass(this.grade);
    if (this.q.smaa) composer.addPass(new SMAAPass());
    this.composer = composer;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
  }

  render(dt, time) {
    if (this.grade) {
      const u = this.grade.uniforms;
      u.time.value = time;
      u.aspect.value = this.camera.aspect;
    }
    this.composer.render(dt);
  }
}
