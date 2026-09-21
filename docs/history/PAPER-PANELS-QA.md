# Cotton paper panels — local review

Implemented September 10, 2026 in `codex/solar-detail`. Production and scene posters are unchanged. The pending hero name restoration is preserved.

## Material and implementation

- Shared ivory cotton paper, warm charcoal selectable HTML text, no watermark, notebook rules, or wax seal.
- User refinement: substantially cleaner edges with minimal natural irregularity, rather than heavily worn parchment.
- `images/paper-edge.webp`: 768 square RGBA, 89,244 bytes. Nine-slice border preserves corner scale.
- `images/paper-grain.webp`: 384 square RGB, 1,996 bytes. Quiet central crop at fixed CSS scale.
- Total: 91,240 bytes (89.1 KiB), below 200 KiB. Build fingerprints both URLs before hashing CSS. No new runtime dependency.
- Solid ivory remains beneath writing when textures are unavailable. Paper loads through CSS, independently of the scene and opening controller.
- Opening: 440ms, 18px rise, 98.5% scale, shallow 4 degree tilt, settling to `transform: none`. Closing: 240ms. Per-cycle cleanup invalidates stale callbacks; a 320ms fallback handles missing transition completion. Reduced motion immediately completes pending exits.

## Verification

- `npm test`: 279 passed, 0 failed. Added rapid close/reopen/close, stale callback, child transition, interrupted-transition fallback, dynamic reduced-motion, ornament removal and fingerprint/budget coverage.
- `npm run verify`: passed. Initial restricted-shell attempt could not traverse linked dependencies; reran successfully with project access.
- `node build.mjs --dist`: passed. UI 18.2 KiB; unchanged scene 802.9 KiB, below 810 KiB. `git diff --check`: passed.
- Chromium inspection: both panels, desktop, 390 x 844 portrait, 844 x 390 landscape; close control reachable, text wraps without horizontal overflow. Checked 640 x 400 reflow (1280 x 800 at 200% equivalent), plus CSS 200% magnification and measured doubled close control with no horizontal overflow. These are emulations, not physical-phone measurements.
- Real keyboard Escape and Contact Tab loop confirmed; controller tests cover reverse Tab, inertness and focus restoration.
- Forced-colors emulation: plain system-colored surface, hidden texture pseudo-elements, visible text/link/close. Reduced-motion emulation: zero transition duration and no transform.
- Blocked both paper URLs with cache disabled: opening completes immediately without waiting for downloads and copy remains readable on solid ivory. This also models indefinitely pending texture availability; no separate timed slow-network benchmark was run.
- Minimum contrast across every decoded grain pixel: body #393229 8.60:1; eyebrow #60492e 5.74:1; link #493f31 7.01:1. All exceed 4.5:1. Text remains ordinary sharp HTML.

## Generation provenance

Tool mode: built-in `image_gen`, initial generation plus refinement. No Meshy or secret file used. Original generated images retained outside the website payload in `C:/Users/al/.codex/generated_images/01a08dcf-9b89-70d2-9a89-b7960eec8f25/`.

Initial prompt:
> Create a production UI material asset: one blank sheet of aged handmade cotton paper, orthographic perfectly front-facing flat scan, square 1:1 composition, occupying nearly the full canvas with a modest transparent margin. REAL TRANSPARENT background, no desk, no props, no cast shadow outside the sheet. Warm light ivory, elegant authentic cotton fibers, very subtle uneven age, faint broad fold memory visible only near margins, delicate deckled irregular worn edges with tiny translucent fibers. Interior central 80 percent must be quiet, uniformly light and suitable for dark typeset text, no prominent stains or scratches. No notebook rules, absolutely NO text, letters, monograms, seals, illustrations or watermark. Soft neutral studio illumination baked subtly into paper microtexture only, no perspective, no large curling corners. Material realism, restrained cinematic archive letter rather than fantasy treasure map. High resolution. This will be used as a nine-slice border and repeated quiet paper grain for responsive HTML dialogs.

Accepted direction refinement prompt:
> Refine this blank cotton paper UI asset. The user says the edges are too worn. Make the edges almost clean cut, straight and very gently organic, with only microscopic cotton fibers. Remove tears, scallops, fraying, missing chunks, dark dirty borders, and heavy weathering. Keep the lovely warm ivory cotton material, faint fold memory and subtle fine fibers. Quiet light central writing area. Perfectly frontal flat square sheet, no perspective, no text or ornament. Transparent background with only a tiny margin, no cast shadow. This is a carefully kept personal letter, not ancient parchment.

Source used: `exec-2f806bcb-1849-4297-9950-209773c5b616.png`. The generator embedded a neutral checkerboard matte; export isolated ivory using red-minus-blue chroma (8 threshold, 18x ramp), cropped (30,30)-(1225,1225), resized to 768 and WebP quality 82. The quiet central (192,192)-(576,576) crop is RGB WebP quality 80. A later imagegen alpha-only attempt did not resolve the matte and was not used. Preserve source originals.


## Supplied fantasy map scroll - current local review

Source GLB: `C:/Users/al/Downloads/Meshy_AI_A_fantasy_scroll_of_c_0911040306_texture.glb`, SHA256 `B10656F162FE3FE967CBD7FED3262F849DE485FBE7BB35D503E51C9177980F0E`. Rendered using a separate headless Blender process; original unchanged and not shipped. Render helper: `.tmp-preview-review/render-scroll.py`.

Built-in image generation removed the baked black labels from the render while preserving map lines, border, curls and leather ties. Edited source: `C:/Users/al/.codex/generated_images/01a08dcf-9b89-70d2-9a89-b7960eec8f25/exec-f0509c98-e55f-4ce0-8c60-c74a36300c53.png`. Export removes neutral checkerboard matte and retains alpha in `images/paper-scroll.webp` (under 200 KiB). Existing copy is selectable HTML in dark ink. Map lines intentionally remain behind copy, following the request to change only black text; center-clearing preference question was unanswered.

Shared asset uses the existing hashed CSS pipeline. Panel lifecycle, Escape, focus and close controls are retained. 35 targeted panel/accessibility/bundle checks pass. Production and scene posters unchanged.


## About category menu

About is now the sole main-page navigation icon. Its map contains Profile, Experience and the existing Contact envelope icon. Introductory prose has been removed from the menu surface. Profile and Experience use only previously supplied personal/background copy, without invented employers or achievements. Child panels include Back to About; Escape and backdrop dismissal return to the parent and restore category focus. Closing About restores the outer trigger. Scene remains inert throughout child navigation.

Validated pointer navigation, Escape return/focus, desktop and portrait layout. Added nested navigation regression coverage. All 280 tests and build verification pass. Production remains unchanged.


## Illustrated estate menu - current

About alone now uses a flat illustrated estate: Profile at the watchtower, Experience at an archive, Contact at a courier station with drawn envelope. Category labels remain HTML buttons aligned to responsive landmark hit areas; child panel artwork/copy and nested navigation are unchanged. The supplied scroll remains on child panels.

Generation sources in `C:/Users/al/.codex/generated_images/01a08dcf-9b89-70d2-9a89-b7960eec8f25/`: `exec-a9459cbb-6480-4367-831b-1f07ac4dc23a.png` (desktop) and `exec-a992c603-e63d-46a6-a663-132fd7e3cde5.png` (portrait). Prompt: original ink-drawn estate on muted parchment, watchtower/archive/courier connected by paths, no baked text; quiet label areas and a small compass. Portrait recomposes these same destinations vertically. Export: Lanczos 960x640 / 600x900, WebP quality45 method6, combined193490 bytes. Originals retained.

Checked desktop, 390x844 portrait, short landscape scrolling, all destinations and return paths, keyboard order/focus, forced colors, reduced-motion mode, and solid-paper fallback with artwork suppressed. All hit targets exceed44px. Existing scene, category content, production and posters unchanged.
