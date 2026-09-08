import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BoxGeometry,
  Frustum,
  Group,
  Mesh,
  MeshStandardMaterial,
  Plane,
  Sphere,
  Texture,
  Vector3,
} from "three";
import {
  BRICK_DETAIL_MAX_BYTES,
  createBrickDetailController,
  decodeBrickGeometry,
} from "../src/scene/brick-detail.js";

const asset = await readFile(new URL("../images/materials/stone-brick.bin", import.meta.url));
const flush = () => new Promise((resolve) => setImmediate(resolve));
const countDisposals = (resource) => {
  const counter = { count: 0 };
  resource.addEventListener("dispose", () => {
    counter.count += 1;
  });
  return counter;
};
function maps() {
  const colorMap = new Texture(),
    roughnessMap = new Texture();
  return {
    colorMap,
    roughnessMap,
    colorDisposals: countDisposals(colorMap),
    roughnessDisposals: countDisposals(roughnessMap),
  };
}
function harness({
  tier = "high",
  disabled = false,
  failSecondMaterial = false,
  configureMesh = () => {},
  geometryUrl,
  materialColor,
} = {}) {
  const group = new Group();
  const material = new MeshStandardMaterial({ roughness: 0.8, metalness: 0.2 });
  const wallRoughness = new Texture();
  const bump = new Texture();
  material.roughnessMap = wallRoughness;
  material.bumpMap = bump;
  material.bumpScale = 0.4;
  const records = [0, 1].map((index) => {
    const mesh = new Mesh(new BoxGeometry(2, 3, 4), material);
    if (failSecondMaterial && index === 1) {
      mesh.material = new MeshStandardMaterial();
      mesh.material.clone = () => {
        throw new Error("Cannot clone");
      };
    }
    mesh.scale.set(1.2, 0.8, 1.5);
    mesh.position.set(index + 3, 7, -2);
    mesh.rotation.set(0.1, 0.5, 0.2);
    mesh.visible = index === 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    configureMesh(mesh, index);
    group.add(mesh);
    return { mesh, dimensions: { x: 0.8 + index * 0.1, y: 0.4, z: 0.3 } };
  });
  const originals = records.map(({ mesh }) => ({
    geometry: mesh.geometry,
    material: mesh.material,
    scale: mesh.scale.clone(),
    position: mesh.position.clone(),
    rotation: mesh.rotation.clone(),
    visible: mesh.visible,
    boundingSphere: Object.getOwnPropertyDescriptor(mesh, "boundingSphere"),
  }));
  const requests = [],
    statuses = [],
    changes = [];
  const controller = createBrickDetailController({
    profile: { tier },
    disabled,
    records,
    geometryUrl,
    materialColor,
    onChange() {
      changes.push(records.map(({ mesh }) => mesh.geometry));
    },
    report(status) {
      statuses.push(status);
    },
    loadGeometry(url, { signal }) {
      let resolve, reject;
      const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      requests.push({ url, signal, resolve, reject });
      return promise;
    },
  });
  function assertOriginals() {
    records.forEach(({ mesh }, index) => {
      assert.equal(mesh.geometry, originals[index].geometry);
      assert.equal(mesh.material, originals[index].material);
      assert.deepEqual(mesh.scale, originals[index].scale);
      assert.deepEqual(
        Object.getOwnPropertyDescriptor(mesh, "boundingSphere"),
        originals[index].boundingSphere,
      );
    });
  }
  return {
    controller,
    group,
    records,
    originals,
    requests,
    statuses,
    changes,
    material,
    wallRoughness,
    bump,
    assertOriginals,
  };
}

test("BRK1 decodes the actual shared brick into normalized, bounded, non-indexed attributes", () => {
  assert.equal(asset.length, 40232);
  assert.ok(asset.length <= BRICK_DETAIL_MAX_BYTES);
  const geometry = decodeBrickGeometry(asset);
  assert.equal(geometry.index, null);
  assert.equal(geometry.attributes.position.count / 3, 838);
  assert.ok(geometry.attributes.position.array instanceof Int16Array);
  assert.ok(geometry.attributes.normal.array instanceof Int16Array);
  assert.ok(geometry.attributes.uv.array instanceof Uint16Array);
  for (const attribute of Object.values(geometry.attributes))
    assert.equal(attribute.normalized, true);
  const { position, normal, uv } = geometry.attributes;
  for (let index = 0; index < position.count; index += 1) {
    assert.ok(
      new Vector3()
        .fromBufferAttribute(position, index)
        .toArray()
        .every((v) => Math.abs(v) <= 0.5 + 1 / 32767),
    );
    assert.ok(Math.abs(new Vector3().fromBufferAttribute(normal, index).length() - 1) < 0.001);
    assert.ok(
      [uv.getX(index), uv.getY(index)].every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
    );
  }
  assert.ok(Number.isFinite(geometry.boundingSphere.radius));
  geometry.dispose();
});

test("BRK1 copies misaligned views instead of retaining mutable response bytes", () => {
  const padded = new Uint8Array(asset.length + 1);
  padded.set(asset, 1);
  const view = padded.subarray(1);
  const geometry = decodeBrickGeometry(view);
  const before = geometry.attributes.position.getX(0);
  view.fill(0);
  assert.equal(geometry.attributes.position.getX(0), before);
  geometry.dispose();
});

test("BRK1 rejects malformed magic, lengths, counts, positions, and normals before returning geometry", () => {
  const malformed = [
    null,
    new ArrayBuffer(0),
    new ArrayBuffer(BRICK_DETAIL_MAX_BYTES + 1),
    asset.subarray(0, asset.length - 6),
    Buffer.concat([asset, Buffer.alloc(1)]),
  ];
  const changed = (offset, value, kind = "int16") => {
    const bytes = Buffer.from(asset);
    if (kind === "uint32") bytes.writeUInt32LE(value, offset);
    else bytes.writeInt16LE(value, offset);
    return bytes;
  };
  malformed.push(
    changed(0, 0, "uint32"),
    changed(4, 4, "uint32"),
    changed(4, 3003, "uint32"),
    changed(4, 0, "uint32"),
    changed(8, 32767),
  );
  const normalOffset = 8 + asset.readUInt32LE(4) * 6;
  const zeroNormal = Buffer.from(asset);
  zeroNormal.fill(0, normalOffset, normalOffset + 6);
  const longNormal = Buffer.from(asset);
  for (let axis = 0; axis < 3; axis += 1) longNormal.writeInt16LE(32767, normalOffset + axis * 2);
  malformed.push(zeroNormal, longNormal);
  for (const bytes of malformed)
    assert.throws(() => decodeBrickGeometry(bytes), /Invalid BRK1 brick geometry/);
});

test("low, unknown, disabled, and empty relief sets do not request brick geometry", () => {
  for (const options of [{ tier: "low" }, { tier: "unknown" }, { disabled: true }]) {
    const h = harness(options);
    assert.equal(h.requests.length, 0);
    assert.equal(h.statuses.at(-1).status, "procedural");
    h.assertOriginals();
    h.controller.dispose();
  }
  const controller = createBrickDetailController({
    profile: { tier: "high" },
    records: [],
    loadGeometry() {
      assert.fail("Empty reliefs must not fetch");
    },
  });
  controller.dispose();
});

test("brick activation waits for both resources and reuses meshes, geometry, and cloned materials", async () => {
  const h = harness();
  const pair = maps();
  h.controller.setDetailMaps(pair);
  h.assertOriginals();
  const geometry = decodeBrickGeometry(asset),
    disposal = countDisposals(geometry);
  assert.equal(h.requests[0].url, "/images/materials/stone-brick.bin");
  h.requests[0].resolve(geometry);
  await flush();
  assert.equal(h.statuses.at(-1).status, "ready");
  assert.equal(h.group.children.length, 2);
  assert.equal(h.records[0].mesh.material, h.records[1].mesh.material);
  const clone = h.records[0].mesh.material;
  assert.notEqual(clone, h.material);
  assert.equal(clone.map, pair.colorMap);
  assert.equal(clone.roughnessMap, pair.roughnessMap);
  assert.equal(clone.roughness, 0.96);
  assert.equal(clone.metalness, 0);
  assert.equal(clone.bumpMap, null);
  assert.equal(clone.bumpScale, 0);
  assert.equal(h.material.bumpMap, h.bump);
  assert.equal(h.material.roughnessMap, h.wallRoughness);
  h.records.forEach(({ mesh, dimensions }, index) => {
    assert.equal(mesh, h.group.children[index]);
    assert.equal(mesh.geometry, geometry);
    assert.deepEqual(mesh.scale, h.originals[index].scale.clone().multiply(dimensions));
    assert.deepEqual(mesh.position, h.originals[index].position);
    assert.deepEqual(mesh.rotation.toArray(), h.originals[index].rotation.toArray());
    assert.equal(mesh.visible, h.originals[index].visible);
    assert.equal(mesh.castShadow, true);
    assert.equal(mesh.receiveShadow, true);
  });
  const cloneDisposal = countDisposals(clone);
  geometry.addEventListener("dispose", h.assertOriginals);
  h.controller.dispose();
  assert.equal(disposal.count, 1);
  assert.equal(cloneDisposal.count, 1);
  assert.equal(pair.colorDisposals.count + pair.roughnessDisposals.count, 0);
  h.assertOriginals();
});

test("a ready geometry stays on boxes until a valid map pair arrives and map loss restores originals", async () => {
  const h = harness();
  const geometry = decodeBrickGeometry(asset),
    disposal = countDisposals(geometry);
  h.requests[0].resolve(geometry);
  await flush();
  h.assertOriginals();
  assert.equal(h.statuses.at(-1).status, "waiting-maps");
  h.controller.setDetailMaps({ colorMap: new Texture() });
  assert.equal(h.statuses.at(-1).status, "fallback");
  const pair = maps();
  h.controller.setDetailMaps(pair);
  const cloneDisposal = countDisposals(h.records[0].mesh.material);
  assert.equal(h.controller.setDetailMaps(pair), false);
  h.controller.setDetailMaps(null);
  h.assertOriginals();
  assert.equal(cloneDisposal.count, 1);
  assert.equal(disposal.count, 0);
  assert.equal(pair.colorDisposals.count + pair.roughnessDisposals.count, 0);
  assert.equal(h.statuses.at(-1).status, "fallback");
  // The map owner rebinds original wall materials between clearing and supplying
  // a new pair; restoration must keep those exact source references intact.
  const nextWallMap = new Texture();
  h.material.roughnessMap = nextWallMap;
  h.controller.setDetailMaps(maps());
  h.controller.setDetailMaps(null);
  assert.equal(h.material.roughnessMap, nextWallMap);
  assert.equal(h.requests.length, 1);
  h.controller.dispose();
  assert.equal(disposal.count, 1);
});

test("high and balanced share a request; downgrade restores before disposal and reentry fetches once", async () => {
  const h = harness();
  assert.equal(h.controller.applyQuality({ tier: "high" }), false);
  assert.equal(h.controller.applyQuality({ tier: "balanced" }), true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].signal.aborted, false);
  const geometry = decodeBrickGeometry(asset),
    disposal = countDisposals(geometry);
  h.controller.setDetailMaps(maps());
  h.requests[0].resolve(geometry);
  await flush();
  h.controller.applyQuality({ tier: "high" });
  assert.equal(h.requests.length, 1);
  assert.equal(h.statuses.at(-1).status, "ready");
  geometry.addEventListener("dispose", h.assertOriginals);
  h.controller.applyQuality({ tier: "low" });
  h.assertOriginals();
  assert.equal(disposal.count, 1);
  assert.equal(h.statuses.at(-1).status, "procedural");
  h.controller.applyQuality({ tier: "balanced" });
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(decodeBrickGeometry(asset));
  await flush();
  h.assertOriginals();
  assert.equal(h.statuses.at(-1).status, "waiting-maps");
  h.controller.setDetailMaps(maps());
  assert.equal(h.statuses.at(-1).status, "ready");
  h.controller.dispose();
});

test("geometry failure leaves the original reliefs and avoids retries until low-tier reentry", async () => {
  const h = harness();
  h.controller.setDetailMaps(maps());
  h.requests[0].reject(new Error("404"));
  await flush();
  h.assertOriginals();
  assert.equal(h.statuses.at(-1).status, "fallback");
  h.controller.applyQuality({ tier: "balanced" });
  assert.equal(h.requests.length, 1);
  h.controller.applyQuality({ tier: "low" });
  h.controller.applyQuality({ tier: "high" });
  assert.equal(h.requests.length, 2);
  h.controller.dispose();
});

test("downgrade and disposal abort pending loads, dispose stale geometry, and cannot reactivate", async () => {
  for (const action of ["downgrade", "dispose"]) {
    const h = harness();
    h.controller.setDetailMaps(maps());
    if (action === "downgrade") h.controller.applyQuality({ tier: "low" });
    else assert.equal(h.controller.dispose(), true);
    assert.equal(h.requests[0].signal.aborted, true);
    const geometry = decodeBrickGeometry(asset),
      disposal = countDisposals(geometry);
    h.requests[0].resolve(geometry);
    await flush();
    h.assertOriginals();
    assert.equal(disposal.count, 1);
    assert.equal(h.changes.length, 0);
    if (action === "downgrade") h.controller.dispose();
    assert.equal(h.controller.dispose(), false);
    assert.equal(h.controller.applyQuality({ tier: "high" }), false);
    assert.equal(h.controller.setDetailMaps(maps()), false);
  }
});

test("material preparation failure cannot partially replace the relief set", async () => {
  const h = harness({ failSecondMaterial: true });
  const geometry = decodeBrickGeometry(asset),
    disposal = countDisposals(geometry);
  const originalClone = h.material.clone.bind(h.material);
  let cloneDisposal;
  h.material.clone = () => {
    const clone = originalClone();
    cloneDisposal = countDisposals(clone);
    return clone;
  };
  h.controller.setDetailMaps(maps());
  h.requests[0].resolve(geometry);
  await flush();
  h.assertOriginals();
  assert.equal(h.statuses.at(-1).status, "fallback");
  assert.equal(cloneDisposal.count, 1);
  assert.equal(h.changes.length, 0);
  h.controller.dispose();
  assert.equal(disposal.count, 1);
});

test("a stale completion after low-tier reentry cannot replace or dispose the newer geometry", async () => {
  const h = harness();
  h.controller.applyQuality({ tier: "low" });
  h.controller.applyQuality({ tier: "balanced" });
  h.controller.setDetailMaps(maps());
  const current = decodeBrickGeometry(asset),
    currentDisposal = countDisposals(current);
  h.requests[1].resolve(current);
  await flush();
  const stale = decodeBrickGeometry(asset),
    staleDisposal = countDisposals(stale);
  h.requests[0].resolve(stale);
  await flush();
  assert.ok(h.records.every(({ mesh }) => mesh.geometry === current));
  assert.equal(staleDisposal.count, 1);
  assert.equal(currentDisposal.count, 0);
  assert.equal(h.statuses.at(-1).status, "ready");
  h.controller.dispose();
  assert.equal(currentDisposal.count, 1);
});

test("a tread URL and limestone color override preserve the original material across resets", async () => {
  const materialColor = 0x8f806e;
  const h = harness({ geometryUrl: "/images/materials/stone-tread.bin", materialColor });
  const originalColor = h.material.color.clone();
  assert.equal(h.requests[0].url, "/images/materials/stone-tread.bin");
  h.controller.applyQuality({ tier: "balanced" });
  assert.equal(h.requests.length, 1);
  h.controller.setDetailMaps(maps());
  h.requests[0].resolve(decodeBrickGeometry(asset));
  await flush();
  const material = h.records[0].mesh.material;
  assert.equal(material.color.getHex(), materialColor);
  assert.deepEqual(h.material.color, originalColor);
  h.controller.setDetailMaps(null);
  h.assertOriginals();
  assert.deepEqual(h.material.color, originalColor);
  h.controller.setDetailMaps(maps());
  assert.equal(h.records[0].mesh.material.color.getHex(), materialColor);
  h.controller.dispose();
  h.assertOriginals();
});

test("the construction baseline can disable treads while leaving the accepted brick controller active", async () => {
  const bricks = harness();
  const treads = harness({ disabled: true, geometryUrl: "/images/materials/stone-tread.bin" });
  const pair = maps();
  bricks.controller.setDetailMaps(pair);
  treads.controller.setDetailMaps(pair);
  assert.equal(bricks.requests.length, 1);
  assert.equal(treads.requests.length, 0);
  bricks.requests[0].resolve(decodeBrickGeometry(asset));
  await flush();
  assert.equal(bricks.statuses.at(-1).status, "ready");
  assert.equal(treads.statuses.at(-1).status, "procedural");
  treads.assertOriginals();
  treads.controller.dispose();
  bricks.controller.dispose();
  assert.equal(pair.colorDisposals.count + pair.roughnessDisposals.count, 0);
});

test("two construction controllers restore independently before their external maps are disposed", async () => {
  const bricks = harness();
  const treads = harness({
    geometryUrl: "/images/materials/stone-tread.bin",
    materialColor: 0xa9a092,
  });
  const controllers = [bricks, treads];
  const pair = maps();
  const geometries = controllers.map(() => decodeBrickGeometry(asset));
  const disposals = geometries.map(countDisposals);
  controllers.forEach((h, index) => {
    h.controller.setDetailMaps(pair);
    h.requests[0].resolve(geometries[index]);
  });
  await flush();
  controllers.forEach((h) => assert.equal(h.statuses.at(-1).status, "ready"));
  controllers.forEach((h) => h.controller.setDetailMaps(null));
  controllers.forEach((h) => h.assertOriginals());
  assert.ok(disposals.every((counter) => counter.count === 0));
  pair.colorMap.addEventListener("dispose", () => controllers.forEach((h) => h.assertOriginals()));
  pair.roughnessMap.addEventListener("dispose", () =>
    controllers.forEach((h) => h.assertOriginals()),
  );
  pair.colorMap.dispose();
  pair.roughnessMap.dispose();
  const nextPair = maps();
  controllers.forEach((h) => h.controller.setDetailMaps(nextPair));
  controllers.forEach((h) => assert.equal(h.statuses.at(-1).status, "ready"));
  treads.controller.applyQuality({ tier: "low" });
  treads.assertOriginals();
  assert.equal(bricks.records[0].mesh.geometry, geometries[0]);
  assert.deepEqual(
    disposals.map((counter) => counter.count),
    [0, 1],
  );
  controllers
    .slice()
    .reverse()
    .forEach((h) => h.controller.dispose());
  assert.deepEqual(
    disposals.map((counter) => counter.count),
    [1, 1],
  );
  assert.equal(nextPair.colorDisposals.count + nextPair.roughnessDisposals.count, 0);
});

async function activeTread() {
  const bytes = await readFile(new URL("../images/materials/stone-tread.bin", import.meta.url));
  const geometry = decodeBrickGeometry(bytes);
  const dimensions = { x: 4.6, y: 0.4, z: 2 };
  const mesh = new Mesh(new BoxGeometry(4.6, 0.4, 2), new MeshStandardMaterial());
  mesh.scale.set(0.95, 1.02, 1.03);
  const group = new Group();
  group.add(mesh);
  const controller = createBrickDetailController({
    profile: { tier: "high" },
    records: [{ mesh, dimensions }],
    loadGeometry: async () => geometry,
  });
  controller.setDetailMaps(maps());
  await flush();
  group.updateMatrixWorld(true);
  return { mesh, group, geometry, controller };
}

test("thin tread bounds cull the inflated shared-sphere false positive without extra geometry", async () => {
  const { mesh, geometry, controller } = await activeTread();
  const originalSphere = geometry.boundingSphere.clone();
  const inflated = geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
  const tight = mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
  assert.ok(tight.radius < inflated.radius * 0.8);
  mesh.position.x = 1 + (inflated.radius + tight.radius) / 2;
  mesh.updateMatrixWorld(true);
  const frustum = new Frustum(
    new Plane(new Vector3(1, 0, 0), 1),
    new Plane(new Vector3(-1, 0, 0), 1),
    new Plane(new Vector3(0, 1, 0), 1),
    new Plane(new Vector3(0, -1, 0), 1),
    new Plane(new Vector3(0, 0, 1), 1),
    new Plane(new Vector3(0, 0, -1), 1),
  );
  assert.equal(
    frustum.intersectsSphere(geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld)),
    true,
  );
  assert.equal(frustum.intersectsObject(mesh), false);
  assert.equal(mesh.geometry, geometry);
  assert.deepEqual(geometry.boundingSphere, originalSphere);
  controller.dispose();
});

test("tread bounds contain every vertex through rotated nonuniform parents and reflections", async () => {
  const { mesh, group, geometry, controller } = await activeTread();
  const ancestor = new Group();
  ancestor.add(group);
  ancestor.scale.set(1.3, 0.8, 1.7);
  ancestor.rotation.set(-0.3, 0.2, 0.5);
  mesh.rotation.set(0.6, -0.35, 0.15);
  const vertex = new Vector3();
  for (const scale of [
    [1.7, 0.65, 2.2],
    [-0.4, 2.8, 1.3],
    [0, 0, 0],
  ]) {
    group.scale.set(...scale);
    group.rotation.set(0.4, 0.8, -0.2);
    group.position.set(11, -6, 3);
    ancestor.updateMatrixWorld(true);
    const world = mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
    for (let index = 0; index < geometry.attributes.position.count; index += 1) {
      vertex
        .fromBufferAttribute(geometry.attributes.position, index)
        .applyMatrix4(mesh.matrixWorld);
      assert.ok(
        vertex.distanceTo(world.center) <= world.radius + 1e-10,
        "A transformed vertex escaped the culling sphere",
      );
    }
  }
  controller.dispose();
});

test("detail bounds cache linear transforms while translation follows the current world matrix", async () => {
  const { mesh, group, controller } = await activeTread();
  const getMaxScale = mesh.matrixWorld.getMaxScaleOnAxis.bind(mesh.matrixWorld);
  let calculations = 0;
  mesh.matrixWorld.getMaxScaleOnAxis = () => {
    calculations += 1;
    return getMaxScale();
  };
  const first = mesh.boundingSphere;
  assert.equal(calculations, 1);
  assert.equal(mesh.boundingSphere, first);
  assert.equal(calculations, 1);
  group.position.set(5, 2, -6);
  group.updateMatrixWorld(true);
  assert.equal(mesh.boundingSphere, first);
  assert.equal(calculations, 1);
  group.scale.set(1.3, 0.6, 1.8);
  group.updateMatrixWorld(true);
  assert.equal(mesh.boundingSphere, first);
  assert.equal(calculations, 2);
  controller.dispose();
});

test("map resets, quality downgrades, and disposal restore exact original bounds descriptors", async () => {
  for (const action of ["maps", "quality", "dispose"]) {
    const originalSphere = new Sphere(new Vector3(1, 2, 3), 4);
    const h = harness({
      configureMesh(mesh, index) {
        if (index === 1)
          Object.defineProperty(mesh, "boundingSphere", {
            configurable: true,
            enumerable: true,
            writable: false,
            value: originalSphere,
          });
      },
    });
    const geometry = decodeBrickGeometry(asset);
    h.controller.setDetailMaps(maps());
    h.requests[0].resolve(geometry);
    await flush();
    assert.ok(
      h.records.every(
        ({ mesh }) =>
          typeof Object.getOwnPropertyDescriptor(mesh, "boundingSphere").get === "function",
      ),
    );
    geometry.addEventListener("dispose", h.assertOriginals);
    if (action === "maps") h.controller.setDetailMaps(null);
    else if (action === "quality") h.controller.applyQuality({ tier: "low" });
    else h.controller.dispose();
    h.assertOriginals();
    assert.equal(Object.hasOwn(h.records[0].mesh, "boundingSphere"), false);
    assert.equal(h.records[1].mesh.boundingSphere, originalSphere);
    assert.deepEqual(originalSphere, new Sphere(new Vector3(1, 2, 3), 4));
    h.controller.dispose();
  }
});

test("locked bounds or a nonextensible mesh leave the entire relief set unchanged", async () => {
  for (const locked of [true, false]) {
    const h = harness({
      configureMesh(mesh, index) {
        if (index !== 1) return;
        if (locked)
          Object.defineProperty(mesh, "boundingSphere", {
            value: new Sphere(),
            configurable: false,
          });
        else Object.preventExtensions(mesh);
      },
    });
    h.controller.setDetailMaps(maps());
    h.requests[0].resolve(decodeBrickGeometry(asset));
    await flush();
    h.assertOriginals();
    assert.equal(h.statuses.at(-1).status, "fallback");
    assert.equal(h.changes.length, 0);
    assert.equal(Object.hasOwn(h.records[0].mesh, "boundingSphere"), false);
    h.controller.dispose();
  }
});
