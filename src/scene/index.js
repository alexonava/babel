import { readTourInterval, createCameraTour, createTourControls } from "./camera-tour.js";
import { wantsFilmTreatment } from "./directed-shots.js";
import { createFilmScene } from "./film-scene.js";
import { chooseCinematicView, chooseCinematicAngle, cinematicSafeArea, createCinematicCamera, createQuietScene } from "./cinematic.js";
import { wantsMud, wantsPropScale, configureMudShading } from "./mud-ground.js";
import { createHillSilhouette } from "./hill-silhouette.js";
import { createPropScale } from "./prop-scale.js";
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  ClampToEdgeWrapping,
  Color,
  ColorManagement,
  CubeCamera,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Fog,
  Frustum,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  NoToneMapping,
  OctahedronGeometry,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  RepeatWrapping,
  RGBAFormat,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TetrahedronGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLCubeRenderTarget,
  WebGLRenderer,
} from "three";
import { createBrickDetailController } from "./brick-detail.js";
import { createArchitectureAssetController } from "./architecture-assets.js";
import { createCompleteTowerArchitecture, createTowerArchitecture, createTreeArchitecture } from "./architecture.js";
import { createSceneAtmosphere } from "./atmosphere.js";
import { createSceneEnvironment } from "./environment.js";
import { createSceneRendering } from "./rendering.js";
import { createWatchtowerRefinement, wantsGroundedWatchtower } from "./watchtower-refinement.js";
import {
  createSceneFrameScheduler,
  createSceneResizeController,
  hasMeaningfulScalarChange,
} from "./runtime.js";
import {
  createSceneSubsystemRegistry,
  runSceneInitialization,
} from "./subsystem.js";
import { createSceneTower } from "./tower.js";
// Reconstruct a namespace object for dependency injection into sub-modules
// that receive THREE as a parameter (scene/visibility.js, scene/textures.js,
// scene/dev-mode.js, etc.) and for the dynamic-name lookup used by
// getThreeExport. Explicit allow-list lets esbuild prove the set instead of
// pulling all of three/* through `import * as`.
const THREE = {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  ClampToEdgeWrapping,
  Color,
  ColorManagement,
  CubeCamera,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Fog,
  Frustum,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  NoToneMapping,
  OctahedronGeometry,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  RepeatWrapping,
  RGBAFormat,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TetrahedronGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLCubeRenderTarget,
  WebGLRenderer,
};

// r128-parity color / light pipeline. ColorManagement.enabled=true (the r152+
// default) treats material+light hex colors as sRGB and converts to linear
// before shading, which shifts every color in the scene. Disabling it when the
// API is available matches the pre-r152 workflow the scene was designed
// against. The renderer init also sets _useLegacyLights (the internal field
// js reads) to keep light intensities on pre-r155 units — the public
// .useLegacyLights accessor logs a deprecation warning on every get, so we
// bypass it.
function getThreeExport(name) {
  return Object.prototype.hasOwnProperty.call(THREE, name) ? THREE[name] : undefined;
}
const colorManagement = getThreeExport("ColorManagement");
if (colorManagement) colorManagement.enabled = false;
function setSrgbTexture(texture) {
  const srgbColorSpace = getThreeExport("SRGBColorSpace");
  const srgbEncoding = getThreeExport("sRGBEncoding");
  if (srgbColorSpace && "colorSpace" in texture) {
    texture.colorSpace = srgbColorSpace;
  } else if (srgbEncoding && "encoding" in texture) {
    texture.encoding = srgbEncoding;
  }
  return texture;
}

(() => {
  const site = (window.BabelSite = window.BabelSite || {}),
    scene = (site.scene = site.scene || {}),
    {
      clamp01: clamp01,
      groundHeight: groundHeight,
      smoothstep01: smoothstep01,
      supportsWebGL: supportsWebGL,
      wrappedDistance: wrappedDistance,
      wrap01: wrap01,
      GROUND_SURFACE_MATERIAL: GROUND_SURFACE_MATERIAL,
      TOWER_SURFACE_MATERIALS: TOWER_SURFACE_MATERIALS,
      PLANT_PALETTE: plantPalette,
      createGroundTextures: createGroundTextures,
      createMarbleTextures: createMarbleTextures,
      createTowerTextures: createTowerTextures,
      createGroundOverlayTexture: createGroundOverlayTexture,
      WORLD: WORLD,
    } = scene;
  scene.initHomeScene = function () {
    const container = document.getElementById("home-scene");
    if (!container || !supportsWebGL()) return false;
    // Boot order:
    // 1. Renderer + fixed composition
    // 2. Camera-following atmosphere layers
    // 3. Scroll-driven animation loop
    let frameScheduler = null;
    let reflectionCaptureFrame = null;
    let reflectionRenderTarget = null;
    let runtimeDisposed = false;
    let sceneReadyMarked = false;
    const quietObjects = [];
    const filmEnabled = wantsFilmTreatment(window.location.search);
    let filmActive = false, filmScene = null;
    const groundRepeats = new WeakMap();
    const quietSetting = !["classic", "assembled"].includes(new URLSearchParams(location.search).get("architecture")) && new URLSearchParams(location.search).get("setting") !== "previous";
    let webglContextAvailable = true;
    const reducedMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = Boolean(reducedMotionMQ.matches);
    const fallbackProfile =
      typeof scene.getSceneQualityProfile === "function"
        ? scene.getSceneQualityProfile("high")
        : {
            tier: "high",
            isLow: false,
            antialias: true,
            anisotropy: {
              min: 1,
              max: 8,
            },
            counts: {
              orbitalGlowLayers: 3,
              haloSprites: 90,
              haloBands: 50,
              haloTwisters: 28,
              upperGlowSprites: 14,
              midCloudTextures: 8,
              midCloudSprites: 26,
              groundPlantSprites: 220,
              buttresses: 8,
              reliefBricks: 36,
              driftClouds: 16,
              emberClouds: 34,
              hazeClouds: 40,
              pulseClouds: 4,
              pulsePuffsPerCluster: 5,
              plumeColumns: 18,
              craterHaze: 7,
              marbleVeinCount: 16,
            },
            dprCap: 2,
            geometry: {
              circleSegments: 88,
              overlaySegments: 80,
              pointFieldCount: 210,
              marbleCanvasSize: 1024,
              skyHeightSegments: 14,
              skyWidthSegments: 24,
            },
            lighting: {
              ambientIntensity: 0.2,
              directionalIntensity: 3.25,
              fillIntensity: 0.46,
              extraDirectional: true,
              fogFar: 154,
              fogNear: 66,
              hemisphereIntensity: 0.62,
              practicalIntensityScale: 1.08,
              towerLightIntensityScale: 1,
            },
            postprocessBloom: true,
            postprocessGrading: true,
            postprocessGrain: true,
            postprocessSettings: {
              bloomStrength: 0.2,
              celMix: 0.24,
              contrast: 1.1,
              grainStrength: 0.018,
              highlightWarmMix: 0.2,
              shadowCoolMix: 0.34,
              vignetteStrength: 0.12,
            },
            postprocessVignette: true,
            shadows: {
              enabled: true,
              mapSize: 1536,
            },
            textures: {
              cloudAtlasSize: 512,
              groundSize: 1024,
              marbleCanvasSize: 1024,
              overlaySize: 512,
              towerWidth: 1280,
            },
          };
    const fallbackComposition =
      typeof scene.getSceneCompositionProfile === "function"
        ? scene.getSceneCompositionProfile({
            width: window.innerWidth,
            height: window.innerHeight,
          })
        : {
            camera: {
              fov: 48.52,
              heightBase: 21.9,
              heightScrollDelta: 0.9,
              lookAtBase: 11.68,
              lookAtScrollDelta: 2.1,
              orbitBase: window.innerWidth < 1100 ? 74.8 : 65.8,
              orbitScale: 1.14,
              orbitScrollDelta: 2.4,
              orbitTrim: 0.144,
            },
            cloudAnchorY: -7.5,
            name:
              window.innerWidth <= 760 && window.innerHeight > window.innerWidth
                ? "portraitPhone"
                : "desktop",
            sceneOffsetY: -7.5,
            towerScale: 1,
          };
    const qualityState =
      typeof scene.createSceneQualityState === "function"
        ? scene.createSceneQualityState({
            navigatorInfo: navigator,
            search: window.location?.search || "",
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
          })
        : {
            caps: {
              maxAnisotropy: 1,
              maxTextureSize: 0,
            },
            controls: {
              debug: false,
              overrideTier: null,
              requestedTier: "auto",
            },
            getProfile() {
              return fallbackProfile;
            },
            initialTier: fallbackProfile.tier,
            sample() {
              return null;
            },
          };
    const qualityControls = qualityState.controls || {
      debug: false,
      overrideTier: null,
      requestedTier: "auto",
    };
    const qualityDebug = qualityControls.debug ? (window.BabelSite.sceneDebug = {}) : null;
    function updateSceneDebug(extra = {}) {
      if (!qualityDebug) return;
      Object.assign(qualityDebug, {
        caps: qualityState.caps || null,
        initialTier: qualityState.initialTier || fallbackProfile.tier,
        overrideTier: qualityControls.overrideTier,
        requestedTier: qualityControls.requestedTier,
        tier: state.profile.tier,
        ...extra,
      });
    }
    let sceneIntersectionObserver = null;
    let sceneVisible = true;
    if (typeof IntersectionObserver === "function") {
      try {
        sceneIntersectionObserver = new IntersectionObserver(
          (entries) => {
            for (const ent of entries) {
              const nextVisible = ent.isIntersecting;
              if (nextVisible === sceneVisible) continue;
              sceneVisible = nextVisible;
              if (sceneVisible) frameScheduler?.resume();
            }
          },
          {
            threshold: 0,
          },
        );
        sceneIntersectionObserver.observe(container);
      } catch (_err) {
        sceneIntersectionObserver = null;
        sceneVisible = true;
      }
    }
    const state = {
        lowPower: fallbackProfile.isLow,
        profile: fallbackProfile,
      },
      skyWidthSegments = state.profile.geometry.skyWidthSegments,
      skyHeightSegments = state.profile.geometry.skyHeightSegments,
      circleSegments = state.profile.geometry.circleSegments,
      overlaySegments = state.profile.geometry.overlaySegments,
      upperGlowSpriteCount = 0,
      pointFieldCount = state.profile.geometry.pointFieldCount,
      lightingConfig = {
        fogColor: 0x2d3242,
        fogNear: state.profile.lighting.fogNear,
        fogFar: state.profile.lighting.fogFar,
        ambientColor: 0x9e9aa0,
        ambientIntensity: state.profile.lighting.ambientIntensity,
        hemisphereSkyColor: 0x596d96,
        hemisphereGroundColor: 0x20232f,
        hemisphereIntensity: state.profile.lighting.hemisphereIntensity,
        directionalColor: 0xf0bd78,
        directionalIntensity: state.profile.lighting.directionalIntensity,
        fillColor: 0x7486b5,
        fillIntensity: state.profile.lighting.fillIntensity ?? 0.46,
        directionalPosition: {
          x: 32,
          y: 28,
          z: 14,
        },
      },
      skyConfig = {
        skyTopColor: 0x181d2d,
        skyBottomColor: 0x4f4d55,
        skyGlowColor: 0xc0895d,
        sunDirection: new Vector3(...WORLD.SUN_DIRECTION).normalize(),
        sunColor: 0xdfb882,
        shellOpacity: 0.52,
      };
    const subsystemRegistry = createSceneSubsystemRegistry();
    const rendering = createSceneRendering({
      container,
      height: window.innerHeight,
      lighting: lightingConfig,
      onInvalidate() {
        frameScheduler?.invalidate();
      },
      onContextLost() {
        webglContextAvailable = false;
        sceneReadyMarked = false;
        container.classList?.remove("is-ready");
      },
      onContextRestored() {
        webglContextAvailable = true;
        sceneReadyMarked = false;
        frameScheduler?.resume();
      },
      profile: state.profile,
      threeExports: THREE,
      width: window.innerWidth,
      world: WORLD,
    });
    subsystemRegistry.register(rendering);
    return runSceneInitialization(subsystemRegistry, () => {
    const { camera, homeScene, renderer } = rendering;
    scene.cinematicSelection ??= chooseCinematicView(window.location.search);
    scene.cinematicAngle ??= chooseCinematicAngle(window.location.search, scene.cinematicSelection);
    let cinematicArea;
    const measureCinematicArea = (width, height) => cinematicSafeArea(width, height,
      document.getElementById("hero-minimal")?.getBoundingClientRect(), document.querySelector(".bottom-bar")?.getBoundingClientRect());
    const cinematic = createCinematicCamera({ camera, fog: homeScene.fog, selected: scene.cinematicSelection, angle: scene.cinematicAngle, film: filmEnabled,
      getSafeArea: (width, height) => cinematicArea || measureCinematicArea(width, height),
      getGroundY: (x, z) => groundHeight(x, z) + groundSurface.getWorldPosition(new Vector3()).y });
    subsystemRegistry.register(cinematic);
    const tourInterval = filmEnabled ? readTourInterval(window.location.search) : 0;
    const cameraTour = tourInterval ? createCameraTour({ camera: cinematic, interval: tourInterval,
      invalidate: () => frameScheduler?.invalidate() }) : null;
    if (cameraTour) subsystemRegistry.register(createTourControls({ tour: cameraTour, document,
      parent: document.getElementById("hero-minimal") }));
    function isLowPower() {
      return state.profile.isLow;
    }
    function chooseAnisotropy(arg53, arg54) {
      const tmpV26 = state.profile.anisotropy || {
        min: arg53,
        max: arg54,
      };
      const result84 = Math.max(arg53, tmpV26.min ?? arg53);
      const result85 = Math.min(arg54, tmpV26.max ?? arg54);
      return Math.max(
        1,
        Math.min(renderer.capabilities.getMaxAnisotropy(), state.lowPower ? result84 : result85),
      );
    }
    function createMarbleMaterial(textures = {}) {
      return new MeshStandardMaterial({
        color: 0xffffff,
        map: textures.colorMap || null,
        bumpMap: textures.bumpMap || null,
        bumpScale: 0.05,
        roughness: 0.35,
        metalness: 0.05,
      });
    }
    scene.createMarbleMaterial = createMarbleMaterial;
    const visibilityTracker =
      typeof scene.createSceneVisibilityTracker === "function"
        ? scene.createSceneVisibilityTracker({
            THREE,
            camera: camera,
            getVisibleDistance() {
              return Math.min(camera.far, homeScene.fog?.far ?? camera.far);
            },
          })
        : null;
    // Cached at composition-change time so the per-frame getProfileCount calls
    // (~10/frame across decorative systems) don't pay a try/catch boundary or
    // a property-chain walk just to read this scalar.
    let currentCountScale = 1;
    function refreshCountScaleCache() {
      const candidate = compositionState?.profile?.countScale;
      currentCountScale = typeof candidate === "number" ? candidate : 1;
    }
    function getProfileCount(key, fallback) {
      const value = state.profile.counts?.[key];
      const base = typeof value === "number" ? value : fallback;
      if (typeof base !== "number") return base;
      // Composition profile can trim active counts on small viewports where
      // fog already hides most of the affected particles.
      return Math.max(0, Math.floor(base * currentCountScale));
    }
    function setRecordVisibility(records, active, limit = records.length) {
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        const visible = active && index < limit;
        if (record.mesh) record.mesh.visible = visible;
        if (record.meshes) {
          record.meshes.forEach((mesh) => {
            mesh.visible = visible;
          });
        }
      }
    }
    function setShadowParticipation(target, { cast = false, receive = false } = {}) {
      if (!target || typeof target.traverse !== "function") return;
      target.traverse((node) => {
        if ("castShadow" in node) node.castShadow = cast;
        if ("receiveShadow" in node) node.receiveShadow = receive;
      });
    }
    function applyActiveQualityProfile(profile, reason = "runtime") {
      state.profile = profile || fallbackProfile;
      state.lowPower = state.profile.isLow;
      const effectiveCap =
        typeof qualityState.resolveDprCap === "function"
          ? qualityState.resolveDprCap(state.profile)
          : typeof scene.resolveEffectiveDprCap === "function"
            ? scene.resolveEffectiveDprCap(state.profile, {
                caps: qualityState.caps || {},
                touchPrimary: qualityState.touchPrimary,
                navigatorInfo: qualityState.navigatorInfo || navigator,
              })
            : state.profile.dprCap || 1;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, effectiveCap || 1);
      subsystemRegistry.applyQuality(state.profile, { pixelRatio });
      updateSceneDebug({
        reason,
        pixelRatio,
      });
    }
    const sceneRoot = new Group();
    homeScene.add(sceneRoot);
    const atmosphereSystem = createSceneAtmosphere({
      onInvalidate() {
        frameScheduler?.invalidate();
      },
      parent: homeScene,
      profile: state.profile,
      qualityDebug,
      visibilityTracker,
    });
    subsystemRegistry.register(atmosphereSystem);
    const registerDecorativeSystem = atmosphereSystem.registerDecorativeSystem;
    scene.setClouds = (on) => atmosphereSystem.setClouds(on);
    scene.toggleClouds = () => atmosphereSystem.toggleClouds();
    applyActiveQualityProfile(
      typeof qualityState.getProfile === "function" ? qualityState.getProfile() : fallbackProfile,
      "initial",
    );
    const skyShell = new Mesh(
      new SphereGeometry(WORLD.SKY_DOME_RADIUS, skyWidthSegments, skyHeightSegments),
      new ShaderMaterial({
        side: BackSide,
        transparent: !0,
        uniforms: {
          topColor: {
            value: new Color(skyConfig.skyTopColor),
          },
          bottomColor: {
            value: new Color(skyConfig.skyBottomColor),
          },
          glowColor: {
            value: new Color(skyConfig.skyGlowColor),
          },
          sunDirection: {
            value: skyConfig.sunDirection,
          },
          sunColor: {
            value: new Color(skyConfig.sunColor),
          },
          uTime: {
            value: 0,
          },
        },
        vertexShader: [
          "varying vec3 vWorldPosition;",
          "void main() {",
          "  vec4 worldPosition = modelMatrix * vec4(position, 1.0);",
          "  vWorldPosition = worldPosition.xyz;",
          "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
          "}",
        ].join("\n"),
        fragmentShader: [
          "uniform vec3 topColor;",
          "uniform vec3 bottomColor;",
          "uniform vec3 glowColor;",
          "uniform vec3 sunDirection;",
          "uniform vec3 sunColor;",
          "uniform float uTime;",
          "varying vec3 vWorldPosition;",
          "void main() {",
          "  float h = normalize(vWorldPosition + vec3(0.0, 40.0, 0.0)).y;",
          "  float t = smoothstep(-0.2, 0.7, h);",
          "  vec3 col = mix(bottomColor, topColor, t);",
          "  float glow = smoothstep(0.02, 0.7, 1.0 - distance(normalize(vWorldPosition).xz, vec2(0.0)));",
          "  col += glowColor * glow * 0.031;",
          "  float sunDot = max(0.0, dot(normalize(vWorldPosition), sunDirection));",
          "  float sunGlow = pow(sunDot, 8.0) * 0.225 + pow(sunDot, 32.0) * 0.152;",
          "  col += sunColor * sunGlow;",
          "  vec3 nDir = normalize(vWorldPosition);",
          "  vec2 starUV = nDir.xz / (abs(nDir.y) + 0.5) * 90.0;",
          "  vec2 cell = floor(starUV);",
          "  vec2 fr = fract(starUV) - 0.5;",
          "  float starHash = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);",
          "  float starBright = step(0.965, starHash) * smoothstep(0.14, 0.0, length(fr));",
          "  starBright *= smoothstep(0.0, 0.4, h);",
          "  float twinkleHash = fract(sin(dot(cell, vec2(269.5, 183.3))) * 61537.17);",
          "  float twinkle = step(0.7, twinkleHash);",
          "  float twinkleSpeed = 1.5 + twinkleHash * 3.0;",
          "  float twinklePhase = twinkleHash * 6.2832;",
          "  float twinkleAmt = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * twinkleSpeed + twinklePhase));",
          "  starBright *= mix(1.0, twinkleAmt, twinkle);",
          "  col += vec3(1.0, 0.95, 0.88) * starBright * 0.73;",
          `  gl_FragColor = vec4(col, ${skyConfig.shellOpacity});`,
          "}",
        ].join("\n"),
      }),
    );
    ((skyShell.renderOrder = -1),
      (skyShell.material.depthWrite = !1),
      atmosphereSystem.root.add(skyShell));
    var moonPosition = new Vector3(...WORLD.MOON_POSITION),
      orbitalGlowGroup = new Group();
    function createOrbitalGlowTexture(arg55, arg56, arg57, arg58) {
      var canvas = document.createElement("canvas");
      ((canvas.width = arg55), (canvas.height = arg55));
      var ctx = canvas.getContext("2d"),
        num405 = arg55 / 2,
        num406 = arg55 / 2;
      (ctx.beginPath(),
        ctx.arc(num405, num406, num405, 0, 2 * Math.PI),
        ctx.closePath(),
        ctx.clip());
      var gradient8 = ctx.createRadialGradient(num405, num406, 0, num405, num406, num405);
      (gradient8.addColorStop(0, "rgba(" + arg56 + "," + arg57 + "," + arg58 + ",0.7)"),
        gradient8.addColorStop(
          0.18,
          "rgba(" +
            arg56 +
            "," +
            Math.floor(0.7 * arg57) +
            "," +
            Math.floor(0.6 * arg58) +
            ",0.35)",
        ),
        gradient8.addColorStop(
          0.38,
          "rgba(" +
            Math.floor(0.85 * arg56) +
            "," +
            Math.floor(0.4 * arg57) +
            "," +
            Math.floor(0.3 * arg58) +
            ",0.14)",
        ),
        gradient8.addColorStop(
          0.6,
          "rgba(" + Math.floor(0.65 * arg56) + "," + Math.floor(0.2 * arg57) + ",0,0.04)",
        ),
        gradient8.addColorStop(0.85, "rgba(30,2,0,0.01)"),
        gradient8.addColorStop(1, "rgba(0,0,0,0)"),
        (ctx.fillStyle = gradient8),
        ctx.fillRect(0, 0, arg55, arg55));
      var canvasTexture = new CanvasTexture(canvas);
      return (setSrgbTexture(canvasTexture), canvasTexture);
    }
    (orbitalGlowGroup.position.copy(moonPosition), atmosphereSystem.root.add(orbitalGlowGroup));
    var sprite15 = new Sprite(
      new SpriteMaterial({
        map: createOrbitalGlowTexture(256, 200, 60, 10),
        color: 16728096,
        transparent: !0,
        opacity: 0.5,
        depthWrite: !1,
        depthTest: !0,
        fog: !1,
      }),
    );
    (sprite15.scale.set(26, 26, 1), (sprite15.renderOrder = 98), (sprite15.visible = !1));
    var sprite16 = new Sprite(
      new SpriteMaterial({
        map: createOrbitalGlowTexture(256, 255, 180, 60),
        color: 16752688,
        transparent: !0,
        opacity: 0.8,
        depthWrite: !1,
        depthTest: !0,
        fog: !1,
        blending: AdditiveBlending,
      }),
    );
    (sprite16.scale.set(17, 17, 1), (sprite16.renderOrder = 101), (sprite16.visible = !1));
    var spriteMaterial = new SpriteMaterial({
        map: (function (arg59) {
          var canvas2 = document.createElement("canvas");
          ((canvas2.width = arg59), (canvas2.height = arg59));
          var ctx2 = canvas2.getContext("2d"),
            num407 = 256,
            num408 = 256;
          (ctx2.beginPath(),
            ctx2.arc(num407, num408, 256, 0, 2 * Math.PI),
            ctx2.closePath(),
            ctx2.clip());
          var gradient9 = ctx2.createRadialGradient(num407, num408, 0, num407, num408, 256);
          (gradient9.addColorStop(0, "#ffffff"),
            gradient9.addColorStop(0.12, "#fffde0"),
            gradient9.addColorStop(0.25, "#ffeba8"),
            gradient9.addColorStop(0.4, "#ffc050"),
            gradient9.addColorStop(0.55, "#ff9928"),
            gradient9.addColorStop(0.67, "rgba(240,90,15,0.6)"),
            gradient9.addColorStop(0.78, "rgba(200,50,5,0.2)"),
            gradient9.addColorStop(0.88, "rgba(100,20,0,0.04)"),
            gradient9.addColorStop(1, "rgba(0,0,0,0)"),
            (ctx2.fillStyle = gradient9),
            ctx2.fillRect(0, 0, arg59, arg59));
          for (var num409 = 0; num409 < 400; num409++) {
            var num410 = Math.random() * Math.PI * 2,
              num411 = 256 * Math.random() * 0.45,
              num412 = num407 + Math.cos(num410) * num411,
              num413 = num408 + Math.sin(num410) * num411,
              num414 = 2 + 10 * Math.random(),
              gradient10 = ctx2.createRadialGradient(num412, num413, 0, num412, num413, num414),
              result86 = Math.random();
            (result86 > 0.55
              ? (gradient10.addColorStop(
                  0,
                  "rgba(255,255,230," + (0.08 + 0.14 * Math.random()) + ")",
                ),
                gradient10.addColorStop(1, "rgba(255,220,140,0)"))
              : result86 > 0.25
                ? (gradient10.addColorStop(
                    0,
                    "rgba(200,70,8," + (0.06 + 0.1 * Math.random()) + ")",
                  ),
                  gradient10.addColorStop(1, "rgba(160,40,0,0)"))
                : (gradient10.addColorStop(0, "rgba(60,15,0," + (0.1 + 0.12 * Math.random()) + ")"),
                  gradient10.addColorStop(1, "rgba(80,20,0,0)")),
              (ctx2.fillStyle = gradient10),
              ctx2.fillRect(num412 - num414, num413 - num414, 2 * num414, 2 * num414));
          }
          var gradient11 = ctx2.createRadialGradient(num407, num408, 153.6, num407, num408, 235.52);
          (gradient11.addColorStop(0, "rgba(0,0,0,0)"),
            gradient11.addColorStop(1, "rgba(120,30,0,0.25)"),
            (ctx2.fillStyle = gradient11),
            ctx2.fillRect(0, 0, arg59, arg59));
          var canvasTexture2 = new CanvasTexture(canvas2);
          return (setSrgbTexture(canvasTexture2), canvasTexture2);
        })(512),
        color: 16777215,
        transparent: !0,
        opacity: 1,
        depthWrite: !1,
        depthTest: !0,
        fog: !1,
      }),
      sprite17 = new Sprite(spriteMaterial);
    function tmpV57(arg60, arg61) {
      var canvas3 = document.createElement("canvas");
      ((canvas3.width = arg60), (canvas3.height = arg60));
      var ctx3 = canvas3.getContext("2d"),
        num415 = arg60 / 2;
      (ctx3.beginPath(),
        ctx3.arc(num415, num415, num415, 0, 2 * Math.PI),
        ctx3.closePath(),
        ctx3.clip());
      var num416 = 0.03 * Math.sin(7.3 * arg61) * arg60,
        num417 = 0.03 * Math.cos(5.1 * arg61) * arg60,
        gradient12 = ctx3.createRadialGradient(
          num415 + num416,
          num415 + num417,
          0,
          num415,
          num415,
          num415,
        );
      (gradient12.addColorStop(0, "rgba(255,255,235,1.0)"),
        gradient12.addColorStop(0.15, "rgba(255,230,130,0.85)"),
        gradient12.addColorStop(0.35, "rgba(255,170,40,0.5)"),
        gradient12.addColorStop(0.55, "rgba(240,90,10,0.22)"),
        gradient12.addColorStop(0.78, "rgba(160,30,0,0.06)"),
        gradient12.addColorStop(1, "rgba(0,0,0,0)"),
        (ctx3.fillStyle = gradient12),
        ctx3.fillRect(0, 0, arg60, arg60));
      var canvasTexture3 = new CanvasTexture(canvas3);
      return (setSrgbTexture(canvasTexture3), canvasTexture3);
    }
    (sprite17.scale.set(6, 6, 1), (sprite17.renderOrder = 100), orbitalGlowGroup.add(sprite17));
    for (var arr7 = [], num497 = 0; num497 < 4; num497++) arr7.push(tmpV57(64, 3.7 * num497 + 1));
    for (
      var arr8 = [16777215, 16774352, 16763972, 16755232, 16746512, 16733440, 15610624],
        arr9 = [],
        haloSprites = state.profile.counts.haloSprites,
        haloBands = state.profile.counts.haloBands,
        num498 = haloSprites + haloBands + state.profile.counts.haloTwisters,
        num499 = 0;
      num499 < num498;
      num499++
    ) {
      var num500 = 97.3 * num499 + 13,
        tmpV58 = num499 < haloSprites ? 0 : num499 < haloSprites + haloBands ? 1 : 2,
        tmpV59 =
          0 === tmpV58
            ? Math.floor(3 * Math.abs(Math.sin(1.3 * num500)))
            : 1 === tmpV58
              ? 2 + Math.floor(3 * Math.abs(Math.sin(2.7 * num500)))
              : 4 + Math.floor(3 * Math.abs(Math.sin(2.7 * num500))),
        sprite18 = new Sprite(
          new SpriteMaterial({
            map: arr7[num499 % 4],
            color: arr8[Math.min(tmpV59, 6)],
            transparent: !0,
            opacity: 0 === tmpV58 ? 0.55 : 1 === tmpV58 ? 0.42 : 0.3,
            depthWrite: !1,
            depthTest: !0,
            fog: !1,
            blending: AdditiveBlending,
          }),
        );
      ((sprite18.renderOrder = 2 - tmpV58 + 103), orbitalGlowGroup.add(sprite18));
      var result98 = Math.abs(Math.sin(6.7 * num500)),
        result99 = Math.abs(Math.sin(1.37 * num500));
      arr9.push({
        sprite: sprite18,
        layer: tmpV58,
        theta: (num499 / num498) * Math.PI * 2 * 3.7 + 2 * Math.sin(num500),
        phi: Math.acos(1 - 2 * result99),
        orbitRadius:
          0 === tmpV58
            ? 0.8 + 1.5 * Math.abs(Math.sin(2.1 * num500))
            : 1 === tmpV58
              ? 2 + 2 * Math.abs(Math.sin(2.1 * num500))
              : 3.5 + 2 * Math.abs(Math.sin(2.1 * num500)),
        orbitSpeed:
          0 === tmpV58
            ? 0.2 + 0.5 * Math.abs(Math.sin(1.4 * num500))
            : 1 === tmpV58
              ? 0.1 + 0.3 * Math.abs(Math.sin(1.4 * num500))
              : 0.04 + 0.18 * Math.abs(Math.sin(1.4 * num500)),
        wobbleAmp:
          0 === tmpV58
            ? 0.15 + 0.4 * Math.abs(Math.sin(3.2 * num500))
            : 0.3 + 1 * Math.abs(Math.sin(3.2 * num500)),
        wobbleFreq: 0.8 + 2 * Math.abs(Math.sin(0.8 * num500)),
        baseScale:
          0 === tmpV58
            ? 0.3 + 0.5 * Math.abs(Math.sin(1.9 * num500))
            : 1 === tmpV58
              ? 0.5 + 1 * Math.abs(Math.sin(1.9 * num500))
              : 0.8 + 1.4 * Math.abs(Math.sin(1.9 * num500)),
        phase: (1.618 * num500) % (2 * Math.PI),
        wobble2Amp: 0.1 + 0.5 * Math.abs(Math.sin(5.1 * num500)),
        wobble2Freq: 1.2 + 2.5 * Math.abs(Math.sin(2.9 * num500)),
        violenceAmp: 0.45 + 0.9 * result98,
        violenceFreq: 0.22 + 0.38 * result98,
        violencePhase: 2.3 * num500,
        colorSpeed: 0.15 + 0.35 * Math.abs(Math.sin(3.8 * num500)),
        colorPhase: (0.73 * num500) % (2 * Math.PI),
      });
    }
    var vector3 = new Vector3(),
      vector32 = new Vector3(),
      vector33 = new Vector3();
    function tmpV60(arg62, arg63, arg64, arg65, arg66) {
      for (var arr5 = [], num418 = 0; num418 <= arg66; num418++) {
        var num419 = num418 / arg66,
          num420 = arg62 + (num419 - 0.5) * arg64,
          num421 = 8.3 + Math.pow(Math.sin(num419 * Math.PI), 0.7) * arg63,
          num422 = Math.cos(num420) * num421,
          num423 = Math.sin(num420) * num421,
          tmpV27 = num419 > 0.6 ? 2.5 * (num419 - 0.6) * arg63 * 0.3 : 0,
          num424 =
            Math.sin(num419 * Math.PI) * Math.sin(arg65) * arg63 * 0.5 + tmpV27 * Math.cos(arg65);
        arr5.push(new Vector3(num422, num423, num424));
      }
      return arr5;
    }
    for (
      var arr10 = [], orbitalGlowLayers = state.profile.counts.orbitalGlowLayers, num501 = 0;
      num501 < orbitalGlowLayers;
      num501++
    ) {
      for (
        var num502 = 137.5 * num501 + 42,
          fn4 = function (arg) {
            return Math.abs(Math.sin(arg));
          },
          num503 = (num501 / orbitalGlowLayers) * Math.PI * 2 + 0.5 * Math.sin(num502),
          num504 = 6 + 10 * fn4(2.3 * num502),
          num505 = 0.4 + 0.6 * fn4(1.1 * num502),
          num506 = 1.4 * (Math.sin(3.7 * num502) - 0.5),
          num507 = 0.12 + 0.18 * fn4(1.7 * num502),
          eeResult = tmpV60(num503, num504, num505, num506, 20),
          catmullRomCurve3 = new CatmullRomCurve3(eeResult),
          tubeGeometry = new TubeGeometry(catmullRomCurve3, 24, num507, 4, !1),
          arr11 = [],
          arr12 = [],
          position8 = tubeGeometry.attributes.position,
          num508 = 0;
        num508 < position8.count;
        num508++
      ) {
        var result100 = position8.getX(num508),
          result101 = position8.getY(num508),
          result102 = position8.getZ(num508),
          result103 = Math.sqrt(
            result100 * result100 + result101 * result101 + result102 * result102,
          ),
          result104 = clamp01((result103 - 8) / (num504 + 1));
        (arr12.push(result104), arr11.push(1, 0.98 - 0.65 * result104, 0.75 - 0.7 * result104));
      }
      tubeGeometry.setAttribute("color", new Float32BufferAttribute(arr11, 3));
      var sliceResult = arr11.slice(),
        meshBasicMaterial = new MeshBasicMaterial({
          vertexColors: !0,
          transparent: !0,
          opacity: 0,
          depthWrite: !1,
          depthTest: !0,
          fog: !1,
          blending: AdditiveBlending,
          side: DoubleSide,
        }),
        mesh35 = new Mesh(tubeGeometry, meshBasicMaterial);
      ((mesh35.renderOrder = 102),
        orbitalGlowGroup.add(mesh35),
        arr10.push({
          mesh: mesh35,
          geo: tubeGeometry,
          heightFracs: arr12,
          baseColors: sliceResult,
          phase: 7 * num501,
          growTime: 0.8 + 0.6 * fn4(0.9 * num502),
          holdTime: 1.5 + 1.5 * fn4(1.3 * num502),
          shrinkTime: 1.2 + 0.8 * fn4(2.1 * num502),
          pauseTime: 7 + 5 * fn4(0.5 * num502),
          noReturn: fn4(4.1 * num502) > 0.6,
        }));
    }
    const haloSystem = registerDecorativeSystem({
      getCenter(target) {
        return target.copy(moonPosition);
      },
      group: orbitalGlowGroup,
      importance: "midAtmosphere",
      name: "halo",
      radius: 42,
    });
    setShadowParticipation(orbitalGlowGroup);
    const environmentSystem = createSceneEnvironment({
      groundHeight,
      parent: sceneRoot,
      profile: state.profile,
    });
    subsystemRegistry.register(environmentSystem);
    let classicTree = null;
    const group4 = environmentSystem.root;
    const circleGeometry = new CircleGeometry(WORLD.GROUND_RADIUS, circleSegments, 0, 2 * Math.PI),
      position9 = circleGeometry.attributes.position;
    for (let num425 = 0; num425 < position9.count; num425 += 1) {
      const result56 = position9.getX(num425),
        result57 = position9.getY(num425);
      // CircleGeometry's local +Y becomes world -Z after its -X quarter turn.
      // Sample in world coordinates so fallback assets seat on this surface.
      position9.setZ(num425, groundHeight(result56, -result57));
    }
    circleGeometry.computeVertexNormals();
    let groundSurface = null;
    let groundOverlay = null;
    let currentGroundMuddy = false;
    let currentGrass = null;
    const result105 = createGroundTextures({
        THREE: THREE,
        lowPower: state.lowPower,
        qualityProfile: state.profile,
        chooseAnisotropy: chooseAnisotropy,
        search: window.location?.search || "",
        onDetailStatus(status) {
          if (qualityDebug) qualityDebug.ground = status;
        },
        onGrassStatus(status) {
          if (qualityDebug) qualityDebug.grass = status;
        },
        onGrassChange(grassDetail) {
          currentGrass = grassDetail;
          const material = groundSurface?.material;
          if (!material) return;
          configureMudShading(material, currentGroundMuddy, quietSetting, filmActive, currentGrass);
          frameScheduler?.invalidate();
        },
        onDetailChange({ colorMap, normalMap, normalScale, bumpMap, roughnessMap = null, muddy = false, earth = false }) {
          const material = groundSurface?.material;
          if (!material) return;
          currentGroundMuddy = muddy;
          if (qualityDebug) qualityDebug.groundTreatment = muddy ? "mud" : "baseline";
          configureMudShading(material, muddy, quietSetting, filmActive, currentGrass);
          for (const texture of [colorMap, normalMap, roughnessMap, bumpMap].filter(Boolean)) {
            if (!groundRepeats.has(texture)) groundRepeats.set(texture, texture.repeat.clone());
            texture.repeat.copy(groundRepeats.get(texture)).multiplyScalar(filmActive && !earth ? 384 / 176 : 1);
          }
          material.map = colorMap;
          material.roughnessMap = roughnessMap;
          material.roughness = muddy ? 1 : filmActive ? .93 : GROUND_SURFACE_MATERIAL.roughness;
          material.metalness = muddy || filmActive ? 0 : GROUND_SURFACE_MATERIAL.metalness;
          material.color.setHex(muddy ? 0xffffff : filmActive ? 0x615447 : GROUND_SURFACE_MATERIAL.color);
          if (groundOverlay) groundOverlay.material.opacity = muddy ? .22 : .92;
          material.bumpMap = bumpMap;
          material.normalMap = normalMap;
          material.normalScale.set(normalScale, normalScale);
          material.needsUpdate = true;
          frameScheduler?.invalidate();
        },
      }),
      mesh36 = new Mesh(
        circleGeometry,
        new MeshStandardMaterial({
          color: GROUND_SURFACE_MATERIAL.color,
          map: result105.colorMap,
          bumpMap: result105.bumpMap,
          bumpScale: state.lowPower
            ? GROUND_SURFACE_MATERIAL.bumpScale.lowPower
            : GROUND_SURFACE_MATERIAL.bumpScale.default,
          roughness: GROUND_SURFACE_MATERIAL.roughness,
          metalness: GROUND_SURFACE_MATERIAL.metalness,
        }),
      );
    ((mesh36.rotation.x = -Math.PI / 2),
      (mesh36.receiveShadow = !state.lowPower),
      group4.add(mesh36));
    groundSurface = mesh36;
    subsystemRegistry.register(result105);
    const hillSilhouette = createHillSilhouette({ groundHeight });
    group4.add(hillSilhouette.mesh);
    subsystemRegistry.register(hillSilhouette);
    if (createGroundOverlayTexture) {
      const createGroundOverlayTextureResult = createGroundOverlayTexture({
        THREE: THREE,
        lowPower: state.lowPower,
        qualityProfile: state.profile,
      });
      if (createGroundOverlayTextureResult) {
        const overlayGeom = new CircleGeometry(
            WORLD.GROUND_OVERLAY_RADIUS,
            state.profile.geometry.overlaySegments,
          ),
          overlayPos = overlayGeom.attributes.position;
        for (let num47 = 0; num47 < overlayPos.count; num47 += 1) {
          const result = overlayPos.getX(num47),
            result2 = overlayPos.getY(num47);
          overlayPos.setZ(num47, groundHeight(result, -result2) + 0.04);
        }
        overlayPos.needsUpdate = !0;
        const mesh5 = new Mesh(
          overlayGeom,
          new MeshBasicMaterial({
            map: createGroundOverlayTextureResult,
            transparent: !0,
            opacity: 0.92,
            depthWrite: !1,
          }),
        );
        groundOverlay = mesh5;
        ((mesh5.rotation.x = -Math.PI / 2), (mesh5.renderOrder = 1), group4.add(mesh5));
      }
    }
    const num509 = Math.atan2(18, 24) + Math.PI,
      group5 = new Group(),
      arr13 = [
        new MeshStandardMaterial({
          color: 9079432,
          roughness: 0.92,
          metalness: 0.02,
        }),
        new MeshStandardMaterial({
          color: 8026744,
          roughness: 0.95,
          metalness: 0.01,
        }),
        new MeshStandardMaterial({
          color: 10131605,
          roughness: 0.9,
          metalness: 0.03,
        }),
        new MeshStandardMaterial({
          color: 11048056,
          roughness: 0.94,
          metalness: 0.01,
        }),
        new MeshStandardMaterial({
          color: 12099720,
          roughness: 0.88,
          metalness: 0.02,
        }),
        new MeshStandardMaterial({
          color: 9337442,
          roughness: 0.96,
          metalness: 0.01,
        }),
        new MeshStandardMaterial({
          color: 6975608,
          roughness: 0.93,
          metalness: 0.04,
        }),
        new MeshStandardMaterial({
          color: 7896710,
          roughness: 0.91,
          metalness: 0.03,
        }),
        new MeshStandardMaterial({
          color: 4868166,
          roughness: 0.97,
          metalness: 0.02,
        }),
        new MeshStandardMaterial({
          color: 5657168,
          roughness: 0.95,
          metalness: 0.01,
        }),
        new MeshStandardMaterial({
          color: 9070680,
          roughness: 0.94,
          metalness: 0.01,
        }),
        new MeshStandardMaterial({
          color: 8028776,
          roughness: 0.96,
          metalness: 0.01,
        }),
        new MeshStandardMaterial({
          color: 11907236,
          roughness: 0.86,
          metalness: 0.02,
        }),
        new MeshStandardMaterial({
          color: 12761776,
          roughness: 0.84,
          metalness: 0.03,
        }),
      ],
      arr14 = [
        function (arg67) {
          return new DodecahedronGeometry(arg67, 0);
        },
        function (arg68) {
          return new IcosahedronGeometry(arg68, 0);
        },
        function (arg69) {
          return new OctahedronGeometry(arg69, 0);
        },
        function (arg70) {
          return new TetrahedronGeometry(arg70, 0);
        },
        function (arg71) {
          return new DodecahedronGeometry(arg71, 1);
        },
        function (arg72) {
          return new IcosahedronGeometry(arg72, 1);
        },
      ],
      haloTwisters = state.profile.counts.haloTwisters;
    for (let num426 = 0; num426 < haloTwisters; num426++) {
      const num188 = 9100 + 43 * num426,
        qeResult16 = tmpV65(num188),
        qeResult17 = tmpV65(num188 + 11),
        qeResult18 = tmpV65(num188 + 23),
        qeResult19 = tmpV65(num188 + 37),
        qeResult20 = tmpV65(num188 + 51),
        qeResult21 = tmpV65(num188 + 67),
        num189 = 0.2 + 1.2 * qeResult16,
        result58 = arr14[Math.floor(qeResult21 * arr14.length)](num189),
        mesh6 = new Mesh(result58, arr13[Math.floor(qeResult20 * arr13.length)]),
        num190 = num509 + (qeResult17 - 0.5) * Math.PI * 1.8,
        num191 = 14 + 80 * qeResult18,
        num192 = Math.cos(num190) * num191,
        num193 = Math.sin(num190) * num191,
        result59 = groundHeight(num192, num193);
      var tmpV61, tmpV62;
      (qeResult19 < 0.25
        ? ((tmpV61 = 1.2 + 0.8 * qeResult17),
          (num510 = 0.25 + 0.25 * qeResult20),
          (tmpV62 = 1 + 0.7 * qeResult21))
        : qeResult19 < 0.45
          ? ((tmpV61 = 0.5 + 0.3 * qeResult17),
            (num510 = 1.2 + 1 * qeResult20),
            (tmpV62 = 0.5 + 0.3 * qeResult21))
          : qeResult19 < 0.65
            ? ((tmpV61 = 1 + 0.6 * qeResult17),
              (num510 = 0.6 + 0.4 * qeResult20),
              (tmpV62 = 0.8 + 0.5 * qeResult21))
            : ((tmpV61 = 0.8 + 0.4 * qeResult17),
              (num510 = 0.7 + 0.5 * qeResult20),
              (tmpV62 = 0.8 + 0.4 * qeResult21)),
        mesh6.scale.set(tmpV61, num510, tmpV62),
        mesh6.position.set(num192, result59 + num189 * num510 * 0.45, num193),
        mesh6.rotation.set(0.4 * qeResult19, qeResult20 * Math.PI * 2, 0.3 * qeResult16),
        (mesh6.castShadow = !state.lowPower),
        (mesh6.receiveShadow = !state.lowPower),
        group5.add(mesh6));
    }
    const tmpV63 = state.lowPower ? 28 : 55;
    for (let num427 = 0; num427 < tmpV63; num427++) {
      const num194 = 9500 + 37 * num427,
        qeResult22 = tmpV65(num194),
        qeResult23 = tmpV65(num194 + 13),
        qeResult24 = tmpV65(num194 + 27),
        qeResult25 = tmpV65(num194 + 41),
        qeResult26 = tmpV65(num194 + 59),
        num195 = 0.06 + 0.35 * qeResult22,
        result60 = arr14[Math.floor(qeResult26 * arr14.length)](num195),
        mesh7 = new Mesh(result60, arr13[Math.floor(qeResult25 * arr13.length)]),
        num196 = num509 + (qeResult23 - 0.5) * Math.PI * 2,
        num197 = 10 + 85 * qeResult24,
        num198 = Math.cos(num196) * num197,
        num199 = Math.sin(num196) * num197,
        result61 = groundHeight(num198, num199);
      var num510 = 0.3 + 0.7 * qeResult24;
      (mesh7.scale.set(0.8 + 0.8 * qeResult23, num510, 0.8 + 0.6 * qeResult26),
        mesh7.position.set(num198, result61 + num195 * num510 * 0.4, num199),
        mesh7.rotation.set(0.3 * qeResult24, qeResult25 * Math.PI * 2, 0.2 * qeResult22),
        group5.add(mesh7));
    }
    const tmpV64 = state.lowPower ? 40 : 80;
    for (let num428 = 0; num428 < tmpV64; num428++) {
      const num200 = 9900 + 29 * num428,
        qeResult27 = tmpV65(num200),
        qeResult28 = tmpV65(num200 + 11),
        qeResult29 = tmpV65(num200 + 23),
        qeResult30 = tmpV65(num200 + 39),
        num201 = 0.03 + 0.12 * qeResult27,
        result62 = Math.floor(4 * qeResult30),
        mesh8 = new Mesh(arr14[result62](num201), arr13[Math.floor(qeResult30 * arr13.length)]),
        num202 = num509 + (qeResult28 - 0.5) * Math.PI * 2,
        num203 = 8 + 90 * qeResult29,
        num204 = Math.cos(num202) * num203,
        num205 = Math.sin(num202) * num203;
      ((num510 = 0.3 + 0.7 * qeResult28),
        mesh8.scale.set(0.7 + 0.8 * qeResult27, num510, 0.7 + 0.6 * qeResult29),
        mesh8.position.set(num204, groundHeight(num204, num205) + num201 * num510 * 0.35, num205),
        group5.add(mesh8));
    }
    (group4.add(group5),
      setShadowParticipation(group5),
      (function () {
        const num429 = 128,
          canvas4 = document.createElement("canvas");
        ((canvas4.width = num429), (canvas4.height = num429));
        const ctx4 = canvas4.getContext("2d");
        ((ctx4.fillStyle = "#6a6864"), ctx4.fillRect(0, 0, num429, num429));
        for (let num206 = 0; num206 < 200; num206++) {
          const num48 = tmpV65(7700 + num206) * num429,
            num49 = tmpV65(7701 + num206) * num429,
            num50 = 2 + 8 * tmpV65(7702 + num206),
            result10 = Math.floor(70 + 80 * tmpV65(7703 + num206));
          ((ctx4.fillStyle = `rgba(${result10}, ${result10 - 4}, ${result10 - 8}, 0.3)`),
            ctx4.beginPath(),
            ctx4.arc(num48, num49, num50, 0, 2 * Math.PI),
            ctx4.fill());
        }
        for (let num207 = 0; num207 < 30; num207++) {
          const num51 = tmpV65(7800 + num207) * num429,
            num52 = tmpV65(7801 + num207) * num429,
            num53 = num51 + 40 * (tmpV65(7802 + num207) - 0.5),
            num54 = num52 + 40 * (tmpV65(7803 + num207) - 0.5);
          ((ctx4.strokeStyle = `rgba(30, 28, 25, ${0.15 + 0.2 * tmpV65(7804 + num207)})`),
            (ctx4.lineWidth = 0.5 + 2 * tmpV65(7805 + num207)),
            ctx4.beginPath(),
            ctx4.moveTo(num51, num52),
            ctx4.lineTo(num53, num54),
            ctx4.stroke());
        }
        for (let num208 = 0; num208 < 15; num208++) {
          const num55 = tmpV65(7900 + num208) * num429,
            num56 = tmpV65(7901 + num208) * num429,
            num57 = 3 + 6 * tmpV65(7902 + num208);
          ((ctx4.fillStyle = `rgba(120, 130, 100, ${0.08 + 0.12 * tmpV65(7903 + num208)})`),
            ctx4.beginPath(),
            ctx4.arc(num55, num56, num57, 0, 2 * Math.PI),
            ctx4.fill());
        }
        const canvasTexture4 = new CanvasTexture(canvas4);
        setSrgbTexture(canvasTexture4);
        const canvas5 = document.createElement("canvas");
        ((canvas5.width = num429), (canvas5.height = num429));
        const ctx5 = canvas5.getContext("2d");
        ((ctx5.fillStyle = "#b0b0b0"), ctx5.fillRect(0, 0, num429, num429));
        for (let num209 = 0; num209 < 400; num209++) {
          const num58 = tmpV65(7500 + num209) * num429,
            num59 = tmpV65(7501 + num209) * num429,
            num60 = 1 + 6 * tmpV65(7502 + num209),
            result11 = Math.floor(80 + 100 * tmpV65(7503 + num209));
          ((ctx5.fillStyle = `rgb(${result11},${result11},${result11})`),
            ctx5.beginPath(),
            ctx5.arc(num58, num59, num60, 0, 2 * Math.PI),
            ctx5.fill());
        }
        const canvasTexture5 = new CanvasTexture(canvas5),
          dodecahedronGeometry = new DodecahedronGeometry(2.5, 1),
          position = dodecahedronGeometry.attributes.position;
        for (let num210 = 0; num210 < position.count; num210++) {
          const result12 = position.getX(num210),
            result13 = position.getY(num210),
            result14 = position.getZ(num210),
            num61 = 0.35 * tmpV65(8800 + 3.7 * num210) - 0.15;
          (position.setX(num210, result12 * (1 + num61)),
            position.setY(num210, result13 * (0.7 + 0.25 * tmpV65(8801 + 2.3 * num210))),
            position.setZ(num210, result14 * (1 + 0.3 * tmpV65(8802 + 1.9 * num210) - 0.12)));
        }
        dodecahedronGeometry.computeVertexNormals();
        const mesh28 = new Mesh(
            dodecahedronGeometry,
            new MeshStandardMaterial({
              color: 7894386,
              map: canvasTexture4,
              bumpMap: canvasTexture5,
              bumpScale: 0.15,
              roughness: 0.98,
              metalness: 0.01,
            }),
          ),
          num430 = num509 + 0.3,
          num431 = 28 * Math.cos(num430),
          num432 = 28 * Math.sin(num430);
        (mesh28.position.set(num431, groundHeight(num431, num432) + 1.2, num432),
          mesh28.rotation.set(0.1, 0.7, 0.15),
          (mesh28.castShadow = !state.lowPower),
          (mesh28.receiveShadow = !state.lowPower),
          group4.add(mesh28));
        quietObjects.push(mesh28);
      })());
    const group6 = new Group();
    group4.add(group6);
    function createIrregularFoliageGeometry(seed, detail = state.lowPower ? 0 : 1) {
      const geometry = new IcosahedronGeometry(1, detail),
        position = geometry.attributes.position;
      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index),
          y = position.getY(index),
          z = position.getZ(index),
          coordinateSeed = seed + 17.3 * x + 41.9 * y + 73.1 * z,
          radialScale = 0.82 + 0.3 * tmpV65(coordinateSeed),
          verticalScale = 0.9 + 0.18 * tmpV65(coordinateSeed + 19.7);
        position.setXYZ(index, x * radialScale, y * radialScale * verticalScale, z * radialScale);
      }
      geometry.computeVertexNormals();
      return geometry;
    }
    const shrubFoliageGeometries = [
        createIrregularFoliageGeometry(9101),
        createIrregularFoliageGeometry(9203),
        createIrregularFoliageGeometry(9311),
        createIrregularFoliageGeometry(9433),
      ],
      treeFoliageGeometries = [
        createIrregularFoliageGeometry(9601),
        createIrregularFoliageGeometry(9719),
        createIrregularFoliageGeometry(9833),
        createIrregularFoliageGeometry(9949),
        createIrregularFoliageGeometry(10061),
      ],
      cylinderGeometry2 = new CylinderGeometry(0.035, 0.075, 0.72, 5),
      canvas21 = document.createElement("canvas");
    ((canvas21.width = state.lowPower ? 64 : 128), (canvas21.height = state.lowPower ? 64 : 128));
    const ctx21 = canvas21.getContext("2d");
    if (ctx21) {
      ((ctx21.fillStyle = "#808080"), ctx21.fillRect(0, 0, canvas21.width, canvas21.height));
      const tmpV28 = state.lowPower ? 200 : 600;
      for (let num211 = 0; num211 < tmpV28; num211 += 1) {
        const num62 = Math.random() * canvas21.width,
          num63 = Math.random() * canvas21.height,
          num64 = 1 + 3 * Math.random(),
          result15 = Math.floor(100 + 80 * Math.random());
        ((ctx21.fillStyle = `rgb(${result15}, ${result15}, ${result15})`),
          ctx21.beginPath(),
          ctx21.ellipse(
            num62,
            num63,
            num64,
            0.6 * num64,
            Math.random() * Math.PI,
            0,
            2 * Math.PI,
          ),
          ctx21.fill());
      }
    }
    const canvasTexture20 = new CanvasTexture(canvas21);
    ((canvasTexture20.wrapS = RepeatWrapping),
      (canvasTexture20.wrapT = RepeatWrapping),
      canvasTexture20.repeat.set(3, 3));
    const arr15 = [
        new MeshStandardMaterial({
          color: 0x354231,
          bumpMap: canvasTexture20,
          bumpScale: 0.08,
          roughness: 0.95,
          metalness: 0,
          emissive: 0x10170f,
          emissiveIntensity: 0.025,
          flatShading: true,
        }),
        new MeshStandardMaterial({
          color: 0x46513a,
          bumpMap: canvasTexture20,
          bumpScale: 0.08,
          roughness: 0.95,
          metalness: 0,
          emissive: 0x151b12,
          emissiveIntensity: 0.025,
          flatShading: true,
        }),
        new MeshStandardMaterial({
          color: 0x2c382b,
          bumpMap: canvasTexture20,
          bumpScale: 0.08,
          roughness: 0.95,
          metalness: 0,
          emissive: 0x0e140d,
          emissiveIntensity: 0.025,
          flatShading: true,
        }),
        new MeshStandardMaterial({
          color: 0x596047,
          bumpMap: canvasTexture20,
          bumpScale: 0.08,
          roughness: 0.93,
          metalness: 0,
          emissive: 0x181d14,
          emissiveIntensity: 0.02,
          flatShading: true,
        }),
        new MeshStandardMaterial({
          color: 0x303b31,
          bumpMap: canvasTexture20,
          bumpScale: 0.08,
          roughness: 0.96,
          metalness: 0,
          emissive: 0x101510,
          emissiveIntensity: 0.025,
          flatShading: true,
        }),
        new MeshStandardMaterial({
          color: 0x66684a,
          bumpMap: canvasTexture20,
          bumpScale: 0.08,
          roughness: 0.92,
          metalness: 0,
          emissive: 0x1c1e15,
          emissiveIntensity: 0.02,
          flatShading: true,
        }),
        new MeshStandardMaterial({
          color: 0x263328,
          bumpMap: canvasTexture20,
          bumpScale: 0.08,
          roughness: 0.97,
          metalness: 0,
          emissive: 0x0c120c,
          emissiveIntensity: 0.025,
          flatShading: true,
        }),
        new MeshStandardMaterial({
          color: 0x4a5540,
          bumpMap: canvasTexture20,
          bumpScale: 0.08,
          roughness: 0.94,
          metalness: 0,
          emissive: 0x151a13,
          emissiveIntensity: 0.02,
          flatShading: true,
        }),
      ],
      meshStandardMaterial5 = new MeshStandardMaterial({
        color: 0x42352a,
        roughness: 1,
        metalness: 0,
        emissive: 0x100c09,
        emissiveIntensity: 0.02,
      }),
      meshStandardMaterial6 = new MeshStandardMaterial({
        color: 0x554334,
        roughness: 1,
        metalness: 0,
        emissive: 0x140f0b,
        emissiveIntensity: 0.02,
      });
    ([
      {
        x: -22,
        z: -10,
        scale: 1.5,
        variant: 0,
      },
      {
        x: 18,
        z: 14,
        scale: 1.6,
        variant: 1,
      },
      {
        x: -8,
        z: 22,
        scale: 1.4,
        variant: 2,
      },
      {
        x: 24,
        z: -16,
        scale: 1.3,
        variant: 0,
      },
      {
        x: -16,
        z: -20,
        scale: 1.5,
        variant: 1,
      },
      {
        x: -38,
        z: -28,
        scale: 1.9,
        variant: 0,
      },
      {
        x: 32,
        z: -40,
        scale: 2,
        variant: 1,
      },
      {
        x: -44,
        z: 14,
        scale: 2.2,
        variant: 2,
      },
      {
        x: 48,
        z: 8,
        scale: 2.1,
        variant: 0,
      },
      {
        x: -10,
        z: -48,
        scale: 1.8,
        variant: 1,
      },
      {
        x: 14,
        z: 50,
        scale: 2,
        variant: 2,
      },
      {
        x: -34,
        z: 36,
        scale: 1.7,
        variant: 0,
      },
      {
        x: 42,
        z: -22,
        scale: 1.9,
        variant: 2,
      },
      {
        x: -28,
        z: -44,
        scale: 2,
        variant: 1,
      },
      {
        x: 38,
        z: 30,
        scale: 1.8,
        variant: 0,
      },
      {
        x: -58,
        z: -40,
        scale: 2.4,
        variant: 0,
      },
      {
        x: 62,
        z: -24,
        scale: 2.3,
        variant: 1,
      },
      {
        x: -20,
        z: 65,
        scale: 2.5,
        variant: 2,
      },
      {
        x: 40,
        z: 55,
        scale: 2.1,
        variant: 0,
      },
      {
        x: -55,
        z: 38,
        scale: 2.2,
        variant: 1,
      },
      {
        x: 55,
        z: -52,
        scale: 2,
        variant: 2,
      },
      {
        x: -65,
        z: -8,
        scale: 2.6,
        variant: 0,
      },
      {
        x: 68,
        z: 18,
        scale: 2.3,
        variant: 1,
      },
      {
        x: -48,
        z: -58,
        scale: 2.1,
        variant: 2,
      },
      {
        x: 20,
        z: -68,
        scale: 2.4,
        variant: 0,
      },
      {
        x: -70,
        z: 28,
        scale: 2.5,
        variant: 1,
      },
      {
        x: 58,
        z: 42,
        scale: 2,
        variant: 2,
      },
      {
        x: -78,
        z: -22,
        scale: 2.8,
        variant: 0,
      },
      {
        x: 75,
        z: -44,
        scale: 2.6,
        variant: 1,
      },
      {
        x: 48,
        z: 72,
        scale: 2.5,
        variant: 0,
      },
      {
        x: 78,
        z: 8,
        scale: 2.4,
        variant: 2,
      },
    ].forEach((arg73) => {
      !(function (arg23, arg24, arg25, arg26 = 0) {
        const group2 = new Group(),
          result63 = Math.abs(73 * arg23 + 137 * arg24 + 31 * arg26),
          fn = function (arg3) {
            return tmpV65(result63 + arg3);
          },
          num212 = 10 + Math.floor(5 * fn(1)),
          num213 = 0.5 + 1 * fn(2),
          num214 = 0.6 + 0.8 * fn(3);
        var num215 = 3 + Math.floor(3 * fn(110));
        for (let num65 = 0; num65 < num215; num65++) {
          var num216 = (num65 / num215) * Math.PI * 2 + 1.2 * fn(120 + num65),
            num217 = (0.4 + 0.5 * fn(130 + num65)) * arg25 * num213,
            num218 = (0.025 + 0.025 * fn(140 + num65)) * arg25,
            num219 = 0.15 + 0.35 * fn(150 + num65),
            cylinderGeometry = new CylinderGeometry(0.5 * num218, num218, num217, 5),
            mesh9 = new Mesh(cylinderGeometry, meshStandardMaterial6),
            num220 = fn(160 + num65) * num214 * 0.25 * arg25;
          (mesh9.position.set(Math.cos(num216) * num220, 0.4 * num217, Math.sin(num216) * num220),
            mesh9.rotation.set(Math.sin(num216) * num219, num216, Math.cos(num216) * num219),
            (mesh9.castShadow = !1),
            (mesh9.receiveShadow = !1),
            group2.add(mesh9));
        }
        for (let num66 = 0; num66 < num212; num66++) {
          const num11 = (num66 / num212) * Math.PI * 2 + 0.65 * fn(10 + num66),
            num12 = (num66 === 0 ? 0.08 : 0.28 + 0.72 * fn(20 + num66)) * num214,
            num13 = Math.cos(num11) * num12,
            num14 = Math.sin(num11) * num12,
            num15 = (0.12 + 0.28 * fn(30 + num66)) * num213;
          var num221 = 0.24 + 0.26 * fn(40 + num66),
            num222 = (0.18 + 0.2 * fn(50 + num66)) * num213,
            num223 = 0.22 + 0.28 * fn(60 + num66);
          const result3 = Math.floor(fn(70 + num66) * arr15.length),
            mesh2 = new Mesh(
              shrubFoliageGeometries[(result3 + arg26 + num66) % shrubFoliageGeometries.length],
              arr15[result3],
            );
          (mesh2.position.set(num13 * arg25, num15 * arg25, num14 * arg25),
            mesh2.scale.set(arg25 * num221, arg25 * num222, arg25 * num223),
            mesh2.rotation.set(
              0.18 * (fn(73 + num66) - 0.5),
              Math.PI * 2 * fn(74 + num66),
              0.16 * (fn(75 + num66) - 0.5),
            ),
            (mesh2.castShadow = !1),
            (mesh2.receiveShadow = !1),
            group2.add(mesh2));
        }
        var num224 = 2 + Math.floor(3 * fn(80));
        for (let num67 = 0; num67 < num224; num67++) {
          const mesh3 = new Mesh(cylinderGeometry2, meshStandardMaterial5);
          var num225 = fn(90 + num67) * Math.PI * 2,
            num226 = fn(95 + num67) * num214 * 0.4;
          (mesh3.position.set(
            Math.cos(num225) * num226 * arg25,
            (0.5 + 0.3 * fn(100 + num67)) * num213 * arg25,
            Math.sin(num225) * num226 * arg25,
          ),
            (mesh3.rotation.z = 0.3 * (fn(105 + num67) - 0.5)),
            (mesh3.castShadow = !1),
            (mesh3.receiveShadow = !1),
            group2.add(mesh3));
        }
        (group2.position.set(arg23, groundHeight(arg23, arg24) + 0.08 * arg25, arg24),
          group6.add(group2));
      })(arg73.x, arg73.z, arg73.scale, arg73.variant);
    }),
      (function (arg74, arg75, arg76 = 1) {
        const group3 = new Group(),
          canvas6 = document.createElement("canvas");
        ((canvas6.width = state.lowPower ? 128 : 256),
          (canvas6.height = state.lowPower ? 64 : 128));
        const ctx6 = canvas6.getContext("2d");
        if (ctx6) {
          ((ctx6.fillStyle = "#8a6e52"), ctx6.fillRect(0, 0, canvas6.width, canvas6.height));
          const tmpV10 = state.lowPower ? 80 : 200;
          for (let num68 = 0; num68 < tmpV10; num68 += 1) {
            const num16 = Math.random() * canvas6.height,
              result4 = Math.floor(40 + 45 * Math.random());
            ((ctx6.fillStyle = `rgba(${result4}, ${Math.max(20, result4 - 18)}, ${Math.max(12, result4 - 24)}, ${0.1 + 0.15 * Math.random()})`),
              ctx6.fillRect(0, num16, canvas6.width, 1 + Math.floor(2 * Math.random())));
          }
          ctx6.lineWidth = 1.5;
          for (let num69 = 0; num69 < 20; num69 += 1) {
            const num17 = Math.random() * canvas6.width,
              num18 = Math.random() * canvas6.height * 0.3,
              num19 = canvas6.height * (0.3 + 0.5 * Math.random());
            ((ctx6.strokeStyle = `rgba(28, 16, 8, ${0.15 + 0.2 * Math.random()})`),
              ctx6.beginPath(),
              ctx6.moveTo(num17, num18),
              ctx6.quadraticCurveTo(
                num17 + 8 * (Math.random() - 0.5),
                num18 + 0.5 * num19,
                num17 + 4 * (Math.random() - 0.5),
                num18 + num19,
              ),
              ctx6.stroke());
          }
          for (let num70 = 0; num70 < 8; num70 += 1) {
            const num20 = Math.random() * canvas6.width,
              num21 = Math.random() * canvas6.height,
              num22 = 3 + 8 * Math.random();
            ((ctx6.fillStyle = `rgba(36, 22, 12, ${0.1 + 0.15 * Math.random()})`),
              ctx6.beginPath(),
              ctx6.ellipse(
                num20,
                num21,
                num22,
                0.6 * num22,
                Math.random() * Math.PI,
                0,
                2 * Math.PI,
              ),
              ctx6.fill());
          }
        }
        const canvasTexture6 = new CanvasTexture(canvas6);
        ((canvasTexture6.wrapS = RepeatWrapping),
          (canvasTexture6.wrapT = RepeatWrapping),
          canvasTexture6.repeat.set(1.5, 2),
          setSrgbTexture(canvasTexture6));
        const meshStandardMaterial2 = new MeshStandardMaterial({
            color: 0x6a513c,
            map: canvasTexture6,
            roughness: 0.96,
            metalness: 0.01,
          }),
          meshStandardMaterial3 = new MeshStandardMaterial({
            color: 0x49372c,
            map: canvasTexture6,
            roughness: 1,
            metalness: 0,
          }),
          treeFoliageMaterials = [
            new MeshStandardMaterial({
              color: 0x33402f,
              roughness: 1,
              metalness: 0,
              emissive: 0x10160e,
              emissiveIntensity: 0.025,
              flatShading: true,
            }),
            new MeshStandardMaterial({
              color: 0x46513a,
              roughness: 0.98,
              metalness: 0,
              emissive: 0x151a12,
              emissiveIntensity: 0.02,
              flatShading: true,
            }),
            new MeshStandardMaterial({
              color: 0x596048,
              roughness: 0.96,
              metalness: 0,
              emissive: 0x191b14,
              emissiveIntensity: 0.018,
              flatShading: true,
            }),
          ],
          mesh29 = new Mesh(
            new CylinderGeometry(0.9 * arg76, 1.25 * arg76, 8.2 * arg76, state.lowPower ? 7 : 12),
            meshStandardMaterial2,
          );
        ((mesh29.position.y = 4.1 * arg76),
          (mesh29.rotation.z = -0.08),
          (mesh29.castShadow = !state.lowPower),
          (mesh29.receiveShadow = !state.lowPower),
          group3.add(mesh29));
        const mesh30 = new Mesh(
          new CylinderGeometry(0.45 * arg76, 0.72 * arg76, 5.8 * arg76, state.lowPower ? 6 : 11),
          meshStandardMaterial3,
        );
        (mesh30.position.set(0.45 * arg76, 9 * arg76, -0.12 * arg76),
          (mesh30.rotation.z = 0.22),
          (mesh30.rotation.x = -0.05),
          (mesh30.castShadow = !state.lowPower),
          (mesh30.receiveShadow = !state.lowPower),
          group3.add(mesh30),
          [
            {
              x: 0.7,
              y: 10.4,
              z: 0.15,
              ry: 0.2,
              rz: -0.66,
              len: 3.8,
              rTop: 0.17,
              rBase: 0.24,
            },
            {
              x: -0.25,
              y: 8.9,
              z: -0.25,
              ry: -0.6,
              rz: 0.52,
              len: 3.1,
              rTop: 0.14,
              rBase: 0.2,
            },
            {
              x: 0.28,
              y: 7.7,
              z: -0.45,
              ry: 0.92,
              rz: -0.38,
              len: 2.8,
              rTop: 0.13,
              rBase: 0.19,
            },
            {
              x: -0.6,
              y: 11.2,
              z: 0.35,
              ry: -0.35,
              rz: 0.72,
              len: 2.4,
              rTop: 0.11,
              rBase: 0.16,
            },
            {
              x: 0.55,
              y: 9.6,
              z: -0.6,
              ry: 1.4,
              rz: -0.48,
              len: 2.1,
              rTop: 0.1,
              rBase: 0.15,
            },
          ].forEach((arg27) => {
            const mesh10 = new Mesh(
              new CylinderGeometry(
                arg27.rTop * arg76,
                arg27.rBase * arg76,
                arg27.len * arg76,
                state.lowPower ? 5 : 7,
              ),
              meshStandardMaterial3,
            );
            (mesh10.position.set(arg27.x * arg76, arg27.y * arg76, arg27.z * arg76),
              (mesh10.rotation.y = arg27.ry),
              (mesh10.rotation.z = arg27.rz),
              (mesh10.castShadow = !state.lowPower),
              (mesh10.receiveShadow = !state.lowPower),
              group3.add(mesh10));
          }),
          [
            {
              x: 1.72,
              y: 12.15,
              z: 0.38,
              sx: 1.65,
              sy: 1.18,
              sz: 1.32,
            },
            {
              x: 0.42,
              y: 13.18,
              z: -0.7,
              sx: 1.9,
              sy: 1.3,
              sz: 1.62,
            },
            {
              x: -0.72,
              y: 11.48,
              z: -0.52,
              sx: 1.38,
              sy: 1.04,
              sz: 1.3,
            },
            {
              x: 1.08,
              y: 10.72,
              z: -1.18,
              sx: 1.08,
              sy: 0.82,
              sz: 0.96,
            },
            {
              x: -1.08,
              y: 12.72,
              z: 0.55,
              sx: 1.2,
              sy: 0.92,
              sz: 1.08,
            },
            {
              x: 1.12,
              y: 13.62,
              z: 0.08,
              sx: 1.28,
              sy: 0.92,
              sz: 1.14,
            },
            {
              x: -0.18,
              y: 14.18,
              z: 0.18,
              sx: 1.1,
              sy: 0.86,
              sz: 1,
            },
            {
              x: 0.14,
              y: 10.82,
              z: 0.92,
              sx: 1.24,
              sy: 0.9,
              sz: 1.04,
            },
            {
              x: 2.05,
              y: 11.35,
              z: -0.5,
              sx: 0.92,
              sy: 0.7,
              sz: 0.84,
            },
            {
              x: -1.35,
              y: 11.42,
              z: 0.04,
              sx: 0.88,
              sy: 0.7,
              sz: 0.82,
            },
          ].forEach((arg28, arg29) => {
            const mesh11 = new Mesh(
              treeFoliageGeometries[arg29 % treeFoliageGeometries.length],
              treeFoliageMaterials[arg29 % treeFoliageMaterials.length],
            );
            (mesh11.position.set(arg28.x * arg76, arg28.y * arg76, arg28.z * arg76),
              mesh11.scale.set(arg28.sx * arg76, arg28.sy * arg76, arg28.sz * arg76),
              mesh11.rotation.set(0.08 * (arg29 % 3), 0.73 * arg29, -0.05 * (arg29 % 4)),
              (mesh11.castShadow = !state.lowPower),
              (mesh11.receiveShadow = !state.lowPower),
              group3.add(mesh11));
          }),
          [
            {
              angle: 0.4,
              len: 3.2,
              rBase: 0.38,
              rTip: 0.12,
              tilt: 0.62,
            },
            {
              angle: 2.3,
              len: 2.8,
              rBase: 0.34,
              rTip: 0.1,
              tilt: 0.55,
            },
            {
              angle: 4.1,
              len: 3.5,
              rBase: 0.42,
              rTip: 0.14,
              tilt: 0.68,
            },
          ].forEach((arg30) => {
            const mesh12 = new Mesh(
                new CylinderGeometry(
                  arg30.rTip * arg76,
                  arg30.rBase * arg76,
                  arg30.len * arg76,
                  state.lowPower ? 4 : 6,
                ),
                meshStandardMaterial3,
              ),
              num227 = 1.1 * Math.cos(arg30.angle) * arg76,
              num228 = 1.1 * Math.sin(arg30.angle) * arg76;
            (mesh12.position.set(num227, 0.3 * arg76, num228),
              (mesh12.rotation.z = Math.cos(arg30.angle) * arg30.tilt),
              (mesh12.rotation.x = -Math.sin(arg30.angle) * arg30.tilt),
              (mesh12.castShadow = !state.lowPower),
              (mesh12.receiveShadow = !state.lowPower),
              group3.add(mesh12));
          }));
        const result87 = groundHeight(arg74, arg75);
        (group3.position.set(arg74, result87, arg75), group4.add(group3));
        group3.name = "classic-tree";
        classicTree = group3;
      })(58, 38, state.lowPower ? 1.25 : 1.5));
    const towerSystem = createSceneTower({
      parent: group4,
      profile: state.profile,
    });
    subsystemRegistry.register(towerSystem);
    const group7 = towerSystem.root;
    const towerArchitecturalLights = [
      {
        baseIntensity: 0.5,
        light: new PointLight(0xffc06a, 0.5, 34, 2),
        phase: 0.35,
        position: [15, 8, 11],
      },
      {
        baseIntensity: 0.34,
        light: new PointLight(0xeaa35d, 0.34, 30, 2),
        phase: 3.4,
        position: [-13, 6, -14],
      },
    ];
    towerArchitecturalLights.forEach((record) => {
      record.light.position.set(...record.position);
      record.light.castShadow = false;
      group7.add(record.light);
    });
    towerSystem.setArchitecturalLights(towerArchitecturalLights);
    function tmpV65(arg77) {
      const num433 = 43758.5453123 * Math.sin(12.9898 * arg77);
      return num433 - Math.floor(num433);
    }
    function tmpV66(arg78 = 0) {
      const canvas7 = document.createElement("canvas");
      ((canvas7.width = 256), (canvas7.height = 128));
      const ctx7 = canvas7.getContext("2d");
      if (!ctx7) return null;
      ctx7.clearRect(0, 0, canvas7.width, canvas7.height);
      const num434 = 5 + (arg78 % 3);
      for (let num229 = 0; num229 < num434; num229 += 1) {
        const num71 = num229 / Math.max(1, num434 - 1),
          num72 =
            canvas7.width *
            (0.16 + 0.68 * num71 + 0.05 * (0.5 * Math.sin(1.21 * (num229 + arg78)) + 0.5)),
          num73 = canvas7.height * (0.48 + 0.1 * (Math.sin(0.87 * (num229 + 3 + arg78)) - 0.2)),
          num74 = canvas7.width * (0.12 + 0.11 * (0.5 * Math.sin(1.73 * (num229 + arg78)) + 0.5)),
          num75 = canvas7.height * (0.2 + 0.12 * (0.5 * Math.sin(2.11 * (num229 + arg78)) + 0.5)),
          gradient2 = ctx7.createRadialGradient(
            num72 - 0.18 * num74,
            num73 - 0.2 * num75,
            0.08 * num75,
            num72,
            num73,
            1.08 * Math.max(num74, num75),
          );
        (gradient2.addColorStop(0, "rgba(253, 244, 230, 0.78)"),
          gradient2.addColorStop(0.65, "rgba(236, 223, 206, 0.42)"),
          gradient2.addColorStop(1, "rgba(220, 204, 184, 0)"),
          (ctx7.fillStyle = gradient2),
          ctx7.beginPath(),
          ctx7.ellipse(num72, num73, num74, num75, 0, 0, 2 * Math.PI),
          ctx7.fill());
      }
      const canvasTexture7 = new CanvasTexture(canvas7);
      return (
        setSrgbTexture(canvasTexture7),
        (canvasTexture7.anisotropy = chooseAnisotropy(1, 2)),
        (canvasTexture7.minFilter = LinearFilter),
        (canvasTexture7.magFilter = LinearFilter),
        (canvasTexture7.generateMipmaps = !1),
        canvasTexture7
      );
    }
    const group8 = new Group();
    atmosphereSystem.root.add(group8);
    const arr16 = [],
      upperGlowSprites = state.profile.counts.upperGlowSprites;
    for (let num435 = 0; num435 < upperGlowSprites; num435 += 1) {
      const qeResult31 = tmpV65(903 + 1.37 * num435),
        qeResult32 = tmpV65(917 + 2.11 * num435),
        qeResult33 = tmpV65(931 + 2.91 * num435),
        qeResult34 = tmpV65(947 + 3.67 * num435),
        jeResult = tmpV66(num435);
      if (!jeResult) continue;
      const sprite5 = new Sprite(
          new SpriteMaterial({
            map: jeResult,
            color: 14734570,
            transparent: !0,
            opacity: state.lowPower ? 0.14 : 0.18,
            depthWrite: !1,
            rotation: 0.5 * (qeResult34 - 0.5),
          }),
        ),
        num230 = qeResult31 * Math.PI * 2,
        num231 = 72 + 36 * qeResult32;
      sprite5.position.set(
        Math.cos(num230) * num231,
        24 + 34 * qeResult33,
        Math.sin(num230) * num231,
      );
      const num232 = (state.lowPower ? 18 : 25) + qeResult34 * (state.lowPower ? 14 : 25);
      (sprite5.scale.set(num232, num232 * (0.42 + 0.2 * qeResult32), 1),
        group8.add(sprite5),
        arr16.push({
          mesh: sprite5,
          yaw: num230,
          radius: num231,
          baseY: sprite5.position.y,
          phase: qeResult31 * Math.PI * 2,
          speed: 0.008 + 0.016 * qeResult33,
        }));
    }
    const upperGlowSystem = registerDecorativeSystem({
      getCenter(target) {
        return group8.getWorldPosition(target);
      },
      group: group8,
      importance: "midAtmosphere",
      name: "upperGlow",
      radius: 118,
    });
    setShadowParticipation(group8);
    const group9 = new Group();
    atmosphereSystem.root.add(group9);
    const arr17 = [];
    function tmpV67(arg79, arg80, arg81, arg82) {
      arg82 = arg82 || "mid";
      const canvas8 = document.createElement("canvas");
      ((canvas8.width = arg80), (canvas8.height = arg81));
      const ctx8 = canvas8.getContext("2d"),
        fn2 = function (arg31) {
          return tmpV65(arg31);
        },
        arr6 = [
          ["rgba(245,220,215,A)", "rgba(230,200,210,A)", "rgba(255,240,235,A)"],
          ["rgba(220,210,240,A)", "rgba(240,230,250,A)", "rgba(255,245,255,A)"],
          ["rgba(235,225,215,A)", "rgba(250,240,230,A)", "rgba(255,250,245,A)"],
          ["rgba(210,200,230,A)", "rgba(235,215,235,A)", "rgba(250,240,248,A)"],
        ],
        tmpV29 = arr6[arg79 % arr6.length];
      var tmpV30 = "back" === arg82 ? 0.7 : "front" === arg82 ? 1.3 : 1;
      const num436 = 12 + Math.floor(10 * fn2(arg79 + 99));
      for (let num233 = 0; num233 < 3; num233++)
        for (let num76 = 0; num76 < num436; num76++) {
          const num23 = 100 * arg79 + 200 * num233 + 37 * num76,
            num24 = arg80 * (0.15 + 0.7 * fn2(num23)),
            num25 = arg81 * (0.2 + 0.6 * fn2(num23 + 1)),
            num26 = arg80 * (0.15 + 0.32 * fn2(num23 + 2)),
            num27 = arg81 * (0.1 + 0.2 * fn2(num23 + 3)),
            num28 = (0.04 + 0.14 * fn2(num23 + 4)) * tmpV30,
            result5 = tmpV29[num233 % tmpV29.length].replace("A", num28.toFixed(3));
          (ctx8.save(),
            ctx8.translate(num24, num25),
            ctx8.rotate(0.4 * (fn2(num23 + 5) - 0.5)),
            ctx8.scale(1, num27 / num26));
          const gradient = ctx8.createRadialGradient(0, 0, 0, 0, 0, num26);
          (gradient.addColorStop(0, result5),
            gradient.addColorStop(
              0.25,
              result5.replace(num28.toFixed(3), (0.85 * num28).toFixed(3)),
            ),
            gradient.addColorStop(
              0.5,
              result5.replace(num28.toFixed(3), (0.55 * num28).toFixed(3)),
            ),
            gradient.addColorStop(
              0.75,
              result5.replace(num28.toFixed(3), (0.2 * num28).toFixed(3)),
            ),
            gradient.addColorStop(1, "rgba(255,255,255,0)"),
            (ctx8.fillStyle = gradient),
            ctx8.beginPath(),
            ctx8.arc(0, 0, num26, 0, 2 * Math.PI),
            ctx8.fill(),
            ctx8.restore());
        }
      var tmpV31 = "front" === arg82 ? 0.25 : "back" === arg82 ? 0.06 : 0.15,
        tmpV32 = "front" === arg82 ? 12 : 8;
      for (let num234 = 0; num234 < tmpV32; num234++) {
        const num77 = 77 * arg79 + 53 * num234,
          num78 = arg80 * (0.3 + 0.4 * fn2(num77)),
          num79 = arg81 * (0.15 + fn2(num77 + 1) * ("front" === arg82 ? 0.25 : 0.3)),
          num80 = arg80 * (0.06 + fn2(num77 + 2) * ("front" === arg82 ? 0.13 : 0.1)),
          gradient3 = ctx8.createRadialGradient(num78, num79, 0, num78, num79, num80);
        (gradient3.addColorStop(0, "rgba(255,252,248," + tmpV31 + ")"),
          gradient3.addColorStop(1, "rgba(255,255,255,0)"),
          (ctx8.fillStyle = gradient3),
          ctx8.beginPath(),
          ctx8.arc(num78, num79, num80, 0, 2 * Math.PI),
          ctx8.fill());
      }
      var tmpV33 = "back" === arg82 ? 0.22 : "front" === arg82 ? 0.03 : 0.11;
      const gradient13 = ctx8.createLinearGradient(0, 0, 0, arg81);
      (gradient13.addColorStop(0, "rgba(116,120,156,0)"),
        gradient13.addColorStop(0.45, "rgba(116,120,156,0)"),
        gradient13.addColorStop(0.6, "rgba(116,120,156," + (0.08 * tmpV33).toFixed(3) + ")"),
        gradient13.addColorStop(0.75, "rgba(116,120,156," + (0.28 * tmpV33).toFixed(3) + ")"),
        gradient13.addColorStop(0.88, "rgba(108,112,150," + (0.58 * tmpV33).toFixed(3) + ")"),
        gradient13.addColorStop(1, "rgba(98,104,142," + tmpV33.toFixed(3) + ")"),
        (ctx8.fillStyle = gradient13),
        ctx8.fillRect(0, 0, arg80, arg81),
        (ctx8.globalCompositeOperation = "destination-in"));
      const canvas9 = document.createElement("canvas");
      ((canvas9.width = arg80), (canvas9.height = arg81));
      const ctx9 = canvas9.getContext("2d"),
        num437 = arg80 / 2,
        num438 = arg81 / 2,
        num439 = 0.44 * arg80,
        num440 = 0.44 * arg81;
      (ctx9.save(), ctx9.translate(num437, num438), ctx9.scale(num439 / num440, 1));
      const gradient14 = ctx9.createRadialGradient(0, 0, 0.15 * num440, 0, 0, num440);
      (gradient14.addColorStop(0, "rgba(255,255,255,1)"),
        gradient14.addColorStop(0.45, "rgba(255,255,255,0.88)"),
        gradient14.addColorStop(0.7, "rgba(255,255,255,0.45)"),
        gradient14.addColorStop(0.88, "rgba(255,255,255,0.10)"),
        gradient14.addColorStop(1, "rgba(255,255,255,0)"),
        (ctx9.fillStyle = gradient14),
        ctx9.fillRect(-num439, -num440, 2 * num439, 2 * num440),
        ctx9.restore(),
        ctx8.drawImage(canvas9, 0, 0),
        (ctx8.globalCompositeOperation = "source-over"));
      const canvasTexture8 = new CanvasTexture(canvas8);
      return (
        setSrgbTexture(canvasTexture8),
        (canvasTexture8.minFilter = LinearFilter),
        (canvasTexture8.magFilter = LinearFilter),
        (canvasTexture8.generateMipmaps = !1),
        canvasTexture8
      );
    }
    const midCloudTextures = state.profile.counts.midCloudTextures,
      arr18 = [];
    for (let num441 = 0; num441 < midCloudTextures; num441++) {
      const cloudAtlasSize = state.profile.textures.cloudAtlasSize,
        result64 = Math.floor(0.6 * cloudAtlasSize),
        num235 = 7 * num441 + 42;
      arr18.push({
        mid: tmpV67(num235, cloudAtlasSize, result64, "mid"),
      });
    }
    const midCloudSprites = state.profile.counts.midCloudSprites;
    for (let num442 = 0; num442 < midCloudSprites; num442++) {
      const num236 = 8800 + 31 * num442,
        qeResult35 = tmpV65(num236),
        qeResult36 = tmpV65(num236 + 17),
        qeResult37 = tmpV65(num236 + 31),
        qeResult38 = tmpV65(num236 + 47),
        qeResult39 = tmpV65(num236 + 61),
        tmpV11 = arr18[num442 % arr18.length],
        num237 = (num442 / midCloudSprites) * Math.PI * 2 + 1.6 * (qeResult35 - 0.5),
        num238 = 58 + 42 * qeResult36,
        num239 = 20 + 40 * qeResult37 + 14 * (qeResult38 - 0.5),
        num240 = 26 + 28 * qeResult37,
        num241 = 1.4 + 0.8 * qeResult35,
        sprite6 = new Sprite(
          new SpriteMaterial({
            map: tmpV11.mid,
            transparent: !0,
            opacity: 0.55 + 0.28 * qeResult38,
            depthWrite: !1,
            fog: !0,
            rotation: 0.6 * (qeResult39 - 0.5),
          }),
        );
      (sprite6.scale.set(num240 * num241, 0.6 * num240, 1),
        sprite6.position.set(Math.cos(num237) * num238, num239, Math.sin(num237) * num238),
        group9.add(sprite6),
        arr17.push({
          mesh: sprite6,
          meshes: [sprite6],
          yaw: num237,
          radius: num238,
          baseY: num239,
          phase: qeResult35 * Math.PI * 2,
          speed: 0.003 + 0.006 * qeResult36,
          baseOpacity: 0.55 + 0.28 * qeResult38,
        }));
    }
    const midCloudSystem = registerDecorativeSystem({
      getCenter(target) {
        return group9.getWorldPosition(target);
      },
      group: group9,
      importance: "midAtmosphere",
      name: "midClouds",
      radius: 112,
    });
    setShadowParticipation(group9);
    const group10 = new Group();
    group4.add(group10);
    const arr19 = [],
      result106 = (function () {
        const canvas10 = document.createElement("canvas");
        ((canvas10.width = 96), (canvas10.height = 96));
        const ctx10 = canvas10.getContext("2d");
        if (!ctx10) return null;
        ctx10.clearRect(0, 0, canvas10.width, canvas10.height);
        for (let num242 = 0; num242 < 18; num242 += 1) {
          const num81 = num242 / Math.max(1, 17),
            num82 = canvas10.width * (0.16 + 0.68 * num81),
            num83 = canvas10.height * (0.28 + 0.42 * (0.5 * Math.sin(1.29 * num242) + 0.5)),
            num84 = (Math.sin(1.81 * num242 + 0.7) - 0.5) * canvas10.width * 0.06;
          ((ctx10.strokeStyle = `rgba(166, 178, 132, ${0.16 + 0.28 * (0.5 * Math.sin(0.77 * num242) + 0.5)})`),
            (ctx10.lineWidth = 1 + 1.1 * (0.5 * Math.sin(1.41 * num242) + 0.5)),
            ctx10.beginPath(),
            ctx10.moveTo(num82, 0.94 * canvas10.height),
            ctx10.quadraticCurveTo(
              num82 + 0.5 * num84,
              0.94 * canvas10.height - 0.45 * num83,
              num82 + num84,
              0.94 * canvas10.height - num83,
            ),
            ctx10.stroke());
        }
        const canvasTexture9 = new CanvasTexture(canvas10);
        return (
          setSrgbTexture(canvasTexture9),
          (canvasTexture9.anisotropy = chooseAnisotropy(1, 2)),
          canvasTexture9
        );
      })(),
      groundPlantSprites = 0,
      foregroundPlantSprites = 0;
    if (result106)
      for (let num443 = 0; num443 < groundPlantSprites; num443 += 1) {
        const qeResult40 = tmpV65(1001 + 1.43 * num443),
          qeResult41 = tmpV65(1033 + 2.37 * num443),
          qeResult42 = tmpV65(1069 + 3.19 * num443),
          num243 = qeResult40 * Math.PI * 2,
          num244 = 16 + 60 * qeResult41,
          num245 = Math.cos(num243) * num244,
          num246 = Math.sin(num243) * num244,
          num247 = groundHeight(num245, num246) + 0.06,
          sprite7 = new Sprite(
            new SpriteMaterial({
              map: result106,
              color: 10398333,
              transparent: !0,
              opacity: state.lowPower ? 0.3 : 0.36,
              depthWrite: !1,
            }),
          ),
          num248 = (state.lowPower ? 0.85 : 1) + qeResult42 * (state.lowPower ? 1.05 : 1.45);
        (sprite7.position.set(num245, num247 + 0.52 * num248 * (1.2 + 0.5 * qeResult41), num246),
          sprite7.scale.set(0.85 * num248, num248 * (1.2 + 0.5 * qeResult41), 1),
          group10.add(sprite7),
          arr19.push({
            mesh: sprite7,
            x: num245,
            z: num246,
            baseY: num247 + 0.52 * num248 * (1.2 + 0.5 * qeResult41),
            phase: qeResult40 * Math.PI * 2,
            amp: 0.02 + 0.05 * qeResult41,
          }));
      }
    const result107 = groundHeight(0, 0),
      num511 = 0.32 * Math.PI,
      num512 = 0.88;
    if (result106 && foregroundPlantSprites > 0) {
      const num444 = num511 + Math.PI,
        tmpV34 = state.lowPower ? 34 : 72;
      for (let num249 = 0; num249 < tmpV34; num249 += 1) {
        const qeResult4 = tmpV65(1401 + 1.53 * num249),
          qeResult5 = tmpV65(1433 + 2.27 * num249),
          qeResult6 = tmpV65(1471 + 3.11 * num249),
          num85 = num444 + 1.05 * (qeResult4 - 0.5),
          num86 = 11.4 + 4.9 * qeResult5,
          num87 = Math.cos(num85) * num86,
          num88 = Math.sin(num85) * num86,
          num89 = groundHeight(num87, num88) + 0.05,
          sprite4 = new Sprite(
            new SpriteMaterial({
              map: result106,
              color: 10924161,
              transparent: !0,
              opacity: state.lowPower ? 0.3 : 0.37,
              depthWrite: !1,
            }),
          ),
          num90 = (state.lowPower ? 0.95 : 1.08) + qeResult6 * (state.lowPower ? 1.15 : 1.5);
        (sprite4.position.set(num87, num89 + 0.52 * num90 * (1.24 + 0.46 * qeResult5), num88),
          sprite4.scale.set(0.82 * num90, num90 * (1.24 + 0.46 * qeResult5), 1),
          group10.add(sprite4),
          arr19.push({
            mesh: sprite4,
            x: num87,
            z: num88,
            baseY: num89 + 0.52 * num90 * (1.24 + 0.46 * qeResult5),
            phase: qeResult4 * Math.PI * 2,
            amp: 0.024 + 0.05 * qeResult5,
          }));
      }
      const tmpV35 = state.lowPower ? 4 : 7,
        tmpV36 = state.lowPower ? 8 : 14;
      for (let num250 = 0; num250 < tmpV35; num250 += 1) {
        const qeResult7 = tmpV65(1601 + 2.03 * num250),
          qeResult8 = tmpV65(1651 + 2.71 * num250),
          qeResult9 = tmpV65(1703 + 3.17 * num250),
          num91 = num444 + 0.95 * (qeResult7 - 0.5),
          num92 = 10.8 + 5.4 * qeResult8,
          num93 = Math.cos(num91) * num92,
          num94 = Math.sin(num91) * num92;
        for (let num29 = 0; num29 < tmpV36; num29 += 1) {
          const qeResult = tmpV65(1801 + 23.1 * num250 + 1.49 * num29),
            qeResult2 = tmpV65(1861 + 17.7 * num250 + 2.13 * num29),
            qeResult3 = tmpV65(1931 + 19.9 * num250 + 2.87 * num29),
            num = qeResult * Math.PI * 2,
            num2 = 0.14 + qeResult2 * (state.lowPower ? 0.75 : 1.1),
            num3 = num93 + Math.cos(num) * num2,
            num4 = num94 + Math.sin(num) * num2,
            num5 = groundHeight(num3, num4) + 0.05,
            sprite2 = new Sprite(
              new SpriteMaterial({
                map: result106,
                color: 11187588,
                transparent: !0,
                opacity: state.lowPower ? 0.33 : 0.41,
                depthWrite: !1,
              }),
            ),
            num6 =
              (state.lowPower ? 1 : 1.12) +
              qeResult3 * (state.lowPower ? 1.25 : 1.7) +
              0.16 * qeResult9;
          (sprite2.position.set(num3, num5 + 0.52 * num6 * (1.28 + 0.52 * qeResult2), num4),
            sprite2.scale.set(0.86 * num6, num6 * (1.28 + 0.52 * qeResult2), 1),
            group10.add(sprite2),
            arr19.push({
              mesh: sprite2,
              x: num3,
              z: num4,
              baseY: num5 + 0.52 * num6 * (1.28 + 0.52 * qeResult2),
              phase: qeResult * Math.PI * 2,
              amp: 0.026 + 0.055 * qeResult2,
            }));
        }
      }
    }
    environmentSystem.setGroundPlantRecords(arr19);
    const materialSearch = new URLSearchParams(window.location?.search || "");
    const architectureEnabled = materialSearch.get("architecture") !== "classic";
    const completeTowerEnabled = architectureEnabled && materialSearch.get("architecture") !== "assembled";
    const classicTowerMeshes = [];
    const baseMasonryRecords = [];
    const brickDetailDisabled =
      architectureEnabled || materialSearch.get("brick") === "boxes" || materialSearch.get("stone") === "procedural";
    const constructionDetailDisabled =
      brickDetailDisabled || materialSearch.get("construction") === "baseline";
    let brickDetail = null;
    let treadDetail = null;
    // Stone detail can resolve before the later controllers are constructed.
    let latestBrickMaps = null;
    const result108 = createTowerTextures({
      THREE: THREE,
      lowPower: state.lowPower,
      qualityProfile: state.profile,
      chooseAnisotropy: chooseAnisotropy,
      collapseYaw: num511,
      collapseSpread: num512,
      search: architectureEnabled ? "?stone=procedural" : window.location?.search || "",
      includeBrickDetail: !brickDetailDisabled,
      onDetailStatus(status) {
        if (qualityDebug) qualityDebug.stone = status;
        if (status.status === "fallback") {
          latestBrickMaps = null;
          brickDetail?.setDetailMaps(null);
          treadDetail?.setDetailMaps(null);
        }
      },
      onDetailChange({ colorMap, roughnessMap, brickMaps }) {
        // Restore detached originals before rebinding or disposing their wall maps.
        brickDetail?.setDetailMaps(null);
        treadDetail?.setDetailMaps(null);
        homeScene.traverse((object) => {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            if (material?.map !== colorMap) return;
            material.roughnessMap = roughnessMap;
            material.needsUpdate = true;
          });
        });
        latestBrickMaps = brickMaps;
        brickDetail?.setDetailMaps(latestBrickMaps);
        treadDetail?.setDetailMaps(latestBrickMaps);
        frameScheduler?.invalidate();
      },
    });
    subsystemRegistry.register(result108);
    function tmpV68(arg83, arg84) {
      return Math.abs(Math.atan2(Math.sin(arg83 - arg84), Math.cos(arg83 - arg84)));
    }
    const arr20 = [
      {
        angle: num511 + 0.22 * (tmpV65(3101) - 0.5),
        spread: 0.42,
        strength: 1,
      },
      {
        angle: num511 + 0.58 + 0.2 * (tmpV65(3102) - 0.5),
        spread: 0.32,
        strength: 0.72,
      },
      {
        angle: num511 - 0.76 + 0.24 * (tmpV65(3103) - 0.5),
        spread: 0.36,
        strength: 0.78,
      },
    ];
    function tmpV69(arg85, arg86) {
      const position2 = arg85.attributes.position;
      let num445 = 0,
        num446 = 0;
      for (let num251 = 0; num251 < position2.count; num251 += 1) {
        const result16 = position2.getX(num251),
          result17 = position2.getY(num251),
          result18 = position2.getZ(num251);
        if ((result17 + 17) / 34 < 0.86) continue;
        if (Math.sqrt(result16 * result16 + result18 * result18) < 6) continue;
        const mtResult = tmpV68(Math.atan2(result18, result16), arg86),
          result19 = Math.max(0, 1 - mtResult / 0.32);
        result19 <= 0 || ((num445 += result17 * result19), (num446 += result19));
      }
      return num446 <= 0 ? -1 / 0 : num445 / num446;
    }
    function baseEdgeErode(arg87, arg88 = {}) {
      const {
          jitterRadial: tmpV37 = 0.24,
          jitterVertical: tmpV38 = 0.08,
          halfHeight: tmpV39 = 1,
          seedOffset: tmpV40 = 0,
        } = arg88,
        position3 = arg87.attributes.position;
      for (let num252 = 0; num252 < position3.count; num252 += 1) {
        const result20 = position3.getX(num252),
          result21 = position3.getY(num252),
          result22 = position3.getZ(num252),
          result23 = Math.sqrt(result20 * result20 + result22 * result22);
        if (result23 < 0.01) continue;
        const tmpV4 = Math.abs(result21) > 0.6 * tmpV39 ? 1 : 0.35,
          num95 = tmpV65(tmpV40 + 1.37 * num252) - 0.5,
          num96 = tmpV65(tmpV40 + 2.11 * num252 + 0.4) - 0.5,
          num97 = tmpV4 * tmpV37 * num95,
          num98 = tmpV4 * tmpV38 * num96;
        (position3.setX(num252, (result20 / result23) * (result23 + num97)),
          position3.setZ(num252, (result22 / result23) * (result23 + num97)),
          Math.abs(result21) > 0.4 * tmpV39 && position3.setY(num252, result21 + num98));
      }
      ((position3.needsUpdate = !0), arg87.computeVertexNormals());
    }
    const ftLowerGeom = new CylinderGeometry(17.4, 18.6, 1.2, 56, 1);
    baseEdgeErode(ftLowerGeom, {
      jitterRadial: 0.3,
      jitterVertical: 0.09,
      halfHeight: 0.6,
      seedOffset: 5100,
    });
    const ftLower = new Mesh(
      ftLowerGeom,
      new MeshStandardMaterial({
        color: TOWER_SURFACE_MATERIALS.plinthColor,
        map: result108.colorMap,
        bumpMap: result108.bumpMap,
        bumpScale: state.lowPower ? 0.1 : 0.22,
        roughness: 1,
        metalness: 0,
      }),
    );
    ((ftLower.position.y = result107 + 0.1),
      (ftLower.receiveShadow = !state.lowPower),
      (ftLower.castShadow = !state.lowPower),
      group7.add(ftLower));
    const ftUpperGeom = new CylinderGeometry(15.8, 17.2, 1.4, 56, 1);
    baseEdgeErode(ftUpperGeom, {
      jitterRadial: 0.22,
      jitterVertical: 0.07,
      halfHeight: 0.7,
      seedOffset: 5200,
    });
    const mesh37 = new Mesh(
      ftUpperGeom,
      new MeshStandardMaterial({
        color: TOWER_SURFACE_MATERIALS.plinthColor,
        map: result108.colorMap,
        bumpMap: result108.bumpMap,
        bumpScale: state.lowPower ? 0.1 : 0.22,
        roughness: 1,
        metalness: 0,
      }),
    );
    ((mesh37.position.y = result107 + 1),
      (mesh37.receiveShadow = !state.lowPower),
      (mesh37.castShadow = !state.lowPower),
      group7.add(mesh37));
    const ftSeam = new Mesh(
      new TorusGeometry(17.1, 0.25, 8, 56),
      new MeshStandardMaterial({
        color: TOWER_SURFACE_MATERIALS.ringColor,
        map: result108.colorMap,
        bumpMap: result108.bumpMap,
        bumpScale: state.lowPower ? 0.02 : 0.05,
        roughness: 0.96,
        metalness: 0.05,
      }),
    );
    ((ftSeam.rotation.x = -Math.PI / 2),
      (ftSeam.position.y = result107 + 0.72),
      (ftSeam.receiveShadow = !state.lowPower),
      group7.add(ftSeam));
    const ftSootGeom = new CylinderGeometry(18.7, 18.7, 0.6, 56, 1, !0),
      ftSoot = new Mesh(
        ftSootGeom,
        new MeshBasicMaterial({
          color: 1316882,
          transparent: !0,
          opacity: 0.18,
          side: DoubleSide,
          depthWrite: !1,
        }),
      );
    ((ftSoot.position.y = result107 + 0.1), group7.add(ftSoot));
    const ftButtressCount = state.profile.counts.buttresses,
      ftButtressMaterial = new MeshStandardMaterial({
        color: TOWER_SURFACE_MATERIALS.plinthColor,
        map: result108.colorMap,
        bumpMap: result108.bumpMap,
        bumpScale: state.lowPower ? 0.08 : 0.2,
        roughness: 1,
        metalness: 0,
      });
    for (let num447 = 0; num447 < ftButtressCount; num447 += 1) {
      const num253 =
          (num447 / ftButtressCount) * Math.PI * 2 + 0.18 * (tmpV65(5300 + num447) - 0.5),
        num254 = 1.1 + 0.6 * tmpV65(5310 + num447),
        num255 = 1.6 + 0.5 * tmpV65(5320 + num447),
        num256 = 0.9 + 0.35 * tmpV65(5330 + num447),
        mesh13 = new Mesh(new BoxGeometry(num254, num255, num256), ftButtressMaterial),
        num257 = 18.3;
      (mesh13.position.set(
        Math.cos(num253) * num257,
        result107 + 0.3 + 0.1 * tmpV65(5340 + num447),
        Math.sin(num253) * num257,
      ),
        (mesh13.rotation.y = num253 + Math.PI / 2 + 0.12 * (tmpV65(5350 + num447) - 0.5)),
        (mesh13.rotation.z = 0.06 * (tmpV65(5360 + num447) - 0.5)),
        (mesh13.castShadow = !state.lowPower),
        (mesh13.receiveShadow = !state.lowPower),
        group7.add(mesh13));
      classicTowerMeshes.push(mesh13);
      baseMasonryRecords.push(mesh13);
    }
    const mesh38 = new Mesh(
      new TorusGeometry(12.2, 0.6, 8, 40),
      new MeshStandardMaterial({
        color: TOWER_SURFACE_MATERIALS.ringColor,
        map: result108.colorMap,
        bumpMap: result108.bumpMap,
        bumpScale: state.lowPower ? 0.015 : 0.06,
        roughness: 0.98,
        metalness: 0.01,
      }),
    );
    ((mesh38.rotation.x = -Math.PI / 2), (mesh38.position.y = result107 + 1.6), group7.add(mesh38));
    const plinthTorchLight = new PointLight(16756340, 0.4, 16, 2);
    (plinthTorchLight.position.set(0, result107 + 3, 0), group7.add(plinthTorchLight));
    const cylinderGeometry3 = new CylinderGeometry(8.8, 12.2, 34, 34, 10, !0);
    (!(function (arg89, arg90 = {}) {
      const {
          topStartRatio: tmpV41 = 0.78,
          spread: tmpV42 = 0.95,
          inwardStrength: tmpV43 = 0.28,
          dropStrength: tmpV44 = 0.22,
          jitterStrength: tmpV45 = 0.22,
          shearStrength: tmpV46 = 0.12,
          biteStrength: tmpV47 = 0.12,
          maxInwardClamp: tmpV48 = 0.34,
          maxDropClamp: tmpV49 = 0.28,
          uvRelaxStrength: tmpV50 = 0.32,
        } = arg90,
        position4 = arg89.attributes.position,
        tmpV51 = arg89.attributes.uv || null;
      for (let num258 = 0; num258 < position4.count; num258 += 1) {
        const result24 = position4.getX(num258),
          result25 = position4.getY(num258),
          result26 = position4.getZ(num258),
          num99 = (result25 + 17) / 34;
        if (num99 < tmpV41) continue;
        const result27 = Math.atan2(result26, result24),
          result28 = smoothstep01(Math.max(0, 1 - tmpV68(result27, num511) / tmpV42));
        if (result28 <= 0) continue;
        const result29 = smoothstep01((num99 - tmpV41) / Math.max(1e-4, 1 - tmpV41)),
          qeResult10 = tmpV65(1.37 * num258 + 22.4),
          qeResult11 = tmpV65(2.11 * num258 + 40.2),
          qeResult12 = tmpV65(3.79 * num258 + 17.3),
          result30 = Math.min(tmpV48, result28 * result29 * tmpV43 * (0.84 + 0.52 * qeResult10)),
          result31 = Math.min(tmpV49, result28 * result29 * tmpV44 * (0.86 + 0.44 * qeResult11)),
          num100 = 0.62 * (qeResult10 - 0.5) * result28 * result29 * tmpV45,
          num101 = 0.58 * (qeResult11 - 0.5) * result28 * result29 * tmpV46,
          result32 = Math.min(
            0.58 * tmpV49,
            Math.max(0, qeResult12 - 0.58) * result28 * result29 * tmpV47,
          );
        (position4.setX(
          num258,
          result24 * (1 - result30) + Math.cos(result27 + 0.5 * Math.PI) * (num100 + num101),
        ),
          position4.setZ(
            num258,
            result26 * (1 - result30) +
              Math.sin(result27 + 0.5 * Math.PI) * num100 -
              Math.cos(result27) * num101,
          ));
        const num102 = result25 - 34 * (result31 + result32);
        if ((position4.setY(num258, num102), tmpV51)) {
          const result6 = tmpV51.getY(num258),
            result7 = clamp01((num102 + 17) / 34),
            result8 = Math.min(1, result28 * result29 * tmpV50);
          tmpV51.setY(num258, result6 + (result7 - result6) * result8);
        }
      }
      ((position4.needsUpdate = !0),
        tmpV51 && (tmpV51.needsUpdate = !0),
        arg89.computeVertexNormals());
    })(cylinderGeometry3, {
      topStartRatio: 0.76,
      spread: num512,
      inwardStrength: state.lowPower ? 0.18 : 0.24,
      dropStrength: state.lowPower ? 0.13 : 0.18,
      jitterStrength: state.lowPower ? 0.11 : 0.16,
      shearStrength: state.lowPower ? 0.05 : 0.08,
      biteStrength: state.lowPower ? 0.05 : 0.08,
      maxInwardClamp: state.lowPower ? 0.26 : 0.29,
      maxDropClamp: state.lowPower ? 0.2 : 0.24,
      uvRelaxStrength: state.lowPower ? 0.26 : 0.34,
    }),
      (function (arg91) {
        const position5 = arg91.attributes.position;
        for (let num259 = 0; num259 < position5.count; num259 += 1) {
          const result33 = position5.getX(num259),
            result34 = position5.getY(num259),
            result35 = position5.getZ(num259),
            num103 = (result34 + 17) / 34;
          if (num103 < 0.9) continue;
          const result36 = Math.atan2(result35, result33),
            result37 = Math.max(0, 1 - tmpV68(result36, num511) / 1.05);
          let num104 = 0;
          for (let num30 = 0; num30 < arr20.length; num30 += 1) {
            const tmpV = arr20[num30],
              num7 = Math.max(0, 1 - tmpV68(result36, tmpV.angle) / tmpV.spread) * tmpV.strength;
            num104 = Math.max(num104, num7);
          }
          const qeResult13 = tmpV65(
              3301 + 1.91 * Math.floor(((result36 + Math.PI) / (2 * Math.PI)) * 24),
            ),
            num105 = 0.45 * Math.max(0, qeResult13 - 0.55),
            qeResult14 = tmpV65(2.03 * num259 + 211.1),
            qeResult15 = tmpV65(2.87 * num259 + 307.4),
            result38 = clamp01((num103 - 0.9) / 0.1),
            num106 = (0.11 + 0.3 * qeResult14) * result38,
            num107 = result37 * (0.13 + 0.28 * qeResult15) * result38,
            num108 = num104 * (0.11 + 0.22 * qeResult14) * result38,
            num109 = num105 * (0.12 + 0.2 * num104 + 0.16 * result37) * result38,
            num110 = 5.2 * (num106 + num107 + num108 + 0.55 * num109),
            num111 = 0.52 * num106 + 0.88 * num107 + 1.02 * num108 + 0.4 * num109,
            tmpV5 = Math.sqrt(result33 * result33 + result35 * result35) || 1;
          (position5.setY(num259, result34 - num110),
            position5.setX(num259, result33 * (1 - num111 / tmpV5)),
            position5.setZ(num259, result35 * (1 - num111 / tmpV5)));
        }
        ((position5.needsUpdate = !0), arg91.computeVertexNormals());
      })(cylinderGeometry3));
    const mesh39 = new Mesh(
      cylinderGeometry3,
      new MeshStandardMaterial({
        color: TOWER_SURFACE_MATERIALS.shellColor,
        map: result108.colorMap,
        bumpMap: result108.bumpMap,
        bumpScale: state.lowPower
          ? TOWER_SURFACE_MATERIALS.shellBumpScale.lowPower
          : TOWER_SURFACE_MATERIALS.shellBumpScale.default,
        roughness: 0.92,
        metalness: 0.03,
      }),
    );
    if (
      ((mesh39.position.y = result107 + 18.5),
      (mesh39.castShadow = !state.lowPower),
      (mesh39.receiveShadow = !1),
      !state.lowPower)
    ) {
      const position6 = cylinderGeometry3.attributes.position,
        float32Array = new Float32Array(3 * position6.count),
        result88 = Math.atan2(18, 24);
      for (let num260 = 0; num260 < position6.count; num260 += 1) {
        const result39 = position6.getX(num260),
          result40 = position6.getZ(num260),
          result41 = Math.atan2(result40, result39);
        let result42 = Math.abs(result41 - result88);
        result42 > Math.PI && (result42 = 2 * Math.PI - result42);
        let num112 = 0.52 + 0.48 * (1 - result42 / Math.PI);
        const result43 = position6.getY(num260),
          num113 = Math.abs(result41 - num511) % (2 * Math.PI),
          result44 = Math.min(num113, 2 * Math.PI - num113),
          result45 = Math.max(0, 1 - result44 / 0.616),
          num114 = (result43 + 17) / 34;
        (num114 > 0.6 &&
          result45 > 0 &&
          (num112 *= 1 - result45 * Math.min(1, (num114 - 0.6) / 0.3) * 0.48),
          num114 < 0.15 && (num112 *= 0.85 + (num114 / 0.15) * 0.15),
          (float32Array[3 * num260] = num112),
          (float32Array[3 * num260 + 1] = num112),
          (float32Array[3 * num260 + 2] = num112));
      }
      (cylinderGeometry3.setAttribute("color", new BufferAttribute(float32Array, 3)),
        (mesh39.material.vertexColors = !0),
        (mesh39.material.needsUpdate = !0));
    }
    function tmpV70(arg92, arg93, arg94, arg95, arg96, arg97, arg98, arg99, arg100) {
      var result89 = (function (arg32, arg33, arg34, arg35, arg36, arg37, arg38) {
          for (var arr = [], tmpV12 = arg32, num261 = 0; num261 <= arg35; num261++) {
            var num262 = arg33 + (num261 / arg35) * (arg34 - arg33);
            ((tmpV12 += (tmpV65(arg38 + 7.3 * num261) - 0.5) * arg36),
              (tmpV12 += arg37 / arg35),
              arr.push({
                angle: tmpV12,
                y: num262,
              }));
          }
          return arr;
        })(arg92, arg93, arg94, arg95, arg96, arg97, arg100),
        result90 = (function (arg39, arg40, arg41, arg42, arg43) {
          if (arg39.length < 2) return null;
          for (
            var arr2 = [],
              arr3 = [],
              arr4 = [],
              num263 = 26 / 255,
              num264 = 16 / 255,
              num265 = 8 / 255,
              num266 = 122 / 255,
              num267 = 98 / 255,
              num268 = 72 / 255,
              num269 = 0;
            num269 < arg39.length;
            num269++
          ) {
            var tmpV13 = arg39[num269],
              num270 = 12.2 + (8.8 - 12.2) * ((tmpV13.y + 17) / 34),
              num271 = -Math.sin(tmpV13.angle),
              result65 = Math.cos(tmpV13.angle),
              result66 = Math.cos(tmpV13.angle),
              result67 = Math.sin(tmpV13.angle),
              result68 = Math.pow(
                Math.sin(Math.max(0.01, num269 / (arg39.length - 1)) * Math.PI),
                0.5,
              ),
              num272 = arg42 * result68,
              num273 = num270 + 0.06,
              num274 = num270 - arg43 * result68;
            if (
              (arr2.push(
                result66 * num273 - num271 * num272 * 1.4,
                tmpV13.y,
                result67 * num273 - result65 * num272 * 1.4,
              ),
              arr2.push(
                result66 * num274 - num271 * num272 * 0.3,
                tmpV13.y,
                result67 * num274 - result65 * num272 * 0.3,
              ),
              arr2.push(
                result66 * num274 + num271 * num272 * 0.3,
                tmpV13.y,
                result67 * num274 + result65 * num272 * 0.3,
              ),
              arr2.push(
                result66 * num273 + num271 * num272 * 1.4,
                tmpV13.y,
                result67 * num273 + result65 * num272 * 1.4,
              ),
              arr3.push(num266, num267, num268),
              arr3.push(num263, num264, num265),
              arr3.push(num263, num264, num265),
              arr3.push(num266, num267, num268),
              num269 > 0)
            ) {
              var num275 = 4 * (num269 - 1);
              (arr4.push(num275, num275 + 4, num275 + 1),
                arr4.push(num275 + 1, num275 + 4, num275 + 5),
                arr4.push(num275 + 1, num275 + 5, num275 + 2),
                arr4.push(num275 + 2, num275 + 5, num275 + 6),
                arr4.push(num275 + 2, num275 + 6, num275 + 3),
                arr4.push(num275 + 3, num275 + 6, num275 + 7));
            }
          }
          var bufferGeometry = new BufferGeometry();
          (bufferGeometry.setAttribute("position", new Float32BufferAttribute(arr2, 3)),
            bufferGeometry.setAttribute("color", new Float32BufferAttribute(arr3, 3)),
            bufferGeometry.setIndex(arr4),
            bufferGeometry.computeVertexNormals());
          var meshStandardMaterial = new MeshStandardMaterial({
            vertexColors: !0,
            roughness: 1,
            metalness: 0,
            side: DoubleSide,
            polygonOffset: !0,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          });
          return new Mesh(bufferGeometry, meshStandardMaterial);
        })(result89, 0, 0, arg98, arg99);
      return (
        result90 && ((result90.position.y = mesh39.position.y), group7.add(result90), classicTowerMeshes.push(result90)),
        result89
      );
    }
    group7.add(mesh39);
    var ptResult = tmpV70(num509, -13, 11, 28, 0.08, 0.25, 0.07, 0.15, 7700);
    if (ptResult) {
      var tmpV71 = ptResult[Math.floor(0.4 * ptResult.length)];
      tmpV70(tmpV71.angle + 0.03, tmpV71.y, tmpV71.y + 3.5, 6, 0.05, 0.1, 0.035, 0.08, 7710);
      var tmpV72 = ptResult[Math.floor(0.7 * ptResult.length)];
      tmpV70(tmpV72.angle - 0.02, tmpV72.y, tmpV72.y - 2, 5, 0.04, -0.12, 0.03, 0.07, 7715);
    }
    (tmpV70(num511 + 0.66, -3, 6, 12, 0.06, 0.28, 0.05, 0.12, 7750),
      tmpV70(num509 + 0.55 * Math.PI, 2, 3.5, 8, 0.03, 0.45, 0.04, 0.1, 7800),
      [
        [0.3, -8, -5, 5, 0.03, 0.06, 7820],
        [0.7, -2, 1, 4, 0.02, -0.05, 7825],
        [1.1, 4, 6, 5, 0.03, 0.08, 7830],
        [1.5, -6, -4, 4, 0.02, -0.1, 7835],
        [1.9, 0, 1.5, 3, 0.03, 0.18, 7840],
        [2.2, -10, -8, 4, 0.02, 0.04, 7845],
        [2.6, 6, 8, 4, 0.03, -0.06, 7850],
        [2.9, -4, -2, 4, 0.02, 0.12, 7855],
        [3.3, 1, 3, 4, 0.03, -0.08, 7860],
        [3.7, -12, -10, 4, 0.02, 0.05, 7865],
        [4, 3, 4.5, 3, 0.02, 0.22, 7870],
        [4.4, -7, -5, 4, 0.03, -0.04, 7875],
        [4.8, 8, 9.5, 3, 0.02, 0.06, 7880],
        [5.1, -1, 1, 4, 0.03, -0.14, 7885],
        [5.5, -14, -12, 4, 0.02, 0.03, 7890],
        [5.9, 5, 6.5, 3, 0.02, 0.1, 7895],
        [0.15, -3, -1, 3, 0.02, -0.18, 7900],
        [6, 0, 1, 3, 0.02, 0.25, 7905],
        [3.14, 2, 4, 4, 0.03, 0.05, 7910],
        [1.8, -15, -13, 4, 0.02, -0.03, 7915],
      ].forEach(function (arg101) {
        tmpV70(
          num509 + arg101[0],
          arg101[1],
          arg101[2],
          arg101[3],
          arg101[4],
          arg101[5],
          0.015 + 0.02 * tmpV65(arg101[6]),
          0.04 + 0.06 * tmpV65(arg101[6] + 1),
          arg101[6],
        );
      }));
    const mesh40 = new Mesh(
      new CylinderGeometry(8.2, 11.5, 33.6, 34, 6, !0),
      new MeshStandardMaterial({
        color: TOWER_SURFACE_MATERIALS.shellInnerColor,
        map: result108.colorMap,
        bumpMap: result108.bumpMap,
        bumpScale: state.lowPower ? 0.022 : 0.042,
        roughness: 0.98,
        metalness: 0,
        side: BackSide,
      }),
    );
    (mesh40.position.copy(mesh39.position),
      (mesh40.castShadow = !1),
      (mesh40.receiveShadow = !1),
      group7.add(mesh40),
      mesh39.position.y,
      (function (arg102) {
        const position7 = arg102.attributes.position;
        let num448 = -1 / 0;
        for (let num276 = 0; num276 < position7.count; num276 += 1)
          num448 = Math.max(num448, position7.getY(num276));
      })(cylinderGeometry3));
    let craterEmber = null;
    let crownEffectLight = null;
    {
      const craterRimLocal = tmpV69(cylinderGeometry3, num511),
        craterRimWorld = Number.isFinite(craterRimLocal)
          ? mesh39.position.y + craterRimLocal
          : mesh39.position.y + 14,
        craterEmber = new PointLight(15311978, 0.52, 14, 2);
      (craterEmber.position.set(Math.cos(num511) * 4, craterRimWorld - 1.5, Math.sin(num511) * 4),
        (craterEmber.castShadow = !1),
        group7.add(craterEmber));
      crownEffectLight = craterEmber;
    }
    const group11 = new Group();
    ((group11.position.y = mesh39.position.y), group7.add(group11));
    const meshStandardMaterial7 = new MeshStandardMaterial({
        color: 7227960,
        map: result108.colorMap,
        bumpMap: result108.bumpMap,
        bumpScale: state.lowPower ? 0.016 : 0.045,
        roughness: 0.95,
        metalness: 0.01,
      }),
      meshStandardMaterial8 = new MeshStandardMaterial({
        color: 4073504,
        map: result108.colorMap,
        bumpMap: result108.bumpMap,
        bumpScale: state.lowPower ? 0.018 : 0.038,
        roughness: 0.98,
        metalness: 0,
      }),
      tmpV73 = state.lowPower ? 14 : 28;
    const crownBrickRecords = [];
    for (let num449 = 0; num449 < tmpV73; num449 += 1) {
      const num277 = (num449 / tmpV73) * Math.PI * 2,
        result69 = Math.max(0, 1 - tmpV68(num277, num511) / 0.86);
      let num278 = 0;
      for (let num115 = 0; num115 < arr20.length; num115 += 1) {
        const tmpV2 = arr20[num115],
          num31 = Math.max(0, 1 - tmpV68(num277, tmpV2.angle) / tmpV2.spread) * tmpV2.strength;
        num278 = Math.max(num278, num31);
      }
      const num279 = 0.72 - 0.46 * result69 - 0.34 * num278;
      if (tmpV65(2001 + 2.13 * num449) > num279) continue;
      const qeResult43 = tmpV65(2101 + 1.73 * num449),
        qeResult44 = tmpV65(2201 + 2.41 * num449),
        qeResult45 = tmpV65(2301 + 3.07 * num449),
        qeResult46 = tmpV65(2401 + 3.81 * num449),
        num280 = 7.15 + 0.75 * qeResult43 - 0.34 * result69 - 0.2 * num278,
        num281 = 1.15 + 0.88 * qeResult44,
        num282 = 0.54 + 0.68 * qeResult45,
        num283 = 0.9 + 0.66 * qeResult46,
        mesh14 = new Mesh(new BoxGeometry(num281, num282, num283), meshStandardMaterial7),
        gtResult = tmpV69(cylinderGeometry3, num277);
      if (!Number.isFinite(gtResult)) continue;
      const num284 = gtResult - 0.72,
        num285 = gtResult + 0.04,
        num286 = gtResult - (0.26 + 0.18 * result69 + 0.12 * num278 + 0.07 * qeResult44);
      if (
        (mesh14.position.set(
          Math.cos(num277) * num280,
          Math.min(num285, Math.max(num284, num286)),
          Math.sin(num277) * num280,
        ),
        (mesh14.rotation.y = -num277 + 0.5 * Math.PI + 0.12 * (qeResult45 - 0.5)),
        (mesh14.rotation.z = (qeResult44 - 0.5) * (0.14 + 0.24 * result69 + 0.18 * num278)),
        (mesh14.rotation.x = (qeResult46 - 0.5) * (0.1 + 0.08 * num278)),
        (mesh14.castShadow = !state.lowPower),
        (mesh14.receiveShadow = !1),
        group11.add(mesh14),
        qeResult43 > 0.73 && result69 < 0.66 && num278 < 0.75)
      ) {
        const mesh4 = new Mesh(
            new BoxGeometry(0.42 * num281, 0.42 * num282, 0.58 * num283),
            meshStandardMaterial7,
          ),
          num116 = -Math.sin(num277),
          result46 = Math.cos(num277),
          num117 = 0.05 + 0.06 * qeResult45;
        (mesh4.position.set(
          mesh14.position.x + num116 * (0.08 + 0.12 * qeResult46),
          mesh14.position.y + 0.08 * num282 - num117,
          mesh14.position.z + result46 * (0.08 + 0.12 * qeResult45),
        ),
          (mesh4.rotation.y = mesh14.rotation.y + 0.1 * (qeResult46 - 0.5)),
          (mesh4.rotation.z = 0.8 * mesh14.rotation.z),
          (mesh4.castShadow = !state.lowPower),
          (mesh4.receiveShadow = !1),
          group11.add(mesh4));
      }
      if (!constructionDetailDisabled) {
        crownBrickRecords.push({
          mesh: mesh14,
          dimensions: { x: num281, y: num282, z: num283 },
        });
      }
    }
    const biteShardCount = state.lowPower ? 5 : 9;
    for (let num450 = 0; num450 < biteShardCount; num450 += 1) {
      const tmpV14 = biteShardCount > 1 ? num450 / (biteShardCount - 1) : 0.5,
        qeResult47 = tmpV65(6101 + 1.73 * num450),
        qeResult48 = tmpV65(6151 + 2.41 * num450),
        qeResult49 = tmpV65(6201 + 3.07 * num450),
        qeResult50 = tmpV65(6251 + 3.79 * num450),
        num287 = num511 + (tmpV14 - 0.5) * 1.16 + 0.08 * (qeResult47 - 0.5),
        gtResult2 = tmpV69(cylinderGeometry3, num287);
      if (!Number.isFinite(gtResult2)) continue;
      const num288 = 0.5 + 0.3 * qeResult48,
        num289 = 0.3 + 0.2 * qeResult49,
        num290 = 0.35 + 0.25 * qeResult50,
        num291 = 7.6 + 0.35 * (qeResult48 - 0.5),
        mesh15 = new Mesh(new BoxGeometry(num288, num289, num290), meshStandardMaterial7);
      (mesh15.position.set(
        Math.cos(num287) * num291,
        gtResult2 - 0.1 - 0.18 * qeResult47,
        Math.sin(num287) * num291,
      ),
        (mesh15.rotation.y = -num287 + 0.5 * Math.PI + 0.18 * (qeResult49 - 0.5)),
        (mesh15.rotation.z = 0.35 * (qeResult48 - 0.5)),
        (mesh15.rotation.x = 0.14 * (qeResult50 - 0.5)),
        (mesh15.castShadow = !state.lowPower),
        (mesh15.receiveShadow = !1),
        group11.add(mesh15));
    }
    const reliefBrickMaterial = new MeshStandardMaterial({
        color: TOWER_SURFACE_MATERIALS.shellColor,
        map: result108.colorMap,
        bumpMap: result108.bumpMap,
        bumpScale: state.lowPower
          ? TOWER_SURFACE_MATERIALS.shellBumpScale.lowPower
          : TOWER_SURFACE_MATERIALS.shellBumpScale.default,
        roughness: 0.92,
        metalness: 0.03,
      }),
      reliefBrickCount = state.profile.counts.reliefBricks;
    const reliefBrickRecords = [];
    for (let num451 = 0; num451 < reliefBrickCount; num451 += 1) {
      const qeResult51 = tmpV65(7301 + 1.53 * num451),
        qeResult52 = tmpV65(7351 + 2.17 * num451),
        qeResult53 = tmpV65(7401 + 2.83 * num451),
        qeResult54 = tmpV65(7451 + 3.37 * num451),
        qeResult55 = tmpV65(7501 + 4.11 * num451),
        angle = qeResult51 * Math.PI * 2,
        biteDist = tmpV68(angle, num511);
      if (biteDist < 0.78) continue;
      const yRatio = 0.44 + 0.42 * qeResult52,
        localY = -17 + 34 * yRatio,
        shellR = 12.2 - 3.4 * yRatio,
        num292 = 0.55 + 0.45 * qeResult53,
        num293 = 0.3 + 0.2 * qeResult54,
        num294 = 0.18 + 0.22 * qeResult55,
        radial = shellR + num294 * 0.42,
        mesh = new Mesh(new BoxGeometry(num292, num293, num294), reliefBrickMaterial);
      (mesh.position.set(
        Math.cos(angle) * radial,
        localY + 0.22 * (qeResult55 - 0.5),
        Math.sin(angle) * radial,
      ),
        (mesh.rotation.y = -angle + 0.5 * Math.PI + 0.06 * (qeResult53 - 0.5)),
        (mesh.rotation.z = 0.05 * (qeResult54 - 0.5)),
        (mesh.castShadow = !state.lowPower),
        (mesh.receiveShadow = !state.lowPower),
        group11.add(mesh));
      reliefBrickRecords.push({ mesh, dimensions: { x: num292, y: num293, z: num294 } });
    }
    brickDetail = createBrickDetailController({
      profile: state.profile,
      disabled: brickDetailDisabled,
      records: [...reliefBrickRecords, ...crownBrickRecords],
      onChange() {
        frameScheduler?.invalidate();
      },
      report(status) {
        if (qualityDebug) qualityDebug.bricks = status;
      },
    });
    brickDetail.setDetailMaps(latestBrickMaps);
    subsystemRegistry.register(brickDetail);
    const tmpV74 = state.lowPower ? 12 : 26;
    for (let num452 = 0; num452 < tmpV74; num452 += 1) {
      const qeResult56 = tmpV65(3501 + 1.61 * num452),
        qeResult57 = tmpV65(3601 + 2.17 * num452),
        qeResult58 = tmpV65(3701 + 2.83 * num452),
        qeResult59 = tmpV65(3801 + 3.37 * num452),
        num295 = qeResult56 * Math.PI * 2,
        result70 = Math.max(0, 1 - tmpV68(num295, num511) / 0.9);
      let num296 = 0;
      for (let num118 = 0; num118 < arr20.length; num118 += 1) {
        const tmpV3 = arr20[num118];
        num296 = Math.max(
          num296,
          Math.max(0, 1 - tmpV68(num295, tmpV3.angle) / tmpV3.spread) * tmpV3.strength,
        );
      }
      if (qeResult57 > 0.82 - 0.28 * result70 - 0.18 * num296) continue;
      const gtResult3 = tmpV69(cylinderGeometry3, num295);
      if (!Number.isFinite(gtResult3)) continue;
      const num297 = 0.28 + 0.56 * qeResult57,
        num298 = 0.18 + 0.32 * qeResult58,
        num299 = 0.22 + 0.48 * qeResult59,
        num300 = 7.05 + 0.95 * qeResult58 - 0.32 * result70,
        mesh16 = new Mesh(new BoxGeometry(num297, num298, num299), meshStandardMaterial7),
        num301 = 0.16 + 0.09 * result70 + 0.07 * num296;
      (mesh16.position.set(
        Math.cos(num295) * num300,
        gtResult3 - num301,
        Math.sin(num295) * num300,
      ),
        (mesh16.rotation.y = -num295 + 0.5 * Math.PI + 0.18 * (qeResult58 - 0.5)),
        (mesh16.rotation.z = 0.24 * (qeResult59 - 0.5)),
        (mesh16.rotation.x = 0.12 * (qeResult57 - 0.5)),
        (mesh16.castShadow = !state.lowPower),
        (mesh16.receiveShadow = !1),
        group11.add(mesh16));
    }
    const arr21 = [
        new MeshStandardMaterial({
          color: 3022356,
          map: result108.colorMap,
          bumpMap: result108.bumpMap,
          bumpScale: 0.03,
          roughness: 0.98,
        }),
        new MeshStandardMaterial({
          color: 5913128,
          map: result108.colorMap,
          bumpMap: result108.bumpMap,
          bumpScale: 0.03,
          roughness: 0.96,
        }),
        new MeshStandardMaterial({
          color: 7231554,
          map: result108.colorMap,
          bumpMap: result108.bumpMap,
          bumpScale: 0.025,
          roughness: 0.94,
        }),
        new MeshStandardMaterial({
          color: 4866104,
          map: result108.colorMap,
          bumpMap: result108.bumpMap,
          bumpScale: 0.028,
          roughness: 0.97,
        }),
      ],
      tmpV75 = state.lowPower ? 10 : 28;
    for (let num453 = 0; num453 < tmpV75; num453++) {
      const num302 = 5500 + 37 * num453,
        qeResult60 = tmpV65(num302),
        qeResult61 = tmpV65(num302 + 11),
        qeResult62 = tmpV65(num302 + 23),
        qeResult63 = tmpV65(num302 + 37),
        qeResult64 = tmpV65(num302 + 49),
        num303 = num511 + (qeResult60 - 0.5) * num512 * 1.2,
        num304 = qeResult61 > 0.4,
        num305 = 0.4 + 0.8 * qeResult62,
        num306 = 0.25 + 0.5 * qeResult63,
        num307 = 0.35 + 0.6 * qeResult64,
        tmpV15 =
          num453 % 3 == 0
            ? arr21[num453 % arr21.length]
            : num304
              ? meshStandardMaterial8
              : meshStandardMaterial7,
        mesh17 = new Mesh(new BoxGeometry(num305, num306, num307), tmpV15),
        gtResult4 = tmpV69(cylinderGeometry3, num303);
      if (!Number.isFinite(gtResult4)) continue;
      const tmpV16 = num304 ? 3.5 + 3.5 * qeResult62 : 7.2 + 2.2 * qeResult63,
        num308 = gtResult4 - 5.5 * (0.7 * qeResult61 + 0.5 * qeResult62) - 2 * qeResult64;
      (mesh17.position.set(Math.cos(num303) * tmpV16, num308, Math.sin(num303) * tmpV16),
        mesh17.rotation.set(
          1 * (qeResult60 - 0.5),
          0.8 * (qeResult61 - 0.5) - num303,
          0.9 * (qeResult62 - 0.5),
        ),
        (mesh17.castShadow = !state.lowPower),
        group11.add(mesh17));
    }
    const tmpV76 = state.lowPower ? 8 : 22;
    for (let num454 = 0; num454 < tmpV76; num454++) {
      const num309 = 7700 + 41 * num454,
        qeResult65 = tmpV65(num309),
        qeResult66 = tmpV65(num309 + 13),
        qeResult67 = tmpV65(num309 + 29),
        qeResult68 = tmpV65(num309 + 43),
        num310 = num511 + (qeResult65 - 0.5) * num512 * 1,
        num311 = 0.3 + 0.7 * qeResult66,
        tmpV17 = arr21[Math.floor(qeResult67 * arr21.length)],
        tmpV18 =
          qeResult68 > 0.5
            ? new DodecahedronGeometry(num311, 0)
            : new BoxGeometry(1.2 * num311, 0.6 * num311, 0.9 * num311),
        mesh18 = new Mesh(tmpV18, tmpV17),
        gtResult5 = tmpV69(cylinderGeometry3, num310);
      if (!Number.isFinite(gtResult5)) continue;
      const num312 = 6.5 + 3 * qeResult66;
      (mesh18.position.set(
        Math.cos(num310) * num312,
        gtResult5 - 3 * qeResult67 - 0.5,
        Math.sin(num310) * num312,
      ),
        mesh18.rotation.set(1.5 * qeResult65, 2 * qeResult66, 1.2 * qeResult67),
        (mesh18.castShadow = !state.lowPower),
        group11.add(mesh18));
    }
    const tmpV77 = state.lowPower ? 8 : 24;
    for (let num455 = 0; num455 < tmpV77; num455++) {
      const num313 = 6600 + 29 * num455,
        qeResult69 = tmpV65(num313),
        qeResult70 = tmpV65(num313 + 13),
        qeResult71 = tmpV65(num313 + 27),
        qeResult72 = tmpV65(num313 + 41),
        num314 = num511 + (qeResult69 - 0.5) * num512 * 1,
        num315 = 0.12 + 0.35 * qeResult70,
        num316 = 0.08 + 0.22 * qeResult71,
        num317 = 0.1 + 0.28 * qeResult72,
        tmpV19 = arr21[Math.floor(qeResult70 * arr21.length)],
        mesh19 = new Mesh(new BoxGeometry(num315, num316, num317), tmpV19),
        gtResult6 = tmpV69(cylinderGeometry3, num314);
      if (!Number.isFinite(gtResult6)) continue;
      const num318 = 4.5 + 4.5 * qeResult70;
      (mesh19.position.set(
        Math.cos(num314) * num318,
        gtResult6 - 7 * qeResult71 - 0.8,
        Math.sin(num314) * num318,
      ),
        mesh19.rotation.set(1.4 * qeResult69, 1.8 * qeResult70, 1.2 * qeResult71),
        group11.add(mesh19));
    }
    const result109 = (function () {
        const canvas11 = document.createElement("canvas");
        ((canvas11.width = 128), (canvas11.height = 128));
        const ctx11 = canvas11.getContext("2d");
        for (let num319 = 0; num319 < 5; num319++) {
          const num119 = 64 + (num319 % 2 == 0 ? -14 : 12) * (num319 < 2 ? 1 : -1),
            num120 = 64 + (num319 < 3 ? -10 : 14),
            gradient4 = ctx11.createRadialGradient(num119, num120, 0, 64, 64, 56);
          (gradient4.addColorStop(0, "rgba(255, 255, 255, " + (0.28 - 0.035 * num319) + ")"),
            gradient4.addColorStop(0.5, "rgba(255, 255, 255, " + (0.15 - 0.02 * num319) + ")"),
            gradient4.addColorStop(1, "rgba(255, 255, 255, 0)"),
            (ctx11.fillStyle = gradient4),
            ctx11.fillRect(0, 0, 128, 128));
        }
        const canvasTexture10 = new CanvasTexture(canvas11);
        return (setSrgbTexture(canvasTexture10), canvasTexture10);
      })(),
      plumeColumns = state.profile.counts.plumeColumns,
      arr22 = [];
    for (let num456 = 0; num456 < plumeColumns; num456++) {
      const num320 = 8200 + 31 * num456,
        qeResult73 = tmpV65(num320),
        qeResult74 = tmpV65(num320 + 17),
        qeResult75 = tmpV65(num320 + 33),
        qeResult76 = tmpV65(num320 + 49),
        num321 = num511 + (qeResult73 - 0.5) * 0.58,
        num322 = 1.4 + 1.9 * qeResult74,
        gtResult7 = tmpV69(cylinderGeometry3, num321),
        num323 = (Number.isFinite(gtResult7) ? gtResult7 : 14) + 0.45 + 2.6 * qeResult75,
        sprite8 = new Sprite(
          new SpriteMaterial({
            map: result109,
            color: 14932427,
            transparent: !0,
            opacity: 0.38 + 0.25 * qeResult76,
            depthWrite: !1,
            fog: !1,
          }),
        ),
        num324 = 1.45 + 2.0 * qeResult75;
      (sprite8.scale.set(0.95 * num324, 1.2 * num324, 1),
        sprite8.position.set(Math.cos(num321) * num322, num323, Math.sin(num321) * num322),
        group11.add(sprite8),
        arr22.push({
          mesh: sprite8,
          baseY: num323,
          phase: qeResult73 * Math.PI * 2,
          driftSpeed: 0.2 + 0.4 * qeResult74,
          riseSpeed: 0.55 + 0.5 * qeResult75,
          cycleHeight: 5 + 2.5 * qeResult76,
          baseOpacity: 0.38 + 0.25 * qeResult76,
          baseScaleX: 0.95 * num324,
          baseScaleY: 1.2 * num324,
          angle: num321,
          radius: num322,
          haze: 0,
        }));
    }
    const craterHazeCount = state.profile.counts.craterHaze;
    for (let num457 = 0; num457 < craterHazeCount; num457 += 1) {
      const qeResult77 = tmpV65(8701 + 1.91 * num457),
        qeResult78 = tmpV65(8751 + 2.37 * num457),
        qeResult79 = tmpV65(8801 + 3.07 * num457),
        qeResult80 = tmpV65(8851 + 3.77 * num457),
        num325 = num511 + (qeResult77 - 0.5) * 1.05,
        num326 = 1.8 + 2.4 * qeResult78,
        gtResult8 = tmpV69(cylinderGeometry3, num325),
        num327 = (Number.isFinite(gtResult8) ? gtResult8 : 14) + 0.05 + 1.1 * qeResult79,
        sprite9 = new Sprite(
          new SpriteMaterial({
            map: result109,
            color: 13089448,
            transparent: !0,
            opacity: 0.22 + 0.14 * qeResult80,
            depthWrite: !1,
            fog: !1,
          }),
        ),
        num328 = 2.8 + 1.6 * qeResult79;
      (sprite9.scale.set(1.15 * num328, 0.85 * num328, 1),
        sprite9.position.set(Math.cos(num325) * num326, num327, Math.sin(num325) * num326),
        group11.add(sprite9),
        arr22.push({
          mesh: sprite9,
          baseY: num327,
          phase: qeResult77 * Math.PI * 2,
          driftSpeed: 0.08 + 0.12 * qeResult78,
          riseSpeed: 0.18 + 0.2 * qeResult79,
          cycleHeight: 3 + 1.5 * qeResult80,
          baseOpacity: 0.22 + 0.14 * qeResult80,
          baseScaleX: 1.15 * num328,
          baseScaleY: 0.85 * num328,
          angle: num325,
          radius: num326,
          haze: 1,
        }));
    }
    const plumeSystem = registerDecorativeSystem({
      getCenter(target) {
        return group11.getWorldPosition(target);
      },
      group: group11,
      importance: "nearAtmosphere",
      name: "plumes",
      radius: 24,
    });
    arr22.forEach((arg103) => {
      if (arg103.mesh) {
        arg103.mesh.castShadow = !1;
        arg103.mesh.receiveShadow = !1;
      }
    });
    const group12 = new Group();
    group4.add(group12);
    const meshStandardMaterial9 = new MeshStandardMaterial({
        color: 10122585,
        roughness: 0.97,
        metalness: 0.01,
      }),
      tmpV78 = state.lowPower ? 16 : 30;
    for (let num458 = 0; num458 < tmpV78; num458 += 1) {
      const qeResult81 = tmpV65(1.41 * num458 + 7.2),
        qeResult82 = tmpV65(2.03 * num458 + 9.4),
        qeResult83 = tmpV65(2.89 * num458 + 13.7),
        num329 = 0.22 + 0.78 * qeResult81,
        mesh20 = new Mesh(new DodecahedronGeometry(num329, 0), meshStandardMaterial9),
        num330 = 12 + 14 * qeResult82,
        num331 = 10 * (qeResult83 - 0.5),
        result71 = Math.cos(num511),
        result72 = Math.sin(num511),
        num332 = result71 * num330 + -result72 * num331,
        num333 = result72 * num330 + result71 * num331;
      (mesh20.position.set(num332, groundHeight(num332, num333) + 0.2 * num329, num333),
        mesh20.rotation.set(
          tmpV65(4.17 * num458 + 5.1) * Math.PI,
          tmpV65(4.89 * num458 + 1.8) * Math.PI,
          tmpV65(5.63 * num458 + 3.6) * Math.PI,
        ),
        (mesh20.castShadow = !state.lowPower),
        (mesh20.receiveShadow = !state.lowPower),
        group12.add(mesh20));
    }
    const meshStandardMaterial10 = new MeshStandardMaterial({
        color: 9398605,
        roughness: 0.96,
        metalness: 0.01,
      }),
      tmpV79 = state.lowPower ? 7 : 13;
    for (let num459 = 0; num459 < tmpV79; num459 += 1) {
      const qeResult84 = tmpV65(7.17 * num459 + 4.8),
        qeResult85 = tmpV65(8.41 * num459 + 2.9),
        qeResult86 = tmpV65(9.73 * num459 + 6.1),
        mesh21 = new Mesh(
          new BoxGeometry(
            0.28 + 0.6 * qeResult84,
            0.14 + 0.35 * qeResult85,
            0.5 + 0.8 * qeResult86,
          ),
          meshStandardMaterial10,
        ),
        num334 = num511 + 1 * (qeResult84 - 0.5),
        num335 = 13 + 12 * qeResult85,
        num336 = Math.cos(num334) * num335,
        num337 = Math.sin(num334) * num335;
      (mesh21.position.set(num336, groundHeight(num336, num337) + 0.05, num337),
        mesh21.rotation.set(
          0.35 * (qeResult84 - 0.5),
          num334 + Math.PI * (0.15 + 0.35 * qeResult85),
          0.5 * (qeResult86 - 0.5),
        ),
        (mesh21.castShadow = !state.lowPower),
        (mesh21.receiveShadow = !state.lowPower),
        group12.add(mesh21));
    }
    const tmpV80 = state.lowPower ? 4 : 6,
      arr23 = [],
      group13 = new Group(),
      cylinderGeometry4 = new CylinderGeometry(0.08, 0.15, 2.5, state.lowPower ? 4 : 6),
      meshStandardMaterial11 = new MeshStandardMaterial({
        color: 5913896,
        roughness: 0.95,
        metalness: 0.01,
      });
    function setBrazierRecordVisibility(record, visible) {
      const stableVisible = Boolean(visible);
      record.stand.visible = stableVisible;
      record.flameCore.visible = stableVisible;
      record.flameOuter.visible = stableVisible;
      if (record.flameHot) record.flameHot.visible = stableVisible;
      if (record.groundRing) record.groundRing.visible = stableVisible;
      if (record.light) record.light.visible = stableVisible;
      record.embers.forEach((ember) => {
        ember.mesh.visible = stableVisible;
      });
    }
    function tmpV81(arg104, arg105, arg106, arg107) {
      const canvas12 = document.createElement("canvas");
      ((canvas12.width = 64), (canvas12.height = 96));
      const ctx12 = canvas12.getContext("2d"),
        gradient15 = ctx12.createRadialGradient(32, 52, 0, 32, 48, 40);
      (gradient15.addColorStop(0, arg104),
        gradient15.addColorStop(0.25, arg105),
        gradient15.addColorStop(0.55, arg106),
        gradient15.addColorStop(1, "rgba(200, 60, 10, 0)"),
        (ctx12.fillStyle = gradient15),
        ctx12.beginPath(),
        ctx12.moveTo(32, 6),
        ctx12.bezierCurveTo(12, 36, 6, 58, 14, 76),
        ctx12.bezierCurveTo(18, 86, 46, 86, 50, 76),
        ctx12.bezierCurveTo(58, 58, 52, 36, 32, 6),
        ctx12.closePath(),
        ctx12.fill());
      const gradient16 = ctx12.createRadialGradient(32, 22, 0, 32, 28, 16);
      (gradient16.addColorStop(0, arg107),
        gradient16.addColorStop(1, "rgba(255, 200, 80, 0)"),
        (ctx12.fillStyle = gradient16),
        ctx12.beginPath(),
        ctx12.ellipse(32, 26, 10, 18, 0, 0, 2 * Math.PI),
        ctx12.fill());
      const baseGrad = ctx12.createRadialGradient(32, 78, 0, 32, 78, 14);
      (baseGrad.addColorStop(0, "rgba(180, 210, 255, 0.5)"),
        baseGrad.addColorStop(0.6, "rgba(150, 190, 255, 0.2)"),
        baseGrad.addColorStop(1, "rgba(120, 170, 255, 0)"),
        (ctx12.fillStyle = baseGrad),
        ctx12.beginPath(),
        ctx12.ellipse(32, 78, 8, 6, 0, 0, 2 * Math.PI),
        ctx12.fill());
      const canvasTexture11 = new CanvasTexture(canvas12);
      return (setSrgbTexture(canvasTexture11), canvasTexture11);
    }
    function makeHotCoreTexture() {
      const canvas13 = document.createElement("canvas");
      ((canvas13.width = 32), (canvas13.height = 48));
      const ctx13 = canvas13.getContext("2d");
      if (!ctx13) return null;
      const gradient17 = ctx13.createRadialGradient(16, 28, 0, 16, 28, 16);
      (gradient17.addColorStop(0, "rgba(255, 255, 255, 1)"),
        gradient17.addColorStop(0.35, "rgba(255, 248, 220, 0.8)"),
        gradient17.addColorStop(0.75, "rgba(255, 220, 160, 0.3)"),
        gradient17.addColorStop(1, "rgba(255, 200, 120, 0)"),
        (ctx13.fillStyle = gradient17),
        ctx13.beginPath(),
        ctx13.ellipse(16, 28, 9, 17, 0, 0, 2 * Math.PI),
        ctx13.fill());
      const canvasTexture12 = new CanvasTexture(canvas13);
      return (setSrgbTexture(canvasTexture12), canvasTexture12);
    }
    function makeEmberTexture() {
      const canvas14 = document.createElement("canvas");
      ((canvas14.width = 32), (canvas14.height = 32));
      const ctx14 = canvas14.getContext("2d");
      if (!ctx14) return null;
      const gradient18 = ctx14.createRadialGradient(16, 16, 0, 16, 16, 14);
      (gradient18.addColorStop(0, "rgba(255, 240, 200, 1)"),
        gradient18.addColorStop(0.4, "rgba(255, 160, 60, 0.7)"),
        gradient18.addColorStop(1, "rgba(200, 60, 10, 0)"),
        (ctx14.fillStyle = gradient18),
        ctx14.beginPath(),
        ctx14.arc(16, 16, 14, 0, 2 * Math.PI),
        ctx14.fill());
      const canvasTexture13 = new CanvasTexture(canvas14);
      return (setSrgbTexture(canvasTexture13), canvasTexture13);
    }
    const _tResult = tmpV81(
        "rgba(255, 245, 200, 0.95)",
        "rgba(255, 200, 80, 0.7)",
        "rgba(255, 130, 30, 0.3)",
        "rgba(255, 250, 220, 0.8)",
      ),
      _tResult2 = tmpV81(
        "rgba(255, 180, 60, 0.5)",
        "rgba(255, 120, 20, 0.3)",
        "rgba(200, 60, 10, 0.1)",
        "rgba(255, 200, 100, 0.3)",
      ),
      hotCoreTex = makeHotCoreTexture(),
      emberTex = makeEmberTexture(),
      num513 = num511 + 0.616,
      num514 = 2 * Math.PI - 1.232;
    for (let num460 = 0; num460 < tmpV80; num460 += 1) {
      const num338 = num513 + (num460 + 0.5) * (num514 / tmpV80),
        num339 = 13.2 * Math.cos(num338),
        num340 = 13.2 * Math.sin(num338),
        result73 = Math.max(groundHeight(num339, num340), result107),
        mesh22 = new Mesh(cylinderGeometry4, meshStandardMaterial11);
      (mesh22.position.set(num339, result73 + 2.4, num340),
        (mesh22.rotation.x = 0.08 * (tmpV65(4001 + num460) - 0.5)),
        (mesh22.rotation.z = 0.08 * (tmpV65(4011 + num460) - 0.5)),
        group13.add(mesh22));
      const visibilityAnchor = new Group();
      visibilityAnchor.position.set(num339, result73 + 2.4, num340);
      group13.add(visibilityAnchor);
      const sprite10 = new Sprite(
        new SpriteMaterial({
          map: _tResult,
          transparent: !0,
          opacity: 0.85,
          depthWrite: !1,
          blending: AdditiveBlending,
        }),
      );
      (sprite10.position.set(num339, result73 + 3.9, num340),
        sprite10.scale.set(0.8, 1.4, 1),
        group13.add(sprite10));
      const sprite11 = new Sprite(
        new SpriteMaterial({
          map: _tResult2,
          transparent: !0,
          opacity: 0.45,
          depthWrite: !1,
          blending: AdditiveBlending,
        }),
      );
      (sprite11.position.set(num339, result73 + 3.7, num340),
        sprite11.scale.set(1.6, 2.4, 1),
        group13.add(sprite11));
      const hot = hotCoreTex
        ? new Sprite(
            new SpriteMaterial({
              map: hotCoreTex,
              transparent: !0,
              opacity: 0.9,
              depthWrite: !1,
              blending: AdditiveBlending,
            }),
          )
        : null;
      hot &&
        (hot.position.set(num339, result73 + 4.05, num340),
        hot.scale.set(0.4, 0.7, 1),
        group13.add(hot));
      const gRing = new Mesh(
        new RingGeometry(0.3, 2.5, 24),
        new MeshBasicMaterial({
          color: 16752704,
          transparent: !0,
          opacity: 0.08,
          side: DoubleSide,
          depthWrite: !1,
          blending: AdditiveBlending,
        }),
      );
      ((gRing.rotation.x = -Math.PI / 2),
        gRing.position.set(num339, result73 + 0.05, num340),
        group13.add(gRing));
      const embers = [];
      if (!state.lowPower && emberTex) {
        const num121 = 5;
        for (let num32 = 0; num32 < num121; num32 += 1) {
          const sprite3 = new Sprite(
            new SpriteMaterial({
              map: emberTex,
              transparent: !0,
              opacity: 0,
              depthWrite: !1,
              blending: AdditiveBlending,
            }),
          );
          const num8 = 0.08 + 0.08 * tmpV65(4101 + num460 * 7 + num32);
          (sprite3.scale.set(num8, num8, 1),
            sprite3.position.set(num339, result73 + 3.9, num340),
            group13.add(sprite3),
            embers.push({
              mesh: sprite3,
              phase: tmpV65(4111 + num460 * 7 + num32) * Math.PI * 2,
              speed: 0.9 + 0.5 * tmpV65(4121 + num460 * 7 + num32),
              driftX: 0.4 * (tmpV65(4131 + num460 * 7 + num32) - 0.5),
              driftZ: 0.4 * (tmpV65(4141 + num460 * 7 + num32) - 0.5),
              size: num8,
            }));
        }
      }
      const cfg = {
        stand: mesh22,
        flameCore: sprite10,
        flameOuter: sprite11,
        flameHot: hot,
        groundRing: gRing,
        embers: embers,
        baseFlameY: result73 + 3.9,
        baseX: num339,
        baseZ: num340,
        baseGroundY: result73 + 0.05,
        phase: tmpV65(4021 + num460) * Math.PI * 2,
        visibilityAnchor,
      };
      if (!state.lowPower) {
        const result47 = Math.atan2(18, 24);
        let result48 = Math.abs(num338 - result47);
        result48 > Math.PI && (result48 = 2 * Math.PI - result48);
        const num122 = result48 / Math.PI,
          num123 = 0.3 + 0.9 * num122,
          num124 = 8 + 10 * num122,
          pointLight = new PointLight(16752704, num123, num124, 2);
        (pointLight.position.set(num339, result73 + 3.8, num340),
          group13.add(pointLight),
          (cfg.light = pointLight),
          (cfg.baseIntensity = num123));
      }
      cfg.visibilitySystem = registerDecorativeSystem({
        getCenter(target) {
          return visibilityAnchor.getWorldPosition(target);
        },
        importance: "nearAtmosphere",
        name: `brazier-${num460}`,
        radius: 4.5,
        setVisible(visible) {
          setBrazierRecordVisibility(cfg, visible);
        },
      });
      arr23.push(cfg);
    }
    group4.add(group13);
    setShadowParticipation(group13);
    towerSystem.setPracticalLights([
      { light: plinthTorchLight, baseIntensity: 0.48 },
      { light: craterEmber, baseIntensity: 0.6 },
      ...arr23.map((record) => ({
        baseIntensity: record.baseIntensity,
        disableOnLow: true,
        light: record.light,
      })),
    ]);
    const tmpV82 = state.lowPower ? 4 : 8,
      group14 = new Group();
    const PLANT = plantPalette || {
      leafDeep: "#2c3c18",
      leafMid: "#4a6028",
      leafTip: "#8aa653",
      leafVein: "rgba(30, 40, 18, 0.45)",
      leafHighlight: "rgba(220, 230, 180, 0.3)",
      leafShadow: "rgba(14, 20, 8, 0.35)",
      grassRoot: "#3d5020",
      grassTip: "#8ba85a",
      grassShadow: "rgba(12, 18, 6, 0.35)",
    };
    function tmpV83(arg108) {
      const num461 = 128,
        canvas15 = document.createElement("canvas");
      ((canvas15.width = num461), (canvas15.height = num461));
      const ctx15 = canvas15.getContext("2d");
      if (!ctx15) return null;
      ctx15.clearRect(0, 0, num461, num461);
      const num462 = 64,
        num463 = 64,
        haloGrad = ctx15.createRadialGradient(num462, num463, 0, num462, num463, 58);
      (haloGrad.addColorStop(0, "rgba(30, 42, 18, 0.22)"),
        haloGrad.addColorStop(0.6, "rgba(30, 42, 18, 0.06)"),
        haloGrad.addColorStop(1, "rgba(30, 42, 18, 0)"),
        (ctx15.fillStyle = haloGrad),
        ctx15.beginPath(),
        ctx15.arc(num462, num463, 58, 0, 2 * Math.PI),
        ctx15.fill());
      const leafCount = 5 + Math.floor(4 * tmpV65(arg108));
      for (let num341 = 0; num341 < leafCount; num341 += 1) {
        const num125 = tmpV65(arg108 + 3.1 * num341) * Math.PI * 2,
          num126 = num461 * (0.32 + 0.18 * tmpV65(arg108 + 1.7 * num341)),
          num127 = num126 * (0.32 + 0.18 * tmpV65(arg108 + 4.2 * num341)),
          num128 = num462 + Math.cos(num125) * num461 * 0.1,
          num129 = num463 + Math.sin(num125) * num461 * 0.1,
          num130 = tmpV65(arg108 + 5.1 * num341) * Math.PI,
          tone = tmpV65(arg108 + 6.3 * num341),
          deep = PLANT.leafDeep,
          mid = PLANT.leafMid,
          tip = PLANT.leafTip,
          leafGrad = ctx15.createRadialGradient(num128, num129, 0, num128, num129, num126);
        (leafGrad.addColorStop(0, tone > 0.7 ? tip : mid),
          leafGrad.addColorStop(0.55, mid),
          leafGrad.addColorStop(0.85, deep),
          leafGrad.addColorStop(1, "rgba(20, 28, 10, 0)"),
          (ctx15.fillStyle = leafGrad),
          ctx15.beginPath(),
          ctx15.ellipse(num128, num129, num126, num127, num130, 0, 2 * Math.PI),
          ctx15.fill(),
          ctx15.save(),
          ctx15.translate(num128, num129),
          ctx15.rotate(num130),
          (ctx15.strokeStyle = PLANT.leafVein),
          (ctx15.lineWidth = 0.8),
          ctx15.beginPath(),
          ctx15.moveTo(-num126 * 0.9, 0),
          ctx15.lineTo(num126 * 0.9, 0),
          ctx15.stroke(),
          (ctx15.lineWidth = 0.5),
          ctx15.beginPath(),
          ctx15.moveTo(-num126 * 0.3, -num127 * 0.4),
          ctx15.lineTo(num126 * 0.1, num127 * 0.15),
          ctx15.stroke(),
          ctx15.beginPath(),
          ctx15.moveTo(num126 * 0.3, -num127 * 0.4),
          ctx15.lineTo(-num126 * 0.1, num127 * 0.15),
          ctx15.stroke(),
          ctx15.restore());
        const gradient5 = ctx15.createRadialGradient(
          num128 - num126 * 0.3,
          num129 - num127 * 0.4,
          0,
          num128 - num126 * 0.3,
          num129 - num127 * 0.4,
          num126 * 0.5,
        );
        (gradient5.addColorStop(0, PLANT.leafHighlight),
          gradient5.addColorStop(1, "rgba(220, 230, 180, 0)"),
          (ctx15.fillStyle = gradient5),
          ctx15.beginPath(),
          ctx15.ellipse(
            num128 - num126 * 0.3,
            num129 - num127 * 0.4,
            num126 * 0.5,
            num127 * 0.3,
            num130,
            0,
            2 * Math.PI,
          ),
          ctx15.fill());
      }
      const canvasTexture14 = new CanvasTexture(canvas15);
      return (setSrgbTexture(canvasTexture14), canvasTexture14);
    }
    function tmpV84(arg109) {
      const canvas16 = document.createElement("canvas");
      ((canvas16.width = 256), (canvas16.height = 64));
      const ctx16 = canvas16.getContext("2d");
      if (!ctx16) return null;
      ctx16.clearRect(0, 0, 256, 64);
      const shadowGrad = ctx16.createLinearGradient(0, 48, 0, 64);
      (shadowGrad.addColorStop(0, "rgba(12, 18, 6, 0)"),
        shadowGrad.addColorStop(1, PLANT.grassShadow),
        (ctx16.fillStyle = shadowGrad),
        ctx16.fillRect(0, 48, 256, 16));
      const bladeCount = 9 + Math.floor(5 * tmpV65(arg109 + 0.3));
      for (let num342 = 0; num342 < bladeCount; num342 += 1) {
        const num131 = 12 + 232 * tmpV65(arg109 + 2.1 * num342),
          num132 = 56 + 4 * (tmpV65(arg109 + 2.9 * num342) - 0.5),
          num133 = 22 + 28 * tmpV65(arg109 + 3.7 * num342),
          num134 = num132 - num133,
          num135 = num131 + 8 * (tmpV65(arg109 + 4.3 * num342) - 0.5),
          num136 = 3 + 2.5 * tmpV65(arg109 + 5.9 * num342),
          grad = ctx16.createLinearGradient(num131, num132, num135, num134);
        (grad.addColorStop(0, PLANT.grassRoot),
          grad.addColorStop(1, PLANT.grassTip),
          (ctx16.fillStyle = grad),
          ctx16.beginPath(),
          ctx16.moveTo(num131 - num136 / 2, num132),
          ctx16.quadraticCurveTo(
            (num131 + num135) / 2 - num136 / 3,
            (num132 + num134) / 2,
            num135,
            num134,
          ),
          ctx16.quadraticCurveTo(
            (num131 + num135) / 2 + num136 / 3,
            (num132 + num134) / 2,
            num131 + num136 / 2,
            num132,
          ),
          ctx16.closePath(),
          ctx16.fill(),
          (ctx16.strokeStyle = "rgba(14, 22, 8, 0.35)"),
          (ctx16.lineWidth = 0.6),
          ctx16.beginPath(),
          ctx16.moveTo(num131, num132),
          ctx16.quadraticCurveTo((num131 + num135) / 2, (num132 + num134) / 2, num135, num134),
          ctx16.stroke());
      }
      const canvasTexture15 = new CanvasTexture(canvas16);
      return (setSrgbTexture(canvasTexture15), canvasTexture15);
    }
    const no = function (arg110, arg111) {
      return new MeshStandardMaterial({
        color: 16777215,
        map: arg110,
        transparent: !0,
        opacity: arg111,
        alphaTest: 0.25,
        roughness: 0.85,
        metalness: 0,
        depthWrite: !1,
        side: DoubleSide,
      });
    };
    const plantShadowMaterial = new MeshBasicMaterial({
      color: 0,
      transparent: !0,
      opacity: 0.18,
      depthWrite: !1,
    });
    function makePlantShadowTexture() {
      const canvas17 = document.createElement("canvas");
      ((canvas17.width = 64), (canvas17.height = 64));
      const ctx17 = canvas17.getContext("2d");
      if (!ctx17) return null;
      const gradient19 = ctx17.createRadialGradient(32, 32, 0, 32, 32, 30);
      (gradient19.addColorStop(0, "rgba(0, 0, 0, 0.55)"),
        gradient19.addColorStop(0.6, "rgba(0, 0, 0, 0.18)"),
        gradient19.addColorStop(1, "rgba(0, 0, 0, 0)"),
        (ctx17.fillStyle = gradient19),
        ctx17.fillRect(0, 0, 64, 64));
      const canvasTexture16 = new CanvasTexture(canvas17);
      return (setSrgbTexture(canvasTexture16), canvasTexture16);
    }
    const plantShadowTex = makePlantShadowTexture();
    plantShadowTex && (plantShadowMaterial.map = plantShadowTex);
    const plantShadowGroup = new Group();
    group4.add(plantShadowGroup);
    const plantShadowRecords = [];
    function addPlantShadow(arg112, arg113, arg114, arg115, arg116) {
      if (!plantShadowTex) return;
      const mesh31 = new Mesh(new PlaneGeometry(1, 1), plantShadowMaterial);
      ((mesh31.rotation.x = -Math.PI / 2),
        mesh31.position.set(arg112, arg113 - 0.01, arg114),
        mesh31.scale.set(1.2 * arg115, 1.2 * arg116, 1),
        plantShadowGroup.add(mesh31),
        plantShadowRecords.push(mesh31));
    }
    for (let num464 = 0; num464 < tmpV82; num464 += 1) {
      const num343 = tmpV65(6001 + 3.7 * num464) * Math.PI * 2,
        num344 = 25 + 65 * tmpV65(6002 + 2.9 * num464),
        num345 = Math.cos(num343) * num344,
        num346 = Math.sin(num343) * num344,
        num347 = groundHeight(num345, num346) + 0.02,
        num348 = 1.5 + 4 * tmpV65(6003 + 4.1 * num464),
        num349 = num348 * (0.65 + 0.7 * tmpV65(6004 + 1.3 * num464)),
        num350 = num348 * (0.65 + 0.7 * tmpV65(6005 + 2.1 * num464)),
        aoResult = tmpV83(8e3 + 11 * num464),
        mesh23 = new Mesh(
          new PlaneGeometry(1, 1),
          no(aoResult, 0.5 + 0.3 * tmpV65(6006 + 1.7 * num464)),
        );
      (addPlantShadow(num345, num347, num346, num349, num350),
        (mesh23.rotation.x = -Math.PI / 2),
        (mesh23.rotation.z = tmpV65(6007 + 3.3 * num464) * Math.PI * 2),
        mesh23.position.set(num345, num347, num346),
        mesh23.scale.set(num349, num350, 1),
        (mesh23.receiveShadow = !state.lowPower),
        group14.add(mesh23));
    }
    {
      const num465 = tmpV65(6200) * Math.PI * 2,
        num466 = 78 + 15 * tmpV65(6201),
        num467 = Math.cos(num465) * num466,
        num468 = Math.sin(num465) * num466,
        num469 = groundHeight(num467, num468) + 0.02,
        aoResult2 = tmpV83(8500),
        mesh32 = new Mesh(new PlaneGeometry(1, 1), no(aoResult2, 0.6));
      (addPlantShadow(num467, num469, num468, 16, 12),
        (mesh32.rotation.x = -Math.PI / 2),
        (mesh32.rotation.z = tmpV65(6202) * Math.PI * 2),
        mesh32.position.set(num467, num469, num468),
        mesh32.scale.set(16, 12, 1),
        (mesh32.receiveShadow = !state.lowPower),
        group14.add(mesh32));
    }
    const tmpV85 = state.lowPower ? 2 : 3;
    for (let num470 = 0; num470 < tmpV85; num470 += 1) {
      const num351 = tmpV65(6300 + 4.3 * num470) * Math.PI * 2,
        num352 = 22 + 70 * tmpV65(6301 + 3.1 * num470),
        num353 = Math.cos(num351) * num352,
        num354 = Math.sin(num351) * num352,
        num355 = groundHeight(num353, num354) + 0.02,
        roResult = tmpV84(9e3 + 13 * num470),
        mesh24 = new Mesh(
          new PlaneGeometry(1, 1),
          no(roResult, 0.45 + 0.25 * tmpV65(6302 + 2.7 * num470)),
        );
      ((mesh24.rotation.x = -Math.PI / 2),
        (mesh24.rotation.z = tmpV65(6303 + 5.1 * num470) * Math.PI * 2),
        mesh24.position.set(num353, num355, num354));
      const num356 = 8 + 14 * tmpV65(6304 + 1.9 * num470),
        num357 = 1.5 + 2.5 * tmpV65(6305 + 2.3 * num470);
      (addPlantShadow(num353, num355, num354, num356, num357),
        mesh24.scale.set(num356, num357, 1),
        (mesh24.receiveShadow = !state.lowPower),
        group14.add(mesh24));
    }
    group4.add(group14);
    group14.visible = false;
    const io = [];
    group14.children.forEach((arg117) => {
      io.push({
        x: arg117.position.x,
        z: arg117.position.z,
        r: 0.5 * Math.max(arg117.scale.x, arg117.scale.y),
      });
    });
    for (let num471 = 0; num471 < position9.count; num471 += 1) {
      const result74 = position9.getX(num471),
        result75 = position9.getY(num471),
        result76 = position9.getZ(num471);
      let num358 = 0;
      (io.forEach((arg4) => {
        const num137 = result74 - arg4.x,
          num138 = result75 - arg4.z,
          result49 = Math.sqrt(num137 * num137 + num138 * num138);
        if (result49 < arg4.r) {
          const num33 = 1 - result49 / arg4.r,
            num34 = num33 * num33 * 0.35;
          num34 > num358 && (num358 = num34);
        }
      }),
        num358 > 0 && position9.setZ(num471, result76 - num358));
    }
    if (
      ((position9.needsUpdate = !0),
      circleGeometry.computeVertexNormals(),
      group14.children.forEach((arg118) => {
        arg118.position.y = groundHeight(arg118.position.x, arg118.position.z) - 0.12;
      }),
      plantShadowRecords.forEach((arg119) => {
        arg119.position.y = groundHeight(arg119.position.x, arg119.position.z) - 0.1;
      }),
      !state.lowPower)
    ) {
      reflectionRenderTarget = new WebGLCubeRenderTarget(128, {
          format: RGBAFormat,
          generateMipmaps: !0,
          minFilter: LinearMipmapLinearFilter,
        }),
        cubeCamera = new CubeCamera(0.5, 200, reflectionRenderTarget);
      rendering.trackRenderTarget(reflectionRenderTarget);
      (cubeCamera.position.set(0, groundHeight(0, 0) + 0.5, 0), homeScene.add(cubeCamera));
      let num472 = !1;
      const fn3 = () => {
        !runtimeDisposed &&
          !num472 &&
          ((num472 = !0),
          (group14.visible = !1),
          cubeCamera.update(renderer, homeScene),
          (group14.visible = !0),
          group14.children.forEach((arg5) => {
            ((arg5.material.envMap = reflectionRenderTarget.texture),
              (arg5.material.envMapIntensity = 0.88),
              (arg5.material.needsUpdate = !0));
          }));
      };
      reflectionCaptureFrame = requestAnimationFrame(() => {
        reflectionCaptureFrame = null;
        if (runtimeDisposed) return;
        reflectionCaptureFrame = requestAnimationFrame(() => {
          reflectionCaptureFrame = null;
          fn3();
        });
      });
    }
    const mesh41 = new Mesh(
      new RingGeometry(11.6, 18, 80),
      new MeshBasicMaterial({
        color: 16240538,
        transparent: !0,
        opacity: 0.08,
        side: DoubleSide,
      }),
    );
    ((mesh41.rotation.x = -Math.PI / 2), (mesh41.position.y = result107 + 0.9), group7.add(mesh41));
    const arr24 = [];
    function tmpV86(arg120) {
      const num473 = 3.4 + 1.4 * tmpV65(arg120 + 0.17),
        num474 = 0.34 + 0.15 * tmpV65(arg120 + 0.41),
        num475 = 1.75 + 0.72 * tmpV65(arg120 + 0.63);
      return new BoxGeometry(num473, num474, num475);
    }
    [10, 18, 26].forEach((arg121, arg122) => {
      const mesh33 = new Mesh(
        new TorusGeometry(14.6 - 1.25 * arg122, 0.1, 14, 80),
        new MeshBasicMaterial({
          color: 1 === arg122 ? 15914942 : 15250813,
          transparent: !0,
          opacity: 0.16 - 0.03 * arg122,
        }),
      );
      ((mesh33.position.y = result107 + arg121),
        (mesh33.rotation.x = Math.PI / 2),
        group7.add(mesh33),
        arr24.push(mesh33));
    });
    towerSystem.setOrbitDecor({ ground: mesh41, rings: arr24 });
    const result110 = (function () {
        const canvas18 = document.createElement("canvas");
        ((canvas18.width = state.lowPower ? 256 : 512),
          (canvas18.height = state.lowPower ? 64 : 128));
        const ctx18 = canvas18.getContext("2d");
        if (!ctx18) return null;
        ((ctx18.fillStyle = "#5e4130"), ctx18.fillRect(0, 0, canvas18.width, canvas18.height));
        for (let num359 = 0; num359 < 12; num359 += 1) {
          const num139 = tmpV65(50 + 4.7 * num359) * canvas18.width,
            num140 = tmpV65(60 + 3.2 * num359) * canvas18.height,
            num141 = canvas18.width * (0.15 + 0.25 * tmpV65(70 + 2.1 * num359)),
            num142 = canvas18.height * (0.3 + 0.5 * tmpV65(80 + 1.6 * num359)),
            num143 = tmpV65(90 + 2.9 * num359) > 0.5;
          ((ctx18.fillStyle = num143
            ? `rgba(170, 128, 86, ${0.1 + 0.1 * tmpV65(95 + num359)})`
            : `rgba(18, 10, 4, ${0.12 + 0.12 * tmpV65(96 + num359)})`),
            ctx18.beginPath(),
            ctx18.ellipse(num139, num140, num141, num142, 0, 0, 2 * Math.PI),
            ctx18.fill());
        }
        const tmpV52 = state.lowPower ? 160 : 320;
        for (let num360 = 0; num360 < tmpV52; num360 += 1) {
          const num144 = tmpV65(100 + 3.1 * num360) * canvas18.height,
            num145 = 1 + Math.floor(2 * tmpV65(240 + 1.9 * num360)),
            result50 = Math.floor(46 + 42 * tmpV65(370 + 0.7 * num360)),
            num146 = 0.22 + 0.28 * tmpV65(510 + 2.3 * num360);
          ((ctx18.fillStyle = `rgba(${result50}, ${Math.max(30, result50 - 22)}, ${Math.max(18, result50 - 30)}, ${num146})`),
            ctx18.fillRect(0, num144, canvas18.width, num145));
        }
        if (!state.lowPower)
          for (let num361 = 0; num361 < 120; num361 += 1) {
            const num147 = tmpV65(2100 + 2.7 * num361) * canvas18.height,
              result51 = Math.floor(56 + 44 * tmpV65(2200 + 1.4 * num361));
            ((ctx18.fillStyle = `rgba(${result51}, ${Math.max(28, result51 - 18)}, ${Math.max(16, result51 - 26)}, ${0.1 + 0.14 * tmpV65(2300 + num361)})`),
              ctx18.fillRect(0, num147, canvas18.width, 1));
          }
        const tmpV53 = state.lowPower ? 14 : 28;
        for (let num362 = 0; num362 < tmpV53; num362 += 1) {
          const num148 = tmpV65(700 + 5.3 * num362) * canvas18.width,
            num149 = tmpV65(880 + 4.1 * num362) * canvas18.height,
            num150 = 6 + 14 * tmpV65(940 + 2.8 * num362),
            num151 = 2 + 6 * tmpV65(1020 + 3.4 * num362),
            num152 = 0.12 + 0.22 * tmpV65(1090 + 1.7 * num362);
          ((ctx18.strokeStyle = `rgba(58, 35, 24, ${num152})`),
            (ctx18.lineWidth = 1),
            ctx18.beginPath(),
            ctx18.ellipse(
              num148,
              num149,
              num150,
              num151,
              tmpV65(1170 + 2.1 * num362) * Math.PI,
              0,
              2 * Math.PI,
            ),
            ctx18.stroke(),
            num150 > 12 &&
              ((ctx18.fillStyle = `rgba(42, 26, 16, ${0.5 * num152})`),
              ctx18.beginPath(),
              ctx18.ellipse(
                num148,
                num149,
                0.4 * num150,
                0.4 * num151,
                tmpV65(1175 + num362) * Math.PI,
                0,
                2 * Math.PI,
              ),
              ctx18.fill()));
        }
        if (!state.lowPower) {
          ctx18.lineWidth = 0.8;
          for (let num153 = 0; num153 < 30; num153 += 1) {
            const num35 = tmpV65(1300 + 3.7 * num153) * canvas18.width,
              num36 = tmpV65(1340 + 2.9 * num153) * canvas18.height,
              num37 = 4 + 16 * tmpV65(1380 + 1.3 * num153),
              num38 = 4 * (tmpV65(1420 + 4.1 * num153) - 0.5);
            ((ctx18.strokeStyle = `rgba(42, 28, 18, ${0.12 + 0.12 * tmpV65(1425 + num153)})`),
              ctx18.beginPath(),
              ctx18.moveTo(num35, num36),
              ctx18.quadraticCurveTo(
                num35 + num38,
                num36 + 0.5 * num37,
                num35 + 0.6 * num38,
                num36 + num37,
              ),
              ctx18.stroke());
          }
          for (let num154 = 0; num154 < 8; num154 += 1) {
            const num39 = tmpV65(1700 + 3.3 * num154) * canvas18.width * 0.6,
              num40 = tmpV65(1720 + 2.7 * num154) * canvas18.height,
              num41 = canvas18.width * (0.08 + 0.2 * tmpV65(1740 + 1.9 * num154));
            ((ctx18.strokeStyle = `rgba(36, 22, 14, ${0.08 + 0.1 * tmpV65(1760 + num154)})`),
              (ctx18.lineWidth = 0.6),
              ctx18.beginPath(),
              ctx18.moveTo(num39, num40),
              ctx18.lineTo(num39 + num41, num40 + 2 * (tmpV65(1780 + num154) - 0.5)),
              ctx18.stroke());
          }
        }
        if (!state.lowPower)
          for (let num363 = 0; num363 < 200; num363 += 1) {
            const num155 = tmpV65(1500 + 2.3 * num363) * canvas18.width,
              num156 = tmpV65(1540 + 3.1 * num363) * canvas18.height,
              num157 = 0.5 + 1.8 * tmpV65(1580 + 1.7 * num363),
              result52 = Math.floor(24 + 28 * tmpV65(1620 + 2.7 * num363));
            ((ctx18.fillStyle = `rgba(${result52}, ${Math.max(12, result52 - 14)}, ${Math.max(8, result52 - 18)}, ${0.08 + 0.14 * tmpV65(1660 + 1.1 * num363)})`),
              ctx18.beginPath(),
              ctx18.arc(num155, num156, num157, 0, 2 * Math.PI),
              ctx18.fill());
          }
        if (!state.lowPower)
          for (let num364 = 0; num364 < 6; num364 += 1) {
            const num158 = tmpV65(3100 + 4.1 * num364) * canvas18.width,
              num159 = tmpV65(3120 + 3.3 * num364) * canvas18.height,
              num160 = 8 + 18 * tmpV65(3140 + 2.5 * num364),
              gradient6 = ctx18.createRadialGradient(num158, num159, 0, num158, num159, num160);
            (gradient6.addColorStop(0, `rgba(22, 14, 8, ${0.06 + 0.06 * tmpV65(3160 + num364)})`),
              gradient6.addColorStop(
                0.6,
                `rgba(30, 20, 12, ${0.03 + 0.03 * tmpV65(3170 + num364)})`,
              ),
              gradient6.addColorStop(1, "rgba(30, 20, 12, 0)"),
              (ctx18.fillStyle = gradient6),
              ctx18.fillRect(num158 - num160, num159 - num160, 2 * num160, 2 * num160));
          }
        const gradient20 = ctx18.createLinearGradient(0, 0, 0, 0.15 * canvas18.height);
        (gradient20.addColorStop(0, "rgba(14, 8, 4, 0.38)"),
          gradient20.addColorStop(1, "rgba(14, 8, 4, 0)"),
          (ctx18.fillStyle = gradient20),
          ctx18.fillRect(0, 0, canvas18.width, 0.18 * canvas18.height));
        const gradient21 = ctx18.createLinearGradient(
          0,
          0.82 * canvas18.height,
          0,
          canvas18.height,
        );
        (gradient21.addColorStop(0, "rgba(14, 8, 4, 0)"),
          gradient21.addColorStop(1, "rgba(14, 8, 4, 0.38)"),
          (ctx18.fillStyle = gradient21),
          ctx18.fillRect(0, 0.85 * canvas18.height, canvas18.width, 0.15 * canvas18.height));
        const canvasTexture17 = new CanvasTexture(canvas18);
        return (
          (canvasTexture17.wrapS = RepeatWrapping),
          (canvasTexture17.wrapT = RepeatWrapping),
          canvasTexture17.repeat.set(2.4, 1.2),
          (canvasTexture17.anisotropy = chooseAnisotropy(2, 6)),
          setSrgbTexture(canvasTexture17),
          canvasTexture17
        );
      })(),
      mapResult = [10126450, 8287592, 9138784, 10518632, 7365208, 9728094, 8945266, 10390128].map(
        (arg123) =>
          new MeshStandardMaterial({
            color: arg123,
            map: result110,
            roughness: 0.88 + 0.1 * Math.random(),
            metalness: 0.01,
          }),
      ),
      arr25 = [],
      tmpV87 = state.lowPower ? 4 : 7;
    for (let num476 = 0; num476 < tmpV87; num476 += 1) arr25.push(tmpV86(31 + 19.3 * num476));
    function tmpV88(arg124) {
      const num477 = mesh39.position.y - 17,
        num478 = mesh39.position.y + 17;
      return 12.2 + (8.8 - 12.2) * clamp01((arg124 - num477) / (num478 - num477));
    }
    const treadBrickRecords = [];
    for (let num479 = 0; num479 < overlaySegments; num479 += 1) {
      const qeResult87 = tmpV65(1.73 * num479 + 4.7),
        qeResult88 = tmpV65(2.41 * num479 + 1.9),
        qeResult89 = tmpV65(3.97 * num479 + 8.2),
        qeResult90 = tmpV65(5.21 * num479 + 2.6),
        qeResult91 = tmpV65(6.13 * num479 + 0.8),
        num365 = 0.19 * num479 + 0.022 * (qeResult87 - 0.5),
        num366 = num479 > 0.5 * overlaySegments;
      if (qeResult90 > 1 - (num366 ? 0.12 : 0.05)) continue;
      const tmpV20 = arr25[Math.floor(qeResult90 * arr25.length)],
        tmpV21 = mapResult[Math.floor(tmpV65(7.31 * num479 + 3.2) * mapResult.length)],
        mesh25 = new Mesh(tmpV20, tmpV21),
        num367 = 0.84 + 0.14 * qeResult87,
        tmpV22 = num366 && qeResult91 > 0.72,
        tmpV23 = tmpV22 ? num367 * (0.58 + 0.22 * qeResult88) : num367,
        num368 = 0.9 + 0.22 * qeResult88,
        num369 = 0.9 + 0.2 * qeResult89,
        num370 = result107 + 1.2 + 0.34 * num479 + 0.05 * (qeResult90 - 0.5),
        num371 =
          (tmpV20.parameters && tmpV20.parameters.width ? tmpV20.parameters.width : 5.6) *
          tmpV23 *
          0.5,
        tmpV24 = tmpV22 ? 0.42 + 0.2 * qeResult89 : 0.3 + 0.14 * qeResult89,
        num372 = tmpV88(num370) + num371 - tmpV24 + 0.14 * (qeResult88 - 0.5);
      (mesh25.scale.set(tmpV23, num368, num369),
        mesh25.position.set(Math.cos(num365) * num372, num370, Math.sin(num365) * num372),
        (mesh25.rotation.y = 0.05 * (qeResult88 - 0.5) - num365),
        (mesh25.rotation.z = (qeResult89 - 0.5) * (tmpV22 ? 0.16 : 0.08)),
        (mesh25.rotation.x = (qeResult91 - 0.5) * (tmpV22 ? 0.08 : 0.04)),
        (mesh25.castShadow = !state.lowPower),
        (mesh25.receiveShadow = !state.lowPower),
        group7.add(mesh25));
      classicTowerMeshes.push(mesh25);
      // Preserve the seven source variants and their completed placement math.
      // The authored unit tread keeps +Y up and +X pointing out from the tower.
      const { width, height, depth } = tmpV20.parameters;
      treadBrickRecords.push({
        mesh: mesh25,
        dimensions: { x: width, y: height, z: depth },
      });
    }
    treadDetail = createBrickDetailController({
      profile: state.profile,
      disabled: constructionDetailDisabled,
      records: treadBrickRecords,
      geometryUrl: "/images/materials/stone-tread.bin",
      materialColor: TOWER_SURFACE_MATERIALS.shellColor,
      onChange() {
        frameScheduler?.invalidate();
      },
      report(status) {
        if (qualityDebug) qualityDebug.treads = status;
      },
    });
    treadDetail.setDetailMaps(latestBrickMaps);
    subsystemRegistry.register(treadDetail);
    // Retain the structural shell for atmospheric anchors. Crown smoke sprites
    // keep their parent while only the old visible masonry is replaced.
    classicTowerMeshes.push(mesh39, mesh40, ...group11.children.filter((object) => object.isMesh));
    let treeArchitecture = null;
    let towerVisibility = [];
    let treeVisibility = true;
    const groundedWatchtower = wantsGroundedWatchtower(window.location?.search || "");
    const watchtowerRefinement = createWatchtowerRefinement({
      effects: [mesh41, ...arr24, ...arr22.map(record => record.mesh), crownEffectLight],
      plinth: [ftLower, mesh37, ftSeam],
      rubble: [
        ...group12.children.filter(object => object.isMesh),
        ...group5.children.filter(object => object.isMesh && Math.hypot(object.position.x, object.position.z) <= 28),
      ],
      setLighting(active) { rendering.setGroundedLighting(active); },
    });
    subsystemRegistry.register(watchtowerRefinement);
    const earthFooting = completeTowerEnabled && new URLSearchParams(window.location.search).get("setting") !== "plinth";
    const propScale = createPropScale({ groundRoot: group4, groundHeight: (x, z) => !earthFooting && Math.hypot(x, z) < 17.2 ? Math.max(groundHeight(x, z), result107 + 1.6) : groundHeight(x, z),
      stones: group5.children.filter(o => o.isMesh), rubble: group12.children.filter(o => o.isMesh),
      plants: group6.children.filter(o => o.isGroup && o !== classicTree), plantRecords: arr19,
      torches: arr23, trim: [ftSeam],
    });
    subsystemRegistry.register(propScale);
    const quietScene = createQuietScene(quietObjects, enabled => {
      environmentSystem.setClutterEnabled(enabled);
      arr23.forEach(record => { record.visibilitySystem.enabled = enabled; });
    });
    quietObjects.push(group5, group6, group10, group12, group13, group14, plantShadowGroup, plinthTorchLight, groundOverlay);
    subsystemRegistry.register(quietScene);
    let completeReady = false, completeTower = null;
    const filmEffects = [orbitalGlowGroup, sprite15, sprite16];
    filmScene = createFilmScene({ ground: groundSurface, groundHeight, rendering, atmosphere: atmosphereSystem,
      effects: filmEffects, haloSystem, skyMaterial: skyShell.material,
      onGroundChange(active) { filmActive = active; towerSystem.setFilmTreatment(active); completeTower?.setFilmTreatment(active); result105.setFilmActive(active); },
    });
    subsystemRegistry.register(filmScene);
    const architectureAssets = createArchitectureAssetController({
      disabled: !architectureEnabled,
      towerModel: completeTowerEnabled ? "complete" : "assembled",
      onTowerReady(assets) {
        const replacement = completeTowerEnabled
          ? createCompleteTowerArchitecture({
            asset: assets.tower, groundY: result107, footingOffset: earthFooting ? -0.22 : 1.64, anisotropy: chooseAnisotropy(2, 6),
          })
          : createTowerArchitecture({
            assets, groundY: result107, collapseYaw: num511,
            baseRecords: baseMasonryRecords, anisotropy: chooseAnisotropy(2, 6),
          });
        const replacedMeshes = completeTowerEnabled ? [...classicTowerMeshes, mesh38, ...(earthFooting ? [ftLower, mesh37, ftSeam, ftSoot] : [])] : classicTowerMeshes;
        try {
          watchtowerRefinement.setActive(completeTowerEnabled && groundedWatchtower);
          completeReady = completeTowerEnabled;
          quietScene.setActive(completeReady && quietSetting);
          propScale.setActive(completeReady && wantsPropScale(window.location.search));
          result105.setMudActive?.(completeReady && wantsMud(window.location.search));
          filmScene.setActive(completeReady && filmEnabled);
          treeArchitecture?.setFilmTreatment(filmActive);
          replacement.setFilmTreatment?.(filmActive);
        } catch (error) { replacement.dispose(); throw error; }
        towerVisibility = replacedMeshes.map((mesh) => [mesh, mesh.visible]);
        completeTower = completeTowerEnabled ? replacement : null;
        group7.add(replacement.root);
        cinematic.setSubject("tower", replacement.root);
        replacedMeshes.forEach((mesh) => { mesh.visible = false; });
        frameScheduler?.invalidate();
        return () => {
          if (completeTower === replacement) completeTower = null;
          replacement.dispose();
        };
      },
      onRestoreTower() {
        cinematic.setSubject("tower", null);
        filmScene.setActive(false);
        treeArchitecture?.setFilmTreatment(false);
        quietScene.setActive(false);
        completeReady = false;
        propScale.setActive(false);
        result105.setMudActive?.(false);
        watchtowerRefinement.setActive(false);
        towerVisibility.forEach(([mesh, visible]) => { mesh.visible = visible; });
        towerVisibility = [];
        frameScheduler?.invalidate();
      },
      onTreeReady(asset) {
        const replacement = createTreeArchitecture({ asset, groundHeight, anisotropy: chooseAnisotropy(2, 6), anchor: earthFooting ? [55.1, 36.1] : [58, 38] });
        replacement.applyQuality(state.profile);
        group4.add(replacement.root);
        treeVisibility = classicTree.visible;
        classicTree.visible = false;
        treeArchitecture = replacement;
        propScale.setTree(replacement);
        replacement.setFilmTreatment(filmActive);
        cinematic.setSubject("tree", replacement.root);
        frameScheduler?.invalidate();
        return () => { replacement.dispose(); treeArchitecture = null; };
      },
      onRestoreTree() {
        cinematic.setSubject("tree", null);
        treeArchitecture?.setFilmTreatment(false);
        propScale.setTree(null);
        classicTree.visible = treeVisibility;
        frameScheduler?.invalidate();
      },
      onStatus(status) {
        cinematic.setStatus(status);
        frameScheduler?.invalidate();
        if (qualityDebug) {
          qualityDebug.architecture ||= { mode: architectureEnabled ? (completeTowerEnabled ? "complete" : "assembled") : "classic" };
          qualityDebug.architecture[status.kind] = status;
          qualityDebug.architecture.propScale = propScale.active ? "doorway" : "baseline";
          qualityDebug.architecture.refinement = watchtowerRefinement.active ? "grounded" : "baseline";
        }
      },
    });
    subsystemRegistry.register(architectureAssets);
    subsystemRegistry.register({
      applyQuality(profile) { treeArchitecture?.applyQuality(profile); },
    });
    const boxGeometry = new BoxGeometry(1.15, 1, 1.15),
      meshStandardMaterial12 = new MeshStandardMaterial({
        color: 11833972,
        roughness: 0.95,
      }),
      arr26 = [];
    for (let num480 = 0; num480 < upperGlowSpriteCount; num480 += 1) {
      const num373 = (num480 / upperGlowSpriteCount) * Math.PI * 2,
        num374 = 25 + (num480 % 2) * 3.5,
        num375 = Math.cos(num373) * num374,
        num376 = Math.sin(num373) * num374,
        num377 = 4 + (num480 % 3) * 1.4,
        num378 = groundHeight(num375, num376) + 0.5 * num377,
        mesh26 = new Mesh(boxGeometry, meshStandardMaterial12);
      ((mesh26.scale.y = num377),
        mesh26.position.set(num375, num378, num376),
        (mesh26.castShadow = !state.lowPower),
        (mesh26.receiveShadow = !state.lowPower),
        group4.add(mesh26));
      const mesh27 = new Mesh(
        new OctahedronGeometry(num480 % 2 ? 0.6 : 0.5, 0),
        new MeshStandardMaterial({
          color: num480 % 3 == 0 ? 14075049 : num480 % 3 == 1 ? 13228002 : 15316611,
          roughness: 0.4,
          metalness: 0.08,
          emissive: num480 % 3 == 0 ? 5916214 : num480 % 3 == 1 ? 5202536 : 8345145,
          emissiveIntensity: 0.14,
        }),
      );
      (mesh27.position.set(num375, groundHeight(num375, num376) + num377 + 0.9, num376),
        (mesh27.castShadow = !state.lowPower),
        group4.add(mesh27),
        arr26.push(mesh27));
      quietObjects.push(mesh26, mesh27);
    }
    environmentSystem.setCrystalRecords(arr26);
    const group15 = new Group();
    group4.add(group15);
    quietObjects.push(group15);
    const boxGeometry2 = new BoxGeometry(0.65, 2.6, 0.65),
      meshStandardMaterial13 = new MeshStandardMaterial({
        color: 14074533,
        roughness: 0.5,
        metalness: 0.05,
        emissive: 5916214,
        emissiveIntensity: 0.08,
      });
    [
      {
        x: 13,
        z: 19,
        color: 14074533,
      },
      {
        x: -17,
        z: 11,
        color: 13228002,
      },
      {
        x: 18,
        z: -13,
        color: 15316611,
      },
      {
        x: -12,
        z: -18,
        color: 16113077,
      },
    ].forEach((arg125) => {
      const mesh34 = new Mesh(boxGeometry2, meshStandardMaterial13.clone());
      (mesh34.material.color.setHex(arg125.color),
        mesh34.material.emissive.setHex(arg125.color),
        (mesh34.material.emissiveIntensity = 0.08),
        mesh34.position.set(arg125.x, groundHeight(arg125.x, arg125.z) + 1.4, arg125.z),
        (mesh34.rotation.z = 0.28),
        (mesh34.castShadow = !state.lowPower),
        group15.add(mesh34));
    });
    environmentSystem.setMonolithGroup(group15);
    group15.visible = false;
    const preview = new URLSearchParams(window.location.search || "").get("preview");
    if (preview === "marble" && typeof createMarbleTextures === "function") {
      const marbleTextures = createMarbleTextures({
          THREE: THREE,
          lowPower: state.lowPower,
          qualityProfile: state.profile,
          chooseAnisotropy: chooseAnisotropy,
        }),
        marblePreview = new Mesh(new BoxGeometry(4, 4, 0.5), createMarbleMaterial(marbleTextures));
      (marblePreview.position.set(15, 6, 0),
        (marblePreview.rotation.y = Math.PI / 2),
        (marblePreview.castShadow = !state.lowPower),
        (marblePreview.receiveShadow = !state.lowPower),
        homeScene.add(marblePreview));
    }
    // Camera-following cloud layers stay centered on the orbiting view.
    const cloudAnchor = new Group();
    cloudAnchor.position.y = -7.5;
    atmosphereSystem.root.add(cloudAnchor);
    atmosphereSystem.setCloudAnchor(cloudAnchor);
    const driftCloudGroup = new Group();
    cloudAnchor.add(driftCloudGroup);
    atmosphereSystem.registerCloudGroup(driftCloudGroup, true);
    const driftClouds = [],
      driftCloudTexture = (function () {
        const canvas19 = document.createElement("canvas");
        ((canvas19.width = 96), (canvas19.height = 96));
        const ctx19 = canvas19.getContext("2d");
        if (!ctx19) return null;
        const num481 = 0.5 * canvas19.width,
          num482 = 0.5 * canvas19.height,
          gradient22 = ctx19.createRadialGradient(
            num481,
            num482,
            0.08 * canvas19.width,
            num481,
            num482,
            0.5 * canvas19.width,
          );
        (gradient22.addColorStop(0, "rgba(248, 228, 201, 0.9)"),
          gradient22.addColorStop(0.42, "rgba(206, 177, 146, 0.46)"),
          gradient22.addColorStop(1, "rgba(118, 95, 72, 0)"),
          (ctx19.fillStyle = gradient22),
          ctx19.beginPath(),
          ctx19.arc(num481, num482, 0.48 * canvas19.width, 0, 2 * Math.PI),
          ctx19.fill());
        for (let num379 = 0; num379 < 18; num379 += 1) {
          const num161 = (0.5 * Math.sin(19.41 * num379) + 0.5) * canvas19.width,
            num162 = (0.5 * Math.sin(7.31 * num379 + 2.1) + 0.5) * canvas19.height,
            num163 = 2 + 5 * (0.5 * Math.sin(11.7 * num379) + 0.5);
          ((ctx19.fillStyle = `rgba(255, 244, 220, ${0.025 + 0.04 * (0.5 * Math.sin(5.19 * num379) + 0.5)})`),
            ctx19.beginPath(),
            ctx19.arc(num161, num162, num163, 0, 2 * Math.PI),
            ctx19.fill());
        }
        const canvasTexture18 = new CanvasTexture(canvas19);
        return (
          setSrgbTexture(canvasTexture18),
          (canvasTexture18.anisotropy = chooseAnisotropy(1, 2)),
          canvasTexture18
        );
      })(),
      driftCloudCount = state.profile.counts.driftClouds;
    for (let num483 = 0; num483 < driftCloudCount; num483 += 1) {
      const qeResult92 = tmpV65(401 + 2.13 * num483),
        qeResult93 = tmpV65(503 + 1.73 * num483),
        qeResult94 = tmpV65(617 + 2.91 * num483),
        qeResult95 = tmpV65(709 + 3.37 * num483),
        num380 = num511 + 0.82 * (qeResult92 - 0.5),
        num381 = 9.2 + 2.7 * qeResult93,
        num382 = result107 + 20.8 + 13.8 * qeResult94,
        sprite12 = new Sprite(
          new SpriteMaterial({
            map: driftCloudTexture,
            color: 14204571,
            transparent: !0,
            opacity: state.lowPower ? 0.11 : 0.14,
            depthWrite: !1,
          }),
        );
      sprite12.position.set(Math.cos(num380) * num381, num382, Math.sin(num380) * num381);
      const num383 = (state.lowPower ? 1.8 : 2.2) + qeResult95 * (state.lowPower ? 1.6 : 2.4);
      // Cumulus-like: always wider than tall. Prior range (0.68–1.10) let
      // some clouds render taller than wide, reading as "sideways".
      (sprite12.scale.set(num383, num383 * (0.42 + 0.3 * qeResult93), 1),
        driftCloudGroup.add(sprite12),
        driftClouds.push({
          mesh: sprite12,
          yaw: num380,
          radius: num381,
          baseY: num382,
          drift: 0.65 * (qeResult95 - 0.5),
          phase: qeResult92 * Math.PI * 2,
          speed: 0.32 + 0.74 * qeResult94,
          ampY: 0.18 + 0.52 * qeResult93,
        }));
    }
    const driftCloudSystem = registerDecorativeSystem({
      getCenter(target) {
        return driftCloudGroup.getWorldPosition(target);
      },
      group: driftCloudGroup,
      importance: "backsideDecor",
      isCloudGroup: true,
      name: "driftClouds",
      radius: 46,
    });
    setShadowParticipation(driftCloudGroup);
    const bufferGeometry2 = new BufferGeometry(),
      float32Array2 = new Float32Array(3 * pointFieldCount),
      float32Array3 = new Float32Array(3 * pointFieldCount);
    for (let num484 = 0; num484 < pointFieldCount; num484 += 1) {
      const num384 = 18 + 44 * Math.random(),
        num385 = Math.random() * Math.PI * 2,
        num386 = Math.cos(num385) * num384,
        num387 = Math.sin(num385) * num384,
        num388 = 5 + 26 * Math.random();
      ((float32Array2[3 * num484] = num386),
        (float32Array2[3 * num484 + 1] = num388),
        (float32Array2[3 * num484 + 2] = num387));
      const tmpV25 = [15316611, 16113077, 14075049, 11714754][num484 % 4],
        color = new Color(tmpV25);
      ((float32Array3[3 * num484] = color.r),
        (float32Array3[3 * num484 + 1] = color.g),
        (float32Array3[3 * num484 + 2] = color.b));
    }
    (bufferGeometry2.setAttribute("position", new BufferAttribute(float32Array2, 3)),
      bufferGeometry2.setAttribute("color", new BufferAttribute(float32Array3, 3)));
    const points = new Points(
      bufferGeometry2,
      new PointsMaterial({
        size: state.lowPower ? 0.42 : 0.34,
        vertexColors: !0,
        transparent: !0,
        opacity: 0.68,
        depthWrite: !1,
        sizeAttenuation: !0,
      }),
    );
    group4.add(points);
    // Floating motes read as square sprites in the quiet film scene; film hides them.
    filmEffects.push(points);
    atmosphereSystem.setPointField(points);
    const emberCloudGroup = new Group();
    cloudAnchor.add(emberCloudGroup);
    atmosphereSystem.registerCloudGroup(emberCloudGroup, true);
    const emberClouds = [],
      emberCloudTexture = (function () {
        const canvas20 = document.createElement("canvas");
        ((canvas20.width = 64), (canvas20.height = 64));
        const ctx20 = canvas20.getContext("2d");
        if (!ctx20) return null;
        const num485 = 0.5 * canvas20.width,
          num486 = 0.58 * canvas20.height,
          gradient23 = ctx20.createRadialGradient(
            num485,
            num486 - 4,
            2,
            num485,
            num486,
            0.38 * canvas20.width,
          );
        (gradient23.addColorStop(0, "rgba(255, 236, 188, 0.92)"),
          gradient23.addColorStop(0.5, "rgba(240, 172, 102, 0.54)"),
          gradient23.addColorStop(1, "rgba(180, 98, 42, 0)"),
          (ctx20.fillStyle = gradient23),
          ctx20.beginPath(),
          ctx20.ellipse(
            num485,
            num486,
            0.24 * canvas20.width,
            0.29 * canvas20.height,
            0,
            0,
            2 * Math.PI,
          ),
          ctx20.fill(),
          (ctx20.fillStyle = "rgba(255, 218, 164, 0.34)"),
          ctx20.beginPath(),
          ctx20.moveTo(num485, num486 - 0.36 * canvas20.height),
          ctx20.lineTo(num485 - 0.08 * canvas20.width, num486 - 0.06 * canvas20.height),
          ctx20.lineTo(num485 + 0.08 * canvas20.width, num486 - 0.06 * canvas20.height),
          ctx20.closePath(),
          ctx20.fill());
        const canvasTexture19 = new CanvasTexture(canvas20);
        return (
          setSrgbTexture(canvasTexture19),
          (canvasTexture19.anisotropy = chooseAnisotropy(1, 2)),
          canvasTexture19
        );
      })(),
      emberCloudCount = state.profile.counts.emberClouds;
    if (emberCloudTexture)
      for (let num487 = 0; num487 < emberCloudCount; num487 += 1) {
        const qeResult96 = tmpV65(1201 + 1.37 * num487),
          qeResult97 = tmpV65(1231 + 2.21 * num487),
          qeResult98 = tmpV65(1277 + 2.87 * num487),
          qeResult99 = tmpV65(1301 + 3.43 * num487),
          num389 = qeResult96 * Math.PI * 2,
          num390 = 9 + 22 * qeResult97,
          num391 = Math.cos(num389) * num390,
          num392 = Math.sin(num389) * num390,
          num393 = groundHeight(num391, num392) + 2.6 + 11.5 * qeResult98,
          sprite13 = new Sprite(
            new SpriteMaterial({
              map: emberCloudTexture,
              color: 15250813,
              transparent: !0,
              opacity: state.lowPower ? 0.13 : 0.16,
              depthWrite: !1,
            }),
          ),
          num394 = (state.lowPower ? 0.36 : 0.42) + qeResult99 * (state.lowPower ? 0.42 : 0.6);
        // Was (0.75 × 1.45) — stacked vertically like a column of smoke.
        // Flipped so ember puffs read as wide horizontal cloud shapes.
        (sprite13.position.set(num391, num393, num392),
          sprite13.scale.set(1.45 * num394, 0.75 * num394, 1),
          emberCloudGroup.add(sprite13),
          emberClouds.push({
            mesh: sprite13,
            yaw: num389,
            radius: num390,
            baseY: num393,
            drift: 0.22 * (qeResult99 - 0.5),
            phase: qeResult96 * Math.PI * 2,
            speed: 0.9 + 1.3 * qeResult98,
            ampY: 0.12 + 0.3 * qeResult97,
          }));
      }
    const emberCloudSystem = registerDecorativeSystem({
      getCenter(target) {
        return emberCloudGroup.getWorldPosition(target);
      },
      group: emberCloudGroup,
      importance: "backsideDecor",
      isCloudGroup: true,
      name: "emberClouds",
      radius: 34,
    });
    setShadowParticipation(emberCloudGroup);
    const hazeClouds = [],
      hazeCloudCount = state.profile.counts.hazeClouds,
      hazeCloudGroup = new Group(),
      hazeCloudCanvas = document.createElement("canvas");
    ((hazeCloudCanvas.width = 128), (hazeCloudCanvas.height = 128));
    const hazeCloudCtx = hazeCloudCanvas.getContext("2d");
    if (hazeCloudCtx)
      for (let num488 = 0; num488 < 4; num488 += 1) {
        const num395 = 64 + (num488 % 2 == 0 ? -12 : 10) * (num488 < 2 ? 1 : -1),
          num396 = 64 + (num488 < 2 ? -8 : 12),
          gradient7 = hazeCloudCtx.createRadialGradient(num395, num396, 0, 64, 64, 60);
        (gradient7.addColorStop(0, `rgba(255, 255, 255, ${0.18 - 0.03 * num488})`),
          gradient7.addColorStop(0.5, `rgba(220, 210, 200, ${0.08 - 0.01 * num488})`),
          gradient7.addColorStop(1, "rgba(200, 190, 180, 0)"),
          (hazeCloudCtx.fillStyle = gradient7),
          hazeCloudCtx.fillRect(0, 0, 128, 128));
      }
    const hazeCloudTexture = new CanvasTexture(hazeCloudCanvas);
    setSrgbTexture(hazeCloudTexture);
    for (let num489 = 0; num489 < hazeCloudCount; num489 += 1) {
      const qeResult100 = tmpV65(4101 + 1.47 * num489),
        qeResult101 = tmpV65(4133 + 2.13 * num489),
        qeResult102 = tmpV65(4167 + 1.89 * num489),
        qeResult103 = tmpV65(4199 + 2.51 * num489),
        num397 = qeResult100 * Math.PI * 2,
        num398 = 13 + 4 * qeResult101,
        num399 = result107 + 0.5 + 6 * qeResult102,
        sprite14 = new Sprite(
          new SpriteMaterial({
            map: hazeCloudTexture,
            color: 12232850,
            transparent: !0,
            opacity: state.lowPower ? 0.03 : 0.05,
            depthWrite: !1,
          }),
        ),
        num400 = 4 + 4 * qeResult103;
      (sprite14.scale.set(num400, 0.7 * num400, 1),
        sprite14.position.set(Math.cos(num397) * num398, num399, Math.sin(num397) * num398),
        hazeCloudGroup.add(sprite14),
        hazeClouds.push({
          mesh: sprite14,
          yaw: num397,
          radius: num398,
          baseY: num399,
          phase: qeResult100 * Math.PI * 2,
          speed: 0.3 + 0.5 * qeResult101,
          cycleHeight: 6 + 3 * qeResult102,
        }));
    }
    cloudAnchor.add(hazeCloudGroup);
    atmosphereSystem.registerCloudGroup(hazeCloudGroup, true);
    const hazeCloudSystem = registerDecorativeSystem({
      getCenter(target) {
        return hazeCloudGroup.getWorldPosition(target);
      },
      group: hazeCloudGroup,
      importance: "backsideDecor",
      isCloudGroup: true,
      name: "hazeClouds",
      radius: 30,
    });
    setShadowParticipation(hazeCloudGroup);
    // Pulsing far-cloud billows fade in and out around the skyline anchor.
    const pulseCloudCount = state.profile.counts.pulseClouds,
      pulseClouds = [],
      pulseCloudGroup = new Group();
    pulseCloudGroup.renderOrder = 10;
    const pulseCloudTexture = driftCloudTexture || emberCloudTexture;
    if (pulseCloudTexture) {
      const pulsePuffsPerCluster = state.profile.counts.pulsePuffsPerCluster,
        treeAlignedAngle = Math.atan2(38, 58),
        treeAlignedDistance = Math.sqrt(4808);
      for (let num401 = 0; num401 < pulseCloudCount; num401 += 1) {
        const isTree = num401 === 0,
          baseAngle = isTree ? treeAlignedAngle : tmpV65(5001 + num401) * Math.PI * 2,
          baseDist = isTree ? treeAlignedDistance : 32 + 62 * tmpV65(5006 + num401),
          puffs = [];
        for (let num42 = 0; num42 < pulsePuffsPerCluster; num42 += 1) {
          const seed = 200 * num401 + 17 * num42,
            aOff = (tmpV65(6101 + seed) - 0.5) * 0.26,
            rOff = (tmpV65(6117 + seed) - 0.5) * 9,
            hOff = (tmpV65(6133 + seed) - 0.5) * 7,
            num9 = 11 + 9 * tmpV65(6149 + seed),
            num10 = num9 * (0.5 + 0.22 * tmpV65(6165 + seed)),
            sprite = new Sprite(
              new SpriteMaterial({
                map: pulseCloudTexture,
                color: 16119008,
                transparent: !0,
                opacity: 0,
                depthWrite: !1,
                fog: !0,
              }),
            );
          (sprite.scale.set(num9, num10, 1), pulseCloudGroup.add(sprite));
          puffs.push({
            sprite: sprite,
            aOff: aOff,
            rOff: rOff,
            hOff: hOff,
          });
        }
        pulseClouds.push({
          puffs: puffs,
          baseAngle: baseAngle,
          baseDist: baseDist,
          angleDriftAmp: isTree ? 0.12 : 0.6,
          distDriftAmp: isTree ? 3 : 8,
          cycleOffset: num401 * (10 / pulseCloudCount),
          fadeInDuration: 2,
          holdDuration: isTree ? 8.5 : 2.5,
          fadeOutDuration: 2,
          cyclePeriod: isTree ? 14.5 : 14 + 10 * tmpV65(5031 + num401),
          baseY: 50,
        });
      }
    }
    cloudAnchor.add(pulseCloudGroup);
    atmosphereSystem.registerCloudGroup(pulseCloudGroup, true);
    const pulseCloudSystem = registerDecorativeSystem({
      getCenter(target) {
        return pulseCloudGroup.getWorldPosition(target);
      },
      group: pulseCloudGroup,
      importance: "backsideDecor",
      isCloudGroup: true,
      name: "pulseClouds",
      radius: 122,
    });
    setShadowParticipation(pulseCloudGroup);
    filmScene.setClouds([...driftClouds.map(c => c.mesh), ...arr16.map(c => c.mesh), ...arr17.map(c => c.mesh),
      ...emberClouds.map(c => c.mesh), ...hazeClouds.map(c => c.mesh), ...pulseClouds.flatMap(c => c.puffs.map(p => p.sprite))]);
    const cfg2 = {
        scrollTarget: 0,
        scroll: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      },
      compositionState = {
        profile: fallbackComposition,
      },
      num515 = 1.15,
      cloudCameraVector = new Vector3(),
      cloudViewVector = new Vector3(),
      cloudOffsetVector = new Vector3(),
      cloudLookTarget = new Vector3();
    function resolveSceneCompositionProfile() {
      return typeof scene.getSceneCompositionProfile === "function"
        ? scene.getSceneCompositionProfile({
            width: cfg2.width,
            height: cfg2.height,
          })
        : fallbackComposition;
    }
    function applySceneComposition(profile, reason = "runtime") {
      compositionState.profile = profile || fallbackComposition;
      refreshCountScaleCache();
      updateSceneDebug({
        composition: compositionState.profile.name,
        compositionReason: reason,
      });
    }
    function cloudViewFade(
      arg126,
      arg127,
      arg128,
      arg129,
      arg130,
      arg131 = 0.92,
      minOpacity = 0.14,
    ) {
      const result91 = cloudCameraVector.copy(arg126).distanceTo(camera.position),
        result92 = clamp01((result91 - arg127) / arg128);
      cloudViewVector.copy(cloudLookTarget).sub(camera.position);
      const result93 = cloudViewVector.length();
      if (!(result93 > 1e-3)) return result92;
      (cloudViewVector.multiplyScalar(1 / result93),
        cloudOffsetVector.copy(arg126).sub(camera.position));
      const result94 = cloudOffsetVector.dot(cloudViewVector);
      if (result94 <= 0 || result94 >= result93 * arg131) return result92;
      const result95 = cloudOffsetVector.addScaledVector(cloudViewVector, -result94).length(),
        result96 = clamp01((result95 - arg129) / arg130);
      return Math.max(minOpacity, Math.min(result92, result96));
    }
    function applySceneSize({ width, height }) {
      cinematicArea = measureCinematicArea(width, height);
      ((cfg2.width = width),
        (cfg2.height = height),
        applySceneComposition(resolveSceneCompositionProfile(), "resize"),
        applyActiveQualityProfile(state.profile, "resize"));
      subsystemRegistry.resize({
        cameraFov:
          compositionState.profile.camera?.fov ?? fallbackComposition.camera.fov,
        composition: compositionState.profile,
        height,
        width,
      });
      frameScheduler?.invalidate();
    }
    const resizeController = createSceneResizeController({
      onResize: applySceneSize,
      readSize() {
        return {
          height: window.innerHeight,
          pixelRatio: window.devicePixelRatio || 1,
          width: window.innerWidth,
        };
      },
    });
    // cfg2.height is refreshed inside tmpV89 (the resize handler) on every
    // resize, so reading it inside the scroll handler avoids a layout-flushing
    // window.innerHeight access per scroll event.
    const onWindowResize = () => resizeController.resize();
    const onFontsLoaded = () => { cinematicArea = measureCinematicArea(cfg2.width, cfg2.height); frameScheduler?.invalidate(); };
    document.fonts?.addEventListener?.("loadingdone", onFontsLoaded);
    const onWindowScroll = () => {
      cfg2.scrollTarget = Math.min(window.scrollY / (1.8 * cfg2.height), 1.25);
      frameScheduler?.invalidate();
    };
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("scroll", onWindowScroll, {
      passive: !0,
    });
    resizeController.update({ force: true });
    const num516 = 0.12 * Math.PI;
    let debugRenderFrameCount = 0;
    let debugRenderWindowStart = null;
    function updateSceneFrame({
      deltaSeconds: result97,
      elapsedSeconds: elapsedTime,
      sampleDeltaSeconds,
      timestamp,
    }) {
      const adaptiveProfile =
        typeof qualityState.sample === "function"
          ? qualityState.sample(1e3 * sampleDeltaSeconds, 1e3 * elapsedTime)
          : null;
      adaptiveProfile &&
        adaptiveProfile.tier !== state.profile.tier &&
        applyActiveQualityProfile(adaptiveProfile, "adaptive");
      const activeProfile = state.profile,
        cameraProfile = compositionState.profile.camera || fallbackComposition.camera,
        tmpV55 = 1;
      cfg2.scroll = reducedMotion
        ? cfg2.scrollTarget
        : cfg2.scroll + 0.025 * (cfg2.scrollTarget - cfg2.scroll);
      const tmpV56 = activeProfile.isLow ? 0.055 : 0.06,
        num490 = elapsedTime * (0.95 * tmpV56) * tmpV55,
        num491 = 0.09 * Math.sin(3 * num490) + 0.05 * Math.sin(2 * num490),
        num492 = num516 + num490 - num491,
        num493 = cameraProfile.orbitBase - cameraProfile.orbitScrollDelta * cfg2.scroll,
        num494 =
          cameraProfile.heightBase +
          cameraProfile.heightScrollDelta * cfg2.scroll +
          0.45 * Math.sin(0.28 * elapsedTime) * tmpV55 +
          0.6 * Math.sin(0.13 * elapsedTime) * tmpV55,
        num495 = cameraProfile.lookAtBase + cameraProfile.lookAtScrollDelta * cfg2.scroll,
        num496 = cameraProfile.orbitScale * (num493 - cameraProfile.orbitTrim);
      const tourPhase = cameraTour?.update({ elapsedSeconds: elapsedTime, reducedMotion,
        developer: Boolean(scene.devMode?.active), panelOpen: document.body.hasAttribute("data-panel-open") }) ?? null;
      rendering.postprocessPipeline.setFade?.(cameraTour?.fade ?? 0);
      const cinematicApplied = cinematic.apply({ width: cfg2.width, height: cfg2.height,
        elapsedSeconds: elapsedTime, reducedMotion, developer: Boolean(scene.devMode?.active), tourPhase, fallbackFov: cameraProfile.fov || 45 });
      if (scene.devMode?.active && typeof scene.devMode.update === "function") scene.devMode.update(camera, result97);
      else if (!cinematicApplied) { camera.position.set(Math.cos(num492) * num496, num494, Math.sin(num492) * num496); camera.lookAt(0, num495, 0); }
      cloudAnchor.position.x = camera.position.x;
      cloudAnchor.position.z = camera.position.z;
      if (cinematicApplied) cloudLookTarget.copy(cinematic.target); else cloudLookTarget.set(0, num495, 0);
      (
        subsystemRegistry.update({
          elapsedSeconds: elapsedTime,
          reducedMotion,
          render: false,
          visibilityScale: num515,
        }),
        driftCloudSystem.active
          ? (() => {
              const limit = getProfileCount("driftClouds", driftClouds.length);
              driftClouds.forEach((arg6, arg7) => {
                if (arg7 >= limit) {
                  arg6.mesh.visible = !1;
                  return;
                }
                arg6.mesh.visible = !0;
                const result53 = Math.sin(elapsedTime * arg6.speed * tmpV55 + arg6.phase),
                  result54 = Math.cos(
                    elapsedTime * (0.56 * arg6.speed) * tmpV55 + 0.8 * arg6.phase,
                  ),
                  num164 = arg6.yaw + 0.05 * result53,
                  num165 = arg6.radius + 0.18 * result54;
                ((arg6.mesh.position.x = Math.cos(num164) * num165 + 0.14 * arg6.drift),
                  (arg6.mesh.position.z = Math.sin(num164) * num165 + 0.14 * arg6.drift),
                  (arg6.mesh.position.y =
                    arg6.baseY +
                    result53 * arg6.ampY * 0.55 +
                    0.07 * Math.sin(0.9 * elapsedTime + arg7)));
                arg6.mesh.material.opacity =
                  (state.lowPower ? 0.14 : 0.19) * num515 +
                  (0.018 + 0.0016 * arg7) * Math.max(0, result53);
              });
            })()
          : setRecordVisibility(driftClouds, !1),
        upperGlowSystem.active
          ? (() => {
              const limit = getProfileCount("upperGlowSprites", arr16.length);
              arr16.forEach((arg8, arg9) => {
                if (arg9 >= limit) {
                  arg8.mesh.visible = !1;
                  return;
                }
                arg8.mesh.visible = !0;
                const num166 = elapsedTime * arg8.speed * tmpV55 + arg8.phase,
                  num167 = arg8.yaw + 0.04 * Math.sin(num166),
                  num168 = arg8.radius + 1.6 * Math.cos(0.8 * num166);
                ((arg8.mesh.position.x = Math.cos(num167) * num168),
                  (arg8.mesh.position.z = Math.sin(num167) * num168),
                  (arg8.mesh.position.y = arg8.baseY + 0.35 * Math.sin(0.6 * num166 + 0.3 * arg9)),
                  (arg8.mesh.material.opacity =
                    (state.lowPower ? 0.16 : 0.26) + 0.02 * Math.sin(0.7 * num166)));
              });
            })()
          : setRecordVisibility(arr16, !1),
        midCloudSystem.active
          ? (() => {
              const limit = getProfileCount("midCloudSprites", arr17.length);
              arr17.forEach((arg10, arg11) => {
                if (arg11 >= limit) {
                  arg10.mesh.visible = !1;
                  return;
                }
                arg10.mesh.visible = !0;
                const num169 = elapsedTime * arg10.speed * tmpV55 + arg10.phase,
                  num170 = arg10.yaw + 0.025 * Math.sin(0.7 * num169),
                  num171 = arg10.radius + 2.5 * Math.cos(0.6 * num169);
                ((arg10.mesh.position.x = Math.cos(num170) * num171),
                  (arg10.mesh.position.z = Math.sin(num170) * num171),
                  (arg10.mesh.position.y =
                    arg10.baseY + 0.5 * Math.sin(0.5 * num169 + 0.24 * arg11)));
                const cloudViewFadeResult = cloudViewFade(
                  arg10.mesh.position,
                  state.lowPower ? 32 : 38,
                  14,
                  state.lowPower ? 10 : 13,
                  state.lowPower ? 10 : 13,
                  0.95,
                  0.02,
                );
                arg10.mesh.material.opacity = arg10.baseOpacity * cloudViewFadeResult;
              });
            })()
          : setRecordVisibility(arr17, !1),
        emberCloudSystem.active
          ? (() => {
              const limit = getProfileCount("emberClouds", emberClouds.length);
              emberClouds.forEach((arg12, arg13) => {
                if (arg13 >= limit) {
                  arg12.mesh.visible = !1;
                  return;
                }
                arg12.mesh.visible = !0;
                const num172 = elapsedTime * arg12.speed * tmpV55 + arg12.phase,
                  num173 = arg12.yaw + 0.06 * Math.sin(0.42 * num172),
                  num174 = arg12.radius + 0.35 * Math.cos(0.35 * num172);
                ((arg12.mesh.position.x = Math.cos(num173) * num174 + arg12.drift),
                  (arg12.mesh.position.z = Math.sin(num173) * num174 + arg12.drift),
                  (arg12.mesh.position.y =
                    arg12.baseY +
                    Math.sin(1.1 * num172) * arg12.ampY +
                    0.18 * Math.max(0, Math.sin(0.9 * num172))),
                  (arg12.mesh.material.opacity =
                    (state.lowPower ? 0.08 : 0.11) * num515 +
                    0.03 +
                    0.035 * Math.max(0, Math.sin(1.8 * num172 + 0.2 * arg13))));
              });
            })()
          : setRecordVisibility(emberClouds, !1),
        arr23.forEach((arg52) => {
          if (quietScene.active) return;
          if (!arg52.visibilitySystem.active) return;
              const phase = arg52.phase,
                result77 = Math.sin(6 * elapsedTime + phase),
                result78 = Math.sin(9.3 * elapsedTime + 1.7 * phase),
                result79 = Math.sin(14.1 * elapsedTime + 0.8 * phase),
                result80 = Math.sin(3.2 * elapsedTime + 2.1 * phase),
                result81 = Math.sin(22 * elapsedTime + 3.1 * phase),
                result82 = Math.sin(0.8 * elapsedTime + 0.6 * phase),
                num403 =
                  0.12 * result77 +
                  0.08 * result78 +
                  0.05 * result79 +
                  0.04 * result81 +
                  0.06 * result82,
                num404 =
                  0.06 * Math.sin(2.5 * elapsedTime + phase) +
                  0.03 * Math.sin(4.8 * elapsedTime + 1.4 * phase);
              ((arg52.flameCore.material.opacity =
                0.8 * Math.max(0.45, 0.7 + num403 + 0.1 * result79)),
                (arg52.flameCore.position.y = arg52.baseFlameY + 0.08 * result77 + 0.04 * result78),
                (arg52.flameCore.position.x = arg52.baseX + num404),
                (arg52.flameCore.position.z =
                  arg52.baseZ + 0.03 * Math.sin(3.1 * elapsedTime + 0.9 * phase)));
              const result83 = Math.min(
                1.22,
                Math.max(0.78, 1 + 0.15 * result77 + 0.08 * result79 + 0.05 * result82),
              );
              (arg52.flameCore.scale.set(
                0.8 * Math.min(1.2, Math.max(0.82, 1 + 0.12 * result78)),
                1.4 * result83,
                1,
              ),
                (arg52.flameOuter.material.opacity =
                  0.8 * Math.max(0.22, 0.35 + 0.08 * result80 + 0.06 * result77 + 0.04 * result82)),
                (arg52.flameOuter.position.y = arg52.baseFlameY - 0.2 + 0.06 * result80),
                (arg52.flameOuter.position.x = arg52.baseX + 0.6 * num404),
                (arg52.flameOuter.position.z =
                  arg52.baseZ + 0.02 * Math.sin(2.2 * elapsedTime + 1.2 * phase)),
                arg52.flameOuter.scale.set(
                  1.6 * Math.min(1.18, Math.max(0.9, 1 + 0.1 * result80)),
                  2.4 * Math.min(1.18, Math.max(0.9, 1 + 0.1 * result77)),
                  1,
                ));
              if (arg52.flameHot) {
                const hotOp = Math.max(
                  0.55,
                  0.78 + 0.12 * result77 + 0.08 * result81 + 0.04 * result82,
                );
                ((arg52.flameHot.material.opacity = 0.95 * hotOp),
                  arg52.flameHot.position.set(
                    arg52.baseX + 0.4 * num404,
                    arg52.baseFlameY + 0.15 + 0.06 * result77,
                    arg52.baseZ + 0.02 * Math.sin(3.1 * elapsedTime + 0.9 * phase),
                  ));
                const hotScale = Math.min(1.18, Math.max(0.82, 1 + 0.1 * result77));
                arg52.flameHot.scale.set(
                  0.4 * hotScale,
                  0.7 * Math.min(1.2, Math.max(0.8, result83)),
                  1,
                );
              }
              if (arg52.groundRing) {
                const ringOp = 0.07 + 0.045 * Math.max(0, 0.5 + 0.5 * result77) + 0.03 * result82;
                arg52.groundRing.material.opacity = ringOp;
                const ringScale = 1 + 0.08 * result77 + 0.05 * result82;
                arg52.groundRing.scale.set(ringScale, ringScale, 1);
              }
              if (arg52.embers && arg52.embers.length) {
                arg52.embers.forEach((arg2) => {
                  const num43 = elapsedTime * arg2.speed + arg2.phase,
                    num44 = (num43 * 0.25) % 1;
                  arg2.mesh.position.set(
                    arg52.baseX + arg2.driftX * num44 + 0.08 * Math.sin(3.4 * num43),
                    arg52.baseFlameY + 0.3 + 2.6 * num44,
                    arg52.baseZ + arg2.driftZ * num44 + 0.08 * Math.cos(2.7 * num43),
                  );
                  const result9 = Math.max(0, (1 - num44) * (0.7 + 0.3 * Math.sin(5 * num43)));
                  arg2.mesh.material.opacity = result9;
                  const num45 = arg2.size * (0.6 + 0.8 * (1 - num44));
                  arg2.mesh.scale.set(num45, num45, 1);
                });
              }
              if (arg52.light) {
                arg52.light.position.y = arg52.baseFlameY;
              }
        }),
        plumeSystem.active && !watchtowerRefinement.active
          ? (() => {
              const limit = getProfileCount("plumeColumns", arr22.length);
              arr22.forEach((arg14, arg15) => {
                if (arg15 >= limit) {
                  arg14.mesh.visible = !1;
                  return;
                }
                arg14.mesh.visible = !0;
                const num175 = elapsedTime * arg14.driftSpeed * tmpV55 + arg14.phase,
                  num176 = (elapsedTime * arg14.riseSpeed * 0.12) % arg14.cycleHeight;
                arg14.mesh.position.y = arg14.baseY + num176;
                const tmpV7 = arg14.haze ? 0.18 : 0.35,
                  num177 = tmpV7 * Math.sin(0.6 * num175);
                ((arg14.mesh.position.x = Math.cos(arg14.angle) * arg14.radius + num177),
                  (arg14.mesh.position.z =
                    Math.sin(arg14.angle) * arg14.radius +
                    (arg14.haze ? 0.12 : 0.22) * Math.cos(0.4 * num175)));
                const num178 = num176 / arg14.cycleHeight;
                if (arg14.haze) {
                  arg14.mesh.material.color.setRGB(
                    0.42 + 0.22 * num178,
                    0.39 + 0.21 * num178,
                    0.35 + 0.19 * num178,
                  );
                } else {
                  arg14.mesh.material.color.setRGB(
                    0.28 + 0.5 * num178,
                    0.25 + 0.48 * num178,
                    0.22 + 0.44 * num178,
                  );
                }
                const tmpV8 = arg14.haze ? 1 + 0.25 * num178 : 1 + 0.6 * num178;
                arg14.mesh.scale.set(arg14.baseScaleX * tmpV8, arg14.baseScaleY * tmpV8, 1);
                const tmpV9 = arg14.haze ? 0.85 - 0.35 * num178 : 1 - num178 * num178;
                arg14.mesh.material.opacity =
                  arg14.baseOpacity * tmpV9 * (0.82 + 0.18 * Math.sin(0.8 * num175));
              });
            })()
          : setRecordVisibility(arr22, !1),
        hazeCloudSystem.active
          ? (() => {
              const limit = getProfileCount("hazeClouds", hazeClouds.length);
              hazeClouds.forEach((arg16, arg17) => {
                if (arg17 >= limit) {
                  arg16.mesh.visible = !1;
                  return;
                }
                arg16.mesh.visible = !0;
                const num179 = elapsedTime * arg16.speed * tmpV55 + arg16.phase,
                  num180 = (elapsedTime * arg16.speed * 0.15) % arg16.cycleHeight;
                ((arg16.mesh.position.y = arg16.baseY + num180),
                  (arg16.mesh.position.x =
                    Math.cos(arg16.yaw + 0.06 * Math.sin(0.4 * num179)) * arg16.radius),
                  (arg16.mesh.position.z =
                    Math.sin(arg16.yaw + 0.06 * Math.sin(0.4 * num179)) * arg16.radius));
                arg16.mesh.material.opacity =
                  (state.lowPower ? 0.08 : 0.12) * num515 + 0.02 * Math.sin(0.5 * num179);
              });
            })()
          : setRecordVisibility(hazeClouds, !1),
        pulseCloudSystem.active
          ? (() => {
              const limit = getProfileCount("pulseClouds", pulseClouds.length);
              pulseClouds.forEach((arg18, arg19) => {
                if (arg19 >= limit) {
                  arg18.puffs.forEach((puff) => {
                    puff.sprite.visible = !1;
                  });
                  return;
                }
                const num181 =
                    ((elapsedTime + arg18.cycleOffset) % arg18.cyclePeriod) / arg18.cyclePeriod,
                  num182 = arg18.fadeInDuration / arg18.cyclePeriod,
                  num183 = num182 + arg18.holdDuration / arg18.cyclePeriod,
                  iEnd = num183 + arg18.fadeOutDuration / arg18.cyclePeriod;
                let num184 = 0;
                (num181 < num182
                  ? (num184 = num181 / num182)
                  : num181 < num183
                    ? (num184 = 1)
                    : num181 < iEnd && (num184 = 1 - (num181 - num183) / (iEnd - num183)),
                  (num184 = num184 * num184 * (3 - 2 * num184)));
                const num185 = 0.02 * elapsedTime + 2.8 * arg19,
                  num186 = arg18.baseAngle + Math.sin(num185) * arg18.angleDriftAmp,
                  num187 = arg18.baseDist + Math.cos(0.7 * num185) * arg18.distDriftAmp,
                  baseVis = num184 * tmpV55 * (state.lowPower ? 0.4 : 0.55);
                for (let num46 = 0; num46 < arg18.puffs.length; num46++) {
                  const puff = arg18.puffs[num46],
                    localAngle = num186 + puff.aOff,
                    localDist = num187 + puff.rOff,
                    breathe = 1 + 0.04 * Math.sin(0.3 * elapsedTime + 1.9 * arg19 + 0.7 * num46);
                  puff.sprite.visible = !0;
                  ((puff.sprite.position.x = Math.cos(localAngle) * localDist),
                    (puff.sprite.position.z = Math.sin(localAngle) * localDist),
                    (puff.sprite.position.y = arg18.baseY + puff.hOff),
                    (puff.sprite.material.opacity =
                      baseVis *
                      (0.75 + 0.25 * Math.sin(0.25 * elapsedTime + 1.3 * num46 + arg19)) *
                      breathe));
                }
              });
            })()
          : (() => {
              pulseClouds.forEach((arg20) => {
                arg20.puffs.forEach((puff) => {
                  puff.sprite.visible = !1;
                });
              });
            })());
      if (haloSystem.active && !filmActive) {
        const haloPulse =
          1 + 0.012 * Math.sin(1.3 * elapsedTime) + 0.006 * Math.sin(2.9 * elapsedTime);
        const haloLimit =
            getProfileCount("haloSprites", 0) +
            getProfileCount("haloBands", 0) +
            getProfileCount("haloTwisters", 0),
          orbitalLimit = getProfileCount("orbitalGlowLayers", arr10.length);
        (sprite17.scale.set(6.5 * haloPulse, 6.5 * haloPulse, 1),
          (spriteMaterial.rotation = 0.07 * elapsedTime),
          sprite16.scale.set(13 * haloPulse, 13 * haloPulse, 1),
          (sprite16.material.opacity = 0.55 + 0.06 * Math.sin(2.1 * elapsedTime)),
          (sprite16.material.rotation = 0.06 * -elapsedTime),
          sprite15.scale.set(20 * haloPulse, 20 * haloPulse, 1),
          (sprite15.material.opacity = 0.32 + 0.05 * Math.sin(0.7 * elapsedTime)),
          (orbitalGlowGroup.rotation.z = 0.02 * elapsedTime),
          camera.matrixWorld.extractBasis(vector3, vector32, vector33));
        for (let haloIndex = 0; haloIndex < arr9.length; haloIndex += 1) {
          const haloRecord = arr9[haloIndex];
          if (haloIndex >= haloLimit) {
            haloRecord.sprite.visible = !1;
            continue;
          }
          haloRecord.sprite.visible = !0;
          const orbitTheta =
              haloRecord.theta +
              elapsedTime * haloRecord.orbitSpeed +
              0.25 * Math.sin(elapsedTime * haloRecord.wobbleFreq * 0.4 + haloRecord.phase) +
              0.15 * Math.sin(elapsedTime * haloRecord.wobble2Freq * 0.3 + 2.3 * haloRecord.phase),
            orbitPhi = haloRecord.phi + 0.15 * Math.sin(0.3 * elapsedTime + haloRecord.phase);
          let orbitRadius =
            haloRecord.orbitRadius +
            Math.sin(elapsedTime * haloRecord.wobbleFreq * 0.5 + haloRecord.phase) *
              haloRecord.wobbleAmp +
            Math.sin(elapsedTime * haloRecord.wobble2Freq * 0.3 + 1.7 * haloRecord.phase) *
              haloRecord.wobble2Amp;
          const violencePhase = elapsedTime * haloRecord.violenceFreq + haloRecord.violencePhase,
            vSin = Math.max(0, Math.sin(violencePhase)),
            vSin2 = vSin * vSin,
            vSin4 = vSin2 * vSin2,
            violenceBoost = smoothstep01(vSin4) * haloRecord.violenceAmp;
          orbitRadius += violenceBoost;
          const orbitX = Math.cos(orbitTheta) * Math.sin(orbitPhi) * orbitRadius,
            orbitY = Math.cos(orbitPhi) * orbitRadius;
          haloRecord.sprite.position.set(
            vector3.x * orbitX + vector32.x * orbitY,
            vector3.y * orbitX + vector32.y * orbitY,
            vector3.z * orbitX + vector32.z * orbitY,
          );
          const haloScale =
              haloRecord.baseScale * (0.85 + 0.15 * Math.sin(1.5 * elapsedTime + haloRecord.phase)),
            violenceScale = Math.min(0.06, 0.045 * violenceBoost);
          (haloRecord.sprite.scale.set(haloScale + violenceScale, haloScale + violenceScale, 1),
            (haloRecord.sprite.material.opacity =
              (0 === haloRecord.layer ? 0.28 : 1 === haloRecord.layer ? 0.18 : 0.1) +
              0.06 * Math.sin(1.8 * elapsedTime + haloRecord.phase) +
              0.5 * violenceScale));
          const colorPhase = (elapsedTime * haloRecord.colorSpeed + haloRecord.colorPhase) % 1,
            colorWave = 0.5 * Math.sin(colorPhase * Math.PI * 2) + 0.5,
            colorGreen = 0.45 + 0.55 * colorWave,
            colorBlue = 0.1 + colorWave * colorWave * 0.6;
          haloRecord.sprite.material.color.setRGB(1, colorGreen, colorBlue);
        }
        for (let orbitalIndex = 0; orbitalIndex < arr10.length; orbitalIndex += 1) {
          const orbitalRecord = arr10[orbitalIndex];
          if (orbitalIndex >= orbitalLimit) {
            orbitalRecord.mesh.visible = !1;
            continue;
          }
          orbitalRecord.mesh.visible = !0;
          const growTime = orbitalRecord.growTime,
            holdTime = orbitalRecord.holdTime,
            shrinkTime = orbitalRecord.noReturn
              ? 2.5 * orbitalRecord.shrinkTime
              : orbitalRecord.shrinkTime,
            cycleTime = growTime + holdTime + shrinkTime + orbitalRecord.pauseTime,
            cyclePhase = (elapsedTime + orbitalRecord.phase) % cycleTime;
          let glowAmount = 0;
          if ((orbitalRecord.mesh.scale.set(1, 1, 1), cyclePhase < growTime)) {
            const growProgress = cyclePhase / growTime;
            glowAmount = 1 - Math.pow(1 - growProgress, 3);
          } else if (cyclePhase < growTime + holdTime) glowAmount = 1;
          else {
            if (!(cyclePhase < growTime + holdTime + shrinkTime)) {
              orbitalRecord.mesh.material.opacity = 0;
              continue;
            }
            glowAmount = 1 - (cyclePhase - growTime - holdTime) / shrinkTime;
          }
          orbitalRecord.mesh.material.opacity = 0.55;
          if (hasMeaningfulScalarChange(orbitalRecord.lastGlowAmount, glowAmount)) {
            const colorArray = orbitalRecord.geo.attributes.color.array;
            for (
              let colorIndex = 0;
              colorIndex < orbitalRecord.heightFracs.length;
              colorIndex += 1
            ) {
              const heightFrac = orbitalRecord.heightFracs[colorIndex];
              let colorFade = clamp01((glowAmount - heightFrac) / 0.15 + 0.5);
              colorFade = colorFade * colorFade * (3 - 2 * colorFade);
              ((colorArray[3 * colorIndex + 0] =
                orbitalRecord.baseColors[3 * colorIndex + 0] * colorFade),
                (colorArray[3 * colorIndex + 1] =
                  orbitalRecord.baseColors[3 * colorIndex + 1] * colorFade),
                (colorArray[3 * colorIndex + 2] =
                  orbitalRecord.baseColors[3 * colorIndex + 2] * colorFade));
            }
            orbitalRecord.lastGlowAmount = glowAmount;
            orbitalRecord.geo.attributes.color.needsUpdate = !0;
          }
        }
      } else {
        setRecordVisibility(arr10, !1);
        arr9.forEach((arg21) => {
          arg21.sprite.visible = !1;
        });
      }
      skyShell.material.uniforms.uTime.value = elapsedTime;
      watchtowerRefinement.enforceVisibility();
      quietScene.enforce();
      if (filmActive) filmScene.finishFrame(camera, cloudLookTarget, cinematic.frame,
        cfg2.width < 900 && cinematic.shot?.arc === 2, (cinematicArea?.top || 200) / cfg2.height);
      if (qualityDebug) qualityDebug.cinematic = { tour: cameraTour ? { ...cameraTour.state, fade: cameraTour.fade } : null, film: filmActive, shot: cinematic.shot?.name, selected: cinematic.selected, angle: cinematic.angle + 1, current: cinematic.current, quiet: quietScene.active };
      rendering.update();
      if (qualityDebug) {
        debugRenderWindowStart ??= timestamp;
        debugRenderFrameCount += 1;
        const debugRenderWindowMs = timestamp - debugRenderWindowStart;
        if (debugRenderWindowMs >= 500) {
          qualityDebug.renderFps = (1e3 * debugRenderFrameCount) / debugRenderWindowMs;
          debugRenderFrameCount = 0;
          debugRenderWindowStart = timestamp;
        }
      }
      if (!sceneReadyMarked) {
        sceneReadyMarked = true;

        architectureAssets.setQuality(state.profile, true);
      }
      container?.classList.toggle("is-ready", cinematic.ready || Boolean(scene.devMode?.active));
    }
    frameScheduler = createSceneFrameScheduler({
      isRenderable() {
        return !document.hidden && sceneVisible && webglContextAvailable;
      },
      onUpdate: updateSceneFrame,
      reducedMotion,
      targetFrameRate: 60,
    });
    const onReducedMotionChange = (event) => {
      reducedMotion = Boolean(event?.matches);
      frameScheduler.setReducedMotion(reducedMotion);
    };
    if (typeof reducedMotionMQ.addEventListener === "function") {
      reducedMotionMQ.addEventListener("change", onReducedMotionChange);
    } else if (typeof reducedMotionMQ.addListener === "function") {
      reducedMotionMQ.addListener(onReducedMotionChange);
    }
    const onDocumentVisibilityChange = () => {
      if (!document.hidden) frameScheduler.resume();
    };
    document.addEventListener("visibilitychange", onDocumentVisibilityChange);
    if (scene.devMode && typeof scene.devMode.attach === "function") {
      scene.devMode.attach({
        THREE,
        camera,
        homeScene,
        canvas: renderer.domElement,
        ensureOutlinePass: rendering.ensureOutlinePass,
        onActivityChange(active) {
          frameScheduler.setForceAnimation(active);
        },
      });
    }
    scene.disposeHomeSceneRuntime = function disposeHomeSceneRuntime() {
      if (runtimeDisposed) return false;
      runtimeDisposed = true;
      sceneReadyMarked = false;
      container.classList?.remove("is-ready");
      document.fonts?.removeEventListener?.("loadingdone", onFontsLoaded);
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("scroll", onWindowScroll);
      document.removeEventListener("visibilitychange", onDocumentVisibilityChange);
      if (typeof reducedMotionMQ.removeEventListener === "function") {
        reducedMotionMQ.removeEventListener("change", onReducedMotionChange);
      } else if (typeof reducedMotionMQ.removeListener === "function") {
        reducedMotionMQ.removeListener(onReducedMotionChange);
      }
      sceneIntersectionObserver?.disconnect();
      sceneIntersectionObserver = null;
      if (
        reflectionCaptureFrame !== null &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(reflectionCaptureFrame);
      }
      reflectionCaptureFrame = null;
      resizeController.dispose();
      frameScheduler.dispose();
      if (scene.devMode && typeof scene.devMode.dispose === "function") {
        scene.devMode.dispose();
      }
      subsystemRegistry.dispose();
      const disposedResources = rendering.disposeResult;
      reflectionRenderTarget = null;
      frameScheduler = null;
      scene.setClouds = () => false;
      scene.toggleClouds = () => false;
      scene.disposeHomeSceneRuntime = () => false;
      return disposedResources;
    };
    frameScheduler.start();
    return true;
    });
  };
})();
