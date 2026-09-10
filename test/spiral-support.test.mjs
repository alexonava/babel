import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from "three";
import { ARCHITECTURE, bendFlight, towerRadius } from "../src/scene/architecture.js";
import { createSpiralSupportGeometry } from "../src/scene/spiral-support.js";

async function source(role, tier) {
  const raw = await readFile(
    new URL(`../images/architecture/${role}-${tier}.glb`, import.meta.url),
  );
  const jsonLength = raw.readUInt32LE(12);
  const doc = JSON.parse(raw.subarray(20, 20 + jsonLength).toString());
  const bin = raw.subarray(28 + jsonLength);
  const geometry = new BufferGeometry();
  const primitive = doc.meshes[0].primitives[0];
  const types = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array };
  const sizes = { VEC3: 3, VEC2: 2, SCALAR: 1 };
  const attribute = (index) => {
    const accessor = doc.accessors[index];
    const view = doc.bufferViews[accessor.bufferView];
    const Type = types[accessor.componentType];
    const itemSize = sizes[accessor.type];
    const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const copied = Uint8Array.from(
      bin.subarray(start, start + accessor.count * itemSize * Type.BYTES_PER_ELEMENT),
    );
    return new BufferAttribute(new Type(copied.buffer), itemSize);
  };
  for (const [name, key] of [
    ["POSITION", "position"],
    ["NORMAL", "normal"],
    ["TEXCOORD_0", "uv"],
  ])
    geometry.setAttribute(key, attribute(primitive.attributes[name]));
  geometry.setIndex(attribute(primitive.indices));
  return { geometry, walking: doc.nodes[0].extras?.walking };
}
function hits(mesh, radius, angle, y, direction) {
  const ray = new Raycaster(
    new Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius),
    new Vector3(0, direction, 0),
  );
  return ray.intersectObject(mesh, false).map((hit) => hit.point.y);
}
function closedCore(geometry, flight) {
  const p = geometry.attributes.position;
  const edges = new Map();
  let volume = 0;
  const point = (i) => new Vector3().fromBufferAttribute(p, i);
  const key = (v) => v.toArray().join(",");
  for (
    let triangle = flight.coreTriangleStart;
    triangle < flight.coreTriangleStart + flight.coreTriangles;
    triangle += 1
  ) {
    const points = [0, 1, 2].map((i) => point(triangle * 3 + i));
    volume += points[0].dot(new Vector3().crossVectors(points[1], points[2])) / 6;
    for (let i = 0; i < 3; i += 1) {
      const edge = [key(points[i]), key(points[(i + 1) % 3])].sort().join("|");
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  assert.ok(volume > 0, "closed core winding points outward");
  assert.ok(
    [...edges.values()].every((count) => count === 2),
    "each core edge belongs to two faces",
  );
}
for (const tier of ["high", "balanced"]) {
  test(`${tier} real Meshy support fills the full stair footprint from ground without obstructing treads`, async () => {
    const wall = await source("wall", tier);
    const stair = await source("stairs", tier);
    const oldPosition = wall.geometry.attributes.position.array.slice();
    const oldUV = wall.geometry.attributes.uv.array.slice();
    let disposedWall = 0;
    wall.geometry.addEventListener("dispose", () => disposedWall++);
    const yaw = 0.32 * Math.PI;
    const { geometry, metadata } = createSpiralSupportGeometry({
      wallGeometry: wall.geometry,
      stairsGeometry: stair.geometry,
      walking: stair.walking,
      architecture: ARCHITECTURE,
      collapseYaw: yaw,
    });
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const support = new Mesh(geometry, material);
    support.updateMatrixWorld(true);
    assert.ok(metadata.triangles <= (tier === "high" ? 150000 : 80000));
    assert.equal(metadata.flights.length, 8);
    assert.equal(geometry.groups.length, 0, "one shared material and draw group");
    assert.ok(Math.abs(geometry.boundingBox.min.y - 0.1) < 1e-6);
    for (const flight of metadata.flights) {
      closedCore(geometry, flight);
      const bent = stair.geometry.clone();
      bendFlight(bent, flight.flight, yaw, stair.walking);
      const stairsMesh = new Mesh(bent, material);
      stairsMesh.updateMatrixWorld(true);
      const rise = (ARCHITECTURE.stairEnd - ARCHITECTURE.stairStart) / 8;
      for (const along of [0.08, 0.31, 0.58, 0.91]) {
        const angle = yaw + ((flight.flight + along) * Math.PI) / 4;
        const walkingY = ARCHITECTURE.stairStart + (flight.flight + along) * rise;
        const stairOuter = towerRadius(walkingY) - 0.25 + ARCHITECTURE.stairWidth;
        const edgeRadius = stairOuter - 0.15;
        const supportHits = hits(support, edgeRadius, angle, 40, -1);
        assert.ok(
          supportHits.length >= 2,
          "outer support is a solid column, not a floating ribbon",
        );
        assert.ok(Math.abs(Math.min(...supportHits) - 0.1) < 1e-5, "edge column reaches the plaza");
        assert.ok(Math.abs(Math.max(...supportHits) - flight.topY) < 1e-5);
        const stairHits = hits(stairsMesh, edgeRadius, angle, -1, 1);
        assert.ok(stairHits.length >= 2, "source stair exists at the structural support edge");
        assert.ok(
          flight.topY >= Math.min(...stairHits) - 0.001,
          "support contacts actual source underside",
        );
        assert.ok(
          flight.topY < Math.max(...stairHits) - 0.1,
          "support stays below the walking surface",
        );
        const innerRadius = towerRadius(walkingY) - 0.4;
        const innerHits = hits(support, innerRadius, angle, 40, -1);
        assert.ok(
          innerHits.length >= 2 && Math.abs(Math.min(...innerHits) - 0.1) < 1e-5,
          "support fills inward through the shell overlap",
        );
      }
      for (
        let triangle = flight.triangleStart;
        triangle < flight.triangleStart + flight.triangles;
        triangle += 1
      ) {
        for (let i = 0; i < 3; i += 1) {
          const index = triangle * 3 + i;
          const position = geometry.attributes.position;
          assert.ok(position.getY(index) <= flight.topY + 2e-6);
          const angle = Math.atan2(position.getZ(index), position.getX(index));
          const relative =
            (((angle - flight.angleStart) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          assert.ok(
            relative <= flight.angleEnd - flight.angleStart + 1e-5 ||
              relative >= 2 * Math.PI - 1e-5,
            "clipped staggered panels stay inside their flight",
          );
        }
      }
      bent.dispose();
    }
    const p = geometry.attributes.position;
    const n = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < p.count; i += 1) {
      assert.ok(
        [
          p.getX(i),
          p.getY(i),
          p.getZ(i),
          n.getX(i),
          n.getY(i),
          n.getZ(i),
          uv.getX(i),
          uv.getY(i),
        ].every(Number.isFinite),
      );
      assert.ok(Math.hypot(p.getX(i), p.getZ(i)) < 18.7);
      assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-5);
      assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1);
    }
    assert.deepEqual(wall.geometry.attributes.position.array, oldPosition);
    assert.deepEqual(wall.geometry.attributes.uv.array, oldUV);
    geometry.dispose();
    assert.equal(disposedWall, 0, "disposing support never disposes borrowed wall geometry");
    wall.geometry.dispose();
    stair.geometry.dispose();
    material.dispose();
  });
}
test("invalid support inputs fail without modifying borrowed geometry", async () => {
  const wall = await source("wall", "balanced");
  const stairs = await source("stairs", "balanced");
  const args = {
    wallGeometry: wall.geometry,
    stairsGeometry: stairs.geometry,
    architecture: ARCHITECTURE,
    walking: stairs.walking,
  };
  assert.throws(() => createSpiralSupportGeometry({ ...args, outerInset: 0.3 }), /inset/);
  assert.throws(() => createSpiralSupportGeometry({ ...args, groundY: 2 }), /ground/);
  assert.throws(
    () => createSpiralSupportGeometry({ ...args, walking: { levels: [0, 0.3, 0.2] } }),
    /walking/,
  );
  assert.throws(
    () => createSpiralSupportGeometry({ ...args, architecture: { ...ARCHITECTURE, flights: 0 } }),
    /architecture/,
  );
  wall.geometry.attributes.normal.array.fill(0);
  assert.throws(() => createSpiralSupportGeometry(args), /normals must be nonzero/);
  wall.geometry.dispose();
  stairs.geometry.dispose();
});

test("synthetic normalized boxes retain full-module UV scale across geometric subdivisions", () => {
  const wall = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const stairs = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const { geometry, metadata } = createSpiralSupportGeometry({
    wallGeometry: wall,
    stairsGeometry: stairs,
    architecture: ARCHITECTURE,
  });
  const flight = metadata.flights[0];
  const firstOuterTriangle = flight.coreTriangleStart + 2;
  const values = Array.from({ length: 6 }, (_, i) =>
    geometry.attributes.uv.getX(firstOuterTriangle * 3 + i),
  );
  const span = Math.max(...values) - Math.min(...values);
  assert.ok(
    span > 0.03 && span < 0.1,
    "one small subdivision consumes only its fraction of a full masonry panel",
  );
  assert.equal(
    metadata.coreSegmentsPerFlight % metadata.wallModulesPerFlight,
    0,
    "UV resets align with masonry panel boundaries",
  );
  closedCore(geometry, flight);
  geometry.dispose();
  wall.dispose();
  stairs.dispose();
});
