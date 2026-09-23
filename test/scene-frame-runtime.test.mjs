import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createPanelHold,
  createSceneFrameScheduler,
  createSceneResizeController,
  disposeSceneRuntimeResources,
  hasMeaningfulScalarChange,
} from "../src/scene/runtime.js";

function createFrameHarness() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    cancelFrame(id) {
      callbacks.delete(id);
    },
    get pending() {
      return callbacks.size;
    },
    requestFrame(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    step(timestamp) {
      const entry = callbacks.entries().next().value;
      assert.ok(entry, "expected a queued frame");
      callbacks.delete(entry[0]);
      entry[1](timestamp);
    },
  };
}

test("touch frame stride keeps render delta while sampling each rAF interval", () => {
  const frames = createFrameHarness();
  const updates = [];
  const scheduler = createSceneFrameScheduler({
    cancelFrame: frames.cancelFrame,
    frameStride: 2,
    onUpdate(frame) {
      updates.push(frame);
    },
    requestFrame: frames.requestFrame,
  });

  scheduler.start();
  frames.step(0);
  frames.step(16);
  frames.step(32);
  frames.step(48);

  assert.equal(updates.length, 2);
  assert.ok(Math.abs(updates[1].deltaSeconds - 0.032) < 1e-9);
  assert.ok(Math.abs(updates[1].sampleDeltaSeconds - 0.016) < 1e-9);
  scheduler.dispose();
});

test("default scheduler renders every display frame for a 60 Hz-capable path", () => {
  const frames = createFrameHarness();
  const updates = [];
  const scheduler = createSceneFrameScheduler({
    cancelFrame: frames.cancelFrame,
    onUpdate(frame) {
      updates.push(frame);
    },
    requestFrame: frames.requestFrame,
  });

  scheduler.start();
  frames.step(0);
  frames.step(16);
  frames.step(32);
  frames.step(48);

  assert.equal(updates.length, 4);
  assert.ok(Math.abs(updates.at(-1).sampleDeltaSeconds - 0.016) < 1e-9);
  scheduler.dispose();
});

test("target frame rate holds scene rendering near 60 FPS on high-refresh displays", () => {
  const frames = createFrameHarness();
  const updates = [];
  const scheduler = createSceneFrameScheduler({
    cancelFrame: frames.cancelFrame,
    onUpdate(frame) {
      updates.push(frame);
    },
    requestFrame: frames.requestFrame,
    targetFrameRate: 60,
  });

  scheduler.start();
  for (let frame = 0; frame <= 240; frame += 1) {
    frames.step((frame * 1000) / 240);
  }

  assert.ok(updates.length >= 60 && updates.length <= 62);
  assert.ok(Math.abs(updates.at(-1).elapsedSeconds - 1) < 1e-9);
  scheduler.dispose();
});

test("60 FPS target preserves every frame on a 60 Hz display", () => {
  const frames = createFrameHarness();
  let updates = 0;
  const scheduler = createSceneFrameScheduler({
    cancelFrame: frames.cancelFrame,
    onUpdate() {
      updates += 1;
    },
    requestFrame: frames.requestFrame,
    targetFrameRate: 60,
  });

  scheduler.start();
  for (let frame = 0; frame <= 60; frame += 1) {
    frames.step((frame * 1000) / 60);
  }

  assert.equal(updates, 61);
  scheduler.dispose();
});

test("reduced motion freezes scene time and renders only dirty frames", () => {
  const frames = createFrameHarness();
  const updates = [];
  const scheduler = createSceneFrameScheduler({
    cancelFrame: frames.cancelFrame,
    onUpdate(frame) {
      updates.push(frame);
    },
    reducedMotion: true,
    requestFrame: frames.requestFrame,
  });

  scheduler.start();
  frames.step(0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].elapsedSeconds, 0);
  assert.equal(frames.pending, 0, "static mode does not retain a frame loop");

  scheduler.invalidate();
  scheduler.invalidate();
  assert.equal(frames.pending, 1, "multiple invalidations coalesce");
  frames.step(1000);
  assert.equal(updates.length, 2);
  assert.equal(updates[1].elapsedSeconds, 0);

  scheduler.setReducedMotion(false);
  frames.step(1016);
  frames.step(1032);
  assert.ok(updates.at(-1).elapsedSeconds > 0, "live toggle resumes scene time");
  scheduler.dispose();
});

test("named holds stop rendering and scheduling until the last one is released", () => {
  const frames = createFrameHarness();
  const updates = [];
  const scheduler = createSceneFrameScheduler({
    cancelFrame: frames.cancelFrame,
    onUpdate(frame) {
      updates.push(frame);
    },
    requestFrame: frames.requestFrame,
  });

  scheduler.start();
  frames.step(0);
  frames.step(16);
  assert.equal(updates.length, 2);

  assert.equal(scheduler.setHold("panel", true), true);
  assert.equal(frames.pending, 0, "a hold cancels the queued frame");
  scheduler.setHold("visitor", true);
  scheduler.invalidate();
  scheduler.resume();
  scheduler.setReducedMotion(true);
  scheduler.setReducedMotion(false);
  assert.equal(frames.pending, 0, "held scheduler ignores invalidation and resume");
  assert.deepEqual(
    { held: scheduler.getState().held, scheduled: scheduler.getState().scheduled },
    { held: true, scheduled: false },
  );

  assert.equal(scheduler.setHold("panel", false), true);
  assert.equal(frames.pending, 0, "another reason still holds");
  assert.equal(scheduler.setHold("visitor", false), false);
  assert.equal(frames.pending, 1, "releasing the last hold resumes");
  const elapsedBefore = updates.at(-1).elapsedSeconds;
  frames.step(60_000);
  assert.equal(updates.length, 3);
  assert.equal(updates.at(-1).deltaSeconds, 0, "no giant delta after a long hold");
  assert.equal(updates.at(-1).elapsedSeconds, elapsedBefore);
  frames.step(60_016);
  assert.ok(Math.abs(updates.at(-1).deltaSeconds - 0.016) < 1e-9);
  scheduler.dispose();
});

test("a hold set before start keeps the scheduler idle until released", () => {
  const frames = createFrameHarness();
  let updates = 0;
  const scheduler = createSceneFrameScheduler({
    cancelFrame: frames.cancelFrame,
    onUpdate() {
      updates += 1;
    },
    requestFrame: frames.requestFrame,
  });

  scheduler.setHold("panel", true);
  scheduler.start();
  assert.equal(frames.pending, 0);
  scheduler.setHold("panel", false);
  frames.step(0);
  assert.equal(updates, 1);
  scheduler.dispose();
});

test("still mode renders only invalidated frames and returns to animation", () => {
  const frames = createFrameHarness();
  const updates = [];
  const scheduler = createSceneFrameScheduler({
    cancelFrame: frames.cancelFrame,
    onUpdate(frame) {
      updates.push(frame);
    },
    requestFrame: frames.requestFrame,
    targetFrameRate: 60,
  });

  scheduler.start();
  frames.step(0);
  scheduler.setStill(true);
  frames.step(16);
  assert.equal(updates.length, 1, "the already queued frame does not render");
  assert.equal(frames.pending, 0, "still mode drops the continuous loop");

  scheduler.invalidate();
  scheduler.invalidate();
  assert.equal(frames.pending, 1);
  frames.step(5000);
  assert.equal(updates.length, 2);
  assert.equal(updates[1].deltaSeconds, 0);
  assert.equal(updates[1].elapsedSeconds, 0);
  assert.equal(updates[1].reducedMotion, false, "still mode is not a motion preference");
  assert.equal(frames.pending, 0);

  scheduler.setStill(false);
  frames.step(5016);
  frames.step(5032);
  assert.equal(updates.length, 4);
  assert.equal(updates[2].deltaSeconds, 0, "leaving still mode does not carry the idle gap");
  assert.ok(Math.abs(updates[3].elapsedSeconds - 0.016) < 1e-9);
  assert.equal(frames.pending, 1, "animation continues");
  scheduler.dispose();
});

test("still mode yields to forced animation and composes with reduced motion", () => {
  const frames = createFrameHarness();
  let updates = 0;
  const scheduler = createSceneFrameScheduler({
    cancelFrame: frames.cancelFrame,
    onUpdate() {
      updates += 1;
    },
    reducedMotion: true,
    requestFrame: frames.requestFrame,
  });

  scheduler.start();
  frames.step(0);
  scheduler.setStill(true);
  scheduler.setStill(false);
  assert.equal(frames.pending, 0, "reduced motion stays static either way");

  scheduler.setStill(true);
  scheduler.setForceAnimation(true);
  frames.step(16);
  frames.step(32);
  assert.equal(updates, 3, "the developer camera animates while still");
  assert.equal(frames.pending, 1);
  scheduler.dispose();
});

function createTimers() {
  let nextId = 1;
  const timers = new Map();
  return {
    clearTimer(id) {
      timers.delete(id);
    },
    get delays() {
      return [...timers.values()].map(({ delay }) => delay);
    },
    fire() {
      const entries = [...timers.values()];
      timers.clear();
      entries.forEach(({ callback }) => callback());
    },
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, delay });
      return id;
    },
  };
}

function createPanelHarness() {
  const frames = createFrameHarness();
  const timers = createTimers();
  const state = { open: false, releases: 0, rendered: 0 };
  const scheduler = createSceneFrameScheduler({
    cancelFrame: frames.cancelFrame,
    onUpdate() {
      state.rendered += 1;
      hold.frameRendered();
    },
    requestFrame: frames.requestFrame,
  });
  const hold = createPanelHold({
    clearTimer: timers.clearTimer,
    delayMs: 450,
    isOpen: () => state.open,
    onRelease: () => (state.releases += 1),
    scheduler,
    setTimer: timers.setTimer,
  });
  scheduler.start();
  frames.step(0);
  return { frames, hold, scheduler, state, timers };
}

test("a dialog holds rendering once its overlay fades in and releases with the last dialog", () => {
  const { frames, hold, scheduler, state, timers } = createPanelHarness();

  hold.sync();
  assert.deepEqual(timers.delays, [], "no dialog, no hold");
  state.open = true;
  hold.sync();
  hold.sync();
  assert.deepEqual(timers.delays, [450], "repeated mutations keep one pending hold");
  frames.step(16);
  assert.equal(state.rendered, 2, "the scene keeps drawing while the overlay fades in");
  timers.fire();
  assert.equal(hold.held, true);
  assert.equal(scheduler.getState().held, true);
  assert.equal(frames.pending, 0, "nothing is scheduled behind the dialog");

  state.open = false;
  hold.sync();
  assert.equal(hold.held, false);
  assert.equal(state.releases, 1);
  assert.equal(frames.pending, 1, "closing the last dialog resumes the scene");

  state.open = true;
  hold.sync();
  state.open = false;
  hold.sync();
  assert.deepEqual(timers.delays, [], "a dialog closed during the fade cancels its hold");
  assert.equal(state.releases, 1, "no hold was taken, so none is released");

  state.open = true;
  hold.sync();
  hold.dispose();
  assert.deepEqual(timers.delays, [], "disposal clears a pending hold");
  scheduler.dispose();
});

test("a resize behind a held dialog draws one frame and holds again", () => {
  const { frames, hold, scheduler, state, timers } = createPanelHarness();
  state.open = true;
  hold.sync();
  timers.fire();
  const rendered = state.rendered;

  hold.redraw();
  assert.equal(hold.held, false);
  assert.equal(frames.pending, 1, "the cleared canvas is redrawn");
  assert.deepEqual(timers.delays, [], "without another overlay delay");
  frames.step(100);
  assert.equal(state.rendered, rendered + 1);
  assert.equal(hold.held, true, "the first drawn frame restores the hold");
  assert.equal(frames.pending, 0, "no animation continues behind the dialog");
  hold.redraw();
  hold.redraw();
  frames.step(200);
  assert.equal(state.rendered, rendered + 2);
  assert.equal(frames.pending, 0);

  hold.redraw();
  state.open = false;
  hold.sync();
  assert.equal(state.releases, 1, "closing during the redraw still releases the hold");
  frames.step(300);
  assert.equal(hold.held, false, "a closed dialog is not held again");
  assert.equal(frames.pending, 1);

  hold.redraw();
  assert.equal(hold.held, false, "an unheld scene needs no redraw release");
  scheduler.dispose();
});

test("resize controller coalesces bursts and skips unchanged viewport sizes", () => {
  const frames = createFrameHarness();
  const applied = [];
  let size = { width: 800, height: 600, pixelRatio: 1 };
  const resize = createSceneResizeController({
    cancelFrame: frames.cancelFrame,
    onResize(next) {
      applied.push(next);
    },
    readSize() {
      return size;
    },
    requestFrame: frames.requestFrame,
  });

  assert.equal(resize.update({ force: true }), true);
  resize.resize();
  resize.resize();
  assert.equal(frames.pending, 1);
  frames.step(0);
  assert.equal(applied.length, 1, "same-size resize is a no-op");

  size = { width: 900, height: 600, pixelRatio: 1 };
  resize.resize();
  resize.resize();
  frames.step(16);
  assert.equal(applied.length, 2);
  assert.deepEqual(applied[1], size);

  size = { width: 900, height: 600, pixelRatio: 2 };
  resize.resize();
  frames.step(32);
  assert.equal(applied.length, 3, "DPR-only changes reapply renderer sizing");
  assert.deepEqual(applied[2], size);
  resize.dispose();
});

test("stable scalar values do not request redundant buffer uploads", () => {
  assert.equal(hasMeaningfulScalarChange(undefined, 1), true);
  assert.equal(hasMeaningfulScalarChange(1, 1), false);
  assert.equal(hasMeaningfulScalarChange(1, 1.00001), false);
  assert.equal(hasMeaningfulScalarChange(1, 1.01), true);
});

test("runtime resource disposal deduplicates scene assets and leaves render-target textures owned", () => {
  const calls = {
    canvasRemoved: 0,
    contextLost: 0,
    geometry: 0,
    material: 0,
    pipeline: 0,
    renderer: 0,
    renderTarget: 0,
    renderTargetTexture: 0,
    sceneCleared: 0,
    texture: 0,
  };
  const texture = { isTexture: true, dispose: () => (calls.texture += 1) };
  const renderTargetTexture = {
    isTexture: true,
    dispose: () => (calls.renderTargetTexture += 1),
  };
  const geometry = { dispose: () => (calls.geometry += 1) };
  const material = {
    map: texture,
    envMap: renderTargetTexture,
    uniforms: { uMap: { value: texture } },
    dispose: () => (calls.material += 1),
  };
  const renderTarget = {
    isWebGLRenderTarget: true,
    texture: renderTargetTexture,
    dispose: () => (calls.renderTarget += 1),
  };
  const objects = [{ geometry, material }, { geometry, material }, { renderTarget }];
  const scene = {
    background: texture,
    clear() {
      calls.sceneCleared += 1;
    },
    traverse(visitor) {
      objects.forEach(visitor);
    },
  };
  const canvasParent = {
    removeChild() {
      calls.canvasRemoved += 1;
    },
  };
  const renderer = {
    dispose() {
      calls.renderer += 1;
    },
    domElement: { parentNode: canvasParent },
    forceContextLoss() {
      calls.contextLost += 1;
    },
  };
  const postprocessPipeline = {
    dispose() {
      calls.pipeline += 1;
    },
  };

  const disposed = disposeSceneRuntimeResources({
    postprocessPipeline,
    renderer,
    renderTargets: [renderTarget],
    scene,
  });

  assert.deepEqual(disposed, {
    geometries: 1,
    materials: 1,
    renderTargets: 1,
    textures: 1,
  });
  assert.equal(calls.geometry, 1);
  assert.equal(calls.material, 1);
  assert.equal(calls.texture, 1);
  assert.equal(calls.renderTarget, 1);
  assert.equal(calls.renderTargetTexture, 0, "render target owns its texture disposal");
  assert.equal(calls.pipeline, 1);
  assert.equal(calls.renderer, 1);
  assert.equal(calls.contextLost, 1);
  assert.equal(calls.canvasRemoved, 1);
  assert.equal(calls.sceneCleared, 1);
});

test("scene wires each brazier to its own visibility record", async () => {
  const source = await readFile(new URL("../src/scene/legacy-world.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /const brazierSystem\s*=/);
  assert.match(source, /name: `brazier-\$\{num460\}`/);
  assert.match(source, /if \(!arg52\.visibilitySystem\.active\) return;/);
});

test("scene bootstrap idles before reveal, holds behind dialogs and fails to the poster", async () => {
  const source = await readFile(new URL("../src/scene/index.js", import.meta.url), "utf8");

  // The frame that sees readiness reveals the canvas and resumes animation.
  assert.match(source, /const sceneShown = !sceneFailed && \(cinematic\.ready \|\|/);
  assert.match(source, /container\?\.classList\.toggle\("is-ready", sceneShown\);\s*[^]*?frameScheduler\?\.setStill\(!sceneShown\);/);
  // The dialog hold's behaviour is tested above; index.js only wires it.
  assert.match(
    source,
    /panelHold = createPanelHold\(\{\s*delayMs: 450,\s*isOpen: \(\) => document\.body\.hasAttribute\("data-panel-open"\),/,
  );
  assert.match(source, /attributeFilter: \["data-panel-open"\]/);
  assert.match(source, /function applySceneSize\([^]*?panelHold\?\.redraw\(\);/);
  assert.match(source, /rendering\.update\(\);[^]*?panelHold\?\.frameRendered\(\);/);
  const dispose = source.slice(source.indexOf("function disposeHomeSceneRuntime"));
  assert.match(dispose, /panelObserver\?\.disconnect\(\);\s*panelHold\.dispose\(\);/);

  // The camera learns a fallback status before the legacy world can throw.
  const onStatus = source.slice(
    source.indexOf("onStatus(status) {"),
    source.indexOf("subsystemRegistry.register(architectureAssets);"),
  );
  assert.ok(onStatus.indexOf("cinematic.setStatus(status);") < onStatus.indexOf("ensureLegacyWorld();"));
  assert.match(onStatus, /try \{\s*ensureLegacyWorld\(\);\s*\} catch \(error\) \{\s*stopFailedScene\(/);
  assert.match(source, /webglContextAvailable && !sceneFailed;/);

  // Static shadows apply only while no animated legacy world exists.
  assert.match(source, /rendering\.setStaticShadows\(!legacyWorld\.current\);/);
  assert.match(source, /bindLegacyWorld\(world\);\s*rendering\.setStaticShadows\(false\);/);
});
