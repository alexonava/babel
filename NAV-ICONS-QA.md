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
