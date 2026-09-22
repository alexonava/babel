import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { createEstateSkyMaterial } from "../src/scene/estate-sky.js";
import { createEstateGroundDetail, estatePathDistance } from "../src/scene/estate-ground-detail.js";
import { createSceneEnvironment } from "../src/scene/environment.js";
import { createSceneAtmosphere } from "../src/scene/atmosphere.js";
import { createFilmScene } from "../src/scene/film-scene.js";

const groundHeight = (x, z) => Math.sin(x * 0.07) + Math.cos(z * 0.04);
const profile = { tier: "high", isLow: false };
test("estate growth is seeded, terrain-seated and clear of both footprints and the winding approach", () => {
  const a = createEstateGroundDetail(groundHeight),
    b = createEstateGroundDetail(groundHeight);
  const p = a.mesh.geometry.attributes.position,
    q = b.mesh.geometry.attributes.position;
  assert.deepEqual(p.array, q.array);
  assert.equal(p.count, 360 * 12);
  for (let i = 0; i < p.count; i += 12) {
    const x = (p.getX(i) + p.getX(i + 1)) / 2,
      z = (p.getZ(i) + p.getZ(i + 1)) / 2;
    assert.ok(Math.abs(p.getY(i) - groundHeight(x, z) + 0.018) < 1e-5);
    assert.ok(Math.hypot(x, z) > 10.4);
    assert.ok(Math.hypot(x - 55.1, z - 36.1) > 5.8);
    assert.ok(estatePathDistance(x, z) > 2.09);
    assert.ok(p.getY(i + 3) > p.getY(i));
  }
  assert.equal(a.mesh.material.transparent, false);
  a.dispose();
  b.dispose();
});
test("ground-detail quality changes trim a shared geometry and restore original world positions", () => {
  const detail = createEstateGroundDetail(groundHeight),
    mesh = detail.mesh;
  const original = mesh.geometry.attributes.position.array.slice();
  assert.equal(mesh.visible, false);
  detail.setActive(true);
  assert.equal(mesh.geometry.drawRange.count, 360 * 18);
  detail.applyQuality({ tier: "balanced" });
  assert.equal(mesh.geometry.drawRange.count, 210 * 18);
  assert.equal(mesh.visible, true);
  detail.applyQuality({ tier: "low" });
  assert.equal(mesh.visible, false);
  detail.applyQuality(profile);
  assert.deepEqual(mesh.geometry.attributes.position.array, original);
  assert.equal(mesh.visible, true);
  detail.setActive(false);
  assert.equal(mesh.visible, false);
  let freed = 0;
  mesh.geometry.addEventListener("dispose", () => freed++);
  assert.equal(detail.dispose(), true);
  assert.equal(detail.dispose(), false);
  detail.setActive(true);
  assert.equal(mesh.visible, false);
  assert.equal(freed, 1);
});
test("environment creates growth only after film activation and owns its lifecycle", () => {
  const parent = new Group(),
    environment = createSceneEnvironment({ parent, groundHeight, profile });
  assert.equal(environment.root.children.length, 0);
  environment.setFilmTreatment(true);
  const mesh = environment.root.getObjectByName("estate-ground-growth");
  assert.ok(mesh?.visible);
  environment.resize({ composition: { sceneOffsetY: -7.5 } });
  assert.equal(mesh.getWorldPosition(new Vector3()).y, -7.5);
  const initial = mesh.geometry.attributes.position.array.slice();
  environment.update({ elapsedSeconds: 20, reducedMotion: false });
  environment.update({ elapsedSeconds: 90, reducedMotion: true });
  assert.deepEqual(mesh.geometry.attributes.position.array, initial);
  environment.setFilmTreatment(false);
  assert.equal(mesh.visible, false);
  environment.setFilmTreatment(true);
  assert.equal(environment.root.children.length, 1);
  environment.applyQuality({ tier: "low", isLow: true });
  assert.equal(mesh.visible, false);
  environment.dispose();
  assert.equal(mesh.parent, null);
  assert.equal(environment.setFilmTreatment(true), false);
});
test("film suppresses legacy cloud cards and restores baseline sky compositing and visibility", () => {
  const ground = new Mesh(new BoxGeometry(), new MeshStandardMaterial()),
    parent = new Group();
  const atmosphere = createSceneAtmosphere({ parent, profile });
  const group = atmosphere.registerCloudGroup(new Group());
  const cloud = new Group(),
    hiddenCloud = new Group();
  hiddenCloud.visible = false;
  group.add(cloud, hiddenCloud);
  const sky = {
    transparent: true,
    uniforms: { sunColor: { value: new Color(0x334455) }, uFilm: { value: 0 } },
  };
  const rendering = { setFilmTreatment() {}, focusFilmShadow() {}, postprocessPipeline: {} };
  const film = createFilmScene({ ground, groundHeight, atmosphere, rendering, skyMaterial: sky });
  film.setClouds([cloud, hiddenCloud]);
  film.setActive(true);
  assert.equal(sky.uniforms.uFilm.value, 1);
  assert.equal(sky.transparent, false);
  assert.equal(group.visible, false);
  atmosphere.setClouds(true);
  atmosphere.update();
  assert.equal(group.visible, false);
  cloud.visible = true;
  film.finishFrame(null, new Vector3(), null);
  assert.equal(cloud.visible, false);
  const later = new Group();
  film.setClouds([later]);
  assert.equal(cloud.visible, true);
  assert.equal(later.visible, false);
  film.setActive(false);
  assert.equal(sky.uniforms.uFilm.value, 0);
  assert.equal(sky.transparent, true);
  assert.equal(group.visible, true);
  assert.equal(later.visible, true);
  assert.equal(hiddenCloud.visible, false);
  assert.equal(sky.uniforms.sunColor.value.getHex(), 0x334455);
  film.setActive(true);
  atmosphere.setClouds(false);
  film.setActive(false);
  assert.equal(group.visible, false, "manual cloud preference survives a film round trip");
  film.setActive(true);
  film.dispose();
  assert.equal(sky.transparent, true);
  assert.equal(sky.uniforms.uFilm.value, 0);
  atmosphere.dispose();
  ground.geometry.dispose();
  ground.material.dispose();
});
test("estate sky uses one world-space shell with preserved baseline uniforms and no image dependency", () => {
  const direction = new Vector3(1, 2, 3).normalize();
  const material = createEstateSkyMaterial({
    skyTopColor: 0x112233,
    skyBottomColor: 0x334455,
    skyGlowColor: 0x445566,
    sunColor: 0xffbb77,
    sunDirection: direction,
    shellOpacity: 0.9,
  });
  assert.equal(material.uniforms.uFilm.value, 0);
  assert.equal(material.uniforms.sunDirection.value, direction);
  assert.equal(material.uniforms.topColor.value.getHex(), 0x112233);
  assert.equal(material.depthWrite, false);
  assert.equal(material.uniforms.uTime.value, 0);
  assert.match(material.vertexShader, /modelMatrix \* vec4\(position/);
  assert.match(material.fragmentShader, /if \(uFilm>.5\)/);
  assert.doesNotMatch(material.fragmentShader, /sampler2D|gl_FragCoord/);
  material.dispose();
});

test("cloud controls apply to the sky veil and preserve their state across film and late binding", () => {
  const atmosphere = createSceneAtmosphere({ parent: new Group(), profile });
  const sky = { uniforms: { uClouds: { value: 1 } } };
  atmosphere.setClouds(false);
  atmosphere.setSkyMaterial(sky);
  assert.equal(sky.uniforms.uClouds.value, 0);
  atmosphere.setFilmTreatment(true);
  assert.equal(sky.uniforms.uClouds.value, 0);
  atmosphere.toggleClouds();
  assert.equal(sky.uniforms.uClouds.value, 1);
  atmosphere.setFilmTreatment(false);
  assert.equal(sky.uniforms.uClouds.value, 1);
  atmosphere.dispose();
  assert.equal(atmosphere.setSkyMaterial(sky), false);
  assert.equal(atmosphere.setClouds(false), false);
  assert.equal(sky.uniforms.uClouds.value, 1);
});

test("sky drift follows the scheduler clock, freezes for reduced motion and stops on disposal", () => {
  const atmosphere = createSceneAtmosphere({ parent: new Group(), profile });
  const sky = { uniforms: { uTime: { value: 0 } } };
  atmosphere.setSkyMaterial(sky);
  atmosphere.update({ elapsedSeconds: 12 });
  assert.equal(sky.uniforms.uTime.value, 12);
  atmosphere.update({ elapsedSeconds: 24, reducedMotion: true });
  assert.equal(sky.uniforms.uTime.value, 12);
  atmosphere.update({ elapsedSeconds: 25 });
  assert.equal(sky.uniforms.uTime.value, 25);
  atmosphere.dispose();
  atmosphere.update({ elapsedSeconds: 30 });
  assert.equal(sky.uniforms.uTime.value, 25);
});
