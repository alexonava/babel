// Optional relief geometry: the original boxes remain the first-frame fallback.
import { BufferAttribute, BufferGeometry } from "three";

export const BRICK_DETAIL_MAX_BYTES = 48 * 1024;
const POSITION_TOLERANCE = 1 / 32767;
const fail = (message) => {
  throw new Error(`Invalid BRK1 brick geometry: ${message}`);
};

export function decodeBrickGeometry(input) {
  const source =
    input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : null;
  if (!source || source.byteLength < 8 || source.byteLength > BRICK_DETAIL_MAX_BYTES) {
    fail("invalid payload size");
  }
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  if (view.getUint32(0, false) !== 0x42524b31) fail("missing magic");
  const count = view.getUint32(4, true);
  if (!count || count % 3 || count > 3000) fail("invalid vertex count");
  if (source.byteLength !== 8 + count * 16) fail("truncated or trailing attributes");

  // Copy components through DataView: subarrays need not be aligned, and the
  // wire format is always little-endian regardless of the host's byte order.
  const positions = new Int16Array(count * 3);
  const normals = new Int16Array(count * 3);
  const uvs = new Uint16Array(count * 2);
  const normalOffset = 8 + count * 6;
  const uvOffset = 8 + count * 12;
  for (let vertex = 0; vertex < count; vertex += 1) {
    let normalLengthSquared = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const index = vertex * 3 + axis;
      positions[index] = view.getInt16(8 + index * 2, true);
      normals[index] = view.getInt16(normalOffset + index * 2, true);
      const position = Math.max(-1, positions[index] / 32767);
      const normal = Math.max(-1, normals[index] / 32767);
      if (!Number.isFinite(position) || Math.abs(position) > 0.5 + POSITION_TOLERANCE) {
        fail("position outside centered unit bounds");
      }
      normalLengthSquared += normal * normal;
    }
    if (
      !Number.isFinite(normalLengthSquared) ||
      Math.abs(Math.sqrt(normalLengthSquared) - 1) > 0.01
    ) {
      fail("normal is not approximately unit length");
    }
    for (let axis = 0; axis < 2; axis += 1) {
      const index = vertex * 2 + axis;
      uvs[index] = view.getUint16(uvOffset + index * 2, true);
      const uv = uvs[index] / 65535;
      if (!Number.isFinite(uv) || uv < 0 || uv > 1) fail("invalid UV");
    }
  }
  const geometry = new BufferGeometry();
  geometry.name = "authored-stone-brick";
  geometry.setAttribute("position", new BufferAttribute(positions, 3, true));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3, true));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2, true));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

async function loadBrickGeometry(url, { signal }) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Brick geometry response: ${response.status}`);
  if (Number(response.headers.get("content-length")) > BRICK_DETAIL_MAX_BYTES) {
    fail("response exceeds budget");
  }
  return decodeBrickGeometry(await response.arrayBuffer());
}

export function createBrickDetailController({
  profile,
  disabled = false,
  records = [],
  onChange = () => {},
  report = () => {},
  loadGeometry = loadBrickGeometry,
}) {
  const originals = records.map(({ mesh, dimensions }) => ({
    mesh,
    dimensions,
    geometry: mesh.geometry,
    material: mesh.material,
    scale: mesh.scale.clone(),
  }));
  let disposed = false;
  let revision = 0;
  let currentTier;
  let eligible = false;
  let pending = null;
  let geometry = null;
  let geometryFailed = false;
  let applyFailed = false;
  let detailMaps = null;
  let mapsUnavailable = false;
  let applied = false;
  let materials = new Map();

  function publish(reason) {
    let status = "procedural";
    if (eligible) {
      status =
        geometryFailed || mapsUnavailable || applyFailed
          ? "fallback"
          : pending
            ? "loading"
            : applied
              ? "ready"
              : "waiting-maps";
    }
    report({ status, tier: currentTier, ...(reason ? { reason } : {}) });
  }

  function restore() {
    if (!applied) return false;
    for (const original of originals) {
      original.mesh.geometry = original.geometry;
      original.mesh.material = original.material;
      original.mesh.scale.copy(original.scale);
    }
    applied = false;
    for (const material of materials.values()) material.dispose();
    materials.clear();
    onChange();
    return true;
  }

  function apply() {
    if (disposed || !eligible || !geometry || !detailMaps || applied) return false;
    applyFailed = false;
    const nextMaterials = new Map();
    try {
      // Prepare every material before changing any mesh. A bad record or failed
      // clone leaves the whole relief set on its original boxes and materials.
      for (const original of originals) {
        const { x, y, z } = original.dimensions ?? {};
        if (![x, y, z].every((value) => Number.isFinite(value) && value > 0)) {
          throw new Error("Invalid brick dimensions");
        }
        if (!original.material?.isMaterial || Array.isArray(original.material)) {
          throw new Error("Brick relief requires a single material");
        }
        if (!nextMaterials.has(original.material)) {
          const material = original.material.clone();
          nextMaterials.set(original.material, material);
          material.map = detailMaps.colorMap;
          material.roughnessMap = detailMaps.roughnessMap;
          material.roughness = 0.96;
          material.metalness = 0;
          material.bumpMap = null;
          material.bumpScale = 0;
          material.normalMap = null;
          material.needsUpdate = true;
        }
      }
    } catch {
      for (const material of nextMaterials.values()) material.dispose();
      applyFailed = true;
      publish("material-setup-failed");
      return false;
    }
    materials = nextMaterials;
    for (const original of originals) {
      original.mesh.geometry = geometry;
      original.mesh.material = materials.get(original.material);
      original.mesh.scale.copy(original.scale).multiply(original.dimensions);
    }
    applied = true;
    publish();
    onChange();
    return true;
  }

  function setDetailMaps(nextMaps) {
    if (disposed) return false;
    const maps =
      nextMaps?.colorMap?.isTexture && nextMaps?.roughnessMap?.isTexture ? nextMaps : null;
    if (!eligible) return false;
    if (
      maps &&
      maps.colorMap === detailMaps?.colorMap &&
      maps.roughnessMap === detailMaps?.roughnessMap
    ) {
      return false;
    }
    if (!maps && !detailMaps && mapsUnavailable) return false;
    restore();
    detailMaps = maps ? { colorMap: maps.colorMap, roughnessMap: maps.roughnessMap } : null;
    mapsUnavailable = !maps;
    if (!apply()) publish(maps ? undefined : "maps-unavailable");
    return true;
  }

  function applyQuality(nextProfile = {}) {
    if (disposed || nextProfile.tier === currentTier) return false;
    currentTier = nextProfile.tier;
    const nextEligible =
      !disabled && originals.length > 0 && ["high", "balanced"].includes(currentTier);
    if (nextEligible === eligible) {
      publish();
      return true;
    }
    eligible = nextEligible;
    if (!eligible) {
      revision += 1;
      pending?.abort();
      pending = null;
      restore();
      geometry?.dispose();
      geometry = null;
      geometryFailed = false;
      applyFailed = false;
      detailMaps = null;
      mapsUnavailable = false;
      publish();
      return true;
    }
    const requestRevision = ++revision;
    const controller = new AbortController();
    pending = controller;
    geometryFailed = false;
    publish();
    void (async () => {
      let loaded = null;
      try {
        loaded = await loadGeometry("/images/materials/stone-brick.bin", {
          signal: controller.signal,
        });
        if (disposed || requestRevision !== revision || controller.signal.aborted) {
          loaded?.dispose();
          return;
        }
        pending = null;
        if (!loaded?.isBufferGeometry || loaded.index || !loaded.attributes.position) {
          loaded?.dispose();
          throw new Error("Invalid loaded brick geometry");
        }
        geometry = loaded;
        if (!apply()) publish();
      } catch {
        if (disposed || requestRevision !== revision) return;
        pending = null;
        geometryFailed = true;
        publish("geometry-unavailable");
      }
    })();
    return true;
  }

  const controller = {
    lifecycleOrder: 22,
    applyQuality,
    setDetailMaps,
    dispose() {
      if (disposed) return false;
      disposed = true;
      revision += 1;
      pending?.abort();
      pending = null;
      restore();
      geometry?.dispose();
      geometry = null;
      detailMaps = null;
      return true;
    },
  };
  applyQuality(profile);
  return controller;
}
