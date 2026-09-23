# Scene modes and camera review

The normal local experience opens on **The watch** (tower, angle 1), with the 20-second tour. The seven tour shots comprise three tower views and four tree views. Masonry study is excluded from the tour; its explicit comparison URL remains available. These controls are defined by source, not by the numeric orbit guidance in older notes.

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

Explicit view/angle selects the opening composition; add tour=0 to hold it. Tour timing accepts 3, 5, and 20 seconds; without a tour parameter the 20-second mode runs. Twenty-second mode has a 20% chance of a five-second wildcard dwell, sampled at each shot, so tour=20 matches the default and tour=3 or tour=5 are review cadences. The tour has no shot label or control strip. Panels, developer camera control, reduced motion, and a visitor pause suspend automatic cycling; missing subjects are skipped.

## Visitor pause

The footer's Pause scene / Play scene text button (its label names the next action) appears only while the live scene is revealed (#home-scene has is-ready). It calls `BabelSite.scene.setVisitorPaused()`; `isVisitorPaused()` reads the state back. A pause holds the tour on its current shot, shows a dip in progress undimmed, stops drift and clouds, and then stops rendering. A resize, context restore, or model, map, shader or font change draws one still frame; scroll does not. Resuming continues the same shot from that clear frame without a time jump; an interrupted dip restarts from clear. The UI stores the choice as `babel:scene-paused` and passes it to the scene as `scene.visitorPausedPreference`, which applies once the scene is revealed, so the first revealed frame stays on screen. Without a quality or sceneDebug override, reduced-motion and reduced-data visitors, like other static poster paths, never load the scene and show no pause control.

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

Without overrides, reduced motion/data, unavailable WebGL, and software rendering retain the static poster path. An explicit quality=low, quality=balanced, quality=high, or sceneDebug=1 requests the diagnostic live path when WebGL is available; it is not a way to bypass release gates. A live reduced-motion review holds camera motion. With sceneDebug=1, the Backquote key activates the desktop developer camera and its debug HUD; the key does nothing for ordinary visits and is ignored while a panel is open. Its code loads as a separate chunk only for sceneDebug=1 sessions. The scene requests that chunk as soon as it reads the flag, so the download overlaps initialization, and the key responds once the chunk has arrived, normally by the time initialization finishes. The developer camera renders through a visitor pause, restores the held frame when it exits, and does not define visitor framing.

See [OPERATIONS.md](../OPERATIONS.md) for the exact delivery and release policy. Historical QA snapshots live in [history](history/README.md); their ports, scores, camera numbers, and publication claims refer to their original run.
