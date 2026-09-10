import { Box3, Vector3 } from "three";

export function wantsFilmTreatment(search = "") {
  const q = new URLSearchParams(search);
  return (
    !["classic", "assembled"].includes(q.get("architecture")) &&
    q.get("setting") !== "previous" &&
    q.get("view") !== "orbit" &&
    q.get("cinematography") !== "baseline"
  );
}

export const DIRECTED_SHOTS = {
  tower: [
    // Arrival: the full tower and footing from a slightly lower eye, so it looms.
    { name: "Arrival", region: [0, 1], fov: 38, azimuth: -6, height: 0.34, arc: 4 },
    // The watch: camera just below the gallery, looking up at balcony and roof.
    { name: "The watch", region: [0.55, 1], fov: 32, azimuth: -40, height: 0.66, arc: 2 },
    // Threshold: low and close at the entrance; buttresses and earth contact.
    { name: "Threshold", region: [0, 0.45], fov: 36, azimuth: 72, height: 0.12, arc: 2 },
    // Masonry study: an eye-level section of the wall, framed as a person
    // would encounter it on approach. It keeps enough depth to show stone
    // scale and joints without reading as a texture swatch.
    { name: "Masonry study", region: [0.22, 0.58], fov: 32, azimuth: 44, height: 0.42, arc: 1, margin: 0.96 },
    // Gallery detail: the timber brackets and balcony rail in a human-scale
    // view. The small arc preserves the roofline and shadow rhythm.
    { name: "Gallery detail", region: [0.6, 0.84], fov: 30, azimuth: -26, height: 0.7, arc: 1, margin: 0.96 },
  ],
  // Tree shots use a tighter 0.93 fit margin (vs. the 0.85 default) so the
  // tree reads closer and more intimate in frame; tower shots keep the
  // default spacing.
  tree: [
    // Lower and tighter than before so the tree looms the way Arrival's
    // tower does, instead of just sitting centered in frame.
    { name: "Portrait", region: [0, 1], fov: 36, azimuth: -77, height: 0.24, arc: 4, margin: 0.93 },

    {
      name: "Lantern study",
      widthBelow: 0.25,
      region: [0, 0.5],
      fov: 34,
      // Was -145 (=215 deg), almost exactly on the shadow's throw azimuth
      // (~204 deg from the sun rig), putting the cast shadow between camera
      // and trunk in this shot's close, low framing. Rotated off that line.
      azimuth: -115,
      height: 0.15,
      arc: 2,
      margin: 0.93,
    },
    // Close-up: was near-identical to Lantern study (low, close, trunk base
    // and roots). Recomposed around a different idea instead: a tight,
    // committed look at the trunk fork and lower canopy, away from ground
    // level entirely (no roots, no lantern) so it doesn't repeat Lantern
    // study's subject. A narrow region keeps it genuinely close, not a
    // second wide shot. widthBelow anchors horizontal fitting to the trunk
    // fork rather than the much wider upper canopy spread, so narrow phone
    // screens don't back the camera off into another full-tree shot.
    // Azimuth kept off the ~204 deg shadow-throw line established for
    // Lantern study above.
    {
      name: "Close-up",
      widthBelow: 0.45,
      region: [0.35, 0.65],
      fov: 30,
      azimuth: -40,
      height: 0.5,
      arc: 2,
      margin: 0.95,
    },
    // Root and lantern: the immediate arrival-scale view. It includes the
    // whole lantern with trunk flare and roots, avoiding a detached glowing prop.
    {
      name: "Root and lantern",
      widthBelow: 0.34,
      region: [0, 0.3],
      fov: 32,
      azimuth: -98,
      height: 0.17,
      arc: 1,
      margin: 0.97,
    },

  ],
};

// Clip triangles at the framing region's two horizontal planes. This retains
// real roof/canopy outlines, including the lantern, without an inflated AABB.
// The controller caches this work until an asset or its world transform changes.
export function measureShot(root, shot) {
  root.updateWorldMatrix(true, true);
  const subject = root.getObjectByName("meshy-tree") || root;
  const box = new Box3().setFromObject(subject);
  const height = box.max.y - box.min.y;
  const lo = box.min.y + height * shot.region[0];
  const hi = box.min.y + height * shot.region[1];
  const points = [],
    region = new Box3();
  const push = (p) => {
    points.push(p.x, p.y, p.z);
    region.expandByPoint(p);
  };
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    cross = new Vector3();
  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible) return;
    const position = mesh.geometry.attributes.position,
      index = mesh.geometry.index;
    if (!position) return;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      const vertices = [a, b, c];
      vertices.forEach((p, k) =>
        p
          .fromBufferAttribute(position, index ? index.getX(i + k) : i + k)
          .applyMatrix4(mesh.matrixWorld),
      );
      for (let j = 0; j < 3; j++) {
        const p = vertices[j],
          q = vertices[(j + 1) % 3];
        if (p.y >= lo && p.y <= hi) push(p);
        for (const y of [lo, hi]) {
          if ((p.y < y && q.y > y) || (p.y > y && q.y < y)) {
            cross.copy(p).lerp(q, (y - p.y) / (q.y - p.y));
            push(cross);
          }
        }
      }
    }
  });
  if (!points.length || !Number.isFinite(height) || height <= 0)
    throw new Error("Empty cinematic subject");
  const target = region.getCenter(new Vector3());
  target.y = (lo + hi) / 2;
  return {
    points: new Float32Array(points),
    target,
    cameraY: box.min.y + shot.height * height,
    footing: box.min.y,
    widthMaxY: shot.widthBelow === undefined ? Infinity : box.min.y + shot.widthBelow * height,
    height,
    region,
    radius: region.getSize(new Vector3()).length() / 2,
  };
}

export function fitShot(measured, shot, area, width, height) {
  const tan = Math.tan((shot.fov * Math.PI) / 360),
    aspect = width / height,
    margin = shot.margin ?? 0.85;
  const maxX = ((tan * aspect * area.width) / width) * margin;
  const maxY = ((tan * area.height) / height) * margin;
  const dy = measured.cameraY - measured.target.y;
  const projected = [];
  for (const offset of [-shot.arc, 0, shot.arc]) {
    const yaw = ((shot.azimuth + offset) * Math.PI) / 180,
      co = Math.cos(yaw),
      si = Math.sin(yaw);
    const data = new Float32Array(measured.points.length);
    for (let i = 0; i < data.length; i += 3) {
      const x = measured.points[i] - measured.target.x,
        y = measured.points[i + 1] - measured.target.y,
        z = measured.points[i + 2] - measured.target.z;
      // Incidental low foliage may crop in the lantern study; its width is
      // directed by roots/trunk and the complete lantern, not canopy fragments.
      data[i] = measured.points[i + 1] <= measured.widthMaxY ? -si * x + co * z : 0;
      data[i + 1] = y;
      data[i + 2] = co * x + si * z;
    }
    projected.push(data);
  }
  const fits = (distance) => {
    const length = Math.hypot(distance, dy),
      c = distance / length,
      s = dy / length;
    for (const points of projected)
      for (let i = 0; i < points.length; i += 3) {
        const depth = length - points[i + 2] * c - points[i + 1] * s;
        if (
          depth <= 0.1 ||
          Math.abs(points[i]) > maxX * depth ||
          Math.abs(points[i + 1] * c - points[i + 2] * s) > maxY * depth
        )
          return false;
      }
    return true;
  };
  let lo = 0.1,
    hi = Math.max(20, measured.height * 3);
  while (!fits(hi) && hi < 4096) hi *= 2;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return { distance: hi, radius: measured.radius, region: measured.region, area };
}
