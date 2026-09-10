import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshLambertMaterial } from "three";

// A quiet, real-world elevation traverse gives the background hill silhouette
// an honest large-scale shape instead of another hand-tuned sine wave.
// Source: South Downs, England (Devil's Dyke area) — a circle of 48 samples,
// 1.6 km radius, centered on 50.9050 N, -0.2110 W. Retrieved 2026-09-09 via
// the public Open-Elevation API (https://api.open-elevation.com), which
// serves SRTM-derived elevation data: a NASA/USGS public-domain work, no
// attribution required. Raw meters were 22 (min) to 200 (max); normalized
// to 0..1 below.
export const HILL_PROFILE = Object.freeze([
  0.091, 0.081, 0.081, 0.09, 0.092, 0.098, 0.12, 0.151, 0.219, 0.246, 0.269, 0.281, 0.311, 0.413, 0.567,
  0.72, 0.839, 0.927, 0.858, 0.716, 0.621, 0.529, 0.415, 0.338, 0.326, 0.249, 0.199, 0.183, 0.166, 0.141,
  0.129, 0.107, 0.08, 0.057, 0.038, 0.021, 0.02, 0.029, 0.046, 0.068, 0.091, 0.1, 0.111, 0.123, 0.134,
  0.125, 0.115, 0.104,
]);
// A circular moving average (window 5) over the raw samples above removes
// sample-to-sample facets that read as sharp, un-hill-like spikes at this
// mesh's angular resolution; the large-scale rise-and-fall shape is kept.

// Two constraints fight each other here. Fog is measured camera-to-point, not
// origin-to-point: with fog.far only ~150-180 even under film's dynamic push,
// and the camera itself 20-116 units from the origin depending on shot, a
// ring placed too far out (radius 210-300, an earlier attempt sized to clear
// the terrain's own 192-unit half-extent) sits at camera-distance
// ~cameraDistance+hillRadius on the far side — routinely 250+, fully
// fog-colored and invisible. But a ring placed close enough to read against
// that fog budget risks the widest shot's camera (radius ~116) ending up
// *inside* the ring's own footprint, which renders as a solid dark wedge
// filling the frame. innerRadius here clears every shot's camera distance
// with margin; the hill is consequently subtle in most shots and closer to
// invisible in the widest ones — a genuine limit of this scene's fog budget,
// not a bug to chase further.
export const HILL = Object.freeze({
  // The six directed shots' cameras range from radius ~22 (Lantern study) to
  // ~116 (Under the branches, its widest wide-angle low shot) from the
  // origin. innerRadius must clear the farthest of those with margin, or a
  // wide shot's camera ends up standing inside the hill's own geometry.
  innerRadius: 135,
  outerRadius: 210,
  amplitude: 22,
  radialSegments: 144,
  ringSegments: 3,
  color: 0x262b39, // close to the scene's fogColor (0x2d3242) so the silhouette blends, not cuts out
});

function sampleProfile(angle) {
  const n = HILL_PROFILE.length;
  const t = (((angle / (Math.PI * 2)) % 1) + 1) % 1 * n;
  const i0 = Math.floor(t) % n,
    i1 = (i0 + 1) % n,
    f = t - Math.floor(t);
  return HILL_PROFILE[i0] * (1 - f) + HILL_PROFILE[i1] * f;
}

// A coarse ring, not a full disc: continuity at the inner radius comes from
// evaluating the same groundHeight the walkable terrain uses (helpers.js),
// blended via smoothstep out to the amplified real-elevation silhouette at
// the outer radius. Zero seam, zero extra geometry near the tower.
export function createHillGeometry({
  groundHeight,
  innerRadius = HILL.innerRadius,
  outerRadius = HILL.outerRadius,
  amplitude = HILL.amplitude,
  radialSegments = HILL.radialSegments,
  ringSegments = HILL.ringSegments,
}) {
  const cols = radialSegments + 1,
    rows = ringSegments + 1;
  const positions = new Float32Array(cols * rows * 3);
  let cursor = 0;
  for (let ring = 0; ring < rows; ring++) {
    const rt = ring / ringSegments,
      radius = innerRadius + (outerRadius - innerRadius) * rt,
      blend = rt * rt * (3 - 2 * rt);
    for (let seg = 0; seg <= radialSegments; seg++) {
      const angle = (seg / radialSegments) * Math.PI * 2,
        x = Math.cos(angle) * radius,
        z = Math.sin(angle) * radius;
      const base = groundHeight(x, z),
        peak = amplitude * sampleProfile(angle);
      positions[cursor++] = x;
      positions[cursor++] = base + (peak - base) * blend;
      positions[cursor++] = z;
    }
  }
  const indices = [];
  for (let ring = 0; ring < ringSegments; ring++) {
    for (let seg = 0; seg < radialSegments; seg++) {
      const a = ring * cols + seg,
        b = a + cols,
        c = a + 1,
        d = b + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// Unlit-adjacent by design: MeshLambertMaterial picks up the scene's existing
// ambient/hemisphere/moon lights for a faint near/far gradient, but casts and
// receives no shadow (a decorative backdrop, not a subject). Standard fog
// (material.fog defaults true) fades it into the same fogColor the terrain's
// own horizon already blends to, so the two treatments read as one horizon.
export function createHillSilhouette({ groundHeight, ...overrides } = {}) {
  const geometry = createHillGeometry({ groundHeight, ...overrides });
  const material = new MeshLambertMaterial({ color: HILL.color, side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  mesh.name = "hill-silhouette";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  let disposed = false;
  return {
    mesh,
    lifecycleOrder: 24,
    applyQuality(profile) {
      if (disposed) return false;
      mesh.visible = profile?.tier !== "low";
      return true;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      return true;
    },
  };
}
