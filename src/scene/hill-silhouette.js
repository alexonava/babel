import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
} from "three";

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
export const ESTATE_RIDGES = Object.freeze({
  innerRadius: 135,
  outerRadius: 270,
  amplitude: 58,
  radialSegments: 192,
  ringSegments: 6,
});

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
  layered = false,
}) {
  const cols = radialSegments + 1,
    rows = ringSegments + 1;
  const positions = new Float32Array(cols * rows * 3),
    colors = new Float32Array(positions.length);
  let cursor = 0;
  for (let ring = 0; ring < rows; ring++) {
    const rt = ring / ringSegments,
      radius = innerRadius + (outerRadius - innerRadius) * rt;
    const ridge = ring % 2 === 1,
      tier = Math.min(1, ring / Math.max(1, ringSegments - 1));
    for (let seg = 0; seg <= radialSegments; seg++) {
      const angle = (seg / radialSegments) * Math.PI * 2;
      const x = Math.cos(angle) * radius,
        z = Math.sin(angle) * radius;
      const base = groundHeight(x, z);
      // Several phased traverses yield varied valleys in every viewing direction,
      // rather than one large rise and long nearly level stretches around a ring.
      const profile = layered
        ? 0.7 * sampleProfile(angle * 3 + tier * 1.9) + 0.3 * sampleProfile(angle * 7 - tier * 2.7)
        : sampleProfile(angle);
      const peak = layered
        ? amplitude * (ridge ? (0.025 + profile * 0.975) * (0.48 + tier * 0.52) : profile * 0.045)
        : amplitude * profile;
      const blend = layered ? Math.min(1, rt * 6) : rt * rt * (3 - 2 * rt);
      positions[cursor] = x;
      positions[cursor + 1] = base + (peak - base) * blend;
      positions[cursor + 2] = z;
      // Height variation leaves gentle relief within each depth layer. Values
      // are linear; the built-in output conversion handles display encoding.
      const relief = 0.83 + profile * 0.17;
      colors[cursor] = (0.025 + tier * 0.033) * relief;
      colors[cursor + 1] = (0.032 + tier * 0.035) * relief;
      colors[cursor + 2] = (0.054 + tier * 0.045) * relief;
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
  if (layered) geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function ridgeMaterial() {
  const material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, fog: false });
  material.customProgramCacheKey = () => "estate-distance-ridges-v3";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying float vRidgeDistance, vRidgeHeight;\n" + shader.vertexShader;
    // The ring indices face inward/downward; invert their normals for a fixed
    // moonward slope response, without another light, shadow, or fragment pass.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <color_vertex>",
      "#include <color_vertex>\nvColor.xyz *= .64 + .36 * max(dot(-normalize(normal), normalize(vec3(-.45,.75,.48))), 0.);",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\nvRidgeDistance = length(mvPosition.xyz); vRidgeHeight = position.y;",
    );
    shader.fragmentShader = "varying float vRidgeDistance, vRidgeHeight;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <fog_fragment>",
      `
      float mist = .08 + .43 * smoothstep(90.0, 370.0, vRidgeDistance);
      mist += .19 * (1.0 - smoothstep(2.0, 18.0, vRidgeHeight));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(.275,.299,.369), mist);
    `,
    );
  };
  return material;
}

// One mesh, three terrain-connected ridges. Dedicated distance extinction keeps
// the distant relief legible without weakening the foreground scene's fog.
export function createHillSilhouette({ groundHeight, ...overrides } = {}) {
  const geometry = createHillGeometry({ groundHeight, ...overrides });
  const material = new MeshLambertMaterial({ color: HILL.color, side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  mesh.name = "hill-silhouette";
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  let disposed = false,
    layeredGeometry = null,
    layeredMaterial = null;
  return {
    mesh,
    lifecycleOrder: 24,
    setFilmTreatment(active) {
      if (disposed) return false;
      if (active) {
        layeredGeometry ||= createHillGeometry({ groundHeight, ...ESTATE_RIDGES, layered: true });
        layeredMaterial ||= ridgeMaterial();
      }
      mesh.geometry = active ? layeredGeometry : geometry;
      mesh.material = active ? layeredMaterial : material;
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
      layeredGeometry?.dispose();
      layeredMaterial?.dispose();
      return true;
    },
  };
}
