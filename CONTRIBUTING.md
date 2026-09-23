# Contributing

Thanks for taking an interest in `babel`.

## Reporting defects

- Use [GitHub Issues](https://github.com/alexonava/babel/issues) for bugs, UX regressions, broken links, and feature requests.
- Include the page or interaction you exercised, what you expected, what happened instead, and any screenshots or console errors that help reproduce the problem.

## Proposing changes

1. Create a branch from `main`.
2. Make your change in source files only.
3. Run `npm install` if needed, then `npm run verify`, `npm test`, and `npm run build:dist`.
4. Open a pull request describing the change, the user-facing impact, and any testing you performed.

## Source of truth

- `src/` is the authoritative JavaScript source tree.
- `dist/` is generated output only and should not be edited by hand.
- Static site assets live at the repository root and are copied into `dist/` during the build.

## Pull request expectations

- Keep changes focused and explain any visible design or motion changes.
- Link related issues when applicable.
- Call out accessibility, browser, or deployment considerations if they changed.
