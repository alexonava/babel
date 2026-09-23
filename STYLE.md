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

## Scene-first homepage and estate menu

The cinematic tower and tree scene opens first, with the preferred 700-weight warm-white Alex Nava serif and a quiet introduction. Preserve the seven-view automatic camera tour, sun, stars, and lighting. Masonry study is retained only for explicit comparison links. No loading ritual should delay the identity or About navigation.

About opens the accepted illustrated estate as a menu over the dimmed scene. Preserve its desktop and portrait proportions, transparent paper boundary, and aligned Profile, Experience, and Contact landmarks. Keep About's title modest and its close control legible. Category dialogs use simple cotton paper and readable dark ink; Back, Escape, and backdrop dismissal return to the estate before the outer About dialog returns to the scene.

Keep the single About case icon readable and straight-on at rest, revealing its right edge while About or a child category is open. Its label and ordinary text fallback remain usable without the icon, map artwork, or JavaScript. Child panels do not restore the old scroll curls, diagram map, separate Contact entry icon, or gold UI text.

## Historical interface treatments

The direct-estate homepage and the earlier pair of About/Contact entry icons remain documented in prior review notes. They record earlier iterations rather than the current navigation contract. Their accepted estate illustration, simple-paper material, and restrained icon shading carry forward into the scene-first menu.

## Guardrails

- Preserve the current overall alignment and composition unless the task explicitly calls for a layout change.
- Don't add frameworks, extra font payload, or decorative assets without approval.
- Prefer atmospheric depth from gradients, lighting, and procedural texture instead of piling on UI chrome.

## Materials, foliage and sky

- Keep the supplied tower and tree silhouettes, UVs and authored map resolutions. Tower roughness is 0.90; tree roughness maps into 0.84–0.97 with its normal map retained. Stone, roof, wood and foliage should remain distinct without becoming glossy or losing their supplied color character.
- Canopy detail follows source surface area with deterministic placement. Keep the existing single instanced draw, capped at 3600 leaves on high and 1800 on balanced, hidden on low. Derived leaves do not expand camera-fitting bounds or alter the supplied mesh.
- Lift shadow detail through the existing cool fill and hemisphere lighting. Preserve the warm sun and lantern accents, dark recesses and ground contact; do not add lights or flatten the scene with ambient brightness.
- The nebula is a still, restrained blue-violet field with dark dust and a faint peach core. Its small star cluster reuses the existing star population; sky and stars share dust placement and attenuation. Keep it behind the identity and architecture without turning it into an animated foreground effect.
- Reuse the sky shell and star draw with no extra render pass. High uses three nebula noise octaves, balanced two; low and inactive film/fallback paths retain the quiet baseline sky. Existing cloud motion and reduced-motion behavior remain separate from the still nebula.
- Keep the current terrain textures and their high/balanced resolutions. Compare live views before refreshing landscape and portrait posters and the og.png share card; each final static image must represent the accepted live appearance.

## Cinematic UI baseline

- Preserve the preferred original name treatment: Cormorant at 700 weight, #f7f1ea, and its soft halo. The name renders the variable font's true 700 master with synthetic bold disabled. Parchment headings retain the refined 500 weight. Keep the existing title scale, line heights, and copy.
- Foreground hierarchy is the preserved warm-white name, soft off-white intro, pale stone navigation labels, then neutral-gray metadata. Gold belongs to the sun and material details, not secondary UI text. UI controls use the shared surface/line/focus tokens; avoid bright blue chrome or glossy buttons.
- The camera tour runs without a visible shot label or control strip. Preserve default five-second cycling and reduced-motion/panel pauses; comparison timing remains available through URL parameters.
- Keep model icons at 80% brightness, baked into the images without an additional CSS brightness filter. Labels stay visible and independent of the image; hover lift remains restrained.
- The About estate and its Profile, Experience, and Contact dialogs share dark ink and a dim scene backdrop. Child panels use quiet cotton fibers, restrained paper edges, and crisp selectable ink. No ruled lines, monograms, or wax seals. Close and Back controls have at least 44px targets. Panels lift into light over 440ms and close over 240ms; reduced motion is immediate.
- Preserve hero/navigation bounds because scene framing uses those DOM rectangles. Recheck phone and desktop framing whenever text metrics or spacing change.
- Opening motion rises 18px with a shallow tilt and settles to crisp text. Reduced motion removes that movement; maintain keyboard focus trapping and restoration through child-to-menu and menu-to-scene transitions.
