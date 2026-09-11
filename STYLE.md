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

## Estate homepage

The illustrated estate is the homepage. Preserve its desktop and portrait proportions, transparent paper boundary, and aligned Profile, Experience, and Contact destinations. Alex Nava uses the preferred 700-weight warm-white serif above the parchment. The introduction and footer stay quiet. Dialogs use simple cotton paper, readable dark ink, 44px close controls, and immediate reduced-motion behavior. No scene, tour, entry icon, scroll curls, or gold UI text is active.

## Archived scene interaction

The notes below describe earlier scene and icon treatments retained for rollback; the estate direction above takes precedence.


- The homepage can stay sparse as long as core actions remain legible.
- Bottom nav model icons should keep their flap faces readable, straight-on at rest. While a panel is open its icon reveals the right edge; closing restores the front view.
- Panels should open quickly, close cleanly, and always remain keyboard-friendly.
- About and Contact panels share one warm parchment frame system; preserve that pair logic when refining either panel.

## Guardrails

- Preserve the current overall alignment and composition unless the task explicitly calls for a layout change.
- Don't add frameworks, extra font payload, or decorative assets without approval.
- Prefer atmospheric depth from gradients, lighting, and procedural texture instead of piling on UI chrome.

## Cinematic UI baseline

- Preserve the preferred original name treatment: Cormorant at 700 weight, #f7f1ea, and its soft halo. Parchment headings retain the refined 500 weight. Keep the existing title scale, line heights, and copy.
- Foreground hierarchy is the preserved warm-white name, soft off-white intro, pale stone navigation labels, then neutral-gray metadata. Gold belongs to the sun and material details, not secondary UI text. UI controls use the shared surface/line/focus tokens; avoid bright blue chrome or glossy buttons.
- Camera-review controls stay compact with quiet lower rules and explicit focus outlines. They remain opt-in preview controls.
- Keep model icons at 80% brightness, baked into the images without an additional CSS brightness filter. Labels stay visible and independent of the image; hover lift remains restrained.
- About and Contact share subdued parchment, dark ink, and a dim scene backdrop. Both use quiet cotton fibers, restrained nine-slice paper edges, and crisp selectable ink. No ruled lines, monograms, or wax seals. The 44px close control stays legible. Panels lift into light over 440ms and close over 240ms; reduced motion is immediate.
- Preserve hero/navigation bounds because scene framing uses those DOM rectangles. Recheck phone and desktop framing whenever text metrics or spacing change.
- Panel motion is a short 12px settle. Reduced motion removes the settle and close-button movement; maintain keyboard focus trapping/restoration.
