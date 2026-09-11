import assert from "node:assert/strict";
import test from "node:test";
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
  Fog,
  Group,
} from "three";
import {
  chooseCinematicView,
  chooseCinematicAngle,
  cinematicSafeArea,
  createCinematicCamera,
  createQuietScene,
} from "../src/scene/cinematic.js";
import { DIRECTED_SHOTS } from "../src/scene/directed-shots.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function setup(selected = "tower", width = 1440, height = 900, angle = 0) {
  const camera = new PerspectiveCamera(45, width / height, 0.1, 1000),
    fog = new Fog(0, 62, 150);
  const root = new Mesh(new BoxGeometry(20, 34, 20), new MeshBasicMaterial());
  root.position.y = 17;
  const area = cinematicSafeArea(width, height, { right: 450, bottom: 200 }, { top: height - 110 });
  const controller = createCinematicCamera({
    camera,
    fog,
    selected,
    angle,
    getSafeArea: () => area,
  });
  controller.setSubject("tower", root);
  controller.setStatus({ kind: "tower", status: "ready" });
  return {
    controller,
    camera,
    root,
    fog,
    area,
    apply: (time = 0, extra = {}) =>
      controller.apply({ width, height, elapsedSeconds: time, ...extra }),
  };
}
test("view overrides avoid RNG and default selection divides at one half", () => {
  let calls = 0;
  const rng = () => {
    calls++;
    return 0.49;
  };
  assert.equal(chooseCinematicView("", rng), "tower");
  assert.equal(calls, 1);
  assert.equal(
    chooseCinematicView("", () => 0.5),
    "tree",
  );
  for (const v of ["tower", "tree", "orbit"])
    assert.equal(chooseCinematicView(`?view=${v}`, rng), v);
  for (const q of ["?architecture=classic", "?architecture=assembled", "?setting=previous"])
    assert.equal(chooseCinematicView(q, rng), "orbit");
  assert.equal(calls, 1);
});
test("camera fits all subject corners inside phone and desktop safe areas throughout the arc", () => {
  for (const [w, h] of [
    [390, 844],
    [1440, 900],
    [844, 390],
  ]) {
    const f = setup("tower", w, h);
    f.apply();
    for (const t of [0, 12, 36, 48]) {
      f.apply(t);
      f.camera.updateMatrixWorld();
      for (const x of [-10, 10])
        for (const y of [0, 34])
          for (const z of [-10, 10]) {
            const v = new Vector3(x, y, z).project(f.camera),
              px = ((v.x + 1) * w) / 2,
              py = ((1 - v.y) * h) / 2;
            assert.ok(px >= f.area.left && px <= f.area.left + f.area.width, `x ${px}`);
            assert.ok(py >= f.area.top && py <= f.area.top + f.area.height, `y ${py}`);
          }
      assert.equal(f.camera.fov, 38);
    }
  }
});
test("motion starts centered and remains fixed distance/elevation with exact four degree extremes", () => {
  const f = setup();
  f.apply(2);
  const center = f.camera.position.clone();
  const yaw = () => Math.atan2(f.camera.position.z, f.camera.position.x);
  const base = yaw(),
    distance = f.camera.position.distanceTo(f.controller.target);
  f.apply(14);
  near(yaw() - base, (4 * Math.PI) / 180);
  near(f.camera.position.y, center.y);
  near(f.camera.position.distanceTo(f.controller.target), distance);
  f.apply(38);
  near(yaw() - base, (-4 * Math.PI) / 180);
  f.apply(100, { reducedMotion: true });
  near(f.camera.position.distanceTo(center), 0);
  assert.equal(f.controller.selected, "tower");
});
test("tree waits, fails over to tower, preserves selection across loading and restores fallback", () => {
  const f = setup("tree");
  assert.equal(f.controller.ready, false);
  assert.equal(f.apply(), false);
  f.controller.setStatus({ kind: "tree", status: "fallback" });
  assert.equal(f.controller.current, "tower");
  f.apply();
  const tree = new Mesh(new BoxGeometry(15, 19.8, 15), new MeshBasicMaterial());
  tree.position.set(55.1, 10, 36.1);
  f.controller.setSubject("tree", tree);
  f.controller.setStatus({ kind: "tree", status: "ready" });
  f.apply();
  near(f.controller.target.x, 55.1);
  f.controller.setSubject("tree", null);
  f.controller.setStatus({ kind: "tree", status: "loading" });
  assert.equal(f.controller.ready, false);
  f.controller.setStatus({ kind: "tower", status: "procedural" });
  assert.equal(f.controller.current, "orbit");
  assert.equal(f.apply(), false);
  assert.equal(f.camera.fov, 45);
  assert.equal(f.fog.near, 62);
});
test("developer camera has priority and repeated disposal is safe", () => {
  const f = setup();
  f.apply();
  f.camera.position.set(1, 2, 3);
  assert.equal(f.apply(3, { developer: true }), false);
  assert.deepEqual(f.camera.position.toArray(), [1, 2, 3]);
  assert.equal(f.controller.dispose(), true);
  assert.equal(f.controller.dispose(), false);
  assert.equal(f.apply(), false);
});
test("quiet presentation suppresses re-enabled objects and restores original visibility and animation", () => {
  const a = new Group(),
    b = new Group();
  b.visible = false;
  const states = [];
  const q = createQuietScene([a, b, a], (value) => states.push(value));
  q.setActive(true);
  assert.equal(a.visible, false);
  a.visible = true;
  q.enforce();
  assert.equal(a.visible, false);
  q.setActive(false);
  assert.equal(a.visible, true);
  assert.equal(b.visible, false);
  q.setActive(true);
  q.dispose();
  q.dispose();
  assert.equal(a.visible, true);
  assert.deepEqual(states, [false, true, false, true]);
});

test("angle overrides and fresh-load angle sampling stay within each subject's own composition count", () => {
  for (const angle of [1, 2, 3, 4])
    assert.equal(chooseCinematicAngle(`?angle=${angle}`, "tower"), angle - 1);
  // Tree has four compositions, so its fourth direct URL remains reproducible.
  assert.equal(chooseCinematicAngle("?angle=4", "tree", () => 0.99), 3);
  // Tower has four, so the fifth URL falls back to its sampled composition.
  assert.equal(chooseCinematicAngle("?angle=5", "tower", () => 0.99), 3);
  assert.equal(chooseCinematicAngle("?view=tree", "tree", () => 0.99), 0);
  assert.equal(chooseCinematicAngle("", "tower", () => 0), 0);
  assert.equal(chooseCinematicAngle("", "tower", () => 0.5), 2);
  assert.equal(chooseCinematicAngle("", "tower", () => 0.99), 3);
  // Tree's random range can reach its fourth composition.
  assert.equal(chooseCinematicAngle("", "tree", () => 0.99), 3);
});
test("all angle variants retain safe portrait framing at both arc limits", () => {
  for (const subject of ["tower", "tree"])
    for (const angle of DIRECTED_SHOTS[subject].keys()) {
      const f = setup(subject, 390, 844, angle);
      if (subject === "tree") {
        f.controller.setSubject("tree", f.root);
        f.controller.setStatus({ kind: "tree", status: "ready" });
      }
      f.apply(0);
      for (const time of [0, 12, 36]) {
        f.apply(time);
        f.camera.updateMatrixWorld();
        for (const x of [-10, 10])
          for (const y of [0, 34])
            for (const z of [-10, 10]) {
              const v = new Vector3(x, y, z).project(f.camera),
                px = ((v.x + 1) * 390) / 2,
                py = ((1 - v.y) * 844) / 2;
              assert.ok(px >= f.area.left && px <= f.area.left + f.area.width);
              assert.ok(py >= f.area.top && py <= f.area.top + f.area.height);
            }
      }
    }
});
