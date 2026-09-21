# Decorative paper vignettes

Built-in image generation produced three original transparent ink illustrations. The accepted desktop/portrait estate artwork is unchanged. Each vignette is decorative and excluded from accessibility output; category headings and body copy remain selectable HTML. No text is baked into the generated artwork.

## Assets and preparation

| Category | Runtime asset | Bytes |
| --- | --- | ---: |
| Profile | images/paper-vignette-profile.webp | 28356 |
| Experience | images/paper-vignette-experience.webp | 35420 |
| Contact | images/paper-vignette-contact.webp | 27978 |

Existing paper grain/edge: 91240 bytes. Vignettes: 91754 bytes. Combined section-paper assets: 182994 bytes (178.7 KiB), below the shared 200 KiB budget. Estate images retain their separate existing 200 KiB budget.

Exported with the existing sharp dependency: 420 × 420, fit inside, no enlargement, WebP quality 70, effort 6, alphaQuality 95. Generated alpha is preserved (observed range 0–255 in all three exports). Original files are retained; no API key or CLI generation was used. The build fingerprints the exported WebPs and rewrites their CSS URLs.

Desktop layouts reserve a separate illustration column; narrow layouts place it below the copy. CSS multiply blending and 70% opacity let the existing paper show through while keeping ink detail. No vignette overlaps text or takes pointer/keyboard focus; forced colors suppresses decorative art. Missing artwork leaves the reading area and Back button usable.

## Original generated files and exact prompts

### Profile

Original: `C:\Users\al\.codex\generated_images\01a08f20-727b-7ef3-a54b-b75de987c5e9\exec-8fe9b988-f8e8-45e7-b6d6-cba3bb650829.png`

Use case: illustration-story. Asset type: a small decorative ink vignette for a cinematic parchment dialog on a personal website. Create a new original illustration, not a full UI or a sheet of paper. Style: quiet early-modern architectural engraving, exceptionally fine charcoal-brown pen lines, light sparse crosshatching, subtle hand-drawn realism, matching an antique estate map. Color: monochrome warm charcoal-brown ink only; no white fills. Transparent background with real alpha, including surrounding negative space. Composition: one centered isolated landmark, square canvas, comfortable generous transparent margin, visually soft sparse perimeter with a few tapering ground strokes. No rectangular background, paper texture, border, drop shadow, labels, letters, numbers, logos, text, watermark, heavy black mass, bright highlights, or full landscape. Keep recognizable structure at 160px display size. Subject: a slender stone watchtower with an overhanging timber balcony and hipped tiled roof, narrow arched door and small windows. Three-quarter view, grounded on a little uneven rocky earth. Only two or three tiny cypress accents close to the base. The tower silhouette is tall and poised, echoes a medieval estate watchtower. Preserve generous breathing room and delicate lines.

### Experience

Original: `C:\Users\al\.codex\generated_images\01a08f20-727b-7ef3-a54b-b75de987c5e9\exec-68fdd18e-0bc6-470b-8e48-0e47f094831e.png`

Use case: illustration-story. Asset type: a small decorative ink vignette for a cinematic parchment dialog on a personal website. Create a new original illustration, not a full UI or a sheet of paper. Style: quiet early-modern architectural engraving, exceptionally fine charcoal-brown pen lines, light sparse crosshatching, subtle hand-drawn realism, matching an antique estate map. Color: monochrome warm charcoal-brown ink only; no white fills. Transparent background with real alpha, including surrounding negative space. Composition: one centered isolated landmark, square canvas, comfortable generous transparent margin, visually soft sparse perimeter with a few tapering ground strokes. No rectangular background, paper texture, border, drop shadow, labels, letters, numbers, logos, text, watermark, heavy black mass, bright highlights, or full landscape. Keep recognizable structure at 160px display size. Subject: a modest medieval stone archive building, broad and low, with steep pitched roof, a central pointed-arch door, fine masonry and a small window. A few stacked closed record books and a tied folio sit near its base, clearly recognizable but restrained. Slight three-quarter view, only a few tapering ground strokes. Thoughtful orderly impression, not a cathedral.

### Contact

Original: `C:\Users\al\.codex\generated_images\01a08f20-727b-7ef3-a54b-b75de987c5e9\exec-f0ff900e-b3c5-457b-ac48-fd023af811cc.png`

Use case: illustration-story. Asset type: a small decorative ink vignette for a cinematic parchment dialog on a personal website. Create a new original illustration, not a full UI or a sheet of paper. Style: quiet early-modern architectural engraving, exceptionally fine charcoal-brown pen lines, light sparse crosshatching, subtle hand-drawn realism, matching an antique estate map. Color: monochrome warm charcoal-brown ink only; no white fills. Transparent background with real alpha, including surrounding negative space. Composition: one centered isolated landmark, square canvas, comfortable generous transparent margin, visually soft sparse perimeter with a few tapering ground strokes. No rectangular background, paper texture, border, drop shadow, labels, letters, numbers, logos, text, watermark, heavy black mass, bright highlights, or full landscape. Keep recognizable structure at 160px display size. Subject: a small timber courier shelter with a hipped roof and two slender posts, accompanied by a prominently readable folded paper envelope resting beside it in the foreground. Envelope has a triangular folded flap and a tiny blank stamp rectangle without lettering. Slight three-quarter view. Small, inviting, balanced silhouette; no person or animal. Keep the envelope contour distinct at icon-like size.

## Review

- [x] Reviewed About illumination and label integration on desktop and phone; landmark coordinates and accepted artwork remain unchanged.
- [x] Reviewed all three vignettes at actual display size, high DPI, short landscape, and 200% CSS zoom. Text and artwork never overlap; Back targets remain at least 44px and reachable. The short-landscape About map retains natural scrolling.
- [x] Missing map/paper/vignette requests and forced colors retain complete copy and working navigation. Decorative vignettes are suppressed in forced colors.
- [x] All 20 focused asset, markup, icon, and isolated portability tests passed. Full scene/build/release checks are recorded by the main implementation task.


## Browser evidence after refinement

Local preview: http://127.0.0.1:4180/?tour=0. Independent headless Chrome matrix completed against the rebuilt CSS on 2026-09-11. All eight scenarios passed: desktop 1440x1000, portrait phone 390x844 at DPR 2, short landscape 844x390, desktop DPR 2, 200% CSS zoom, reduced motion, blocked paper/map/vignette images, and forced colors. Each scenario exercised About plus Profile, Experience, and Contact, including keyboard entry, focus wrapping and restoration, Back/Escape/backdrop dismissal, hover emphasis, and reopening before the previous close timer completes. No page errors or horizontal overflow were observed.

Visual QA caught and corrected a repeating illumination gradient that made a faint rectangular paper seam; the light layer now spans the sheet while grain repeats independently. About's close focus ring now uses dark ink on paper and the system Highlight color in forced colors. Final screenshots show continuous paper lighting, readable ink, and distinct subordinate vignettes.

Actual rendered paper contrast was measured beneath each body-text rectangle by hiding only the content while preserving the exact paper/texture/illumination layers and layout. Every screenshot pixel in that quiet rectangle was compared with the computed body-ink color. Minimum observed ratio was 11.51:1, above the 4.5:1 requirement; missing-image fallback was at least 12.01:1, and forced colors was 21:1. These measurements cover the sampled body writing areas, not every pixel of the decorative paper edges or map illustration.

Evidence is local and gitignored: `.tmp-preview-review/ui-qa.cjs`, `.tmp-preview-review/ui-qa-results.json`, and `.tmp-preview-review/ui-*.png`. The `*-quiet.png` captures are the paper-only contrast samples. No production or fallback-poster changes were made by this UI subtask.
