import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, Vector3 } from "three";
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
function harness({ tier = "high", disabled = false, failSecondMaterial = false } = {}) {
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
  }));
  const requests = [],
    statuses = [],
    changes = [];
  const controller = createBrickDetailController({
    profile: { tier },
    disabled,
    records,
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
