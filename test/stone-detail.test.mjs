import assert from "node:assert/strict";
import test from "node:test";
import {
  createStoneDetailController,
  paintStoneCell,
  STONE_DETAIL_SETTINGS,
} from "../src/scene/stone-detail.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));
function harness({ tier = "high", disabled = false, failApply = false } = {}) {
  const requests = [],
    applied = [],
    resets = [],
    statuses = [];
  const controller = createStoneDetailController({
    profile: { tier },
    disabled,
    apply(sources) {
      applied.push(sources);
      if (failApply) throw new Error("canvas upload failed");
    },
    reset(options) {
      resets.push(options);
    },
    report(status) {
      statuses.push(status);
    },
    loadImage(url, { signal }) {
      let resolve, reject;
      const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      requests.push({ url, signal, resolve, reject });
      return promise;
    },
  });
  function image(size = 1024) {
    return {
      width: size,
      height: size,
      closed: 0,
      close() {
        this.closed += 1;
      },
    };
  }
  return { controller, requests, applied, resets, statuses, image };
}

test("stone detail makes no requests for low tier or explicit procedural comparison", () => {
  for (const options of [{ tier: "low" }, { tier: "high", disabled: true }, { tier: "unknown" }]) {
    const h = harness(options);
    assert.equal(h.requests.length, 0);
    assert.equal(h.statuses.at(-1).status, "procedural");
    h.controller.dispose();
  }
});

test("stone detail applies the matched color and roughness pair atomically and releases decoded images", async () => {
  const h = harness();
  const color = h.image(),
    roughness = h.image();
  assert.deepEqual(
    h.requests.map((r) => r.url),
    ["/images/materials/stone-color-1024.webp", "/images/materials/stone-roughness-1024.webp"],
  );
  h.requests[0].resolve(color);
  await flush();
  assert.equal(h.applied.length, 0);
  h.requests[1].resolve(roughness);
  await flush();
  assert.equal(h.applied.length, 1);
  assert.equal(h.applied[0].color, color);
  assert.equal(h.applied[0].roughness, roughness);
  assert.equal(color.closed, 1);
  assert.equal(roughness.closed, 1);
  assert.equal(h.statuses.at(-1).status, "ready");
  assert.equal(h.controller.applyQuality({ tier: "high" }), false);
  assert.equal(h.requests.length, 2);
  h.controller.dispose();
  assert.deepEqual(h.resets, [{ disposing: true }]);
});

test("failed companion map keeps the procedural surface and closes the decoded image", async () => {
  const h = harness();
  const color = h.image();
  h.requests[0].resolve(color);
  h.requests[1].reject(new Error("404"));
  await flush();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.applied.length, 0);
  assert.equal(h.resets.length, 0);
  assert.equal(color.closed, 1);
  assert.equal(h.statuses.at(-1).status, "fallback");
  h.controller.dispose();
});

test("wrong image dimensions fail safely and a canvas failure restores procedural painting", async () => {
  for (const failApply of [false, true]) {
    const h = harness({ failApply });
    const images = [h.image(failApply ? 1024 : 256), h.image()];
    images.forEach((image, i) => h.requests[i].resolve(image));
    await flush();
    assert.equal(h.statuses.at(-1).status, "fallback");
    assert.equal(h.applied.length, failApply ? 1 : 0);
    assert.equal(h.resets.length, failApply ? 1 : 0);
    assert.ok(images.every((image) => image.closed === 1));
    h.controller.dispose();
  }
});

test("quality downgrade cancels high assets, ignores late completion, and selects the balanced pair", async () => {
  const h = harness();
  h.controller.applyQuality({ tier: "balanced" });
  assert.ok(h.requests.slice(0, 2).every((r) => r.signal.aborted));
  assert.ok(h.requests.slice(2).every((r) => r.url.endsWith("-512.webp")));
  const stale = [h.image(), h.image()];
  stale.forEach((image, i) => h.requests[i].resolve(image));
  await flush();
  assert.equal(h.applied.length, 0);
  assert.ok(stale.every((image) => image.closed === 1));
  h.requests.slice(2).forEach((request) => request.resolve(h.image(512)));
  await flush();
  assert.equal(h.applied.length, 1);
  assert.equal(h.applied[0].tier, "balanced");
  h.controller.applyQuality({ tier: "low" });
  assert.deepEqual(h.resets, [{ disposing: false }]);
  assert.equal(h.statuses.at(-1).status, "procedural");
  assert.equal(h.requests.length, 4);
  h.controller.dispose();
});

test("disposing an in-flight layer prevents late canvas mutation and closes both images", async () => {
  const h = harness();
  assert.equal(h.controller.dispose(), true);
  assert.equal(h.controller.dispose(), false);
  assert.equal(h.controller.applyQuality({ tier: "balanced" }), false);
  assert.ok(h.requests.every((r) => r.signal.aborted));
  const images = [h.image(), h.image()];
  images.forEach((image, i) => h.requests[i].resolve(image));
  await flush();
  assert.equal(h.applied.length, 0);
  assert.equal(h.resets.length, 0);
  assert.ok(images.every((image) => image.closed === 1));
});

test("brick detail uses matching source crops within the stone cell and leaves context state balanced", () => {
  const operations = [];
  const context = (kind) => ({
    save() {
      operations.push([kind, "save"]);
    },
    restore() {
      operations.push([kind, "restore"]);
    },
    scale(...args) {
      operations.push([kind, "scale", ...args]);
    },
    drawImage(...args) {
      operations.push([kind, "draw", ...args]);
    },
  });
  const colorCtx = context("color"),
    roughnessCtx = context("roughness");
  const sources = {
    color: { width: 1024, height: 1024 },
    roughness: { width: 1024, height: 1024 },
  };
  paintStoneCell({
    colorCtx,
    roughnessCtx,
    sources,
    cell: { x: 7, y: 9, width: 31, height: 47 },
    sample: { x: 0.2, y: 0.7 },
    scale: 0.5,
  });
  const draws = operations.filter((op) => op[1] === "draw");
  assert.equal(draws[0][2], sources.color);
  assert.equal(draws[1][2], sources.roughness);
  assert.deepEqual(draws[0].slice(3), draws[1].slice(3));
  assert.deepEqual(draws[0].slice(-4), [7, 9, 31, 47]);
  assert.equal(colorCtx.globalCompositeOperation, "soft-light");
  assert.equal(colorCtx.globalAlpha, STONE_DETAIL_SETTINGS.colorStrength);
  for (const kind of ["color", "roughness"]) {
    assert.deepEqual(
      operations.filter((op) => op[0] === kind).map((op) => op[1]),
      kind === "color" ? ["save", "draw", "restore"] : ["save", "scale", "draw", "restore"],
    );
  }
});
