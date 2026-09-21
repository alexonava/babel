# Dreamlike estate — local visual review

This isolated pass starts at production revision `82503f93fc34c54945f82f7d184f5cb8372f6db1` on branch `codex/dreamlike-estate`. Local preview: http://127.0.0.1:4180/. Production, original model files, the accepted map illustrations, social images and fallback posters are unchanged. Poster regeneration and release follow visual acceptance.

## Directed experience

The watch is the deterministic opening. Valid `view=tower|tree` and `angle=1..4` links keep their meanings. The eight-shot order and five-second tour remain intact. Detail fitting measures the intended focal volume rather than allowing distant geometry to force the camera backward. Portrait framing is resolved separately where necessary; complete-model bounds are retained for the two wide portraits.

The watch frames the crown and ember sun; Threshold approaches the upper entry wall obliquely; Masonry study isolates stone around a window; Gallery detail moves into the balcony. Portrait presents the whole tree. Lantern study focuses on the iron lantern and candle, Close-up looks up through a branch fork, and Root and lantern follows the ground and root forms.

## World and materials

A single mesh forms three fixed blue-violet ridges with directional relief and silver valley haze. Slow cloud veils occupy the existing world-space sky shell; old oversized cloud cards are suppressed during the film treatment. The fixed sun and starfield are retained.

The existing soil maps gain a matte winding approach and sparse moss/grass exclusion. One merged vegetation mesh samples the terrain around the tower and tree. The tree receives source-derived, surface-attached leaf silhouettes in a single instanced draw (3,600 high / 1,800 balanced, hidden on low). Positions and UVs in the borrowed model are never modified. Smoother normals are copied into one owned buffer and restored for baseline comparison, avoiding detached GPU buffers.

Stone, timber and bark receive restrained, reversible material grading. Fine bark modulation fades with pixel footprint. The post lantern sits outside the root mass, with matte iron, low-opacity glass, a small flame and localized amber light. Balanced quality retains these treatments without shadows or bloom. The final grade removes cel bands and reduces grain.

## Every click

About keeps its accepted map, labels and landmark coordinates. Paper light, edge shadows and keyboard focus are refined. Profile, Experience and Contact use three original transparent ink vignettes beside quiet writing areas. All wording and selectable HTML text, name styling, icon interaction, Back/Escape, focus restoration and transition timings are preserved. Generation provenance and UI evidence are in [PAPER-VIGNETTES-QA.md](PAPER-VIGNETTES-QA.md).

## Validation evidence

Local evidence is stored in the ignored `.tmp-preview-review/` folder. It includes baseline and final eight-view screenshots, desktop/phone comparison sheets, movement checks, UI screenshots, request/lifecycle checks, actual WebGL frame timing, and Lighthouse reports. Measurements are local to the tested hardware and browser; they are not promises about every device.

Run the checked-in regression suite with `npm test`, compilation with `npm run verify`, the production payload with `npm run build:dist`, and dependency audit with `npm run audit:ci`. No dependency or public API was added.

## Rollback

This is an unmerged worktree. The accepted production checkout and running previews remain separate. To compare the baseline, use http://127.0.0.1:4177/. Retain this checkout while reviewing; no migration or live-site rollback is required.


## Completed checks

- Full regression suite: **365 passing**, no failures or skipped checks.
- Source verification and dependency audit: pass; **zero vulnerabilities**.
- Frozen UI: `app.e45ca42b.js`, 19,570 B (19.1 KiB / 30 KiB).
- Frozen scene: `scene.adf84271.js`, 809.8 KiB / 810 KiB. Existing ceilings were retained; no dependency was added.
- Accepted map pair: 193,610 B (189.1 KiB / 200 KiB), unchanged bytes.
- Shared paper grain/edge plus all three vignettes: 182,994 B (178.7 KiB / 200 KiB).
- Complete tower/tree + earth + grass assets: 4,157,520 B high / 1,511,446 B balanced, within 6 MiB / 3 MiB budgets; no scene binary assets changed.
- UI: eight browser scenarios across all four dialogs, including high DPI, 200% CSS zoom, short landscape, reduced motion, blocked artwork and forced colors. Minimum body contrast sampled in the actual writing areas: 11.51:1.
- Scene: 20 lifecycle/request checks; deterministic opening, all eight explicit links, tour order/wrap, quality tiers, actual hidden-tab suspension, cloud controls, disposal/reinitialization, static reduced-motion requests, and a forced-live reduced-motion hold. No browser exceptions or console errors.
- Camera: 64 baseline and 64 final desktop/phone motion samples, with a final four-sample phone Watch correction. The drift captures use synthetic timestamps and are not performance measurements. The full tour push is also checked against real high/balanced geometry at arc extremes across five layouts. The final portrait Watch keeps the complete sun visible and the footing below the screen.
- Before/after review sheets: `.tmp-preview-review/contact-sheet-desktop.jpg` and `contact-sheet-phone.jpg`. Final single-view captures use the `final-` prefix; the final Watch movement correction uses `final-watch-motion-`.
- A runtime sky A/B caught the 130-unit transparent shell blending over more distant opaque ridges. Film sky now draws first in the opaque list, with calibrated original brightness; leaving film mode restores transparency.

## Measured rendering and startup audit

The completed visual scene (93d2b17b, before the startup-only reflection gate below) was measured on Chrome 152 / NVIDIA RTX 5070 Ti (D3D11), 1440 x 1000 at DPR 1, unthrottled. Serial baseline/final runs warmed up for 3.5 seconds and recorded nine seconds of actual WebGL-rendering callbacks, roughly 540 frames each. Empty browser animation callbacks were excluded. Every high/balanced Watch/Lantern comparison retained **16.7 ms median / 16.8 ms p95** frame cadence; the measured frame-cadence regression is below 10%.

| Render CPU submission, median / p95 | Baseline | Final |
| --- | --- | --- |
| High, The watch | 1.1 / 1.4 ms | 0.9 / 1.2 ms |
| High, Lantern study | 1.2 / 1.6 ms | 1.1 / 1.5 ms |
| Balanced, The watch | 0.9 / 1.2 ms | 0.8 / 1.0 ms |
| Balanced, Lantern study | 1.0 / 1.3 ms | 0.9 / 1.2 ms |

Final draw calls fell from 53 to 25 and 56 to 34 in the two high-quality comparisons, and from 32 to 11 and 37 to 19 in balanced. GPU median additions were at most 0.032 ms; final GPU p95 stayed below 0.586 ms. No browser errors or disjoint timer samples were recorded. These desktop measurements do not certify physical phone performance. Raw evidence: `.tmp-preview-review/environment-perf-final.json`.

Three-run Lighthouse 12.6.1 medians used the normal scene-first homepage and default simulated mobile throttling. Accessibility, best practices and SEO are **100 / 100 / 100**; LCP is **2,122 ms** and CLS is **0**, passing their configured gates. **Performance 68 and total blocking time 4,262 ms fail the existing 80 / 200 ms gates.** The production-baseline comparison also fails (66 / 9,167.5 ms), with significant run-to-run startup variation; this is not evidence that the visual patch reliably halves blocking time.

The audit exercises the intended balanced scene, not a forced high-quality/debug path. Idle scheduling defers the bundle but the existing full-world initialization and first render remain synchronous. Similar main-thread long tasks occur in both versions. This startup bottleneck remains unresolved and must be addressed before calling the release audit passing; thresholds were not weakened and no renderer bypass was introduced. The visual experience is available for local acceptance, with production and posters untouched.

Audit evidence: `.tmp-preview-review/performance-gates.json`, `lighthouse-final-{1,2,3}.{json,html}`, and matching `lighthouse-baseline-` reports. The `-final` render timing file and scene hash `93d2b17b` describe the completed visuals before the startup-only reflection gate; earlier experimental measurements remain in the ignored review folder for provenance.

### Final startup-only refinement

The final build is `scene.adf84271.js` (809.8 KiB). Quiet film mode now avoids allocating and rendering the six cube-map faces for invisible legacy puddles. Explicit previous/classic/assembled/orbit/baseline modes retain their deferred reflection; low quality still skips it. The camera binding is locally scoped. Three execution-based regressions cover allocation, legacy capture, and disposal before the delayed callback.

All **365 tests pass** on this final build, with no failures or skips (`full-tests-postgate.log`). The visual framing, shader/material treatment and UI are unchanged by this startup-only gate, so the before/after sheets and steady-state measurements above remain labeled with their original visual-build hash. The final local browser also confirms normal tour rendering and About navigation.

Three new Lighthouse runs on adf84271 give medians: **Performance 69**, **TBT 3,104 ms**, **LCP 2,118 ms**, **CLS 0**, and **Accessibility / Best practices / SEO 100 / 100 / 100**. The roughly 934 ms secondary task disappears, reducing measured TBT about 27% relative to the pre-gate median. **Performance and TBT still fail the configured limits.** A 2.35-2.50 s simulated synchronous initialization task remains. Properly splitting initial world construction or lazily creating the legacy fallback is follow-up architecture work; the local visual pass does not weaken the gates or claim a passing release audit.

The final startup evidence is `lighthouse-postgate-{1,2,3}.{json,html}` and `lighthouse-postgate-summary.json`. All production files and fallback posters remain unchanged.