import { BufferGeometry, Float32BufferAttribute } from "three";

const TAU = Math.PI * 2;
const COURSE_HEIGHT = 4.25;
const WALLS_PER_FLIGHT = 2;
const CORE_SEGMENTS_PER_FLIGHT = 48;
const RELIEF_DEPTH = 0.55;
const RELIEF_OUTER_OFFSET = 0.063;
const CORE_RECESS = 0.5;
const CONTACT_COLLAR = 0.02;
const CONTACT_OVERLAP = 0.02;

function readVertices(geometry) {
  const { position, normal, uv } = geometry?.attributes || {};
  if (
    !position ||
    !normal ||
    !uv ||
    position.count !== normal.count ||
    uv.count !== position.count
  ) {
    throw new Error("Spiral support needs normalized positions, normals, and UVs.");
  }
  const vertices = [];
  for (let i = 0; i < position.count; i += 1) {
    const vertex = [
      position.getX(i),
      position.getY(i),
      position.getZ(i),
      normal.getX(i),
      normal.getY(i),
      normal.getZ(i),
      uv.getX(i),
      uv.getY(i),
    ];
    if (Math.hypot(...vertex.slice(3, 6)) < 1e-8) {
      throw new Error("Spiral support source normals must be nonzero.");
    }
    if (!vertex.every(Number.isFinite))
      throw new Error("Spiral support attributes must be finite.");
    if (
      vertex[0] < -0.501 ||
      vertex[0] > 0.501 ||
      vertex[1] < -0.001 ||
      vertex[1] > 1.001 ||
      vertex[2] < -0.501 ||
      vertex[2] > 0.501
    ) {
      throw new Error("Spiral support inputs must use normalized X/Z and bottom-origin Y.");
    }
    vertices.push(vertex);
  }
  return vertices;
}

function clipAtPlane(triangle, limit, cutPoints, axis = 1, less = true) {
  const polygon = [];
  let previous = triangle.at(-1);
  for (const current of triangle) {
    const previousInside = less ? previous[axis] <= limit : previous[axis] >= limit;
    const currentInside = less ? current[axis] <= limit : current[axis] >= limit;
    if (previousInside !== currentInside) {
      const t = (limit - previous[axis]) / (current[axis] - previous[axis]);
      const point = previous.map((value, i) => value + (current[i] - value) * t);
      point[axis] = limit;
      polygon.push(point);
      cutPoints.push(point);
    }
    if (currentInside) polygon.push(current);
    previous = current;
  }
  return polygon;
}

function convexCut(points, axis0 = 0, axis1 = 2) {
  const unique = new Map(points.map((p) => [`${p[axis0].toFixed(7)},${p[axis1].toFixed(7)}`, p]));
  const sorted = [...unique.values()].sort((a, b) => a[axis0] - b[axis0] || a[axis1] - b[axis1]);
  if (sorted.length < 3) return [];
  const cross = (a, b, c) =>
    (b[axis0] - a[axis0]) * (c[axis1] - a[axis1]) - (b[axis1] - a[axis1]) * (c[axis0] - a[axis0]);
  const half = (values) => {
    const hull = [];
    for (const point of values) {
      while (hull.length > 1 && cross(hull.at(-2), hull.at(-1), point) <= 0) hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/**
 * Fill the entire stair footprint down to the plaza. Inputs are borrowed normalized
 * geometries; the caller owns the single returned geometry and supplies wall material.
 * The closed core carries the load. Shallow source-wall courses retain Meshy's UVs
 * and relief without stretching one masonry panel through the tower's full height.
 */
export function createSpiralSupportGeometry({
  wallGeometry,
  stairsGeometry,
  walking = {},
  architecture,
  collapseYaw = 0.32 * Math.PI,
  groundY = 0.1,
  outerInset = 0.145,
}) {
  const wall = readVertices(wallGeometry);
  const stairs = readVertices(stairsGeometry);
  const config = architecture || {};
  const keys = [
    "bottom",
    "height",
    "bottomRadius",
    "topRadius",
    "stairWidth",
    "stairStart",
    "stairEnd",
    "flights",
  ];
  if (
    keys.some((key) => !Number.isFinite(config[key])) ||
    config.height <= 0 ||
    config.stairWidth <= 0 ||
    config.stairEnd <= config.stairStart ||
    !Number.isInteger(config.flights) ||
    config.flights < 1 ||
    config.flights > 16
  ) {
    throw new Error("Invalid spiral support architecture.");
  }
  if (
    ![collapseYaw, groundY, outerInset].every(Number.isFinite) ||
    outerInset < 0.08 ||
    outerInset > 0.145 ||
    groundY >= config.stairStart
  ) {
    throw new Error("Invalid spiral support ground or edge inset.");
  }
  const levels = walking.levels || [0, 1];
  if (
    levels.length < 2 ||
    levels.some((value, i) => !Number.isFinite(value) || (i && value <= levels[i - 1])) ||
    Math.abs(levels[0]) > 0.001
  ) {
    throw new Error("Invalid spiral support walking levels.");
  }
  const minimumY = Math.min(...stairs.map((vertex) => vertex[1]));
  if (Math.abs(minimumY) > 0.001) throw new Error("Stair underside must begin at normalized Y=0.");
  const rise = (config.stairEnd - config.stairStart) / config.flights;
  const flightArc = TAU / config.flights;
  const radiusSlope = (y) =>
    y > config.bottom && y < config.bottom + config.height
      ? (config.topRadius - config.bottomRadius) / config.height
      : 0;
  const radiusAt = (y) =>
    config.bottomRadius +
    (config.topRadius - config.bottomRadius) *
      Math.max(0, Math.min(1, (y - config.bottom) / config.height));
  const position = [];
  const normal = [];
  const uv = [];
  const triangle = (a, b, c, outward = null) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let face = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const length = Math.hypot(...face);
    if (length < 1e-10) return;
    face = face.map((value) => value / length);
    if (outward && face.reduce((sum, value, i) => sum + value * outward[i], 0) < 0) {
      [b, c] = [c, b];
      face = face.map((value) => -value);
    }
    for (const vertex of [a, b, c]) {
      position.push(...vertex.slice(0, 3));
      normal.push(...(outward ? face : vertex.slice(3, 6)));
      uv.push(vertex[6], vertex[7]);
    }
  };
  const quad = (a, b, c, d, outward) => {
    triangle(a, b, c, outward);
    triangle(a, c, d, outward);
  };
  // Core surfaces are normally concealed. Their UV corners still come from the
  // borrowed wall, while every visible relief triangle keeps its original chart.
  const uvCorners = [-0.5, 0.5].flatMap((x) =>
    [0, 1].map((y) => {
      let best = wall[0];
      let distance = Infinity;
      for (const point of wall) {
        const next = (point[0] - x) ** 2 + (point[1] - y) ** 2 + (point[2] - 0.5) ** 2;
        if (next < distance) {
          best = point;
          distance = next;
        }
      }
      return best.slice(6, 8);
    }),
  );
  const coreUV = (u, v) =>
    [0, 1].map(
      (i) =>
        (1 - u) * ((1 - v) * uvCorners[0][i] + v * uvCorners[1][i]) +
        u * ((1 - v) * uvCorners[2][i] + v * uvCorners[3][i]),
    );
  const flights = [];
  let wallModules = 0;
  let clippedModules = 0;
  const wallIndex = wallGeometry.index;
  const indexCount = wallIndex?.count ?? wall.length;
  if (indexCount % 3) throw new Error("Wall source must contain complete triangles.");
  const sourceTriangles = [];
  for (let i = 0; i < indexCount; i += 3) {
    const points = [0, 1, 2].map((j) => wall[wallIndex ? wallIndex.getX(i + j) : i + j]);
    if (points.some((point) => !point)) throw new Error("Wall source has an invalid index.");
    sourceTriangles.push(points);
  }
  for (let flight = 0; flight < config.flights; flight += 1) {
    const bottom = config.stairStart + flight * rise;
    const top = bottom + CONTACT_OVERLAP;
    const angleStart = collapseYaw + flight * flightArc;
    const walkingAt = (along) => config.stairStart + (flight + along) * rise;
    const innerRadius = (along) => radiusAt(walkingAt(along)) - 0.6;
    const outerRadius = (along) =>
      radiusAt(walkingAt(along)) - 0.25 + config.stairWidth - outerInset;
    if (outerRadius(0) >= 18.7 || outerRadius(1) >= 18.7)
      throw new Error("Spiral support exceeds the plaza boundary.");
    const coreStart = position.length / 9;
    const heights = [groundY];
    while (heights.at(-1) + COURSE_HEIGHT < top) heights.push(heights.at(-1) + COURSE_HEIGHT);
    heights.push(top);
    // The full-width caps meet the plaza and underside. Behind the thick source
    // masonry, recess the core so it never clips through authored wall relief.
    const coreHeights = [
      ...new Set([...heights, groundY + CONTACT_COLLAR, top - CONTACT_COLLAR]),
    ].sort((a, b) => a - b);
    const point = (along, y, outer, u, v) => {
      const angle = angleStart + along * flightArc;
      const inset = y > groundY + 1e-8 && y < top - 1e-8 ? CORE_RECESS : 0;
      const radius = outer ? outerRadius(along) - inset : innerRadius(along);
      return [Math.cos(angle) * radius, y, Math.sin(angle) * radius, 0, 0, 0, ...coreUV(u, v)];
    };
    for (let segment = 0; segment < CORE_SEGMENTS_PER_FLIGHT; segment += 1) {
      const a = segment / CORE_SEGMENTS_PER_FLIGHT;
      const b = (segment + 1) / CORE_SEGMENTS_PER_FLIGHT;
      // Subdivision is geometric only: UVs span one complete source panel,
      // rather than restarting the atlas at every narrow angular strip.
      const panelU = (course) => {
        const offset = course % 2 ? 0.5 : 0;
        const module = Math.floor(a * WALLS_PER_FLIGHT + offset + 1e-8) - offset;
        return [1 - (a * WALLS_PER_FLIGHT - module), 1 - (b * WALLS_PER_FLIGHT - module)];
      };
      const angle = angleStart + ((a + b) * flightArc) / 2;
      const radial = [Math.cos(angle), 0, Math.sin(angle)];
      for (let row = 0; row < coreHeights.length - 1; row += 1) {
        const lo = coreHeights[row];
        const hi = coreHeights[row + 1];
        const course = Math.floor((lo - groundY + 1e-8) / COURSE_HEIGHT);
        const [u0, u1] = panelU(course);
        const v0 = (lo - groundY - course * COURSE_HEIGHT) / COURSE_HEIGHT;
        const v1 = (hi - groundY - course * COURSE_HEIGHT) / COURSE_HEIGHT;
        for (const outer of [false, true])
          quad(
            point(a, lo, outer, u0, v0),
            point(b, lo, outer, u1, v0),
            point(b, hi, outer, u1, v1),
            point(a, hi, outer, u0, v1),
            radial.map((value) => value * (outer ? 1 : -1)),
          );
      }
      for (const [y, sign] of [
        [groundY, -1],
        [top, 1],
      ]) {
        const [u0, u1] = panelU(Math.max(0, Math.floor((y - groundY - 1e-8) / COURSE_HEIGHT)));
        quad(
          point(a, y, false, u0, 0),
          point(b, y, false, u1, 0),
          point(b, y, true, u1, 1),
          point(a, y, true, u0, 1),
          [0, sign, 0],
        );
      }
    }
    for (const [along, sign] of [
      [0, -1],
      [1, 1],
    ]) {
      const angle = angleStart + along * flightArc;
      for (let row = 0; row < coreHeights.length - 1; row += 1)
        quad(
          point(along, coreHeights[row], false, 0, 0),
          point(along, coreHeights[row], true, 1, 0),
          point(
            along,
            coreHeights[row + 1],
            true,
            1,
            (coreHeights[row + 1] - coreHeights[row]) / COURSE_HEIGHT,
          ),
          point(
            along,
            coreHeights[row + 1],
            false,
            0,
            (coreHeights[row + 1] - coreHeights[row]) / COURSE_HEIGHT,
          ),
          [-Math.sin(angle) * sign, 0, Math.cos(angle) * sign],
        );
    }
    const coreTriangles = position.length / 9 - coreStart;
    for (let row = 0; row < heights.length - 1; row += 1) {
      const courseBottom = heights[row];
      const limit = Math.min(1, (top - courseBottom) / COURSE_HEIGHT);
      // Alternate half-panels at the flight boundaries rather than aligning every
      // vertical joint. Boundary panels are clipped, not squeezed into a narrow UV strip.
      for (let column = row % 2 ? -0.5 : 0; column < WALLS_PER_FLIGHT; column += 1) {
        const arc = flightArc / WALLS_PER_FLIGHT;
        const minimumX = Math.max(-0.5, column + 0.5 - WALLS_PER_FLIGHT);
        const maximumX = Math.min(0.5, column + 0.5);
        const cuts = [];
        const leftCuts = [];
        const rightCuts = [];
        const transform = (p) => {
          const along = (column + 0.5 - p[0]) / WALLS_PER_FLIGHT;
          const angle = angleStart + along * flightArc;
          const walkingY = walkingAt(along);
          const radius = outerRadius(along) + RELIEF_OUTER_OFFSET - (0.5 - p[2]) * RELIEF_DEPTH;
          const radial = p[5] / RELIEF_DEPTH;
          const derivative = (-radiusSlope(walkingY) * rise) / WALLS_PER_FLIGHT;
          const tangent = (p[3] - derivative * radial) / (-radius * arc);
          const vertical = p[4] / COURSE_HEIGHT;
          const n = [
            Math.cos(angle) * radial - Math.sin(angle) * tangent,
            vertical,
            Math.sin(angle) * radial + Math.cos(angle) * tangent,
          ];
          const length = Math.hypot(...n);
          if (!Number.isFinite(length) || length < 1e-10)
            throw new Error("Spiral support interpolated normals must be nonzero and finite.");
          return [
            Math.cos(angle) * radius,
            courseBottom + p[1] * COURSE_HEIGHT,
            Math.sin(angle) * radius,
            ...n.map((value) => value / length),
            p[6],
            p[7],
          ];
        };
        for (const source of sourceTriangles) {
          let polygon = limit < 1 ? clipAtPlane(source, limit, []) : source;
          if (minimumX > -0.5) polygon = clipAtPlane(polygon, minimumX, [], 0, false);
          if (maximumX < 0.5) polygon = clipAtPlane(polygon, maximumX, [], 0, true);
          if (polygon.length < 3) continue;
          for (const point of polygon) {
            if (limit < 1 && Math.abs(point[1] - limit) < 1e-8) cuts.push(point);
            if (minimumX > -0.5 && Math.abs(point[0] - minimumX) < 1e-8) leftCuts.push(point);
            if (maximumX < 0.5 && Math.abs(point[0] - maximumX) < 1e-8) rightCuts.push(point);
          }
          const transformed = polygon.map(transform);
          for (let i = 1; i < transformed.length - 1; i += 1)
            triangle(transformed[0], transformed[i], transformed[i + 1]);
        }
        const cap = (points, axis0, axis1, outward) => {
          const hull = convexCut(points, axis0, axis1).map(transform);
          for (let i = 1; i < hull.length - 1; i += 1)
            triangle(hull[0], hull[i], hull[i + 1], outward);
        };
        if (limit < 1) cap(cuts, 0, 2, [0, 1, 0]);
        for (const [points, x, sign] of [
          [leftCuts, minimumX, 1],
          [rightCuts, maximumX, -1],
        ]) {
          const angle = angleStart + ((column + 0.5 - x) / WALLS_PER_FLIGHT) * flightArc;
          cap(points, 1, 2, [-Math.sin(angle) * sign, 0, Math.cos(angle) * sign]);
        }
        if (limit < 1 || minimumX > -0.5 || maximumX < 0.5) clippedModules += 1;
        wallModules += 1;
      }
    }
    flights.push({
      flight,
      groundY,
      topY: top,
      stairBottomY: bottom,
      firstTreadY: bottom + rise / (levels.length - 1),
      angleStart,
      angleEnd: angleStart + flightArc,
      innerRadius: [innerRadius(0), innerRadius(1)],
      outerRadius: [outerRadius(0), outerRadius(1)],
      coreTriangleStart: coreStart,
      coreTriangles,
      coreRows: coreHeights.length - 1,
      triangleStart: coreStart,
      triangles: position.length / 9 - coreStart,
      courses: heights.length - 1,
    });
  }
  const triangleCount = position.length / 9;
  const maxTriangles = sourceTriangles.length > 600 ? 150000 : 80000;
  if (triangleCount > maxTriangles) throw new Error("Spiral support exceeds its triangle budget.");
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const metadata = {
    triangles: triangleCount,
    maxTriangles,
    sourceWallTriangles: sourceTriangles.length,
    wallModules,
    clippedModules,
    groundY,
    outerInset,
    masonryReliefDepth: RELIEF_DEPTH,
    masonryOuterOffset: RELIEF_OUTER_OFFSET,
    coreVerticalRecess: CORE_RECESS,
    contactOverlap: CONTACT_OVERLAP,
    courseHeight: COURSE_HEIGHT,
    fullRadialFootprint: true,
    closedCore: true,
    coreSegmentsPerFlight: CORE_SEGMENTS_PER_FLIGHT,
    wallModulesPerFlight: WALLS_PER_FLIGHT,
    staggeredCourses: true,
    flights,
  };
  geometry.userData.spiralSupport = metadata;
  return { geometry, metadata };
}
