import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import {
  ARCHITECTURE_ASSET_BUDGETS,
  ARCHITECTURE_ASSET_URLS,
  createArchitectureAssetController,
  loadArchitectureAsset,
} from "../src/scene/architecture-assets.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));
const towerRoles = ["stairs", "wall", "base", "crown"];
function asset(name, events = []) {
  const counts = { geometry: 0, material: 0, color: 0, roughness: 0, bitmap: 0 };
  const bitmap = {
    close() {
      counts.bitmap += 1;
      events.push(`${name}:bitmap`);
    },
  };
  const geometry = new BoxGeometry();
  const material = new MeshStandardMaterial();
  const color = new Texture(bitmap);
  const roughness = new Texture(bitmap);
  material.map = color;
  material.roughnessMap = roughness;
  for (const [kind, resource] of Object.entries({ geometry, material, color, roughness })) {
    resource.addEventListener("dispose", () => {
      counts[kind] += 1;
      events.push(`${name}:${kind}`);
    });
  }
  const scene = new Group();
  scene.add(new Mesh(geometry, material), new Mesh(geometry, [material, material]));
  return { scene, scenes: [scene], counts, geometry, material, color, roughness, bitmap };
}
function harness(options = {}) {
  const requests = [],
    statuses = [],
    towerReady = [],
    treeReady = [],
    events = [];
  const controller = createArchitectureAssetController({
    ...options,
    loadAsset(url, { signal, tier, role }) {
      let resolve, reject;
      const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      requests.push({ url, signal, tier, role, resolve, reject });
      return promise;
    },
    onStatus(status) {
      statuses.push(status);
    },
    onTowerReady(assets, context) {
      towerReady.push({ assets, context });
      events.push("tower:ready");
      if (options.failTowerReady) throw new Error("assembly failed");
      return () => {
        events.push("tower:cleanup");
      };
    },
    onTreeReady(assets, context) {
      treeReady.push({ assets, context });
      events.push("tree:ready");
      return () => {
        events.push("tree:cleanup");
      };
    },
    onRestoreTower() {
      events.push("tower:restore");
      if (options.failTowerRestore) throw new Error("restoration failed");
    },
    onRestoreTree() {
      events.push("tree:restore");
    },
  });
  return { controller, requests, statuses, towerReady, treeReady, events };
}
function request(h, role, tier = "high") {
  return h.requests.findLast((record) => record.role === role && record.tier === tier);
}
function complete(h, roles = [...towerRoles, "tree"], tier = "high") {
  return roles.map((role) => {
    const parsed = asset(`${tier}-${role}`, h.events);
    request(h, role, tier).resolve(parsed);
    return parsed;
  });
}
function assertReleased(parsed, expected = 1) {
  assert.deepEqual(Object.values(parsed.counts), Array(5).fill(expected));
}

test("architecture requests require live high/balanced quality and repeated state does not reload", async () => {
  for (const options of [{ disabled: true }, {}]) {
    const h = harness(options);
    h.controller.setQuality({ tier: "high" });
    h.controller.applyQuality({ tier: "balanced" });
    assert.equal(h.requests.length, 0);
    h.controller.setQuality({ tier: "low" }, true);
    h.controller.setQuality({ tier: "unknown" }, true);
    assert.equal(h.requests.length, 0);
    h.controller.setQuality({ tier: "high" }, true);
    assert.equal(h.requests.length, options.disabled ? 0 : 5);
    h.controller.applyQuality({ tier: "high" });
    h.controller.setLive(true);
    assert.equal(h.requests.length, options.disabled ? 0 : 5);
    h.controller.dispose();
  }
});

test("four tower roles commit atomically while the tree can become ready independently", async () => {
  const h = harness();
  h.controller.setQuality({ tier: "high" }, true);
  const partial = complete(h, ["stairs", "base", "crown", "tree"]);
  await flush();
  assert.equal(h.towerReady.length, 0);
  assert.equal(h.treeReady.length, 1);
  assert.equal(h.treeReady[0].context.tier, "high");
  partial.forEach((parsed) => assertReleased(parsed, 0));
  const [wall] = complete(h, ["wall"]);
  await flush();
  assert.equal(h.towerReady.length, 1);
  assert.deepEqual(Object.keys(h.towerReady[0].assets).sort(), [...towerRoles].sort());
  assert.equal(h.towerReady[0].assets.wall, wall);
  assert.deepEqual(
    h.statuses.filter((s) => s.status === "ready").map((s) => s.kind),
    ["tree", "tower"],
  );
  h.controller.dispose();
  [...partial, wall].forEach((parsed) => assertReleased(parsed));
});

test("one failed tower role aborts its batch, releases partial and late assets, and leaves the tree ready", async () => {
  const h = harness();
  h.controller.setQuality({ tier: "high" }, true);
  const [stairs, tree] = complete(h, ["stairs", "tree"]);
  await flush();
  request(h, "wall").reject(new Error("404"));
  await flush();
  assert.equal(h.towerReady.length, 0);
  assertReleased(stairs);
  assertReleased(tree, 0);
  assert.ok(towerRoles.every((role) => request(h, role).signal.aborted));
  assert.equal(request(h, "tree").signal.aborted, false);
  assert.equal(h.statuses.findLast((s) => s.kind === "tower").status, "fallback");
  const late = complete(h, ["base", "crown"]);
  await flush();
  late.forEach((parsed) => assertReleased(parsed));
  h.controller.applyQuality({ tier: "high" });
  assert.equal(h.requests.length, 5);
  h.controller.dispose();
  assertReleased(tree);
  assertReleased(stairs);
});

test("tree failure is independent and a controlled tier change retries each role once", async () => {
  const h = harness();
  h.controller.setQuality({ tier: "high" }, true);
  const tower = complete(h, towerRoles);
  request(h, "tree").reject(new Error("image unavailable"));
  await flush();
  assert.equal(h.towerReady.length, 1);
  assert.equal(h.treeReady.length, 0);
  assert.equal(h.statuses.findLast((s) => s.kind === "tree").status, "fallback");
  for (let index = 0; index < 4; index += 1) h.controller.applyQuality({ tier: "high" });
  assert.equal(h.requests.length, 5);
  h.controller.applyQuality({ tier: "balanced" });
  assert.equal(h.requests.length, 10);
  tower.forEach((parsed) => assertReleased(parsed));
  assert.ok(h.events.indexOf("tower:restore") < h.events.indexOf("tower:cleanup"));
  assert.ok(h.events.indexOf("tower:cleanup") < h.events.indexOf("high-stairs:geometry"));
  const balanced = complete(h, [...towerRoles, "tree"], "balanced");
  await flush();
  assert.equal(h.towerReady.length, 2);
  assert.equal(h.treeReady.length, 1);
  h.controller.dispose();
  balanced.forEach((parsed) => assertReleased(parsed));
});

test("stale high-quality parses cannot replace or free a newer balanced assembly", async () => {
  const h = harness();
  h.controller.setQuality({ tier: "high" }, true);
  const oldRequests = h.requests.slice();
  h.controller.applyQuality({ tier: "balanced" });
  assert.ok(oldRequests.every(({ signal }) => signal.aborted));
  const current = complete(h, [...towerRoles, "tree"], "balanced");
  await flush();
  const stale = complete(h);
  await flush();
  stale.forEach((parsed) => assertReleased(parsed));
  current.forEach((parsed) => assertReleased(parsed, 0));
  assert.equal(h.towerReady.length, 1);
  assert.equal(h.towerReady[0].context.tier, "balanced");
  assert.equal(h.treeReady.length, 1);
  h.controller.dispose();
  current.forEach((parsed) => assertReleased(parsed));
});

test("low quality or closing the live gate restores before disposal and ignores later completion", async () => {
  for (const action of ["low", "gate", "dispose"]) {
    const h = harness();
    h.controller.setQuality({ tier: "high" }, true);
    const [tree] = complete(h, ["tree"]);
    await flush();
    if (action === "low") h.controller.applyQuality({ tier: "low" });
    else if (action === "gate") h.controller.setLive(false);
    else h.controller.dispose();
    assertReleased(tree);
    assert.ok(h.events.indexOf("tree:restore") < h.events.indexOf("tree:cleanup"));
    assert.ok(h.events.indexOf("tree:cleanup") < h.events.indexOf("high-tree:geometry"));
    const pending = complete(h, towerRoles);
    await flush();
    pending.forEach((parsed) => assertReleased(parsed));
    assert.equal(h.towerReady.length, 0);
    if (action !== "dispose") assert.equal(h.controller.dispose(), true);
    assert.equal(h.controller.dispose(), false);
    assert.equal(h.controller.setLive(true), false);
    assert.equal(h.controller.applyQuality({ tier: "high" }), false);
    assertReleased(tree);
  }
});

test("shared scene resources dispose once and shared images close after all texture disposals", async () => {
  const h = harness();
  h.controller.setQuality({ tier: "high" }, true);
  const shared = asset("shared", h.events);
  request(h, "stairs").resolve(shared);
  request(h, "tree").resolve(shared);
  await flush();
  request(h, "wall").reject(new Error("404"));
  await flush();
  assertReleased(shared, 0);
  const remaining = complete(h, ["base", "crown"]);
  await flush();
  remaining.forEach((parsed) => assertReleased(parsed));
  h.controller.dispose();
  assertReleased(shared);
  assert.ok(h.events.indexOf("tree:restore") < h.events.indexOf("shared:geometry"));
  assert.ok(h.events.indexOf("shared:color") < h.events.indexOf("shared:bitmap"));
  assert.ok(h.events.indexOf("shared:roughness") < h.events.indexOf("shared:bitmap"));
});

test("assembly callback failure restores and frees tower assets without breaking the tree", async () => {
  const h = harness({ failTowerReady: true, failTowerRestore: true });
  h.controller.setQuality({ tier: "high" }, true);
  const parsed = complete(h);
  await flush();
  parsed.slice(0, 4).forEach((model) => assertReleased(model));
  assertReleased(parsed[4], 0);
  assert.equal(h.statuses.findLast((s) => s.kind === "tower").status, "fallback");
  assert.equal(h.statuses.findLast((s) => s.kind === "tree").status, "ready");
  h.controller.dispose();
  parsed.forEach((model) => assertReleased(model));
});

test("custom hashed URLs are used and invalid parsed assets never commit", async () => {
  const urls = {
    high: Object.fromEntries(
      [...towerRoles, "tree"].map((role) => [role, `/models/${role}.a1b2.glb`]),
    ),
  };
  const h = harness({ urls });
  h.controller.setQuality({ tier: "high" }, true);
  assert.ok(h.requests.every(({ url, role }) => url === urls.high[role]));
  const invalid = asset("invalid", h.events);
  invalid.scene.isObject3D = false;
  request(h, "stairs").resolve(invalid);
  await flush();
  assertReleased(invalid);
  assert.equal(h.towerReady.length, 0);
  assert.equal(h.statuses.findLast((s) => s.kind === "tower").status, "fallback");
  h.controller.dispose();
});

test("reopening the live gate retries failed assets once without a per-frame retry loop", async () => {
  const h = harness();
  h.controller.applyQuality({ tier: "balanced" });
  h.controller.setLive(true);
  h.requests.forEach(({ reject }) => reject(new Error("offline")));
  await flush();
  assert.equal(h.requests.length, 5);
  h.controller.setLive(true);
  assert.equal(h.requests.length, 5);
  h.controller.setLive(false);
  h.controller.setLive(true);
  assert.equal(h.requests.length, 10);
  h.controller.dispose();
});

function glb(json, binary = Buffer.alloc(0)) {
  const source = Buffer.from(JSON.stringify(json));
  const jsonLength = Math.ceil(source.length / 4) * 4;
  const binaryLength = Math.ceil(binary.length / 4) * 4;
  const buffer = Buffer.alloc(20 + jsonLength + (binary.length ? 8 + binaryLength : 0), 0x20);
  buffer.writeUInt32LE(0x46546c67, 0);
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(jsonLength, 12);
  buffer.writeUInt32LE(0x4e4f534a, 16);
  source.copy(buffer, 20);
  if (binary.length) {
    buffer.writeUInt32LE(binaryLength, 20 + jsonLength);
    buffer.writeUInt32LE(0x004e4942, 24 + jsonLength);
    binary.copy(buffer, 28 + jsonLength);
  }
  return buffer;
}

test("the real loader fetches with its abort signal and parses a self-contained static GLB", async () => {
  const previousFetch = globalThis.fetch;
  const abort = new AbortController();
  const data = glb({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }], nodes: [] });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, signal: options.signal });
    return new Response(data);
  };
  try {
    const parsed = await loadArchitectureAsset(ARCHITECTURE_ASSET_URLS.high.tree, {
      signal: abort.signal,
      tier: "high",
    });
    assert.ok(parsed.scene.isObject3D);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].signal, abort.signal);
    assert.equal(requests[0].url, "/images/architecture/tree-high.glb");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("the real loader rejects oversized, malformed, external, animated, and decoder-dependent assets", async () => {
  const previousFetch = globalThis.fetch;
  const context = { signal: new AbortController().signal, tier: "balanced" };
  const base = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }], nodes: [] };
  const cases = [
    { data: Buffer.alloc(10) },
    { data: Buffer.alloc(ARCHITECTURE_ASSET_BUDGETS.balanced + 1) },
    { data: glb({ ...base, buffers: [{ uri: "https://external.invalid/mesh.bin" }] }) },
    { data: glb({ ...base, images: [{ uri: "image.png" }] }) },
    { data: glb({ ...base, skins: [{}] }) },
    { data: glb({ ...base, animations: [{}] }) },
    { data: glb({ ...base, extensionsRequired: ["KHR_draco_mesh_compression"] }) },
    { data: glb(base), status: 404 },
    {
      data: glb(base),
      headers: { "content-length": String(ARCHITECTURE_ASSET_BUDGETS.balanced + 1) },
    },
  ];
  try {
    for (const { data, status = 200, headers } of cases) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return new Response(data, { status, headers });
      };
      await assert.rejects(loadArchitectureAsset("/test.glb", context));
      assert.equal(calls, 1, "No external dependency should be requested");
    }
    const aborted = new AbortController();
    globalThis.fetch = async () => {
      aborted.abort();
      return new Response(glb(base));
    };
    await assert.rejects(
      loadArchitectureAsset("/test.glb", { ...context, signal: aborted.signal }),
      { name: "AbortError" },
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("an embedded image failure rejects the GLB and closes other decoded images instead of committing null maps", async () => {
  const previousFetch = globalThis.fetch;
  const previousError = console.error;
  const descriptors = Object.fromEntries(
    ["self", "createImageBitmap"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const binary = Buffer.concat([
    Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer),
    Buffer.from([1, 0, 0, 0]),
    Buffer.from([2, 0, 0, 0]),
  ]);
  const data = glb(
    {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      buffers: [{ byteLength: binary.length }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 4 },
        { buffer: 0, byteOffset: 40, byteLength: 4 },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: "VEC3",
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      materials: [
        { pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, normalTexture: { index: 1 } },
      ],
      textures: [{ source: 0 }, { source: 1 }],
      images: [
        { bufferView: 1, mimeType: "image/png" },
        { bufferView: 2, mimeType: "image/png" },
      ],
    },
    binary,
  );
  let closed = 0,
    decoded = 0;
  const urls = [];
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async (blob) => {
    decoded += 1;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes[0] === 2) throw new Error("Invalid image pixels");
    return {
      width: 1,
      height: 1,
      close() {
        closed += 1;
      },
    };
  };
  globalThis.fetch = async (url, options) => {
    urls.push(url);
    return url === "/test.glb" ? new Response(data) : previousFetch(url, options);
  };
  console.error = () => {};
  try {
    await assert.rejects(
      loadArchitectureAsset("/test.glb", { tier: "high", signal: new AbortController().signal }),
      /Architecture image decode failed/,
    );
    assert.equal(decoded, 2);
    assert.equal(closed, 1);
    assert.equal(urls.filter((url) => !url.startsWith("blob:")).length, 1);
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousError;
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
