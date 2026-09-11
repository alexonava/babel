(() => {
  const site = (window.BabelSite = window.BabelSite || {});
  let sceneInitialized = false;
  let staticRecoveryInstalled = false;
  let staticRecoveryAttempted = false;
  const staticRecoveryCleanups = [];

  function initUi() {
    const ui = site.ui || {};
    if (typeof ui.initHeroChrome === "function") ui.initHeroChrome();
    if (typeof ui.initPanels === "function") ui.initPanels();
  }

  function initScene() {
    if (sceneInitialized) return true;
    const scene = site.scene || {};
    if (typeof scene.initHomeScene === "function") {
      const initialized = scene.initHomeScene();
      if (initialized === false) return false;
      sceneInitialized = true;
      return true;
    }
    return false;
  }

  function getSceneScriptUrl() {
    const metadata = document.querySelector("meta[data-scene-script]");
    const configuredUrl = metadata?.getAttribute?.("content")?.trim();
    return configuredUrl || "/scripts/scene.js";
  }

  // src/shared/webgl-probe.js is bundled into both the UI and scene entries so
  // the pre-download gate here and the in-scene check (`scene.supportsWebGL`)
  // share one implementation. Skipping the scene-bundle download on static
  // preference/capability paths is the reason this check happens in the UI
  // bundle.

  function disableSceneHost() {
    const host = document.getElementById("home-scene");
    if (host) host.hidden = true;
  }

  function enableSceneHost() {
    const host = document.getElementById("home-scene");
    if (host) host.hidden = false;
  }

  function readSceneQualityControls() {
    const scene = site.scene || {};
    if (typeof scene.readSceneQualityControls === "function") {
      return scene.readSceneQualityControls(window.location?.search || "");
    }

    try {
      const params = new URLSearchParams(window.location?.search || "");
      const quality = (params.get("quality") || "").toLowerCase();
      const VALID_TIERS = ["low", "balanced", "high"];
      return {
        debug: params.get("sceneDebug") === "1" || params.get("sceneDebug") === "true",
        overrideTier: VALID_TIERS.includes(quality) ? quality : null,
      };
    } catch {
      return { debug: false, overrideTier: null };
    }
  }

  function detectsReducedData() {
    const scene = site.scene || {};
    if (typeof scene.detectSaveData === "function") {
      return scene.detectSaveData({
        navigatorInfo: typeof navigator !== "undefined" ? navigator : {},
      });
    }

    const connection = typeof navigator !== "undefined" ? navigator.connection : null;
    if (connection?.saveData === true) return true;

    try {
      return window.matchMedia("(prefers-reduced-data: reduce)").matches === true;
    } catch {
      return false;
    }
  }

  function detectsReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches === true;
    } catch {
      return false;
    }
  }

  function forcesLiveScene(controls) {
    return Boolean(controls?.overrideTier || controls?.debug);
  }

  function clearStaticPreferenceRecovery() {
    while (staticRecoveryCleanups.length) {
      staticRecoveryCleanups.pop()?.();
    }
    staticRecoveryInstalled = false;
  }

  function addChangeListener(target, handler) {
    if (typeof target?.addEventListener === "function") {
      target.addEventListener("change", handler);
      return () => target.removeEventListener?.("change", handler);
    }
    if (typeof target?.addListener === "function") {
      target.addListener(handler);
      return () => target.removeListener?.(handler);
    }
    return null;
  }

  function installStaticPreferenceRecovery() {
    if (staticRecoveryInstalled || staticRecoveryAttempted) return;
    const controls = readSceneQualityControls();
    if (forcesLiveScene(controls) || (!detectsReducedData() && !detectsReducedMotion())) return;

    const recover = () => {
      if (staticRecoveryAttempted || detectsReducedData() || detectsReducedMotion()) return;
      staticRecoveryAttempted = true;
      clearStaticPreferenceRecovery();
      void site.ensureSceneReady();
    };

    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const dataQuery = window.matchMedia?.("(prefers-reduced-data: reduce)");
    const connection = typeof navigator !== "undefined" ? navigator.connection : null;
    [motionQuery, dataQuery, connection].forEach((target) => {
      const cleanup = addChangeListener(target, recover);
      if (cleanup) staticRecoveryCleanups.push(cleanup);
    });
    staticRecoveryInstalled = staticRecoveryCleanups.length > 0;
  }

  function loadScriptOnce(src) {
    const existing = document.querySelector(`script[data-dynamic-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") return Promise.resolve();
      return new Promise((resolve, reject) => {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.dynamicSrc = src;
      script.addEventListener(
        "load",
        () => {
          script.dataset.loaded = "true";
          resolve();
        },
        { once: true },
      );
      script.addEventListener(
        "error",
        (error) => {
          script.remove();
          reject(error);
        },
        { once: true },
      );
      document.head.appendChild(script);
    });
  }

  async function loadAndInitScene() {
    await site.ensureSceneReady();
  }

  site.ensureSceneReady = async function ensureSceneReady() {
    if (site.scene?.initHomeScene) {
      const initialized = initScene();
      if (initialized) {
        enableSceneHost();
        clearStaticPreferenceRecovery();
      }
      return initialized;
    }

    const controls = readSceneQualityControls();
    const forceLiveScene = forcesLiveScene(controls);
    if (!forceLiveScene && (detectsReducedData() || detectsReducedMotion())) {
      disableSceneHost();
      return false;
    }

    const capabilities = site.shared.getWebGLCapabilities();
    if (!capabilities.available || (!forceLiveScene && capabilities.softwareRenderer)) {
      disableSceneHost();
      return false;
    }

    try {
      await loadScriptOnce(getSceneScriptUrl());
      enableSceneHost();
      const initialized = initScene();
      if (!initialized) {
        disableSceneHost();
        return false;
      }
      clearStaticPreferenceRecovery();
      return true;
    } catch (error) {
      console.warn("Scene bundle failed to load.", error);
      disableSceneHost();
      return false;
    }
  };

  // Defer the heavier Three.js scene bundle past first paint so the hero LCP
  // and panel controls are interactive before WebGL setup starts.
  function afterFirstPaint(cb) {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(cb, { timeout: 500 });
    } else {
      requestAnimationFrame(() => setTimeout(cb, 0));
    }
  }

  function boot() {
    initUi();
    installStaticPreferenceRecovery();
    afterFirstPaint(loadAndInitScene);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
