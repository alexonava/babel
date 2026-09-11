# Scene-first homepage: verification record

Reviewed locally on 2026-09-11. Protected preview and production status are recorded in this correction's pull request and workflow runs.

## Restored behavior

The homepage opens on the existing tower/tree scenes and eight-shot tour. About opens the accepted transparent estate illustration; Profile, Experience, and Contact open the existing simple-paper dialogs. Back, Escape, or backdrop dismissal returns to the selected map destination, and closing About restores the scene entry focus. No loading ritual blocks the page.

The earlier direct-estate release is historical and remains documented in ESTATE-HOMEPAGE-QA.md. This correction preserves the scene source, artwork, posters, social image, category copy, and preferred name styling.

## Local evidence

- `npm test`: 344 passed, zero failures, including nested panel history, rapid reopening, repeat-safe initialization, source/build contracts, portable CSS hashes, and release/rollback smoke fixtures.
- `npm run verify`, `npm run build:dist`, and bundle budgets passed. `npm run audit:ci`: zero vulnerabilities.
- UI bundle: `app.e45ca42b.js`, 19.1 KiB. Scene: `scene.a81881d0.js`, 802.9 KiB, unchanged from the prior build. CSS: `styles.a90a6861.css`.
- Eleven browser scenarios passed at `http://127.0.0.1:4177/`: default desktop live WebGL, phone live WebGL, portrait 390x844 at 3x, short landscape 844x390 at 2x, a 720x500 layout equivalent to 200% desktop zoom, desktop at 2x, blocked scene script, missing map/paper images, forced colors, blocked app script, and disabled JavaScript.
- The default URL created the live canvas and requested the deferred scene plus tower/tree assets. All eight tour labels were visited. Reduced-motion runs kept the poster and did not request the scene script.
- Every dialog destination passed pointer/keyboard entry, focus wrapping/restoration, Back/Escape/backdrop, background inertness, and interrupted close/reopen. Checked layouts had reachable 44px controls and no horizontal overflow; short landscape scrolls within the overlay to preserve artwork proportions.
- Screenshots of the real scene, desktop/portrait estate, short landscape, zoom-equivalent layout, and paper panel were inspected. Missing scripts kept the ordinary About link and full category copy usable.
- Independent source review found no actionable restoration issue. `git diff --check` passed; no scene or binary asset changes.

Local browser scripts, screenshots, and logs are ignored under `.tmp-preview-review/`. The protected workflow must pass CI, CodeQL, Lighthouse, and approved preview deployment before merge. Production retains captured rollback protection; normal smoke requires the scene host and matching app/scene/CSS assets, while rollback accepts either the previous estate or scene homepage.
