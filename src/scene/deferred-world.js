import { createSceneSubsystemRegistry, runSceneInitialization } from "./subsystem.js";

// Register this owner before model/treatment controllers. A late fallback then
// has the same teardown order as an eager comparison scene, and cannot be
// constructed by callbacks fired while the scene is being disposed.
export function createDeferredWorld(createWorld) {
  const registry = createSceneSubsystemRegistry();
  let world = null, disposed = false, failed = false, quality = null, size = null;
  return {
    ensure() {
      if (disposed || failed || world) return world;
      try {
        world = runSceneInitialization(registry, () => {
          const initialized = createWorld(registry);
          if (quality) registry.applyQuality(...quality);
          if (size) registry.resize(...size);
          return initialized;
        });
        return world;
      } catch (error) {
        failed = true;
        throw error;
      }
    },
    get current() { return world; },
    applyQuality(...args) {
      quality = args;
      registry.applyQuality(...args);
    },
    resize(...args) {
      size = args;
      registry.resize(...args);
    },
    update(...args) { registry.update(...args); },
    dispose() {
      if (disposed) return false;
      disposed = true;
      registry.dispose();
      world = null;
      return true;
    },
  };
}
