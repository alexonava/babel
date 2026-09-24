import assert from "node:assert/strict";
import test from "node:test";
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3, PointLight } from "three";
import { DOOR_HEIGHT as D, mudSample, wantsMud, wantsPropScale } from "../src/scene/mud-ground.js";
import { createPropScale } from "../src/scene/prop-scale.js";
import { DIRECTED_SHOTS, measureShot, fitShot } from "../src/scene/directed-shots.js";
const size = (o) => new Box3().setFromObject(o).getSize(new Vector3());
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
function fixture() {
  const root = new Group();
  root.position.y = -7;
  const make = (w, h, d, x) => {
    const m = new Mesh(new BoxGeometry(w, h, d), new MeshStandardMaterial());
    m.position.set(x, 4, 0);
    root.add(m);
    return m;
  };
  return { root, make };
}
test("mud selection preserves desert, procedural and architecture comparisons", () => {
  assert.equal(wantsMud(""), true);
  for (const q of [
    "?ground=desert",
    "?ground=procedural",
    "?architecture=classic",
    "?architecture=assembled",
  ])
    assert.equal(wantsMud(q), false);
  assert.equal(wantsPropScale("?ground=desert"), true);
  assert.equal(wantsPropScale("?scale=baseline"), false);
});
test("mud fields are periodic, deterministic and keep wetness within the damp-earth range", () => {
  let wet = 0;
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const a = mudSample(x / 64, y / 64),
        b = mudSample(x / 64 + 1, y / 64 - 1);
      near(a.height, b.height);
      assert.ok(a.roughness >= 0.55 && a.roughness <= 0.9);
      if (a.roughness < 0.7) wet++;
    }
  assert.ok(wet > 0 && wet < 4096 * 0.2);
  assert.deepEqual(mudSample(0.2, 0.3), mudSample(0.2, 0.3));
});
test("props respect doorway-relative bounds and terrain contact then restore exactly", () => {
  const { root, make } = fixture();
  const stone = make(5, 3, 4, 20),
    rubble = make(4, 4, 4, 25),
    plant = make(3, 6, 3, 30);
  stone.rotation.z = 0.4;
  const originals = [stone, rubble, plant].map((o) => ({
    p: o.position.clone(),
    s: o.scale.clone(),
  }));
  const c = createPropScale({
    groundRoot: root,
    groundHeight: () => 2,
    stones: [stone],
    rubble: [rubble],
    plants: [plant],
  });
  c.setActive(true);
  assert.ok(Math.max(...size(stone).toArray()) <= 0.1 * D + 1e-6);
  assert.ok(Math.max(...size(rubble).toArray()) <= 0.25 * D + 1e-6);
  assert.ok(size(plant).y <= 0.12 * D + 1e-6);
  for (const o of [stone, rubble, plant]) near(new Box3().setFromObject(o).min.y, -5);
  const scale = stone.scale.clone();
  c.setActive(true);
  assert.deepEqual(stone.scale, scale);
  c.setActive(false);
  [stone, rubble, plant].forEach((o, i) => {
    assert.deepEqual(o.position, originals[i].p);
    assert.deepEqual(o.scale, originals[i].s);
  });
  c.setActive(true);
  assert.equal(c.dispose(), true);
  assert.equal(c.dispose(), false);
  assert.deepEqual(stone.scale, originals[0].s);
});
test("independently loaded tree and lantern resize and restore without changing borrowed geometry", () => {
  const { root, make } = fixture();
  const treeRoot = new Group();
  root.add(treeRoot);
  const tree = make(8, 22, 8, 0);
  tree.name = "meshy-tree";
  treeRoot.add(tree);
  const lantern = new Group();
  lantern.name = "tree-lantern";
  treeRoot.add(lantern);
  const housing = make(0.86, 2.48, 0.86, 0);
  housing.position.set(0, 1.24, 0);
  lantern.add(housing);
  const light = new PointLight(0xffffff, 4, 23);
  lantern.add(light);
  const fillLight = new PointLight(0xffffff, 2, 30);
  treeRoot.add(fillLight);
  const c = createPropScale({ groundRoot: root, groundHeight: () => 0 });
  c.setActive(true);
  c.setTree({ root: treeRoot, light, fillLight });
  near(size(tree).y, 4.2 * D);
  near(size(lantern).y, 0.3 * D);
  c.setTree(null);
  near(size(tree).y, 22);
  near(light.distance, 23);
  c.dispose();
});

test("decorative canopy bounds cannot change authored tree scale, footing or fitted camera", () => {
  const { root, make } = fixture(),
    treeRoot = new Group(),
    tree = make(8, 22, 8, 0);
  root.add(treeRoot);
  treeRoot.add(tree);
  tree.name = "meshy-tree";
  const original = {
    position: tree.position.clone(),
    scale: tree.scale.clone(),
    vertices: tree.geometry.attributes.position.array.slice(),
    uv: tree.geometry.attributes.uv.array.slice(),
  };
  const controller = createPropScale({ groundRoot: root, groundHeight: () => 2 });
  controller.setActive(true);
  controller.setTree({ root: treeRoot });
  const expectedScale = tree.scale.clone(),
    expectedPosition = tree.position.clone(),
    shot = DIRECTED_SHOTS.tree[0],
    expected = measureShot(treeRoot, shot),
    area = { left: 576, top: 80, width: 806, height: 820 },
    expectedFit = fitShot(expected, shot, area, 1440, 1000);
  near(expected.height, 4.2 * D);
  near(expected.footing, -5);
  assert.ok(expectedFit.distance > 0 && expectedFit.distance < 200);
  const decoration = new Mesh(new BoxGeometry(100, 100, 100), new MeshStandardMaterial());
  decoration.userData.excludeFromShot = true;
  tree.add(decoration);
  for (const [visible, y] of [[false, 80], [true, 80], [true, -80]]) {
    decoration.visible = visible;
    decoration.position.y = y;
    controller.setTree({ root: treeRoot });
    const measured = measureShot(treeRoot, shot);
    assert.deepEqual(tree.scale, expectedScale);
    assert.deepEqual(tree.position, expectedPosition);
    assert.deepEqual(measured.points, expected.points);
    assert.deepEqual(measured.target, expected.target);
    near(measured.height, expected.height);
    near(measured.footing, expected.footing);
    assert.deepEqual(fitShot(measured, shot, area, 1440, 1000), expectedFit);
  }
  controller.dispose();
  assert.deepEqual(tree.position, original.position);
  assert.deepEqual(tree.scale, original.scale);
  assert.deepEqual(tree.geometry.attributes.position.array, original.vertices);
  assert.deepEqual(tree.geometry.attributes.uv.array, original.uv);
  for (const mesh of [tree, decoration]) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

test("torch animation remains inside scaled parents and restoration removes wrappers", () => {
  const { root, make } = fixture();
  const stand = make(0.3, 2.5, 0.3, 12),
    flame = make(1.6, 2.4, 1, 12);
  flame.position.y = 3.9;
  const light = new PointLight(0xffffff, 1, 18);
  light.position.set(12, 3.8, 0);
  root.add(light);
  const original = stand.position.clone(),
    count = root.children.length;
  const c = createPropScale({
    groundRoot: root,
    groundHeight: () => 1.6,
    torches: [
      {
        stand,
        flameOuter: flame,
        embers: [],
        light,
        baseX: 12,
        baseZ: 0,
        baseGroundY: 0.05,
        baseFlameY: 3.9,
      },
    ],
  });
  c.setActive(true);
  near(size(stand).y, 0.63 * D);
  near(size(flame).y, 0.12 * D);
  flame.position.y = 4;
  root.updateMatrixWorld(true);
  assert.ok(flame.getWorldPosition(new Vector3()).y > -2);
  c.setActive(false);
  assert.equal(root.children.length, count);
  assert.equal(flame.parent, root);
  near(light.distance, 18);
  assert.deepEqual(stand.position, original);
  c.dispose();
});

test("mud shading compiles only in mud mode and restores the baseline shader", async () => {
  const { configureMudShading } = await import("../src/scene/mud-ground.js");
  const material = new MeshStandardMaterial();
  const original = {
    vertexShader: "#include <begin_vertex>",
    fragmentShader: "#include <roughnessmap_fragment>",
  };
  configureMudShading(material, true);
  const shader = { ...original };
  material.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /vMudWorld/);
  assert.match(shader.fragmentShader, /roughnessFactor = mix/);
  configureMudShading(material, false);
  const baseline = { ...original };
  material.onBeforeCompile(baseline);
  assert.deepEqual(baseline, original);
  material.dispose();
});

const FILM_CHUNKS = [
  "#include <roughnessmap_fragment>",
  "#include <normal_fragment_maps>",
  "#include <lights_fragment_end>",
  "#include <fog_fragment>",
].join("\n");

test("each ground shading has its own program cache key; the slate's shading needs film and no grass", async () => {
  const { configureMudShading, SLATE_WET, SLATE_DETAIL } = await import("../src/scene/mud-ground.js");
  const grass = { grassColorMap: {}, grassMaskMap: {}, grassTile: 9 };
  const material = new MeshStandardMaterial();
  const compile = (...args) => {
    configureMudShading(material, ...args);
    const shader = {
      uniforms: {},
      vertexShader: "#include <begin_vertex>",
      fragmentShader: FILM_CHUNKS,
    };
    material.onBeforeCompile(shader);
    return { key: material.customProgramCacheKey(), fragment: shader.fragmentShader };
  };
  for (const [args, key, slate] of [
    [[false], "ground-baseline", false],
    [[false, false, false, null, { slate: true }], "ground-baseline", false],
    [[true, false], "mud-world-variation-v1", false],
    [[true, true], "mud-quiet-earth-v2", false],
    [[true, true, false, null, { slate: true }], "mud-quiet-earth-v2", false],
    [[true, true, true], "moonlit-earth-v2", false],
    [[true, true, true, grass], "moonlit-earth-grass-v1", false],
    [[false, true, true, grass, { slate: true }], "moonlit-earth-grass-v1", false],
    [[false, true, true, null, { slate: true }], "moonlit-slate-v1", true],
  ]) {
    const compiled = compile(...args);
    assert.equal(compiled.key, key, JSON.stringify(args));
    assert.equal(compiled.fragment.includes("slateWet"), slate, key);
    assert.equal(compiled.fragment.includes("slateDetailN"), slate, key);
    // Film ground writes the ground depth layer for the tour's staggered dissolve.
    assert.equal(compiled.fragment.includes("gl_FragColor.a = 0.6667;"), Boolean(args[2]), key);
  }
  const { fragment } = compile(false, true, true, null, { slate: true });
  assert.match(fragment, /gl_FragColor\.rgb = mix\(gl_FragColor\.rgb, fogColor, earthHorizon\);\s*#endif\s*gl_FragColor\.a = 0\.6667;/);
  // Camera-distance horizon shared with the mountains' feet (hill-silhouette.js HORIZON_HAZE).
  assert.match(fragment, /float earthHorizon = max\([^;]*,\s*smoothstep\(150\.0, 190\.0, vFogDepth\)\);/);
  // The film specular clamp stays; the wet term only relaxes it, within the
  // brief's 1 + 1.6 bound, and at half of it so distant ground stays dark.
  assert.match(fragment, /reflectedLight\.directSpecular \*= mix\(\.12, \.22, damp\);/);
  assert.match(fragment, /reflectedLight\.directSpecular \*= 1\.0 \+ 0\.8\*slateWet;/);
  assert.ok(SLATE_WET.specular <= 1.6);
  assert.match(fragment, /float slateWet = clamp\([^;]*\)\*\(1\.0-worn\);/, "the worn footing, roots and path stay dry");
  assert.match(fragment, /roughnessFactor = mix\(roughnessFactor, 0\.5, slateWet\*0\.75\);/);
  assert.match(fragment, /diffuseColor\.rgb \*= 1\.0 - 0\.14\*slateWet;/);
  // A low, mostly neutral grazing reflection: not the fog's full blue.
  assert.match(
    fragment,
    /#ifdef USE_FOG\s*float slateFresnel = pow\(1\.0 - saturate\(dot\(geometryNormal, geometryViewDir\)\), 5\.0\);\s*vec3 slateSheen = mix\(fogColor, vec3\(dot\(fogColor, vec3\(\.2126,\.7152,\.0722\)\)\), 0\.6\);\s*reflectedLight\.indirectSpecular \+= slateSheen\*\(slateWet\*slateFresnel\*0\.15\);/,
  );
  assert.ok(SLATE_WET.fresnel <= 0.2, "the grazing sheen stays low behind the intro text and in the distance");
  assert.ok(fragment.indexOf("slateWet = ") > fragment.indexOf("float worn ="), "wetness follows the worn mask");
  // Close detail: the same normal map again, finer and turned, faded out with
  // view distance, and only where the tangent-space normal map is bound.
  const detail = fragment.slice(fragment.indexOf("#include <normal_fragment_maps>"), fragment.indexOf("#include <lights_fragment_end>"));
  assert.match(detail, /#ifdef USE_NORMALMAP_TANGENTSPACE\s*mat2 slateTurn = mat2\(0\.8000, 0\.6000, -0\.6000, 0\.8000\);/);
  assert.match(detail, /texture2D\(normalMap, slateTurn\*vNormalMapUv\*3\.7\)/);
  assert.match(detail, /float slateNear = 1\.0 - smoothstep\(6\.0, 18\.0, length\(vViewPosition\)\);/);
  assert.match(detail, /mapN\.xy \+= \(slateDetailN\.xy\*slateTurn\)\*\(0\.7\*slateNear\);\s*normal = normalize\(tbn\*mapN\);\s*#endif/);
  assert.equal((fragment.match(/texture2D\(normalMap/g) || []).length, 1, "one extra normal-map fetch");
  assert.ok(SLATE_DETAIL.scale > 3 && SLATE_DETAIL.scale % 1 !== 0, "a non-integer ratio keeps the detail off the base tile's mirror seams");
  material.dispose();
});

test("the film ground material follows the mode, so loading and fallback surfaces match", async () => {
  const { filmGroundSurface, FILM_EARTH_SURFACE } = await import("../src/scene/mud-ground.js");
  globalThis.window ??= { BabelSite: {} };
  await import("../src/scene/palette.js");
  const surface = globalThis.window.BabelSite.scene.GROUND_SURFACE_MATERIAL;
  assert.equal(surface.filmColor, 0x5c5048);
  assert.equal(FILM_EARTH_SURFACE.color, 0x615447);
  const slate = { color: surface.filmColor, roughness: 0.98, metalness: 0, slate: true };
  const earthTone = { color: 0x615447, roughness: 0.93, metalness: 0, slate: false };
  const mud = { color: 0xffffff, roughness: 1, metalness: 0, slate: false };
  for (const [input, expected, label] of [
    // The default film slate, with its maps or with the procedural loading/fallback surface.
    [{ film: true, slate: true }, slate, "slate film"],
    // ground=desert, ground=procedural and the ground=earth loading/fallback surface.
    [{ film: true, slate: false }, earthTone, "earth-tone film comparisons"],
    // ground=earth once its maps load: untinted mud maps.
    [{ film: true, slate: false, muddy: true }, mud, "muddy earth"],
    [{ film: true, slate: true, muddy: true }, mud, "mud never takes the slate"],
    // Without film (before activation, legacy or comparison pages).
    [{ film: false, slate: true }, { color: 0x5d6574, roughness: 0.98, metalness: 0.02, slate: false }, "non-film"],
    [{ film: false, slate: false, muddy: true }, mud, "non-film mud"],
  ])
    assert.deepEqual(filmGroundSurface({ ...input, surface }), expected, label);
});

test("both ground shading call sites take the slate flag from the mode-derived surface", async () => {
  const { readFile } = await import("node:fs/promises");
  const index = await readFile(new URL("../src/scene/index.js", import.meta.url), "utf8");
  assert.match(index, /const slateGround = modes\.ground === "slate";/);
  // onGrassChange
  assert.match(
    index,
    /onGrassChange\(grassDetail\) \{[^}]*const \{ slate \} = filmGroundSurface\(\{ muddy: currentGroundMuddy, film: filmActive, slate: slateGround, surface: GROUND_SURFACE_MATERIAL \}\);\s*configureMudShading\(material, currentGroundMuddy, quietSetting, filmActive, currentGrass, \{ slate \}\);/,
  );
  // onDetailChange: tint, roughness and metalness all come from the same surface.
  assert.match(
    index,
    /const surface = filmGroundSurface\(\{ muddy, film: filmActive, slate: slateGround, surface: GROUND_SURFACE_MATERIAL \}\);[^]*?configureMudShading\(material, muddy, quietSetting, filmActive, currentGrass, \{ slate: surface\.slate \}\);[^]*?material\.roughness = surface\.roughness;\s*material\.metalness = surface\.metalness;\s*material\.color\.setHex\(surface\.color\);/,
  );
  assert.equal((index.match(/configureMudShading\(/g) || []).length, 2);
});

test("the wet hollows restate the terrain dune field exactly", async () => {
  const { readFile } = await import("node:fs/promises");
  const vm = await import("node:vm");
  const { configureMudShading, terrainDune, TERRAIN_DUNE_TERMS } = await import("../src/scene/mud-ground.js");
  const window = { BabelSite: {} };
  vm.runInNewContext(await readFile(new URL("../src/scene/helpers.js", import.meta.url), "utf8"), { window, Math });
  const { groundHeight } = window.BabelSite.scene;
  let samples = 0;
  for (let x = -190; x <= 190; x += 7.3)
    for (let z = -190; z <= 190; z += 6.1) {
      // Outside the tower and tree terraces, the ground height is the dune field.
      if (Math.hypot(x, z) < 20 || Math.hypot(x - 55.1, z - 36.1) < 14) continue;
      assert.ok(Math.abs(groundHeight(x, z) - terrainDune(x, z)) < 1e-12, `${x},${z}`);
      samples++;
    }
  assert.ok(samples > 2500);
  // The shader carries the same terms, in world x/z.
  const material = new MeshStandardMaterial();
  configureMudShading(material, false, true, true, null, { slate: true });
  const shader = { uniforms: {}, vertexShader: "#include <begin_vertex>", fragmentShader: FILM_CHUNKS };
  material.onBeforeCompile(shader);
  // Evaluated per vertex (the dune field spans 100+ units over 3-unit quads);
  // fragments read the interpolated height.
  const dune = shader.vertexShader.match(/vSlateDune = (.*);/)[1];
  assert.match(shader.fragmentShader, /varying float vSlateDune;[^]*float slateHollow = 1\.0 - smoothstep\(-3\.2, -1\.0, vSlateDune\);/);
  assert.equal(dune.split(" + ").length, TERRAIN_DUNE_TERMS.length);
  const glsl = new Function("x", "z", `const vMudWorld = { xz: [x, z] };
    const vec2 = (a, b) => [a, b];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
    const { sin, cos } = Math;
    return ${dune};`);
  for (const [x, z] of [[-120, 40], [0, 0], [55.1, 36.1], [73, -91], [150, 150]]) {
    assert.ok(Math.abs(glsl(x, z) - terrainDune(x, z)) < 1e-9, `${x},${z}`);
  }
  material.dispose();
});
