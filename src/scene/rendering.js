import {
  AmbientLight,
  ColorManagement,
  DirectionalLight,
  Fog,
  HemisphereLight,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from "three";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { createPostprocessPipeline } from "./postprocess.js";
import { disposeSceneRuntimeResources } from "./runtime.js";

function setRendererOutputColorSpace(renderer, threeExports = {}) {
  const srgbColorSpace = threeExports.SRGBColorSpace || SRGBColorSpace;
  const srgbEncoding = threeExports.sRGBEncoding;
  if (srgbColorSpace && "outputColorSpace" in renderer) {
    renderer.outputColorSpace = srgbColorSpace;
  } else if (srgbEncoding && "outputEncoding" in renderer) {
    renderer.outputEncoding = srgbEncoding;
  }
}

export function createSceneRendering({
  container,
  height,
  lighting,
  onContextLost,
  onContextRestored,
  onInvalidate,
  profile,
  threeExports,
  width,
  world,
  createOutlinePass = (size, homeScene, camera) => new OutlinePass(size, homeScene, camera),
  createPipeline = createPostprocessPipeline,
  createRenderer = (options) => new WebGLRenderer(options),
  disposeResources = disposeSceneRuntimeResources,
}) {
  if (ColorManagement) ColorManagement.enabled = false;

  const homeScene = new Scene();
  homeScene.fog = new Fog(lighting.fogColor, lighting.fogNear, lighting.fogFar);

  const camera = new PerspectiveCamera(
    world.CAMERA_FOV,
    width / height,
    world.CAMERA_NEAR,
    world.CAMERA_FAR,
  );
  const renderer = createRenderer({
    alpha: true,
    antialias: profile.antialias,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0, 0);
  setRendererOutputColorSpace(renderer, threeExports);
  renderer.toneMapping = NoToneMapping;
  renderer._useLegacyLights = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const postprocessPipeline = createPipeline(renderer, homeScene, camera, profile, {
    onInvalidate,
  });
  const composer = postprocessPipeline.composer;
  let currentHeight = height;
  let currentWidth = width;
  let outlinePass = null;

  const handleContextLost = (event) => {
    event?.preventDefault?.();
    onContextLost?.(event);
  };
  const handleContextRestored = (event) => {
    onContextRestored?.(event);
  };
  renderer.domElement?.addEventListener?.("webglcontextlost", handleContextLost);
  renderer.domElement?.addEventListener?.("webglcontextrestored", handleContextRestored);

  const ambientLight = new AmbientLight(lighting.ambientColor, lighting.ambientIntensity);
  const hemisphereLight = new HemisphereLight(
    lighting.hemisphereSkyColor,
    lighting.hemisphereGroundColor,
    lighting.hemisphereIntensity,
  );
  const sunLight = new DirectionalLight(lighting.directionalColor, lighting.directionalIntensity);
  const fillLight = new DirectionalLight(
    lighting.fillColor ?? 0x596b9c,
    lighting.fillIntensity ?? 0.58,
  );
  sunLight.position.set(
    lighting.directionalPosition.x,
    lighting.directionalPosition.y,
    lighting.directionalPosition.z,
  );
  sunLight.shadow.camera.left = -world.SHADOW_CAMERA_HALF_EXTENT;
  sunLight.shadow.camera.right = world.SHADOW_CAMERA_HALF_EXTENT;
  sunLight.shadow.camera.top = world.SHADOW_CAMERA_HALF_EXTENT;
  sunLight.shadow.camera.bottom = -world.SHADOW_CAMERA_HALF_EXTENT;
  sunLight.shadow.camera.near = world.SHADOW_CAMERA_NEAR;
  sunLight.shadow.camera.far = world.SHADOW_CAMERA_FAR;
  sunLight.shadow.bias = -0.00045;
  sunLight.shadow.normalBias = 0.028;
  sunLight.shadow.radius = 2.6;
  fillLight.position.set(...(lighting.fillPosition ?? world.FILL_LIGHT_POSITION));
  homeScene.add(ambientLight, hemisphereLight, sunLight, fillLight, sunLight.target);

  let groundedLighting = false,
    filmLighting = false;
  const originalSunPosition = sunLight.position.clone(),
    originalSunTarget = sunLight.target.position.clone();
  const sunOffset = originalSunPosition.clone().sub(originalSunTarget);
  const originalShadow = {
    left: sunLight.shadow.camera.left,
    right: sunLight.shadow.camera.right,
    top: sunLight.shadow.camera.top,
    bottom: sunLight.shadow.camera.bottom,
  };
  let shadowKey = "";
  const baselineKeyColor = sunLight.color.clone();
  const baselineGroundColor = hemisphereLight.groundColor.clone();
  const baselineShadowRadius = sunLight.shadow.radius;
  const baselineShadowBias = sunLight.shadow.bias,
    baselineNormalBias = sunLight.shadow.normalBias;
  let baselineKeyIntensity = sunLight.intensity;
  let baselineFillIntensity = fillLight.intensity;
  let baselineHemisphereIntensity = hemisphereLight.intensity;
  let baselineAmbientIntensity = ambientLight.intensity;
  // Film: the supplied maps already carry daylight, so the key drops and cools
  // while fill, sky and ambient rise to open eaves, brackets and shadow ground.
  function applyLightingTreatment() {
    sunLight.color.copy(baselineKeyColor);
    if (groundedLighting) sunLight.color.setHex(0xd9e2f2);
    if (filmLighting) sunLight.color.setHex(0xe8c9a0);
    sunLight.intensity =
      baselineKeyIntensity * (groundedLighting ? 0.8 : 1) * (filmLighting ? 0.5 : 1);
    fillLight.intensity =
      baselineFillIntensity * (groundedLighting ? 1.5 : 1) * (filmLighting ? 1.1 : 1);
    hemisphereLight.intensity = baselineHemisphereIntensity * (filmLighting ? 1.25 : 1);
    hemisphereLight.groundColor.copy(baselineGroundColor);
    if (filmLighting) hemisphereLight.groundColor.setHex(0x463c34);
    ambientLight.intensity = baselineAmbientIntensity * (filmLighting ? 0.95 : 1);
    // Softer still than the earlier film pass: close, low shots showed the
    // tree canopy's cast shadow as a hard-edged dark pool on the ground.
    sunLight.shadow.radius = filmLighting ? 6.5 : baselineShadowRadius;
    // Lit, relief-mapped earth shows acne bands at grazing moonlight; bias more.
    sunLight.shadow.bias = filmLighting ? -0.0016 : baselineShadowBias;
    sunLight.shadow.normalBias = filmLighting ? 0.09 : baselineNormalBias;
  }

  const renderTargets = new Set();
  let disposed = false;
  let disposeResult = null;

  const rendering = {
    camera,
    composer,
    get disposeResult() {
      return disposeResult;
    },
    homeScene,
    lifecycleOrder: 100,
    lights: {
      ambient: ambientLight,
      fill: fillLight,
      hemisphere: hemisphereLight,
      sun: sunLight,
    },
    get outlinePass() {
      return outlinePass;
    },
    postprocessPipeline,
    renderer,
    ensureOutlinePass() {
      if (disposed) return null;
      if (outlinePass) return outlinePass;
      outlinePass = createOutlinePass(new Vector2(currentWidth, currentHeight), homeScene, camera);
      outlinePass.edgeStrength = 2;
      outlinePass.edgeThickness = 1;
      outlinePass.visibleEdgeColor.set(0xd9a46d);
      outlinePass.hiddenEdgeColor.set(0x4b403f);
      outlinePass.enabled = false;
      composer.addPass(outlinePass);
      return outlinePass;
    },
    setFilmTreatment(active) {
      if (disposed) return false;
      filmLighting = Boolean(active);
      applyLightingTreatment();
      postprocessPipeline.setFilmTreatment?.(filmLighting);
      if (!filmLighting) {
        sunLight.position.copy(originalSunPosition);
        sunLight.target.position.copy(originalSunTarget);
        Object.assign(sunLight.shadow.camera, originalShadow);
        sunLight.shadow.camera.updateProjectionMatrix();
        shadowKey = "";
      }
      return true;
    },
    focusFilmShadow(target, radius) {
      if (disposed || !filmLighting) return;
      // The floor used to track the shot's own tight subject radius (e.g. ~12
      // for a close detail shot), but a shadow camera that small doesn't
      // cover the visible ground in a wide, low, grazing-angle frame — the
      // area outside its frustum defaults to lit/unlit at the frustum edge's
      // clamped depth-texture value, rendering as a hard-edged dark wedge
      // across the ground with no relation to any real occluder. A wide
      // floor costs some shadow resolution on the near subject (already
      // heavily softened by the film shadow radius) but removes that cutoff.
      const extent = Math.max(32, Math.min(48, radius + 8));
      const key = [...target.toArray(), extent].join(",");
      if (key === shadowKey) return;
      shadowKey = key;
      sunLight.target.position.copy(target);
      sunLight.position.copy(target).add(sunOffset);
      sunLight.target.updateMatrixWorld();
      const shadow = sunLight.shadow.camera;
      shadow.left = shadow.bottom = -extent;
      shadow.right = shadow.top = extent;
      shadow.updateProjectionMatrix();
      sunLight.shadow.needsUpdate = true;
    },
    setGroundedLighting(active) {
      if (disposed) return false;
      groundedLighting = Boolean(active);
      applyLightingTreatment();
      return true;
    },
    applyQuality(nextProfile, { pixelRatio } = {}) {
      if (disposed) return false;
      homeScene.fog.near = nextProfile.lighting.fogNear;
      homeScene.fog.far = nextProfile.lighting.fogFar;
      baselineAmbientIntensity = nextProfile.lighting.ambientIntensity;
      baselineHemisphereIntensity = nextProfile.lighting.hemisphereIntensity;
      baselineKeyIntensity = nextProfile.lighting.directionalIntensity;
      if (Number.isFinite(nextProfile.lighting.fillIntensity)) {
        baselineFillIntensity = nextProfile.lighting.fillIntensity;
      }
      applyLightingTreatment();
      fillLight.visible = Boolean(nextProfile.lighting.extraDirectional);
      renderer.shadowMap.enabled = Boolean(nextProfile.shadows.enabled);
      sunLight.castShadow = Boolean(nextProfile.shadows.enabled);
      if (nextProfile.shadows.enabled && nextProfile.shadows.mapSize > 0) {
        sunLight.shadow.mapSize.width = nextProfile.shadows.mapSize;
        sunLight.shadow.mapSize.height = nextProfile.shadows.mapSize;
        sunLight.shadow.needsUpdate = true;
      }
      if (Number.isFinite(pixelRatio)) renderer.setPixelRatio(pixelRatio);
      postprocessPipeline.setQualityProfile(nextProfile);
      return true;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      renderer.domElement?.removeEventListener?.("webglcontextlost", handleContextLost);
      renderer.domElement?.removeEventListener?.("webglcontextrestored", handleContextRestored);
      if (outlinePass) {
        outlinePass.enabled = false;
        outlinePass.selectedObjects = [];
      }
      disposeResult = disposeResources({
        postprocessPipeline,
        renderer,
        renderTargets: [...renderTargets],
        scene: homeScene,
      });
      renderTargets.clear();
      return disposeResult;
    },
    resize({ cameraFov, height: nextHeight, width: nextWidth }) {
      if (disposed) return false;
      currentHeight = nextHeight;
      currentWidth = nextWidth;
      if (Number.isFinite(cameraFov)) camera.fov = cameraFov;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
      composer.setSize(nextWidth, nextHeight);
      postprocessPipeline.resize?.(nextWidth, nextHeight);
      outlinePass?.setSize(nextWidth, nextHeight);
      return true;
    },
    trackRenderTarget(renderTarget) {
      if (!disposed && renderTarget) renderTargets.add(renderTarget);
      return renderTarget;
    },
    update({ render = true } = {}) {
      if (disposed) return false;
      if (render) composer.render();
      return true;
    },
  };

  return rendering;
}
