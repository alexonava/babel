import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Mesh,
  MeshLambertMaterial,
  NoBlending,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
} from "three";
import { DEPTH_LAYER } from "./depth-layers.js";
import { FILM_SKY_GLSL } from "./estate-sky.js";

// South Downs elevation traverse, 48 samples (SRTM-derived public-domain data,
// retrieved 2026-09-09). Reused at different phases for fixed, continuous ridges.
export const HILL_PROFILE = Object.freeze([
  0.091, 0.081, 0.081, 0.09, 0.092, 0.098, 0.12, 0.151, 0.219, 0.246, 0.269, 0.281, 0.311, 0.413,
  0.567, 0.72, 0.839, 0.927, 0.858, 0.716, 0.621, 0.529, 0.415, 0.338, 0.326, 0.249, 0.199, 0.183,
  0.166, 0.141, 0.129, 0.107, 0.08, 0.057, 0.038, 0.021, 0.02, 0.029, 0.046, 0.068, 0.091, 0.1,
  0.111, 0.123, 0.134, 0.125, 0.115, 0.104,
]);
export const HILL = Object.freeze({
  innerRadius: 135,
  outerRadius: 210,
  amplitude: 22,
  radialSegments: 144,
  ringSegments: 3,
  color: 0x262b39,
});

// Film alpine ranges, built around the camera: crests are elevation angles (degrees)
// per world azimuth atan2(z, x), so every shot and viewport gets a known backdrop and
// the camera can never stand inside a range. Four ranges, near to far, all inside the
// camera's far plane (450). Prime lattice counts keep the crest from repeating around
// the ring. peaks: [azimuth, apex, half-width, range]; background: [azimuth, cap] knots,
// the tallest a range's noise may rise, capped low under the sun and roof saddle
// (171-183), across the tree shots (22-86, so sky stays open above the lantern on every
// width) and at 234-280.
// Moonlit snow caps: a crest above `line` degrees keeps snow within
// `depth` x (crest - line) degrees below it, at most `max`, with noisy edges.
// Tinted by the baked moonlight, so shadowed faces stay blue-grey.
export const SNOW = Object.freeze({ line: 2.9, depth: 0.42, max: 2.6, noise: 0.6, color: Object.freeze([0.74, 0.79, 0.92]) });
// The widest snow reach at a point `below` degrees under a crest at `crest`
// degrees (noise at its most generous): 1 inside the cap, 0 beyond it.
export function snowReach(below, crest) {
  const cap = Math.min(SNOW.max, Math.max(0, (crest - SNOW.line) * SNOW.depth));
  return cap > 0.001 && below - (cap * SNOW.noise) / 2 < 1.05 * cap ? 1 : 0;
}
export const MOUNTAINS = Object.freeze({
  radii: Object.freeze([225, 275, 300, 330, 385]),
  share: Object.freeze([0.45, 0.6, 0.72, 0.84, 1]),
  rows: Object.freeze([1, 0.94, 0.87, 0.8]),
  columns: 1080,
  foot: -18,
  octaves: Object.freeze([7, 17, 41, 97, 211]),
  summits: Object.freeze([53, 67, 61, 83, 101]),
  // Gentle crest character on every range: soft shoulders and notches that
  // survive the low windows, in degrees of relief (near, far).
  jag: Object.freeze({ octaves: Object.freeze([131, 241]), relief: Object.freeze([0.28, 0.16]) }),
  // Stepped aerial perspective, near to far: each range's share of the sky's
  // luma behind it, and how far its hue leans from night rock toward the sky.
  tones: Object.freeze({ luma: Object.freeze([0.4, 0.5, 0.6, 0.7, 0.8]), sky: Object.freeze([0.1, 0.24, 0.38, 0.52, 0.66]) }),
  background: Object.freeze([
    [0, 3.1],
    [9, 3.2],
    [17, 3.4],
    [22, 2],
    [86, 2],
    [96, 3.6],
    [126, 4.4],
    [140, 4.8],
    [163, 4],
    [168, 2.6],
    [185, 2.6],
    [200, 4.6],
    [226, 3.6],
    [232, 2.6],
    [282, 2.6],
    [296, 4.8],
    [340, 4.2],
  ]),
  peaks: Object.freeze([
    [11, 6, 6, 4],
    [17, 4.2, 4, 3],
    [101, 3.6, 4, 3],
    [114, 4.6, 6, 4],
    [143, 6.8, 5, 4],
    [150, 8, 8, 4],
    [158, 6.2, 5, 3],
    [175, 2.4, 3.5, 4],
    [180.5, 2.1, 2.5, 3],
    [188, 4.6, 3.5, 3],
    [210, 8.5, 9, 4],
    [222, 6, 5, 3],
    [305, 7, 8, 4],
    [318, 5, 5, 1],
    [330, 6, 6, 3],
  ]),
  renderOrder: -0.5,
});
// Shared horizon contract: the film ground and the mountains' feet both haze to the fog
// colour over this camera distance, so the plane's edge meets the ranges without a seam.
export const HORIZON_HAZE = Object.freeze({ near: 150, far: 190 });

function sampleProfile(angle) {
  const n = HILL_PROFILE.length,
    t = ((((angle / (Math.PI * 2)) % 1) + 1) % 1) * n;
  const i = Math.floor(t),
    f = t - i;
  return HILL_PROFILE[i % n] * (1 - f) + HILL_PROFILE[(i + 1) % n] * f;
}

export function createHillGeometry({
  groundHeight,
  innerRadius = HILL.innerRadius,
  outerRadius = HILL.outerRadius,
  amplitude = HILL.amplitude,
  radialSegments = HILL.radialSegments,
  ringSegments = HILL.ringSegments,
}) {
  const cols = radialSegments + 1,
    rows = ringSegments + 1;
  const positions = new Float32Array(cols * rows * 3);
  let cursor = 0;
  for (let ring = 0; ring < rows; ring++) {
    const rt = ring / ringSegments,
      radius = innerRadius + (outerRadius - innerRadius) * rt,
      blend = rt * rt * (3 - 2 * rt);
    for (let seg = 0; seg <= radialSegments; seg++) {
      const angle = (seg / radialSegments) * Math.PI * 2;
      const x = Math.cos(angle) * radius,
        z = Math.sin(angle) * radius;
      const base = groundHeight(x, z);
      positions[cursor] = x;
      positions[cursor + 1] = base + (amplitude * sampleProfile(angle) - base) * blend;
      positions[cursor + 2] = z;
      cursor += 3;
    }
  }
  const indices = [];
  for (let ring = 0; ring < ringSegments; ring++)
    for (let seg = 0; seg < radialSegments; seg++) {
      const a = ring * cols + seg,
        b = a + cols,
        c = a + 1,
        d = b + 1;
      indices.push(a, b, c, b, d, c);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// Integer lattice hash and periodic value noise: the same crest on every engine.
function lattice(i, seed) {
  let h = Math.imul(i ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function ridged(t, seed, octaves) {
  let sum = 0,
    weight = 1;
  octaves.forEach((n, octave) => {
    const x = t * n,
      i = Math.floor(x),
      f = x - i;
    const v = lattice(((i % n) + n) % n, seed + n) * (1 - f) + lattice((i + 1) % n, seed + n) * f;
    // Ridged multifractal: sharp creases, each octave partly gated by the last.
    const signal = (1 - Math.abs(v * 2 - 1)) ** 2;
    sum += signal * RIDGE_WEIGHTS[octave] * weight;
    weight = Math.min(1, 0.4 + signal);
  });
  return sum;
}
const RIDGE_WEIGHTS = [0.6, 0.8, 1, 0.8, 0.45];
const normalized = (values) => {
  const low = Math.min(...values),
    span = Math.max(...values) - low || 1;
  return values.map((v) => (v - low) / span);
};
function backgroundCap(azimuth) {
  const knots = MOUNTAINS.background;
  for (let i = 0; i < knots.length; i++) {
    const [a0, c0] = knots[i],
      [a1, c1] = knots[(i + 1) % knots.length];
    const span = (a1 - a0 + 360) % 360 || 360,
      t = (azimuth - a0 + 360) % 360;
    if (t <= span) return c0 + ((c1 - c0) * t) / span;
  }
  return knots[0][1];
}

// Jittered periodic lattice of sharp summits: the tallest cone over this azimuth.
function summits(u, seed, cells) {
  const x = u * cells,
    i0 = Math.floor(x);
  let best = 0;
  for (let k = -2; k <= 2; k++) {
    const i = (((i0 + k) % cells) + cells) % cells,
      at = i0 + k + 0.15 + 0.7 * lattice(i, seed),
      half = 0.9 + 1.1 * lattice(i, seed + 1);
    best = Math.max(
      best,
      (0.4 + 0.6 * lattice(i, seed + 2)) * Math.max(0, 1 - Math.abs(x - at) / half) ** 1.1,
    );
  }
  return best;
}

// Crest elevation in degrees per range and column, near range first: sharp summits,
// denser on farther ranges, varied by the ridged multifractal and toothed by a finer
// summit lattice. Authored peaks keep their exact apex and get notched shoulders.
export function mountainCrests() {
  const { columns, share, octaves, peaks, summits: cells, jag } = MOUNTAINS;
  return share.map((part, range) => {
    const t = Array.from({ length: columns }, (_, j) => j / columns);
    const rough = normalized(t.map((u) => ridged(u, 7919 * (range + 1), octaves)));
    const fine = normalized(t.map((u) => summits(u, 104729 + 31 * range, 197)));
    const teeth = normalized(t.map((u) => ridged(u, 15485863 + 97 * range, jag.octaves)));
    return t.map((u, j) => {
      const azimuth = u * 360,
        notch = 0.3 * (1 - fine[j]);
      let crest =
        backgroundCap(azimuth) *
        part *
        (0.3 + 0.7 * summits(u, 613 * (range + 3), cells[range])) *
        (0.8 + 0.2 * rough[j]) *
        (1 - notch);
      for (const [at, apex, half, peakRange] of peaks) {
        const delta = Math.abs(((azimuth - at + 540) % 360) - 180) / half;
        if (peakRange === range && delta < 1)
          crest = Math.max(crest, apex * (1 - delta) ** 1.1 * (1 - notch * Math.min(1, 3 * delta)));
      }
      // Fine teeth on every crest; the low windows keep their 2.6 degree ceiling.
      const relief = jag.relief[0] + (jag.relief[1] - jag.relief[0]) * (range / (share.length - 1));
      crest += relief * (teeth[j] - 0.35);
      return Math.max(0.2, backgroundCap(azimuth) <= 2.6 ? Math.min(crest, 2.6) : crest);
    });
  });
}

const KEY = new Vector3(32, 28, 14).normalize();
// Four ranges x four rows x one ring of columns; columns wrap, so there is no seam
// column at azimuth 0. Triangles face the centre. aTerrain bakes per vertex: degrees
// below this column's crest (ink and rim), range, moonlight from the key and snow.
export function createMountainGeometry(crests = mountainCrests()) {
  const { radii, rows, columns, foot } = MOUNTAINS,
    perRange = rows.length * columns;
  const positions = new Float32Array(radii.length * perRange * 3),
    terrain = new Float32Array(radii.length * perRange * 4),
    crestOf = new Float32Array(radii.length * perRange),
    index = new Uint16Array(radii.length * (rows.length - 1) * columns * 6);
  const rad = Math.PI / 180;
  let cursor = 0;
  radii.forEach((radius, range) => {
    const crest = crests[range];
    for (let j = 0; j < columns; j++) {
      let mean = 0;
      for (let k = -2; k <= 2; k++) mean += crest[(j + k + columns) % columns] / 5;
      const e = crest[j],
        azimuth = (j / columns) * Math.PI * 2;
      [e, Math.min(e, mean) * 0.72 - 0.4, mean * 0.3 - 1.6, foot].forEach((elevation, row) => {
        const v = range * perRange + row * columns + j,
          r = radius * rows[row];
        positions.set(
          [Math.cos(azimuth) * r, r * Math.tan(elevation * rad), Math.sin(azimuth) * r],
          v * 3,
        );
        terrain[v * 4] = e - elevation;
        terrain[v * 4 + 1] = range;
        crestOf[v] = e;
      });
    }
    for (let row = 0; row < rows.length - 1; row++)
      for (let j = 0; j < columns; j++) {
        const s = range * perRange + row * columns + j,
          n = range * perRange + row * columns + ((j + 1) % columns);
        index.set([s, s + columns, n, s + columns, n + columns, n], cursor);
        cursor += 6;
      }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  const normal = geometry.attributes.normal;
  for (let v = 0; v < normal.count; v++) {
    const ny = normal.getY(v),
      lit = normal.getX(v) * KEY.x + ny * KEY.y + normal.getZ(v) * KEY.z,
      row = Math.floor((v % perRange) / columns);
    terrain[v * 4 + 2] = 0.24 + 0.62 * Math.max(lit, 0) + 0.14 * ny;
    // Snow: the column's crest elevation, from which the fragment sizes a cap
    // that reaches further down taller peaks. The near range stays bare.
    terrain[v * 4 + 3] = terrain[v * 4 + 1] > 0 ? crestOf[v] : 0;
  }
  geometry.deleteAttribute("normal");
  geometry.setAttribute("aTerrain", new BufferAttribute(terrain, 4));
  geometry.computeBoundingSphere();
  return geometry;
}

// Film mountains: vertices ride on the camera (world = cameraPosition + position), as
// the starfield does. Each pixel hazes toward the film sky behind it, found by casting
// its ray onto the real sky shell (uSky: radius squared, shell opacity) plus the cloud
// banks' average lift, and a far range is never lighter than that sky. The near range
// stays a flat dark silhouette, so the grade's cel steps follow its outline rather than
// its facets. Snow is noise-edged; a cool rim faces the key light and a faint warm one
// the orb. Feet near the floor or below the horizon haze to the fog colour over the
// ground's horizon distances (HORIZON_HAZE), which hides where the ranges meet the
// plane. Each crest draws its own ~1 px ink line: the post ink cannot find dark ridges
// on a dark sky. Transparent with no blending so it draws after the stars and covers
// them, writing its depth layer (depth-layers.js) exactly.
function mountainMaterial({ skyRadius, shellOpacity, sunPosition }) {
  return new ShaderMaterial({
    name: "EstateMountains",
    transparent: true,
    blending: NoBlending,
    depthTest: true,
    depthWrite: true,
    side: FrontSide,
    fog: true,
    extensions: { derivatives: true },
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uSky: { value: new Vector2(skyRadius ** 2, shellOpacity) },
        uSun: { value: new Vector3(...sunPosition) },
      },
    ]),
    vertexShader: `
attribute vec4 aTerrain;
varying vec4 vT;
varying vec3 vL;
varying float vD, vH;
void main() {
vT=aTerrain; vL=position;
vec4 w=vec4(cameraPosition+position,1.0), m=viewMatrix*w;
vH=w.y-modelMatrix[3].y; vD=-m.z;
gl_Position=projectionMatrix*m;
}`,
    fragmentShader: `
uniform vec2 uSky;
uniform vec3 uSun, fogColor;
uniform float fogNear, fogFar;
varying vec4 vT;
varying vec3 vL;
varying float vD, vH;
${FILM_SKY_GLSL}
float mh(vec2 p){vec3 q=fract(p.xyx*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float mn(vec2 p){vec2 i=floor(p),f=fract(p);f*=f*(3.-2.*f);
return mix(mix(mh(i),mh(i+vec2(1,0)),f.x),mix(mh(i+vec2(0,1)),mh(i+1.),f.x),f.y);}
void main() {
vec3 d=normalize(vL), o=cameraPosition, W=vec3(.2126,.7152,.0722);
float b=dot(o,d), t=-b+sqrt(max(b*b-dot(o,o)+uSky.x,0.)), a=(o.y+d.y*t)*inversesqrt(uSky.x);
vec3 s=(filmSky(a)+filmBand(a)+vec3(.24,.24,.3)*smoothstep(-.03,.17,a))*uSky.y;
float k=vT.y/${glslFloat(MOUNTAINS.radii.length - 1)}, px=vT.x/max(fwidth(vT.x),1e-5), r=length(vL.xz);
float n=mn(vL.xz*(80./r)+vec2(vL.y*.2+vT.y*17.,vL.y*-.13));
float tL=${steps("luma")}, tS=${steps("sky")};
vec3 c=mix(mix(vec3(.1,.11,.15),vec3(.15,.16,.21),k),s,tS);
c*=tL*dot(s,W)*mix(.84,1.1,vT.z)/max(dot(c,W),1e-4);
c=mix(c,s*(tL+.1),(.2+.25*k)*(1.-smoothstep(.004,.03,vL.y/r)));
c*=min(1.,.92*dot(s,W)/max(dot(c,W),1e-4));
float cap=clamp((vT.w-${SNOW.line.toFixed(2)})*${SNOW.depth.toFixed(2)},0.,${SNOW.max.toFixed(2)});
float snow=(1.-smoothstep(.7*cap,1.05*cap,vT.x+cap*${SNOW.noise.toFixed(2)}*(n-.5)))*step(.001,cap);
c=mix(c,mix(vec3(${SNOW.color.map((value) => value.toFixed(2))})*mix(.62,1.,vT.z),s,.25*k),snow);
vec2 v=d.xz/max(length(d.xz),1e-4), toSun=normalize(uSun.xz-o.xz);
float cr=1.-smoothstep(.8,3.5,px);
c+=cr*(vec3(.55,.62,.8)*.35*max(dot(v,normalize(vec2(32,14))),0.)
+vec3(.2,.13,.07)*pow(max(dot(v,toSun),0.),60.));
#ifdef USE_FOG
c=mix(c,fogColor,max(smoothstep(fogNear,fogFar,vD),smoothstep(${HORIZON_HAZE.near}.,${HORIZON_HAZE.far}.,vD))*(1.-smoothstep(0.,9.,vH)*smoothstep(-.05,-.008,vL.y/r)));
#endif
c=mix(c,vec3(.012,.016,.03),(1.-smoothstep(.4,1.4,px))*(.7-.3*k));
gl_FragColor=vec4(c,${DEPTH_LAYER.mountains});
}`,
  });
}

// Stepped per-range value from MOUNTAINS.tones, as GLSL: the range index
// (vT.y) selects its step, so each layer reads as one flat, distinct tone.
const glslFloat = (value) => (Number.isInteger(value) ? value.toFixed(1) : String(value));
function steps(key) {
  const values = MOUNTAINS.tones[key];
  return values
    .slice(1)
    .reduce((glsl, value, i) => `mix(${glsl},${glslFloat(value)},step(${i + 0.5},vT.y))`, glslFloat(values[0]));
}

// The baseline keeps the South Downs ring; film swaps in the camera-centred ranges.
export function createHillSilhouette({
  groundHeight,
  skyRadius = 130,
  shellOpacity = 1,
  sunPosition = [0, 0, -1],
  ...overrides
} = {}) {
  const geometry = createHillGeometry({ groundHeight, ...overrides });
  const material = new MeshLambertMaterial({ color: HILL.color, side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  mesh.name = "hill-silhouette";
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  let disposed = false,
    mountainGeometry = null,
    mountainShading = null;
  return {
    mesh,
    lifecycleOrder: 24,
    setFilmTreatment(active) {
      if (disposed) return false;
      if (active) {
        mountainGeometry ||= createMountainGeometry();
        mountainShading ||= mountainMaterial({ skyRadius, shellOpacity, sunPosition });
      }
      mesh.geometry = active ? mountainGeometry : geometry;
      mesh.material = active ? mountainShading : material;
      // The ranges surround the camera, so their world bounds never apply.
      mesh.frustumCulled = !active;
      mesh.renderOrder = active ? MOUNTAINS.renderOrder : 0;
      return true;
    },
    applyQuality(profile) {
      if (disposed) return false;
      mesh.visible = profile?.tier !== "low" && !profile?.isLow;
      return true;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      mountainGeometry?.dispose();
      mountainShading?.dispose();
      return true;
    },
  };
}
