# Scene interactions audit

**Captured:** 2026-05-05
**Auditor:** Codex

## System: Ground solidity

- **Expected rule:** Ground-level geometry should use the same ground reference and sit on, or deliberately offset from, the procedural surface.
- **Actual:** `WORLD.FLOOR_Y` declares y=0 as the feet anchor while `scene.groundHeight()` defines the visible terrain surface (`src/scene/world.js:18`, `src/scene/helpers.js:25`). The main ground and overlay sample that surface vertex-by-vertex (`src/scene/index.js:865`, `src/scene/index.js:905`), but plant sprites are positioned at `groundHeight() + 0.05/0.06` and then lifted by `0.45 * scale` so their billboard centers sit above the plane (`src/scene/index.js:2132`, `src/scene/index.js:2143`, `src/scene/index.js:2169`, `src/scene/index.js:2180`, `src/scene/index.js:2210`, `src/scene/index.js:2224`).
- **Gap:** No hard contradiction for the ground mesh itself; billboard plants depend on texture whitespace to read as rooted, so a few may appear to float if the sprite art has bottom padding.
- **Severity:** cosmetic
- **Suggested fix:** Normalize sprite texture anchors or subtract a per-sprite foot offset from the billboard center.

## System: Tower attachment

- **Expected rule:** Tower-attached decoration should be flush with the tower body or visibly embedded in it.
- **Actual:** Buttresses are placed at radius `18.3` around the plinth (`src/scene/index.js:2378`, `src/scene/index.js:2395`), while the main shell is a tapered cylinder whose local radius ranges from about `12.2` at the base to `8.8` at the top and is positioned at `groundHeight(0, 0) + 18.5` (`src/scene/index.js:2540`). Relief scars use the deformed shell geometry and share `mesh39.position.y` (`src/scene/index.js:2572`, `src/scene/index.js:2667`), and relief bricks compute `radial = shellR + depth * 0.42` before placement (`src/scene/index.js:2868`, `src/scene/index.js:2884`, `src/scene/index.js:2886`).
- **Gap:** Relief scars/bricks are shell-aware; buttresses are plinth-ring elements rather than shell-attached and may read slightly detached from the tower wall because their fixed radius is wider than the shell radius.
- **Severity:** noticeable
- **Suggested fix:** Derive buttress radial placement from the plinth/ring radius plus half-depth and add a small inward overlap.

## System: Cloud anchoring

- **Expected rule:** Cloud layers should respect the composition cloud anchor and keep their local bands above the ground.
- **Actual:** `cloudAnchor` is a camera-following group whose y is driven by the composition profile (`src/scene/index.js:4073`, `src/scene/index.js:4074`, `src/scene/index.js:4456`); its x/z are copied from the camera each frame (`src/scene/index.js:4595`, `src/scene/index.js:4596`). Drift clouds sit at `groundHeight(0, 0) + 20.8..34.6` locally (`src/scene/index.js:4137`, `src/scene/index.js:4147`), ember clouds use per-position `groundHeight() + 2.6..14.1` (`src/scene/index.js:4256`, `src/scene/index.js:4269`), haze clouds use `groundHeight(0, 0) + 0.5..6.5` (`src/scene/index.js:4320`, `src/scene/index.js:4332`), pulse clouds use `baseY: 50` (`src/scene/index.js:4408`, `src/scene/index.js:4913`), and mid-cloud sprites are world-locked at y `20..60` rather than parented under `cloudAnchor` (`src/scene/index.js:2041`, `src/scene/index.js:2066`, `src/scene/index.js:2073`).
- **Gap:** Camera-following haze can land close to the visible terrain after the anchor offset is applied, and mid-clouds do not share the cloud-anchor band, though none intentionally drift below ground in local math.
- **Severity:** noticeable
- **Suggested fix:** Define named cloud bands relative to `cloudAnchorY` and clamp haze lower bounds above the visible terrain silhouette.

## System: Ground decoration

- **Expected rule:** Ground decoration should sit on the terrain and use offsets that match each asset's implied foot.
- **Actual:** Stone scatter and halo twisters sample `groundHeight()` and place mesh centers above the terrain by a scale-based amount (`src/scene/index.js:1039`, `src/scene/index.js:1078`, `src/scene/index.js:1104`). Plant sprites use sampled terrain plus small offsets and center-lifted billboard placement (`src/scene/index.js:2132`, `src/scene/index.js:2143`, `src/scene/index.js:2169`, `src/scene/index.js:2180`). Some terrain deformation later lowers existing vertices for crater-like shaping (`src/scene/index.js:3712`).
- **Gap:** Mesh scatter mostly reads grounded; plant billboards can visually float for the same anchor reason as ground solidity, and crater deformation after initial ground sampling can make earlier placements less exact in the affected area.
- **Severity:** cosmetic
- **Suggested fix:** Apply a shared foot-anchor helper after final terrain deformation and use it for all ground decorations.

## System: Billboard orientation

- **Expected rule:** Sprite-based decoration should face the camera or be intentionally camera-basis locked.
- **Actual:** Most decorative puffs/plants are `THREE.Sprite` instances, so they face the camera by default (`src/scene/index.js:2055`, `src/scene/index.js:2133`, `src/scene/index.js:4128`, `src/scene/index.js:4257`, `src/scene/index.js:4321`, `src/scene/index.js:4379`). Orbital halo sprites are explicitly placed in the camera basis using `camera.matrixWorld.extractBasis()` before setting their local positions (`src/scene/index.js:4944`, `src/scene/index.js:4970`).
- **Gap:** No flat-plane billboard contradiction found; the main risk is artistic, where camera-facing ground plants can look upright on slopes instead of normal-aligned to the terrain.
- **Severity:** cosmetic
- **Suggested fix:** Keep atmosphere as sprites, but consider slope-aware tilt only for near-ground plant sprites.

## System: Camera-locked vs world-locked

- **Expected rule:** Camera-locked layers should be explicitly atmospheric; tower, ground, and local decorations should remain world-locked.
- **Actual:** `cloudAnchor` follows camera x/z every frame (`src/scene/index.js:4595`, `src/scene/index.js:4596`), while the ground/tower scene group uses composition y offsets only (`src/scene/index.js:4455`). Visibility classification is camera-relative through `createSceneVisibilityTracker()` (`src/scene/visibility.js:19`, `src/scene/visibility.js:37`), and the halo uses camera basis placement for a screen-facing orbital effect (`src/scene/index.js:4944`, `src/scene/index.js:4970`).
- **Gap:** Cloud layers are intentionally camera-following, but because they also contain ground-referenced ember/haze heights, some elements blend world-ground and camera-lock rules.
- **Severity:** noticeable
- **Suggested fix:** Split camera-following atmosphere from world-ground haze/embers, or document the hybrid as a deliberate parallax layer.

## System: Scroll coupling

- **Expected rule:** Scroll should either clearly parallax the scene or only fade it, without half-coupled motion that reads accidental.
- **Actual:** Scroll writes `cfg2.scrollTarget` from `window.scrollY` (`src/scene/index.js:4542`), eases it into `cfg2.scroll` (`src/scene/index.js:4579`), and changes camera orbit radius, height, and look-at target from the active composition profile (`src/scene/index.js:4584`, `src/scene/index.js:4587`, `src/scene/index.js:4590`, `src/scene/index.js:4594`, `src/scene/index.js:4598`). It is not opacity-only.
- **Gap:** No contradiction found; scroll parallax is real and camera-driven.
- **Severity:** cosmetic
- **Suggested fix:** None; keep the scroll coupling as composition-camera motion.

## System: Fog respect

- **Expected rule:** Geometry beyond the useful fog range should be intentional silhouette or avoided.
- **Actual:** High tier fog is near 62 / far 150, balanced is 60 / 146, and low is 56 / 138 (`src/scene/quality.js:135`, `src/scene/quality.js:136`, `src/scene/quality.js:195`, `src/scene/quality.js:196`, `src/scene/quality.js:252`, `src/scene/quality.js:253`). The ground radius is 88 and sky dome radius is 130 (`src/scene/world.js:19`, `src/scene/world.js:23`). Mid-clouds can sit at radius 58..100 with visibility radius 112 (`src/scene/index.js:2050`, `src/scene/index.js:2086`), pulse clouds can sit at distance 32..94 plus 122 visibility radius (`src/scene/index.js:4370`, `src/scene/index.js:4424`), and pulse sprites opt out of material fog (`src/scene/index.js:4380`).
- **Gap:** Most world extents stay inside or near the fog range, but far pulse clouds are intentionally fog-disabled and can remain visible where other objects fade.
- **Severity:** noticeable
- **Suggested fix:** Give fog-disabled far sprites an explicit distance fade tied to the active fog far value.
