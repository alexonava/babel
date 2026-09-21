# Postprocessing pipeline — asset spec v1

**Status:** Shipped 2026-05-05.
**Owner once approved:** Codex executes from this spec.
**Reviewer:** project owner.
**Depends on:** marble.md (shipped), cloister-fragment.md (optional — pipeline does not require it).

## Goal

Lift the babel hero scene from "nicely-rendered Three.js" to "this looks composed and intentional" by adding a tasteful postprocessing pipeline on top of the EffectComposer that's already imported in `src/scene/index.js`. The visual goal is **painterly cinematic**, not photoreal blockbuster — same design language as the existing marble + tower work.

The single biggest visual lift comes from **color grading**. Bloom, vignette, and grain are supporting passes that frame and texture the image. This spec ships all four, gated by quality tier so mobile/low-end stays fast.

## Visual reference

- **Color anchor**: think Wes Anderson / James Turrell / Caspar David Friedrich — warm shadows that never crush to pure black, slightly desaturated midtones, cool sky highlights, gentle vignette framing the composition.
- **Anti-references**: Hollywood lens flare, anime chromatic aberration, video-game motion blur, "everything glows" Bayonetta bloom. None of these. Restrained.
- **Comparison**: Bruno Simon's portfolio scenes lean clean/playful; Lusion's work leans cinematic/heavy. Babel sits between, closer to Lusion but more restrained.

## Pipeline

Composer order (each frame):
1. **RenderPass** (already wired) — base scene render.
2. **BloomPass** — selective glow on bright highlights only. **High tier only.**
3. **GradingPass** — color curve / LUT-style tonal shift. **All tiers.**
4. **VignettePass** — soft edge darkening. **Balanced + high tiers.**
5. **GrainPass** — subtle film grain noise. **Balanced + high tiers.**
6. *(OutlinePass stays where it is — already wired, do not touch.)*

### Color grading (the headliner)

Implement as a custom `ShaderPass` in `src/scene/postprocess.js`. Single fragment shader, near-free perf cost, runs on every tier.

**Grading curve specification:**

- **Shadows (luma < 0.25)**: lift toward warm dark brown, never pure black. Target color `#1a1612` (matches the `scorchDeep` token from cloister-fragment.md if that lands first; otherwise hardcode and the reviewer will reconcile).
- **Midtones (luma 0.25–0.7)**: slight warm shift (more red/yellow, less blue). Saturation +5%.
- **Highlights (luma > 0.7)**: cool shift (more blue, less red). This makes sky/sun feel cooler against the warm stone. Roll off softly — no clipping.
- **Overall contrast**: +8% (gentle S-curve). Painterly, not punchy.
- **Saturation**: +5% globally on top of the midtone push.

Implement the curve with smoothstep blends in GLSL — do **not** require an external LUT texture (avoids asset-pipeline dependency).

### Bloom (high tier only)

Use Three.js `UnrealBloomPass` from `three/examples/jsm/postprocessing/UnrealBloomPass.js` (already in the deferred scene bundle since OutlinePass is too — verify this in `build.mjs` output before adding).

- **Threshold**: 0.85 (only the brightest 15% of pixels glow)
- **Strength**: 0.35 (subtle)
- **Radius**: 0.6 (soft, not tight)

These values are starting points. Reviewer may ask for tuning iterations.

### Vignette + grain (balanced + high)

Single combined `ShaderPass` to save a render pass. Fragment shader:

- **Vignette**: radial falloff from screen center, smooth `smoothstep(0.4, 1.0, dist)`, multiplied with output. Falloff is gentle — corners ~85% brightness, not 50%.
- **Grain**: hash-based pseudo-random per-pixel offset, intensity 0.04 (4%). Static per-frame is fine; **do not animate the grain** (respect `prefers-reduced-motion` — static grain doesn't violate it, animated does).

## Quality tier integration

Extend `src/scene/quality.js`:

| Field | high | balanced | low |
|---|---|---|---|
| `postprocessGrading` | true | true | true |
| `postprocessBloom` | true | false | false |
| `postprocessVignette` | true | true | false |
| `postprocessGrain` | true | true | false |

Tests in `test/scene-quality.test.mjs` should verify each field exists per tier and that `low` only has grading enabled (the cheap pass).

The governor (existing dynamic-quality logic that drops tier under sustained frame stress) should automatically disable bloom + vignette + grain when it drops a session from `high` → `balanced` → `low`. Verify the existing `selectSceneQualityTier` flow handles this without extra wiring.

## Reduced-motion / reduced-transparency

- `prefers-reduced-motion: reduce` — already honored elsewhere. Grain stays **static** (no per-frame jitter), so this is fine. Verify nothing in the pipeline animates uncontrollably.
- `prefers-reduced-transparency: reduce` — vignette is technically a transparency overlay. Per existing project policy (CLAUDE.md), respect this query and **disable vignette** when the media query matches, regardless of tier.

## Files Codex may touch

| File | Modification |
|---|---|
| `src/scene/postprocess.js` | **New.** Builds the EffectComposer pipeline given a quality profile. Exports `createPostprocessPipeline(renderer, scene, camera, qualityProfile)` returning the configured composer + a `dispose()` for cleanup. |
| `src/scene/index.js` | Replace direct `renderer.render(...)` calls in the animation loop with `composer.render(...)`. Preserve OutlinePass behavior. Wire `createPostprocessPipeline` into init. |
| `src/scene/quality.js` | Add 4 postprocess fields per tier (table above). |
| `src/scene/palette.js` | Optional: add `GRADING_PALETTE` if reviewer prefers tokens over hardcoded GLSL constants. Surface this as a question in the handoff if uncertain. |
| `test/scene-postprocess.test.mjs` | **New.** Test pipeline factory: returns composer with correct passes per tier, respects reduced-transparency mock, dispose cleans up resources. |
| `test/scene-quality.test.mjs` | Add tier-field tests for the 4 new postprocess fields. |
| `PLANS.md` | Add a one-line entry under "recent" noting the postprocessing pipeline shipped. |
| `ART/postprocess-pipeline.md` | Update **Status** to "Shipped" with the date when work completes. |

## Out of scope — DO NOT extend into

- DOF (depth of field). Tempting, but tuning is hard on a wide-angle hero scene and it's gimmicky-by-default. Separate spec if reviewer ever wants it.
- SSAO (screen-space ambient occlusion). Expensive; marble + tower textures already bake darkening into recesses. Not worth the cost.
- Chromatic aberration. Wrong design language for babel.
- Motion blur. The scene is essentially static; adds nothing.
- Lens flares. Absolutely not.
- Asset-based LUTs. The grading curve must be GLSL-only — no PNG/CUBE LUT files added to the repo.
- Shader hot-reload, debug overlays, performance HUD. The existing scene-tuner is sufficient; do not add a postprocessing inspector.
- Touching the OutlinePass logic that already exists. Keep it as-is — it's the user's interaction feedback layer.
- Touching tower / ground / sky / cloud / marble materials. The grading is global; per-material tweaks are out of scope.
- Running `npm run format` over the tree. (See scope guards below.)

## Scope guards (read this before starting)

Same guards as cloister-fragment.md, repeated because formatter spillover keeps happening:

1. **No tree-wide formatting.** Do not run `npm run format` over the whole repo. Format only inside files you are actively editing for this spec.
2. **No surprise dependencies.** Three.js postprocessing modules are already in `node_modules` and the deferred scene bundle. Use what exists. Do not add npm packages.
3. **No scope expansion.** If you discover the spec is incomplete or contradictory, STOP and surface a question in the handoff rather than expanding to "fix" it.
4. **Honest handoff.** When done, write a handoff note that:
   - Lists every file you touched (not just the ones in the table above)
   - Reports the bundle-size delta in kB (before / after / Δ)
   - Names any deviation from this spec, with rationale
   - Calls out any formatter changes that landed in unrelated files
   - Names the new and modified tests
5. **Verify before handoff.** `npm run verify`, `npm test`, and `npm run build` must all pass. Report each result line in the handoff.

## Acceptance criteria

- [ ] Hero scene renders through the EffectComposer pipeline on all three tiers without console errors.
- [ ] On `high` tier, all four passes (grading, bloom, vignette, grain) are visibly present.
- [ ] On `balanced` tier, bloom is disabled; grading + vignette + grain remain.
- [ ] On `low` tier, only grading is active. Frame time on a representative low-tier device (mobile Safari iPhone 12 or equivalent) does not regress more than 1.5 ms vs. main.
- [ ] `prefers-reduced-transparency: reduce` disables vignette regardless of tier.
- [ ] OutlinePass interaction feedback continues to work exactly as before.
- [ ] All existing tests still pass; 1 new test file added.
- [ ] Bundle size impact: scene bundle stays under **820 kB** (current 783.8 kB, budget +36 kB for the new module + tier wiring).
- [ ] Visual character: the scene reads as **more composed and intentional**, not "filtered." Reviewer is the judge; iterate if asked. Aim for "I want to look at this longer," not "wow, effects."
