# Unified dark gothic loading ritual

**Status:** Implemented for preview review.
**Captured:** 2026-07-23.

## Intent

Cover the eager tower poster with a short, original loading ritual on each real page load. The
sequence borrows atmosphere from dark gothic interfaces—soot, cathedral geometry, aged brass,
fog, and ember light—without borrowing symbols, typography, or artwork from another property.

The visual hierarchy stays restrained:

1. The engraved tower seal is the focal element.
2. Cold fog supplies depth without obscuring the seal.
3. Two small braziers provide a final warm ignition.
4. A thin progress stroke communicates the intro's pacing, not download percentage.

## Timeline

- `0–180 ms`: cold fog gathers around the seal.
- `100–650 ms`: the brass tower and circular engraving draw.
- `420–780 ms`: the braziers ignite and warm the lower tower.
- `160–900 ms`: the progress stroke fills while an ember travels the ring.
- `850–1100 ms`: the overlay dissolves into the homepage.

The ritual never waits on Three.js. It reveals the live scene when ready and otherwise reveals the
responsive poster, which remains the truthful fallback for slow loading, reduced data or motion,
unavailable WebGL, software rendering, and scene failure.

## Accessibility and resilience

- The ritual is decorative, `aria-hidden`, non-focusable, and does not announce fake progress.
- The page and skip link remain available immediately.
- Reduced motion shows the completed seal and lit braziers, then exits in roughly `370 ms`.
- Forced colors removes fog and glow and uses system colors.
- CSS owns the exit, so the overlay hides even when JavaScript fails.
- No storage is used; the ritual runs on each real navigation or reload.
