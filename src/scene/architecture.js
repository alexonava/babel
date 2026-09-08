import {
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const ARCHITECTURE = Object.freeze({
  sectors: 16,
  tiers: 8,
  height: 34,
  bottom: 1.5,
  bottomRadius: 12.2,
  topRadius: 8.8,
  stairWidth: 3.6,
  stairStart: 1.7,
  stairEnd: 33.5,
  flights: 8,
  treeHeight: 22,
});

export function towerRadius(y) {
  const ratio = Math.max(0, Math.min(1, (y - ARCHITECTURE.bottom) / ARCHITECTURE.height));
  return ARCHITECTURE.bottomRadius + (ARCHITECTURE.topRadius - ARCHITECTURE.bottomRadius) * ratio;
}

function sourceMesh(asset) {
  const meshes = [];
  asset?.scene?.updateMatrixWorld(true);
  asset?.scene?.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  if (
    meshes.length !== 1 ||
    !meshes[0].geometry?.attributes.uv ||
    !meshes[0].material?.isMaterial ||
    Array.isArray(meshes[0].material)
  ) {
    throw new Error("Architecture asset must contain one UV-mapped mesh.");
  }
  return meshes[0];
}

function editableGeometry(source) {
  const geometry = source.clone();
  // Quantized GLB attributes are compact transport data. Decode before applying
  // transforms: normalized Int16 setters cannot store world-space coordinates.
  for (const name of ["position", "normal"]) {
    const attribute = geometry.getAttribute(name);
    if (!attribute) continue;
    const values = new Float32Array(attribute.count * 3);
    for (let index = 0; index < attribute.count; index += 1) {
      values[index * 3] = attribute.getX(index);
      values[index * 3 + 1] = attribute.getY(index);
      values[index * 3 + 2] = attribute.getZ(index);
    }
    geometry.setAttribute(name, new Float32BufferAttribute(values, 3));
  }
  return geometry;
}

function normalizedGeometry(asset) {
  const source = sourceMesh(asset);
  const geometry = editableGeometry(source.geometry).applyMatrix4(source.matrixWorld);
  // Baking the source transform first keeps orientation explicit in the asset pass.
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const size = new Vector3().subVectors(max, min);
  if (![size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0)) {
    geometry.dispose();
    throw new Error("Architecture asset has empty bounds.");
  }
  geometry.translate(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2);
  geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
  // Normals/tangents from the flat asset cannot survive a curved deformation.
  geometry.deleteAttribute("tangent");
  return geometry;
}

function radiusSlope(y) {
  return y > ARCHITECTURE.bottom && y < ARCHITECTURE.bottom + ARCHITECTURE.height
    ? (ARCHITECTURE.topRadius - ARCHITECTURE.bottomRadius) / ARCHITECTURE.height
    : 0;
}

function deform(geometry, transform) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const point = new Vector3();
  const direction = new Vector3();
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index);
    if (normal) direction.fromBufferAttribute(normal, index);
    transform(point, normal ? direction : null);
    position.setXYZ(index, point.x, point.y, point.z);
    if (normal) normal.setXYZ(index, direction.x, direction.y, direction.z);
  }
  position.needsUpdate = true;
  // Transform authored normals with the inverse-transpose Jacobian instead of
  // averaging faces: duplicated UV-seam vertices retain their shared normals.
  if (normal) normal.needsUpdate = true;
  else geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function radialNormal(normal, angle, radial, vertical, tangent) {
  normal
    .set(
      Math.cos(angle) * radial - Math.sin(angle) * tangent,
      vertical,
      Math.sin(angle) * radial + Math.cos(angle) * tangent,
    )
    .normalize();
}

export function bendWall(geometry, { bottom, height, arc, depth = 0.85 }) {
  return deform(geometry, (point, normal) => {
    // Local +Z remains the outer face. Negative angular X preserves handedness
    // and triangle winding when flat X/Y/Z becomes tangent/up/radial.
    const angle = -point.x * arc;
    const y = bottom + point.y * height;
    const radius = towerRadius(y) + point.z * depth - depth * 0.35;
    if (normal) {
      const radial = normal.z / depth;
      radialNormal(
        normal,
        angle,
        radial,
        normal.y / height - radiusSlope(y) * radial,
        -normal.x / (radius * arc),
      );
    }
    point.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  });
}

export function bendFlight(geometry, flight, collapseYaw, walking = {}) {
  const rise = (ARCHITECTURE.stairEnd - ARCHITECTURE.stairStart) / ARCHITECTURE.flights;
  const levels = walking.levels || [0, 1];
  if (
    levels.length < 2 ||
    levels.some(
      (level, index) => !Number.isFinite(level) || (index > 0 && level <= levels[index - 1]),
    )
  ) {
    throw new Error("Invalid stair walking levels.");
  }
  return deform(geometry, (point, normal) => {
    let step = 0;
    while (step < levels.length - 2 && point.y > levels[step + 1]) step += 1;
    const levelSpan = levels[step + 1] - levels[step];
    const equalRiserHeight = (step + (point.y - levels[step]) / levelSpan) / (levels.length - 1);
    const along = point.z + 0.5;
    const angle = collapseYaw + ((flight + along) * Math.PI) / 4;
    const y = ARCHITECTURE.stairStart + flight * rise + equalRiserHeight * rise;
    // Radial attachment follows height along the run, not the wedge's underside.
    const walkingY = ARCHITECTURE.stairStart + (flight + along) * rise;
    const radius = towerRadius(walkingY) - 0.25 + (point.x + 0.5) * ARCHITECTURE.stairWidth;
    if (normal) {
      const radial = normal.x / ARCHITECTURE.stairWidth;
      radialNormal(
        normal,
        angle,
        radial,
        (normal.y * (levels.length - 1) * levelSpan) / rise,
        (normal.z - radiusSlope(walkingY) * rise * radial) / ((radius * Math.PI) / 4),
      );
    }
    point.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  });
}

function materialFor(asset, anisotropy) {
  const material = sourceMesh(asset).material.clone();
  try {
    material.metalness = 0;
    material.roughness = 0.94;
    material.emissive.set(0);
    material.emissiveMap = null;
    material.vertexColors = false;
    material.normalScale?.set(0.65, 0.65);
    for (const value of Object.values(material)) {
      if (value?.isTexture) value.anisotropy = anisotropy;
    }
    return material;
  } catch (error) {
    material.dispose();
    throw error;
  }
}

export function createTowerArchitecture({
  assets,
  groundY = 0,
  collapseYaw = 0.32 * Math.PI,
  baseRecords = [],
  anisotropy = 4,
}) {
  const root = new Group();
  root.name = "supplied-meshy-tower";
  root.position.y = groundY;
  const geometries = new Set();
  const materials = new Set();
  const instanceMeshes = new Set();
  let disposed = false;
  const ownGeometry = (geometry) => {
    geometries.add(geometry);
    return geometry;
  };
  const ownMaterial = (asset) => {
    const material = materialFor(asset, anisotropy);
    materials.add(material);
    return material;
  };
  const dispose = () => {
    if (disposed) return false;
    disposed = true;
    root.removeFromParent();
    instanceMeshes.forEach((mesh) => mesh.dispose());
    instanceMeshes.clear();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    geometries.clear();
    materials.clear();
    return true;
  };
  try {
    const wallMaterial = ownMaterial(assets.wall);
    const sectorArc = (Math.PI * 2) / ARCHITECTURE.sectors;
    let wallCount = 0;
    for (let tier = 0; tier < ARCHITECTURE.tiers; tier += 1) {
      const geometry = ownGeometry(normalizedGeometry(assets.wall));
      bendWall(geometry, {
        bottom: ARCHITECTURE.bottom + tier * 4.25,
        height: 4.27,
        arc: sectorArc * 1.008,
      });
      const angles = [];
      for (let sector = 0; sector < ARCHITECTURE.sectors; sector += 1) {
        const angle = collapseYaw + (sector + (tier % 2 ? 0 : 0.5)) * sectorArc;
        const separation = Math.abs(
          Math.atan2(Math.sin(angle - collapseYaw), Math.cos(angle - collapseYaw)),
        );
        if (tier === 7 && separation < sectorArc * 1.6) continue;
        angles.push(angle);
      }
      const instances = new InstancedMesh(geometry, wallMaterial, angles.length);
      instanceMeshes.add(instances);
      instances.name = `masonry-tier-${tier}`;
      angles.forEach((angle, index) =>
        instances.setMatrixAt(index, new Matrix4().makeRotationY(-angle)),
      );
      instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingBox();
      instances.computeBoundingSphere();
      instances.castShadow = instances.receiveShadow = true;
      root.add(instances);
      wallCount += angles.length;
    }
    const crownGeometry = ownGeometry(normalizedGeometry(assets.crown));
    bendWall(crownGeometry, {
      bottom: 30.8,
      height: 4.7,
      arc: sectorArc * 3.08,
      depth: 1.0,
    });
    const crown = new Mesh(crownGeometry, ownMaterial(assets.crown));
    crown.name = "bastion-breach";
    crown.rotation.y = -collapseYaw;
    crown.castShadow = crown.receiveShadow = true;
    root.add(crown);

    const stairMaterial = ownMaterial(assets.stairs);
    const flightGeometries = [];
    try {
      for (let flight = 0; flight < ARCHITECTURE.flights; flight += 1) {
        const geometry = normalizedGeometry(assets.stairs);
        flightGeometries.push(geometry);
        bendFlight(
          geometry,
          flight,
          collapseYaw,
          assets.stairs.userData?.walking || sourceMesh(assets.stairs).userData?.walking,
        );
      }
      const merged = mergeGeometries(flightGeometries, false);
      if (!merged) throw new Error("Stair flights cannot be merged.");
      const stairs = new Mesh(ownGeometry(merged), stairMaterial);
      stairs.name = "eight-solid-stair-flights";
      stairs.castShadow = stairs.receiveShadow = true;
      root.add(stairs);
    } finally {
      flightGeometries.forEach((geometry) => geometry.dispose());
    }

    const baseGeometry = ownGeometry(normalizedGeometry(assets.base));
    const baseMaterial = ownMaterial(assets.base);
    const instances = new InstancedMesh(baseGeometry, baseMaterial, baseRecords.length);
    instanceMeshes.add(instances);
    instances.name = "ruined-base-masonry";
    baseRecords.forEach((record, index) => {
      const angle = Math.atan2(record.position.z, record.position.x);
      // Seat each block in the existing perimeter; keep its outer face inside r=18.7.
      const matrix = new Matrix4().makeRotationY(Math.PI / 2 - angle);
      matrix.scale(new Vector3(2.1, 1.7, 1.35));
      matrix.setPosition(Math.cos(angle) * 17.9, 0.1, Math.sin(angle) * 17.9);
      instances.setMatrixAt(index, matrix);
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.computeBoundingBox();
    instances.computeBoundingSphere();
    instances.castShadow = instances.receiveShadow = true;
    if (baseRecords.length) root.add(instances);
    root.userData.architecture = {
      wallCount,
      flights: 8,
      baseCount: baseRecords.length,
      sourceRoles: ["wall", "stairs", "crown", "base"],
    };
    return { root, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

export function createTreeArchitecture({ asset, groundHeight, anisotropy = 4 }) {
  const root = new Group();
  root.name = "supplied-meshy-tree";
  root.position.set(58, groundHeight(58, 38), 38);
  const geometries = new Set();
  const materials = new Set();
  const ownGeometry = (geometry) => {
    geometries.add(geometry);
    return geometry;
  };
  const ownMaterial = (material) => {
    materials.add(material);
    return material;
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return false;
    disposed = true;
    root.removeFromParent();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    geometries.clear();
    materials.clear();
    return true;
  };
  try {
    const source = sourceMesh(asset);
    const geometry = ownGeometry(editableGeometry(source.geometry));
    geometry.applyMatrix4(source.matrixWorld);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const height = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(height) || height <= 0) throw new Error("Tree asset has empty bounds.");
    const scale = ARCHITECTURE.treeHeight / height;
    geometry.translate(0, -bounds.min.y, 0);
    geometry.scale(scale, scale, scale);
    geometry.computeBoundingSphere();
    const material = ownMaterial(materialFor(asset, anisotropy));
    const tree = new Mesh(geometry, material);
    tree.name = "meshy-tree";
    tree.castShadow = tree.receiveShadow = true;
    root.add(tree);
    const lantern = new Group();
    lantern.name = "tree-lantern";
    const direction = new Vector3(-58, 0, -38).normalize();
    lantern.position.copy(direction.multiplyScalar(2.4));
    lantern.position.y =
      groundHeight(58 + lantern.position.x, 38 + lantern.position.z) - root.position.y;
    const frameMaterial = ownMaterial(
      new MeshStandardMaterial({ color: 0x584332, roughness: 0.8, metalness: 0.45 }),
    );
    const frameParts = [];
    let frameGeometry;
    try {
      const part = (x, y, z, sx, sy, sz) => {
        const shape = new BoxGeometry(sx, sy, sz);
        shape.translate(x, y, z);
        frameParts.push(shape);
      };
      part(0, 0.7, 0, 0.13, 1.4, 0.13);
      part(0, 1.5, 0, 0.78, 0.12, 0.78);
      part(0, 2.4, 0, 0.86, 0.16, 0.86);
      for (const x of [-0.32, 0.32])
        for (const z of [-0.32, 0.32]) part(x, 1.96, z, 0.075, 0.85, 0.075);
      frameGeometry = mergeGeometries(frameParts, false);
      if (!frameGeometry) throw new Error("Lantern frame cannot be merged.");
      ownGeometry(frameGeometry);
    } finally {
      frameParts.forEach((item) => item.dispose());
    }
    lantern.add(new Mesh(frameGeometry, frameMaterial));
    const glowGeometry = ownGeometry(new BoxGeometry(0.3, 0.56, 0.3));
    const glowMaterial = ownMaterial(
      new MeshStandardMaterial({
        color: 0xffcf82,
        emissive: 0xffa640,
        emissiveIntensity: 1.4,
        roughness: 1,
      }),
    );
    const glow = new Mesh(glowGeometry, glowMaterial);
    glow.position.y = 1.94;
    lantern.add(glow);
    const light = new PointLight(0xffbe72, 2.8, 19, 1.5);
    light.name = "tree-lantern-light";
    light.position.y = 2.05;
    light.castShadow = false;
    lantern.add(light);
    root.add(lantern);
    return {
      root,
      light,
      applyQuality(profile = {}) {
        light.intensity = 2.8 * (profile.lighting?.practicalIntensityScale ?? 1);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
