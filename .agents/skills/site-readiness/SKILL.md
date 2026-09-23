---
name: site-readiness
description: Audit, improve, and verify alexnava.me for release readiness, public AI-agent discoverability, static-hosting security, build health, and rendered behavior. Use when maintaining this repository, preparing a release, updating public content, investigating a site-loading issue, or checking agent-readable files.
---

# Site readiness

Use the repository source and its existing contracts as the authority. Keep the site static, light, and privacy-preserving; do not introduce a service, framework, deployment, or dependency unless the user specifically asks.

## Maintain the source of truth

1. Read `AGENTS.md` and, for visual changes, `STYLE.md` before editing.
2. Inspect `git status --short` and preserve unrelated changes, generated `dist/`, local review folders, and coordination state.
3. Edit readable source only: `src/`, `index.html`, `styles.css`, root static files, and tests. Never hand-edit `dist/`.

## Keep the public site agent-readable

1. Maintain the public `llms.txt`, `sitemap.md`, and `AGENTS.md` artifacts with only accurate, non-sensitive content.
2. Ensure `build.mjs` copies those artifacts to `dist/`, and give them stable-asset headers in `_headers`.
3. Keep `robots.txt` permissive for citation crawlers unless the user decides otherwise.
4. Keep canonical, Open Graph, and JSON-LD metadata aligned with the actual homepage.
5. Offer Markdown alternatives only when they can remain correct and low-maintenance; do not fabricate a dynamic content-negotiation layer for this static site.

## Verify a change

Run the narrowest relevant checks, then the release set:

```powershell
npm run verify
npm test
npm run audit:ci
npm run build:dist
```

For rendered work, start `npm run preview`, verify the home page and every panel at desktop and mobile widths, and check for console errors, overlays, missing assets, broken focus behavior, and clipping. Use the in-app Browser when available. Otherwise, use `Invoke-WebRequest` or `curl` against the local preview for HTTP and asset smoke checks, and report browser-only visual and interaction checks as unverified; do not install Playwright just for a routine check.

## Preserve release boundaries

- Do not deploy, change Cloudflare settings, change DNS, or touch secrets without explicit authorization.
- Treat `_headers`, `_redirects`, and `wrangler.jsonc` as security- and hosting-critical.
- Keep the UI bundle below its tested budget and preserve the deferred Three.js scene split.
- Report only fresh evidence. If a preview or browser surface cannot run, say exactly what remains unverified.
