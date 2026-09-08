# Credits

## Third-party libraries

- **Three.js** (r160) — MIT License. Copyright (c) 2010-2021 three.js authors.
  Packaged via npm and bundled into `dist/scripts/scene.HASH.js` during the build.
  Source: https://github.com/mrdoob/three.js

## Typography

- **Cormorant Garamond** by Christian Thalmann — SIL Open Font License (OFL).
  Self-hosted as local woff2 subsets in `fonts/`.
- **Instrument Sans** by The Instrument Sans Project Authors — SIL Open Font License (OFL).
  Self-hosted as local woff2 subsets in `fonts/`.

## Site content and code

Site code and procedural scene (Tower of Babel textures, materials, camera,
and animation) © 2026 Alex Nava. Released under the MIT License (see LICENSE).

The scene retains procedural brick structure, mortar relief, dirt, bark, clouds,
and foliage. Responsive tower posters are local raster assets.

## Authored stone detail

The optional stone color and roughness maps in `images/materials/` were prepared
for this site from an Adobe Firefly weathered-limestone reference and a Meshy
Retexture material pilot on a locally authored UV-mapped slab, using Meshy 6
with original UVs, PBR maps, and lighting removal. Source masters remain in the
owner's local art workspace rather than the website payload.

The slab's front material sample was cropped, corrected for periodic boundaries,
normalized to a restrained stone palette and matte roughness, and exported as
local 1024 and 512 lossless WebP variants. Color is blended into the existing
procedural cells; roughness augments the current materials. The generated normal
map is retained with the source masters and is not shipped or applied.

Tools: [Adobe Firefly](https://firefly.adobe.com/),
[Meshy Retexture](https://docs.meshy.ai/en/api/retexture).

## Authored brick geometry

The optional raised-brick geometry in `images/materials/stone-brick.bin` was
generated for this site with Meshy 6, then normalized to a unit block and given
box-projected UVs for the stone material. The shared model has 838 triangles and
uses a compact local binary, without shipping the source GLB or a model loader.
It preserves the existing raised-block positions and proportions; the rest of
the tower geometry remains procedural. The selected geometry and texture
direction were reviewed together before integration.

Tool: [Meshy](https://www.meshy.ai/).
