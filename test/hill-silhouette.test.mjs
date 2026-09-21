import assert from "node:assert/strict";
import test from "node:test";
import {
  createHillGeometry,
  createHillSilhouette,
  HILL,
  HILL_PROFILE,
  ESTATE_RIDGES,
} from "../src/scene/hill-silhouette.js";

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

test("film ridges keep one indexed mesh, three distinct elevation bands and a shared terrain seam", () => {
  const geometry = createHillGeometry({ groundHeight, ...ESTATE_RIDGES, layered: true });
  const p = geometry.attributes.position,
    cols = ESTATE_RIDGES.radialSegments + 1;
  assert.ok(geometry.attributes.color);
  for (let i = 0; i < cols; i++) near(p.getY(i), groundHeight(p.getX(i), p.getZ(i)));
  for (const ring of [1, 3, 5]) {
    const values = Array.from({ length: cols }, (_, seg) => p.getY(ring * cols + seg));
    const preceding = Array.from({ length: cols }, (_, seg) => p.getY((ring - 1) * cols + seg));
    assert.ok(Math.max(...values) > Math.max(...preceding) + 2);
  }
  for (let ring = 0; ring <= ESTATE_RIDGES.ringSegments; ring++) {
    const first = ring * cols,
      last = first + cols - 1;
    near(p.getX(first), p.getX(last));
    near(p.getY(first), p.getY(last));
    near(p.getZ(first), p.getZ(last));
  }
  assert.ok(geometry.boundingSphere.radius < 300);
  geometry.dispose();
});
test("hill treatment swaps and reuses resources while restoring the original baseline", () => {
  const hill = createHillSilhouette({ groundHeight }),
    original = hill.mesh.geometry,
    material = hill.mesh.material;
  hill.setFilmTreatment(true);
  const film = hill.mesh.geometry,
    grade = hill.mesh.material;
  assert.notEqual(film, original);
  assert.notEqual(grade, material);
  assert.equal(grade.fog, false);
  hill.applyQuality({ tier: "low" });
  assert.equal(hill.mesh.visible, false);
  hill.setFilmTreatment(false);
  assert.equal(hill.mesh.geometry, original);
  assert.equal(hill.mesh.material, material);
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
