// WebGL feature probe shared between the UI boot path and the scene bundle.
//
// `main.js` calls this before triggering the scene-bundle download so we skip
// the network cost on browsers without hardware WebGL. `scene/helpers.js`
// re-exposes it as `scene.supportsWebGL` for the scene-side guard at init time.
// The cached result also carries the texture limits the quality tier reads,
// so the scene does not open a second probe context for them.
(() => {
  const site = (window.BabelSite = window.BabelSite || {});
  const shared = (site.shared = site.shared || {});

  // The scene entry also imports this module. Keep the first implementation
  // (and its cached result) when the deferred bundle executes.
  if (
    typeof shared.getWebGLCapabilities === "function" &&
    typeof shared.supportsWebGL === "function"
  ) {
    return;
  }

  const SOFTWARE_RENDERER_PATTERN =
    /swiftshader|llvmpipe|software (?:rasterizer|renderer)|microsoft basic render driver/i;
  let cachedCapabilities = null;

  function releaseProbeContext(gl) {
    try {
      const loseContext = gl?.getExtension?.("WEBGL_lose_context");
      loseContext?.loseContext?.();
    } catch (_err) {
      // Context cleanup is best-effort; detection has already completed.
    }
  }

  function readRenderer(gl) {
    try {
      const debugInfo = gl?.getExtension?.("WEBGL_debug_renderer_info");
      if (debugInfo) {
        return String(gl.getParameter?.(debugInfo.UNMASKED_RENDERER_WEBGL) || "");
      }
    } catch (_err) {
      // Privacy-hardened browsers may deny the unmasked renderer.
    }

    try {
      if (typeof gl?.getParameter !== "function" || gl.RENDERER === undefined) return "";
      return String(gl.getParameter(gl.RENDERER) || "");
    } catch (_err) {
      return "";
    }
  }

  // A size of 0 means unknown; the scene then reads its own limits.
  function readTextureLimits(gl) {
    let maxTextureSize = 0;
    let maxAnisotropy = 1;
    try {
      maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
    } catch (_err) {
      maxTextureSize = 0;
    }
    try {
      const ext =
        gl.getExtension("EXT_texture_filter_anisotropic") ||
        gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic") ||
        gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
      if (ext) maxAnisotropy = Number(gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) || 1;
    } catch (_err) {
      maxAnisotropy = 1;
    }
    return { maxAnisotropy: Math.max(1, Math.round(maxAnisotropy)), maxTextureSize };
  }

  function tryGetContext(probe, kind, options) {
    try {
      return probe.getContext(kind, options);
    } catch (_err) {
      return null;
    }
  }

  shared.getWebGLCapabilities = function getWebGLCapabilities() {
    if (cachedCapabilities) return cachedCapabilities;

    let gl = null;
    try {
      if (!window.WebGLRenderingContext && !window.WebGL2RenderingContext) {
        cachedCapabilities = Object.freeze({ available: false, softwareRenderer: false });
        return cachedCapabilities;
      }

      const probe = document.createElement("canvas");
      if (!probe || typeof probe.getContext !== "function") {
        cachedCapabilities = Object.freeze({ available: false, softwareRenderer: false });
        return cachedCapabilities;
      }

      // The ambient scene does not need a discrete GPU; this matches the renderer.
      const options = { powerPreference: "default" };
      if (window.WebGL2RenderingContext) gl = tryGetContext(probe, "webgl2", options);
      gl =
        gl || tryGetContext(probe, "webgl", options) || tryGetContext(probe, "experimental-webgl");

      if (!gl) {
        cachedCapabilities = Object.freeze({ available: false, softwareRenderer: false });
        return cachedCapabilities;
      }

      cachedCapabilities = Object.freeze({
        available: true,
        softwareRenderer: SOFTWARE_RENDERER_PATTERN.test(readRenderer(gl)),
        ...readTextureLimits(gl),
      });
      return cachedCapabilities;
    } catch (_err) {
      cachedCapabilities = Object.freeze({ available: false, softwareRenderer: false });
      return cachedCapabilities;
    } finally {
      releaseProbeContext(gl);
    }
  };

  shared.supportsWebGL = function supportsWebGL() {
    return shared.getWebGLCapabilities().available;
  };
})();
