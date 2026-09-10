import assert from "node:assert/strict";
import test from "node:test";
import {
  BoxGeometry,
  Color,
  Fog,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Vector3,
} from "three";
import { DIRECTED_SHOTS, wantsFilmTreatment, measureShot } from "../src/scene/directed-shots.js";
import { createCinematicCamera, cinematicSafeArea } from "../src/scene/cinematic.js";
import { createEarthGeometry, createEarthDetail, EARTH } from "../src/scene/filmic-earth.js";
import { createFilmScene } from "../src/scene/film-scene.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
test("film settings preserve every explicit architecture, earth-setting and orbit comparison", () => {
  assert.ok(wantsFilmTreatment("?view=tree&angle=3"));
  for (const q of [
    "cinematography=baseline",
    "architecture=classic",
    "architecture=assembled",
    "setting=previous",
    "view=orbit",
  ])
    assert.equal(wantsFilmTreatment(`?${q}`), false);
  for (const q of ["ground=procedural", "ground=desert", "scale=baseline"])
    assert.equal(wantsFilmTreatment(`?${q}`), true);
});
test("directed framing clips actual geometry and includes the entire lantern", () => {
  const root = new Group();
  const trunk = new Mesh(new BoxGeometry(5, 20, 5), new MeshStandardMaterial());
  trunk.name = "meshy-tree";
  trunk.position.y = 10;
  const lantern = new Mesh(new BoxGeometry(1, 4, 1), new MeshStandardMaterial());
  lantern.position.set(7, 2, 0);
  root.add(trunk, lantern);
  const measured = measureShot(root, DIRECTED_SHOTS.tree[2]);
  close(measured.region.min.y, 0);
  close(measured.region.max.y, 10);
  close(measured.region.max.x, 7.5);
  close(measured.cameraY, 3);
});
test("all directed framing regions fit desktop and phone through both movement extremes with fixed camera height", () => {
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
    [844, 390],
  ])
    for (const subject of ["tower", "tree"])
      for (const angle of DIRECTED_SHOTS[subject].keys()) {
        const camera = new PerspectiveCamera(45, w / h, 0.1, 1000),
          root = new Group();
        const mesh = new Mesh(new BoxGeometry(14, 34, 12), new MeshStandardMaterial());
        mesh.position.y = 17;
        root.add(mesh);
        root.position.set(3, -6, 4);
        const area = cinematicSafeArea(w, h, { right: 420, bottom: 220 }, { top: h - 105 });
        const controller = createCinematicCamera({
          camera,
          film: true,
          selected: subject,
          angle,
          getSafeArea: () => area,
        });
        controller.setSubject("tower", root);
        controller.setStatus({ kind: "tower", status: "ready" });
        controller.setSubject("tree", root);
        controller.setStatus({ kind: "tree", status: "ready" });
        const shot = DIRECTED_SHOTS[subject][angle],
          measured = measureShot(root, shot);
        let frame;
        for (const t of [0, 12, 36, 48]) {
          assert.equal(controller.apply({ width: w, height: h, elapsedSeconds: t }), true);
          if (frame)
            assert.equal(controller.frame, frame, "framing is cached between animation frames");
          frame = controller.frame;
          camera.updateMatrixWorld();
          close(camera.position.y, -6 + 34 * shot.height);
          assert.equal(camera.fov, shot.fov);
          for (let i = 0; i < measured.points.length; i += 3) {
            const v = new Vector3(...measured.points.slice(i, i + 3)).project(camera),
              x = ((v.x + 1) * w) / 2,
              y = ((1 - v.y) * h) / 2;
            assert.ok(
              x >= area.left &&
                x <= area.left + area.width &&
                y >= area.top &&
                y <= area.top + area.height,
              `${shot.name} region escaped safe area`,
            );
          }
        }
        const center = camera.position.clone();
        controller.apply({ width: w, height: h, elapsedSeconds: 17, reducedMotion: true });
        close(camera.position.distanceTo(center), 0);
        controller.apply({ width: w + 5, height: h, elapsedSeconds: 18 });
        assert.notEqual(frame, controller.frame, "resize invalidates cached fit");
        controller.dispose();
        root.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
      }
});
test("indexed terrain covers the full square and samples the correct world Z with finite unit normals", () => {
  const height = (x, z) =>
    1.8 * Math.sin(0.055 * x) +
    1.35 * Math.cos(0.052 * z) +
    0.9 * Math.sin(0.031 * (x + z)) +
    0.55 * Math.cos(0.018 * (x - z));
  const geometry = createEarthGeometry(height),
    p = geometry.attributes.position,
    n = geometry.attributes.normal;
  assert.equal(p.count, 129 * 129);
  assert.equal(geometry.index.count, 128 * 128 * 6);
  assert.equal(geometry.boundingBox.max.x, 192);
  assert.equal(geometry.boundingBox.min.y, -192);
  for (let i = 0; i < p.count; i++) {
    close(p.getZ(i), height(p.getX(i), -p.getY(i)));
    close(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)), 1);
  }
  assert.equal(EARTH.width / EARTH.tile, 384 / 6.3);
  geometry.dispose();
});
test("film scene restores geometry, effects, lighting and sky before disposal and tolerates repeated teardown", () => {
  const ground = new Mesh(new BoxGeometry(), new MeshStandardMaterial()),
    original = ground.geometry,
    effect = new Group(),
    halo = { enabled: true };
  const states = [],
    skyMaterial = { uniforms: { sunColor: { value: new Color(0xffaa00) } } };
  const controller = createFilmScene({
    ground,
    groundHeight: () => 0,
    effects: [effect],
    haloSystem: halo,
    skyMaterial,
    rendering: { setFilmTreatment: (a) => states.push(a) },
    atmosphere: { setFilmTreatment() {} },
    onGroundChange() {},
  });
  controller.setActive(true);
  const terrain = ground.geometry;
  assert.notEqual(terrain, original);
  assert.equal(effect.visible, false);
  assert.equal(halo.enabled, false);
  let disposed = 0;
  terrain.addEventListener("dispose", () => {
    disposed++;
    assert.equal(ground.geometry, original);
  });
  controller.setActive(false);
  assert.equal(effect.visible, true);
  assert.equal(halo.enabled, true);
  assert.equal(skyMaterial.uniforms.sunColor.value.getHex(), 0xffaa00);
  controller.setActive(true);
  assert.equal(ground.geometry, terrain);
  controller.dispose();
  controller.dispose();
  assert.equal(disposed, 1);
  assert.deepEqual(states, [true, false, true, false]);
  original.dispose();
  ground.material.dispose();
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
const canvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) });
test("earth makes no pre-gate downloads, binds three maps atomically, restores before disposal and closes stale images", async () => {
  const pending = [],
    published = [],
    closed = [];
  let bound = null;
  const earth = createEarthDetail({
    profile: { tier: "high" },
    anisotropy: 4,
    createCanvas: canvas,
    publish: (m) => {
      bound = m;
      published.push(m);
    },
    restore: () => {
      bound = null;
    },
    loadImage: (url, { signal }) =>
      new Promise((resolve) => pending.push({ url, signal, resolve })),
  });
  assert.equal(pending.length, 0);
  earth.setActive(true);
  assert.equal(pending.length, 3);
  earth.applyQuality({ tier: "balanced" });
  assert.ok(pending[0].signal.aborted);
  assert.equal(pending.length, 6);
  pending.forEach((r, i) =>
    r.resolve({
      width: i < 3 ? 1024 : 512,
      height: i < 3 ? 1024 : 512,
      close: () => closed.push(i),
    }),
  );
  await tick();
  await tick();
  assert.equal(published.length, 1);
  assert.equal(closed.length, 6);
  close(bound.colorMap.repeat.x, 384 / 6.3);
  assert.equal(bound.normalScale, 0.7);
  let disposals = 0;
  for (const m of [bound.colorMap, bound.normalMap, bound.roughnessMap])
    m.addEventListener("dispose", () => {
      assert.equal(bound, null);
      disposals++;
    });
  earth.setActive(false);
  earth.dispose();
  earth.dispose();
  assert.equal(disposals, 3);
});
test("a failed earth companion map retains the procedural surface without paid or automatic retries", async () => {
  let requests = 0,
    published = 0,
    closed = 0;
  const earth = createEarthDetail({
    profile: { tier: "high" },
    anisotropy: 4,
    createCanvas: canvas,
    publish: () => published++,
    restore: () => {},
    loadImage: async (url) => {
      requests++;
      if (url.includes("normal")) throw Error("404");
      return { width: 1024, height: 1024, close: () => closed++ };
    },
  });
  earth.setActive(true);
  await tick();
  await tick();
  earth.applyQuality({ tier: "high" });
  assert.equal(requests, 3);
  assert.equal(published, 0);
  assert.equal(closed, 2);
  earth.dispose();
});

test("low shots retain terrain clearance throughout the bounded camera arc", () => {
  const camera = new PerspectiveCamera(),
    root = new Group();
  const tree = new Mesh(new BoxGeometry(12, 20, 12), new MeshStandardMaterial());
  tree.position.y = 10;
  root.add(tree);
  const ground = (x, z) => 4 + 0.02 * x + 0.025 * z;
  const c = createCinematicCamera({
    camera,
    film: true,
    selected: "tree",
    angle: 2,
    getGroundY: ground,
    getSafeArea: () => ({ left: 480, top: 30, width: 920, height: 670 }),
  });
  for (const kind of ["tower", "tree"]) {
    c.setSubject(kind, root);
    c.setStatus({ kind, status: "ready" });
  }
  for (const time of [0, 12, 36, 48]) {
    c.apply({ width: 1440, height: 900, elapsedSeconds: time });
    assert.ok(camera.position.y - ground(camera.position.x, camera.position.z) >= 0.795);
  }
  c.dispose();
  tree.geometry.dispose();
  tree.material.dispose();
});

test("a foreground ridge cannot hide the roots in a low tree composition", () => {
  const ground = (x, z) =>
    1.8 * Math.sin(0.055 * x) +
    1.35 * Math.cos(0.052 * z) +
    0.9 * Math.sin(0.031 * (x + z)) +
    0.55 * Math.cos(0.018 * (x - z)) -
    6.8;
  const camera = new PerspectiveCamera(),
    root = new Group();
  const tree = new Mesh(new BoxGeometry(12, 19.8, 12), new MeshStandardMaterial());
  tree.name = "meshy-tree";
  tree.position.y = 9.9;
  root.position.set(55.1, ground(55.1, 36.1), 36.1);
  root.add(tree);
  const controller = createCinematicCamera({
    camera,
    film: true,
    selected: "tree",
    angle: 1,
    getGroundY: ground,
    getSafeArea: () => ({ left: 20, top: 220, width: 346, height: 460 }),
  });
  for (const kind of ["tower", "tree"]) {
    controller.setSubject(kind, root);
    controller.setStatus({ kind, status: "ready" });
  }
  let elevation;
  for (const time of [0, 12, 36, 48]) {
    controller.apply({ width: 390, height: 844, elapsedSeconds: time });
    elevation ??= camera.position.y;
    close(camera.position.y, elevation);
    for (let k = 1; k < 24; k++) {
      const t = k / 24,
        point = camera.position.clone().lerp(root.position, t);
      const lineY = camera.position.y * (1 - t) + (root.position.y + 0.18) * t;
      assert.ok(lineY >= ground(point.x, point.z) + 0.07);
    }
  }
  assert.ok(elevation >= root.position.y + 19.8 * DIRECTED_SHOTS.tree[1].height - 1e-6);
  controller.dispose();
  tree.geometry.dispose();
  tree.material.dispose();
});
