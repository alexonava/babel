# Brick UI Brief

## Purpose

Translate the babel tower, marble, cloister, and postprocess design language into
a reusable interface style for the next UI project. The likely first target is
the standalone DAW demo:

`C:\Users\nava\source\fantastic-journey\docs\demos\daw-interface.html`

This brief is a design contract, not a dependency. It should travel with the
next project as guidance for tokens, layout, canvas drawing, and interaction
states.

## Source Anchors

- `STYLE.md` sets the tone: calm by design, quiet on load, clear on click, deep
  on scroll.
- `src/scene/textures.js` defines the tower brick system: strict rows and
  columns, staggered seams, small deterministic shade changes, mortar highlight
  and shadow, collapse-biased staining, cracks, and soot streaks.
- `src/scene/palette.js` supplies the useful material families: limestone,
  mortar, soot, moss, cool slate, parchment, marble, and warm highlights.
- `ART/marble.md` adds a soft prestige material: pale cool stone, subtle veins,
  low-opacity cracks, restrained polished highlight.
- `ART/cloister-fragment.md` adds the ruin grammar: stacked drums, edge chipping,
  lower-edge scorch, and damage that reads as history rather than effect.
- `ART/postprocess-pipeline.md` defines the cinematic layer: warm lifted shadows,
  slightly desaturated midtones, cool highlights, gentle vignette, static grain.

## North Star

The UI should feel like a crafted control surface made from weathered modules:
precise, quiet, tactile, and a little ancient. It is not a fantasy skin and it
is not generic dark software. It should remain an efficient instrument panel
first, with the brick language carrying structure and state.

Short version:

> Masonry grid. Relief controls. Parchment data. Brass live states. Soot in the
> recesses. Calm everywhere else.

## Core Grammar

1. **Structure is masonry.** Tracks, rows, clips, panels, and timelines should
   line up like courses of stone. Seams are visible and useful, not hidden.
2. **Interactive objects are relief bricks.** Notes, clips, active buttons, and
   selected controls can lift slightly from the surface using a top highlight,
   bottom shadow, and inset border.
3. **Variation is deterministic and small.** The tower works because each brick
   varies a little without breaking the grid. UI elements should do the same
   through tiny tone shifts, edge wear, or procedural grain.
4. **Weathering lives at stress points.** Use soot, cracks, darker edges, or
   faded surfaces near active rails, disabled states, destructive actions, and
   overloaded lanes. Do not spread damage evenly.
5. **Color is rare.** Most of the UI should live in soot, stone, parchment, and
   slate. Brass/amber marks the active transport, playhead, selection, and
   confirmed action. Red is for record, destructive action, or clipping only.
6. **Motion is structural.** Playhead glide, panel open/close, hover lift, focus
   reveal, and meter motion are allowed. Decorative jitter, spins, flare, and
   restless shimmer are out.
7. **Global tone does more than chrome.** Prefer a shared grading layer, surface
   texture, and consistent seams over many separate decorative widgets.

## Suggested Tokens

These are starting points for CSS custom properties, not final law. Tune by eye
inside the target project.

| Token               | Value                       | Use                                  |
| ------------------- | --------------------------- | ------------------------------------ |
| `--ui-bg`           | `#0b0f14`                   | Main application background          |
| `--ui-bg-lift`      | `#111824`                   | Raised dark panels and rails         |
| `--ui-soot`         | `#1a1612`                   | Deep recesses, disabled overlays     |
| `--ui-stone`        | `#d8d2cc`                   | Marble/stone surface base            |
| `--ui-limestone`    | `#e4d7c3`                   | Warmer block surface                 |
| `--ui-parchment`    | `#f1e7d2`                   | Primary readable light surface       |
| `--ui-text`         | `#efeae3`                   | Warm off-white text                  |
| `--ui-muted`        | `#9ea4ab`                   | Secondary text and cool stone shadow |
| `--ui-slate`        | `#6f7886`                   | Secondary data, grid accents, veins  |
| `--ui-mortar`       | `rgba(6, 10, 18, 0.22)`     | Seams and bottom shadows             |
| `--ui-mortar-light` | `rgba(252, 244, 234, 0.22)` | Top highlights                       |
| `--ui-brass`        | `#d6a75f`                   | Active transport, selection, focus   |
| `--ui-peach`        | `#e4a37d`                   | Gentle hover and supporting accent   |
| `--ui-record`       | `#b94f3c`                   | Record, destructive, clipping        |

## Component Translation

### App Shell

- Use a deep soot/navy background with subtle vertical warmth near the work
  area.
- Keep the main surface full-viewport and tool-like. Avoid a landing-page hero
  or decorative card stack.
- Use one shared material language for panels, rails, tracks, and overlays.

### Transport Rail

- Treat the transport as a heavier stone lintel or buttress across the top.
- Play, pause, stop, loop, and record controls should be compact icon-first
  buttons where possible.
- Active play state should use brass fill or brass edge light. Record is the
  only red-forward control.
- Numeric controls should be inset into the rail rather than floating as
  separate cards.

### Track Rows

- Each track is a masonry course: a fixed left control block plus a long piano
  roll surface.
- Row boundaries should read as mortar seams. Use stronger seams at bar
  boundaries and lighter seams at beats or subdivisions.
- Track color should be restrained. Use it as a thin chip, edge light, or note
  tint rather than flooding the whole row.
- Muted tracks should get a soot wash and lower contrast. Soloed tracks should
  gain brass edge emphasis without hiding neighboring context.

### Piano Roll And Clips

- Notes and clips are relief bricks.
- Draw notes with a top highlight, bottom shadow, slight inset, and small
  deterministic tonal variation from note id, pitch, or start tick.
- Selected notes get a brass outline or brass top edge, not a giant glow.
- Muted notes retain their position but look dusted or recessed.
- The playhead is a thin brass plumb line with a subtle highlight. It should
  feel precise, not flashy.

### Library And Browser Panels

- Use parchment or limestone surfaces when the panel is text-heavy.
- Lists should feel carved into rows: thin separators, small icons, dense labels.
- Empty states should be quiet and useful. Avoid marketing copy inside the app.

### Mixer Controls

- Sliders can borrow the brick logic: recessed track, raised thumb, brass fill
  for current value.
- Pan controls should use a compact center-biased mark. Keep labels short.
- Meters may animate, but should stay warm and restrained. Avoid rainbow meters.

### Buttons And Toggles

- Use low-radius rectangles, not pills.
- Default state: dark stone face, mortar border, warm text.
- Hover/focus: slight lift, top highlight, brass edge or outline.
- Pressed/active: inset relief with brass fill or brass edge.
- Disabled: soot wash, lower contrast, no strong shadow.

## DAW Implementation Notes

For `docs/demos/daw-interface.html`, keep the one-file, no-build shape unless
the user explicitly asks to split it.

1. Add tokenized CSS variables for the palette above.
2. Replace the current brighter cyan/pink/blue emphasis with restrained chips
   and edge accents.
3. Rework `.transport`, `.track`, `.track-sidebar`, `.roll-wrap`, and
   `canvas.piano-roll` to share the same stone/mortar frame system.
4. Update canvas drawing for the piano roll:
   - bar lines as stronger vertical mortar seams
   - beat lines as lighter seams
   - pitch rows as faint horizontal courses
   - notes as raised relief bricks
   - selected notes as brass-edged relief bricks
   - muted notes as soot-washed relief bricks
5. Keep responsive behavior practical: on narrow screens, the track control
   block may stack above the roll, but the row still needs a stable masonry
   frame.
6. Preserve current workflow features: transport, local storage,
   `webkitdirectory` import, MIDI parser, pointer editing, mute/solo, volume,
   pan, and file:// viability.

## Procedural Texture Guidance

Use procedural texture sparingly. The brick lesson is not "put noise on
everything"; it is "make repetition feel made by hand."

Good uses:

- a very subtle shared background grain
- faint stone variation on panels
- small deterministic note/clip shade offsets
- edge wear on active or disabled blocks
- darker lower-edge bias on heavy rails

Avoid:

- high-contrast noise behind text
- cracks on every component
- animated grain
- fake bevels large enough to make the UI look plastic
- saturated per-track color floods

## Accessibility And Performance

- Preserve keyboard focus visibility. Brass focus rings fit the style.
- Respect `prefers-reduced-motion: reduce`.
- Do not rely on color alone for mute, solo, record, or selection.
- Keep text warm and readable. No pure white on pure black.
- Keep canvas drawing cheap; deterministic variation should use small hash
  helpers, not per-frame expensive texture work.
- Maintain file:// support for the standalone DAW unless the project direction
  changes.
- Do not add dependencies for the style pass unless approved.

## Guardrails

- No neon, saturated rainbow palettes, or generic sci-fi dark UI.
- No big rounded cards, nested cards, or decorative chrome stacks.
- No columns, arches, or literal ruins in the interface unless the product
  itself calls for them.
- No gratuitous effects: lens flare, chromatic aberration, motion blur, animated
  grain, everything-glows bloom.
- Do not sacrifice scan density. A DAW needs to stay fast to read and operate.
- Do not let texture compete with controls, data, or labels.

## Ready-To-Use Handoff Prompt

Use this when switching into the DAW project:

```text
Please apply the Brick UI Brief from the babel repo to the standalone DAW demo.
Target file: docs/demos/daw-interface.html.

Keep the DAW self-contained and file:// runnable. Preserve all current DAW
features and interaction behavior. Refactor the visual layer into a restrained
brick-inspired control surface: masonry track rows, relief-brick MIDI notes,
mortar grid seams, parchment/stone panels, brass active states, soot-disabled
states, and structural motion only. Avoid neon, large rounded cards, decorative
ruins, or extra dependencies.

Start with CSS tokens and component surfaces, then update piano-roll canvas
drawing for the brick-note language. Verify in desktop and mobile browser
viewports that labels fit, controls remain usable, and the canvas remains
readable.
```

## Done When

- The UI reads as one coherent material system.
- The DAW is still visibly a DAW, not a themed landing page.
- Track rows, clips, notes, transport, and panels all share the same masonry
  logic.
- Active, selected, muted, disabled, and destructive states are visually
  distinct without loud color.
- The interface remains usable, dense, responsive, and file:// friendly.
