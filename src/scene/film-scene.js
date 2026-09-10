import { CanvasTexture, Color, Vector3 } from "three";
import { createEarthGeometry } from "./filmic-earth.js";

// Scene-owned overrides borrow source resources and restore bindings before
// freeing their derived geometry/maps. No additional renderable or light.
export function createFilmScene({
  ground,
  groundHeight,
  rendering,
  atmosphere,
  effects = [],
  haloSystem,
  skyMaterial,
  onGroundChange = () => {},
}) {
  let active = false,
    disposed = false,
    terrain = null,
    clouds = [],
    undo = [],
    blurred = new Map();
  const originalGeometry = ground.geometry;
  const offset = new Vector3(),
    direction = new Vector3(),
    world = new Vector3();
  return {
    lifecycleOrder: 18,
    get active() {
      return active;
    },
    setClouds(objects) {
      clouds = objects.filter(Boolean);
    },
    setActive(next) {
      if (disposed || active === Boolean(next)) return;
      active = Boolean(next);
      if (active) {
        terrain ||= createEarthGeometry(groundHeight);
        ground.geometry = terrain;
        for (const o of effects) {
          const v = o.visible;
          undo.push(() => {
            o.visible = v;
          });
          o.visible = false;
        }
        const enabled = haloSystem.enabled;
        undo.push(() => {
          haloSystem.enabled = enabled;
        });
        haloSystem.enabled = false;
        const sunColor = skyMaterial.uniforms.sunColor.value.clone();
        undo.push(() => skyMaterial.uniforms.sunColor.value.copy(sunColor));
        skyMaterial.uniforms.sunColor.value.setHex(0x7e8eab).multiplyScalar(0.35);
        const materials = new Set(clouds.map((c) => c.material));
        for (const m of materials) {
          const original = { map: m.map, color: m.color.clone(), opacity: m.opacity };
          undo.push(() => {
            m.map = original.map;
            m.color.copy(original.color);
            m.opacity = original.opacity;
            m.needsUpdate = true;
          });
          if (m.map?.image) {
            if (!blurred.has(m.map)) {
              const source = m.map.image,
                canvas = document.createElement("canvas");
              canvas.width = source.width;
              canvas.height = source.height;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.filter = `blur(${Math.max(2, source.width * 0.018)}px)`;
                ctx.drawImage(source, 0, 0);
                const texture = new CanvasTexture(canvas);
                texture.colorSpace = m.map.colorSpace;
                blurred.set(m.map, texture);
              }
            }
            m.map = blurred.get(m.map) || m.map;
          }
          m.color.lerp(new Color(0x66758b), 0.25);
          m.needsUpdate = true;
        }
      } else {
        ground.geometry = originalGeometry;
        undo
          .splice(0)
          .reverse()
          .forEach((fn) => fn());
      }
      rendering.setFilmTreatment(active);
      atmosphere.setFilmTreatment(active);
      onGroundChange(active);
    },
    finishFrame(camera, target, frame, phoneDetail = false, textBottom = 0.25) {
      if (!active || disposed) return;
      effects.forEach((o) => {
        o.visible = false;
      });
      const distance = direction.copy(target).sub(camera.position).length();
      direction.normalize();
      const radius = Math.max(3, (frame?.radius || 12) * 0.75);
      for (const cloud of clouds) {
        if (!cloud.visible) continue;
        cloud.getWorldPosition(world);
        offset.copy(world).sub(camera.position);
        const depth = offset.dot(direction);
        let fade = 1;
        if (depth > 0 && depth < distance * 1.1) {
          const lateral = offset.addScaledVector(direction, -depth).length();
          fade = Math.max(0.02, Math.min(1, (lateral - radius) / (radius + cloud.scale.x * 0.25)));
        }
        cloud.material.opacity *= 0.44 * fade;
      }
      rendering.focusFilmShadow(target, frame?.radius || 20);
      rendering.postprocessPipeline.setTextProtection?.(phoneDetail, textBottom);
    },
    dispose() {
      if (disposed) return false;
      this.setActive(false);
      disposed = true;
      terrain?.dispose();
      terrain = null;
      blurred.forEach((texture) => texture.dispose());
      blurred.clear();
      clouds = [];
      return true;
    },
  };
}
