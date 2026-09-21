import assert from "node:assert/strict";
import test from "node:test";
import { resolveSceneModes } from "../src/scene/scene-modes.js";

test("current directed URLs use authored startup and preserve the default Watch view", () => {
  for (const search of ["", "?view=tower&angle=1", "?view=tree&angle=4", "?quality=balanced&qaTime=0&tour=0", "?view=unknown"]) {
    const mode = resolveSceneModes(search);
    assert.equal(mode.legacy, false);
    assert.equal(mode.architecture, true);
    assert.equal(mode.completeTower, true);
    assert.equal(mode.film, true);
    assert.equal(mode.quiet, true);
    assert.equal(mode.grounded, true);
  }
  assert.equal(resolveSceneModes().view, "tower");
  assert.equal(resolveSceneModes("?view=tree").view, "tree");
});

test("architecture and previous-setting URLs retain precedence over requested directed views", () => {
  for (const architecture of ["classic", "assembled"]) {
    const mode = resolveSceneModes(`?architecture=${architecture}&view=tree&angle=2`);
    assert.equal(mode.architecture, architecture !== "classic");
    assert.equal(mode.view, "orbit");
    for (const field of ["completeTower", "film", "quiet", "mud", "grounded", "propScale", "earthFooting"]) assert.equal(mode[field], false, field);
    assert.equal(mode.legacy, true);
  }
  const previous = resolveSceneModes("?setting=previous&view=tree");
  assert.equal(previous.view, "orbit");
  assert.equal(previous.film, false);
  assert.equal(previous.grounded, true);
  assert.equal(previous.mud, true);
});

test("individual comparison flags keep their independent material and framing behavior", () => {
  for (const [query, field] of [["view=orbit", "film"], ["cinematography=baseline", "film"], ["ground=desert", "mud"], ["ground=procedural", "mud"], ["refinement=baseline", "grounded"], ["scale=baseline", "propScale"], ["setting=plinth", "earthFooting"]]) {
    const mode = resolveSceneModes(`?${query}`);
    assert.equal(mode[field], false, query);
    assert.equal(mode.legacy, true, query);
    assert.equal(mode.completeTower, true, query);
  }
  for (const query of ["brick=boxes", "stone=procedural", "construction=baseline", "preview=marble", "architecture=unknown"]) assert.equal(resolveSceneModes(`?${query}`).legacy, true);
});
