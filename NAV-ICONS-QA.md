# Navigation icon review

Implemented locally on codex/solar-detail. Production and scene fallback posters remain unchanged.

- About: leather document case, 8,430 bytes. Contact: stamped paper envelope, 9,542 bytes.
- Both are transparent 256 x 256 WebPs; 17,972 bytes combined (17.6 KiB). Original GLBs are unchanged and excluded from the site payload. Render recipe and source hashes are in CREDITS.md.
- Live browser confirmed both content-hashed images decode at 256px and no supplied GLB is requested.
- Reviewed desktop and 390 x 844 phone at DPR 2 against the live tower scene. Silhouettes remain clear and the clasp, flap and stamp are visible at navigation size.
- About and Contact open correctly; closing restores button focus. Existing keyboard/focus-trap tests pass with image-based button fixtures.
- Reduced-motion load shows both icons with zero transition duration and no scene/GLB requests. A deliberate image-load failure leaves named buttons accessible and Contact operational.
- npm run verify, npm test and the production build pass: **276 tests**. Bundle checks pass: app.c666c844.js is 18,379 bytes, scene.6754847f.js remains 822,182 bytes (802.9 KiB).
- Local review: http://127.0.0.1:4175/?quality=high&view=tower&angle=1&tour=5

## Cinematic UI refinement

The icon darkening (brightness 0.8) is retained. The UI now uses 500-weight serif headings, softened parchment/stone text, understated preview controls, a matte Contact seal and shared warm focus accents. Changes are CSS-only; both JS bundle hashes and scene geometry/cameras are unchanged. Phone hero/navigation bounds match the previous framing baseline, with no horizontal overflow observed in portrait or compact landscape.

Full suite: 276 tests passed; panel/accessibility checks were rerun after the final CSS adjustments (18/18). Build and diff checks pass. Control text contrast is 8.91:1 on its surface, panel body text at least 5.52:1 against the darker gradient stop, and control rules 3.12:1. Browser verification confirms panel and close transitions are 0s under reduced motion. Final stylesheet: styles.b991a9f2.css. Local review only; production remains unchanged.
