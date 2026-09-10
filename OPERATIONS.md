# Operations

This runbook covers the repository-owned path from source to Cloudflare Pages. Dashboard, DNS, secret, push, and deploy changes still require explicit approval.

## Release gates

Use Node.js 22 or newer. The local equivalent of CI is:

```powershell
npm.cmd ci
npm.cmd run audit:ci
npm.cmd run verify
npm.cmd test
npm.cmd run build:dist
```

`npm run audit:ci` fails on high or critical npm advisories. Lighthouse runs three times, asserts against the median to absorb runner warm-up variance, and hard-fails below performance 0.80, accessibility 1.00, best practices 0.95, or SEO 1.00, and above LCP 2500 ms, CLS 0.10, or TBT 200 ms. Lighthouse reports are retained as GitHub Actions artifacts instead of Lighthouse temporary public storage.

## Scene delivery policy

The responsive tower poster is eager and decorative, so it remains a truthful first visual even before JavaScript. Capable hardware, including real phones, follows the normal deferred live-Three.js path. Before downloading that bundle, the UI keeps the poster static when reduced data or reduced motion is requested, WebGL is unavailable, or the probed renderer is software-only (for example SwiftShader, llvmpipe, a software rasterizer, or Microsoft Basic Render Driver).

`?quality=low|balanced|high` and `?sceneDebug=1` are explicit diagnostics that force the live path through preference and software-renderer gates. They still stop when WebGL is actually unavailable. Do not add user-agent, Lighthouse, or phone-viewport exceptions; the default audit must measure the same product policy visitors receive.

## Supplied architecture pilot validation

Keep this rebuild isolated from PR #93 until visual acceptance. Compare the default complete watchtower with `&architecture=assembled` and `&architecture=classic` at matching high/balanced full-orbit and phone views. Also compare `&refinement=baseline` against the grounded default: verify rings, roof smoke/haze, and crown light remain hidden through animation and quality changes; check neutral key/cool fill, muted rubble, and reduced plinth contrast. Check the complete model's entrance, roof, balcony, and footing contact, and confirm only tower/tree assets load in that mode. In assembled mode, check that the full stair width meets its spiral masonry support, including the first landing and flight joins, and that exposed support faces retain the wall's brick scale. The lantern must illuminate the trunk without another shadow pass or distracting foreground glare.

A fresh supplied high/balanced scene requests five content-hashed GLBs after the first rendered frame, with no classic BRK1 or stone-map requests. Every live high/balanced scene, including classic, also requests the two authored ground WebP maps for its tier. Enforce 6 MiB high / 3 MiB balanced for all model-and-texture payloads together, including the ground pair, alongside the existing 30 KiB UI and 810 KiB scene bundle limits. Low/static paths request no authored models or ground maps. Four tower roles commit together; tree readiness and failure remain independent. Compare `&ground=procedural` against the default when reviewing foreground readability.

Run assembly/controller tests and the full verification/test/build/audit sequence. Include partial downloads, bad embedded images, stale completions, high/balanced/low transitions, repeated disposal, and originals restored before derived resources are freed. Compare actual WebGL draw calls and frame behavior with classic at identical cameras, beyond default static-path Lighthouse checks.

Leave posters unchanged during comparison. After visual acceptance, refresh fingerprinted posters and review the complete diff before any approved PR update or publication. Existing protected release checks still apply.

## Classic construction pilot validation

The local limestone tread and crown pilot remains separate from the accepted raised-brick release until visual acceptance. Leave its inherited posters unchanged during comparison. After source and assets are ready, run `node --test test/brick-detail.test.mjs test/bundle-output.test.mjs`, then the full release-gate sequence above from this isolated checkout. The bundle tests build their own output; avoid a concurrent build against the same `dist/` directory.

- Compare high desktop and balanced phone views with `?quality=high&sceneDebug=1` (or `quality=balanced`) with `&architecture=classic` and `&construction=baseline` at matching camera positions. Include stair detail, the complete orbit, crown silhouette, collapsed sections, and rubble. Confirm readable foreground text, unchanged placement, and no additional meshes or draw calls.
- A fresh high or balanced live scene should request exactly one brick binary, one tread binary, and the matching color/roughness pair. Crown reuse must not request or decode a second brick. Total detail transfer must stay within 750 KiB high and 256 KiB balanced; the tread alone is at most 200 triangles and 9,608 bytes.
- Check each geometry request failing, a failed companion material map, high/balanced/low transitions, late completion after downgrade, and repeated disposal. Original geometry and materials must be restored before owned resources are disposed, shared maps released only by their owner, and the first live frame must not wait for optional assets.
- Without diagnostic overrides, reduced motion/data, unavailable or software WebGL, and no JavaScript must preserve the static path without scene or optional-asset downloads. Test keyboard panel access on desktop and phone. Keep the existing Lighthouse median and bundle limits; also inspect the actual live WebGL scene, which the default static-path audit may not exercise.

## GitHub environments and credentials

The deploy workflows declare separate `preview` and `production` GitHub environments.

- Store `CLOUDFLARE_PAGES_API_TOKEN` as an environment secret in each environment. Restrict each token to the specific Cloudflare account and grant only `Account → Cloudflare Pages → Edit`; GitHub environments provide the preview/production separation.
- Store the non-secret `CLOUDFLARE_ACCOUNT_ID` once as a repository Actions variable shared by both environments.
- During migration, workflows fall back to the repository secret `CLOUDFLARE_API_TOKEN` and the repository secret `CLOUDFLARE_ACCOUNT_ID`.
- Remove the legacy token fallback only after preview and production each validate with their environment secret. Remove the legacy account-ID secret after the repository variable validates.

As of 2026-07-23, the `preview` and `production` GitHub environments exist. `preview` requires an approval from `alxnva` and accepts pull-request merge refs or `codex/*` branches; `production` accepts only `main`. The split Cloudflare tokens and account-ID repository variable are not yet configured. The legacy repository-secret fallback is transitional and must remain documented until both new credential paths validate.

A production run fails when credentials are absent or invalid. Fork pull requests may build the preview artifact, but the credentialed preview job is explicitly skipped. Same-repository pull requests may request the `preview` environment, but its required owner review must be approved before the credentialed job is sent to a runner or any environment/repository secret becomes available. Review the workflow diff as part of that gate. Missing preview credentials produce a notice and skip deployment; invalid configured credentials still fail.

## Deploy and smoke checks

Production runs only from `main`. Before upload, the workflow captures Cloudflare's successful canonical production deployment as the rollback target. It publishes `dist/` to Pages project `alexnava-me`, then runs `.github/scripts/smoke-pages.sh` against both the new immutable deployment URL and `https://alexnava.me/`. Both responses must return `200` without redirecting to another host and contain `<title>Alex Nava</title>`; their hashed app/scene/CSS references must match, and the apex's final response must send CSP, HSTS, and `X-Content-Type-Options: nosniff`. Apex asset-hash parity allows about three minutes for custom-domain promotion to catch the new production deployment before the release is failed and rolled back. The same script requires a real 404 response with the expected page marker and verifies that `www` returns `301` to the apex. If any post-upload check fails, the workflow calls Cloudflare's official Pages rollback endpoint for the captured deployment, reruns the same script against its immutable URL with `--rollback`, and remains failed even when recovery succeeds. Only rollback verification accepts either the current `<title>Alex Nava</title>` or the previous `<title>Nava Designs — Alex Nava</title>`; hostname, security-header, asset-hash parity, 404, and redirect checks stay unchanged. Preview builds run without Cloudflare credentials and upload only `dist/`; a separate environment-gated job downloads that artifact and uses an independently installed, exact Wrangler version without checking out or installing pull-request code. It sanitizes the branch alias to lowercase ASCII letters, digits, and hyphens, prefixes it with `preview-` so it can never publish `main`, requires an exact project preview host and `200` response, then updates one bot-authored pull-request comment.

For an approved preview deploy:

```powershell
npm.cmd run deploy:preview
```

Production has no direct local npm deploy command. The protected `main` branch requires an explicitly approved pull request; merging it triggers the workflow that owns every release gate. To retry an already approved `main` revision, dispatch the same workflow rather than invoking Wrangler directly:

```powershell
gh workflow run deploy.yml --ref main
```

Production releases serialize without canceling an in-progress upload or its verification. Do not treat a successful upload as a complete release until the smoke script passes. A post-upload failure automatically attempts and verifies rollback; the workflow remains failed so the original deployment and recovery still require investigation.

## Response-header contract

`_headers` is the tracked baseline. HTML revalidates immediately. Fonts, icons, and images revalidate after seven days. Published HTML uses content-hashed poster URLs so changed posters bypass previously cached images; stable poster copies remain for older HTML. The image cache policy is unchanged. Content-hashed CSS and JavaScript are immutable for one year. Do not add absolute-host patterns to `_headers`: Cloudflare Pages applies those rules by path, so an intended `pages.dev`-only `X-Robots-Tag` can leak onto the apex. Cloudflare supplies `noindex` on branch preview deployments by default.

After an approved production deploy, compare live headers with `_headers`:

```powershell
curl.exe -sSI https://alexnava.me/
curl.exe -sSI https://alexnava-me.pages.dev/
```

Confirm CSP, one-year HSTS, framing protections, MIME sniffing protection, COOP/CORP, cache policy, and that the apex does not return `X-Robots-Tag: noindex`. The Pages hostname must be canonicalized with an exact-host Cloudflare Bulk Redirect; Cloudflare dashboard transforms may override or append headers.

The production apex is a native custom domain on Pages project `alexnava-me`, reached through a proxied apex CNAME to `alexnava-me.pages.dev`. Keep exactly one enabled account-level rule backed by `alexnava_pages_hostname_redirects`. The legacy `babel-apex` route for `alexnava.me/*`, the `babel-bot` wildcard route, and the `babel-bot` apex custom-domain binding were removed during the native Pages migration. Do not recreate them: a Worker fetch to the production Pages hostname can re-enter the Bulk Redirect and loop back to the apex. `www.alexnava.me` remains a narrow redirect to the apex and must continue to pass the smoke check.

## Scheduled Cloudflare audit

`Cloudflare Audit` runs every Monday at 15:17 UTC and can be started manually. It reads the `production` environment and prefers a dedicated `CLOUDFLARE_AUDIT_API_TOKEN` limited to the Cloudflare account with `Account → Cloudflare Pages → Read`. During setup it can fall back to the production Pages deploy token and the legacy repository token.

The workflow allowlists Pages project fields before writing output, extracts only each request's final response-header block, filters it to the security/cache set, and validates the apex marker and header baseline. The apex must return `200` directly with the effective host exactly `alexnava.me`; redirects are an audit failure. The exact Pages hostname must either return `200` with noindex or redirect its root with `301`/`308` to exactly `https://alexnava.me/`, then pass a separate path-and-query preservation check, so the audit remains compatible with a Cloudflare Bulk Redirect. Raw API responses and credentials are never uploaded. Sanitized reports are retained as GitHub Actions artifacts for 14 days.

The exact-host Cloudflare Bulk Redirect is reconciled by the protected `Configure canonical Pages hostname` workflow. Run it from `main` with `gh workflow run cloudflare-canonical-hostname.yml --ref main -f confirm=alexnava-me.pages.dev`. Prefer a production environment secret named `CLOUDFLARE_REDIRECTS_API_TOKEN`, restricted to this account with `Account Filter Lists Edit` and `Bulk URL Redirects Edit`; the legacy repository token is accepted only during migration. The workflow owns a dedicated redirect list, refuses to overwrite unexpected entries or tolerate duplicate rules, adopts a matching dashboard-created rule instead of creating a second copy, preserves paths and query strings, excludes subdomains so branch previews remain reachable, and verifies both the redirect and the indexable apex before succeeding.

A static `_headers` noindex fallback is intentionally not used because Pages cannot safely scope it by hostname and previously exposed `noindex` on the apex. The audit's HTTPS requests verify public reachability through DNS and TLS, not a full inventory of DNS records or certificate configuration.

## Rollback

The production workflow captures the successful canonical deployment before upload. If any later smoke check fails, it posts to Cloudflare's Pages rollback endpoint for that deployment, reruns `.github/scripts/smoke-pages.sh` against the restored immutable URL, and keeps the workflow red. If automated rollback or its verification fails, use the captured deployment ID from the workflow log to restore it from Cloudflare Pages, then run the same script manually. Do not rewrite Git history to roll back a release.

## Repository security controls

Keep GitHub Actions pinned to full commit SHAs and grant only job-required permissions. GitHub CodeQL default setup is enabled as the low-maintenance scanner for this JavaScript repository; its Actions and JavaScript/TypeScript analyses are strict required checks on `main`. Do not add a duplicate advanced-setup workflow unless its configuration needs materially exceed default setup. Dependabot covers npm and GitHub Actions weekly.
