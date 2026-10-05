import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// Late-afternoon sun over Changban: low, warm, raking light.
export const SUN_DIR = new THREE.Vector3(-0.8, 0.3, -0.38).normalize();
const sd = SUN_DIR;

// Height fog with sun in-scattering, patched into every built-in material.
export function installAtmosphericFog() {
  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG\n varying float vFogDepth;\n varying vec3 vFogWorldPos;\n#endif`;
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG\n vFogDepth = - mvPosition.z;\n vFogWorldPos = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);\n#endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor;
    varying float vFogDepth;
    varying vec3 vFogWorldPos;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear; uniform float fogFar;
    #endif
  #endif`;
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
    vec3 fogRay = vFogWorldPos - cameraPosition;
    float fogDist = length(fogRay);
    vec3 fogDir = fogRay / max(fogDist, 1e-4);
    #ifdef FOG_EXP2
      const float hFall = 0.045;
      float camH = max(cameraPosition.y + 2.0, 0.0);
      float ry = fogRay.y * hFall;
      float heightInt = exp(-camH * hFall) * (abs(ry) > 1e-3 ? (1.0 - exp(-ry)) / ry : 1.0);
      float fogFactor = 1.0 - exp(-fogDensity * fogDist * heightInt * 1.6);
      fogFactor = clamp(fogFactor + (1.0 - exp(-fogDensity * fogDensity * fogDist * fogDist * 0.06)), 0.0, 1.0);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    float sunAmt = pow(max(dot(fogDir, vec3(${sd.x.toFixed(4)}, ${sd.y.toFixed(4)}, ${sd.z.toFixed(4)})), 0.0), 10.0);
    vec3 fCol = mix(fogColor, vec3(1.0, 0.62, 0.32) * 1.35, sunAmt * 0.5);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fCol, fogFactor);
  #endif`;
}

export function buildSky(renderer, scene) {
  const sky = new Sky();
  sky.scale.setScalar(1400);
  const u = sky.material.uniforms;
  u.turbidity.value = 6.5;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.0045;
  u.mieDirectionalG.value = 0.86;
  u.cloudCoverage.value = 0.42;
  u.cloudDensity.value = 0.55;
  u.cloudElevation.value = 0.55;
  u.cloudScale.value = 0.00018;
  u.cloudSpeed.value = 0.00004;
  u.sunPosition.value.copy(SUN_DIR).multiplyScalar(450000);
  sky.frustumCulled = false;
  scene.add(sky);

  // Environment map: controlled HDR gradient (warm horizon, soft sun lobe, earthy ground).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sun: { value: SUN_DIR.clone() } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 sun; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float h = d.y;
        vec3 zenith = vec3(0.32, 0.45, 0.72);
        vec3 horizon = vec3(1.05, 0.82, 0.62);
        vec3 ground = vec3(0.16, 0.13, 0.09);
        vec3 c = h > 0.0 ? mix(horizon, zenith, pow(h, 0.55)) : mix(horizon * 0.45, ground, pow(-h, 0.35));
        float s = max(dot(d, sun), 0.0);
        c += vec3(1.0, 0.7, 0.42) * (pow(s, 8.0) * 1.6 + pow(s, 64.0) * 4.0);
        // faint cloud banding for reflections
        c *= 1.0 + 0.08 * sin(d.x * 9.0 + d.z * 5.0) * smoothstep(0.0, 0.3, h);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), envMat));
  const env = pmrem.fromScene(envScene, 0.0).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();

  // Lights
  const sun = new THREE.DirectionalLight(0xffc996, 3.4);
  sun.position.copy(SUN_DIR).multiplyScalar(120);
  sun.castShadow = true;
  const sc = sun.shadow.camera;
  sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 320;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0x9fb4d6, 0x4a3a26, 0.75);
  scene.add(hemi);

  scene.fog = new THREE.FogExp2(0xa89a88, 0.0024);

  return {
    sky, sun, hemi,
    update(camera, focus, time) {
      sky.position.copy(camera.position);
      u.time.value = time;
      // Snap the shadow camera to texel grid to avoid shimmering
      const size = 84 / sun.shadow.mapSize.x;
      const fx = Math.round(focus.x / size) * size, fz = Math.round(focus.z / size) * size;
      sun.target.position.set(fx, focus.y, fz);
      sun.position.set(fx, focus.y, fz).addScaledVector(SUN_DIR, 150);
    },
  };
}
