# Scene modes and camera review

The normal local experience opens on **The watch** (tower, angle 1), with the existing five-second tour. The seven tour shots comprise three tower views and four tree views. Masonry study is excluded from the tour; its explicit comparison URL remains available. These controls are defined by source, not by the numeric orbit guidance in older notes.

## Directed views

Append a query to the local preview, for example:

    http://127.0.0.1:4173/?view=tower&angle=1&tour=0

| URL selection | Shot |
| --- | --- |
| view=tower&angle=1 | The watch |
| view=tower&angle=2 | Threshold |
| view=tower&angle=3 | Masonry study (comparison only; excluded from tour) |
| view=tower&angle=4 | Gallery detail |
| view=tree&angle=1 | Portrait |
| view=tree&angle=2 | Lantern study |
| view=tree&angle=3 | Close-up |
| view=tree&angle=4 | Root and lantern |

Explicit view/angle selects the opening composition; add tour=0 to hold it. Tour timing accepts 3, 5, and 20 seconds. Twenty-second mode has a 20% chance of a five-second wildcard dwell, sampled at each shot. The tour runs without a visible shot label or control strip. Panels, developer camera control, and reduced motion suspend automatic cycling; missing subjects are skipped.

The camera fits authored focal volumes into the responsive composition area. Portrait overrides are intentional. Edit [directed-shots.js](../src/scene/directed-shots.js) for shot intent, [cinematic.js](../src/scene/cinematic.js) for fitting, and [camera-tour.js](../src/scene/camera-tour.js) for timing.

## Retained comparisons

| Parameter | Purpose |
| --- | --- |
| view=orbit | Previous orbital camera |
| cinematography=baseline | Prior cinematic treatment |
| architecture=assembled | Earlier assembled architecture |
| architecture=classic | Procedural/classic architecture |
| setting=previous | Previous setting and orbit |
| setting=plinth | Raised platform comparison |
| ground=desert / ground=procedural | Earlier ground treatments |
| scale=baseline | Earlier prop proportions |
| stone=procedural / brick=boxes | Legacy material/brick comparisons where applicable |

[scene-modes.js](../src/scene/scene-modes.js) centralizes URL mode policy. These combinations are compatibility and review controls, not separate current designs. Some comparisons apply only to their matching architecture mode. Defaults and fallback behavior must remain consistent when refactoring.

## Accessibility and diagnostics

Without overrides, reduced motion/data, unavailable WebGL, and software rendering retain the static poster path. An explicit quality=low, quality=balanced, quality=high, or sceneDebug=1 requests the diagnostic live path when WebGL is available; it is not a way to bypass release gates. A live reduced-motion review holds camera motion. With sceneDebug=1, the Backquote key activates the desktop developer camera and its debug HUD; the key does nothing for ordinary visits and is ignored while a panel is open. The developer camera does not define visitor framing.

See [OPERATIONS.md](../OPERATIONS.md) for the exact delivery and release policy. Historical QA snapshots live in [history](history/README.md); their ports, scores, camera numbers, and publication claims refer to their original run.
