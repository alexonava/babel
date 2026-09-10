(() => {
  const site = (window.BabelSite = window.BabelSite || {});
  const scene = (site.scene = site.scene || {});

  const TIER_ORDER = ["low", "balanced", "high"];
  const SCENE_COMPOSITION_PROFILES = {
    compact: {
      camera: {
        fov: 48.52,
        heightBase: 21.9,
        heightScrollDelta: 0.9,
        lookAtBase: 11.68,
        lookAtScrollDelta: 2.1,
        orbitBase: 74.8,
        orbitScale: 1.14,
        orbitScrollDelta: 2.4,
        orbitTrim: 0.144,
      },
      cloudAnchorY: -7.5,
      countScale: 1,
      name: "compact",
      sceneOffsetY: -7.5,
      towerScale: 1,
    },
    desktop: {
      camera: {
        fov: 48.52,
        heightBase: 21.9,
        heightScrollDelta: 0.9,
        lookAtBase: 11.68,
        lookAtScrollDelta: 2.1,
        orbitBase: 65.8,
        orbitScale: 1.14,
        orbitScrollDelta: 2.4,
        orbitTrim: 0.144,
      },
      cloudAnchorY: -7.5,
      countScale: 1,
      name: "desktop",
      sceneOffsetY: -7.5,
      towerScale: 1,
    },
    portraitPhone: {
      camera: {
        fov: 50.32,
        heightBase: 19.8,
        heightScrollDelta: 0.5,
        lookAtBase: 12.44,
        lookAtScrollDelta: 1.55,
        orbitBase: 72.3,
        orbitScale: 1.08,
        orbitScrollDelta: 1.7,
        orbitTrim: 0.124,
      },
      cloudAnchorY: -6.8,
      // Fog already hides most of the backside on portrait framing, so we trim
      // active particle counts by 30% — fragment-shading win with no visible
      // loss at phone viewport sizes.
      countScale: 0.7,
      name: "portraitPhone",
      sceneOffsetY: -6.8,
      towerScale: 1,
    },
    // Phone rotated to landscape (~844x390). Viewport is very short, so the
    // camera pulls up and the look-at target lowers to keep the tower in the
    // frame. Phone-class countScale still applies.
    landscapePhone: {
      camera: {
        fov: 55.8,
        heightBase: 22.4,
        heightScrollDelta: 0.4,
        lookAtBase: 10.8,
        lookAtScrollDelta: 1.3,
        orbitBase: 63.2,
        orbitScale: 1.1,
        orbitScrollDelta: 1.9,
        orbitTrim: 0.144,
      },
      cloudAnchorY: -7.2,
      countScale: 0.7,
      name: "landscapePhone",
      sceneOffsetY: -7.2,
      towerScale: 1,
    },
    // Tablet in portrait (iPad-class, ~810x1080). Wider than a phone but still
    // touch-primary; framing sits between portraitPhone and compact with a
    // modest count trim for thermal headroom.
    tabletPortrait: {
      camera: {
        fov: 48.52,
        heightBase: 21.2,
        heightScrollDelta: 0.7,
        lookAtBase: 12.38,
        lookAtScrollDelta: 1.85,
        orbitBase: 71.8,
        orbitScale: 1.12,
        orbitScrollDelta: 2.1,
        orbitTrim: 0.134,
      },
      cloudAnchorY: -7.2,
      countScale: 0.85,
      name: "tabletPortrait",
      sceneOffsetY: -7.2,
      towerScale: 1,
    },
  };
  const SCENE_QUALITY_PROFILES = {
    high: {
      dprCap: 2,
      antialias: true,
      anisotropy: { min: 1, max: 8 },
      textures: {
        groundSize: 1024,
        overlaySize: 512,
        towerWidth: 1280,
        cloudAtlasSize: 512,
      },
      geometry: {
        skyWidthSegments: 24,
        skyHeightSegments: 14,
        circleSegments: 88,
        overlaySegments: 80,
        pointFieldCount: 210,
        marbleCanvasSize: 1024,
      },
      shadows: {
        enabled: true,
        mapSize: 2048,
      },
      postprocessGrading: true,
      postprocessBloom: true,
      postprocessVignette: true,
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
      lighting: {
        fogNear: 66,
        fogFar: 154,
        ambientIntensity: 0.2,
        hemisphereIntensity: 0.62,
        directionalIntensity: 3.25,
        fillIntensity: 0.46,
        extraDirectional: true,
        practicalIntensityScale: 1.08,
        towerLightIntensityScale: 1,
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
        backdropPlantSprites: 72,
        backdropPlantClusters: 7,
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
    },
    balanced: {
      dprCap: 1.5,
      antialias: true,
      anisotropy: { min: 1, max: 6 },
      textures: {
        groundSize: 768,
        overlaySize: 384,
        towerWidth: 768,
        cloudAtlasSize: 384,
      },
      geometry: {
        skyWidthSegments: 20,
        skyHeightSegments: 12,
        circleSegments: 72,
        overlaySegments: 64,
        pointFieldCount: 160,
        marbleCanvasSize: 512,
      },
      // Mobile and slow-CPU desktops land here. Shadows are a full extra
      // render pass of every shadow-casting object each frame — big win on
      // phones to skip it entirely rather than render a low-res shadow map.
      shadows: {
        enabled: false,
        mapSize: 0,
      },
      postprocessGrading: true,
      postprocessBloom: false,
      postprocessVignette: true,
      postprocessGrain: true,
      postprocessSettings: {
        bloomStrength: 0,
        celMix: 0.24,
        contrast: 1.08,
        grainStrength: 0.016,
        highlightWarmMix: 0.18,
        shadowCoolMix: 0.3,
        vignetteStrength: 0.1,
      },
      lighting: {
        fogNear: 64,
        fogFar: 150,
        ambientIntensity: 0.22,
        hemisphereIntensity: 0.66,
        directionalIntensity: 2.95,
        fillIntensity: 0.28,
        extraDirectional: true,
        practicalIntensityScale: 0.84,
        towerLightIntensityScale: 0.58,
      },
      counts: {
        orbitalGlowLayers: 2,
        haloSprites: 64,
        haloBands: 36,
        haloTwisters: 20,
        upperGlowSprites: 10,
        midCloudTextures: 6,
        midCloudSprites: 20,
        groundPlantSprites: 160,
        backdropPlantSprites: 48,
        backdropPlantClusters: 5,
        buttresses: 7,
        reliefBricks: 24,
        driftClouds: 12,
        emberClouds: 24,
        hazeClouds: 28,
        pulseClouds: 3,
        pulsePuffsPerCluster: 4,
        plumeColumns: 12,
        craterHaze: 5,
        marbleVeinCount: 12,
      },
    },
    low: {
      dprCap: 1.3,
      antialias: false,
      anisotropy: { min: 1, max: 4 },
      textures: {
        groundSize: 512,
        overlaySize: 256,
        towerWidth: 320,
        cloudAtlasSize: 256,
      },
      geometry: {
        skyWidthSegments: 16,
        skyHeightSegments: 10,
        circleSegments: 56,
        overlaySegments: 48,
        pointFieldCount: 110,
        marbleCanvasSize: 256,
      },
      shadows: {
        enabled: false,
        mapSize: 0,
      },
      postprocessGrading: true,
      postprocessBloom: false,
      postprocessVignette: false,
      postprocessGrain: false,
      postprocessSettings: {
        bloomStrength: 0,
        celMix: 0.2,
        contrast: 1.05,
        grainStrength: 0,
        highlightWarmMix: 0.14,
        shadowCoolMix: 0.22,
        vignetteStrength: 0,
      },
      lighting: {
        fogNear: 60,
        fogFar: 144,
        ambientIntensity: 0.24,
        hemisphereIntensity: 0.7,
        directionalIntensity: 2.45,
        fillIntensity: 0,
        extraDirectional: false,
        practicalIntensityScale: 0.58,
        towerLightIntensityScale: 0,
      },
      counts: {
        orbitalGlowLayers: 1,
        haloSprites: 40,
        haloBands: 24,
        haloTwisters: 14,
        upperGlowSprites: 8,
        midCloudTextures: 4,
        midCloudSprites: 18,
        groundPlantSprites: 110,
        backdropPlantSprites: 34,
        backdropPlantClusters: 4,
        buttresses: 6,
        reliefBricks: 18,
        driftClouds: 8,
        emberClouds: 18,
        hazeClouds: 18,
        pulseClouds: 2,
        pulsePuffsPerCluster: 3,
        plumeColumns: 9,
        craterHaze: 4,
        marbleVeinCount: 8,
      },
    },
  };

  function normalizeTier(value, fallback = null) {
    if (typeof value !== "string") return fallback;
    const normalized = value.toLowerCase().trim();
    if (normalized === "auto") return "auto";
    return TIER_ORDER.includes(normalized) ? normalized : fallback;
  }

  function cloneProfile(tier) {
    const profile = SCENE_QUALITY_PROFILES[tier] || SCENE_QUALITY_PROFILES.high;
    return {
      tier,
      isLow: tier === "low",
      dprCap: profile.dprCap,
      antialias: profile.antialias,
      anisotropy: { ...profile.anisotropy },
      textures: { ...profile.textures },
      geometry: { ...profile.geometry },
      shadows: { ...profile.shadows },
      postprocessGrading: profile.postprocessGrading,
      postprocessBloom: profile.postprocessBloom,
      postprocessVignette: profile.postprocessVignette,
      postprocessGrain: profile.postprocessGrain,
      postprocessSettings: { ...profile.postprocessSettings },
      lighting: { ...profile.lighting },
      counts: { ...profile.counts },
    };
  }

  function cloneCompositionProfile(name) {
    const profile = SCENE_COMPOSITION_PROFILES[name] || SCENE_COMPOSITION_PROFILES.desktop;
    return {
      camera: { ...profile.camera },
      cloudAnchorY: profile.cloudAnchorY,
      countScale: typeof profile.countScale === "number" ? profile.countScale : 1,
      name: profile.name,
      sceneOffsetY: profile.sceneOffsetY,
      towerScale: profile.towerScale,
    };
  }

  function readSceneQualityControls(search = window.location?.search || "") {
    const params = new URLSearchParams(typeof search === "string" ? search : "");
    const requestedTier = normalizeTier(params.get("quality"), "auto");
    return {
      debug: params.get("sceneDebug") === "1" || params.get("sceneDebug") === "true",
      overrideTier: requestedTier && requestedTier !== "auto" ? requestedTier : null,
      requestedTier,
    };
  }

  function readWebGLQualityCaps({ canvas } = {}) {
    const fallback = { maxAnisotropy: 1, maxTextureSize: 0 };
    const probeCanvas = canvas || document.createElement("canvas");
    if (!probeCanvas || typeof probeCanvas.getContext !== "function") return fallback;

    let gl = null;
    try {
      gl =
        probeCanvas.getContext("webgl", { powerPreference: "high-performance" }) ||
        probeCanvas.getContext("experimental-webgl");
    } catch (_err) {
      gl = null;
    }

    if (!gl) return fallback;

    let maxTextureSize = 0;
    let maxAnisotropy = 1;
    try {
      maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    } catch (_err) {
      maxTextureSize = 0;
    }

    try {
      const ext =
        gl.getExtension("EXT_texture_filter_anisotropic") ||
        gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic") ||
        gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
      if (ext) {
        maxAnisotropy = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
      }
    } catch (_err) {
      maxAnisotropy = 1;
    }

    try {
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose && typeof lose.loseContext === "function") {
        lose.loseContext();
      }
    } catch (_err) {
      // Ignore cleanup failures from probe contexts.
    }

    return {
      maxAnisotropy: Math.max(1, Math.round(maxAnisotropy || 1)),
      maxTextureSize,
    };
  }

  function selectSceneQualityTier({
    controls,
    navigatorInfo = {},
    viewport = {},
    caps = {},
    touchPrimary = false,
    saveData = false,
  }) {
    if (controls?.overrideTier) return controls.overrideTier;

    // Respect metered connections and explicit data-saver settings before
    // spending on the full asset load.
    if (saveData) return "low";

    const memoryLimited =
      typeof navigatorInfo.deviceMemory === "number" && navigatorInfo.deviceMemory <= 2;
    const cpuLimited = (navigatorInfo.hardwareConcurrency || 8) <= 4;
    const weakCaps = (caps.maxTextureSize || 0) < 4096 || (caps.maxAnisotropy || 1) < 4;
    const shortSide = Math.min(viewport.width || 0, viewport.height || 0);
    const longSide = Math.max(viewport.width || 0, viewport.height || 0);
    const phoneViewport = touchPrimary && shortSide > 0 && shortSide <= 500 && longSide <= 1000;

    if (memoryLimited || weakCaps) return "low";
    if (cpuLimited) return "balanced";
    if (phoneViewport) return "balanced";

    // Touch-primary devices used to get blanket-capped at balanced because iOS
    // hides deviceMemory. Phone-shaped viewports now stay balanced for battery
    // and thermals; larger flagship-class touch devices can still reach high.
    const flagshipCaps =
      (caps.maxTextureSize || 0) >= 8192 &&
      (caps.maxAnisotropy || 1) >= 8 &&
      (navigatorInfo.hardwareConcurrency || 0) >= 6;
    if (touchPrimary && !flagshipCaps) return "balanced";

    if (shortSide > 0 && shortSide < 340) return "balanced";

    return "high";
  }

  function detectTouchPrimary() {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    try {
      return window.matchMedia("(pointer: coarse)").matches === true;
    } catch (_err) {
      return false;
    }
  }

  function detectSaveData({
    navigatorInfo = typeof navigator !== "undefined" ? navigator : {},
  } = {}) {
    const connection = navigatorInfo && navigatorInfo.connection;
    if (connection && connection.saveData === true) return true;
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      try {
        if (window.matchMedia("(prefers-reduced-data: reduce)").matches) return true;
      } catch (_err) {
        // Older engines without the media feature — ignore.
      }
    }
    return false;
  }

  // Small phones with a high devicePixelRatio render the same pixel count as
  // mid-range laptops while shipping ~4x the fragment work. Apple hides
  // deviceMemory for privacy, so we can't classify those phones as "low" via
  // the normal path. Drop their effective DPR ceiling a notch instead — at
  // phone physical sizes it's invisible but the fragment-count win is real.
  function resolveEffectiveDprCap(
    profile,
    { touchPrimary = false, navigatorInfo = {}, caps = {} } = {},
  ) {
    const baseCap = profile && typeof profile.dprCap === "number" ? profile.dprCap : 1;
    const unknownMemory = typeof navigatorInfo.deviceMemory !== "number";
    const flagshipCaps =
      (caps.maxTextureSize || 0) >= 8192 &&
      (caps.maxAnisotropy || 1) >= 8 &&
      (navigatorInfo.hardwareConcurrency || 0) >= 6;
    if (touchPrimary && unknownMemory && !flagshipCaps) return Math.min(baseCap, 1.25);
    return baseCap;
  }

  function indexForTier(tier) {
    return Math.max(0, TIER_ORDER.indexOf(normalizeTier(tier, "high")));
  }

  function nextLowerTier(tier) {
    return TIER_ORDER[Math.max(0, indexForTier(tier) - 1)];
  }

  function nextHigherTier(tier, ceilingTier) {
    const current = indexForTier(tier);
    const ceiling = indexForTier(ceilingTier);
    return TIER_ORDER[Math.min(ceiling, current + 1)];
  }

  function createSceneQualityGovernor({
    initialTier = "high",
    overrideTier = null,
    downsampleFrames = 60,
    warmupFrames = 60,
  } = {}) {
    const stableInitialTier = normalizeTier(initialTier, "high");
    const fixedTier = normalizeTier(overrideTier, null);
    let currentTier = fixedTier || stableInitialTier;
    let highFrameStreak = 0;
    let recoveryFrameStreak = 0;
    let lastChangeMs = 0;
    let sampleCount = 0;
    const samples = [];
    let sampleSum = 0;

    function resetCounters() {
      highFrameStreak = 0;
      recoveryFrameStreak = 0;
    }

    return {
      getAverageFrameTime() {
        return samples.length ? sampleSum / samples.length : 0;
      },
      getInitialTier() {
        return stableInitialTier;
      },
      getTier() {
        return currentTier;
      },
      isFixed() {
        return Boolean(fixedTier);
      },
      sample(frameTimeMs, nowMs = 0) {
        if (!(frameTimeMs >= 0)) return null;

        samples.push(frameTimeMs);
        sampleSum += frameTimeMs;
        sampleCount += 1;
        if (samples.length > downsampleFrames) {
          sampleSum -= samples.shift();
        }

        if (fixedTier || samples.length < downsampleFrames) {
          return null;
        }

        // Skip streak accumulation during warmup: three.js startup, texture
        // uploads, and first-frame shader compilation all front-load frame
        // cost. Counting that window against the tier causes a visible
        // cold-start downgrade within the first second on phones.
        if (sampleCount <= downsampleFrames + warmupFrames) {
          return null;
        }

        const average = sampleSum / samples.length;

        highFrameStreak = average > 20 ? highFrameStreak + 1 : 0;
        recoveryFrameStreak = average < 15 ? recoveryFrameStreak + 1 : 0;

        if (highFrameStreak >= 120 && currentTier !== "low") {
          currentTier = nextLowerTier(currentTier);
          lastChangeMs = nowMs;
          resetCounters();
          return currentTier;
        }

        if (
          recoveryFrameStreak >= 300 &&
          currentTier !== stableInitialTier &&
          nowMs - lastChangeMs >= 10000
        ) {
          currentTier = nextHigherTier(currentTier, stableInitialTier);
          lastChangeMs = nowMs;
          resetCounters();
          return currentTier;
        }

        return null;
      },
    };
  }

  function createSceneQualityState({
    navigatorInfo = navigator,
    search = window.location?.search || "",
    viewport = { width: window.innerWidth, height: window.innerHeight },
    caps = null,
    touchPrimary = detectTouchPrimary(),
    saveData = detectSaveData({ navigatorInfo }),
  } = {}) {
    const controls = readSceneQualityControls(search);
    const resolvedCaps = caps || readWebGLQualityCaps();
    const initialTier = selectSceneQualityTier({
      controls,
      navigatorInfo,
      viewport,
      caps: resolvedCaps,
      touchPrimary,
      saveData,
    });
    const governor = createSceneQualityGovernor({
      initialTier,
      overrideTier: controls.overrideTier,
    });

    return {
      caps: resolvedCaps,
      controls,
      governor,
      initialTier,
      navigatorInfo,
      saveData,
      touchPrimary,
      getProfile(tier = governor.getTier()) {
        return cloneProfile(tier);
      },
      getTier() {
        return governor.getTier();
      },
      resolveDprCap(profile) {
        return resolveEffectiveDprCap(profile, { touchPrimary, navigatorInfo, caps: resolvedCaps });
      },
      sample(frameTimeMs, nowMs) {
        const nextTier = governor.sample(frameTimeMs, nowMs);
        return nextTier ? cloneProfile(nextTier) : null;
      },
    };
  }

  function getSceneCompositionProfile({
    width = window.innerWidth,
    height = window.innerHeight,
  } = {}) {
    const safeWidth = Math.max(1, width || 0);
    const safeHeight = Math.max(1, height || 0);
    const isPortrait = safeHeight > safeWidth;
    const isPortraitPhone = safeWidth <= 760 && isPortrait && safeHeight / safeWidth >= 1.15;
    // Short-height landscape viewports are dominated by rotated phones. Cap
    // at 1000px wide to keep small laptops out of this bucket.
    const isLandscapePhone = !isPortrait && safeHeight <= 500 && safeWidth <= 1000;
    // Tablet portrait: wider than a phone but still narrower than a small
    // laptop, held in portrait. Uses a touch-friendly frame without the
    // compact-desktop camera pullback.
    const isTabletPortrait = isPortrait && safeWidth > 760 && safeWidth <= 1024;

    if (isPortraitPhone) return cloneCompositionProfile("portraitPhone");
    if (isLandscapePhone) return cloneCompositionProfile("landscapePhone");
    if (isTabletPortrait) return cloneCompositionProfile("tabletPortrait");
    if (safeWidth < 1100) return cloneCompositionProfile("compact");
    return cloneCompositionProfile("desktop");
  }

  scene.SCENE_COMPOSITION_PROFILES = SCENE_COMPOSITION_PROFILES;
  scene.SCENE_QUALITY_PROFILES = SCENE_QUALITY_PROFILES;
  scene.createSceneQualityGovernor = createSceneQualityGovernor;
  scene.createSceneQualityState = createSceneQualityState;
  scene.detectSaveData = detectSaveData;
  scene.detectTouchPrimary = detectTouchPrimary;
  scene.getSceneCompositionProfile = getSceneCompositionProfile;
  scene.resolveEffectiveDprCap = resolveEffectiveDprCap;
  scene.getSceneQualityProfile = function getSceneQualityProfile(tier) {
    return cloneProfile(normalizeTier(tier, "high"));
  };
  scene.readSceneQualityControls = readSceneQualityControls;
  scene.readWebGLQualityCaps = readWebGLQualityCaps;
  scene.selectSceneQualityTier = selectSceneQualityTier;
})();
