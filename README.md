# alexnava.me

This is the source for Alex Nava's website. The homepage opens on a cinematic tower/tree scene; About opens the illustrated estate menu and its Profile, Experience, and Contact dialogs. Readable text and the static poster remain available when enhancement cannot run.

The project workspace calls this folder **Site**; its physical location remains Worktrees/babel-dreamlike-estate.

## Work locally

Use Node.js 22 or newer. Dependencies are already present in the current editing checkout. Restore them with npm ci when needed.

    npm run dev

Open [localhost:4173](http://127.0.0.1:4173/). Development mode builds the published site, watches its inputs, and owns the local Wrangler preview process. Refresh the browser after a successful rebuild; live reload is not injected. Stop it with Ctrl+C. A failed rebuild keeps the last successful output available. An occupied port is refused before starting another server; use npm run dev -- --port 4180 when a separate preview is needed.

| Command | Purpose |
| --- | --- |
| npm run dev | Watch published inputs and serve the local preview |
| npm run preview | Build once and serve through Wrangler |
| npm run watch | Watch and rebuild without starting a server |
| npm run build:dist | Generate the publish payload in dist |
| npm run verify | Compile-check source without writing output |
| npm test | Run the regression suite |
| npm run audit:ci | Check dependency advisories against the existing gate |

Edit JavaScript in src, markup in index.html, styles in styles.css, and runtime artwork in images. Never hand-edit dist. The build emits content-hashed scripts/app.HASH.js, deferred scripts/scene.HASH.js (an ES module that imports its content-hashed scripts/scene.*.js chunks; the sceneDebug developer tools load on demand), and css/styles.HASH.css.

## Find the right file

- [Architecture and source map](docs/ARCHITECTURE.md)
- [Current camera and comparison modes](docs/SCENE-MODES.md)
- [STYLE.md](STYLE.md): accepted visual, motion, and accessibility constraints
- [AGENTS.md](AGENTS.md): internal contributor instructions
- [OPERATIONS.md](OPERATIONS.md): unchanged release gates, delivery policy, smoke checks, and rollback
- [PLANS.md](PLANS.md): current work context
- [Historical documentation](docs/history/README.md): prior briefs, QA, and exact pre-cleanup documentation

The default camera opens on The watch and tours seven directed shots, each held 9 to 14 seconds and joined by a 1.2-second crossfade, skipping Masonry study. Visitors can stop it with the footer's Pause scene button. Add view=tower&angle=1&tour=0 to the preview URL for a held review composition, or tour=5 for the faster review cadence. Full framing rules and legacy comparisons are in the scene-mode guide.

The current material pass keeps the supplied tower/tree silhouettes, UVs and maps. The tower, a supplied timber fire lookout, uses 0.90 roughness with its baked normal map; the tree retains its normal map and a mapped 0.84–0.97 roughness range. Surface-area weighting distributes the existing instanced canopy leaves, while the existing lights give shadows a restrained cool lift. A still blue-violet nebula, dark dust and faint peach core share the existing sky and star rendering; no extra draw, pass or light is added. High uses three nebula noise octaves, balanced uses two, and low/fallback views retain the quieter treatment. See the architecture guide for ownership and tier limits.

## Verify and release

Run verify, tests, and build after implementation changes. Rendering and accessibility changes also need appropriate browser review. Historical screenshots and measurements are retained in the ignored .tmp-preview-review folder; their old results do not prove the current revision is release-ready.

CI Lighthouse runs without a GPU, so it audits only the static poster path; OPERATIONS explains how the live scene is measured. Keep the thresholds in OPERATIONS unchanged. Local work does not publish the site; production remains the approved protected-PR workflow to main.

[Repository](https://github.com/alexonava/babel) · [Live website](https://alexnava.me/) · [Credits](CREDITS.md) · [Security](SECURITY.md) · [MIT license](LICENSE)
