const DEFAULT_FRAME_SECONDS = 1 / 60;

function clampFrameSeconds(value, maximum) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(maximum, value);
}

/**
 * Owns scene frame scheduling without owning any Three.js resources.
 *
 * Animated mode schedules continuously. Reduced-motion and still modes freeze
 * elapsed scene time and render only after invalidate(); still mode leaves the
 * reported reducedMotion preference alone. While any named hold is set nothing
 * renders or schedules, as when isRenderable() fails; releasing the last hold
 * resumes with a fresh delta. A separate per-rAF sample is retained when
 * frameStride > 1 so the quality governor does not mistake a deliberate 30fps
 * render cap for 30fps frame pressure.
 */
export function createSceneFrameScheduler({
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  frameStride = 1,
  isRenderable = () => true,
  maxDeltaSeconds = 0.1,
  now = () => globalThis.performance?.now?.() ?? 0,
  onUpdate,
  reducedMotion = false,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  targetFrameRate = 0,
} = {}) {
  if (typeof onUpdate !== "function") {
    throw new TypeError("createSceneFrameScheduler requires onUpdate");
  }
  if (typeof requestFrame !== "function") {
    throw new TypeError("createSceneFrameScheduler requires requestFrame");
  }

  const stableStride = Math.max(1, Math.floor(frameStride || 1));
  const stableTargetFrameRate =
    Number.isFinite(targetFrameRate) && targetFrameRate > 0 ? targetFrameRate : 0;
  const targetFrameSeconds = stableTargetFrameRate > 0 ? 1 / stableTargetFrameRate : 0;
  const frameToleranceSeconds = Math.min(0.00075, targetFrameSeconds * 0.05);
  let active = false;
  let dirty = true;
  let elapsedSeconds = 0;
  let forceAnimation = false;
  let frameHandle = null;
  let frameTick = 0;
  let hasRendered = false;
  const holds = new Set();
  let lastTimestamp = null;
  let maxSampleDeltaSeconds = 0;
  let pendingDeltaSeconds = 0;
  let renderAccumulatorSeconds = 0;
  let prefersReducedMotion = Boolean(reducedMotion);
  let still = false;

  function isAnimated() {
    return (!prefersReducedMotion && !still) || forceAnimation;
  }

  function schedule() {
    if (!active || holds.size > 0 || frameHandle !== null) return;
    frameHandle = requestFrame(update);
  }

  function cancel() {
    if (frameHandle !== null && typeof cancelFrame === "function") {
      cancelFrame(frameHandle);
    }
    frameHandle = null;
  }

  function resetTiming() {
    lastTimestamp = null;
    maxSampleDeltaSeconds = 0;
    pendingDeltaSeconds = 0;
    renderAccumulatorSeconds = 0;
    frameTick = 0;
    hasRendered = false;
  }

  function resume() {
    resetTiming();
    dirty = true;
    schedule();
  }

  function update(timestamp = now()) {
    frameHandle = null;
    if (!active) return;
    if (holds.size > 0 || !isRenderable()) {
      resetTiming();
      return;
    }

    const safeTimestamp = Number.isFinite(timestamp) ? timestamp : now();
    const sampleDeltaSeconds =
      lastTimestamp === null
        ? 0
        : clampFrameSeconds((safeTimestamp - lastTimestamp) / 1000, maxDeltaSeconds);
    lastTimestamp = safeTimestamp;
    maxSampleDeltaSeconds = Math.max(maxSampleDeltaSeconds, sampleDeltaSeconds);

    const animated = isAnimated();
    if (animated) {
      pendingDeltaSeconds += sampleDeltaSeconds;
      renderAccumulatorSeconds += sampleDeltaSeconds;
      elapsedSeconds += sampleDeltaSeconds;
      schedule();
    }

    if (!animated && !dirty) return;
    if (animated && stableStride > 1) {
      frameTick = (frameTick + 1) % stableStride;
      if (frameTick !== 0) return;
    }
    if (
      animated &&
      hasRendered &&
      targetFrameSeconds > 0 &&
      renderAccumulatorSeconds + frameToleranceSeconds < targetFrameSeconds
    ) {
      return;
    }

    const deltaSeconds = animated ? clampFrameSeconds(pendingDeltaSeconds, maxDeltaSeconds) : 0;
    const qualitySampleSeconds =
      maxSampleDeltaSeconds > 0 ? maxSampleDeltaSeconds : DEFAULT_FRAME_SECONDS;
    pendingDeltaSeconds = 0;
    maxSampleDeltaSeconds = 0;
    if (targetFrameSeconds > 0) {
      renderAccumulatorSeconds =
        renderAccumulatorSeconds < targetFrameSeconds
          ? 0
          : renderAccumulatorSeconds % targetFrameSeconds;
    } else {
      renderAccumulatorSeconds = 0;
    }
    hasRendered = true;
    dirty = false;
    onUpdate({
      deltaSeconds,
      elapsedSeconds,
      reducedMotion: prefersReducedMotion,
      sampleDeltaSeconds: qualitySampleSeconds,
      timestamp: safeTimestamp,
    });
  }

  return {
    dispose() {
      active = false;
      holds.clear();
      cancel();
      resetTiming();
    },
    getState() {
      return {
        active,
        dirty,
        elapsedSeconds,
        forceAnimation,
        held: holds.size > 0,
        reducedMotion: prefersReducedMotion,
        scheduled: frameHandle !== null,
        still,
      };
    },
    invalidate() {
      dirty = true;
      schedule();
    },
    resume,
    setHold(reason, held) {
      const wasHeld = holds.size > 0;
      if (held) holds.add(reason);
      else holds.delete(reason);
      if (holds.size > 0 && !wasHeld) {
        cancel();
        resetTiming();
      } else if (holds.size === 0 && wasHeld) {
        resume();
      }
      return holds.size > 0;
    },
    setStill(value) {
      const next = Boolean(value);
      if (still === next) return;
      const wasAnimated = isAnimated();
      still = next;
      if (isAnimated() === wasAnimated) return;
      resetTiming();
      if (wasAnimated) return;
      dirty = true;
      schedule();
    },
    setForceAnimation(value) {
      const next = Boolean(value);
      if (forceAnimation === next) return;
      forceAnimation = next;
      resetTiming();
      dirty = true;
      schedule();
    },
    setReducedMotion(value) {
      const next = Boolean(value);
      if (prefersReducedMotion === next) return;
      prefersReducedMotion = next;
      resetTiming();
      dirty = true;
      schedule();
    },
    start() {
      if (active) return;
      active = true;
      dirty = true;
      resetTiming();
      schedule();
    },
    update,
  };
}

/**
 * Holds scene rendering behind an open dialog through the scheduler's "panel"
 * hold. sync() runs whenever isOpen() may have changed: the hold starts delayMs
 * after a dialog opens, once its dim overlay has faded in, and ends with the
 * last dialog, calling onRelease. A resize clears the canvas, so redraw()
 * releases the hold only until frameRendered() reports the next drawn frame.
 */
export function createPanelHold({
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
  delayMs = 450,
  isOpen,
  onRelease = () => {},
  scheduler,
  setTimer = globalThis.setTimeout?.bind(globalThis),
}) {
  let held = false;
  let redrawing = false;
  let timer = null;

  function setHeld(next) {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (held === next) return;
    held = next;
    scheduler.setHold("panel", next);
  }

  return {
    get held() {
      return held;
    },
    sync() {
      if (!isOpen()) {
        const released = held || redrawing;
        redrawing = false;
        setHeld(false);
        if (released) onRelease();
      } else if (!held && !redrawing && timer === null) {
        timer = setTimer(() => setHeld(true), delayMs);
      }
    },
    redraw() {
      if (!held) return;
      redrawing = true;
      setHeld(false);
    },
    frameRendered() {
      if (!redrawing) return;
      redrawing = false;
      if (isOpen()) setHeld(true);
    },
    dispose() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      redrawing = false;
    },
  };
}

/**
 * Holds scene rendering for a visitor's pause through the scheduler's
 * "visitor" hold, which composes with the dialog's "panel" hold. A pause
 * before the reveal waits for it and keeps the first revealed frame; a later
 * pause draws one more frame, so a tour dip settles clear, then holds. As with
 * createPanelHold(), redraw() releases the hold only until frameRendered()
 * reports the next drawn frame. suspend() lifts the hold while the developer
 * camera runs, keeping the pause, and draws one frame before it returns.
 * Releasing a held pause calls onRelease.
 */
export function createVisitorHold({ onRelease = () => {}, scheduler }) {
  let disposed = false;
  let held = false;
  let paused = false;
  let redrawing = false;
  let revealed = false;
  let suspended = false;

  function setHeld(next) {
    if (held === next) return;
    held = next;
    scheduler.setHold("visitor", next);
  }

  function release() {
    const released = held || redrawing;
    redrawing = false;
    setHeld(false);
    if (released) onRelease();
  }

  return {
    get held() {
      return held;
    },
    get paused() {
      return paused;
    },
    set(value) {
      const next = Boolean(value);
      if (disposed || paused === next) return paused;
      paused = next;
      if (!paused) release();
      else if (revealed) {
        redrawing = true;
        scheduler.invalidate();
      }
      return paused;
    },
    // Called once the frame that shows the canvas has drawn.
    reveal() {
      if (disposed || revealed) return;
      revealed = true;
      if (paused && !suspended) setHeld(true);
    },
    redraw() {
      if (disposed || !held) return;
      redrawing = true;
      setHeld(false);
    },
    frameRendered() {
      if (!redrawing) return;
      redrawing = false;
      if (paused && !suspended) setHeld(true);
    },
    suspend(value) {
      const next = Boolean(value);
      if (disposed || suspended === next) return;
      suspended = next;
      if (suspended) release();
      else if (paused && revealed) {
        redrawing = true;
        scheduler.invalidate();
      }
    },
    dispose() {
      disposed = true;
      redrawing = false;
    },
  };
}

/**
 * Links new scene programs through compile() in a task of its own, instead of
 * in a blocking first draw or inside the commit that added them. pending counts
 * warm-ups not yet settled. A subject passed to warm() stays hidden until its
 * programs are ready. Program keys count visible lights (the tree carries two),
 * so every waiting subject is shown for the synchronous compile and hidden again
 * before any draw. compile() resolves true once linked; a false result, a
 * rejection or a throw still settles the warm-up, as not ready.
 */
export function createShaderWarmup({
  compile,
  schedule = (task) => globalThis.setTimeout(task, 0),
}) {
  let pending = 0;
  const waiting = new Set();

  return {
    get pending() {
      return pending;
    },
    warm(subject = null, onSettled = () => {}) {
      pending += 1;
      if (subject) {
        subject.visible = false;
        waiting.add(subject);
      }
      schedule(() => {
        waiting.forEach((object) => { object.visible = true; });
        let compiled;
        try {
          compiled = compile();
        } catch {
          compiled = false;
        }
        waiting.forEach((object) => { object.visible = false; });
        Promise.resolve(compiled)
          .then((ready) => ready === true, () => false)
          .then((ready) => {
            pending -= 1;
            if (subject) {
              waiting.delete(subject);
              subject.visible = true;
            }
            onSettled(ready);
          });
      });
    },
  };
}

/**
 * Coalesces resize bursts and suppresses work when the CSS viewport is
 * unchanged. It owns only its queued callback; renderer/composer disposal
 * remains with their respective owners.
 */
export function createSceneResizeController({
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  onResize,
  readSize,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
} = {}) {
  if (typeof onResize !== "function" || typeof readSize !== "function") {
    throw new TypeError("createSceneResizeController requires readSize and onResize");
  }
  if (typeof requestFrame !== "function") {
    throw new TypeError("createSceneResizeController requires requestFrame");
  }

  let disposed = false;
  let frameHandle = null;
  let lastHeight = null;
  let lastPixelRatio = null;
  let lastWidth = null;

  function update({ force = false } = {}) {
    if (disposed) return false;
    const size = readSize() || {};
    const width = Math.max(1, Number(size.width) || 0);
    const height = Math.max(1, Number(size.height) || 0);
    const pixelRatio = Math.max(0.1, Number(size.pixelRatio) || 1);
    if (!force && width === lastWidth && height === lastHeight && pixelRatio === lastPixelRatio) {
      return false;
    }
    lastWidth = width;
    lastHeight = height;
    lastPixelRatio = pixelRatio;
    onResize({ height, pixelRatio, width });
    return true;
  }

  function flush() {
    frameHandle = null;
    update();
  }

  return {
    dispose() {
      disposed = true;
      if (frameHandle !== null && typeof cancelFrame === "function") {
        cancelFrame(frameHandle);
      }
      frameHandle = null;
    },
    getSize() {
      return { height: lastHeight, pixelRatio: lastPixelRatio, width: lastWidth };
    },
    resize() {
      if (disposed || frameHandle !== null) return;
      frameHandle = requestFrame(flush);
    },
    update,
  };
}

function collectTexture(value, textures) {
  if (!value) return;
  if (value.isTexture) {
    textures.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectTexture(entry, textures));
  }
}

function collectMaterialResources(material, materials, textures) {
  if (!material || materials.has(material)) return;
  materials.add(material);
  for (const value of Object.values(material)) {
    collectTexture(value, textures);
  }
  if (material.uniforms) {
    for (const uniform of Object.values(material.uniforms)) {
      collectTexture(uniform?.value, textures);
    }
  }
}

/**
 * Releases resources owned by a scene graph exactly once. Render-target
 * textures are left to their render target so cube captures are not
 * double-disposed through both an envMap and WebGLRenderTarget.
 */
export function disposeSceneResources(root, { renderTargets = [] } = {}) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const ownedRenderTargets = new Set(renderTargets.filter(Boolean));

  collectTexture(root?.background, textures);
  collectTexture(root?.environment, textures);
  root?.traverse?.((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.forEach((material) => collectMaterialResources(material, materials, textures));
    if (object.renderTarget?.isWebGLRenderTarget) {
      ownedRenderTargets.add(object.renderTarget);
    }
  });

  const renderTargetTextures = new Set();
  ownedRenderTargets.forEach((target) => {
    collectTexture(target.texture, renderTargetTextures);
    collectTexture(target.textures, renderTargetTextures);
    collectTexture(target.depthTexture, renderTargetTextures);
  });

  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
  textures.forEach((texture) => {
    if (!renderTargetTextures.has(texture)) texture.dispose?.();
  });
  ownedRenderTargets.forEach((target) => target.dispose?.());

  return {
    geometries: geometries.size,
    materials: materials.size,
    renderTargets: ownedRenderTargets.size,
    textures: [...textures].filter((texture) => !renderTargetTextures.has(texture)).length,
  };
}

export function disposeSceneRuntimeResources({
  postprocessPipeline,
  renderer,
  renderTargets,
  scene,
} = {}) {
  postprocessPipeline?.dispose?.();
  const disposed = disposeSceneResources(scene, { renderTargets });
  scene?.clear?.();
  renderer?.dispose?.();
  renderer?.forceContextLoss?.();
  const canvas = renderer?.domElement;
  if (canvas?.parentNode && typeof canvas.parentNode.removeChild === "function") {
    canvas.parentNode.removeChild(canvas);
  } else {
    canvas?.remove?.();
  }
  return disposed;
}

export function hasMeaningfulScalarChange(previous, next, epsilon = 1e-4) {
  return (
    !Number.isFinite(previous) ||
    !Number.isFinite(next) ||
    Math.abs(previous - next) > Math.max(0, epsilon)
  );
}
