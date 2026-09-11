# Solar and starfield review

Status: implemented locally on `codex/solar-detail`, awaiting visual acceptance. The upgraded renderer has not been pushed or deployed. Fallback posters remain the accepted production assets.

## Released baseline

PR [#95](https://github.com/alexonava/babel/pull/95) released the reviewed `41fd39a58463d9aabd9b5c09fae8af558a7e4a75` sun revision through merge commit `5b710b7522cbafca25b2327e6f0de0608fff0fa7`. [Production run 34546598121](https://github.com/alexonava/babel/actions/runs/34546598121) succeeded, including the deployed-site smoke checks. Its rollback protection was retained.

A fresh production check on 2026-09-11 UTC confirmed HTTP 200, the Alex Nava title, byte-identical CSS/UI/scene assets, CSP/HSTS/nosniff headers, the intended 404 page, and the www-to-apex 301. Production scene: `scene.a33b772c.js`.

The release used the existing authenticated GitHub browser and connector session. The stale local gh CLI credential was left untouched.

## Renderer

- `src/scene/solar-body.js` owns the spherical photosphere, surface-rooted prominence ribbons, and asymmetric corona. Layered convection, evolving granulation, sparse sunspot regions, faculae, limb darkening, and slow rotation replace the sprite swarm. Local emission compression preserves highlight detail under the existing scene grading.
- `src/scene/starfield.js` owns one seeded point field with mostly faint stars, restrained color variation, horizon extinction, and independent low-amplitude twinkling.
- Both use the existing update, quality, resize, and disposal registry. No new project dependencies, asset downloads, lights, or public controls.
- The solar anchor stays [-85, 55, -29]. The physical radius is derived from the released opaque disc: 6.5 × 1.15 × 0.81 ÷ 2. The former MOON_POSITION internal constant is now SUN_POSITION.
- High/balanced/low use 12/6/0 loops and 4,200/2,600/1,200 stars. Surface shader detail also scales by tier. The loop material uses a single transparent pass.
- Downstream terrain/cloud random-number consumption is preserved. Tower geometry, cameras, lighting, palette, and page layout were not changed.

The appearance is informed by [NASA's solar structure reference](https://science.nasa.gov/sun/facts/). It is a restrained artistic rendering for the existing night scene, not a physical solar simulation.

## Verification

`npm run verify`, `npm test`, `npm run build:dist`, `npm run audit:ci`, and `git diff --check` passed. **272 tests, zero dependency vulnerabilities.** UI/CSS hashes are unchanged. New scene: `scene.94a3a6dc.js`, **802.9 KiB**, below the 810 KiB ceiling.

Observed in Chrome 152 on the RTX 5070 Ti:

- Exactly **four celestial draw calls per rendered frame** in high quality: stars, photosphere, prominences, corona. Low quality omits the prominence draw.
- High → low → balanced → high transitions produced the expected counts without shader errors.
- Repeated captures at identical elapsed time were byte-identical.
- Reduced-motion emulation froze all celestial times exactly. The production visibility handler, exercised with a simulated hidden document, suspended updates and resumed without accumulating the hidden duration.
- The ordinary reduced-motion load displayed the existing poster, with **zero scene-bundle or GLB requests**.
- A temporary foreground occluder covered the disc, loops, and corona correctly and was removed after testing. Disposal ownership and repeated disposal are covered by the new controller tests.

### View comparison

108 seeded canvas captures cover the shipped and upgraded versions, all nine views, desktop 1600×900 and phone 450×800, and approximately 0/12/36 seconds of the 48-second camera movement. Inspected at normal size and in contact sheets; no detached solar particles, visible edge shimmer in motion, or distracting synchronized twinkle.

All FOVs and camera source are unchanged. Desktop projection matrices match exactly. Phone text framing differs by at most 0.001031 projection-matrix units (about 0.42 screen pixels); small load/animation phase differences remain. The existing dark phone background silhouette also occurs in the baseline.

### Unthrottled frame timing

Real scene renders, not raw requestAnimationFrame callbacks: 2-second warmup and 8-second measurement, 480 frames each, 2350×1136 at DPR 1.09. Chrome focus emulation removed background throttling; no CPU/network throttle was applied.

| Measurement           | Shipped baseline | Upgrade |
| --------------------- | ---------------: | ------: |
| Median frame interval |          16.7 ms | 16.7 ms |
| 95th percentile       |          16.9 ms | 17.0 ms |
| Render rate           |           60 fps |  60 fps |
| Frames over 34 ms     |                0 |       0 |

This shows no material regression on this workstation; it is not a physical-phone performance measurement.

### Lighthouse limitation

Three runs per version, same unchanged repository assertions and default mobile throttling, performed after stopping the comparison renderers. Lighthouse 12.6.1 / headless Chrome 152:

| Median              | Shipped baseline |  Upgrade |
| ------------------- | ---------------: | -------: |
| Performance         |               68 |       68 |
| Accessibility       |              100 |      100 |
| Best practices      |              100 |      100 |
| SEO                 |              100 |      100 |
| LCP                 |         1,955 ms | 1,956 ms |
| CLS                 |                0 |        0 |
| Total blocking time |         3,899 ms | 4,006 ms |

**The local Lighthouse performance and TBT assertions fail on both versions.** This is not a passing release gate. The assertions were not weakened and no browser-specific bypass was added. Recheck Lighthouse in CI and resolve any remaining gate before releasing the upgrade.

## Local review and evidence

The upgraded Wrangler preview runs on [127.0.0.1:4175](http://127.0.0.1:4175/?quality=high&view=tower&angle=1&tour=5). The released reference remains on port 4174. Other checkouts were preserved.

Ignored local evidence lives in `.tmp-preview-review/`:

- `production-verification.json`
- `captures/comparison-summary.json` and 108 view PNG/JSON pairs
- `captures/comparison-desktop.jpg` and `captures/comparison-phone.jpg`
- `captures/runtime-checks.json`
- `captures/unthrottled-performance-{baseline,upgraded}.json`
- `lighthouse-{baseline,upgrade}-results.json`; full latest reports in `.lighthouseci/`

After visual acceptance: refresh the fallback posters, rerun release checks including Lighthouse, then use the protected production workflow. Do not publish the upgraded visuals before acceptance.
