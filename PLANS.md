# PLANS.md

## Backlog

Candidates for future work, roughly ordered by value. Pick from here when starting a new task.

| #   | Task                                                                           | Why it matters                                                                                                                                                | Size     |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Define a site mission / positioning statement                                  | The "calm by design" tagline exists but there's no articulated mission guiding content decisions                                                              | Thinking |
| 2   | Continue breaking up `src/scene/index.js`                                      | Runtime and rendering lifecycles are extracted; tower, environment, and atmosphere assembly still need a careful behavior-preserving split.                   | Medium   |
| 3   | Address scene-interactions audit findings                                      | See `ART/scene-interactions.md`.                                                                                                                              | Medium   |
| 4   | Dispose `CubeCamera` + `WebGLCubeRenderTarget` after the one-shot env-map bake | Lives on `homeScene` for the page lifetime; only the captured `.texture` handle is needed by the consuming materials. Verify capture timing before disposing. | Small    |
| 5   | Evaluate the remaining supplied Meshy props (pebbles, crow, wide landscape)    | The cracked-ground bake is integrated; the pebble slab could feed a near-plinth detail layer, the others are separate props and need a placement decision.    | Thinking |

> **Thinking** = not ready to build yet, needs more clarity before it becomes a task.

### Adding to the backlog

Anyone (human or agent) can propose additions. Keep entries to one line. Size is one of: **Small** (< 1 hour), **Medium** (a few hours), **Large** (multi-session), or **Thinking** (needs scoping).

---

## Current positioning

- Audience: creative peers first, broader visitors second
- Site role: sparse personal site, not a full portfolio hub
- Babel role: atmospheric influence, not explicit framing copy
- Public text: Alex Nava, with a short first-person introduction and professional context inside About; keep visible copy, metadata, and public mirrors consistent
- Resume: defer until there is a clearer reason to surface it

---

## Active task

_No active task. Pick one from the backlog or fill in the template below when starting new work._

<!-- When starting a task, replace the line above with a filled-in copy of the template below. -->

---

## Task template

Copy this when starting a new task. Delete the template instructions in parentheses.

```markdown
## Active task

### Objective

(One sentence: what are you doing and why.)

### Constraints

- Scope: (what's in and out of bounds)
- Approvals needed: (anything from the "ask before" list in AGENTS.md)
- Environment notes: (relevant limitations)

### Assumptions

(What you're taking as given. Flag anything uncertain.)

### Plan

1. (Step)
2. (Step)
3. (Step)

### Verification

- (How you'll confirm it worked — diff review, manual check, command output, etc.)

### Rollback

(How to undo this if it goes wrong.)

### Status

- [ ] Started
- [ ] Implementation complete
- [ ] Verified
- [ ] PLANS.md updated

### Completion notes

(Filled in when done. What happened, what changed, anything surprising.)
```

---

## Completed tasks

### Cinematic tower lighting

**Implemented and regression-tested 2026-08-23.**

- Rebalanced the live scene around a fixed warm raking key, restrained cool rear separator, lower global lift, and controlled twilight fog so the camera orbit reveals the tower's form without moving the lights.
- Settled on “Nava Designs.” as the landing page's only visible identity after copy exploration; kept résumé positioning out of the sparse visual experience and synchronized the browser title, Markdown mirror, and deployment smoke markers.
- Warmed the key and practical-light balance slightly after visual review while preserving the fixed composition and cool separation.
- Added a dedicated pair of slow-breathing golden architectural lights around the tower; balanced quality reduces them, low quality disables them, and reduced motion holds them still.
- Coordinated the existing plinth, crater, and brazier practicals under adaptive quality ownership; flame sprites retain subtle motion while emitted light stays stable, and low tier disables tier-gated brazier lights after runtime downgrades.
- Made the existing grading, bloom, vignette, and grain strengths tier-aware, preserving reduced-transparency behavior and the deferred scene/poster architecture without adding effects, dependencies, or assets.
- Replaced the blanket touch-device stride with a time-based 60 FPS scene cap: 60 Hz displays retain every frame, high-refresh displays skip only excess scene renders, and the browser/UI remain native-refresh. Adaptive quality, visibility culling, and page-visibility suspension retain thermal safeguards.
- Extended scene-domain, rendering, quality, and postprocess coverage for the new hierarchy and adaptive transitions.

### Production-readiness and calm-interaction pass

**Implemented and regression-tested 2026-07-23.**

- Removed text scramble and random bottom-navigation fire while keeping `Calm by design.` visible at first paint with a restrained positional reveal.
- Clarified the About lead, preserved coarse-pointer labels in short landscape, raised microcopy and contrast floors, made panels scroll-safe, and hid/inerted closing dialogs immediately.
- Extracted tested frame/resize lifecycle helpers; added true reduced-motion dirty rendering with live toggles, corrected touch quality sampling, coalesced no-op resize, target-only developer outlines, fog-aware culling, brazier update gating, stable orbital-buffer uploads, restrained high-tier lighting/bloom, and improved short-landscape framing.
- Added responsive tower posters as the eager scene visual and intentional static fallback for reduced data/motion, unavailable WebGL, and software-rendered WebGL, while retaining live 3D on capable phones and explicit diagnostics.
- Added high-severity dependency gates, hard-threshold Lighthouse runs retained as GitHub Actions artifacts, review-gated preview and main-only production GitHub environments, environment-scoped Cloudflare workflows with the legacy repository-secret fallback retained pending token rotation, retrying content/header smoke checks, a sanitized weekly audit, and an operations/rollback runbook.
- Tightened CSP, aligned HSTS to one year, and separated seven-day stable-asset revalidation from immutable hashed JS/CSS. The attempted Pages-hostname noindex fallback was later removed because Pages `_headers` cannot safely scope rules by hostname; exact-host canonicalization remains a Cloudflare Bulk Redirect task.
- Added a protected, idempotent Cloudflare workflow for the exact production Pages-hostname Bulk Redirect. It preserves paths and query strings, excludes branch-preview subdomains, and refuses to overwrite unexpected account redirect state.

### Panel frame unification — re-do as Option A

**Completed 2026-05-05.** The first pass of `ART/last-pass.md` Section 3 shipped a "Plan C" that built neither Option A nor B — it inverted the panel hierarchy by making a Three.js notebook/letter scene the focal element with text crammed into a tiny absolute-positioned overlay. Re-did as actual Option A:

- Both panels now use a single shared `.panel-parchment` frame: same paper treatment, straight (no skew/rotate), same drop-shadow.
- About panel carries a large display "A" watermark (`.panel-parchment__watermark`) sitting behind the text — reads as a tooled cover initial.
- Contact panel carries a CSS-only wax seal (`.panel-parchment__seal`) in the lower-right.
- Text content is once again the focal element, in normal flow with a sensible content column (`max-width: 38ch`).
- Unwired the Three.js panel-object scene (`src/scene/panel-objects.js`) and the canvas panel-asset draw functions (`drawNotebookPanelAsset` / `drawLetterPanelAsset` formerly in `src/ui/icons.js`) — both were detailed creative assets, not scaffolding, so they were **parked** in `src/art/` rather than deleted. Tree-shaking keeps them out of the bundle until something imports them.
- Removed `revealPanelObject` plumbing from `src/ui/panels.js` and `enablePanelObjectFallback` from `src/main.js`.
- Dropped the metaphor-named `--notebook` / `--letter` modifier classes — variant identity now lives in the watermark / seal element each panel carries.
- Updated `test/markup-accessibility.test.mjs` to assert on the new ornament classes and the absence of `panel-object-stage`.

`src/art/` notes:

- `src/art/panel-objects.js` — the original Three.js scene, IIFE-style; re-enable by adding `import "../art/panel-objects.js";` to `src/scene-entry.js`, then call `site.scene.initPanelObjectArt()` and `site.scene.revealPanelObject(panelId)`.
- `src/art/panel-canvas-assets.js` — the two PSX-dither canvas paintings, exposed at `site.art.drawNotebookPanelAsset` / `site.art.drawLetterPanelAsset`. Helpers (fillPoly, applyPsxDither, etc.) are duplicated from `src/ui/icons.js` so the file is self-contained.

### Postprocessing pipeline

**Completed.** Added a restrained global EffectComposer pipeline:

- Added tier-aware color grading, high-tier bloom, and balanced/high vignette + static grain.
- Kept developer-mode OutlinePass as the final interaction-feedback pass.
- Added quality-tier and postprocess factory tests so adaptive profile changes keep pass enablement deterministic.

### Repository reorg to `src/` + `dist/` layout

**Completed.** Landed a large improvements pass:

- Introduced an esbuild build step. Source of truth moved to `src/`; generated bundles now emit into `dist/scripts/` (gitignored).
- Self-hosted Three.js r128 (via the `three` devDependency, emitted to `dist/vendor/three.min.js`).
- Self-hosted Instrument Sans 400/600 and Cormorant Garamond 500/600 as latin-only woff2 subsets under `fonts/`.
- Tightened CSP to `'self'`-only for scripts, styles, fonts; dropped both `'unsafe-inline'` directives.
- Fixed `_headers`: immutable caching for `/scripts/*`, `/vendor/*`, `/fonts/*`; `must-revalidate` for HTML.
- Added `defer` to every `<script>`; removed dead inline scripts and `<noscript>` styles.
- Dropped stale `og:image`/`twitter:image` meta (tracked as backlog item 2).
- Broadened the scene's `lowPower` heuristic and added an `IntersectionObserver` gate on `#home-scene`.
- Rewrote the hero scroll fade to be rAF-driven with a dirty flag.
- Added an offscreen-canvas bitmap cache in `ui/icons.js`, keyed by DPR/state bucket.

### Structural map + phase headers in `main.js`

**Completed.** Added a top-level structural map comment and phase headers inside `initHomeScene()`. Comment-only change — no behavior altered.

### Roadmap foundation truthfulness + social share polish

**Completed.** Tightened the project contract and added the first understated public polish pass:

- Synced repo guidance so `README.md`, `AGENTS.md`, and `CLAUDE.md` all describe the same source-of-truth repo, preview flow, and verification contract.
- Added a Wrangler-backed local preview command so local review is closer to Cloudflare Pages than a plain static file server.
- Added a committed `og.png` asset and restored Open Graph / Twitter image metadata.
- Captured the current internal positioning stance so future copy changes can stay minimal and consistent.

### Cloudflare security baseline hardening

**Completed.** Formalized the static-site security contract and documented the Cloudflare edge assumptions:

- Kept `_headers` as the tracked source of truth for CSP, framing, MIME sniffing, permissions, COOP/CORP, and preload-capable HSTS.
- Added project-contract coverage so the self-only CSP, HSTS preload shape, missing CORS wildcard, and legacy redirect map cannot drift silently.
- Recorded that Cloudflare Web Analytics/RUM injection is disabled by design instead of widening `script-src` for `static.cloudflareinsights.com`.
- Clarified that custom-domain activation, `www` to apex redirects, production `*.pages.dev` handling, DNS/CAA, certificates, WAF, and response transforms remain Cloudflare-side settings to re-confirm before deploy or security mutations.

### Security and deferred-scene performance pass

**Completed.** Applied a focused repo-local polish pass:

- Scoped Cloudflare deploy secrets to only the workflow steps that validate or deploy with Wrangler.
- Split the browser payload into a lightweight UI boot bundle and a deferred Three.js scene bundle loaded after first paint.
- Kept source docs aligned with the generated `scripts/app.HASH.js` plus `scripts/scene.HASH.js` output shape.

### Unified dark gothic loading ritual

**Implemented for preview review.** Added a CSS-driven, 1.1-second homepage entrance that combines
cold fog, an engraved ember-lit tower seal, two restrained braziers, the Alex Nava wordmark, and a
timed brass progress stroke. The ritual is decorative and self-hiding, has reduced-motion and
forced-colors treatments, adds no external asset or dependency, and leaves the responsive poster
and deferred Three.js capability gates unchanged. See `ART/loading-ritual.md`.


### Directed moonlit scene

**Implemented locally; awaiting visual acceptance.** Six geometry-fitted camera
compositions, reversible film grading/light controls, continuous indexed terrain,
and CC0 Poly Haven Dirt replace the prior uniform-angle presentation. Low views
include terrain and footing-visibility safeguards. All previous comparison
parameters, fallback gates and resource ownership remain available. A labeled
local contact sheet includes desktop/phone midpoints and movement extremes.
Posters, PR #93, and publication are unchanged.

### Wildcard tour pacing and ground-contact investigation

**Implemented locally; awaiting visual acceptance.** Alex asked for roughly 20 seconds per slide
with an occasional 5-second wildcard. Added a third tour mode, `tour=20`: each shot samples its own
dwell fresh when it starts (20s normally, 5s with a 20% chance — `TOUR_DWELL` in `camera-tour.js`),
while `tour=5`/`tour=3` keep their exact prior fixed-dwell behaviour unchanged for the existing
deterministic capture tooling and tests. The speed selector gained a matching "20 seconds" option.

Separately, Alex asked to stop showing "connecting points, where two things connect on the ground."
Two distinct issues were found. First, a genuine geometry gap at one buttress corner in the
Threshold shot, from the supplied tower's irregular source footing; the earth embed was deepened
(0.08 to 0.22 units) to partially bury it — a full fix needs source-geometry rework, out of scope
here. Second, a hard-edged dark patch on the ground near the tree in low shots (Lantern study,
Under the branches); five hypotheses (a double-applied ground-darkening term found and fixed as a
real bug, the earth shader's damp-transition width, shadow blur radius, the lantern light's decay,
and the film shadow camera's frustum extent) were each tested and ruled out one at a time by
disabling shadow-casting entirely and confirming the patch vanished — it is the tree's canopy
casting its own accurate shadow, not an artifact, and shrinking further would mean either a much
larger (costlier) shadow blur or a compositional/foreground-occlusion choice, which Alex separately
suggested as a fallback. The double-darkening fix, the wider shadow camera coverage (extent floor
12 to 32, avoiding an unrelated frustum-cutoff risk in other shots), and the softer blur (radius 4.2
to 6.5) are kept as genuine, verified improvements regardless. All six shots and both posters were
recaptured. Budgets, reduced-motion, fallback and disposal behaviour are unchanged. PR #93 and
publication are unchanged.

### Sharpening Portrait and differentiating Close-up

**Implemented locally; awaiting visual acceptance.** Alex called out "The watch" (tower/2) as the best shot
— bold, committed — and asked for more of that character mixed with establishing shots. Per Alex's request,
gave a cinematographer's read first: the lineup already interleaves establishing (Arrival, Portrait) with
character shots (The watch, Threshold, Lantern study, Close-up), but Portrait was flat next to Arrival's
confidence, and Close-up (added last pass) was really just "Lantern study, but closer." Alex asked to fix
both. Portrait: lowered and tightened (height 0.36→0.24, fov 40→36) to loom the way Arrival does. Close-up:
completely recomposed — an initial attempt at a wider trunk/canopy region just reproduced Portrait's own
composition (wider region = less tight, not more), so it was rebuilt around a canopy-height camera (height
0.5) with a narrow mid-band region (`[0.35,0.65]`, still only a 30% span for genuine tightness) that excludes
the ground/roots/lantern entirely — a dense, looming look at the trunk fork and lower canopy, clearly
distinct from Lantern study's grounded warmth. Verified via direct capture comparison at each iteration; one
known limitation carried forward honestly: Close-up's width-based fit still backs the camera off further on
narrow phone screens than on desktop (a pre-existing platform quirk shared to varying degrees by other detail
shots), so it reads boldest on desktop. PR #93 and publication are unchanged.

### A fourth, closer tree shot

**Implemented locally; awaiting visual acceptance.** After tightening the existing tree shots' fit margin,
Alex asked for an actual close-up. Added a 4th `DIRECTED_SHOTS.tree` entry, "Close-up" — tighter than
Lantern study, on the trunk base, roots and lantern glow (region `[0,0.3]`, fov 30, azimuth -40, margin
0.95). Tower stays at three shots. Because several places hardcoded "3 shots per subject, 6 total" instead
of reading `DIRECTED_SHOTS[...].length`, this required generalizing: `chooseCinematicAngle` (`cinematic.js`)
now takes the resolved subject and sizes its explicit-angle bound and random range from that subject's own
shot count; `setPreviewShot`'s bounds check and `camera-tour.js`'s cycling math, `state.index`/`state.total`,
and the "N of total" tour label all read shot-array lengths instead of literal 3s/6s. Capture tooling
(`capture-cdp.mjs`'s shot list, `build-film-contact-sheet.py`'s grid layout, now 4-wide instead of 3-wide for
7 items) and four tests (`filmic-scene.test.mjs`, `moonlight-pass.test.mjs`, `cinematic.test.mjs`,
`camera-tour.test.mjs`) were updated for the new count. Verified: the new shot reads as a distinct, well-
composed close-up (not a duplicate of Lantern study) at desktop and phone, midpoint and both arc extremes,
with the ground fully flush thanks to the earlier terrace fix. PR #93 and publication are unchanged.

### More intimate tree shots

**Implemented locally; awaiting visual acceptance.** Alex asked for more intimate tree shots. Added a
`margin` field to `fitShot` in `directed-shots.js` (default 0.85, unchanged for tower shots) and set it to
0.93 on all three tree shots (Portrait, Under the branches, Lantern study) — a tighter safe-area fill so the
tree reads noticeably closer/bigger in frame without changing what part of the tree each shot is composed
around (region/fov/azimuth/height untouched). Verified across all three shots at desktop and phone, at
midpoint and both arc extremes: the tree fills more of the frame with no clipping, and "Under the branches"
still keeps the tower visible together with the tree, just closer. PR #93 and publication are unchanged.

### Ground knolls to blend tower/tree footings

**Implemented locally; awaiting visual acceptance.** Alex's follow-up: "where the assets meets the ground
needs more work," with the idea of putting "a small impression or hill closer in the camera's perspective"
to hide the seam. First attempt: two small additive radial bumps in `groundHeight` (`helpers.js`), centered
on the tower and tree anchors, falling off smoothly with distance. Alex reported the tree and parts of the
tower were still floating after that pass — correctly diagnosed as a design flaw, not a tuning problem: an
additive bump raises a neighbourhood roughly evenly but never cancels the dune field's own local slope under
a footprint, so one side of a footing touches while the other still floats above the (still-sloped) ground.
Replaced it with a terrace: flat ground at the anchor's height held constant out to a `flatRadius` covering
the object's actual footprint (9 units tower, 6 units tree), then a smoothstep blend from that flat plateau
back into the natural dune terrain by an outer `radius` (20 tower, 14 tree). This removes the local slope
under each footprint outright rather than just lifting it. Because `groundHeight` is the single source of
truth for the terrain mesh, the tower/tree's own placement Y, prop/scatter placement, and the camera's
terrain-clearance system, both fixes apply everywhere at once with no shot-parameter or clearance-system
changes needed. Verified by cropping and zooming into the exact footing contact lines before and after: the
tree's roots and the tower's buttresses (including the side that previously had a visible daylight gap
beneath it) now sit fully flush with the ground on every side, while wide shots (Arrival, "Under the
branches") still read as a natural gentle rise rather than an obvious flat plaza. No regression of the
previously-fixed tree-shadow patch. The one known remaining defect — a small geometry gap at one Threshold
buttress corner from the tower's own irregular source mesh — is unrelated to ground contact and still needs
source-geometry rework. Tests were rewritten to assert the terrace's exact flatness within `flatRadius` and
exact pass-through to the plain dune field beyond `radius`. All six shots and the contact sheet were
recaptured. PR #93 and publication are unchanged.

### Tree-shot reframing around the cast shadow

**Implemented locally; awaiting visual acceptance.** Follow-up to the ground-contact investigation
above: Alex asked to tackle the tree-canopy shadow patch directly, and chose reframing over a bigger
shadow blur or a foreground occlusion prop. The sun's fixed rig offset (`directionalPosition`
`{x:32,y:28,z:14}`) means the shadow it throws from the tree/lantern anchor `(55.1,36.1)` extends
toward world azimuth ~204°. "Lantern study" sat at azimuth -145° (215°), almost exactly on that line,
putting the shadow directly between camera and trunk in its close, low framing; "Under the branches"
sat at 20°, near the sun's own azimuth, where the shadow should fall mostly behind the trunk, but its
very wide/low framing still caught it. Both azimuths were rotated: Lantern study to -115°, Under the
branches to 70°, moving the camera off the shadow's line of sight while keeping each shot's framing
intent (lantern centred and grounded; both tower and tree in one field). Verified by direct
comparison against the un-rotated baseline (which reproduced the dark wedge exactly) — the rotated
versions show a clean, patch-free ground at midpoint and both arc extremes on desktop and phone. No
lighting/shadow constants from the prior pass were touched. All six shots and the contact sheet were
recaptured. Budgets, tests, reduced-motion and disposal behaviour are unchanged. PR #93 and
publication are unchanged.

### Slower, more intimate tour transition

**Implemented locally; awaiting visual acceptance.** Alex asked for a much slower, more intimate
transition between tour shots. `TOUR_FADE` in `camera-tour.js` (the dip-to-black joining consecutive
shots) grew roughly fivefold: out 0.22s to 1.1s, in 0.28s to 1.3s. At the default 5s dwell that
leaves a 2.6s fully visible window per shot; even at the fast 3s setting a 0.6s window remains, so
the fade never swallows a whole shot. No other tour behaviour changed. PR #93 and publication are
unchanged.

### Grass patches and background hills

**Implemented locally; awaiting visual acceptance.** Alex asked to source real ground/grass
references and a background hill treatment; after a sourcing pass ("scower the net") presenting CC0
options, Alex approved going ahead. Patchy grass (CC0 Poly Haven Sparse Grass, two lightweight maps
only) blends into the earth material away from the tower footing and tree roots — the base ground
texture is unchanged — via a new `grass-detail.js` channel that mirrors `filmic-earth.js`'s
`createEarthDetail` and its own `onGrassChange`/`onGrassStatus` wiring, never routing through the
ground's own `onDetailChange`. A distant hill silhouette (`hill-silhouette.js`, a new zero-payload
subsystem) rises just past the tree's own radius, built from a real 48-sample public-domain SRTM
elevation traverse baked as source constants rather than a downloaded asset — geometry-only, no new
texture, no GLB, no `architecture-assets.js` or `build.mjs` changes. Two real bugs surfaced and were
fixed during implementation: the hill's first radius (sized to clear the terrain's own footprint)
sat past this scene's fog.far in camera-space and was invisible; the corrected, closer radius then
put the widest shot's camera inside the ring's own geometry, rendering as a solid dark wedge, fixed
by widening the safety margin past every shot's camera distance and adding `DoubleSide` to the
material. A separate grass-shader bug (a duplicated `grassAmount` declaration from a mis-targeted
line-numbered edit) silently failed shader compilation and was caught via a headless console-error
probe added to the capture tooling, not the visual review alone. All six shots, the tour and both
posters were recaptured; new tests cover the hill geometry's continuity/tier-gating and the grass
texture budget (232,576 bytes high / 64,540 balanced, well under a 250/90 KiB cap; combined
deferred total 4,157,520 high / 1,511,446 balanced, still under 6/3 MiB). Reduced-motion, fallback
and disposal behaviour are unchanged. PR #93 and publication are unchanged.

### Scale and rendering follow-up

**Implemented locally; awaiting visual acceptance.** Alex's feedback after the moonlight pass: the
lantern read too large, the tree should be bigger, and the tower should be bigger, with better
rendering. The supplied tower now scales to 39 units tall (from 34) on its own constant, decoupled
from the classic/assembled procedural tower's `ARCHITECTURE.height`, which is unchanged. The tree's
prop-scale target grew from 3x to 4.2x the doorway reference (about 27.7 units, up from 19.8), and
the lantern's target shrank from 0.65x to 0.3x the doorway reference (about 2.0 units, down from
4.3), matching a hand/post lantern rather than a garden fixture. The high-tier shadow map doubled
from 1024 to 2048 for a cleaner edge on the now-larger geometry. All six shots, the tour and both
posters were recaptured; camera framing re-fits automatically from measured geometry, so no shot
constants changed. Budgets, reduced-motion, fallback and disposal behaviour are unchanged. PR #93
and publication are unchanged.

### Night grade

**Implemented locally; awaiting visual acceptance.** Alex asked to push further: darker still, like a
true night scene. Film lighting dropped again (key 50%, fill 110%, hemisphere 125%, ambient 95%,
all down from the darker/creamier pass), the tower and tree film lift dropped from 0.3/0.2 to
0.14/0.09 so undersides stay near-black instead of a lifted grey, the film earth shader's base
multiplier dropped from 0.98 to 0.8, and vignette rose from 0.1 to 0.14. Contrast, cel mix, bloom,
grain and highlight warm mix are unchanged from the prior pass, so lit stone still reads warm cream
against the darker sky and ground. All six shots and both posters were recaptured. Budgets,
reduced-motion, fallback and disposal behaviour are unchanged. PR #93 and publication are unchanged.

### Darker, creamier film grade

**Implemented locally; awaiting visual acceptance.** Alex asked for the scene darker with more of the
creamy film look. Film lighting dropped further (key 66%, fill 140%, hemisphere 160%, ambient 115%,
all down from the scale-and-rendering pass) and the grade warmed and softened (contrast 0.99,
highlight warm mix 0.2, shadow cool mix lowered to 0.1, bloom 0.2, grain 0.014, vignette 0.1),
keeping the 0.16 cel mix from the prior pass. All six shots and both posters were recaptured.
Budgets, reduced-motion, fallback and disposal behaviour are unchanged. PR #93 and publication
are unchanged.

### Moonlight grade, tangible earth, lantern, shot and poster pass

**Implemented locally; awaiting visual acceptance.** Following the 2026-09-08
cinematography review: release posters now come from the Arrival shot so first
paint no longer shows the retired brick spiral; the supplied tower and tree get a
uniform-driven moonlight grade (cool, desaturated, compressed baked highlights,
lifted undersides) with a cooler, lower key and stronger fill/sky/ambient and a
softer shadow; the Poly Haven earth keeps its local contrast with a high-passed
normal map at normal scale 0.7; the lantern is a full iron post lantern with
glass, candle and flame; The watch, Threshold, Arrival and Under the branches were
retuned (the last now frames tree, lantern and distant watchtower together); tour
cuts dip to black and every shot dollies in slowly. Budgets, reduced-motion,
fallback and disposal behaviour are unchanged. PR #93 and publication are unchanged.
