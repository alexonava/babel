import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D, Texture } from "three";
import {
  createWatchtowerRefinement,
  wantsGroundedWatchtower,
} from "../src/scene/watchtower-refinement.js";

test("grounded selection keeps baseline and architecture comparisons explicit", () => {
  for (const search of ["", "?quality=balanced", "?architecture=complete"])
    assert.equal(wantsGroundedWatchtower(search), true);
  for (const search of ["?refinement=baseline", "?architecture=assembled", "?architecture=classic"])
    assert.equal(wantsGroundedWatchtower(search), false);
});

test("refinement reuses source maps and restores materials and visibility before disposal", () => {
  const source = new MeshStandardMaterial({ map: new Texture(), color: 0xeeeeee });
  const meshes = Array.from({ length: 3 }, () => new Mesh(new BoxGeometry(), source));
  const effects = [new Object3D(), new Object3D()];
  effects[1].visible = false;
  const light = [];
  const c = createWatchtowerRefinement({
    plinth: meshes.slice(0, 2),
    rubble: meshes.slice(2),
    effects,
    setLighting: (active) => light.push(active),
  });
  assert.equal(c.active, false);
  c.setActive(true);
  assert.equal(meshes[0].material, meshes[1].material);
  assert.notEqual(meshes[0].material, meshes[2].material);
  assert.equal(meshes[0].material.map, source.map);
  assert.equal(source.color.getHex(), 0xeeeeee);
  assert.notEqual(
    meshes[0].material.customProgramCacheKey(),
    meshes[2].material.customProgramCacheKey(),
  );
  let disposed = 0,
    borrowed = 0;
  source.addEventListener("dispose", () => borrowed++);
  source.map.addEventListener("dispose", () => borrowed++);
  for (const m of new Set(meshes.map((mesh) => mesh.material)))
    m.addEventListener("dispose", () => {
      assert.ok(meshes.every((mesh) => mesh.material === source));
      disposed++;
    });
  effects[0].visible = true;
  c.enforceVisibility();
  assert.ok(effects.every((e) => !e.visible));
  assert.equal(c.setActive(true), false);
  c.setActive(false);
  assert.deepEqual(
    effects.map((e) => e.visible),
    [true, false],
  );
  assert.equal(disposed, 2);
  assert.equal(borrowed, 0);
  assert.deepEqual(light, [true, false]);
  c.setActive(true);
  c.dispose();
  assert.equal(c.dispose(), false);
  assert.equal(c.setActive(true), false);
  assert.ok(meshes.every((mesh) => mesh.material === source));
});

test("partial material preparation failure rolls back earlier bindings and leaves sources alive", () => {
  const a = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const b = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const original = a.material;
  let disposal = 0;
  const clone = original.clone.bind(original);
  original.clone = () => {
    const m = clone();
    m.addEventListener("dispose", () => disposal++);
    return m;
  };
  b.material.clone = () => {
    throw new Error("unavailable");
  };
  const c = createWatchtowerRefinement({ plinth: [a, b] });
  assert.throws(() => c.setActive(true), /unavailable/);
  assert.equal(a.material, original);
  assert.equal(disposal, 1);
  assert.equal(c.active, false);
  c.dispose();
});
