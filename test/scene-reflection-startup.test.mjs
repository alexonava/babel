import assert from "node:assert/strict";
import test from "node:test";
import { resolveSceneModes } from "../src/scene/scene-modes.js";
import { createLegacyReflection } from "../src/scene/legacy-reflection.js";

function exercise(search, lowPower = false, disposeAt = null) {
  const counts = { targets: 0, tracked: 0, cameras: 0, captures: 0 };
  const frames = new Map();
  const surface = { material: {} }, target = { texture: {} };
  const puddles = { visible: true, children: [surface] };
  const modes = resolveSceneModes(search);
  let frameId = 0;
  const reflection = createLegacyReflection({
    enabled: !lowPower && (!modes.film || !modes.quiet),
    homeScene: { add() {} }, renderer: {}, puddles, groundY: 4,
    rendering: { trackRenderTarget(value) { assert.equal(value, target); counts.tracked++; } },
    createTarget() { counts.targets++; return target; },
    createCamera() {
      counts.cameras++;
      return {
        position: { set(x, y, z) { assert.deepEqual([x, y, z], [0, 4.5, 0]); } },
        update() { counts.captures++; assert.equal(puddles.visible, false); },
      };
    },
    requestFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelFrame(id) { frames.delete(id); },
  });
  assert.equal(counts.captures, 0, "capture must remain deferred");
  if (disposeAt === 0) reflection.dispose();
  let step = 0;
  while (frames.size) {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    callback();
    if (++step === disposeAt) reflection.dispose();
  }
  return { counts, surface, target, puddles, reflection };
}

test("quiet film startup allocates no unused reflection target or scheduled cube capture", () => {
  for (const search of ["", "?view=tower&angle=1", "?view=tree&angle=4", "?setting=plinth"]) {
    const { counts, surface } = exercise(search);
    assert.deepEqual(counts, { targets: 0, tracked: 0, cameras: 0, captures: 0 });
    assert.equal(surface.material.envMap, undefined);
  }
});

test("prior modes retain one deferred reflection capture and low quality remains disabled", () => {
  for (const search of ["?setting=previous", "?architecture=classic", "?architecture=assembled", "?view=orbit", "?cinematography=baseline"]) {
    const { counts, surface, target, puddles } = exercise(search);
    assert.deepEqual(counts, { targets: 1, tracked: 1, cameras: 1, captures: 1 });
    assert.equal(surface.material.envMap, target.texture);
    assert.equal(surface.material.envMapIntensity, 0.88);
    assert.equal(puddles.visible, true);
    assert.equal(exercise(search, true).counts.captures, 0);
  }
});

test("disposing before either deferred reflection frame prevents GPU work", () => {
  for (const step of [0, 1]) {
    const { counts, surface, reflection } = exercise("?setting=previous", false, step);
    assert.equal(counts.tracked, 1, "target remains registered for normal disposal");
    assert.equal(counts.captures, 0);
    assert.equal(surface.material.envMap, undefined);
    assert.equal(reflection.dispose(), false);
  }
});
