# CODEX_BRIEF.md

Fast orientation for Codex sessions in this repository. This file is a short working brief; `AGENTS.md` remains the full operating contract.

## Start here

Read these before editing:

1. `AGENTS.md`
2. `STYLE.md`
3. `README.md`
4. `PLANS.md`

## Project

- Project: `babel`
- Live site: `alexnava.me`
- Role: authoritative source for the live website
- Type: static site with HTML, CSS, vanilla JS, and a deferred bundled Three.js scene
- Host: Cloudflare Pages project `alexnava-me` — confirm before deploy or DNS changes

## Stack

- Source HTML/CSS lives at the repo root.
- Readable JavaScript source lives in `src/`.
- `dist/` is generated publish output and is gitignored.
- Three.js r160 is imported from `three` and bundled/tree-shaken into a deferred scene script by esbuild.
- Fonts are self-hosted woff2 subsets under `fonts/`.
- Tests use Node's built-in `node:test`.
- npm on Node.js 22+ is used for scripts and dev tooling only.

## Common commands

```powershell
npm install
npm run verify
npm test
npm run build
npm run preview
npm run format
```

Preview deploys require Wrangler auth and should only be run with explicit approval:

```powershell
npm run deploy:preview
```

Production has no direct local npm deploy command. The protected `main` branch requires a pull request; an approved merge triggers `.github/workflows/deploy.yml`. An approved retry must dispatch that workflow on `main`.

## File map

- `index.html` — homepage markup and panel structure
- `styles.css` — visual system, responsive rules, and font declarations
- `src/app.js` — lightweight UI entry
- `src/main.js` — UI boot and deferred scene-loader source
- `src/scene-entry.js` — deferred Three.js scene entry
- `src/ui/` — UI behavior, hero motion, icons, and panel helpers
- `src/scene/` — Three.js scene bootstrap, palette, textures, and runtime helpers
- `build.mjs` — esbuild plus asset assembly into `dist/`
- `_headers` / `_redirects` — Cloudflare Pages hosting config
- `wrangler.jsonc` — Pages output directory and project binding
- `test/` — lightweight runtime, scene, and UI checks

## Change rules

- Keep diffs small and reversible.
- Read `STYLE.md` before any visual, motion, layout, or typography change.
- Edit JS in `src/`; never hand-edit `dist/`.
- Do not commit `node_modules/`, generated `dist/`, local backups, secrets, or machine-specific notes.
- Preserve `file://` viability where reasonable, but use `npm run preview` for the closest local Cloudflare Pages check.
- Do not add dependencies, frameworks, analytics, trackers, deploy changes, secrets, or cloud config changes without explicit approval.
- Confirm deploy, DNS, and Cloudflare assumptions before touching production.

## Design notes

- Calm over clever.
- Alignment and restraint matter more than feature count.
- Motion should support structure and must respect `prefers-reduced-motion`.
- Avoid decorative overload, generic dark UI, neon accents, and unnecessary new assets.

## Three.js scene notes

- The tower is anchored at world origin `(0, 0, 0)`.
- Camera orbit and framing are built around that tower.
- Fog hides far geometry; keep new scatter roughly inside radius 85 unless it is intentionally a horizon silhouette.
- Judge scene additions from the orbiting camera, not from top-down placement alone.

## Done means

- Requested behavior is implemented or the limitation is clearly explained.
- `npm run verify` passes.
- `npm test` passes.
- Docs are updated when file roles, preview assumptions, deployment, or public behavior changes.
