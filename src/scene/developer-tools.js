// Developer-only scene tools, loaded on demand for ?sceneDebug=1 sessions.
//
// scene/index.js reaches this module only through a dynamic import() after it
// reads the debug flag, so the build emits it as a separate lazily fetched
// chunk (scripts/scene.developer-tools.HASH.js). Default visitors never
// download or evaluate the developer camera or Three's OutlinePass.
//
// Importing dev-mode.js registers scene.devMode as a side effect; the outline
// factory is handed to rendering.ensureOutlinePass so the composer owns the
// pass exactly as before.
//
// This module and dev-mode.js may import only three and its examples, never
// another first-party scene module: code shared with the entry moves into the
// shared chunk, which evaluates before scene-entry.js's ordered BabelSite
// registrations. build.mjs refuses such a build.
import "./dev-mode.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";

export function createOutlinePass(size, homeScene, camera) {
  return new OutlinePass(size, homeScene, camera);
}
