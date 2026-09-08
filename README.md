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

The eager, decorative tower poster is the scene's first visual. Capable hardware, including phones, then loads and crossfades to the live scene. The UI keeps the poster static and does not download the scene bundle when reduced data or reduced motion is requested, WebGL is unavailable, or the WebGL renderer is software-only. `?quality=low|balanced|high` and `?sceneDebug=1` explicitly request the live scene through preference/software gates, but cannot bypass unavailable WebGL.

The live high and balanced tiers optionally load a local stone color/roughness pair from `images/materials/`, after the scene has begun with procedural materials. Low tier and all static scene paths make no authored-material requests. Missing files, decode errors, or cancelled requests keep the procedural surface. Quality changes cancel stale loads and restore procedural materials before selecting the new tier; disposal releases the optional roughness atlas and decoded images.

Stone detail is composited inside the existing brick cells before the procedural stains and mortar. The original bump map remains authoritative, so no normal-map sampler replaces its relief. The optional roughness atlas is at most 512 by 1024 pixels; geometry, draw calls, camera, and postprocessing are unchanged. Source settings live in `src/scene/stone-detail.js`: soft-light color strength 0.35, roughness blend 0.7, and 32 percent source-image crops. Source attribution is recorded in [CREDITS.md](CREDITS.md).

For matched local comparisons, use `?quality=high&sceneDebug=1` and add `&stone=procedural` for the baseline. In debug mode, `window.BabelSite.sceneDebug.stone` reports loading, ready, fallback, or procedural. Check both camera angles and mobile before refreshing the static posters. The material transfer budgets are 750 KiB for the 1024 pair and 256 KiB for the 512 pair; tests also enforce that these requests stay outside the UI bundle and that published files match the source assets. Existing 30 KiB UI and 810 KiB deferred-scene bundle limits remain unchanged.

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
