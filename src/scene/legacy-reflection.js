import { CubeCamera, LinearMipmapLinearFilter, RGBAFormat, WebGLCubeRenderTarget } from "three";

export function createLegacyReflection({
  enabled, homeScene, renderer, rendering, puddles, groundY,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
  createTarget = () => new WebGLCubeRenderTarget(128, {
    format: RGBAFormat, generateMipmaps: true, minFilter: LinearMipmapLinearFilter,
  }),
  createCamera = target => new CubeCamera(0.5, 200, target),
}) {
  let frame = null, disposed = false;
  if (enabled) {
    const target = createTarget(), camera = createCamera(target);
    rendering.trackRenderTarget(target);
    camera.position.set(0, groundY + 0.5, 0);
    homeScene.add(camera);
    frame = requestFrame(() => {
      frame = null;
      if (disposed) return;
      frame = requestFrame(() => {
        frame = null;
        if (disposed) return;
        const visible = puddles.visible;
        puddles.visible = false;
        try { camera.update(renderer, homeScene); }
        finally { puddles.visible = visible; }
        puddles.children.forEach(object => {
          object.material.envMap = target.texture;
          object.material.envMapIntensity = 0.88;
          object.material.needsUpdate = true;
        });
      });
    });
  }
  return {
    dispose() {
      if (disposed) return false;
      disposed = true;
      if (frame !== null) cancelFrame(frame);
      frame = null;
      return true;
    },
  };
}
