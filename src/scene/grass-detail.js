import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { createStoneDetailController } from "./stone-detail.js";

// A different tile size than EARTH.tile (6.3) so the two patchiness fields
// don't fall into a correlated repeat when both sample the same world plane.
export const GRASS = Object.freeze({ tile: 9.0 });

// Two lightweight maps only: a subdued moss-olive color and a grayscale
// patchiness mask. Roughness/specular character is a constant in the shader
// (see mud-ground.js), so no third map is needed for this secondary blend.
export function createGrassDetail({
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
    kinds: ["color", "mask"],
    urlFor: (kind, size) => `/images/materials/grass-${kind}-${size}.webp`,
    apply(sources) {
      const next = {};
      try {
        for (const kind of ["color", "mask"]) {
          const source = sources[kind],
            canvas = createCanvas();
          canvas.width = source.width;
          canvas.height = source.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Grass canvas unavailable");
          ctx.drawImage(source, 0, 0);
          const texture = (next[kind] = new CanvasTexture(canvas));
          texture.wrapS = texture.wrapT = RepeatWrapping;
          texture.anisotropy = anisotropy;
          // Sampled directly in the shader as a uniform, not material.map, but
          // the sRGB->linear decode still happens at texture upload, so this
          // flag is required for the color map to read correctly.
          if (kind === "color") texture.colorSpace = SRGBColorSpace;
        }
        clear();
        maps = next;
        publish({ grassColorMap: maps.color, grassMaskMap: maps.mask, grassTile: GRASS.tile });
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
