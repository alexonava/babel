import assert from "node:assert/strict";
import test from "node:test";
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3, PointLight } from "three";
import { DOOR_HEIGHT as D, mudSample, wantsMud, wantsPropScale } from "../src/scene/mud-ground.js";
import { createPropScale } from "../src/scene/prop-scale.js";
const size = (o) => new Box3().setFromObject(o).getSize(new Vector3());
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
function fixture() {
  const root = new Group();
  root.position.y = -7;
  const make = (w, h, d, x) => {
    const m = new Mesh(new BoxGeometry(w, h, d), new MeshStandardMaterial());
    m.position.set(x, 4, 0);
    root.add(m);
    return m;
  };
  return { root, make };
}
test("mud selection preserves desert, procedural and architecture comparisons", () => {
  assert.equal(wantsMud(""), true);
  for (const q of [
    "?ground=desert",
    "?ground=procedural",
    "?architecture=classic",
    "?architecture=assembled",
  ])
    assert.equal(wantsMud(q), false);
  assert.equal(wantsPropScale("?ground=desert"), true);
  assert.equal(wantsPropScale("?scale=baseline"), false);
});
test("mud fields are periodic, deterministic and keep wetness within the damp-earth range", () => {
  let wet = 0;
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const a = mudSample(x / 64, y / 64),
        b = mudSample(x / 64 + 1, y / 64 - 1);
      near(a.height, b.height);
      assert.ok(a.roughness >= 0.55 && a.roughness <= 0.9);
      if (a.roughness < 0.7) wet++;
    }
  assert.ok(wet > 0 && wet < 4096 * 0.2);
  assert.deepEqual(mudSample(0.2, 0.3), mudSample(0.2, 0.3));
});
test("props respect doorway-relative bounds and terrain contact then restore exactly", () => {
  const { root, make } = fixture();
  const stone = make(5, 3, 4, 20),
    rubble = make(4, 4, 4, 25),
    plant = make(3, 6, 3, 30);
  stone.rotation.z = 0.4;
  const originals = [stone, rubble, plant].map((o) => ({
    p: o.position.clone(),
    s: o.scale.clone(),
  }));
  const c = createPropScale({
    groundRoot: root,
    groundHeight: () => 2,
    stones: [stone],
    rubble: [rubble],
    plants: [plant],
  });
  c.setActive(true);
  assert.ok(Math.max(...size(stone).toArray()) <= 0.1 * D + 1e-6);
  assert.ok(Math.max(...size(rubble).toArray()) <= 0.25 * D + 1e-6);
  assert.ok(size(plant).y <= 0.12 * D + 1e-6);
  for (const o of [stone, rubble, plant]) near(new Box3().setFromObject(o).min.y, -5);
  const scale = stone.scale.clone();
  c.setActive(true);
  assert.deepEqual(stone.scale, scale);
  c.setActive(false);
  [stone, rubble, plant].forEach((o, i) => {
    assert.deepEqual(o.position, originals[i].p);
    assert.deepEqual(o.scale, originals[i].s);
  });
  c.setActive(true);
  assert.equal(c.dispose(), true);
  assert.equal(c.dispose(), false);
  assert.deepEqual(stone.scale, originals[0].s);
});
test("independently loaded tree and lantern resize and restore without changing borrowed geometry", () => {
  const { root, make } = fixture();
  const treeRoot = new Group();
  root.add(treeRoot);
  const tree = make(8, 22, 8, 0);
  tree.name = "meshy-tree";
  treeRoot.add(tree);
  const lantern = new Group();
  lantern.name = "tree-lantern";
  treeRoot.add(lantern);
  const housing = make(0.86, 2.48, 0.86, 0);
  housing.position.set(0, 1.24, 0);
  lantern.add(housing);
  const light = new PointLight(0xffffff, 4, 23);
  lantern.add(light);
  const fillLight = new PointLight(0xffffff, 2, 30);
  treeRoot.add(fillLight);
  const c = createPropScale({ groundRoot: root, groundHeight: () => 0 });
  c.setActive(true);
  c.setTree({ root: treeRoot, light, fillLight });
  near(size(tree).y, 4.2 * D);
  near(size(lantern).y, 0.3 * D);
  c.setTree(null);
  near(size(tree).y, 22);
  near(light.distance, 23);
  c.dispose();
});

test("torch animation remains inside scaled parents and restoration removes wrappers", () => {
  const { root, make } = fixture();
  const stand = make(0.3, 2.5, 0.3, 12),
    flame = make(1.6, 2.4, 1, 12);
  flame.position.y = 3.9;
  const light = new PointLight(0xffffff, 1, 18);
  light.position.set(12, 3.8, 0);
  root.add(light);
  const original = stand.position.clone(),
    count = root.children.length;
  const c = createPropScale({
    groundRoot: root,
    groundHeight: () => 1.6,
    torches: [
      {
        stand,
        flameOuter: flame,
        embers: [],
        light,
        baseX: 12,
        baseZ: 0,
        baseGroundY: 0.05,
        baseFlameY: 3.9,
      },
    ],
  });
  c.setActive(true);
  near(size(stand).y, 0.63 * D);
  near(size(flame).y, 0.12 * D);
  flame.position.y = 4;
  root.updateMatrixWorld(true);
  assert.ok(flame.getWorldPosition(new Vector3()).y > -2);
  c.setActive(false);
  assert.equal(root.children.length, count);
  assert.equal(flame.parent, root);
  near(light.distance, 18);
  assert.deepEqual(stand.position, original);
  c.dispose();
});

test("mud shading compiles only in mud mode and restores the baseline shader", async () => {
  const { configureMudShading } = await import("../src/scene/mud-ground.js");
  const material = new MeshStandardMaterial();
  const original = {
    vertexShader: "#include <begin_vertex>",
    fragmentShader: "#include <roughnessmap_fragment>",
  };
  configureMudShading(material, true);
  const shader = { ...original };
  material.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /vMudWorld/);
  assert.match(shader.fragmentShader, /roughnessFactor = mix/);
  configureMudShading(material, false);
  const baseline = { ...original };
  material.onBeforeCompile(baseline);
  assert.deepEqual(baseline, original);
  material.dispose();
});
