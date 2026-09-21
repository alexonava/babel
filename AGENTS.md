# Repository instructions

These instructions apply to agents working in this checkout.

## Identity and source

- This is the selected local Dreamlike estate direction for alexnava.me, on the existing codex/dreamlike-estate worktree. Its unfinished edits are part of the current work.
- Stack: HTML, CSS, vanilla JavaScript, Three.js r160, and esbuild; npm on Node.js 22+.
- Edit readable source in src, index.html, styles.css, images, and fonts. dist is generated, ignored publish output; never hand-edit or commit it.
- The build keeps the UI separate from the deferred `scripts/scene.HASH.js` bundle; published CSS and script filenames are content-hashed.
- Cloudflare Pages project alexnava-me and production details must be confirmed before external release changes. Local development does not publish anything.
- Preserve other worktrees, Source's shared Git database, original artwork, and recovery records.

## Read first

[README.md](README.md) describes local work. Read [STYLE.md](STYLE.md) before visual changes, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for ownership, and [docs/SCENE-MODES.md](docs/SCENE-MODES.md) for camera/default/legacy behavior. [OPERATIONS.md](OPERATIONS.md) owns release thresholds and delivery policy.

## Current visual contract

The default is the fitted directed camera opening on The watch, followed by eight tower/tree shots and the existing five-second tour. The historical fixed orbit radius/height is not the default composition. Shot focal volumes, responsive safe areas, terrain clearance, and portrait overrides govern framing. Use directed-shots.js, cinematic.js, and camera-tour.js for the corresponding responsibilities.

The tower remains the world anchor. Preserve the accepted identity, poster, About estate, readable fallback, paper dialogs, focus restoration, and reduced-motion/data behavior. Comparison parameters and procedural fallbacks remain supported. A source reorganization must not quietly change default or legacy visuals.

## File ownership

- src/app.js and src/main.js: fast UI initialization and deferred scene policy.
- src/ui: hero and nested estate/dialog interaction.
- src/scene-entry.js and src/scene: scene assembly, models, camera, rendering, quality, environment, and lifecycles.
- build.mjs and tools: local build/watch/preview tooling; generated output is isolated from source.
- test: regression checks.
- LICENSE, CREDITS.md, SECURITY.md and public discovery/hosting files: retained public contracts.
- docs/history: byte-preserved prior docs and QA. Its preservation-map records old paths and hashes. Do not format these snapshots or interpret their old paths/claims as current configuration.
- .tmp-preview-review and other ignored evidence: preserved work, not disposable merely because Git ignores it.

## Commands

| Action | Command |
| --- | --- |
| Develop with watch and preview | npm run dev |
| Build once | npm run build:dist |
| Preview once-built output | npm run preview |
| Watch builds only | npm run watch |
| Verify compilation | npm run verify |
| Regression tests | npm test |
| Dependency audit | npm run audit:ci |
| Restore dependencies, when authorized | npm ci |

## Change discipline

1. Prefer focused, reversible changes. Preserve pre-existing dirty and untracked work.
2. Keep UI initialization independent of the optional scene. Preserve static poster/text paths when scripts, models, or WebGL fail.
3. Respect applyQuality, resize, update, and dispose ownership. Restore borrowed resources before freeing derived ones.
4. Keep public AI discovery files accurate and non-sensitive. Internal AGENTS.md and historical docs must not enter the public payload.
5. Update current docs when file ownership or commands change; add a history/path map when preserving earlier material.
6. Run the checks appropriate to the change; JavaScript changes require verify and tests, and published-output changes require a build. Do not claim historical QA as a fresh result.
7. No push, merge, deploy, secret/CI change, dependency/framework addition, or unrelated deletion without task authorization. Existing explicit authorization applies; do not request it again.

## Completion

Requested behavior is implemented, the diff is reviewed, relevant checks pass, current docs match reality, and material limitations are recorded. Visual work follows STYLE and receives appropriate desktop/phone, fallback, and accessibility review. Keep OPERATIONS release gates unchanged unless the user explicitly authorizes changing them.

## Optional coordination board

The opt-in configuration is .codex/coordination/project.yaml. Use the codex-coordinator skill for a bounded claim when available; its absence is not a blocker. Native Codex tasks remain the execution and transcript authority. Do not write transcripts, reasoning, prompts, tool outputs, or cross-project notices into coordination state.
