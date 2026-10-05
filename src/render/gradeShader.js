// Display-space cinematic grade: split-toning, contrast, saturation, vignette,
// chromatic aberration, radial blur (musou), damage tint, flash and film grain.
export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    aspect: { value: 1.7 },
    saturation: { value: 1.08 },
    contrast: { value: 1.08 },
    vignette: { value: 0.32 },
    aberration: { value: 0.0016 },
    grain: { value: 0.045 },
    radialBlur: { value: 0.0 },
    damage: { value: 0.0 },
    flash: { value: 0.0 },
    desaturate: { value: 0.0 },
    letterbox: { value: 0.0 },
    fade: { value: 0.0 },
    shadowTint: { value: [0.92, 0.98, 1.08] },
    highTint: { value: [1.06, 1.0, 0.9] },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time, aspect, saturation, contrast, vignette, aberration, grain, radialBlur, damage, flash, desaturate, letterbox, fade;
    uniform vec3 shadowTint, highTint;
    varying vec2 vUv;

    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c * vec2(aspect, 1.0), c * vec2(aspect, 1.0));

      vec3 col;
      float ca = aberration * (0.3 + r2 * 2.5) + radialBlur * 0.01;
      col.r = texture2D(tDiffuse, uv - c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + c * ca).b;

      if (radialBlur > 0.001) {
        vec3 acc = col; float wsum = 1.0;
        for (int i = 1; i < 12; i++) {
          float s = 1.0 - float(i) * radialBlur * 0.012;
          float w = 1.0 - float(i) / 12.0;
          acc += texture2D(tDiffuse, 0.5 + c * s).rgb * w; wsum += w;
        }
        col = mix(col, acc / wsum, clamp(radialBlur * 1.5, 0.0, 1.0) * smoothstep(0.0, 0.25, r2));
      }

      // split toning by luminance
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col *= mix(shadowTint, highTint, smoothstep(0.1, 0.75, l));
      // contrast around mid grey (S-curve-ish)
      col = (col - 0.5) * contrast + 0.5;
      l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation * (1.0 - desaturate));

      // damage: red edges
      col = mix(col, col * vec3(1.25, 0.35, 0.3), damage * smoothstep(0.05, 0.6, r2));
      // vignette
      col *= mix(1.0, smoothstep(1.05, 0.15, r2), vignette);
      // grain
      float g = hash(uv * 1000.0 + fract(time * 7.13) * 100.0) - 0.5;
      col += g * grain * (1.0 - l * 0.6);
      // flash
      col = mix(col, vec3(1.0, 0.97, 0.9), flash);
      // letterbox
      float lb = letterbox * 0.12;
      if (uv.y < lb || uv.y > 1.0 - lb) col *= 0.0;
      col *= 1.0 - fade;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};
