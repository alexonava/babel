import { resolveSceneModes } from "./scene-modes.js";
import { Box3, Vector3 } from "three";

export function wantsFilmTreatment(search = "") {
  return resolveSceneModes(search).film;
}

// Heights and focal widths are proportions of the selected authored subject.
// Detail shots intentionally crop incidental roof/canopy geometry; fitting the
// entire horizontal slice would turn every portrait detail into a wide shot.
export const DIRECTED_SHOTS = {
  tower: [
    {
      name: "The watch",
      region: [0.55, 1],
      fov: 32,
      azimuth: -4,
      height: 0.66,
      arc: 2,
      portrait: { region: [0.62, 1], targetHeight: 1.11 },
    },
    {
      name: "Threshold",
      region: [0.34, 0.69],
      fov: 36,
      azimuth: 82,
      height: 0.33,
      arc: 2,
      focus: { width: 0.3, depth: [0.06, 0.34] },
      margin: 0.91,
      portrait: { focus: { width: 0.22, depth: [0.06, 0.34] } },
    },
    {
      name: "Masonry study",
      tour: false, // Retain its comparison URL without including it in the tour.
      region: [0.26, 0.53],
      fov: 32,
      azimuth: 44,
      height: 0.39,
      arc: 1,
      focus: { width: 0.2, depth: [0.13, 0.36] },
      margin: 0.91,
      portrait: { focus: { width: 0.16, depth: [0.13, 0.36] } },
    },
    {
      name: "Gallery detail",
      region: [0.55, 0.79],
      fov: 31,
      azimuth: -8,
      height: 0.58,
      arc: 1,
      focus: { width: 0.27, depth: [0.13, 0.41] },
      margin: 0.91,
      portrait: { focus: { width: 0.2, depth: [0.13, 0.41] } },
    },
  ],
  tree: [
    { name: "Portrait", region: [0, 1], fov: 36, azimuth: -77, height: 0.24, arc: 4, margin: 0.93 },
    {
      name: "Lantern study",
      subject: "tree-lantern",
      region: [0, 1],
      fov: 34,
      azimuth: -115,
      height: 0.62,
      arc: 2,
      margin: 0.7,
    },
    {
      name: "Close-up",
      region: [0.28, 0.46],
      fov: 30,
      azimuth: -155,
      height: 0.32,
      arc: 2,
      focus: { width: 0.23, depth: [-0.09, 0.14] },
      margin: 0.91,
      portrait: { focus: { width: 0.16, depth: [-0.09, 0.14] } },
    },
    {
      name: "Root and lantern",
      region: [0, 0.16],
      fov: 32,
      azimuth: -115,
      height: 0.16,
      arc: 1,
      focus: { width: 0.3, depth: [-0.1, 0.32] },
      margin: 0.91,
      portrait: { focus: { width: 0.25, depth: [-0.1, 0.32] } },
    },
  ],
};

export function resolveDirectedShot(shot, width, height) {
  return shot.portrait && (width < 600 || height > width) ? { ...shot, ...shot.portrait } : shot;
}

// Clip each triangle against the directed volume, retaining intersections rather
// than discarding large triangles whose vertices lie outside the crop. The same
// world-space points drive the fit and its regression checks on both asset tiers.
export function measureShot(root, shot) {
  root.updateWorldMatrix(true, true);
  const subject =
    (shot.subject && root.getObjectByName(shot.subject)) ||
    root.getObjectByName("meshy-tree") ||
    root;
  const box = new Box3();
  // Derived leaf accents are children of the authored tree so they inherit its
  // scale. They must not enlarge either the focal bounds or the clipped fit.
  subject.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible || mesh.userData.excludeFromShot) return;
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  });
  const height = box.max.y - box.min.y;
  if (!Number.isFinite(height) || height <= 0) throw new Error("Empty cinematic subject");
  const lo = box.min.y + height * shot.region[0];
  const hi = box.min.y + height * shot.region[1];
  const center = box.getCenter(new Vector3());
  const yaw = (shot.azimuth * Math.PI) / 180;
  const right = new Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
  const front = new Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const planes = [
    { normal: new Vector3(0, 1, 0), limit: hi },
    { normal: new Vector3(0, -1, 0), limit: -lo },
  ];
  if (shot.focus) {
    const halfWidth = (shot.focus.width * height) / 2;
    planes.push(
      { normal: right, limit: center.dot(right) + halfWidth },
      { normal: right.clone().negate(), limit: -center.dot(right) + halfWidth },
      { normal: front, limit: center.dot(front) + shot.focus.depth[1] * height },
      { normal: front.clone().negate(), limit: -center.dot(front) - shot.focus.depth[0] * height },
    );
  }
  const points = [],
    region = new Box3();
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  // A selected prop is measured on its own. Other shots include surrounding
  // meshes within the volume (notably the lantern in Root and lantern).
  const traversalRoot = shot.subject ? subject : root;
  traversalRoot.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible || mesh.userData.excludeFromShot) return;
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
      let polygon = vertices;
      for (const { normal, limit } of planes) {
        const clipped = [];
        for (let j = 0; j < polygon.length; j++) {
          const p = polygon[j],
            q = polygon[(j + 1) % polygon.length];
          const d = p.dot(normal) - limit,
            next = q.dot(normal) - limit;
          if (d <= 0) clipped.push(p);
          if ((d < 0 && next > 0) || (d > 0 && next < 0))
            clipped.push(p.clone().lerp(q, d / (d - next)));
        }
        polygon = clipped;
        if (!polygon.length) break;
      }
      for (const p of polygon) {
        points.push(p.x, p.y, p.z);
        region.expandByPoint(p);
      }
    }
  });
  if (!points.length) throw new Error("Empty cinematic focal region");
  const target = region.getCenter(new Vector3());
  target.y = box.min.y + height * (shot.targetHeight ?? (shot.region[0] + shot.region[1]) / 2);
  return {
    points: new Float32Array(points),
    target,
    cameraY: box.min.y + shot.height * height,
    footing: box.min.y,
    groundAnchor: subject.getWorldPosition(new Vector3()),
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
      data[i] = -si * x + co * z;
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
