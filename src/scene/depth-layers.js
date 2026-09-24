// Film depth layers for the tour's staggered dissolve (postprocess.js): evenly
// spaced codes in the scene target's alpha, so the final pass decodes layer =
// 3 * code. Unstamped opaque surfaces keep 1: the subject.
export const DEPTH_LAYER = Object.freeze({ sky: "0.0", mountains: "0.3333", ground: "0.6667" });

// Composes with a material's existing onBeforeCompile and program cache key.
export function stampDepthLayer(material, layer) {
  const before = material.onBeforeCompile,
    key = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    before?.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>\ngl_FragColor.a = ${layer};`,
    );
  };
  material.customProgramCacheKey = function () {
    return `${key?.call(this) ?? ""}|depth-layer-${layer}`;
  };
  return material;
}
