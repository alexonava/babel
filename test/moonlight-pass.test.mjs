import assert from "node:assert/strict";
import test from "node:test";
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Vector3,
} from "three";
import { createCinematicCamera, PUSH_IN } from "../src/scene/cinematic.js";
import { createCameraTour, TOUR_FADE } from "../src/scene/camera-tour.js";
import { createPostprocessPipeline } from "../src/scene/postprocess.js";
import {
  applyFilmGrade,
  createCompleteTowerArchitecture,
  createTreeArchitecture,
} from "../src/scene/architecture.js";
import { DIRECTED_SHOTS } from "../src/scene/directed-shots.js";

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

function tourSetup(interval = 5) {
  const camera = new PerspectiveCamera(),
    tower = new Group(),
    tree = new Group();
  const material = new MeshBasicMaterial(),
    geometry = new BoxGeometry(10, 20, 10);
  for (const root of [tower, tree]) {
    const mesh = new Mesh(geometry, material);
    mesh.position.y = 10;
    root.add(mesh);
  }
  tree.position.set(55.1, 0, 36.1);
  const controller = createCinematicCamera({
    camera,
    film: true,
    selected: "tower",
    angle: 0,
    getSafeArea: () => ({ left: 450, top: 32, width: 940, height: 720 }),
  });
  for (const [kind, root] of [
    ["tower", tower],
    ["tree", tree],
  ]) {
    controller.setSubject(kind, root);
    controller.setStatus({ kind, status: "ready" });
  }
  const tour = createCameraTour({ camera: controller, interval });
  const render = (time, flags = {}) => {
    const phase = tour.update({ elapsedSeconds: time, ...flags });
    controller.apply({ width: 1440, height: 900, elapsedSeconds: time, tourPhase: phase, ...flags });
    return phase;
  };
  return { camera, controller, tour, render };
}

test("tour shots open from black, dip to black before each cut, and hold clear while paused or reduced", () => {
  const f = tourSetup(5);
  f.render(0);
  assert.equal(f.tour.fade, 1);
  f.render(TOUR_FADE.in / 2);
  close(f.tour.fade, 0.5);
  f.render(TOUR_FADE.in + 0.2);
  assert.equal(f.tour.fade, 0);
  f.render(5 - TOUR_FADE.out / 2);
  close(f.tour.fade, 0.5);
  f.render(5.01);
  assert.equal(f.controller.shot.name, "The watch");
  assert.ok(f.tour.fade > 0.9);
  f.render(6);
  f.tour.toggle();
  f.render(6.1);
  assert.equal(f.tour.fade, 0);
  f.tour.toggle();
  f.render(6.2, { reducedMotion: true });
  assert.equal(f.tour.fade, 0);
  f.tour.dispose();
  assert.equal(f.tour.fade, 0);
});

test("each shot dollies in slowly within its fitted margin and holds still with reduced motion", () => {
  const f = tourSetup(5);
  const phase0 = f.render(0);
  assert.equal(phase0, 0);
  const start = f.camera.position.distanceTo(f.controller.target);
  f.render(4.99);
  const end = f.camera.position.distanceTo(f.controller.target);
  assert.ok(end < start * (1 - PUSH_IN * 0.9) && end > start * (1 - PUSH_IN * 1.01));
  f.render(2.5, { reducedMotion: true });
  close(f.camera.position.distanceTo(f.controller.target), start, 1e-6);
  f.tour.dispose();
  f.controller.dispose();
});

test("post-process fade drives the final pass only while active and survives profile changes", () => {
  const renderer = {
    autoClearColor: true,
    autoClearDepth: true,
    autoClearStencil: true,
    clear() {},
    getPixelRatio: () => 1,
    getRenderTarget: () => null,
    getSize(target) {
      target.width = 800;
      target.height = 600;
      return target;
    },
    setRenderTarget() {},
  };
  const pipeline = createPostprocessPipeline(
    renderer,
    {},
    {},
    { postprocessGrading: true, postprocessVignette: false, postprocessGrain: false },
    { matchMedia: () => ({ matches: false }) },
  );
  const pass = pipeline.passes.vignetteGrain;
  assert.equal(pass.enabled, false);
  pipeline.setFade(0.6);
  assert.equal(pass.enabled, true);
  assert.equal(pass.uniforms.uFade.value, 0.6);
  pipeline.setQualityProfile({ postprocessGrading: true });
  assert.equal(pass.enabled, true);
  pipeline.setFade(2);
  assert.equal(pass.uniforms.uFade.value, 1);
  pipeline.setFade(0);
  assert.equal(pass.enabled, false);
  assert.equal(pass.uniforms.uFade.value, 0);
  pipeline.setFade(Number.NaN);
  assert.equal(pass.uniforms.uFade.value, 0);
  pipeline.dispose();
});

const asset = () => {
  const scene = new Group();
  scene.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()));
  return { scene };
};

test("supplied tower and tree switch between source and moonlight grades without rebuilding materials", () => {
  const tower = createCompleteTowerArchitecture({ asset: asset(), groundY: 0 });
  const material = tower.root.getObjectByName("complete-meshy-tower").material;
  const u = material.userData.babelGrade.uniforms;
  assert.equal(material.userData.babelGrade.role, "tower");
  close(u.babelSaturation.value, 0.94);
  assert.equal(u.babelLift.value, 0);
  tower.setFilmTreatment(true);
  close(u.babelSaturation.value, 0.68);
  close(u.babelHighlights.value, 0.56);
  close(u.babelTint.value.r, 0.93);
  close(u.babelShadowTint.value.b, 0.2);
  close(u.babelLift.value, 0.11);
  tower.setFilmTreatment(false);
  close(u.babelSaturation.value, 0.94);
  assert.equal(u.babelTint.value.r, 1);
  close(u.babelShadowTint.value.r, 0.19);
  assert.equal(u.babelLift.value, 0);
  assert.equal(applyFilmGrade(new MeshStandardMaterial(), true), false);
  const shader = { uniforms: {}, fragmentShader: "#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>" };
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.babelTint, u.babelTint);
  assert.equal(shader.uniforms.babelShadowTint, u.babelShadowTint);
  assert.match(shader.fragmentShader, /babelLift/);
  tower.dispose();
  tower.setFilmTreatment(true);
  assert.equal(u.babelLift.value, 0);

  const tree = createTreeArchitecture({ asset: asset(), groundHeight: () => 0 });
  const treeUniforms = tree.root.getObjectByName("meshy-tree").material.userData.babelGrade.uniforms;
  tree.setFilmTreatment(true);
  close(treeUniforms.babelSaturation.value, 0.74);
  tree.setFilmTreatment(false);
  assert.equal(treeUniforms.babelSaturation.value, 1);
  tree.dispose();
});

test("the lantern is an iron post lantern with glass, candle and flame, authored 2.48 units tall and fully owned", () => {
  const tree = createTreeArchitecture({ asset: asset(), groundHeight: () => 0 });
  const lantern = tree.root.getObjectByName("tree-lantern");
  const names = lantern.children.filter((o) => o.isMesh).map((o) => o.name).sort();
  assert.deepEqual(names, [
    "lantern-candle",
    "lantern-flame",
    "lantern-frame",
    "lantern-glass",
    "lantern-glass",
    "lantern-glass",
    "lantern-glass",
  ]);
  lantern.updateWorldMatrix(true, true);
  const size = new Box3().setFromObject(lantern).getSize(new Vector3());
  close(size.y, 2.48, 0.05);
  assert.ok(size.x < 1.05 && size.z < 1.05);
  const glass = lantern.getObjectByName("lantern-glass").material;
  assert.equal(glass.transparent, true);
  assert.equal(glass.depthWrite, false);
  const flame = lantern.getObjectByName("lantern-flame");
  close(tree.light.position.y, flame.position.y);
  tree.setFilmTreatment(true);
  close(glass.emissiveIntensity, 0.38);
  close(flame.material.emissiveIntensity, 2.8);
  const geometries = new Set(),
    materials = new Set();
  lantern.traverse((o) => {
    if (o.isMesh) {
      geometries.add(o.geometry);
      materials.add(o.material);
    }
  });
  let disposed = 0;
  for (const resource of [...geometries, ...materials])
    resource.addEventListener("dispose", () => disposed++);
  assert.equal(tree.dispose(), true);
  assert.equal(disposed, geometries.size + materials.size);
});

test("the nine directed shots keep their names and distinct viewpoints", () => {
  const all = [...DIRECTED_SHOTS.tower, ...DIRECTED_SHOTS.tree];
  assert.deepEqual(
    all.map((s) => s.name),
    [
      "Arrival",
      "The watch",
      "Threshold",
      "Masonry study",
      "Gallery detail",
      "Portrait",
      "Lantern study",
      "Close-up",
      "Root and lantern",
    ],
  );
  const keys = new Set(all.map((s) => `${s.azimuth}/${s.height}/${s.region.join()}`));
  assert.equal(keys.size, 9);
  for (const shot of all) {
    assert.ok(shot.height >= 0.1 && shot.height <= 0.7);
    assert.ok(shot.fov >= 30 && shot.fov <= 46);
  }
});
