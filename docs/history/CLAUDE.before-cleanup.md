# CLAUDE.md

Read these files before starting a task:

1. `AGENTS.md`
2. `STYLE.md`
3. `PLANS.md`
4. `README.md`

## Project

Authoritative working source for `alexnava.me`. JS source lives in `src/`; generated publish output lives in `dist/` and is gitignored. npm on Node.js 22+ is used for local build, preview, verification, deployment, and formatting. Lightweight automated tests live under `test/`.

## Key files

- `index.html` — homepage markup
- `styles.css` — styling and design tokens
- `src/scene/` — readable Three.js scene helpers, textures, palette, and scene bootstrap
- `src/ui/` — readable hero motion, icons, and panels
- `src/app.js` — lightweight UI bundle entry
- `src/main.js` — UI boot and deferred scene loader
- `src/scene-entry.js` — deferred Three.js scene bundle entry
- `build.mjs` — esbuild + asset assembly (source → `dist/`)
- `package.json` — build, verify, watch, deploy, format commands
- `_headers` / `_redirects` — hosting config copied into `dist/` at build time
- `wrangler.jsonc` — Cloudflare Pages project binding

## Commands

- Install: `npm install`
- Build to `dist/`: `npm run build`
- Preview locally: `npm run preview`
- Verify source entry points: `npm run verify`
- Run tests: `npm test`
- Watch: `npm run watch`
- Format: `npm run format`

## Rules

- Plan before editing when the task is multi-file or architectural
- Read `STYLE.md` before visual changes
- Keep diffs small and reversible
- Edit JS in `src/`; never hand-edit `dist/`
- Respect `prefers-reduced-motion` and `prefers-reduced-transparency`
- Don't install dependencies, push, deploy, or alter cloud settings without explicit approval
- Treat deployment details in repo docs as notes to confirm before shipping changes
