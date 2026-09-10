import { CanvasTexture, PlaneGeometry, RepeatWrapping, SRGBColorSpace, Vector3 } from "three";
import { createStoneDetailController } from "./stone-detail.js";

export const EARTH = Object.freeze({ width: 384, subdivisions: 128, tile: 6.3, normalScale: 0.7 });

export function createEarthGeometry(groundHeight) {
  const geometry = new PlaneGeometry(
    EARTH.width,
    EARTH.width,
    EARTH.subdivisions,
    EARTH.subdivisions,
  );
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    normal = new Vector3(),
    step = EARTH.width / EARTH.subdivisions / 2;
  // Ground mesh is rotated -PI/2: local +Y becomes world -Z. Normals come from
  // the height field itself (central differences over half a quad) rather than
  // averaged face normals, so lit earth shows no quad-aligned shading grid.
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = -p.getY(i);
    p.setZ(i, groundHeight(x, z));
    const dx = (groundHeight(x + step, z) - groundHeight(x - step, z)) / (2 * step),
      dz = (groundHeight(x, z + step) - groundHeight(x, z - step)) / (2 * step);
    // World normal (-dx, 1, -dz) expressed in the plane's local frame.
    normal.set(-dx, dz, 1).normalize();
    n.setXYZ(i, normal.x, normal.y, normal.z);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createEarthDetail({
  profile,
  disabled,
  anisotropy,
  publish,
  restore,
  report,
  loadImage,
  createCanvas = () => document.createElement("canvas"),
}) {
  let active = false,
    disposed = false,
    current = profile,
    maps = null;
  function clear() {
    restore(); // Restore material bindings before disposing their resources.
    if (maps) Object.values(maps).forEach((texture) => texture.dispose());
    maps = null;
  }
  const detail = createStoneDetailController({
    profile: { tier: "low" },
    disabled,
    loadImage,
    report,
    kinds: ["color", "normal", "roughness"],
    urlFor: (kind, size) => `/images/materials/earth-${kind}-${size}.webp`,
    apply(sources) {
      const next = {};
      try {
        for (const kind of ["color", "normal", "roughness"]) {
          const source = sources[kind],
            canvas = createCanvas();
          canvas.width = source.width;
          canvas.height = source.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Earth canvas unavailable");
          ctx.drawImage(source, 0, 0);
          const texture = (next[kind] = new CanvasTexture(canvas));
          texture.wrapS = texture.wrapT = RepeatWrapping;
          texture.repeat.setScalar(EARTH.width / EARTH.tile);
          texture.anisotropy = anisotropy;
          if (kind === "color") texture.colorSpace = SRGBColorSpace;
        }
        clear();
        maps = next;
        publish({
          colorMap: maps.color,
          normalMap: maps.normal,
          roughnessMap: maps.roughness,
          bumpMap: null,
          normalScale: EARTH.normalScale,
          muddy: true,
          earth: true,
        });
      } catch (error) {
        if (maps !== next) Object.values(next).forEach((texture) => texture.dispose());
        throw error;
      }
    },
    reset: clear,
  });
  return {
    setActive(next) {
      if (disposed) return;
      active = Boolean(next);
      detail.applyQuality(active ? current : { tier: "low" });
    },
    applyQuality(next) {
      if (disposed) return;
      current = next;
      detail.applyQuality(active ? current : { tier: "low" });
    },
    dispose() {
      if (disposed) return false;
      detail.dispose();
      disposed = true;
      return true;
    },
  };
}
