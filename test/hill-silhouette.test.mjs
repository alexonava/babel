import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { FrontSide, Group, NoBlending, PerspectiveCamera, ShaderMaterial } from "three";
import {
  createHillGeometry,
  createHillSilhouette,
  createMountainGeometry,
  HILL,
  HILL_PROFILE,
  HORIZON_HAZE,
  MOUNTAINS,
  mountainCrests,
  SNOW,
  snowReach,
} from "../src/scene/hill-silhouette.js";
import { FILM_SKY_GLSL } from "../src/scene/estate-sky.js";
import { createStarfield } from "../src/scene/starfield.js";

const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const groundHeight = (x, z) => 1.2 * Math.sin(0.05 * x) + 0.8 * Math.cos(0.04 * z);

test("the real-elevation profile is a normalized, non-trivial circular sample set", () => {
  assert.ok(HILL_PROFILE.length >= 24);
  for (const v of HILL_PROFILE) assert.ok(v >= 0 && v <= 1);
  assert.ok(Math.max(...HILL_PROFILE) > 0.5, "profile should have real relief, not a flat line");
  assert.ok(Math.min(...HILL_PROFILE) < Math.max(...HILL_PROFILE) * 0.5);
});

test("the hill ring is continuous with the walkable terrain at its inner edge and rises smoothly outward", () => {
  const geometry = createHillGeometry({ groundHeight });
  const p = geometry.attributes.position;
  const cols = HILL.radialSegments + 1;
  // Inner ring (ring 0) must sit exactly on groundHeight — the same function
  // the walkable terrain uses — so there is no seam where the two meet.
  for (let seg = 0; seg <= HILL.radialSegments; seg++) {
    const x = p.getX(seg),
      z = p.getZ(seg),
      y = p.getY(seg);
    near(y, groundHeight(x, z));
    near(Math.hypot(x, z), HILL.innerRadius, 1e-3);
  }
  // Outer ring sits at outerRadius, and every vertex on the mesh stays within
  // [innerRadius, outerRadius] — no geometry escapes the intended band.
  const outerRow = HILL.ringSegments * cols;
  for (let seg = 0; seg <= HILL.radialSegments; seg++) {
    const i = outerRow + seg;
    near(Math.hypot(p.getX(i), p.getZ(i)), HILL.outerRadius, 1e-3);
  }
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    assert.ok(r >= HILL.innerRadius - 1e-3 && r <= HILL.outerRadius + 1e-3);
  }
  geometry.dispose();
});

test("innerRadius clears the directed shots' widest camera distance with margin", () => {
  // "Under the branches", the widest low wide-angle shot, puts the camera at
  // roughly radius 116 from the origin — a camera inside the ring's own
  // footprint previously rendered as a solid dark wedge filling the frame.
  const widestShotCameraDistance = 116;
  assert.ok(HILL.innerRadius > widestShotCameraDistance * 1.1);
});

test("createHillSilhouette builds a visible, shadow-free mesh, hides it on low tier, and disposes cleanly", () => {
  const hill = createHillSilhouette({ groundHeight });
  assert.equal(hill.mesh.name, "hill-silhouette");
  assert.equal(hill.mesh.castShadow, false);
  assert.equal(hill.mesh.receiveShadow, false);
  assert.equal(hill.mesh.visible, true);
  hill.applyQuality({ tier: "high" });
  assert.equal(hill.mesh.visible, true);
  hill.applyQuality({ tier: "balanced" });
  assert.equal(hill.mesh.visible, true);
  hill.applyQuality({ tier: "low" });
  assert.equal(hill.mesh.visible, false);
  hill.applyQuality({ tier: "high" });
  assert.equal(hill.mesh.visible, true);
  let geometryDisposed = 0,
    materialDisposed = 0;
  hill.mesh.geometry.addEventListener("dispose", () => geometryDisposed++);
  hill.mesh.material.addEventListener("dispose", () => materialDisposed++);
  assert.equal(hill.dispose(), true);
  assert.equal(hill.dispose(), false);
  assert.equal(geometryDisposed, 1);
  assert.equal(materialDisposed, 1);
  assert.equal(hill.mesh.parent, null);
  // Calling applyQuality after disposal must not resurrect visibility.
  assert.equal(hill.applyQuality({ tier: "high" }), false);
});

test("custom radii and amplitude are honoured by the geometry factory", () => {
  const geometry = createHillGeometry({
    groundHeight,
    innerRadius: 40,
    outerRadius: 60,
    amplitude: 5,
    radialSegments: 16,
    ringSegments: 2,
  });
  const p = geometry.attributes.position;
  assert.equal(p.count, 17 * 3);
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    assert.ok(r >= 40 - 1e-3 && r <= 60 + 1e-3);
    assert.ok(p.getY(i) <= 5 + 1e-3);
  }
  geometry.dispose();
});

// Film mountains: crests are elevation angles in degrees per world azimuth.
const crests = mountainCrests();
const skyline = crests[0].map((_, j) => Math.max(...crests.map((range) => range[j])));
const step = 360 / MOUNTAINS.columns;
const columnOf = (azimuth) =>
  Math.round((((azimuth % 360) + 360) % 360) / step) % MOUNTAINS.columns;
function columns(from, to) {
  const out = [];
  for (let a = from; a <= to + 1e-9; a += step) out.push(columnOf(a));
  return out;
}
const highest = (profile, from, to) => Math.max(...columns(from, to).map((j) => profile[j]));
function correlation(a, b) {
  const mean = (v) => v.reduce((x, y) => x + y) / v.length,
    ma = mean(a),
    mb = mean(b);
  let ab = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += (a[i] - ma) * (b[i] - mb);
    aa += (a[i] - ma) ** 2;
    bb += (b[i] - mb) ** 2;
  }
  return ab / Math.sqrt(aa * bb);
}
const rotate = (profile, by) => profile.map((_, j) => profile[(j + by) % profile.length]);
const elevationOf = (p, i) =>
  (Math.atan2(p.getY(i), Math.hypot(p.getX(i), p.getZ(i))) * 180) / Math.PI;

test("film mountains are four camera-centred ranges in one wrapped Uint16 mesh that faces the centre", () => {
  const geometry = createMountainGeometry(crests);
  const { radii, rows, columns: n, foot } = MOUNTAINS,
    p = geometry.attributes.position,
    terrain = geometry.attributes.aTerrain,
    index = geometry.index.array,
    perRange = rows.length * n;
  assert.equal(p.count, 11520);
  assert.equal(index.length / 3, 17280);
  assert.ok(index instanceof Uint16Array);
  assert.equal(geometry.attributes.normal, undefined, "lighting is baked, so no normal ships");
  assert.equal(terrain.itemSize, 4);
  radii.forEach((radius, range) => {
    for (let j = 0; j < n; j++) {
      const crest = range * perRange + j,
        base = crest + (rows.length - 1) * n;
      near(Math.hypot(p.getX(crest), p.getZ(crest)), radius, 1e-3);
      near(elevationOf(p, crest), crests[range][j], 1e-3);
      assert.equal(terrain.getX(crest), 0);
      assert.equal(terrain.getY(crest), range);
      near(elevationOf(p, base), foot, 1e-3);
    }
    // Each range's last quad wraps to column 0: no duplicate seam column at azimuth 0.
    const last = (range * (rows.length - 1) * n + n - 1) * 6;
    assert.deepEqual(
      [...index.subarray(last, last + 6)].map((v) => v % n),
      [n - 1, n - 1, 0, n - 1, 0, 0],
    );
  });
  // Nearest range first, so early depth rejects the farther ranges.
  assert.ok(Math.max(...index.subarray(0, (rows.length - 1) * n * 6)) < perRange);
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => [
      p.getX(index[t + k]),
      p.getY(index[t + k]),
      p.getZ(index[t + k]),
    ]);
    const u = b.map((v, k) => v - a[k]),
      v = c.map((w, k) => w - a[k]);
    const nx = u[1] * v[2] - u[2] * v[1],
      nz = u[0] * v[1] - u[1] * v[0];
    assert.ok(
      nx * (a[0] + b[0] + c[0]) + nz * (a[2] + b[2] + c[2]) < 0,
      `triangle ${t / 3} faces outward`,
    );
  }
  geometry.dispose();
});

test("mountain crests keep the sun saddle, tree shots and Close-up clear and the tour peaks dramatic", () => {
  for (const [from, to, cap] of [
    [171, 183, 3],
    [22, 86, 2.1],
    [232, 280, 3],
    [-1, 8, 3.2],
  ])
    assert.ok(
      highest(skyline, from, to) <= cap,
      `${from}-${to} rises to ${highest(skyline, from, to)}`,
    );
  for (const [from, to, least] of [
    [141, 164, 7],
    [5, 17, 5.4],
    [96, 120, 4],
  ])
    assert.ok(
      highest(skyline, from, to) >= least,
      `${from}-${to} peaks at ${highest(skyline, from, to)}`,
    );
  const means = crests.map((range) => range.reduce((a, b) => a + b) / range.length);
  for (let range = 1; range < means.length; range++) assert.ok(means[range] > means[range - 1]);
  assert.ok(Math.max(...crests[0]) <= 2.5, "the near range stays low");
});

test("mountain crests never repeat around the ring, between ranges or across tour windows", () => {
  const n = MOUNTAINS.columns;
  for (const profile of [...crests, skyline])
    for (let k = 2; k <= 8; k++)
      assert.ok(correlation(profile, rotate(profile, Math.round(n / k))) < 0.5);
  for (let a = 0; a < crests.length; a++)
    for (let b = a + 1; b < crests.length; b++) assert.ok(correlation(crests[a], crests[b]) < 0.6);
  // The watch, Portrait, Lantern study and Close-up windows, 40 degrees from each left edge.
  const windows = [141.5, 68.4, 31.8, -4.6].map((from) =>
    columns(from, from + 40).map((j) => skyline[j]),
  );
  for (let a = 0; a < windows.length; a++)
    for (let b = a + 1; b < windows.length; b++)
      assert.ok(correlation(windows[a], windows[b]) < 0.5);
  let peaks = 0,
    steepest = 0;
  for (let j = 0; j < n; j++) {
    steepest = Math.max(steepest, Math.abs(skyline[(j + 1) % n] - skyline[j]) / step);
    const height = skyline[j];
    if (!(height > skyline[(j + n - 1) % n] && height >= skyline[(j + 1) % n])) continue;
    // Prominence: the drop to the higher of the two lowest cols toward a higher summit.
    const col = (direction) => {
      let low = height;
      for (let k = 1; k < n; k++) {
        const v = skyline[(j + direction * k + n) % n];
        if (v > height) return low;
        low = Math.min(low, v);
      }
      return Math.min(...skyline);
    };
    if (height - Math.max(col(-1), col(1)) >= 0.3) peaks++;
  }
  assert.ok(peaks >= 20, `${peaks} peaks with 0.3 degree prominence`);
  assert.ok(steepest >= 1.2, `crest slope reaches only ${steepest} degrees per degree`);
});

test("snow caps only the high crests of the farther ranges", () => {
  const geometry = createMountainGeometry(crests),
    p = geometry.attributes.position,
    terrain = geometry.attributes.aTerrain,
    n = MOUNTAINS.columns,
    perRange = MOUNTAINS.rows.length * n;
  // aTerrain.w carries the column's crest (0 on the near range); the shader
  // sizes the cap from it, as snowReach() does at its widest.
  const snowy = (v) => snowReach(terrain.getX(v), terrain.getW(v));
  const snowIn = (from, to) =>
    columns(from, to).some((j) => crests.some((_, range) => snowy(range * perRange + j)));
  for (let v = 0; v < terrain.count; v++) {
    const range = Math.floor(v / perRange);
    if (range === 0) assert.equal(terrain.getW(v), 0);
    else assert.equal(terrain.getW(v), Math.fround(crests[range][v % n]));
    if (crests[range][v % n] <= SNOW.line) assert.equal(snowy(v), 0, "low crests stay bare");
    if (snowy(v)) assert.ok(elevationOf(p, v) >= SNOW.line - SNOW.max * 1.35, `${v}`);
  }
  // Caps reach further down taller peaks, and never past the deepest cap.
  assert.equal(snowReach(0.5, 4), 1);
  assert.equal(snowReach(1.2, 4), 0);
  assert.equal(snowReach(2.5, 9), 1);
  assert.equal(snowReach(4.5, 20), 0);
  assert.ok(snowIn(141, 164), "The watch massif carries snow");
  assert.ok(snowIn(5, 17), "the Close-up horn carries snow");
  assert.ok(snowIn(95, 120), "the Portrait peaks carry snow");
  geometry.dispose();
});
test("hill treatment swaps and reuses resources while restoring the original baseline", () => {
  const hill = createHillSilhouette({ groundHeight }),
    original = hill.mesh.geometry,
    material = hill.mesh.material;
  assert.equal(hill.mesh.frustumCulled, true);
  assert.equal(hill.mesh.renderOrder, 0);
  hill.setFilmTreatment(true);
  const film = hill.mesh.geometry,
    grade = hill.mesh.material;
  assert.notEqual(film, original);
  assert.notEqual(grade, material);
  assert.ok(grade instanceof ShaderMaterial);
  assert.equal(grade.fog, true);
  // Transparent with no blending: drawn after the stars, writing colour and depth layer exactly.
  assert.equal(grade.transparent, true);
  assert.equal(grade.blending, NoBlending);
  assert.equal(grade.depthWrite, true);
  assert.equal(grade.depthTest, true);
  assert.equal(grade.side, FrontSide);
  assert.equal(
    hill.mesh.frustumCulled,
    false,
    "the ranges follow the camera; world bounds never apply",
  );
  assert.equal(hill.mesh.renderOrder, MOUNTAINS.renderOrder);
  hill.applyQuality({ tier: "low" });
  assert.equal(hill.mesh.visible, false);
  hill.setFilmTreatment(false);
  assert.equal(hill.mesh.geometry, original);
  assert.equal(hill.mesh.material, material);
  assert.equal(hill.mesh.frustumCulled, true);
  assert.equal(hill.mesh.renderOrder, 0);
  hill.setFilmTreatment(true);
  assert.equal(hill.mesh.geometry, film);
  assert.equal(hill.mesh.material, grade);
  assert.equal(hill.mesh.visible, false, "treatment must not undo low-quality hiding");
  hill.applyQuality({ tier: "balanced" });
  assert.equal(hill.mesh.visible, true);
  assert.equal(hill.mesh.geometry, film);
  let count = 0;
  for (const resource of [original, material, film, grade])
    resource.addEventListener("dispose", () => count++);
  hill.dispose();
  hill.dispose();
  assert.equal(count, 4);
  assert.equal(hill.setFilmTreatment(true), false);
});

test("the mountain shader rides the camera, hazes toward the film sky and writes the mountains' layer", () => {
  const hill = createHillSilhouette({
    groundHeight,
    skyRadius: 130,
    shellOpacity: 0.52,
    sunPosition: [-85, 55, -14],
  });
  hill.setFilmTreatment(true);
  const material = hill.mesh.material;
  assert.match(material.vertexShader, /cameraPosition\s*\+\s*position/);
  assert.ok(material.fragmentShader.includes(FILM_SKY_GLSL));
  assert.match(material.fragmentShader, /fwidth\(vT\.x\)/);
  assert.equal(material.extensions.derivatives, true);
  assert.doesNotMatch(material.fragmentShader + material.vertexShader, /sampler2D|texture2D/);
  assert.match(material.fragmentShader, /gl_FragColor=vec4\(c,0\.3333\);\s*}$/);
  // The feet haze to the fog colour over the ground's own horizon distances.
  assert.ok(
    material.fragmentShader.includes(`smoothstep(${HORIZON_HAZE.near}.,${HORIZON_HAZE.far}.,vD)`),
  );
  assert.equal(material.uniforms.uSky.value.x, 130 * 130);
  assert.equal(material.uniforms.uSky.value.y, 0.52);
  assert.deepEqual(material.uniforms.uSun.value.toArray(), [-85, 55, -14]);
  for (const name of ["fogColor", "fogNear", "fogFar"]) assert.ok(material.uniforms[name]);
  hill.dispose();
});

test("stars draw after the sky and before the mountains, which stay inside the far plane", async () => {
  const stars = createStarfield({
    parent: new Group(),
    camera: new PerspectiveCamera(),
    profile: { tier: "high" },
  });
  assert.ok(stars.root.renderOrder > -1 && stars.root.renderOrder < MOUNTAINS.renderOrder);
  assert.ok(MOUNTAINS.renderOrder < 0);
  stars.dispose();
  const window = { BabelSite: {} };
  vm.runInNewContext(await readFile(new URL("../src/scene/world.js", import.meta.url), "utf8"), {
    window,
  });
  const far = window.BabelSite.scene.WORLD.CAMERA_FAR,
    geometry = createMountainGeometry(crests),
    p = geometry.attributes.position;
  assert.ok(MOUNTAINS.radii.at(-1) * 1.03 < far);
  let farthest = 0;
  for (let i = 0; i < p.count; i++)
    farthest = Math.max(farthest, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)));
  assert.ok(farthest * 1.03 < far, `a crest reaches ${farthest}`);
  // The ground is fully hazed before the near range rises out of it.
  assert.ok(HORIZON_HAZE.far <= MOUNTAINS.radii[0] * MOUNTAINS.rows[2]);
  geometry.dispose();
});
