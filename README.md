# babel

Source for [alexnava.me](https://alexnava.me/), a static portfolio site built with plain HTML, CSS, vanilla JavaScript, and a small Three.js scene.

## Stack

- Plain HTML, CSS, and vanilla JavaScript
- Three.js r160 imported from `three`, bundled into a deferred `dist/scripts/scene.HASH.js`, and tree-shaken by esbuild
- Responsive WebP tower posters under `images/` for first paint and the intentional static scene path
- Instrument Sans + Cormorant Garamond woff2 subsets, self-hosted under `fonts/`
- Minimal esbuild step: edit readable source in `src/`, generate deploy output into `dist/`
- Lightweight `node:test` coverage for scene/runtime/UI verification under `test/`
- Cloudflare Pages Direct Upload for production hosting

## Local development

Use Node.js 22 or newer.

```powershell
npm install
npm run preview
```

Then open [http://127.0.0.1:4173/](http://127.0.0.1:4173/). This uses `wrangler pages dev` so local preview stays closer to the Cloudflare Pages shape than a bare static file server.

The source repository does not track generated JS bundles. `dist/` is the only generated publish payload.

## Build commands

```powershell
npm run build       # build dist/ from source
npm run build:dist  # same as build; explicit deploy-oriented entrypoint
npm run preview     # build dist/ and serve it through Wrangler Pages locally
npm run audit:ci    # fail on high or critical npm advisories
npm run verify      # compile-check all JS entry points without writing files
npm test            # run the node:test suite in test/
npm run watch       # watch src/ and rebuild dist/scripts
npm run format      # prettier-format src/, *.html, *.css, *.md
```

Asset filenames in `dist/` are content-hashed by `build.mjs` (e.g. `scripts/app.HASH.js`, `scripts/scene.HASH.js`, `css/styles.HASH.css`); the UI boot script and deferred Three.js scene script are separate bundles, so rerun `npm run build:dist` after changes — the hash moves automatically and cached HTML revalidates against the new path.

The build also writes content-hashed landscape and portrait poster copies and rewrites the published `src`/`srcset` URLs. Returning browsers therefore request a new image URL when poster content changes. Stable poster copies remain available for older HTML, and all image URLs retain the existing seven-day revalidation cache policy.

The eager, decorative tower poster is the scene's first visual. Capable hardware, including phones, then loads and crossfades to the live scene. The UI keeps the poster static and does not download the scene bundle when reduced data or reduced motion is requested, WebGL is unavailable, or the WebGL renderer is software-only. `?quality=low|balanced|high` and `?sceneDebug=1` explicitly request the live scene through preference/software gates, but cannot bypass unavailable WebGL.

## Supplied Meshy architecture pilot

The default high and balanced live scene uses the supplied complete watchtower, with its stone walls, timber balcony, tiled roof, and entrance preserved. It is uniformly fitted to a 34-unit height on the existing plinth, with its entrance facing the opening camera. The replacement tree retains its distant position, warm lantern, and restrained canopy fill.

The complete watchtower uses a grounded night treatment: neutral moonlight, softer plinth contrast, muted nearby stones, and no inherited orbit rings, roof smoke, or crown light. It activates only after a successful tower load and restores the original scene on fallback. Add `&refinement=baseline` to compare the prior watchtower presentation; geometry, source textures, and asset downloads are unchanged.

Use `?quality=high&sceneDebug=1` for the complete watchtower. Add `&architecture=assembled` for the earlier five-model tower with its solid spiral masonry support, or `&architecture=classic` for the accepted local construction baseline. Classic brick, stone, and construction controls remain available within `architecture=classic`.

Models load after the first rendered scene frame. Complete mode downloads only the tower and tree; assembled mode downloads the four masonry roles and tree. The tree loads independently. Low quality and failed downloads retain the procedural scene. Quality changes and disposal restore original visible groups before releasing optional resources. Both supplied modes disable classic stone maps and BRK1 downloads. `window.BabelSite.sceneDebug.architecture` reports the selected mode and readiness.

The total optional model and embedded-texture budgets remain 6 MiB high and 3 MiB balanced per selected mode. The build fingerprints all twelve GLBs under `images/architecture/`. The installed Three.js GLTFLoader needs no external decoder or new dependency. Embedded image decoding uses local blob URLs; the content policy allows these for images and connections while retaining same-origin network restrictions.

This local pilot is pending visual acceptance. Existing posters and the protected publication workflow remain unchanged.

## Authored ground material

Every live high and balanced scene, including `architecture=classic`, optionally replaces the procedural ground canvas with a planar bake of the supplied Meshy "Cracked Desert Ground" model. The scene starts on the procedural surface; after the first frame it requests `images/materials/ground-color-{1024|512}.webp` and `ground-normal-{1024|512}.webp` (568,950 bytes high, 188,032 bytes balanced), then rebinds the ground mesh to the authored colour and normal maps with mirrored 5×5 repeat and normal scale 0.85 (`GROUND_DETAIL_SETTINGS` in `src/scene/stone-detail.js`). Low tier and static paths request nothing. A missing or failed map keeps the procedural pair; quality changes and disposal rebind the procedural maps before releasing the authored textures. Add `&ground=procedural` to compare the previous surface; `window.BabelSite.sceneDebug.ground` reports status. The pair counts toward the 6 MiB high / 3 MiB balanced optional payload budgets, with per-size limits of 640 KiB and 224 KiB.

The bake is a local helper retained with the source artwork: the 3.1M-triangle slab is software-rasterised top-down at 2048², the central 80 % is kept, a Sobel normal map is derived from rasterised height at strength 2.2, recesses are darkened from a 25-pixel local height difference (cavity 6), and colour is desaturated to 35 %, contrast 1.4, with its mean remapped to the ground palette base `#7c8290`. Edge sampling clamps because the runtime mirrors the tile. WebP quality is 80 for colour and 90 for normals. Attribution is recorded in [CREDITS.md](CREDITS.md).

## Classic stone and construction comparison

The following material behavior and limits apply when `architecture=classic` is selected.

The live high and balanced tiers optionally load a local stone color/roughness pair from `images/materials/`, after the scene has begun with procedural materials. Low tier and all static scene paths make no authored-material requests. Missing files, decode errors, or cancelled requests keep the procedural surface. Quality changes cancel stale loads and restore procedural materials before selecting the new tier; disposal releases the optional roughness atlas and decoded images.

Stone detail is composited inside the existing brick cells before the procedural stains and mortar. The original wall bump map remains authoritative, so no normal-map sampler replaces its relief. The optional roughness atlas is at most 512 by 1024 pixels. Source settings live in `src/scene/stone-detail.js`: soft-light color strength 0.35, roughness blend 0.7, and 32 percent source-image crops. Source attribution is recorded in [CREDITS.md](CREDITS.md).

The brick and stone direction was visually reviewed before integration. High and balanced live scenes also load one shared 838-triangle Meshy 6 geometry from `images/materials/stone-brick.bin`, a compact BRK1 binary. The accepted raised-brick pass preserves the existing blocks' placement, orientation, and proportions. The construction pilot below extends that same geometry to selected crown blocks while retaining the tower walls, collapse layout, rubble, camera, animation, lighting, and draw-call count. Individual bricks use the authored stone color and roughness without sampling the full-wall mortar bump. No GLB loader, external decoder, or additional dependency is required.

The brick begins as the original box while its optional geometry loads. A failed request or invalid binary keeps those boxes, and low quality makes no brick request. High and balanced share the same geometry; switching to low or disposing the scene aborts pending work, restores the original geometry and materials, and releases owned resources. Late requests cannot mutate a disposed scene. Material requests and their quality-specific reset remain independent of the geometry request.

The construction pilot adds limestone stair treads and reuses the accepted brick geometry on selected crown blocks. It is local and pending visual acceptance; the existing posters still show the accepted raised-brick and texture pass. High and balanced tiers request one additional shared `images/materials/stone-tread.bin` geometry with 180 triangles in 8,648 bytes, below its 200-triangle and 9,608-byte limits. Both geometry sets use the existing Firefly/Meshy stone maps, with no new image downloads. Crown blocks share the existing brick request and decoded geometry. Low and static paths retain the original scene without requesting either binary.

Use `?quality=high&sceneDebug=1&architecture=classic&construction=baseline` to compare against the accepted raised-brick scene, leaving the original crown and stairs in place. `&brick=boxes` or `&stone=procedural` also disables construction changes. `window.BabelSite.sceneDebug.treads` reports tread readiness alongside `sceneDebug.bricks` and `sceneDebug.stone`. Tread loading and failures remain independent of the shared brick request; both controllers restore their originals before shared material maps are reset or released. Each authored mesh uses cached bounds that account for its current scale and parent transforms, keeping thin treads from adding off-screen draw calls. Original bounds are restored with the original geometry.

For matched classic-material comparisons, use `?quality=high&sceneDebug=1&architecture=classic`. Add `&brick=boxes` to compare the original geometry while retaining authored stone detail, or `&stone=procedural` for the fully procedural baseline, which disables both authored stone and brick geometry. In debug mode, `window.BabelSite.sceneDebug.stone` reports loading, ready, fallback, or procedural. The raised-brick direction was reviewed on desktop and mobile, across a full orbit and close details. Construction changes require their own matched comparison before the posters or release are updated.

The refreshed posters retain the existing 1600 by 900 landscape and 900 by 1600 portrait dimensions. They were captured directly from the high-quality canvas with both optional resources ready, preserving the initial camera profiles and excluding page text. A local capture helper uses seed 23917, DPR 1, and a controlled 17 ms scene advance; portrait output reuses the existing 450 by 800 `portraitPhone` composition at native output resolution. PNG masters, original poster backups, and camera metadata are retained with the source artwork. WebP quality 80, method 6 preserves the canvas alpha; the landscape and portrait files are 91,836 and 89,572 bytes.

The combined geometry and material transfer budgets stay at 750 KiB for high quality and 256 KiB for balanced. The accepted brick and maps use 757,748 and 230,672 bytes respectively, including the 40,232-byte brick binary. With the 8,648-byte tread, the construction pilot totals 766,396 bytes for high and 239,320 for balanced. The brick retains its separate limit below 48 KiB; tests also cap the tread at 200 triangles and 9,608 bytes and enforce exactly two geometry assets so crown reuse adds no download. Tests enforce these combined budgets, keep loading and decoding outside the UI bundle, and confirm the published assets match the source. Existing 30 KiB UI and 810 KiB deferred-scene bundle limits remain unchanged.

CI and production deploys follow the same gate order: `npm run audit:ci`, `npm run verify`, `npm test`, then `npm run build:dist`.

## Security baseline

`_headers` is the repo's intended source of truth for Cloudflare Pages response headers. It removes the Pages default wildcard CORS header, keeps the site on a self-only CSP with forms, frames, and workers disabled, blocks framing with both `frame-ancestors 'none'` and `X-Frame-Options: DENY`, sends `nosniff`, restrictive permissions, COOP/CORP, and one-year preload-capable HSTS.

Cloudflare Web Analytics/RUM injection is disabled by design. Do not widen `script-src` for `static.cloudflareinsights.com` unless the privacy/CSP tradeoff is intentionally reopened.

**Cloudflare dashboard can override `_headers`.** Managed Transforms (Rules → Transform Rules → Managed Transforms), Speed → Content Optimization → Speed Brain, Security → Settings → Super Bot Fight Mode → JS Detections, and SSL/TLS → Edge Certificates → HSTS Settings all layer after the file and can silently change values or inject scripts/headers. Before assuming the live response matches `_headers`, fetch the apex and exact Pages hostname and diff them against the tracked contract. Specifically watch HSTS `max-age`, CSP, `Referrer-Policy`, `X-Frame-Options`, `/cdn-cgi/challenge-platform`, `/cdn-cgi/speculation`, and any injected `Access-Control-Allow-Origin`/`X-XSS-Protection`/`Expect-CT`.

Hostname routing and zone controls live in Cloudflare, not in this repo: keep `alexnava.me` active as a native custom domain on Pages project `alexnava-me`, with the proxied apex CNAME targeting `alexnava-me.pages.dev`; redirect `www.alexnava.me` to the apex; and keep preview traffic access-controlled where needed. The exact production Pages hostname is canonicalized to the apex with one account-level Bulk Redirect, while Cloudflare adds noindex to branch preview deployments by default. Do not restore the retired `babel-apex` apex route or the retired `babel-bot` apex/wildcard bindings: placing a Worker in front of the native Pages hostname can create a redirect loop. Re-confirm the Cloudflare project, DNS, certificate, WAF, and CAA state before any deploy or DNS/security setting change.

GitHub CodeQL default setup is enabled as the repository's code scanner, avoiding a duplicate advanced-setup workflow. See [OPERATIONS.md](OPERATIONS.md) for release gates, environment-scoped credentials, smoke checks, the sanitized weekly Cloudflare audit, and rollback procedure.

## Repository layout

| Path                      | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `index.html`              | Homepage markup and panel structure                      |
| `styles.css`              | Site-wide styles, `@font-face`, tokens, responsive rules |
| `src/`                    | Authoritative JavaScript source for UI and scene bundles |
| `dist/`                   | Generated publish directory for Cloudflare Pages         |
| `fonts/*.woff2`           | Self-hosted font subsets                                 |
| `images/*.webp`           | Responsive static tower posters                          |
| `images/architecture/` | Optional textured architecture and tree GLBs |
| `images/materials/`       | Optional stone and ground WebP maps and shared BRK1 brick geometry |
| `404.html`                | Not-found page                                           |
| `og.png`                  | Social share image for Open Graph and Twitter cards      |
| `llms.txt`, `sitemap.md`  | Public AI-agent discovery and site-map documents         |
| `index.md`, `site-agents.md` | Markdown homepage and sanitized public `/AGENTS.md` guide |
| `_headers` / `_redirects` | Static hosting config kept with the site                 |
| `build.mjs`               | esbuild + asset assembly script                          |
| `package.json`            | Build, deploy, and formatting scripts                    |
| `OPERATIONS.md`           | Release, audit, credential, smoke, and rollback runbook  |

## Reporting issues and discussing changes

- Use [GitHub Issues](https://github.com/alxnva/babel/issues) for bug reports, questions, and feature ideas.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for the change flow and pull request expectations.
- See [SECURITY.md](SECURITY.md) for private vulnerability reporting guidance.

## AI agent discovery

The build publishes a small, public agent-readable layer without exposing repository instructions: `/llms.txt`, `/sitemap.md`, `/index.md`, and `/AGENTS.md`. Keep these files accurate, public, and non-sensitive; the repository's root `AGENTS.md` remains internal.

## Deployment

- Direct Upload deploys target Cloudflare Pages project `alexnava-me`.
- Deploy commands require Wrangler authentication. The review-gated `preview` and main-only `production` GitHub environments exist. The remaining credential migration is to store separate environment secrets named `CLOUDFLARE_PAGES_API_TOKEN` plus a shared repository variable named `CLOUDFLARE_ACCOUNT_ID`; current runs can still fall back to the legacy repository secrets until both new paths validate.
- Use `npm run deploy:preview` to publish `dist/` to the Pages preview alias.
- Production has no direct local npm deploy command. The protected `main` branch requires an explicitly approved pull request; merging it triggers the `Deploy Pages` workflow that owns the release gates and Cloudflare upload. Approved reruns use that workflow's manual dispatch on `main`.
- Cloudflare Pages should publish `dist/`, not the repo root.
- The build copies `LICENSE` into `dist/` so released assets ship with the project license text.
- GitHub Actions production deploys from `main` hard-fail on missing credentials and use one checked-in script to verify the deployment URL, apex marker/security headers, hashed-asset parity, a real 404, and the `www` redirect. A post-upload failure rolls back to the captured successful canonical deployment, verifies it with the same script, and leaves the workflow failed. Preview runs skip cleanly when credentials are unavailable and always publish to a `preview-*` branch alias.

## License

This project is released under the MIT License. See [LICENSE](LICENSE).

Ground refinement uses eight repeats and a restrained 0.45 normal strength to keep dry-earth detail subordinate to the tower. Partial map preparation releases completed textures before retaining the procedural fallback.

### Damp earth and prop scale (local comparison)
Complete-tower mode uses deterministic mud color, normal and roughness maps after the tower loads. The existing downloaded ground pair supplies subtle source detail; no extra downloads are made. The tile spans 10.56 world units at both resolutions, with normal strength 0.22 and roughness from 0.55 to 0.9. `ground=desert` retains the dry authored surface and `ground=procedural` retains the original ground. `scale=baseline` independently restores original prop sizes.

Scale reference D is 6.6 units: a centreline ray scan of the high tower at yaw zero found the arch front beginning near y=8.24 above its y=1.64 footing. Tree, torches, lantern, stones, rubble and plants use the approved D ratios. Plinth footprint and entrance height remain fixed; its existing 0.5-unit seam is already below the 0.528-unit trim cap. Generated maps and prop transforms restore on fallback or teardown. Posters and publication remain unchanged.

Complete-tower mode now seats its original footing directly into earth (0.22-unit embed), hides all layers of the old raised plinth, and grounds nearby props on terrain. The tree and lantern move 5% inward to (55.1, 36.1), retaining their sizes. `setting=plinth` restores the platform and original tree anchor for comparison. Mud near the footing is slightly darker and matte, with more restrained wet patches and fine source grain. Architecture fallback remains unchanged.

The terrain height field also holds a small flat terrace under each of the tower and tree footprints, blending smoothly back into the rolling terrain a short distance out. A flat terrace (rather than a simple additive bump) is needed because the ground's natural slope under a footprint would otherwise still leave one side touching and the other floating, even after an overall lift. Since terrain, object placement and prop scatter all read the same height field, both structures sit fully flush with the ground from every angle rather than exposing a seam.

### Prior cinematic setting (`cinematography=baseline`)

The baseline complete watchtower uses a quiet earth setting: scattered props, tower
braziers and their light/animation work, and obsolete ground decals are disabled.
The tower, tree, lantern and doorway-based proportions stay unchanged. Mud has
sparse damp response and matte contact around the footing and roots.

One subject and one of its three angles are selected once per page load. Each
shot uses a 38-degree vertical field of view and a bounded 48-second, +/-4-degree
arc. Reduced motion holds the midpoint. Framing reserves the text/navigation
space and fits actual world bounds without resizing the models. Camera-relative
fog distance retains subject readability at responsive framing distances.

Local review parameters:

- `view=tower&angle=1`, `angle=2`, or `angle=3`: entrance-side tower compositions.
- `view=tree&angle=1`, `angle=2`, or `angle=3`: lantern-side tree compositions.
- `view=orbit`: prior orbit with the quiet setting.
- `setting=previous`: previous orbit, clutter, lighting and mud response.
- Existing architecture, ground and scale comparisons remain available.

The selected subject must load before the live canvas is revealed. Tree failure
uses the tower shot; tower failure and low quality retain the procedural fallback.
No release posters or publication state were changed for this local comparison.


### Directed moonlit scene (local visual review)

Default complete-tower mode now uses seven curated shots: three for the tower, four for the
tree. `cinematography=baseline` restores the prior six-angle presentation above. Selection
occurs once per document; resizing, font loading, quality changes and panel interaction do
not reroll it. Subject probability is equal (tower/tree 50/50); the shot within a subject is
equally likely among however many that subject has (three for tower, four for tree).

| Preview | Shot | Vertical region | FOV | Azimuth | Initial camera height |
| --- | --- | --- | --- | --- | --- |
| `view=tower&angle=1` | Arrival | Full tower | 38 | -6 | 34% |
| `view=tower&angle=2` | The watch | Upper 45% | 32 | -40 | 66% |
| `view=tower&angle=3` | Threshold | Lower 45% | 36 | 72 | 12% |
| `view=tree&angle=1` | Portrait | Full tree | 36 | -77 | 24% |
| `view=tree&angle=2` | Under the branches | Full tree | 44 | 70 | 10% |
| `view=tree&angle=3` | Lantern study | Lower half | 34 | -115 | 15% |
| `view=tree&angle=4` | Close-up | Mid band, 30% span | 30 | -40 | 50% |

Arrival sits a little lower so the tower looms; Portrait matches that low, committed
angle so the tree looms too, rather than just centering it. The watch places the camera just
below the gallery, looking up at balcony and roof. Threshold is low and close at
the entrance. Under the branches now looks across the field from the far side of
the tree: the lantern glows beside the trunk and the watchtower stands in the haze
beyond, so the two subjects share one place. Close-up sits at canopy height for a
tight, dense look at the trunk fork and lower branches — a different idea from Lantern
study's grounded roots-and-lantern warmth.

Heights are measured above the subject footing. Geometry is clipped to the shot
region, projected at the midpoint and arc limits, and fitted within 85% of the
available composition area (93% for Portrait/Under the branches/Lantern study and 95% for
Close-up, for a more intimate, closer-filling frame). The lantern study takes its horizontal anchor from
the roots, trunk and complete lantern; incidental branches may crop. Low cameras
rise only when necessary to clear terrain and retain a line of sight to the
footing. Elevation then remains fixed during the 48-second movement: +/-4 degrees
for full views and +/-2 for detail views, with a 2.5% breathing dolly. Tour shots
dolly in by 4.5% over their dwell; the fit keeps a 15% margin, and terrain
clearance is sampled across the dolly range. Reduced motion holds the midpoint at
full distance; developer camera control takes priority. Phone detail crops receive a
subtle scene-only text gradient. Measurements and responsive fits are cached.

The film treatment keeps a light cel banding (0.16), removes ink edges and
orange flare effects, softens cloud contrast, hides the floating point field, and
and, darkened and warmed on Alex's request into a true night grade, uses contrast 0.99, bloom 0.2,
grain 0.014, highlight warm mix 0.2, shadow cool mix 0.1 and vignette 0.14. The supplied tower and tree colour maps carry
baked daylight, so film applies a moonlight grade through material uniforms
without rebuilding shaders: saturation 0.80/0.86, sunlit highlights compressed
0.38/0.20, a faint warm tint, and near-black undersides lifted toward a dim warm
and near-black undersides. Under film the amber key drops to 50% while fill (110%), hemisphere
(125%, with a warm earth ground colour) and ambient (95%) hold; the shadow radius
softens to 4.2 and shadow extent follows the subject at radius+8 (minimum 12).
Moonlight direction is unchanged. Lantern base intensity is 3.4 with a 13.2-unit
range; quality scaling still applies. Tree emission is 0.04 and its supplemental
light is cool neutral at 40% of its prior intensity. No lights or shadow passes
are added.

The lantern is an iron post lantern authored 2.48 units tall: foot, post, tray,
four stiles, top plate, pyramid cap and finial ring merge into one frame, with
four tinted glass panes, a candle and an emissive flame that carries the point
light. All of its geometry and materials are owned and disposed with the tree.

One indexed 384-unit terrain plane with 128 subdivisions per side replaces the
circular ground. It samples the existing height function with the correct rotated
world Z, takes its normals from the height field itself (central differences over
half a quad, so lit earth shows no quad-aligned shading), preserves direct
footing, and blends distant earth into the horizon.
Poly Haven's CC0 Dirt supplies color, OpenGL normal and roughness detail. The
published two-meter tile is calibrated to 6.3 scene units from D=6.6. The colour
map keeps the source's local contrast (pebbles, cracks, tonal patches) against a
tile-scale mean at a warm damp night-earth level, and the normal map is
high-passed so no tile carries a large-scale slope or luminance gradient (the
scan's own tile-edge darkening otherwise reads as a grid); normal scale is 0.7.
Film shadows use bias -0.0016 and normal bias 0.09 so relief-mapped earth shows
no acne under grazing moonlight. Contact areas remain matte, damp patches
sit at roughness 0.74 with bounded grazing response, so the earth reads at low
camera angles without sheen smears.

The three `earth-*.webp` maps total 518,196 bytes at 1024 and 99,338 bytes at 512,
under the 600/200 KiB ground limits.

Patchy grass (`src/scene/grass-detail.js`, own loading channel, disabled outside film)
blends into the earth material away from the tower footing and tree roots, using
CC0 Poly Haven Sparse Grass (`grass-{color,mask}.webp`, its own 9-unit tile so it
doesn't correlate with earth's 6.3-unit repeat). The two maps total 232,576 bytes
at 1024 and 64,540 bytes at 512, under a 250/90 KiB budget. A distant hill
silhouette (`src/scene/hill-silhouette.js`) rises just past the tree's own radius,
built from a real 48-sample elevation traverse baked as source constants — no
texture, no runtime fetch, zero payload; it hides on the low quality tier.

Complete tower, tree, ground and grass together total 4,157,520 bytes high and
1,511,446 bytes balanced, below the 6/3 MiB deferred limits. They load only after
successful complete-tower activation. A failed companion map retains the
procedural surface; stale images close without rebinding. Quality changes and
teardown restore borrowed resources before disposing derived maps, terrain and
cloud textures. The older authored-ground download is disabled in this path,
while `ground=desert` and `ground=procedural` remain available.

`view=orbit`, `setting=previous`, `architecture=assembled`, `architecture=classic`,
and existing material/scale comparisons remain intact. Tree failure chooses a
tower shot; tower failure, reduced-data and unavailable WebGL retain their existing
fallbacks. Source provenance is in CREDITS.md and the local artwork archive.
Local desktop/phone captures cover all seven shots and both movement limits.
The release posters are captured from the Arrival shot of this scene (landscape
1600 by 900 desktop composition, portrait 900 by 1600 phone composition resolved
at logical 450 by 800), as the composited page with all copy hidden at DPR 1,
seed 23917 and a controlled clock, then WebP quality 80: 38,724 and 44,838 bytes.
First paint and the static fallback therefore show the watchtower that the live
scene crossfades into. Publication is unchanged.


For an automatic local review, add `tour=5`, `tour=3`, or `tour=20` to a
directed-view URL. The tour cuts through all seven loaded cameras with a gentle
horizontal drift and slow dolly-in within each shot. Cuts dip to black: the
outgoing view darkens slowly over the last 1.1 s of its dwell and the next opens over
1.3 s through the existing final pass, with no added pass. `tour=5` and `tour=3`
hold a fixed dwell as before; `tour=20`, added on Alex's request for a much
slower, more intimate pace, dwells 20 seconds per shot with an occasional
5-second "wildcard" shot (a 20% chance, sampled fresh each time a shot starts —
`TOUR_DWELL` in `camera-tour.js`) for variety. It starts with the
selected `view` and `angle`.
Pause, Next view and timing controls appear beneath the intro. Panels, developer
camera control and reduced motion pause cycling; Next view still works with
reduced motion. Missing subjects are skipped. No models reload between cuts,
and URLs without `tour` retain one composition per document.
