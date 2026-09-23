import { resolveSceneModes } from "./scene-modes.js";
// Clear centreline opening: source high GLB, yaw 0, sill 1.64 to arch ~8.24.
export const DOOR_HEIGHT = 6.6;
export const MUD_TILE_WIDTH = DOOR_HEIGHT * 1.6;
export function wantsMud(search = "") {
  return resolveSceneModes(search).mud;
}
export function wantsPropScale(search = "") {
  return resolveSceneModes(search).propScale;
}
const smooth = (x) => x * x * (3 - 2 * x);
function noise(u, v, cells) {
  const x = u * cells,
    y = v * cells,
    ix = Math.floor(x),
    iy = Math.floor(y);
  const h = (a, b) => {
    const n =
      Math.sin(
        (((a % cells) + cells) % cells) * 127.1 + (((b % cells) + cells) % cells) * 311.7 + 19.3,
      ) * 43758.5453;
    return n - Math.floor(n);
  };
  const fx = smooth(x - ix),
    fy = smooth(y - iy);
  return (
    (h(ix, iy) * (1 - fx) + h(ix + 1, iy) * fx) * (1 - fy) +
    (h(ix, iy + 1) * (1 - fx) + h(ix + 1, iy + 1) * fx) * fy
  );
}
// Periodic world-scaled fields: same features at every quality tier.
export function mudSample(u, v) {
  const broad = noise(u, v, 4),
    soil = noise(u, v, 16),
    grain = noise(u, v, 64);
  const wet = smooth(Math.max(0, Math.min(1, (broad - 0.67) / 0.22)));
  return {
    height: 0.6 * soil + 0.16 * grain,
    tone: broad * 0.6 + soil * 0.4,
    wet,
    roughness: 0.9 - 0.35 * wet,
  };
}
export function makeMudCanvases(source, createCanvas = () => document.createElement("canvas")) {
  const size = source.width,
    maps = {};
  const original = source.getContext("2d").getImageData(0, 0, size, size).data;
  const heights = new Float32Array(size * size);
  for (const kind of ["color", "normal", "roughness"]) {
    const canvas = createCanvas();
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Mud canvas unavailable");
    maps[kind] = { canvas, ctx, pixels: ctx.createImageData(size, size) };
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x,
        p = i * 4,
        s = mudSample(x / size, y / size);
      heights[i] = s.height;
      const detail = (original[p] + original[p + 1] + original[p + 2]) / 3 / 255 - 0.5;
      const shade = 0.78 + 0.34 * s.tone - 0.12 * s.wet + 0.1 * detail;
      const c = maps.color.pixels.data,
        r = maps.roughness.pixels.data;
      c[p] = 82 * shade;
      c[p + 1] = 69 * shade;
      c[p + 2] = 56 * shade;
      c[p + 3] = 255;
      r[p] = r[p + 1] = r[p + 2] = Math.round(s.roughness * 255);
      r[p + 3] = 255;
    }
  const h = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const p = (y * size + x) * 4,
        n = maps.normal.pixels.data;
      const dx = (h(x + 1, y) - h(x - 1, y)) * size * 0.008,
        dy = (h(x, y + 1) - h(x, y - 1)) * size * 0.008;
      const len = Math.hypot(dx, dy, 1);
      n[p] = 128 - (127 * dx) / len;
      n[p + 1] = 128 - (127 * dy) / len;
      n[p + 2] = 128 + 127 / len;
      n[p + 3] = 255;
    }
  for (const map of Object.values(maps)) map.ctx.putImageData(map.pixels, 0, 0);
  return Object.fromEntries(Object.entries(maps).map(([k, v]) => [k, v.canvas]));
}

// The terrain's dune field, helpers.js dune(): amplitude * wave(frequency *
// (sx * x + sz * z)) in world x/z. Restated here so the slate's wet sheen can
// find the hollows in the shader; a test holds it to scene.groundHeight.
export const TERRAIN_DUNE_TERMS = Object.freeze([
  Object.freeze({ amplitude: 1.8, wave: "sin", frequency: 0.055, sx: 1, sz: 0 }),
  Object.freeze({ amplitude: 1.35, wave: "cos", frequency: 0.052, sx: 0, sz: 1 }),
  Object.freeze({ amplitude: 0.9, wave: "sin", frequency: 0.031, sx: 1, sz: 1 }),
  Object.freeze({ amplitude: 0.55, wave: "cos", frequency: 0.018, sx: 1, sz: -1 }),
]);
export function terrainDune(x, z) {
  return TERRAIN_DUNE_TERMS.reduce(
    (sum, { amplitude, wave, frequency, sx, sz }) =>
      sum + amplitude * Math[wave](frequency * (sx * x + sz * z)),
    0,
  );
}
const glslNumber = (value) => (Number.isInteger(value) ? value.toFixed(1) : String(value));
const TERRAIN_DUNE_GLSL = TERRAIN_DUNE_TERMS.map(
  ({ amplitude, wave, frequency, sx, sz }) =>
    `${glslNumber(amplitude)}*${wave}(dot(vMudWorld.xz, vec2(${glslNumber(frequency * sx)}, ${glslNumber(frequency * sz)})))`,
).join(" + ");

// The default film slate's calm wet sheen. Terrain hollows and the map's dark
// crack texels hold water; the worn footing, roots and path stay dry. Wet
// ground is smoother and darker, its direct highlight is clamped a little
// less, and a low Fresnel term reflects a mostly neutral share of the fog
// color at grazing angles. Both lifts are kept well under the dry ground's
// own radiance, so distant ground does not wash out pale blue-grey.
export const SLATE_WET = Object.freeze({
  hollow: Object.freeze([-3.2, -1.0]), // dune height: fully wet below, dry above
  crack: Object.freeze([0.07, 0.18]), // linear map luminance: dark cracks hold water
  crackWeight: 0.55,
  roughness: 0.5,
  roughnessWeight: 0.75,
  darken: 0.14,
  specular: 0.8, // direct specular clamp relaxed by up to 1 + 0.8
  fresnel: 0.15, // low: grazing sheen only, measured calm behind the intro text
  fresnelNeutral: 0.6, // share of the fog reflection taken at the fog's own luminance
});

// Close-range detail for the slate. The classic 22-unit tile holds about 46
// texels per world unit, which reads soft right in front of the lens (the
// Lantern study). Near the camera only, the same normal map is sampled again,
// finer and rotated so it never lines up with the base tile's mirror seams.
export const SLATE_DETAIL = Object.freeze({
  scale: 3.7, // times the base repeat: about a 6-unit tile
  rotation: 0.6435, // radians (a 3-4-5 rotation: cos .8, sin .6)
  strength: 0.7, // added tangent-space slope at full weight (0.25 did not show)
  near: Object.freeze([6.0, 18.0]), // view distance: full detail within, none beyond
});
// Column-major rotation: slateTurn * uv turns the lookup, and xy * slateTurn
// turns the sampled slope back into the base tile's tangent frame.
const SLATE_DETAIL_TURN = [
  Math.cos(SLATE_DETAIL.rotation),
  Math.sin(SLATE_DETAIL.rotation),
  -Math.sin(SLATE_DETAIL.rotation),
  Math.cos(SLATE_DETAIL.rotation),
]
  .map((value) => value.toFixed(4))
  .join(", ");

// Film ground material, chosen from the mode rather than the published maps,
// so the procedural surface shown while maps load, or after a fallback,
// matches the loaded ground. `slate` (the default film ground) takes the
// slate tint, the wet sheen and the close detail. `surface` is palette.js
// GROUND_SURFACE_MATERIAL.
export const FILM_EARTH_SURFACE = Object.freeze({ color: 0x615447, roughness: 0.93 });
export function filmGroundSurface({ muddy = false, film = false, slate = false, surface }) {
  if (muddy) return { color: 0xffffff, roughness: 1, metalness: 0, slate: false };
  if (!film) return { color: surface.color, roughness: surface.roughness, metalness: surface.metalness, slate: false };
  if (slate) return { color: surface.filmColor, roughness: surface.roughness, metalness: 0, slate: true };
  return { ...FILM_EARTH_SURFACE, metalness: 0, slate: false };
}

// `grass`, when present, is { grassColorMap, grassMaskMap, grassTile } and only ever applies
// under `film` — patchy grass blended in away from the worn tower/root rings
// `earthContact` already tracks, using its own lower-frequency sine field so
// it doesn't correlate with the earth patchiness pattern. `slate` adds the
// default slate's wet sheen and close detail under `film`; the earth
// comparison's grass never takes them.
export function configureMudShading(material, active, quiet = false, film = false, grass = null, { slate = false } = {}) {
  const useGrass = Boolean(film && grass);
  const useWet = Boolean(film && slate && !grass);
  material.customProgramCacheKey = () =>
    film
      ? useGrass
        ? "moonlit-earth-grass-v1"
        : useWet
          ? "moonlit-slate-v1"
          : "moonlit-earth-v2"
      : active
        ? quiet
          ? "mud-quiet-earth-v2"
          : "mud-world-variation-v1"
        : "ground-baseline";
  material.onBeforeCompile = (shader) => {
    if (!active && !film) return;
    if (useGrass) {
      shader.uniforms.grassColor = { value: grass.grassColorMap };
      shader.uniforms.grassMask = { value: grass.grassMaskMap };
    }
    // The dune field varies over 100+ world units; the film terrain's 3-unit
    // quads carry it per vertex, so fragments only read the interpolated height.
    const wetVarying = useWet ? "varying float vSlateDune;\n" : "";
    shader.vertexShader = "varying vec3 vMudWorld;\n" + wetVarying + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvMudWorld = (modelMatrix * vec4(position, 1.0)).xyz;" +
        (useWet ? `\nvSlateDune = ${TERRAIN_DUNE_GLSL};` : ""),
    );
    shader.fragmentShader =
      (useGrass ? "uniform sampler2D grassColor;\nuniform sampler2D grassMask;\n" : "") +
      "varying vec3 vMudWorld;\n" +
      wetVarying +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      float mudPatch = 0.5 + 0.25 * sin(vMudWorld.x * 0.21 + sin(vMudWorld.z * 0.13)) + 0.25 * sin(vMudWorld.z * 0.17 + sin(vMudWorld.x * 0.11));
      float footingDry = 1.0 - smoothstep(7.0, 13.0, length(vMudWorld.xz));
      roughnessFactor = mix(0.9, roughnessFactor, smoothstep(0.72, 0.95, mudPatch) * (1.0 - footingDry));
      diffuseColor.rgb *= 1.0 - 0.08 * footingDry;
      diffuseColor.rgb *= 0.9 + 0.15 * mudPatch;
      ${
        quiet && !film
          ? `
      float rootContact = 1.0 - smoothstep(1.8, 6.5, length(vMudWorld.xz - vec2(55.1,36.1)));
      float dryContact = max(footingDry, rootContact);
      roughnessFactor = mix(0.94, max(0.72, roughnessFactor), smoothstep(0.84, 0.99, mudPatch) * (1.0 - dryContact));
      diffuseColor.rgb *= 1.0 - 0.08 * rootContact;
      `
          : ""
      }
      ${
        film
          ? `
      float earthBroad = .5 + .16*sin(vMudWorld.x*.043 + sin(vMudWorld.z*.031)) + .12*sin(vMudWorld.z*.067 + sin(vMudWorld.x*.052)) + .08*sin((vMudWorld.x+vMudWorld.z)*.109);
      float earthContact = max(1.0-smoothstep(5.0,13.0,length(vMudWorld.xz)), 1.0-smoothstep(2.5,10.0,length(vMudWorld.xz-vec2(55.1,36.1))));
      vec2 pathAxis = normalize(vec2(55.1,36.1));
      float along = clamp(dot(vMudWorld.xz,pathAxis),0.0,65.87);
      vec2 pathCenter = pathAxis*along+vec2(-pathAxis.y,pathAxis.x)*sin(along/65.87*6.283185)*2.4;
      float approach = 1.0-smoothstep(1.2,3.8,length(vMudWorld.xz-pathCenter));
      float worn = max(earthContact,approach);
      float damp = smoothstep(.78,.98,earthBroad)*(1.0-earthContact);
      roughnessFactor = mix(max(.88,roughnessFactor), .78, damp);
      diffuseColor.rgb *= .84 + .10*earthBroad - .04*earthContact - .035*damp + .035*approach;
      roughnessFactor = mix(roughnessFactor,.94,approach*.65);
      ${
        useWet
          ? `
      float slateHollow = 1.0 - smoothstep(${glslNumber(SLATE_WET.hollow[0])}, ${glslNumber(SLATE_WET.hollow[1])}, vSlateDune);
      #ifdef USE_MAP
      float slateCrack = 1.0 - smoothstep(${glslNumber(SLATE_WET.crack[0])}, ${glslNumber(SLATE_WET.crack[1])}, dot(sampledDiffuseColor.rgb, vec3(.299,.587,.114)));
      #else
      float slateCrack = 0.0;
      #endif
      float slateWet = clamp(max(slateHollow, slateCrack*${glslNumber(SLATE_WET.crackWeight)}), 0.0, 1.0)*(1.0-worn);
      roughnessFactor = mix(roughnessFactor, ${glslNumber(SLATE_WET.roughness)}, slateWet*${glslNumber(SLATE_WET.roughnessWeight)});
      diffuseColor.rgb *= 1.0 - ${glslNumber(SLATE_WET.darken)}*slateWet;
      `
          : ""
      }
      ${
        useGrass
          ? `
      vec2 grassUv = vMudWorld.xz / ${grass.grassTile.toFixed(3)};
      vec3 grassColorSample = texture2D(grassColor, grassUv).rgb;
      float grassMaskSample = texture2D(grassMask, grassUv).r;
      float grassAmount = clamp((grassMaskSample - 0.28) / 0.48, 0.0, 1.0) * .22 * (1.0 - worn);
      diffuseColor.rgb = mix(diffuseColor.rgb, grassColorSample, grassAmount);
      roughnessFactor = mix(roughnessFactor, .82, grassAmount);
      `
          : ""
      }
      `
          : ""
      }
    `,
    );
    if (useWet)
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
      #ifdef USE_NORMALMAP_TANGENTSPACE
      mat2 slateTurn = mat2(${SLATE_DETAIL_TURN});
      vec3 slateDetailN = texture2D(normalMap, slateTurn*vNormalMapUv*${glslNumber(SLATE_DETAIL.scale)}).xyz*2.0-1.0;
      float slateNear = 1.0 - smoothstep(${glslNumber(SLATE_DETAIL.near[0])}, ${glslNumber(SLATE_DETAIL.near[1])}, length(vViewPosition));
      mapN.xy += (slateDetailN.xy*slateTurn)*(${glslNumber(SLATE_DETAIL.strength)}*slateNear);
      normal = normalize(tbn*mapN);
      #endif
    `,
      );
    if (film)
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <lights_fragment_end>",
          `#include <lights_fragment_end>
      // Bound the grazing response of compact soil in the legacy light pipeline.
      reflectedLight.directSpecular *= mix(.12, .22, damp);
      reflectedLight.indirectSpecular *= .18;
      ${
        useWet
          ? `
      reflectedLight.directSpecular *= 1.0 + ${glslNumber(SLATE_WET.specular)}*slateWet;
      #ifdef USE_FOG
      float slateFresnel = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 5.0);
      vec3 slateSheen = mix(fogColor, vec3(dot(fogColor, vec3(.2126,.7152,.0722))), ${glslNumber(SLATE_WET.fresnelNeutral)});
      reflectedLight.indirectSpecular += slateSheen*(slateWet*slateFresnel*${glslNumber(SLATE_WET.fresnel)});
      #endif
      `
          : ""
      }
    `,
        )
        .replace(
          "#include <fog_fragment>",
          `#include <fog_fragment>
      #ifdef USE_FOG
      float earthHorizon = smoothstep(116.0, 174.0, max(abs(vMudWorld.x),abs(vMudWorld.z)));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, earthHorizon);
      #endif
    `,
        );
  };
  material.needsUpdate = true;
}
