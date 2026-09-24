# Credits

## Third-party libraries

- **Three.js** (r160) — MIT License. Copyright (c) 2010-2023 three.js authors.
  Packaged via npm and bundled into the content-hashed `dist/scripts/scene.*.js` chunks during the build (Three.js core in `scene.shared.HASH.js`).
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
maps are shipped. Source masters remain outside the website payload.

## Supplied Meshy architecture models

The architecture pilot uses five textured Meshy GLBs supplied by Alex Nava:
a sandstone stair flight, modular dungeon wall, low ruined stone wall,
Crumbled Bastion, and a tree. Local derivatives appear in images/architecture/
as stairs, wall, base, crown, and tree, with high and balanced variants.
Their source geometry and surface detail are retained through local
optimization, fitting, and texture preparation. Original files, hashes, and
preparation records are preserved in the local artwork archive. No new
Meshy generation was commissioned for this integration.

## Supplied timber lookout tower

The complete tower in `images/architecture/tower-{high,balanced}.glb` is a
timber fire-lookout watchtower (lattice legs, ladder, railed gallery, half-walled
cabin and gabled roof) from the Meshy model
`Meshy_AI_watchtower_0923082652_texture.glb`, supplied by Alex Nava on
2026-09-23 (29,926,940 bytes, SHA-256
`5898eab40106aa3c7553b971d0d3caecf4664a65a1fc04358b5ef9e303dc1fc2`). It replaces
the earlier supplied Meshy stone watchtower, whose source and delivery records
remain in `Assets/Architecture/tower`.

The source was processed locally without recoloring or new generation: scaled
uniformly to unit height (+Y up, ladder and gallery access on +Z, no yaw baked),
decimated in Blender 4.5 with a seam-weighted collapse to 23,714 (high) and 9,718
(balanced) triangles while carrying the supplied UV layer, with folded UVs
repaired, and its color and tangent-space normal maps re-baked by Cycles from the
full-resolution source into those UVs. The maps ship as embedded WebP (2048 high,
1024 balanced) with stored tangents and `KHR_mesh_quantization` geometry. The
supplied roughness/metallic map was near uniform and is replaced by the site's
0.90 roughness. The intake copy is kept in `Assets/Imports`; its extracted maps,
preparation scripts, reports and QA renders are in `Assets/Architecture/tower-v2`
(see its `SOURCE-AND-DELIVERY.md`); none are published. No new Meshy generation
was commissioned.

Tool: [Meshy](https://www.meshy.ai/).

## Authored ground material

The ground colour and normal maps in `images/materials/ground-*.webp` were
baked locally from the Meshy "Cracked Desert Ground" model supplied by
Alex Nava. The textured slab was rasterised top-down into planar tiles, its
height converted to a tangent-space normal map, and its colour desaturated and
remapped to the site's night ground palette. The source model, hashes, and bake
parameters are preserved in the local artwork archive; runtime tiling and
normal strength are `GROUND_DETAIL_SETTINGS` in src/scene/stone-detail.js. No
new Meshy generation was commissioned for this integration.

These maps now serve only the comparison views. The default film ground is
a seamless v2 re-bake of the same supplied slab, published as
`images/materials/slate-{color,normal}-{1024,512}.webp` and
`slate-detail-512.webp`: Blender Cycles baked its height, normal and colour
top-down; the low frequencies were flattened, one-off features (plants and
stones) replaced from matching patches, the tile made seamless with
minimum-error cuts, and the colour matched to the earlier maps so the approved
slate tint holds. The shader blends two lookups of the tile, adds the detail
map's close relief, and paints puddles, wetness and contact shading without
new lights. The intake copy is kept in `Assets/Imports`; scripts, reports and
QA renders are in `Assets/Materials/slate-v2` (see its
`SOURCE-AND-DELIVERY.md`); none are published. No new Meshy generation was
commissioned.

Tool: [Meshy](https://www.meshy.ai/).

## Supplied Meshy rocks

The film's scattered stones in `images/architecture/{lichen-rock,weathered-stone}-{high,balanced}.glb`
come from two Meshy models supplied by Alex Nava on 2026-09-23:
`Meshy_AI_Lichen_Rock_0923090020_texture.glb` (43,816,604 bytes, SHA-256
`1c3cf68198b3397c910eb8f51c1c162392d5491ba33de58610ace25d5868cbd0`) and
`Meshy_AI_Weathered_Stone_0923090028_texture.glb` (42,416,696 bytes, SHA-256
`c279db21dbd95ba2f4abf08cab1b471627498bf094a6d823df06afdbd4cdf4a2`).

Each was processed locally without recoloring: scaled uniformly to unit
height, decimated in Blender to 2,990 (high) and 1,194 (balanced) triangles
with new UVs, and its colour, tangent-space normal and ambient occlusion
re-baked by Cycles from the full-resolution source. The maps ship as embedded
WebP (1024 high, 512 balanced) with stored tangents and `KHR_mesh_quantization`
geometry; the near-uniform roughness and black emissive maps were dropped. The
intake copies are kept in `Assets/Imports`; scripts, reports and QA renders are
in `Assets/Architecture/rocks-v1` (see its `SOURCE-AND-DELIVERY.md`); none are
published. No new Meshy generation was commissioned.

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
These maps now load only for the `?ground=earth` comparison view.

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
Like the dirt maps, they now load only for the `?ground=earth` comparison view.

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

## Navigation icons

About uses the owner-supplied Meshy leather document case. These are
transparent 256px WebP images, not runtime 3D models. Original GLBs remain
unchanged in the owner's Downloads folder and are excluded from the site
payload. The earlier Contact envelope renders (from the stylized game prop
below) are retired and no longer published.

- Meshy_AI_Leather_Envelope_Case_0911015506_texture.glb — SHA-256 `a819c2ef4b466d5544e70ecbffdf806c1eb75b9ba3dfa2bc2ffcd88239989b60`.
- Meshy_AI_Stylized_3D_game_prop_0911015500_texture.glb (retired Contact renders; historical) — SHA-256 `65d412aa8ac6786551ff41b3c3386b126b9d9d37ab3d707b85809a2255447aed`.

The published About pair (nav-about.webp and nav-about-active.webp, 16,310 bytes) was generated with the built-in OpenAI image tool, using Blender renders of the case as references. Sources and export details are in `docs/history/NAV-ICONS-QA.md` (2.5D inventory refinement).


## Cotton paper panel material

The paper textures were generated with OpenAI's built-in image generation tool and prepared as local WebP material assets. Generation prompts, source provenance, export settings and validation are recorded in `docs/history/PAPER-PANELS-QA.md`. They are decorative; all panel wording remains selectable HTML.
