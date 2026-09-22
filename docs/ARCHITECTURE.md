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
| Shared celestial field and stars | [celestial-field.js](../src/scene/celestial-field.js), [starfield.js](../src/scene/starfield.js), [solar-body.js](../src/scene/solar-body.js) |
| Terrain maps and blending | [textures.js](../src/scene/textures.js), [filmic-earth.js](../src/scene/filmic-earth.js), [grass-detail.js](../src/scene/grass-detail.js), [mud-ground.js](../src/scene/mud-ground.js) |

The normal authored scene keeps shared terrain, sky, camera, and model activation in index.js. Procedural construction is separated into legacy-world.js and instantiated through deferred-world.js when a comparison, low-quality path, or authored-asset fallback needs it. Keep the legacy placements/materials intact when changing those modules. URL comparison precedence is centralized in scene-modes.js.

Scene subsystems share applyQuality, resize, update, and dispose lifecycle hooks where relevant. Derived resources must restore borrowed model/material state before disposal; quality changes and failed or stale asset loads must preserve a usable fallback.

rendering.js also checks the underlying WebGL context before entering the composer. This covers physical context loss before the browser's queued loss event reaches Three.js, while preserving the existing restoration and disposal lifecycle.

## Material and environment treatment

architecture.js preserves supplied geometry, UVs and textures while preparing runtime materials. The complete tower has only a supplied color map, so its 0.90 scalar roughness is applied directly rather than remapped toward 1. The tree keeps its normal and metallic/roughness maps, with roughness mapped into 0.84–0.97. Rendering uses existing fill and hemisphere lights for a restrained cool shadow lift; the sun and lantern remain the warm accents. No light or shadow pass is added.

tree-foliage.js weights triangle selection by surface area, then uses deterministic barycentric placement on the outer upper canopy. It has a fixed 80,000-attempt bound and one instanced mesh, capped at 3600 high / 1800 balanced leaves and hidden on low. Leaf geometry remains outside shot fitting, and borrowed source geometry is unchanged. prop-scale.js measures the tree's own transformed geometry for scale and grounding, so changing a child leaf's extent cannot resize or shift the supplied tree and indirectly alter its camera fit. Quality and teardown retain the same ownership contract.

celestial-field.js shares a world-oriented nebula frame and dust function between estate-sky.js and starfield.js. The still nebula is evaluated within the existing sky shell; selected existing stars form a compact cluster and use the same dust field for attenuation. The star limits remain 4200 high / 2600 balanced / 1200 low. atmosphere.js selects three nebula noise octaves on high, two on balanced, and zero on low or inactive film treatment. Star positions return to their baseline distribution when the celestial treatment is disabled. The layer adds no asset request, draw, render pass or light; existing clouds and reduced-motion clocks keep their separate behavior.

The default film ground uses three earth maps (color, normal, roughness) and two grass maps (color, mask), at the existing 1024 high / 512 balanced resolutions. Grass blends in the ground shader. textures.js disables the earlier authored ground color/normal pair on this path; retained comparisons select that pair or procedural ground as appropriate. Failed optional loads and low/static paths retain their existing fallback behavior.

## Camera and composition

The default is a fitted directed camera, opening on **The watch**, then touring seven tower/tree shots. Masonry study is retained for explicit comparison URLs but excluded from the tour. It is not governed by the old fixed orbit-radius guidance. Shot regions, subject bounds, terrain clearance, portrait overrides, and the DOM space occupied by identity/navigation determine the composition. The tower remains the world anchor; measure visual changes from the selected camera and responsive safe area.

Change shot definitions in directed-shots.js, fitting in cinematic.js, and pacing in camera-tour.js. Recheck both desktop and portrait frames, motion extremes, and reduced-motion behavior. [Scene modes](SCENE-MODES.md) describes explicit comparison URLs and the legacy orbit.

## Assets and build

Editable runtime assets live in this checkout's images and fonts folders. The separate workspace Assets root contains original artwork, preparation history, and QA evidence; it is not published wholesale.

[build.mjs](../build.mjs) assembles source into ignored dist output, including separate hashed UI/scene scripts, hashed CSS, posters, and artwork. Edit source files, then build. Keep the internal AGENTS.md and historical docs out of the public payload; public discovery files are separate. [OPERATIONS.md](../OPERATIONS.md) remains the release authority.

[tools/build-output.mjs](../tools/build-output.mjs) stages output safely. [tools/watch.mjs](../tools/watch.mjs) watches published inputs and serializes/coalesces rebuilds. [tools/dev.mjs](../tools/dev.mjs) combines that watcher with an owned local Wrangler process through [tools/owned-process.mjs](../tools/owned-process.mjs). Failed builds retain the last successful output; watch mode retains earlier hashed assets for pages already open. Refresh the browser after a successful rebuild.

The September 21 candidate passes 391 tests, compilation/build and a zero-vulnerability dependency audit. Its active scene/UI bundles are 819,355 / 19,570 bytes, within existing budgets. All 32 desktop/phone visual pairs passed; an additional 14 motion-endpoint and four landscape views also passed. Authored models/maps remain unchanged, and both responsive posters are refreshed. The [validation report](VALIDATION-2026-09-21.md) binds the current source, build and review evidence. The [performance investigation](VALIDATION-2026-09-21.md#lighthouse-investigation) separates passing live readiness/render checks from the Lighthouse performance/TBT gates that still fail; no release-pass claim follows from local validation.

## History

[docs/history](history/README.md) preserves prior QA, briefs, and pre-cleanup documentation exactly. Review screenshots and local helpers remain at their original ignored .tmp-preview-review paths. Historical measurements and old absolute paths are evidence from their original run, not current configuration.
