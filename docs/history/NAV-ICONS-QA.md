# Navigation icon review

Current local version: original model renders with gentle inward angles (September 11, 2026). Prior illustration and pixel-art experiments below are superseded.

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


## Illustrated inventory pair — current

- About: `images/nav-about.webp`, 7,366 bytes, URL hash `823161af`.
- Contact: `images/nav-contact.webp`, 6,932 bytes, URL hash `c96890aa`.
- Both are transparent 256 x 256 WebPs with matching 216 x 149 object bounds, 14,298 bytes (14.0 KiB) combined. Smooth Lanczos export; no nearest-neighbor CSS.
- Original models remain unchanged. The existing HTML, labels, button dimensions, hover lift, focus styles and panel controller are reused. Removed the 0.8 CSS brightness filter; Contact brightness is baked at 0.848 and About needs no extra darkening.
- Verified in the existing desktop preview and an emulated 390 x 844 DPR 2 phone. Clasp and stamp remain recognizable; silhouettes have no visible light halo at navigation size. Both hashed files decode at 256px and computed filter is none.
- About opens by pointer; Escape restores focus; Tab/Enter opens Contact. With both image URLs blocked and cache disabled, Contact remains named and opens normally. Existing keyboard, accessibility and image-alpha tests pass.
- `npm test`: 279 passed. `npm run verify`, build, bundle budgets and diff check passed. UI remains 18.2 KiB and scene 802.9 KiB; both script hashes unchanged. Only icon assets, CSS filter, icon-test wording and documentation changed in this pass.
- Production, paper panels, name styling, scene and fallback posters unchanged. Local visual review pending.

### Generation provenance and prompts

Built-in image generation, style-transfer mode. Source references were the previous 256px model icons. Generated originals retained in `C:/Users/al/.codex/generated_images/01a08dcf-9b89-70d2-9a89-b7960eec8f25/`.

About source: `exec-b02b37ea-fcd8-49c7-af0b-f31652fbfc9c.png`.

> Style-transfer this leather document case into an original 2D survival-horror inventory illustration. Preserve exact recognizable object: rectangular brown leather envelope case, wide triangular flap, small round brass button clasp centered, short vertical leather securing strap and small buckle. Nearly front facing flat sprite, minimal depth. A blend of classic Resident Evil 2 inventory pixel-art atmosphere and cleaner hand-painted 2D illustration. Simplified deliberate color shapes, restrained fine dithering/pixel texture, crisp outlined silhouette, limited earthy dark umber and muted tan palette, matte leather. NOT a 3D render, no glossy specular reflections, no watercolor, no heavy blocky pixelation. Subdued brightness suitable for dark night website, clasp legible at 64px. One isolated object centered in a square canvas, object occupies 84% canvas width and 62% height. Genuine alpha transparent background, no shadow outside silhouette, no background scene or checkerboard, no text, no UI frame.

Contact source: `exec-b1552aac-4992-4c33-a5dc-afbe3b289e38.png`; second reference was the generated case for consistent style.

> Create ONE 2D ivory paper envelope navigation icon. Image1 defines the object; image2 defines the illustrated inventory-sprite style to match. Preserve rectangular envelope, triangular closed flap facing viewer, folded diagonal seams, small faded rust-red rectangular postal stamp at lower right, a few tiny unreadable ink strokes. Nearly front-facing, flat illustration, no dimensional side faces. Match classic survival-horror inventory atmosphere blended with cleaner hand-painted 2D art: simple deliberate color shapes, crisp dark brown silhouette outline, fine subtle dithering, matte material, limited muted taupe and aged ivory palette. No glossy highlights, no bright white, no dramatic 3D lighting. The ivory should be subdued midtone, like dimly lit paper in a nighttime scene. One isolated envelope centered on a square TRANSPARENT RGBA canvas. Width84% height62%, matching the case proportions. No leather case in output, no text labels, no UI frame, NO drawn checkerboard or opaque background.

Export preparation removed the edge-connected neutral preview matte (RGB minimum above 140 and channel range below 35), preserving dark silhouettes and internal details. Cropped alpha bounds, fitted to 216 x 166 and centered on 256 square RGBA. Brightness matched against previous visible mean RGB, capped at 1. WebP quality 88, method 6.


## Pixel intensity refinement — supersedes earlier pair

User requested stronger pixels, then selected an intensity between the strong version and the original illustrations. Current files retain the same 256 square alpha canvas and 216 x 149 footprint, with finer visible pixel clusters and softened stepped contours. CSS and behavior unchanged. Built-in image generation used both preceding versions as references. Export uses the same edge-connected matte removal, brightness matching, Lanczos resizing and WebP quality 92.

Current generation sources: `exec-88f65cdb-9c53-489f-bb42-d32d0291098f.png` (About), `exec-51eae99c-fb32-4b4f-bb63-c99b4bbdee5d.png` (Contact), in the generated-images directory documented above.

Prompt direction for both: Create the SAME object at pixel-texture intensity exactly halfway between image1 (too chunky) and image2 (too smooth). About twice as many pixels across the object as image1: 128-pixel-wide inventory sprite, finer readable pixel clusters, restrained dithering and gentler stepped edges. Retain clean illustrated surfaces; visibly pixel-textured but not blocky. Preserve centered front view, recognizable clasp/strap or folded flap/stamp, subdued palette, original shape and dimensions. Isolated square canvas with transparent background, no frame or text labels.

Validation: 17 icon and bundle tests passed, including alpha, dimensions, budgets and content hashes. Build completed through the bundle tests. Local preview refreshed; no production changes.


## Original models with inward angles — current

- Restored the supplied GLBs, rendered directly in a separate headless Blender 4.5 session. No image generation, texture mirroring or pixel treatment. Source model SHA-256 values verified unchanged against the originals documented in CREDITS.md.
- About: camera yaw +15 degrees reveals the right edge. Contact: yaw -15 degrees reveals the left edge. Both elevation 6 degrees, upright with no roll. Camera targets the world-space bounding-box center from radius 4; position offset is `(sin(yaw)*cos(6deg), -cos(yaw)*cos(6deg), sin(6deg))*4`. Orthographic scale is the larger projected bounding-box span divided by 0.84.
- Original lighting: two area softboxes at (-2,-3,4), 450W/4 units and (3,-2,1), 110W/3 units, relative to object center. World RGB (.35,.37,.42), strength .5. Cycles 96 samples, denoise, AgX, 512 square transparent film. Export: Lanczos 256 square, RGB brightness 0.8 with alpha preserved, WebP quality 92/method 6/exact alpha. CSS filter remains none.
- Final About: `images/nav-about.webp`, 8,526 bytes, hash fd61e237. Contact: `images/nav-contact.webp`, 8,028 bytes, hash cf4db869. Total 16,554 bytes (16.2 KiB), below 80 KiB.
- Reviewed desktop and emulated 390 x 844 DPR 2 phone at actual navigation size. Faces and identifiers remain visible, slight edge thickness shows, padding avoids clipping. About opens by pointer; Escape restores focus; Tab/Enter activates Contact. With both image downloads blocked, the labeled About button still opens the panel.
- 24 icon/panel/bundle tests pass; source verification passes. Build completed through bundle tests. The two JS bundles are unchanged, and original GLBs remain outside the navigation payload.
- Production, scene, paper panels, restored name and fallback posters unchanged. Local review only. Render script and full-size PNGs are in ignored `.tmp-preview-review/render-inward-icons.py` and `model-inward-{about,contact}.png`.


### Matching direction refinement

Both model icons now use +15 degree camera yaw and 6 degree elevation, revealing their right edge. Contact was re-rendered from its original GLB, not mirrored. The earlier inward-facing direction is superseded; lighting, brightness, dimensions and behavior remain unchanged. Render helper: `.tmp-preview-review/render-contact-matched.py`.


### Tilt on selection — current behavior

Resting assets are now rendered at 0-degree yaw. The existing +15-degree matching right-edge renders are `nav-about-active.webp` and `nav-contact-active.webp`. Both states retain 6-degree elevation and baked 80% brightness. Four transparent 256px assets share the existing hashed build pipeline and stay below 80 KiB combined. CSS crossfades for 180ms only when the owning button has aria-expanded=true; close, Escape and backdrop dismissal restore the straight view. Reduced motion removes the fade. No hover-induced angle change or new JS state.


## 2.5D inventory refinement - current

Replaced all four navigation images with reference-guided built-in image generation: matte material shading, stronger flap depth, fine grain and readable clasp/stamp details inspired by classic pre-rendered survival-horror inventory art. Resting images stay frontal; selected variants reveal the right edge. Existing CSS crossfade, labels and panel behavior are unchanged. Previous model renders are preserved in ignored `.tmp-preview-review/before-25d/`. Original GLBs are unchanged.

Generation source directory: `C:/Users/al/.codex/generated_images/01a08dcf-9b89-70d2-9a89-b7960eec8f25/`. Sources: `exec-6cb27af1-efda-472f-b1e8-a4a8e8de1f22.png` (About), `exec-b5d4def2-55dd-4bf1-b862-184b29788dbb.png` (Contact), `exec-dcf2f399-af00-4fd7-8127-d1fcf2c740a1.png` (About selected), `exec-b4523056-ed92-4423-86d7-bd1ebcf482be.png` (Contact selected).

Export: remove edge-connected neutral preview matte, crop alpha bounds, fit 216 x 166 within a 256-square transparent canvas, Lanczos and WebP quality 92. All four stay under the 80 KiB combined budget. 24 icon, panel and bundle checks pass; build verification passes. Script and stylesheet hashes are unchanged. Local review only; production and posters unchanged.
