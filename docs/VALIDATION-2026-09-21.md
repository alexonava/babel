# Dreamlike refinement validation — 2026-09-21

This records the local candidate reviewed before the user authorized publication. It is not a substitute for the required pull-request checks or production smoke tests.

## Scope and checks

- Matte tower roughness 0.90, mapped tree roughness 0.84–0.97, deterministic area-weighted foliage, authored-mesh tree grounding, and restrained cool fill.
- A still violet nebula, dust attenuation and a loose cluster within the existing star counts. No additional lights, draw objects or render passes.
- Seven automatic tour views at five seconds, hidden tour controls, retained Masonry comparison, existing About experience and static fallbacks.
- 391 tests, compilation verification, build and dependency audit passed locally; zero reported vulnerabilities.
- 32 matched before/after views (eight explicit compositions, two viewport sizes, high/balanced), 14 motion endpoints and four short landscape views passed visual review.
- Browser checks covered About/Contact focus and Escape, retained comparison modes, failed model loads, live quality transitions, reduced motion, no JavaScript, context loss/restoration and repeated disposal. Behavioral tests cover delayed parsing, cancellation and stale completions.
- All 12 delivered GLBs retain their hashes. Numeric checks found finite positions/normals/UVs, valid indices and nonzero normals. Inherited open/nonmanifold edges and four zero-area high-tree triangles remain documented limitations; no visible defect justified a rebake.
- Both responsive posters were refreshed without interface text baked into them. The local recovery archive preserves the prior source and artwork.

## Live-render comparison

Three interleaved network-cache-disabled navigations per build used the same desktop in-app browser, 1440×1000, high quality and a held comparison camera. They were not fresh OS/driver profiles. CPU samples cover actual rendered callbacks 2–5 seconds after readiness, not GPU durations.

| Median | Baseline | Candidate |
| --- | ---: | ---: |
| Ready | 396.5 ms | 411.0 ms (+3.66%) |
| Render callback CPU | 0.40 ms | 0.40 ms |
| Render callback CPU p95 | 0.60 ms | 0.60 ms |
| Rendered frame interval | 16.7 ms | 16.7 ms |
| Opening draw calls | 25 | 25 |

The agreed readiness/frame-cost regression limit was 5%. Draw calls also matched across all 32 held-view pairs. These measurements do not establish a general speed improvement.

## Lighthouse investigation

Three separate, uninstrumented default-mobile Lighthouse 12.6.1 runs per build used the same local Chrome and simulated throttling.

| Median | Baseline | Candidate | Existing gate |
| --- | ---: | ---: | --- |
| Performance | 71 | 71 | ≥80: failed locally |
| Accessibility / best practices / SEO | 100 / 100 / 100 | 100 / 100 / 100 | passed locally |
| LCP | 2120.0 ms | 2117.5 ms | ≤2500 ms: passed locally |
| CLS | 0 | 0 | ≤0.1: passed locally |
| TBT | 1925.0 ms | 2190.5 ms | ≤200 ms: failed locally |

TBT increased 13.79%. All runs made 26 requests, with unchanged model/terrain payloads and a slightly smaller total transfer. Scene evaluation cost increased while parsing cost decreased. The saved audit reports do not contain enough stack/driver detail to isolate shader first use, decoding or foliage setup. The candidate's third TBT sample was faster than every baseline sample; this variability does not erase the reported median regression. Some local CLI processes reported Windows temporary-profile cleanup EPERM after producing valid complete reports.

The existing Lighthouse thresholds are unchanged. Required GitHub checks must run on the proposed commit; their results must be reported separately from these local measurements.

## Payload limits

Active scene/UI bundles: 819,355 / 19,570 bytes (800.2 / 19.1 KiB), below 810 / 30 KiB. Conservative model/material totals, including mutually exclusive comparison textures: 5,492,866 / 1,938,798 bytes, below high/balanced 6 / 3 MiB. Originals and source texture resolutions are unchanged. The two new WebP posters are 47,500 / 40,254 bytes.
