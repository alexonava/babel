import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { REVISION } from "three";

// src/scene/rendering.js opts into r160's legacy light units through the
// private renderer._useLegacyLights flag. Later releases remove that path, so a
// routine dependency bump would silently relight the scene.
test("Three.js stays pinned to the r160 legacy-light revision", async () => {
  assert.equal(
    REVISION,
    "160",
    "three must stay at r160 until the lighting is re-reviewed without legacy light units",
  );
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(
    packageJson.devDependencies.three,
    "0.160.1",
    "an exact three version keeps installs from drifting past r160",
  );
});
