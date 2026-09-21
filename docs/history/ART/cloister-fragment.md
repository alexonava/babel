# Ruined cloister fragment — asset spec v1

**Status:** Spec drafted; awaiting review.
**Owner once approved:** Codex executes from this spec.
**Reviewer:** project owner.
**Depends on:** `ART/marble.md` (marble palette + texture system, already shipped).

## Goal

Add the **first prestige-building primitive** to the babel scene: a procedural marble **column module** (drum stack + base + capital), and a single sample **cloister fragment** that demonstrates it (two columns flanking an arched architrave, weathered and scorched). The column module is the reusable artifact; the fragment is the proof-of-concept consumer.

This is the most art-demanding single piece on the babel backlog. It exercises:

- **Geometric sculpture** — fluting (vertical channels in the drum), capital decoration (volute or echinus shape), base profile (torus/scotia/torus). Procedural, not modeled.
- **Stacking + weathering** — drums slightly offset, chipped edges, missing pieces; the "ruined" silhouette is part of the design.
- **Burn / scorch overlay** — multi-pass painterly soot pass on the marble texture, biased to edges and lower drums (where fire would have licked highest).
- **Composition** — the fragment must read as a single intentional ruin, not three random objects in a row.

## Visual reference

- **Primary anchor**: `C:\Users\nava\source\dead-signal-3d-draft\apps\activity-client\src\assets\creative\flooded_cloister\lobby-backdrop.png` — same painterly cloister concept used for marble.md. The columns in the foreground are the geometric reference.
- **Mood anchor**: Doric/Ionic ambiguous — fluted shafts, restrained capital. Not Corinthian (no acanthus leaves — too detailed for procedural canvas approach).
- **Damage anchor**: think Pompeii / Ostia ruins — drums survive, capitals partially intact, scorch marks concentrated on lower 1/3 and at edges.

## Column module

Place under `src/scene/architecture/columns.js` (new directory). Module exports `createMarbleColumn({ height, drumCount, fluteCount, weathering, scorch, capitalStyle, ... })` returning a Three.js `Group` ready to add to a scene.

### Geometry pipeline

1. **Base** — three stacked discs (torus / scotia / torus profile). Use `LatheGeometry` over a hand-authored 2D profile, not three separate cylinders. Profile lives in `columns.js` as a frozen array of `[r, y]` pairs.
2. **Drum stack** — N drums (default 4, range 3–6 by parameter), each a fluted `CylinderGeometry` derivative. Fluting is achieved by displacing vertices on the radial axis using a sine function around the angle (`fluteCount` flutes default 16). Each drum slightly rotated relative to the one below (1–4° random, deterministic from seed) for the off-aligned ruin look.
3. **Edge chipping** — top edge of each drum has 1–3 random vertex displacements inward (deterministic from `(columnIndex, drumIndex, hash)`). Quality tier `low` skips chipping; `balanced` does 1; `high` does up to 3.
4. **Capital** — a wider square abacus on top of an echinus (curved cushion). Implement as `LatheGeometry` for the echinus + `BoxGeometry` for the abacus. No Corinthian foliage. Optional `capitalStyle: "missing"` parameter omits the capital entirely (for ruined columns).
5. **No bevels / no PBR**. Keep within babel's painterly procedural canvas approach. Material is `MeshLambertMaterial` (matches existing tower) with the marble texture from `createMarbleTextures`.

### Scorch / burn pass

This is the hardest art piece. Add `applyScorchOverlay(texture, { intensity, edgeBias, lowerBias, seed })` to `src/scene/textures.js` (extending the existing marble texture work, not creating a parallel system).

- Operate on the marble canvas before final compositing
- **Lower bias**: opacity gradient from 0 at top to `intensity` at bottom — fire rises and licks lower features
- **Edge bias**: extra darkening along contour edges (sample marble vein mask, dilate, multiply)
- **Soot patches**: 3–7 procedural irregular blobs (Perlin-ish noise, multi-octave) of darker tone, biased to the lower-edge region
- **Color palette**: use the same `MARBLE_PALETTE` plus three new tokens added to `palette.js`:
  - `scorchLight` — `#3a342e` (warm dark grey-brown)
  - `scorchDeep` — `#1a1612` (near-black with brown undertone, NOT pure black)
  - `scorchEdge` — `#5a4a3a` (sooted edge highlight)
- **Subtle, not theatrical** — the user's design language is restrained. Aim for "this stone has seen fire" not "video game corruption effect."

### Quality tier integration

Extend `src/scene/quality.js` with column-specific fields per tier:

| Field | high | balanced | low |
|---|---|---|---|
| `columnFluteCount` | 16 | 12 | 8 |
| `columnDrumSegments` | 64 | 48 | 32 |
| `columnEdgeChips` | 3 | 1 | 0 |
| `scorchSootPatches` | 7 | 5 | 3 |

Add tests verifying these fields exist + are ordered (analogous to existing marble field tests in `test/scene-quality.test.mjs`).

## Sample cloister fragment

Place under `src/scene/architecture/cloister-fragment.js` (new file in the new directory). Module exports `createCloisterFragment(qualityProfile, opts)`.

### Composition

- **Two columns** flanking, ~3.5 world-units apart (use `WORLD` constants from `src/scene/world.js` for coordinate authority — do NOT hardcode positions).
- **Left column**: full height, capital intact, mild scorch.
- **Right column**: top drum + capital missing (use `capitalStyle: "missing"` and `drumCount: 3`), heavier scorch.
- **Architrave fragment** spanning the columns — single `BoxGeometry` block, broken on the right end (vertex displacement). Same marble material.
- Anchored to the existing ground using `groundHeight` from `WORLD`.

### Placement

Behind a preview flag in `main.js`: `?preview=cloister` shows the fragment off to the side of the existing tower; absent, the fragment is not added. Same gating pattern as the marble preview cube introduced in marble.md.

**Placement coordinates: TBD by reviewer.** Codex should put it at `(x: -8, z: -4)` as a starting point and note this in the handoff for the reviewer to adjust.

## Files Codex may touch

| File | Modification |
|---|---|
| `src/scene/architecture/columns.js` | **New.** Column module. |
| `src/scene/architecture/cloister-fragment.js` | **New.** Sample fragment assembly. |
| `src/scene/palette.js` | Add 3 scorch tokens to a frozen `SCORCH_PALETTE` (or extend `MARBLE_PALETTE` if reviewer prefers — flag in handoff). |
| `src/scene/textures.js` | Add `applyScorchOverlay`. Extend the marble factory to accept an optional scorch param. |
| `src/scene/quality.js` | Add 4 column/scorch fields per tier. |
| `src/scene/index.js` | Wire the cloister-fragment preview flag (analogous to how `?preview=marble` is wired). |
| `src/main.js` | Parse `?preview=cloister` query param. |
| `test/scene-quality.test.mjs` | Add tier-field tests for the 4 new fields. |
| `test/scene-columns.test.mjs` | **New.** Test column-module API: returns a Group, respects quality params, deterministic from seed. |
| `test/scene-cloister-fragment.test.mjs` | **New.** Test fragment assembly: returns a Group, places at ground, respects preview flag absence/presence. |
| `PLANS.md` | Add a one-line entry under "recent" noting the cloister fragment shipped. |
| `ART/cloister-fragment.md` | Update **Status** field to "Shipped" with the date when work completes. |

## Out of scope — DO NOT extend into

- The existing tower. Tower stays canon: weathered limestone shell + scorched basalt plinth. **Do not apply marble or scorch overlay to it.**
- Multi-fragment scenes (a full cloister courtyard, an arcade run, etc.). One fragment only.
- Animation, particle effects (smoke, embers), audio. Static geometry only.
- Other prestige building types (temple façade, floor mosaic, etc.) — separate specs each.
- Any change to ground, sky, clouds, lighting, camera framing.
- Documentation refactors beyond the one-line PLANS.md entry and Status update.

## Scope guards (read this before starting)

These are explicit because the prior task (marble.md) was framed as "marble + formatter spillover" but actually shipped 5 features at once, which was painful to review.

1. **No tree-wide formatting.** Do not run `npm run format` over the whole repo. If you reformat, do it only inside the files you are actively editing for this spec, and call it out in the handoff.
2. **No surprise dependencies.** Do not add npm dependencies. Three.js postprocessing (`OutlinePass` etc.) is already vendored — use what's there.
3. **No scope expansion.** If you discover the spec is incomplete or contradictory, STOP and surface a question in the handoff rather than expanding to "fix" it. The reviewer will adjudicate.
4. **Honest handoff.** When done, write a handoff note that:
   - Lists every file you touched (not just the ones in the table above)
   - Explains any deviation from this spec, with rationale
   - Calls out any formatter changes that landed in unrelated files
   - Names any tests added or modified
5. **Verify before handoff.** `npm run verify`, `npm test`, and `npm run build` must all pass. Report each result line in the handoff.

## Acceptance criteria

- [ ] `?preview=cloister` renders two flanking marble columns + architrave fragment in the babel scene without console errors.
- [ ] Right column reads as ruined (top drum + capital missing) and visually distinct from left column.
- [ ] Scorch overlay is visible on lower drums of both columns and at edges, but does not dominate the marble character.
- [ ] All 4 new quality fields present in `high`/`balanced`/`low` tiers, ordered correctly.
- [ ] All existing tests still pass; 2 new test files added covering column and fragment APIs.
- [ ] No changes outside the file list in §Files Codex may touch — or if changes were necessary, they are documented in the handoff.
- [ ] Bundle size impact: scene bundle <950 kB after the change (current: 783.8 kB → +~165 kB budget for column geometry + scorch helpers).
- [ ] The fragment looks intentional and somber, not gamey or theatrical. Reviewer is the judge of this; iterate if asked.
