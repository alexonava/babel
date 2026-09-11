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
It preserves the existing raised-block positions and proportions. The local
construction pilot reuses this same geometry for selected crown blocks. The
selected geometry and texture direction were reviewed together before integration.

Tool: [Meshy](https://www.meshy.ai/).

## Authored limestone tread

The optional shared stair-tread geometry in `images/materials/stone-tread.bin`
was generated for this site with Meshy 6 and prepared locally as a normalized
BRK1 mesh with 180 triangles. It uses the existing Adobe Firefly/Meshy
stone color and roughness maps described above; no additional generated image
maps are shipped. Source masters remain outside the website payload. The tread
and crown construction pilot is pending visual acceptance.

## Supplied Meshy architecture models

The architecture pilot uses five textured Meshy GLBs supplied by Alex Nava:
a sandstone stair flight, modular dungeon wall, low ruined stone wall,
Crumbled Bastion, and a tree. Local derivatives appear in images/architecture/
as stairs, wall, base, crown, and tree, with high and balanced variants.
Their source geometry and surface detail are retained through local
optimization, fitting, and texture preparation. Original files, hashes, and
preparation records are preserved in the local artwork archive. No new
Meshy generation was commissioned for this integration.

## Authored ground material

The optional ground colour and normal maps in `images/materials/ground-*.webp`
were baked locally from the Meshy "Cracked Desert Ground" model supplied by
Alex Nava. The textured slab was rasterised top-down into planar tiles, its
height converted to a tangent-space normal map, and its colour desaturated and
remapped to the site's night ground palette. The source model, hashes, and bake
parameters are preserved in the local artwork archive and summarised in
README.md. No new Meshy generation was commissioned for this integration.

Tool: [Meshy](https://www.meshy.ai/).


## Poly Haven Dirt

The optional `images/materials/earth-*.webp` color, OpenGL normal and roughness
maps derive from [Dirt by Charlotte Baglioni](https://polyhaven.com/a/dirt),
available from Poly Haven under [CC0](https://polyhaven.com/license).
The source two-meter tile is calibrated to 6.3 scene units. Local derivatives
use muted damp-earth color, normalized normals and mostly matte roughness,
exported at 1024 and 512 pixels. Original PNGs, download URLs, SHA-256 hashes
and optimization settings remain in the owner's `Pictures/Assets/Babel/Materials/PolyHaven-Dirt`
archive. No external runtime service or additional generation is used.

## Poly Haven Sparse Grass

The optional `images/materials/grass-{color,mask}.webp` maps derive from
[Sparse Grass by Poly Haven](https://polyhaven.com/a/sparse_grass), available
under [CC0](https://polyhaven.com/license). The source two-meter tile is
calibrated to 9 scene units, chosen to avoid a correlated repeat with the
earth material's own 6.3-unit tile. The local derivative mutes the diffuse map
into a subdued moss-olive tone under moonlight, and lightly smooths the mask
to cut file size while keeping its tuft-versus-soil patchiness; both are
exported at 1024 and 512 pixels. Blended into the earth material as patchy
grass away from the tower footing and tree roots — never a base ground
replacement. Original PNGs, download URLs, MD5 hashes and optimization
settings remain in the owner's `Pictures/Assets/Babel/Materials/PolyHaven-SparseGrass`
archive. No external runtime service or additional generation is used.

## Background hill silhouette elevation data

The distant hill silhouette (`src/scene/hill-silhouette.js`) is built from a
48-sample circular elevation traverse (1.6 km radius, centered on the South
Downs near Devil's Dyke, West Sussex, England, 50.9050 N -0.2110 W), retrieved
2026-09-09 via the public [Open-Elevation API](https://api.open-elevation.com),
which serves SRTM-derived elevation data — a NASA/USGS public-domain work, no
attribution legally required. The samples are baked as a normalized constant
array in source; no binary asset, runtime fetch, or additional generation is
used. Noted here for transparency, consistent with this file's practice of
recording sourcing even where the license does not require it.

## Navigation model renders

About uses the owner-supplied Meshy leather document case; Contact uses the
stamped paper envelope. These are transparent 256px WebP renders, not runtime
3D models. Original GLBs remain unchanged in the owner's Downloads folder and
are excluded from the site payload.

- Meshy_AI_Leather_Envelope_Case_0911015506_texture.glb — SHA-256 `a819c2ef4b466d5544e70ecbffdf806c1eb75b9ba3dfa2bc2ffcd88239989b60`.
- Meshy_AI_Stylized_3D_game_prop_0911015500_texture.glb — SHA-256 `65d412aa8ac6786551ff41b3c3386b126b9d9d37ab3d707b85809a2255447aed`.

Render recipe: Blender 4.5 Cycles, 96 samples with denoising, AgX, 512px
transparent film, orthographic scale 2.3 and camera (0.35, -4, 0.7) looking at
the origin after GLB import. Two soft area lights: (-2, -3, 4), 450 W / 4 units;
(3, -2, 1), 110 W / 3 units. World color (0.35, 0.37, 0.42), strength 0.5.
Downsample with Lanczos to 256px and export WebP quality 92, method 6, exact
alpha. Combined size: 17,972 bytes.


## Cotton paper panel material

The About and Contact paper textures were generated with OpenAI's built-in image generation tool and prepared as local WebP material assets. Generation prompts, source provenance, export settings and validation are recorded in `PAPER-PANELS-QA.md`. They are decorative; all panel wording remains selectable HTML.


## Illustrated navigation icons

The superseded experimental About leather case and Contact stamped-envelope icons were original AI-generated 2D illustrations, using the previous supplied-model renders as object references. Generated with the built-in OpenAI image tool; prompt set, source files and export details are in `NAV-ICONS-QA.md`. The original GLBs remain unchanged and are not shipped as navigation assets.


Current navigation uses the original supplied GLBs rendered with matching camera yaw (+15 degrees for both About and Contact), 6-degree elevation, and 80% baked brightness. See the current section of `NAV-ICONS-QA.md` for the reproducible camera/lighting/export recipe and validation. No generated illustration remains in the current navigation assets.
