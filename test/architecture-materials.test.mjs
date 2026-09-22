import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import { createCompleteTowerArchitecture, createTreeArchitecture } from "../src/scene/architecture.js";

function sourceAsset(mapped) {
  const scene = new Group(),
    material = new MeshStandardMaterial({ roughness: 0.85 }),
    geometry = new BoxGeometry(1, 2, 1);
  material.map = new Texture();
  if (mapped) {
    material.normalMap = new Texture();
    material.roughnessMap = new Texture();
  }
  scene.add(new Mesh(geometry, material));
  const resources = [geometry, material, material.map, material.normalMap, material.roughnessMap].filter(Boolean);
  let disposals = 0;
  for (const resource of resources) resource.addEventListener("dispose", () => disposals++);
  return { scene, geometry, material, resources, get disposals() { return disposals; } };
}

function materialShader(material) {
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <roughnessmap_fragment>\n#include <map_fragment>",
  };
  material.onBeforeCompile(shader);
  return shader;
}

test("mapless tower retains direct matte response and borrowed atlas across film toggles", () => {
  const source = sourceAsset(false),
    originalUv = source.geometry.attributes.uv.array.slice(),
    tower = createCompleteTowerArchitecture({ asset: source }),
    mesh = tower.root.getObjectByName("complete-meshy-tower"),
    material = mesh.material,
    shader = materialShader(material);
  assert.notEqual(material, source.material);
  assert.equal(material.roughness, 0.9);
  assert.equal(material.map, source.material.map);
  assert.equal(material.normalMap, null);
  assert.equal(material.roughnessMap, null);
  assert.match(shader.fragmentShader, /#include <roughnessmap_fragment>/);
  assert.doesNotMatch(shader.fragmentShader, /roughnessFactor\s*=/,
    "no shader remap may lift a mapless scalar toward one");
  for (const active of [true, false, true, false]) {
    tower.setFilmTreatment(active);
    assert.equal(material.roughness, 0.9);
    assert.equal(material.emissive.getHex(), 0);
    assert.equal(shader.uniforms.babelFilm.value, Number(active));
    assert.equal(mesh.material, material);
  }
  assert.equal(source.material.roughness, 0.85);
  assert.deepEqual(mesh.geometry.attributes.uv.array, originalUv);
  assert.deepEqual(source.geometry.attributes.uv.array, originalUv);
  assert.equal(tower.dispose(), true);
  assert.equal(tower.dispose(), false);
  assert.equal(source.disposals, 0);
  source.resources.forEach((resource) => resource.dispose());
});

test("tree preserves mapped roughness variation and texture ownership through quality and film changes", () => {
  const source = sourceAsset(true),
    tree = createTreeArchitecture({ asset: source, groundHeight: () => 0 }),
    material = tree.root.getObjectByName("meshy-tree").material,
    shader = materialShader(material);
  assert.equal(material.roughness, 1, "do not attenuate the source map before its bounded remap");
  assert.equal(material.roughnessMap, source.material.roughnessMap);
  assert.equal(material.normalMap, source.material.normalMap);
  assert.equal(material.map, source.material.map);
  assert.deepEqual(material.normalScale.toArray(), [0.46, 0.46]);
  const remap = shader.fragmentShader.match(/roughnessFactor = mix\(([\d.]+), ([\d.]+), roughnessFactor\);/);
  assert.ok(remap, "the compiled material must bound the map's roughness");
  const floor = Number(remap[1]), ceiling = Number(remap[2]);
  assert.equal(floor, 0.84);
  assert.equal(ceiling, 0.97);
  assert.ok(Math.abs((floor + ceiling) / 2 - 0.905) < 1e-12);
  for (const tier of ["balanced", "low", "high"]) {
    tree.setFilmTreatment(true);
    tree.applyQuality({ tier });
    assert.equal(material.emissiveIntensity, 0.04, "no added tree glow");
    assert.equal(material.roughnessMap, source.material.roughnessMap);
    assert.equal(material.roughness, 1);
    tree.setFilmTreatment(false);
    assert.equal(material.emissiveIntensity, 0.22);
    assert.equal(shader.uniforms.babelFilm.value, 0);
  }
  assert.equal(source.material.roughness, 0.85);
  assert.equal(tree.dispose(), true);
  assert.equal(tree.dispose(), false);
  assert.equal(source.disposals, 0);
  source.resources.forEach((resource) => resource.dispose());
});
