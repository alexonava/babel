import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
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
