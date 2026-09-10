import assert from "node:assert/strict";
import test from "node:test";
import { createSceneRendering } from "../src/scene/rendering.js";

function createProfile() {
  return {
    antialias: true,
    lighting: {
      ambientIntensity: 0.22,
      directionalIntensity: 2.9,
      extraDirectional: true,
      fillIntensity: 0.31,
      fogFar: 150,
      fogNear: 62,
      hemisphereIntensity: 0.71,
    },
    shadows: {
      enabled: true,
      mapSize: 1024,
    },
  };
}

test("scene rendering owns quality, sizing, rendering, and disposal lifecycle", () => {
  const calls = [];
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 8 },
    domElement: {},
    outputColorSpace: null,
    shadowMap: {},
    setClearColor: (...args) => calls.push(["clear", ...args]),
    setPixelRatio: (value) => calls.push(["pixelRatio", value]),
    setSize: (...args) => calls.push(["rendererSize", ...args]),
  };
  const composer = {
    addPass: () => calls.push(["outlineAdded"]),
    render: () => calls.push(["render"]),
    setSize: (...args) => calls.push(["composerSize", ...args]),
  };
  const pipeline = {
    composer,
    resize: (...args) => calls.push(["postprocessSize", ...args]),
    setQualityProfile: (profile) => calls.push(["quality", profile]),
  };
  const outline = {
    hiddenEdgeColor: { set() {} },
    selectedObjects: ["selected"],
    setSize: (...args) => calls.push(["outlineSize", ...args]),
    visibleEdgeColor: { set() {} },
  };
  let disposedOptions = null;
  const profile = createProfile();
  const rendering = createSceneRendering({
    container: {
      appendChild(node) {
        assert.equal(node, renderer.domElement);
      },
    },
    createOutlinePass: () => outline,
    createPipeline: () => pipeline,
    createRenderer: () => renderer,
    disposeResources(options) {
      disposedOptions = options;
      return { geometries: 1 };
    },
    height: 600,
    lighting: {
      ambientColor: 0xffffff,
      ambientIntensity: 0.22,
      directionalColor: 0xffffff,
      directionalIntensity: 2.9,
      directionalPosition: { x: 21, y: 29, z: 23 },
      fogColor: 0x222222,
      fogFar: 150,
      fogNear: 62,
      hemisphereGroundColor: 0x111111,
      hemisphereIntensity: 0.71,
      hemisphereSkyColor: 0x888888,
    },
    profile,
    threeExports: {},
    width: 800,
    world: {
      CAMERA_FAR: 210,
      CAMERA_FOV: 48,
      CAMERA_NEAR: 0.5,
      FILL_LIGHT_POSITION: [-20, 14, -18],
      SHADOW_CAMERA_FAR: 120,
      SHADOW_CAMERA_HALF_EXTENT: 34,
      SHADOW_CAMERA_NEAR: 0.5,
    },
  });

  assert.equal(rendering.outlinePass, null);
  assert.equal(rendering.lights.fill.visible, true);
  assert.equal(rendering.lights.fill.intensity, 0.58);
  assert.equal(rendering.ensureOutlinePass(), outline);
  assert.equal(rendering.ensureOutlinePass(), outline);
  rendering.applyQuality(profile, { pixelRatio: 1.5 });
  assert.equal(rendering.lights.fill.intensity, 0.31);
  rendering.setGroundedLighting(true);
  assert.equal(rendering.lights.sun.color.getHex(), 0xd9e2f2);
  assert.equal(rendering.lights.sun.intensity, 2.9 * 0.8);
  assert.equal(rendering.lights.fill.intensity, 0.31 * 1.5);
  rendering.applyQuality(profile);
  assert.equal(rendering.lights.sun.intensity, 2.9 * 0.8);
  assert.equal(rendering.lights.fill.intensity, 0.31 * 1.5);
  rendering.applyQuality({
    ...profile,
    lighting: { ...profile.lighting, directionalIntensity: 2, fillIntensity: 0.2 },
  });
  assert.equal(rendering.lights.sun.intensity, 1.6);
  assert.equal(rendering.lights.fill.intensity, 0.2 * 1.5);
  rendering.setGroundedLighting(false);
  assert.equal(rendering.lights.sun.intensity, 2);
  assert.equal(rendering.lights.fill.intensity, 0.2);
  rendering.applyQuality(profile);
  assert.equal(rendering.lights.sun.color.getHex(), 0xffffff);
  assert.equal(rendering.lights.sun.intensity, 2.9);
  assert.equal(rendering.lights.fill.intensity, 0.31);
  const beforePosition = rendering.lights.sun.position.clone(),
    beforeTarget = rendering.lights.sun.target.position.clone();
  const direction = beforePosition.clone().sub(beforeTarget);
  rendering.setFilmTreatment(true);
  rendering.focusFilmShadow(new beforeTarget.constructor(55, 8, 36), 12);
  assert.ok(
    rendering.lights.sun.position
      .clone()
      .sub(rendering.lights.sun.target.position)
      .distanceTo(direction) < 1e-6,
  );
  assert.equal(rendering.lights.sun.shadow.camera.left, -32);
  rendering.applyQuality(profile);
  assert.equal(rendering.lights.fill.intensity, 0.31 * 1.1);
  rendering.setFilmTreatment(false);
  assert.deepEqual(rendering.lights.sun.position.toArray(), beforePosition.toArray());
  assert.deepEqual(rendering.lights.sun.target.position.toArray(), beforeTarget.toArray());
  assert.equal(rendering.lights.sun.shadow.camera.left, -34);

  rendering.applyQuality({
    ...profile,
    lighting: {
      ...profile.lighting,
      extraDirectional: false,
      fillIntensity: 0,
    },
  });
  assert.equal(rendering.lights.fill.visible, false);
  assert.equal(rendering.lights.fill.intensity, 0);
  rendering.resize({ cameraFov: 52, height: 400, width: 900 });
  rendering.update();
  const renderTarget = { id: "reflection" };
  rendering.trackRenderTarget(renderTarget);

  assert.equal(rendering.camera.fov, 52);
  assert.equal(rendering.camera.aspect, 2.25);
  assert.deepEqual(
    calls.find((entry) => entry[0] === "pixelRatio"),
    ["pixelRatio", 1.5],
  );
  assert.deepEqual(
    calls.find((entry) => entry[0] === "postprocessSize"),
    ["postprocessSize", 900, 400],
  );
  assert.ok(calls.some((entry) => entry[0] === "render"));
  assert.deepEqual(rendering.dispose(), { geometries: 1 });
  assert.equal(rendering.dispose(), false);
  assert.equal(rendering.update(), false);
  assert.deepEqual(disposedOptions.renderTargets, [renderTarget]);
  assert.equal(outline.enabled, false);
  assert.deepEqual(outline.selectedObjects, []);
});
