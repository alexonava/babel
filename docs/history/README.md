# Historical documentation and path guide

These files were preserved byte-for-byte during the project cleanup. They include unfinished local documentation as it existed immediately before cleanup. Dates, scores, camera numbers, paths, and release claims describe their original work; use the [current README](../../README.md), [architecture guide](../ARCHITECTURE.md), and [scene modes](../SCENE-MODES.md) for present navigation.

## Previous current documents

- [README before cleanup](README.before-cleanup.md)
- [AGENTS before cleanup](AGENTS.before-cleanup.md)
- [PLANS before cleanup](PLANS.before-cleanup.md)
- [CLAUDE before cleanup](CLAUDE.before-cleanup.md)
- [OPERATIONS before cleanup](OPERATIONS.before-cleanup.md)

## QA and briefs moved from the checkout root

- [Dreamlike estate](DREAMLIKE-ESTATE-QA.md) and [paper vignettes](PAPER-VIGNETTES-QA.md)
- [Scene homepage](SCENE-HOMEPAGE-QA.md) and [earlier estate homepage](ESTATE-HOMEPAGE-QA.md)
- [Solar treatment](SOLAR-QA.md)
- [Navigation icons](NAV-ICONS-QA.md) and [paper panels](PAPER-PANELS-QA.md)
- [Brick UI brief](BRICK_UI_BRIEF.md) and [Codex brief](CODEX_BRIEF.md)
- [Earlier ART specs and audits](ART/): marble, cloister, postprocess, loading ritual, last-pass cleanup, and scene interactions. These six files are historical Markdown documents, not artwork binaries.

## Resolving old paths

The filenames above previously lived at the checkout root. References between these moved QA documents still use the same sibling names. Other relative paths in their unchanged contents should be interpreted relative to the old checkout root, two levels above this folder. In particular, .tmp-preview-review still lives at that root; screenshots, scripts, and other ignored evidence were not moved by this documentation pass.

The former ART directory is preserved here as ART. Paths written as ART/filename.md in older specs now map to docs/history/ART/filename.md; proposed filenames that never existed are not created by this reorganization.

Old Pictures and Downloads references identify original artwork provenance. Gathered copies are in the separate Assets workspace root, whose START HERE guide maps missing historical model-copy paths to Imports. Older Projects/Active worktree paths are historical; registered worktrees now remain under the consolidated website's Worktrees directory.

[preservation-map.json](preservation-map.json) records each original path, new path, size, SHA-256, and whether it was moved or snapshotted. The cleanup recovery snapshot additionally preserves the pre-cleanup tree and Git state. Do not format or rewrite these historical snapshots when updating current documentation.
