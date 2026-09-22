import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";

// Fine edge leaves are derived from the supplied canopy's surface. They share
// one draw call, have real silhouettes (no translucent sorting), and never
// change the borrowed GLB or participate in camera fitting.
export function createTreeFoliage(source, parent) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [0, 0, 0, -0.13, 0.23, 0.04, 0, 0.48, 0, 0, 0, 0, 0, 0.48, 0, 0.13, 0.23, 0.04],
      3,
    ),
  );
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({ color: 0x3c5140, roughness: 0.96, side: DoubleSide });
  const mesh = new InstancedMesh(geometry, material, 3600);
  mesh.name = "estate-canopy-leaves";
  mesh.userData.excludeFromShot = true;
  const p = source.attributes.position,
    n = source.attributes.normal,
    indices = source.index;
  // Weight by surface area so subdivisions and tiny canopy triangles do not
  // attract more leaves than equally large, simpler parts of the source mesh.
  const faceCount = Math.floor((indices ? indices.count : p.count) / 3),
    areas = new Float64Array(faceCount),
    a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  let totalArea = 0;
  for (let face = 0; face < faceCount; face++) {
    const start = face * 3;
    a.fromBufferAttribute(p, indices ? indices.getX(start) : start);
    b.fromBufferAttribute(p, indices ? indices.getX(start + 1) : start + 1);
    c.fromBufferAttribute(p, indices ? indices.getX(start + 2) : start + 2);
    const area = b.sub(a).cross(c.sub(a)).length() * 0.5;
    if (Number.isFinite(area)) totalArea += area;
    areas[face] = totalArea;
  }
  let seed = 6019,
    count = 0,
    active = false,
    disposed = false,
    tier = "high";
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const matrix = new Matrix4(),
    rotation = new Quaternion(),
    axis = new Vector3(0, 0, 1),
    point = new Vector3(),
    normal = new Vector3(),
    scale = new Vector3(),
    color = new Color();
  for (let attempt = 0; totalArea > 0 && attempt < 80000 && count < 3600; attempt++) {
    const sample = random() * totalArea;
    let low = 0,
      high = faceCount - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (sample < areas[middle]) high = middle;
      else low = middle + 1;
    }
    const face = low * 3;
    const u = Math.sqrt(random()),
      v = random(),
      weights = [1 - u, u * (1 - v), u * v];
    point.set(0, 0, 0);
    normal.set(0, 0, 0);
    for (let j = 0; j < 3; j++) {
      const i = indices ? indices.getX(face + j) : face + j,
        w = weights[j];
      point.x += p.getX(i) * w;
      point.y += p.getY(i) * w;
      point.z += p.getZ(i) * w;
      if (n) {
        normal.x += n.getX(i) * w;
        normal.y += n.getY(i) * w;
        normal.z += n.getZ(i) * w;
      }
    }
    if (point.y < 10 || Math.hypot(point.x, point.z) < 2.8) continue;
    if (n) normal.normalize();
    else
      normal
        .copy(point)
        .setY(point.y - 14)
        .normalize();
    point.addScaledVector(normal, 0.035);
    rotation.setFromUnitVectors(axis, normal);
    rotation.multiply(new Quaternion().setFromAxisAngle(axis, random() * Math.PI * 2));
    const size = 0.75 + random() * 0.85;
    matrix.compose(point, rotation, scale.set(size, size, size));
    mesh.setMatrixAt(count, matrix);
    const shade = 0.76 + random() * 0.12;
    color.setRGB(shade, shade + 0.04, shade - 0.02);
    mesh.setColorAt(count++, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = count;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  const update = () => {
    mesh.visible = active && tier !== "low" && count > 0;
    mesh.count = Math.min(count, tier === "balanced" ? 1800 : 3600);
  };
  update();
  return {
    mesh,
    setActive(value) {
      if (!disposed) {
        active = Boolean(value);
        update();
      }
    },
    applyQuality(profile = {}) {
      if (!disposed) {
        tier = profile.tier || "high";
        update();
      }
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      return true;
    },
  };
}

// Average coincident-vertex normals on a derived buffer, retaining UV splits and
// the source normals for the baseline. This softens authored polygon bands.
export function smoothTreeNormals(geometry) {
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    sums = new Map();
  const key = (i) =>
    `${Math.round(p.getX(i) * 10000)},${Math.round(p.getY(i) * 10000)},${Math.round(p.getZ(i) * 10000)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i),
      v = sums.get(k) || new Vector3();
    v.x += n.getX(i);
    v.y += n.getY(i);
    v.z += n.getZ(i);
    sums.set(k, v);
  }
  const result = n.clone();
  for (let i = 0; i < p.count; i++) {
    const v = sums.get(key(i)).normalize();
    result.setXYZ(i, v.x, v.y, v.z);
  }
  return result;
}
