# STYLE.md

Design intent and aesthetic rules for alexnava.me. Read this before making visual, motion, or typographic changes.

## Core ethos

**Calm by design.** Quiet on load. Clear on click. Deep on scroll.

The page should feel intentional and still. It can be atmospheric, but it should not read as generic dark UI or visual noise.

## Palette

- Backgrounds should stay in deep navy, soot, twilight stone, and warm parchment ranges.
- Text stays warm off-white rather than pure white.
- Accent energy comes from amber, brass, and soft peach, with occasional cool twilight lift in supporting layers.
- Avoid flat black, neon accents, or saturated rainbow color.

## Typography

- Display: `Cormorant Garamond`
- Body/UI: `Instrument Sans`
- Headings are large, tight, and calm
- Eyebrows are uppercase, tracked out, and restrained

## Motion

- Motion is structural, not decorative.
- Scroll-driven changes should feel slow and intentional.
- Hover/focus responses may brighten or lift slightly, but should never spin or jitter.
- All motion must respect `prefers-reduced-motion: reduce`.

## Interaction

- The homepage can stay sparse as long as core actions remain legible.
- Bottom nav icons should stay front-facing and clearly readable against their button backgrounds.
- Panels should open quickly, close cleanly, and always remain keyboard-friendly.
- About and Contact panels share one warm parchment frame system; preserve that pair logic when refining either panel.

## Guardrails

- Preserve the current overall alignment and composition unless the task explicitly calls for a layout change.
- Don't add frameworks, extra font payload, or decorative assets without approval.
- Prefer atmospheric depth from gradients, lighting, and procedural texture instead of piling on UI chrome.

## Cinematic UI baseline

- Use the loaded 500-weight Cormorant face for the hero and parchment headings; avoid synthetic bold. Keep the existing title scale, line heights, and copy.
- Foreground hierarchy is warm parchment, muted stone, then metadata. UI controls use the shared surface/line/focus tokens; avoid bright blue chrome or glossy buttons.
- Camera-review controls stay compact with quiet lower rules and explicit focus outlines. They remain opt-in preview controls.
- Keep model icons at 80% brightness. Labels stay visible and independent of the image; hover lift remains restrained.
- About and Contact share subdued parchment, dark ink, and a dim scene backdrop. Contact uses a small matte wax impression; the close control is flat and legible.
- Preserve hero/navigation bounds because scene framing uses those DOM rectangles. Recheck phone and desktop framing whenever text metrics or spacing change.
- Panel motion is a short 12px settle. Reduced motion removes the settle and close-button movement; maintain keyboard focus trapping/restoration.
