// Clear centreline opening: source high GLB, yaw 0, sill 1.64 to arch ~8.24.
export const DOOR_HEIGHT = 6.6;
export const MUD_TILE_WIDTH = DOOR_HEIGHT * 1.6;
export function wantsMud(search = "") {
  const q = new URLSearchParams(search);
  return (
    !["classic", "assembled"].includes(q.get("architecture")) &&
    !["desert", "procedural"].includes(q.get("ground"))
  );
}
export function wantsPropScale(search = "") {
  const q = new URLSearchParams(search);
  return !["classic", "assembled"].includes(q.get("architecture")) && q.get("scale") !== "baseline";
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

// `grass`, when present, is { grassColorMap, grassMaskMap, grassTile } and only ever applies
// under `film` — patchy grass blended in away from the worn tower/root rings
// `earthContact` already tracks, using its own lower-frequency sine field so
// it doesn't correlate with the earth patchiness pattern.
export function configureMudShading(material, active, quiet = false, film = false, grass = null) {
  material.customProgramCacheKey = () =>
    film
      ? grass
        ? "moonlit-earth-grass-v1"
        : "moonlit-earth-v2"
      : active
        ? quiet
          ? "mud-quiet-earth-v2"
          : "mud-world-variation-v1"
        : "ground-baseline";
  material.onBeforeCompile = (shader) => {
    if (!active && !film) return;
    const useGrass = Boolean(film && grass);
    if (useGrass) {
      shader.uniforms.grassColor = { value: grass.grassColorMap };
      shader.uniforms.grassMask = { value: grass.grassMaskMap };
    }
    shader.vertexShader = "varying vec3 vMudWorld;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvMudWorld = (modelMatrix * vec4(position, 1.0)).xyz;",
    );
    shader.fragmentShader =
      (useGrass ? "uniform sampler2D grassColor;\nuniform sampler2D grassMask;\n" : "") +
      "varying vec3 vMudWorld;\n" +
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
      // Low-frequency world-space variation keeps the two-meter tile quiet.
      // A single wide, soft falloff marks ground contact at the tower and the
      // tree/lantern (quiet mode's own rootContact/footingDry darkening is
      // skipped under film — stacking both produced a visible hard-edged
      // dark disc around the tree instead of a gradual clearing).
      float earthBroad = .5 + .25*sin(vMudWorld.x*.073 + sin(vMudWorld.z*.049)) + .25*sin(vMudWorld.z*.087 + sin(vMudWorld.x*.061));
      float earthContact = max(1.0-smoothstep(5.0,13.0,length(vMudWorld.xz)), 1.0-smoothstep(2.5,10.0,length(vMudWorld.xz-vec2(55.1,36.1))));
      // A narrow (.80-.98) window here read as a hard-edged dark "puddle" in
      // low, close shots, since damp also swings roughness from .86 to .74 —
      // a visible sheen boundary, not just the small diffuse darkening below.
      // Widened so the same patchiness reads as a gentle gradient instead.
      float damp = smoothstep(.55,.95,earthBroad)*(1.0-earthContact);
      roughnessFactor = mix(max(.86,roughnessFactor), .74, damp);
      diffuseColor.rgb *= .8 + .14*earthBroad - .045*earthContact - .05*damp;
      ${
        useGrass
          ? `
      // A second, lower-frequency patchiness field (own constants, not
      // earthBroad's) keeps grass patches from correlating with the earth
      // tone variation above; grass fades out on the worn rings earthContact
      // already tracks around the tower footing and the tree roots.
      vec2 grassUv = vMudWorld.xz / ${grass.grassTile.toFixed(3)};
      vec3 grassColorSample = texture2D(grassColor, grassUv).rgb;
      float grassMaskSample = texture2D(grassMask, grassUv).r;
      // Measured runtime mean of the mask is ~0.14 (mostly sparse dark soil
      // with occasional brighter tufts up to ~0.8); remap that low range so
      // typical soil stays bare and only the brighter tuft areas go green.
      float grassAmount = clamp((grassMaskSample - 0.03) / 0.22, 0.0, 1.0) * (1.0 - earthContact);
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
    if (film)
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <lights_fragment_end>",
          `#include <lights_fragment_end>
      // Bound the grazing response of compact soil in the legacy light pipeline.
      reflectedLight.directSpecular *= mix(.12, .22, damp);
      reflectedLight.indirectSpecular *= .18;
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
