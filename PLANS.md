# PLANS.md

## Backlog

Candidates for future work, roughly ordered by value. Pick from here when starting a new task.

| #   | Task                                                                           | Why it matters                                                                                                                                                | Size     |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Define a site mission / positioning statement                                  | The "calm by design" tagline exists but there's no articulated mission guiding content decisions                                                              | Thinking |
| 2   | Continue breaking up `src/scene/index.js`                                      | Runtime and rendering lifecycles are extracted; tower, environment, and atmosphere assembly still need a careful behavior-preserving split.                   | Medium   |
| 3   | Address scene-interactions audit findings                                      | See `ART/scene-interactions.md`.                                                                                                                              | Medium   |
| 4   | Dispose `CubeCamera` + `WebGLCubeRenderTarget` after the one-shot env-map bake | Lives on `homeScene` for the page lifetime; only the captured `.texture` handle is needed by the consuming materials. Verify capture timing before disposing. | Small    |

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
