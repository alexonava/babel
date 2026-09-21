// Deferred scene entry for esbuild.
//
// Each scene module attaches to window.BabelSite.scene as a side effect when
// imported. Order matters: shared helpers come first, then textures.js and
// scene/index.js read helpers, palette, world, quality, and visibility at
// import time.
import "./shared/color.js";
import "./shared/webgl-probe.js";
import "./shared/motion.js";
import "./scene/helpers.js";
import "./scene/palette.js";
import "./scene/world.js";
import "./scene/visibility.js";
import "./scene/textures.js";
import "./scene/dev-mode.js";
import "./scene/index.js";
