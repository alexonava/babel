import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Group } from "three";
import { createSceneAtmosphere } from "../src/scene/atmosphere.js";
import { createSceneEnvironment } from "../src/scene/environment.js";
import { createSceneTower } from "../src/scene/tower.js";

const highProfile = {
  isLow: false,
  lighting: {
    practicalIntensityScale: 1,
    towerLightIntensityScale: 1,
  },
  tier: "high",
};

test("environment owns composition and its small animated record sets", () => {
  const parent = new Group();
  const environment = createSceneEnvironment({
    groundHeight: (x, z) => x + z,
    parent,
    profile: highProfile,
  });
  const crystal = {
    position: { x: 1, y: 0, z: 2 },
    rotation: { y: 0 },
  };
  const monolith = { rotation: { y: 0 } };
  const plant = {
    amp: 0.2,
    baseY: 4,
    mesh: { material: { opacity: 0 }, position: { y: 0 } },
    phase: 0,
  };
  environment.setCrystalRecords([crystal]);
  environment.setMonolithGroup({ children: [monolith] });
  environment.setGroundPlantRecords([plant]);

  environment.resize({ composition: { sceneOffsetY: -6 } });
  environment.update({ elapsedSeconds: 0, reducedMotion: false });
  assert.equal(environment.root.position.y, -6);
  assert.equal(crystal.position.y, 6.55);
  assert.ok(crystal.rotation.y > 0);
  assert.ok(monolith.rotation.y > 0);
  assert.equal(plant.mesh.position.y, 4);
  assert.equal(plant.mesh.material.opacity, 0.33);

  environment.applyQuality({ isLow: true });
  environment.update({ elapsedSeconds: 0, reducedMotion: true });
  assert.equal(plant.mesh.material.opacity, 0.26);
  assert.equal(environment.dispose(), true);
  assert.equal(environment.dispose(), false);
  assert.equal(environment.root.visible, false);
  assert.equal(parent.children.includes(environment.root), true);
});

test("tower owns composition scale and orbital accent animation", () => {
  const parent = new Group();
  const tower = createSceneTower({ parent, profile: highProfile });
  const ground = { material: { opacity: 0 } };
  const architecturalLight = { intensity: 0, visible: false };
  const practicalLight = { intensity: 0 };
  const tierGatedLight = { intensity: 0 };
  const ring = { material: { opacity: 0 }, rotation: { z: 0 } };
  tower.setOrbitDecor({ ground, rings: [ring] });
  tower.setArchitecturalLights([{ light: architecturalLight, baseIntensity: 0.5, phase: 0 }]);
  tower.setPracticalLights([
    { light: practicalLight, baseIntensity: 0.5 },
    { light: tierGatedLight, baseIntensity: 0.7, disableOnLow: true },
  ]);

  tower.resize({ composition: { towerScale: 0.92 } });
  tower.update({ elapsedSeconds: 2 });
  assert.equal(tower.root.scale.x, 0.92);
  assert.notEqual(ground.material.opacity, 0);
  assert.equal(ring.rotation.z, 0.2);
  assert.notEqual(ring.material.opacity, 0);
  assert.equal(practicalLight.intensity, 0.5);
  assert.equal(tierGatedLight.intensity, 0.7);
  assert.equal(architecturalLight.visible, true);
  assert.ok(architecturalLight.intensity > 0.4);

  tower.applyQuality({
    isLow: true,
    lighting: {
      practicalIntensityScale: 0.58,
      towerLightIntensityScale: 0,
    },
  });
  assert.equal(tower.root.userData.lowPower, true);
  assert.equal(practicalLight.intensity, 0.29);
  assert.equal(tierGatedLight.intensity, 0);
  assert.equal(architecturalLight.visible, false);
  tower.dispose();
  assert.equal(tower.root.visible, false);
  assert.equal(parent.children.includes(tower.root), true);
});

test("late procedural lights inherit the current tier and film state", () => {
  const tower = createSceneTower({ parent: new Group(), profile: highProfile });
  tower.applyQuality({ isLow: true, lighting: { practicalIntensityScale: 0.58, towerLightIntensityScale: 0 } });
  tower.setFilmTreatment(true);
  const practical = { intensity: 0 }, architectural = { visible: true };
  tower.setPracticalLights([{ light: practical, baseIntensity: 0.5 }]);
  tower.setArchitecturalLights([{ light: architectural, baseIntensity: 0.5, phase: 0 }]);
  assert.equal(practical.intensity, 0.29);
  assert.equal(architectural.visible, false);
  tower.setFilmTreatment(false);
  assert.equal(architectural.visible, false, "the low-tier light policy survives film restoration");
  tower.dispose();
});

test("atmosphere owns cloud controls, visibility classification, composition, and point-field motion", () => {
  const parent = new Group();
  const calls = [];
  const qualityDebug = {};
  const atmosphere = createSceneAtmosphere({
    onInvalidate() {
      calls.push("invalidate");
    },
    parent,
    profile: highProfile,
    qualityDebug,
    visibilityTracker: {
      classifySphere() {
        return "midAtmosphere";
      },
      shouldRenderBucket() {
        return true;
      },
      shouldUpdateBucket() {
        return true;
      },
      updateCameraState() {
        calls.push("camera");
      },
    },
  });
  const cloudAnchor = new Group();
  const cloudGroup = new Group();
  const pointField = {
    material: { opacity: 0 },
    rotation: { y: 0 },
  };
  atmosphere.root.add(cloudAnchor);
  cloudAnchor.add(cloudGroup);
  atmosphere.setCloudAnchor(cloudAnchor);
  atmosphere.registerCloudGroup(cloudGroup);
  atmosphere.setPointField(pointField);
  const visibilitySystem = atmosphere.registerDecorativeSystem({
    getCenter(target) {
      return target.set(0, 0, 0);
    },
    group: cloudGroup,
    importance: "midAtmosphere",
    isCloudGroup: true,
    name: "testCloud",
    radius: 4,
  });

  atmosphere.resize({ composition: { cloudAnchorY: -8 } });
  atmosphere.update({ elapsedSeconds: 10, visibilityScale: 1.15 });
  assert.equal(cloudAnchor.position.y, -8);
  assert.equal(pointField.rotation.y, 0.2);
  assert.equal(pointField.material.opacity, 0.575);
  assert.equal(visibilitySystem.active, true);
  assert.equal(qualityDebug.systems.testCloud.bucket, "midAtmosphere");

  assert.equal(atmosphere.setClouds(false), false);
  assert.equal(cloudGroup.visible, false);
  assert.equal(atmosphere.toggleClouds(), true);
  assert.equal(cloudGroup.visible, true);
  atmosphere.applyQuality({ isLow: true });
  atmosphere.update({ elapsedSeconds: 0, visibilityScale: 1 });
  assert.equal(pointField.material.opacity, 0.42);
  assert.deepEqual(
    calls.filter((value) => value === "invalidate"),
    ["invalidate", "invalidate"],
  );

  atmosphere.dispose();
  assert.equal(atmosphere.root.visible, false);
  assert.equal(parent.children.includes(atmosphere.root), true);
});

test("scene bootstrap wires real domain systems and no longer owns their lifecycle loops", async () => {
  const source = await readFile(new URL("../src/scene/index.js", import.meta.url), "utf8");

  for (const factory of ["createSceneEnvironment", "createSceneTower", "createSceneAtmosphere"]) {
    assert.match(source, new RegExp(`${factory}\\(`));
  }
  assert.match(source, /subsystemRegistry\.register\(environmentSystem\);/);
  assert.match(source, /subsystemRegistry\.register\(towerSystem\);/);
  assert.match(source, /subsystemRegistry\.register\(atmosphereSystem\);/);
  assert.doesNotMatch(source, /function updateDecorativeVisibility\(/);
  assert.doesNotMatch(source, /const decorativeSystems = \[\]/);
  assert.doesNotMatch(source, /arr19\.forEach\(/);
  assert.doesNotMatch(source, /arr24\.forEach\(/);
  assert.doesNotMatch(source, /arr26\.forEach\(/);
  assert.doesNotMatch(source, /touchFrameStride/);
});
