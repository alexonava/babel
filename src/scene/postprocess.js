import { Vector2 } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const PASS_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GRADING_SHADER = {
  name: "BabelGradingShader",
  uniforms: {
    tDiffuse: { value: null },
    uCelMix: { value: 0.24 },
    uInkMix: { value: 0.14 },
    uContrast: { value: 1.1 },
    uHighlightWarmMix: { value: 0.2 },
    uShadowCoolMix: { value: 0.34 },
    uTexelSize: { value: new Vector2(1, 1) },
  },
  vertexShader: PASS_VERTEX_SHADER,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform float uCelMix;
uniform float uInkMix;
uniform float uContrast;
uniform float uHighlightWarmMix;
uniform float uShadowCoolMix;
uniform vec2 uTexelSize;
varying vec2 vUv;

vec3 saturateColor(vec3 color, float amount) {
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  return mix(vec3(luma), color, amount);
}

float luminanceAt(vec2 offset) {
  return dot(texture2D(tDiffuse, vUv + offset).rgb, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec4 texel = texture2D(tDiffuse, vUv);
  vec3 color = texel.rgb;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));

  color = (color - 0.5) * uContrast + 0.5;

  vec3 shadowLift = vec3(0.045, 0.055, 0.09);
  vec3 coolShadow = color * vec3(0.88, 0.94, 1.09);
  vec3 warmMidtone = color * vec3(1.025, 1.012, 0.965);
  vec3 parchmentHighlight = color * vec3(1.055, 1.025, 0.94);

  float shadowMix = 1.0 - smoothstep(0.08, 0.32, luma);
  float midMix = smoothstep(0.22, 0.46, luma) * (1.0 - smoothstep(0.62, 0.82, luma));
  float highlightMix = smoothstep(0.72, 0.97, luma);

  color = mix(color, max(coolShadow, shadowLift), uShadowCoolMix * shadowMix);
  color = mix(color, warmMidtone, 0.3 * midMix);
  color = mix(color, parchmentHighlight, uHighlightWarmMix * highlightMix);

  float gradedLuma = max(0.02, dot(color, vec3(0.299, 0.587, 0.114)));
  float tonalBand = floor(gradedLuma * 5.0 + 0.5) / 5.0;
  vec3 celColor = color * (tonalBand / gradedLuma);
  color = mix(color, celColor, uCelMix);
  color = saturateColor(color, 1.04);

  float horizontalEdge = abs(luminanceAt(vec2(uTexelSize.x, 0.0)) - luminanceAt(vec2(-uTexelSize.x, 0.0)));
  float verticalEdge = abs(luminanceAt(vec2(0.0, uTexelSize.y)) - luminanceAt(vec2(0.0, -uTexelSize.y)));
  float inkContour = smoothstep(0.2, 0.48, max(horizontalEdge, verticalEdge));
  color = mix(color, vec3(0.035, 0.055, 0.095), inkContour * uInkMix);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
}
`,
};

const VIGNETTE_GRAIN_SHADER = {
  name: "BabelVignetteGrainShader",
  uniforms: {
    tDiffuse: { value: null },
    uVignetteEnabled: { value: 1 },
    uVignetteStrength: { value: 0.12 },
    uGrainEnabled: { value: 1 },
    uGrainStrength: { value: 0.018 },
    uTextProtection: { value: 0 },
    uTextBottom: { value: 0.25 },
    uFade: { value: 0 },
  },
  vertexShader: PASS_VERTEX_SHADER,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform int uVignetteEnabled;
uniform float uVignetteStrength;
uniform int uGrainEnabled;
uniform float uGrainStrength;
uniform float uTextProtection;
uniform float uTextBottom;
uniform float uFade;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec4 texel = texture2D(tDiffuse, vUv);
  vec3 color = texel.rgb;

  if (uVignetteEnabled == 1) {
    float dist = distance(vUv, vec2(0.5));
    float vignette = smoothstep(0.42, 1.0, dist);
    color *= 1.0 - uVignetteStrength * vignette;
  }

  if (uGrainEnabled == 1) {
    float grain = hash(floor(vUv * vec2(1280.0, 720.0))) - 0.5;
    color += grain * uGrainStrength;
  }

  float textShade = smoothstep(1.0 - uTextBottom - .12, 1.0 - uTextBottom + .10, vUv.y);
  color *= 1.0 - .28 * uTextProtection * textShade;
  color *= 1.0 - uFade;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
}
`,
};

function getSize(renderer) {
  if (renderer && typeof renderer.getSize === "function") {
    return renderer.getSize(new Vector2());
  }
  return new Vector2(1, 1);
}

export function createPostprocessPipeline(renderer, scene, camera, qualityProfile, options = {}) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const size = getSize(renderer);
  const bloomPass = new UnrealBloomPass(size, 0.18, 0.45, 0.9);
  const gradingPass = new ShaderPass(GRADING_SHADER);
  const vignetteGrainPass = new ShaderPass(VIGNETTE_GRAIN_SHADER);
  const matchMedia = options.matchMedia || globalThis.window?.matchMedia?.bind(globalThis.window);
  const onInvalidate = typeof options.onInvalidate === "function" ? options.onInvalidate : () => {};
  const transparencyQuery = matchMedia?.("(prefers-reduced-transparency: reduce)");

  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(gradingPass);
  composer.addPass(vignetteGrainPass);

  let reducedTransparency = Boolean(transparencyQuery?.matches);
  let film = false,
    textProtection = false,
    fade = 0;

  function applyProfile(profile = {}) {
    const baseline = profile.postprocessSettings || {};
    const settings = film
      ? {
          ...baseline,
          bloomStrength: 0.2,
          celMix: 0.16,
          contrast: 0.99,
          grainStrength: 0.014,
          highlightWarmMix: 0.2,
          shadowCoolMix: 0.1,
          vignetteStrength: 0.14,
        }
      : baseline;
    const gradingEnabled = profile.postprocessGrading !== false;
    const bloomEnabled = profile.postprocessBloom === true;
    const vignetteEnabled = profile.postprocessVignette === true && !reducedTransparency;
    const grainEnabled = profile.postprocessGrain === true;

    bloomPass.enabled = bloomEnabled;
    bloomPass.strength = settings.bloomStrength ?? 0.18;
    gradingPass.enabled = gradingEnabled;
    gradingPass.uniforms.uCelMix.value = settings.celMix ?? 0.24;
    gradingPass.uniforms.uInkMix.value = film ? 0 : 0.14;
    gradingPass.uniforms.uContrast.value = settings.contrast ?? 1.06;
    gradingPass.uniforms.uHighlightWarmMix.value = settings.highlightWarmMix ?? 0.14;
    gradingPass.uniforms.uShadowCoolMix.value = settings.shadowCoolMix ?? 0.25;
    vignetteGrainPass.enabled =
      vignetteEnabled || grainEnabled || (film && textProtection) || fade > 0;
    vignetteGrainPass.uniforms.uVignetteEnabled.value = vignetteEnabled ? 1 : 0;
    vignetteGrainPass.uniforms.uVignetteStrength.value = settings.vignetteStrength ?? 0.08;
    vignetteGrainPass.uniforms.uGrainEnabled.value = grainEnabled ? 1 : 0;
    vignetteGrainPass.uniforms.uGrainStrength.value = settings.grainStrength ?? 0.022;
  }

  function onTransparencyChange(event) {
    const nextReducedTransparency = Boolean(event?.matches);
    if (nextReducedTransparency === reducedTransparency) return;
    reducedTransparency = nextReducedTransparency;
    applyProfile(currentProfile);
    onInvalidate();
  }

  let currentProfile = qualityProfile || {};
  applyProfile(currentProfile);

  function resize(width, height) {
    gradingPass.uniforms.uTexelSize.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  resize(size.width, size.height);

  if (typeof transparencyQuery?.addEventListener === "function") {
    transparencyQuery.addEventListener("change", onTransparencyChange);
  } else if (typeof transparencyQuery?.addListener === "function") {
    transparencyQuery.addListener(onTransparencyChange);
  }

  return {
    composer,
    passes: {
      bloom: bloomPass,
      grading: gradingPass,
      render: renderPass,
      vignetteGrain: vignetteGrainPass,
    },
    dispose() {
      if (typeof transparencyQuery?.removeEventListener === "function") {
        transparencyQuery.removeEventListener("change", onTransparencyChange);
      } else if (typeof transparencyQuery?.removeListener === "function") {
        transparencyQuery.removeListener(onTransparencyChange);
      }
      for (const pass of composer.passes) {
        if (typeof pass.dispose === "function") pass.dispose();
      }
      if (typeof composer.dispose === "function") composer.dispose();
    },
    setFilmTreatment(active) {
      film = Boolean(active);
      if (!film) {
        textProtection = false;
        vignetteGrainPass.uniforms.uTextProtection.value = 0;
      }
      applyProfile(currentProfile);
    },
    // Tour cuts dip to black through the existing final pass; no added pass.
    setFade(value = 0) {
      const next = Math.max(0, Math.min(1, Number(value) || 0));
      if (next === fade) return;
      const toggled = next > 0 !== fade > 0;
      fade = next;
      vignetteGrainPass.uniforms.uFade.value = fade;
      if (toggled) applyProfile(currentProfile);
    },
    setTextProtection(active, bottom = 0.25) {
      const enabled = film && Boolean(active);
      if (textProtection !== enabled) {
        textProtection = enabled;
        applyProfile(currentProfile);
      }
      vignetteGrainPass.uniforms.uTextProtection.value = enabled ? 1 : 0;
      vignetteGrainPass.uniforms.uTextBottom.value = bottom;
    },
    setQualityProfile(profile = {}) {
      currentProfile = profile;
      applyProfile(currentProfile);
    },
    resize,
  };
}
