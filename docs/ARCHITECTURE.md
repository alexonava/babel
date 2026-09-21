# Current architecture

This checkout holds the local Dreamlike estate direction. Its uncommitted work is part of the current source; a fresh clone or another worktree does not reproduce it automatically.

## Page and startup

- [index.html](../index.html) owns identity, controls, fallback text, and dialog markup. [styles.css](../styles.css) owns type, spacing, responsive layout, and paper surfaces.
- [src/app.js](../src/app.js) is the lightweight UI entry. [src/main.js](../src/main.js) initializes navigation independently and decides whether to load the deferred scene.
- [src/ui/](../src/ui/) owns hero behavior, the illustrated About estate, and Profile, Experience, and Contact dialogs. Back, Escape, dismissal, focus restoration, and the readable no-JavaScript fallback are product behavior.
- [src/scene-entry.js](../src/scene-entry.js) loads the separate scene bundle. The poster remains the first visual; live rendering and optional models do not block navigation.

## Scene ownership

| Area | Source |
| --- | --- |
| Assembly and coordination | [scene/index.js](../src/scene/index.js) |
| URL mode and comparison policy | [scene-modes.js](../src/scene/scene-modes.js) |
| Deferred procedural construction and legacy reflection | [deferred-world.js](../src/scene/deferred-world.js), [legacy-world.js](../src/scene/legacy-world.js), [legacy-reflection.js](../src/scene/legacy-reflection.js) |
| Scheduling, resize, renderer and teardown | [runtime.js](../src/scene/runtime.js), [rendering.js](../src/scene/rendering.js), [subsystem.js](../src/scene/subsystem.js) |
| Authored models, activation and fallback | [architecture.js](../src/scene/architecture.js), [architecture-assets.js](../src/scene/architecture-assets.js) |
| Camera definitions, fitting and tour | [directed-shots.js](../src/scene/directed-shots.js), [cinematic.js](../src/scene/cinematic.js), [camera-tour.js](../src/scene/camera-tour.js) |
| Quality and live/static policy | [quality.js](../src/scene/quality.js), [main.js](../src/main.js), [shared/webgl-probe.js](../src/shared/webgl-probe.js) |
| Environment and film treatment | [environment.js](../src/scene/environment.js), [atmosphere.js](../src/scene/atmosphere.js), [film-scene.js](../src/scene/film-scene.js), [postprocess.js](../src/scene/postprocess.js) |
| Dreamlike detail | [estate-sky.js](../src/scene/estate-sky.js), [estate-ground-detail.js](../src/scene/estate-ground-detail.js), [tree-foliage.js](../src/scene/tree-foliage.js) |

The normal authored scene keeps shared terrain, sky, camera, and model activation in index.js. Procedural construction is separated into legacy-world.js and instantiated through deferred-world.js when a comparison, low-quality path, or authored-asset fallback needs it. Keep the legacy placements/materials intact when changing those modules. URL comparison precedence is centralized in scene-modes.js.

Scene subsystems share applyQuality, resize, update, and dispose lifecycle hooks where relevant. Derived resources must restore borrowed model/material state before disposal; quality changes and failed or stale asset loads must preserve a usable fallback.

## Camera and composition

The default is a fitted directed camera, opening on **The watch**, then touring eight tower/tree shots. It is not governed by the old fixed orbit-radius guidance. Shot regions, subject bounds, terrain clearance, portrait overrides, and the DOM space occupied by identity/navigation determine the composition. The tower remains the world anchor; measure visual changes from the selected camera and responsive safe area.

Change shot definitions in directed-shots.js, fitting in cinematic.js, and pacing/controls in camera-tour.js. Recheck both desktop and portrait frames, motion extremes, and reduced-motion behavior. [Scene modes](SCENE-MODES.md) describes explicit comparison URLs and the legacy orbit.

## Assets and build

Editable runtime assets live in this checkout's images and fonts folders. The separate workspace Assets root contains original artwork, preparation history, and QA evidence; it is not published wholesale.

[build.mjs](../build.mjs) assembles source into ignored dist output, including separate hashed UI/scene scripts, hashed CSS, posters, and artwork. Edit source files, then build. Keep the internal AGENTS.md and historical docs out of the public payload; public discovery files are separate. [OPERATIONS.md](../OPERATIONS.md) remains the release authority.

[tools/build-output.mjs](../tools/build-output.mjs) stages output safely. [tools/watch.mjs](../tools/watch.mjs) watches published inputs and serializes/coalesces rebuilds. [tools/dev.mjs](../tools/dev.mjs) combines that watcher with an owned local Wrangler process through [tools/owned-process.mjs](../tools/owned-process.mjs). Failed builds retain the last successful output; watch mode retains earlier hashed assets for pages already open. Refresh the browser after a successful rebuild.

## History

[docs/history](history/README.md) preserves prior QA, briefs, and pre-cleanup documentation exactly. Review screenshots and local helpers remain at their original ignored .tmp-preview-review paths. Historical measurements and old absolute paths are evidence from their original run, not current configuration.
