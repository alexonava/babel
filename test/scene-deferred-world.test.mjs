import assert from "node:assert/strict";
import test from "node:test";
import { createDeferredWorld } from "../src/scene/deferred-world.js";
import { createSceneSubsystemRegistry } from "../src/scene/subsystem.js";

test("normal startup leaves the procedural world unconstructed and replays state on fallback", () => {
  const calls = [];
  const world = { name: "procedural" };
  const owner = createDeferredWorld(registry => {
    calls.push("construct");
    registry.register({
      applyQuality(profile) { calls.push(profile.tier); },
      resize(size) { calls.push(size.width); },
      update(frame) { calls.push(frame.elapsedSeconds); },
      dispose() { calls.push("dispose"); },
    });
    return world;
  });
  owner.applyQuality({ tier: "balanced" });
  owner.resize({ width: 390 });
  owner.update({ elapsedSeconds: 1 });
  assert.deepEqual(calls, []);
  assert.equal(owner.current, null);
  assert.equal(owner.ensure(), world);
  assert.equal(owner.ensure(), world);
  assert.deepEqual(calls, ["construct", "balanced", 390]);
  owner.update({ elapsedSeconds: 2 });
  owner.applyQuality({ tier: "low" });
  assert.deepEqual(calls.slice(-2), [2, "low"]);
  owner.dispose();
  assert.equal(owner.ensure(), null);
  assert.equal(owner.dispose(), false);
  assert.equal(calls.filter(call => call === "construct").length, 1);
});

test("an unused world cannot be created by late callbacks after disposal", () => {
  const owner = createDeferredWorld(() => assert.fail("must not construct"));
  owner.dispose();
  owner.applyQuality({ tier: "low" });
  owner.resize({ width: 1440 });
  assert.equal(owner.ensure(), null);
});

test("late fallback resources retain model-before-material-before-renderer disposal order", () => {
  const calls = [], registry = createSceneSubsystemRegistry();
  registry.register({ dispose() { calls.push("renderer"); } });
  const owner = createDeferredWorld(child => {
    child.register({ dispose() { calls.push("legacy maps"); } });
    return {};
  });
  registry.register(owner);
  registry.register({ dispose() { calls.push("model restore"); } });
  owner.ensure();
  registry.dispose();
  assert.deepEqual(calls, ["model restore", "legacy maps", "renderer"]);
});

test("construction failure cleans registered resources and never retries a partial world", () => {
  const calls = [];
  const owner = createDeferredWorld(registry => {
    registry.register({ dispose() { calls.push("disposed"); } });
    throw new Error("construction failed");
  });
  assert.throws(() => owner.ensure(), /construction failed/);
  assert.equal(owner.ensure(), null);
  owner.dispose();
  assert.deepEqual(calls, ["disposed"]);
});
