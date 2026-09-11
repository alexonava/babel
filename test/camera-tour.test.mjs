import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from "three";
import { createCinematicCamera } from "../src/scene/cinematic.js";
import { createCameraTour, readTourInterval } from "../src/scene/camera-tour.js";

function setup(interval = 5, random = Math.random) {
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
  const tour = createCameraTour({ camera: controller, interval, random });
  return {
    camera,
    controller,
    tour,
    render(time, flags = {}) {
      const phase = tour.update({ elapsedSeconds: time, ...flags });
      controller.apply({
        width: 1440,
        height: 900,
        elapsedSeconds: time,
        tourPhase: phase,
        ...flags,
      });
    },
    dispose() {
      tour.dispose();
      controller.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

test("tour defaults to five seconds even when a link chooses its opening composition", () => {
  for (const query of ["", "?quality=high", "?view=tower", "?angle=1", "?view=tree&angle=6"])
    assert.equal(readTourInterval(query), 5);
  for (const query of ["?tour=0", "?tour=1", "?tour=nan", "?tour=100"])
    assert.equal(readTourInterval(query), 0);
  assert.equal(readTourInterval("?tour=3"), 3);
  assert.equal(readTourInterval("?tour=5"), 5);
  assert.equal(readTourInterval("?tour=20"), 20);
  assert.equal(readTourInterval("?view=tower&tour=5"), 5);
});
test("all eight views cycle at the selected interval with small drift and cached repeat framing", () => {
  for (const interval of [3, 5]) {
    const f = setup(interval);
    f.render(0);
    const firstFit = f.controller.frame,
      firstPosition = f.camera.position.clone();
    f.render(interval * 0.5);
    assert.ok(f.camera.position.distanceTo(firstPosition) > 0.1);
    assert.equal(f.camera.position.y, firstPosition.y);
    const names = [f.controller.shot.name];
    for (let i = 1; i <= 8; i++) {
      f.render(interval * i);
      names.push(f.controller.shot.name);
    }
    assert.deepEqual(names, [
      "The watch",
      "Threshold",
      "Masonry study",
      "Gallery detail",
      "Portrait",
      "Lantern study",
      "Close-up",
      "Root and lantern",
      "The watch",
    ]);
    assert.equal(f.controller.frame, firstFit);
    f.dispose();
  }
});

test("pause, panels, reduced motion and developer control hold the tour without catch-up cuts", () => {
  for (const flag of ["panelOpen", "reducedMotion", "developer"]) {
    const f = setup();
    f.render(0);
    f.render(2);
    f.render(3, { [flag]: true });
    f.render(50, { [flag]: true });
    f.render(51);
    assert.equal(f.controller.selected, "tower");
    assert.equal(f.controller.angle, 0);
    f.render(54);
    assert.equal(f.controller.shot.name, "Threshold");
    f.dispose();
  }
  const f = setup();
  f.render(0);
  f.render(2);
  f.tour.toggle();
  f.render(10);
  const held = f.camera.position.clone();
  f.render(30);
  assert.deepEqual(f.camera.position.toArray(), held.toArray());
  f.tour.next();
  f.render(31);
  assert.equal(f.controller.shot.name, "Threshold");
  f.tour.toggle();
  f.render(32);
  f.render(37);
  assert.equal(f.controller.shot.name, "Masonry study");
  f.dispose();
});

test("the 20-second mode dwells long by default with an occasional 5-second wildcard, sampled fresh per shot", () => {
  // A deterministic sequence: values below wildcardChance (0.2) trigger the
  // wildcard; the rest hold the long dwell.
  const rolls = [0.5, 0.05, 0.9, 0.1, 0.7, 0.99];
  let i = 0;
  const random = () => rolls[i++ % rolls.length];
  const f = setup(20, random);
  assert.equal(f.tour.state.interval, 20);
  assert.equal(f.tour.state.dwell, 20); // first roll (0.5) is not a wildcard
  f.render(0);
  f.render(19.99);
  assert.equal(f.controller.shot.name, "The watch");
  f.render(20.01); // crosses into "Threshold"; next roll (0.05) is a wildcard
  assert.equal(f.controller.shot.name, "Threshold");
  assert.equal(f.tour.state.dwell, 5);
  f.render(25.02); // 5s wildcard dwell elapses; next roll (0.9) is not
  assert.equal(f.controller.shot.name, "Masonry study");
  assert.equal(f.tour.state.dwell, 20);
  f.dispose();
});

test("switching to the 20-second mode via setInterval re-samples the dwell immediately", () => {
  let wildcard = false;
  const f = setup(5, () => (wildcard ? 0.01 : 0.99));
  assert.equal(f.tour.state.interval, 5);
  wildcard = true;
  f.tour.setInterval(20);
  assert.equal(f.tour.state.interval, 20);
  assert.equal(f.tour.state.dwell, 5);
  f.dispose();
});

test("unavailable subjects are skipped, loading holds, and disposal blocks later changes", () => {
  const f = setup();
  f.controller.setSubject("tree", null);
  f.controller.setStatus({ kind: "tree", status: "fallback" });
  for (const t of [0, 5, 10, 15, 20]) f.render(t);
  assert.equal(f.controller.shot.name, "The watch");
  f.controller.setStatus({ kind: "tower", status: "loading" });
  f.render(16);
  f.render(50);
  f.controller.setStatus({ kind: "tower", status: "ready" });
  f.render(51);
  assert.equal(f.controller.shot.name, "The watch");
  f.tour.dispose();
  f.tour.next();
  f.render(99);
  assert.equal(f.controller.shot.name, "The watch");
  f.dispose();
});
