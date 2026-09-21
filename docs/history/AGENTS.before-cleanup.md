# AGENTS.md

## Who reads this

This contract applies to any AI agent working in this repository.

## Repository identity

- **Project:** `babel`
- **Live site:** `alexnava.me`
- **Repo role:** authoritative working source for the live site
- **Stack:** static site (HTML, CSS, vanilla JS, responsive tower posters, esbuild-generated UI bundle plus deferred tree-shaken Three.js r160 scene bundle, self-hosted font subsets)
- **Host:** Cloudflare Pages project `alexnava-me` (re-confirm before deploy or DNS changes)
- **Build step:** esbuild via `npm run build` / `npm run build:dist` — source in `src/`, generated publish payload in `dist/` (not tracked)
- **Package manager:** npm on Node.js 22+ (devDependencies only: esbuild, prettier, three, wrangler)
- **Test suite:** lightweight `node:test` coverage in `test/` for scene/runtime/UI verification

## Design intent

Read **STYLE.md** before making any visual change. The short version:

- Calm over clever
- Alignment and restraint matter more than feature count
- Motion should support structure, not compete with it

## 3D scene conventions

The Three.js scene in `src/scene/index.js` has a fixed compositional center:

- **The tower stands at the world origin `(0, 0, 0)`.** It is the only landmark the composition is anchored to — treat it as the center of the map for all placement math.
- **The camera orbits the tower** at radius ~52 (desktop, `sa = 46` pre-scale) / ~62 (mobile, `ia = 55` pre-scale), height ~21, and always `lookAt(0, 12.4, 0)`. Everything on screen is framed from that viewpoint.
- **Fog is near 62 / far 150** (56 / 138 low-power). Anything past roughly radius 88 from origin on the far side of the orbit is already fully fogged out, so geometry/decoration beyond that range is wasted fill — keep new scatter inside ~r=85 unless it's meant to be a horizon silhouette.
- When adding, moving, or scaling scene elements, frame the decision from the camera: read well from the orbit, and avoid extending world extents past what fog already hides.

## File layout

| File or folder                                  | Role                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `index.html`                                    | Landing page markup and panel structure                                      |
| `styles.css`                                    | Visual styling, `@font-face` blocks, tokens, and responsive rules            |
| `src/`                                          | Readable JS source of truth — edit here                                      |
| `src/scene/runtime.js` / `rendering.js`         | Scene scheduling, resize, renderer, postprocess, and teardown lifecycles      |
| `src/scene/tower.js` / `environment.js` / `atmosphere.js` | Scene-domain lifecycle ownership and per-frame updates               |
| `dist/`                                         | Generated publish payload for Cloudflare Pages — gitignored, never hand-edit |
| `fonts/`                                        | Self-hosted Instrument Sans + Cormorant Garamond woff2 subsets               |
| `images/`                                       | Responsive WebP tower posters used for first paint and static scene delivery |
| `build.mjs`, `package.json`, `.prettierrc.json` | Build + format tooling                                                       |
| `wrangler.jsonc`                                | Cloudflare Pages project config (`pages_build_output_dir: ./dist`)           |
| `_headers` / `_redirects`                       | Static hosting config copied into `dist/` at build time                      |
| `llms.txt`, `sitemap.md`, `index.md`, `site-agents.md` | Public AI-agent discovery files; `site-agents.md` publishes as `/AGENTS.md` |
| `404.html`, `favicon.svg`, `LICENSE`            | Root assets copied into `dist/` at build time                                |
| `.github/workflows/`                            | CI (`ci.yml`) and production deploy (`deploy.yml`)                           |
| `README.md`                                     | Local preview and deployment notes                                           |
| `OPERATIONS.md`                                 | Release gates, credentials, audits, smoke checks, and rollback               |
| `PLANS.md`                                      | Backlog and recent implementation notes                                      |
| `STYLE.md`                                      | Design and motion constraints                                                |
| `CONTRIBUTING.md`, `SECURITY.md`, `CREDITS.md`  | Public contribution, security reporting, and third-party attribution         |

## Standard commands

| Action         | Command                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| Install        | `npm install`                                                              |
| Build          | `npm run build` (same as `npm run build:dist`)                             |
| Preview        | `npm run preview` (builds `dist/` then serves it through Wrangler Pages)   |
| Verify         | `npm run verify` (compile-check, no writes)                                |
| Test           | `npm test`                                                                 |
| Audit          | `npm run audit:ci` (fails on high or critical advisories)                  |
| Watch          | `npm run watch` (rebuild `dist/scripts/` on src change)                    |
| Format         | `npm run format`                                                           |
| Deploy preview | `npm run deploy:preview` (requires Wrangler auth)                          |
| Release prod   | Merge the approved protected PR to `main`; `deploy.yml` owns production     |

## Operating principles

1. Prefer small, reversible diffs.
2. Reuse the current structure before inventing a new one.
3. JS edits go in `src/`. Run `npm run verify` and `npm test` before committing. `dist/` is generated — never hand-edit, never commit.
4. Keep `file://` and HTTP preview both viable when possible; `npm run preview` is the preferred local check because it serves `dist/` through Wrangler Pages.
5. Asset filenames in `dist/` are content-hashed by `build.mjs` (e.g. `scripts/app.HASH.js`, `scripts/scene.HASH.js`, `css/styles.HASH.css`); three.js is bundled into the deferred `scripts/scene.HASH.js` and tree-shaken by esbuild. Don't hand-bump version query strings — rerun `npm run build:dist` and the hash moves automatically.
6. Update docs when file roles, preview assumptions, or deploy reality change. If a deploy detail matters, confirm it instead of trusting historical notes blindly.
7. Keep public AI-agent files accurate and non-sensitive; do not publish this repository's internal `AGENTS.md`.

## Ask before

- Installing dependencies
- Introducing a new build step or framework
- Editing files outside this repo
- Changing secrets, tokens, or CI/CD settings
- Pushing, merging, or deploying
- Deleting large folders beyond the scope of a planned cleanup

## Definition of done

- Requested behavior is implemented or the limitation is clearly explained
- The diff has been reviewed for regressions
- Visual changes still fit `STYLE.md`
- `npm run verify` passes
- `npm test` passes
- `README.md` and any affected project docs reflect reality

## Codex task-boundary board

- This repository uses the opt-in Codex task-boundary board in `.codex/coordination/project.yaml`.
- Before substantial writes, use the `codex-coordinator` skill when it is available to list active claims from the primary worktree and publish only this task's bounded claim. If it is unavailable, continue as one agent; do not treat the optional board as a blocker.
- Native Codex tasks remain the execution, messaging, and transcript authority; an explicitly requested goal Coordinator is on demand, with no heartbeat or mandatory pull-request workflow.
- Reject cross-project notices and never store transcripts, reasoning, prompts, or tool output in Coordinator state.
