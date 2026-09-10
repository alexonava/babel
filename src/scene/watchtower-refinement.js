export function wantsGroundedWatchtower(search = "") {
  const query = new URLSearchParams(search);
  return (
    !["classic", "assembled"].includes(query.get("architecture")) &&
    query.get("refinement") !== "baseline"
  );
}

export function createWatchtowerRefinement({
  effects = [],
  plinth = [],
  rubble = [],
  setLighting = () => {},
} = {}) {
  let active = false;
  let disposed = false;
  let visibility = [];
  let bindings = [];
  const materials = new Set();
  function restore() {
    // Rebind originals before freeing derived materials; textures stay borrowed.
    bindings.forEach(([mesh, original]) => {
      mesh.material = original;
    });
    visibility.forEach(([object, original]) => {
      object.visible = original;
    });
    bindings = [];
    visibility = [];
    materials.forEach((material) => material.dispose());
    materials.clear();
    setLighting(false);
    active = false;
  }
  function bind(meshes, role) {
    const cache = new Map();
    for (const mesh of meshes) {
      const original = mesh.material;
      if (!original?.isMaterial || Array.isArray(original)) continue;
      let material = cache.get(original);
      if (!material) {
        material = original.clone();
        materials.add(material);
        material.roughness = 1;
        material.metalness = 0;
        material.emissive?.set(0);
        material.emissiveMap = null;
        const previousCompile = original.onBeforeCompile;
        const previousKey = original.customProgramCacheKey();
        material.customProgramCacheKey = () => `${previousKey}-grounded-${role}-v1`;
        material.onBeforeCompile = function (shader, renderer) {
          previousCompile.call(this, shader, renderer);
          if (role === "plinth")
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <map_fragment>",
              `#include <map_fragment>
            diffuseColor.rgb = mix(vec3(0.10, 0.095, 0.083), diffuseColor.rgb, 0.45);`,
            );
        };
        if (role === "rubble") material.color.setHex(0x4c4840);
        cache.set(original, material);
      }
      bindings.push([mesh, original]);
      mesh.material = material;
    }
  }
  return {
    get active() {
      return active;
    },
    setActive(next) {
      if (disposed || Boolean(next) === active) return false;
      if (!next) {
        restore();
        return true;
      }
      try {
        visibility = [...new Set(effects.filter(Boolean))].map((object) => [
          object,
          object.visible,
        ]);
        bind(plinth, "plinth");
        bind(rubble, "rubble");
        setLighting(true);
        active = true;
        this.enforceVisibility();
        return true;
      } catch (error) {
        restore();
        throw error;
      }
    },
    enforceVisibility() {
      if (active && !disposed)
        visibility.forEach(([object]) => {
          object.visible = false;
        });
    },
    dispose() {
      if (disposed) return false;
      if (active || bindings.length || materials.size) restore();
      disposed = true;
      return true;
    },
  };
}
