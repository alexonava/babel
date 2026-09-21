# Working in this checkout

Read [AGENTS.md](AGENTS.md), [README.md](README.md), and [PLANS.md](PLANS.md). Read [STYLE.md](STYLE.md) before visual changes. [Architecture](docs/ARCHITECTURE.md) maps source ownership; [scene modes](docs/SCENE-MODES.md) documents the current camera and retained comparisons.

This is the local Dreamlike estate direction for alexnava.me. Preserve existing unfinished work and the separate worktrees. JavaScript source is under src; dist is generated publish output.

- Develop locally: npm run dev
- Build once: npm run build:dist
- Verify: npm run verify
- Test: npm test
- Watch builds only: npm run watch

Follow AGENTS for authorization and preservation boundaries, and OPERATIONS for release gates. Local development does not publish changes. Historical docs and ignored QA evidence remain preserved; do not treat them as current instructions or delete them as routine cleanup.