// Deferred scene entry for esbuild.
//
// Each scene module attaches to window.BabelSite.scene as a side effect when
// imported. Order matters: perf-marks.js comes first so its timestamp marks
// the start of this entry chunk's evaluation (the shared Three.js chunk it
// imports has already evaluated by then), then shared helpers, then
// textures.js and scene/index.js, which read helpers, palette, world, quality,
// and visibility at import time. The developer camera is not listed:
// scene/index.js imports scene/developer-tools.js on demand for ?sceneDebug=1
// sessions only. developer-tools.js and dev-mode.js must not import
// first-party modules that this entry also imports: esbuild would move them
// into the shared chunk, which evaluates before this ordered list (build.mjs
// rejects such a build).
import { markSceneEvaluated } from "./scene/perf-marks.js";
import "./shared/color.js";
import "./shared/webgl-probe.js";
import "./shared/motion.js";
import "./scene/helpers.js";
import "./scene/palette.js";
import "./scene/world.js";
import "./scene/visibility.js";
import "./scene/textures.js";
import "./scene/index.js";

markSceneEvaluated();
