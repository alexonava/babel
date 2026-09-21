# Last-pass cleanup + audit — spec v1

**Status:** Implemented; status reconciled and regression-tested 2026-07-23.
**Owner once approved:** Codex executes from this spec.
**Reviewer:** project owner.
**Depends on:** `ART/postprocess-pipeline.md` (shipped 2026-05-05). Slider removal already landed on this branch.

## Goal

Close out the post-postprocess polish window with four focused tasks, three implementation and one discovery. Order matters — items 1 and 2 are clear wins; item 3 is gated on reviewer approval; item 4 produces a written audit, not code edits. Each section is independently scopable so the reviewer can drop any item without affecting the others.

## Sequencing

1. **Scene-zoom internal cleanup** — mechanical, ships first.
2. **DPR cap lift for flagship touch** — small, high payoff on iPhone 16 Pro / modern Android flagships.
3. **Panel frame unification** — _gated, optional._ Only execute if the reviewer green-lights this section explicitly. If skipped, leave the About + Contact panel CSS untouched.
4. **Interaction / physics audit** — discovery pass. Output is `ART/scene-interactions.md`; **no code changes.**

If any earlier item produces an unexpected result, **stop and surface a question** before continuing — do not pile on fixes (project rule: don't compound fixes).

---

## 1. Scene-zoom internal cleanup

### Context

The scene zoom slider UI was removed on this branch. The internal zoom plumbing is now dead-ish weight: the scene initializes `compositionState.zoom = defaultZoom (18)` once at boot and never changes it, but the surrounding API surface (`SCENE_TUNER_DEFAULTS`, `applySceneTunerZoom`, `clampSceneTunerZoom`, `getSceneTunerDefaults`, `setSceneZoom`, `getSceneZoom`, `getSceneZoomRange`, `manualZoom` field) is all still present.

### Task

Collapse the zoom math into the base composition profiles, then delete the dead API.

**Concretely:**

For each of the five composition profiles in `src/scene/quality.js` (`compact`, `desktop`, `portraitPhone`, `landscapePhone`, `tabletPortrait`), pre-compute the values that `applySceneTunerZoom(profile, 18)` currently produces and bake them into the base profile literals. The transform is:

```
zoom = 18
isPortrait = name === "portraitPhone"
orbitScale = isPortrait ? 1.35 : 1.1
fovScale   = isPortrait ? 0.24 : 0.14
lookAtScale = isPortrait ? 0.07 : 0.04

new fov        = min(56, max(42, base.fov + zoom * fovScale))
new lookAtBase = max(0, base.lookAtBase - zoom * lookAtScale)
new orbitBase  = base.orbitBase + zoom * orbitScale
new orbitTrim  = max(0.04, base.orbitTrim - zoom * 0.002)
```

After the bake, `getSceneCompositionProfile()` should return the same numeric values it currently returns. Add a snapshot test to confirm before/after parity (or extend an existing test with the expected numbers).

### Then delete

| Symbol                                              | File                          | Action                                             |
| --------------------------------------------------- | ----------------------------- | -------------------------------------------------- |
| `SCENE_TUNER_DEFAULTS`                              | `src/scene/quality.js`        | Remove                                             |
| `applySceneTunerZoom`                               | `src/scene/quality.js`        | Remove                                             |
| `clampSceneTunerZoom`                               | `src/scene/quality.js`        | Remove                                             |
| `getSceneTunerDefaults`                             | `src/scene/quality.js`        | Remove from `scene.*` exports                      |
| `manualZoom` field on composition profiles          | `src/scene/quality.js`        | Remove                                             |
| `zoom` parameter on `getSceneCompositionProfile`    | `src/scene/quality.js`        | Remove                                             |
| `setSceneZoom`                                      | `src/scene/index.js`          | Remove                                             |
| `getSceneZoom`                                      | `src/scene/index.js`          | Remove                                             |
| `getSceneZoomRange`                                 | `src/scene/index.js`          | Remove                                             |
| `compositionState.zoom`                             | `src/scene/index.js`          | Remove (and the surrounding zoom-resolution logic) |
| `applySceneTunerZoom widens portrait framing…` test | `test/scene-quality.test.mjs` | Remove                                             |
| `clampSceneTunerZoom rejects NaN…` test             | `test/scene-quality.test.mjs` | Remove                                             |

The `composition profiles reframe portrait phones toward the tower` test in `scene-runtime.test.mjs` should still pass without changes — the post-bake numbers should match what the test asserts (it uses inequality assertions, not exact values).

### Acceptance

- [ ] `getSceneCompositionProfile({ width, height })` (no `zoom` param) returns numeric values identical to the pre-cleanup `getSceneCompositionProfile({ width, height, zoom: 18 })` output for all five profile names.
- [ ] No remaining references to `applySceneTunerZoom`, `clampSceneTunerZoom`, `SCENE_TUNER_DEFAULTS`, `setSceneZoom`, `getSceneZoom`, `getSceneZoomRange`, `getSceneTunerDefaults`, `manualZoom` anywhere in `src/` or `test/`.
- [ ] All tests pass.
- [ ] UI bundle is unchanged or smaller (no new imports). Scene bundle is unchanged or smaller.

---

## 2. DPR cap lift for flagship touch

### Context

`resolveEffectiveDprCap` in `src/scene/quality.js` currently knocks DPR down to 1.25 on any touch-primary device with hidden `deviceMemory` (every iPhone). This was a safety belt from when we couldn't distinguish a flagship from a budget phone. We just added a `flagshipCaps` gate to `selectSceneQualityTier` that does distinguish them — apply the same logic here.

### Task

Modify `resolveEffectiveDprCap` so the 1.25 cap applies only to _non-flagship_ touch devices. When the device passes the same `flagshipCaps` check (`maxTextureSize >= 8192`, `maxAnisotropy >= 8`, `hardwareConcurrency >= 6`), return the profile's full `dprCap`.

The function currently takes `{ touchPrimary, navigatorInfo }`. Extend the signature to also accept `caps` (the WebGL caps object passed in elsewhere in the same flow). Threadcaps through from the call site in `createSceneQualityState`.

### Acceptance

- [ ] Touch-primary device with `caps.maxTextureSize >= 8192`, `caps.maxAnisotropy >= 8`, `navigatorInfo.hardwareConcurrency >= 6`, and `profile.dprCap === 2`: returns 2.
- [ ] Touch-primary device with weaker caps + hidden `deviceMemory`: still returns `min(profile.dprCap, 1.25)` — the existing safety net stays for unknown phones.
- [ ] Desktop (touch-primary === false): unchanged, returns `profile.dprCap`.
- [ ] Existing `resolveEffectiveDprCap caps touch-primary devices with hidden deviceMemory` test in `scene-quality.test.mjs` is updated to cover the new flagship branch.

### Verification beyond tests

Manual check on at least one flagship phone if available: `?quality=high` should produce a sharper render than the current build (visibly less blur on text, sharper marble veining). If no device is available, ship and let the reviewer verify.

---

## 3. Panel frame unification _(optional — gated)_

### Status

**Do not execute this section without explicit reviewer approval.** This is an aesthetic call, not a correctness fix. The current panels are individually well-crafted and on-palette. Unifying them is a polish improvement, not a bug.

If approved, proceed as described. If not, skip entirely and report it skipped in the handoff.

### Context

The About panel uses a notebook metaphor (`panel-notebook` — binding rings, two-page spread, italic "A" watermark). The Contact panel uses a letter metaphor (`panel-letter` — single rotated sheet, wax seal, quill SVG). Both are warm parchment + brass and fit `STYLE.md`, but they read as two thoughtful one-offs rather than a designed pair: different metaphors, different compositions (square notebook vs. -1.2deg rotated letter), different ornamental hardware.

### Task

Pick **one** unifying frame system and apply it to both panels. The reviewer will choose between two options below. Default to option A unless the reviewer specifies otherwise.

**Option A: parchment cards on a shared surface.**
Both panels become single-sheet parchment cards (drop the notebook spread). Same paper treatment, same drop angle (either both straight or both at the same slight tilt — pick straight for calm-by-design alignment with `STYLE.md`). The About panel keeps its display "A" watermark; the Contact panel keeps its wax seal. The brass binding rings move to a single horizontal accent stripe shared by both panels (or are dropped entirely — the rings are notebook-specific). The quill SVG is dropped.

**Option B: both as notebook spreads.**
Contact panel gains a notebook spread structure with a binding column. Letter content moves to the right page; a "C" watermark replaces the wax seal. Quill SVG is dropped. Letter rotation is removed.

### Files Codex may touch (option A)

| File         | Modification                                                                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html` | Restructure `#panel-contact` to match `#panel-about` shape (single shared frame). Remove the quill SVG.                                                                                                         |
| `styles.css` | Add a shared `.panel-card-parchment` (or similar) class consolidating the parchment paper treatment. Reduce `.panel-letter*` and `.panel-notebook*` classes to surface variants. Remove `.panel-letter__quill`. |
| `STYLE.md`   | Add one line under "Interaction" noting the panel frame is shared across surfaces.                                                                                                                              |

### Files Codex may touch (option B)

Symmetric — apply notebook structure to `panel-letter`. Same kind of consolidation in CSS.

### Out of scope for both options

- Do not change the panel content text, the eyebrow / heading typography, or the bottom-bar icon canvases.
- Do not touch the `panel-overlay` open/close transitions or focus-trap logic — that's behavior, not framing.
- Do not introduce new color tokens. Use the existing palette.

### Acceptance

- [ ] About and Contact panels read as a designed pair: same frame, same paper treatment, same accent metal language.
- [ ] No reduction in per-panel character (the "A" watermark or the wax seal still distinguishes them).
- [ ] `STYLE.md` is updated to reflect the new pattern.
- [ ] The existing accessibility tests (focus trap, aria-controls, aria-labelledby, modal dialog semantics) all still pass without modification.

---

## 4. Interaction / physics audit _(discovery — no code edits)_

### Goal

Produce a written report identifying every place in the scene where decorative artifacts visually contradict the implied physics of the world. The babel scene is not a physics simulation; "physics" here means consistency with the scene's own rules: solid ground, attached objects, anchored cloud layers, oriented billboards.

### Output

A new file: `ART/scene-interactions.md`. Format:

```markdown
# Scene interactions audit

**Captured:** YYYY-MM-DD
**Auditor:** Codex

## System: <name>

- **Expected rule:** (e.g. "all ground-level plants sit on the y=0 plane")
- **Actual:** (what's true in the code, with file:line refs)
- **Gap:** (visible inconsistency, or none)
- **Severity:** (cosmetic / noticeable / breaks the illusion)
- **Suggested fix:** (one-line, no code)
```

**Do not propose fixes outside the suggested-fix line.** Do not edit any file other than `ART/scene-interactions.md` and `PLANS.md` (a single backlog row pointing at the audit doc).

### Systems to audit

At minimum, walk these and report on each:

1. **Ground solidity.** Is there a single ground reference plane? Do any sprites, particles, or decorative meshes pierce it or float visibly above it? Where is `WORLD.GROUND_Y` referenced and where is it ignored?
2. **Tower attachment.** Buttresses (8), relief bricks (36), and any other tower-anchored decoration — are they geometrically flush with the tower body, or do they have visible gaps / float?
3. **Cloud anchoring.** Drift clouds, ember clouds, haze clouds, pulse clouds, plume columns, mid-cloud sprites — does each respect its declared `cloudAnchorY` / anchor band? Do any drift below ground or above the camera near plane?
4. **Ground decoration.** Ground plant sprites, backdrop plant sprites, halo bands, halo twisters — sit on the plane? Or floating?
5. **Billboard orientation.** Sprite-based decorations — facing the camera correctly across orbit, or visible as flat planes from oblique angles?
6. **Camera-locked vs world-locked.** Decorative motion — is anything accidentally coupled to camera position when it shouldn't be (or vice versa)?
7. **Scroll coupling.** Hero scroll fade — does the scene actually parallax with scroll, or does scroll only fade opacity?
8. **Fog respect.** Anything placed past `fogFar` (~150) on the far side of the orbit — wasted fill or intentional silhouette?

If a system on this list isn't actually in the scene, write a one-liner saying so and move on.

### Out of scope

- Any code edit. The output is a markdown report, period.
- Fixing anything you find — log it as a suggested fix, not a patch.
- Audit of the postprocess pipeline. That just shipped; assume it is correct.
- Audit of the UI panels (About/Contact). Out of scope; only the 3D scene.
- Audit of accessibility, performance, or build-time concerns. Scene-interaction only.

### Acceptance

- [ ] `ART/scene-interactions.md` exists, follows the template, covers all eight systems above.
- [ ] Each finding cites at least one `file:line` reference.
- [ ] One row added to `PLANS.md` backlog: `Address scene-interactions audit findings | See ART/scene-interactions.md | Medium`.

---

## Cross-cutting scope guards

Same guards as the previous specs, repeated because formatter spillover keeps happening:

1. **No tree-wide formatting.** Do not run `npm run format` over the whole repo. Format only inside files actively edited for this spec.
2. **No surprise dependencies.** Do not add npm packages. Use what exists.
3. **No scope expansion.** If you discover the spec is incomplete or contradictory, stop and surface a question rather than expanding to "fix" it.
4. **Don't compound fixes.** If a change doesn't produce the expected result on the first or second iteration, stop and report rather than stacking attempts.
5. **Honest handoff.** When done, write a handoff note that:
   - Lists every file you touched (not just the ones in the section tables)
   - Reports the bundle-size delta in kB (before / after / Δ) for both bundles
   - Names any deviation from this spec, with rationale
   - Calls out any formatter changes that landed in unrelated files
   - Names every new and modified test
   - For section 3: state explicitly whether it was approved-and-executed or skipped
6. **Verify before handoff.** `npm run verify`, `npm test`, and `npm run build` must all pass. Report each result line in the handoff.

## Bundle budget

Scene bundle current ceiling: **820 kB** (set by the postprocess pipeline spec). This last-pass should _reduce_ both bundles (slider plumbing removal in section 1 deletes code with no replacement). If either bundle grows, surface why in the handoff.

## Out of scope across all sections

- Any change to the postprocess pipeline that just shipped.
- Any change to marble / cloister / column work that's already shipped.
- Any change to the bottom-bar icon canvases or the hero motion code.
- Any deploy or DNS or Cloudflare-side action.
- Any push or merge — reviewer handles git operations.
