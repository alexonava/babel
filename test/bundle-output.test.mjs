import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");
const scriptsDir = path.join(distDir, "scripts");

await execFileP(process.execPath, ["build.mjs", "--dist"], { cwd: projectRoot });

async function findHashedScript(prefix) {
  const entries = await readdir(scriptsDir);
  const match = entries.find((name) => name.startsWith(`${prefix}.`) && name.endsWith(".js"));
  if (!match) throw new Error(`no built bundle for ${prefix}.*.js in ${scriptsDir}`);
  return path.join(scriptsDir, match);
}

test("UI bundle stays under the LCP budget", async () => {
  const file = await findHashedScript("app");
  const { size } = await stat(file);
  const kb = size / 1024;
  assert.ok(kb < 30, `app bundle is ${kb.toFixed(1)} kB; budget is 30 kB`);
});

test("scene bundle stays under the deferred-payload budget", async () => {
  const file = await findHashedScript("scene");
  const { size } = await stat(file);
  const kb = size / 1024;
  // Budget bumped from 800 to 810 kB when EffectComposer + OutlinePass were
  // added for developer-mode outline highlighting (~+24 kB observed).
  assert.ok(kb < 810, `scene bundle is ${kb.toFixed(1)} kB; budget is 810 kB`);
});

test("Three.js does not leak into the UI bundle", async () => {
  const file = await findHashedScript("app");
  const text = await readFile(file, "utf8");
  // GLSL fragments are string literals in three.js shader chunks and survive
  // minification — their presence in the UI bundle means the split regressed.
  assert.doesNotMatch(text, /gl_Position/, "app bundle contains Three.js GLSL");
});

test("authored material requests stay inside the deferred scene bundle", async () => {
  const app = await readFile(await findHashedScript("app"), "utf8");
  const scene = await readFile(await findHashedScript("scene"), "utf8");
  assert.doesNotMatch(app, /images\/materials\/stone-/);
  assert.match(scene, /images\/materials\/stone-/);
  assert.doesNotMatch(app, /images\/materials\/ground-/);
  assert.match(scene, /images\/materials\/ground-/);
});

test("authored material pairs fit transfer budgets and are copied intact into dist", async () => {
  for (const [prefix, kinds, budgets] of [
    ["stone", ["color", "roughness"], { 1024: 750 * 1024, 512: 256 * 1024 }],
    ["ground", ["color", "normal"], { 1024: 640 * 1024, 512: 224 * 1024 }],
  ]) {
    for (const [size, budget] of Object.entries(budgets)) {
      let bytes = 0;
      for (const kind of kinds) {
        const relative = path.join("images", "materials", `${prefix}-${kind}-${size}.webp`);
        const source = await readFile(path.join(projectRoot, relative));
        const published = await readFile(path.join(distDir, relative));
        assert.ok(source.length > 0);
        assert.equal(source.toString("ascii", 8, 12), "WEBP", `${relative} must be WebP`);
        assert.deepEqual(published, source);
        bytes += source.length;
      }
      assert.ok(bytes <= budget, `${size} ${prefix} pair is ${bytes} bytes; budget ${budget}`);
    }
  }
});

test("construction geometry requests and BRK1 decoder stay inside the deferred scene bundle", async () => {
  const app = await readFile(await findHashedScript("app"), "utf8");
  const scene = await readFile(await findHashedScript("scene"), "utf8");
  for (const marker of [
    /images\/materials\/stone-brick\.bin/,
    /images\/materials\/stone-tread\.bin/,
    /Invalid BRK1 brick geometry/,
  ]) {
    assert.doesNotMatch(app, marker, "geometry loading or decoding leaked into the UI bundle");
    assert.match(scene, marker, "deferred scene is missing a geometry loader or decoder");
  }
});

test("shared brick and tread fit the combined detail transfer budgets", async () => {
  const relative = path.join("images", "materials", "stone-brick.bin");
  const source = await readFile(path.join(projectRoot, relative));
  const published = await readFile(path.join(distDir, relative));
  assert.equal(source.toString("ascii", 0, 4), "BRK1");
  assert.ok(
    source.length > 8 && source.length < 48 * 1024,
    `brick binary is ${source.length} bytes`,
  );
  assert.deepEqual(published, source);
  const treadBytes = (await stat(path.join(distDir, "images", "materials", "stone-tread.bin")))
    .size;

  for (const [size, budget] of [
    [1024, 750 * 1024],
    [512, 256 * 1024],
  ]) {
    let bytes = source.length + treadBytes;
    for (const kind of ["color", "roughness"]) {
      const map = path.join(distDir, "images", "materials", `stone-${kind}-${size}.webp`);
      bytes += (await stat(map)).size;
    }
    assert.ok(
      bytes <= budget,
      `${size} maps plus shared brick and tread are ${bytes} bytes; budget ${budget}`,
    );
  }
});

test("the shared tread is at most 200 triangles and crown reuse adds no geometry asset", async () => {
  const relative = path.join("images", "materials", "stone-tread.bin");
  const source = await readFile(path.join(projectRoot, relative));
  assert.ok(source.length >= 8 && source.length <= 9608, `tread is ${source.length} bytes`);
  assert.equal(source.toString("ascii", 0, 4), "BRK1");
  const vertices = source.readUInt32LE(4);
  assert.ok(
    vertices > 0 && vertices % 3 === 0 && vertices <= 600,
    `${vertices / 3} tread triangles`,
  );
  assert.equal(source.length, 8 + vertices * 16, "BRK1 attributes must match the vertex count");
  assert.deepEqual(await readFile(path.join(distDir, relative)), source);
  const binaries = (await readdir(path.join(distDir, "images", "materials"))).filter((name) =>
    /\.(bin|glb|gltf)$/i.test(name),
  );
  assert.deepEqual(binaries.sort(), ["stone-brick.bin", "stone-tread.bin"]);
});

test("published responsive posters use content hashes and retain intact compatibility copies", async () => {
  const html = await readFile(path.join(distDir, "index.html"), "utf8");
  const expectedNames = [];
  for (const [orientation, attribute] of [
    ["landscape", "src"],
    ["portrait", "srcset"],
  ]) {
    const stableName = `scene-poster-${orientation}.webp`;
    const source = await readFile(path.join(projectRoot, "images", stableName));
    const hash = createHash("sha256").update(source).digest("hex").slice(0, 8);
    const hashedName = `scene-poster-${orientation}.${hash}.webp`;
    expectedNames.push(hashedName);
    assert.ok(html.includes(`${attribute}="/images/${hashedName}"`), "first paint references the current responsive poster hash");
    assert.deepEqual(await readFile(path.join(distDir, "images", hashedName)), source);
    assert.deepEqual(await readFile(path.join(distDir, "images", stableName)), source);
  }
  const emittedNames = (await readdir(path.join(distDir, "images"))).filter((name) =>
    /^scene-poster-(landscape|portrait)\.[a-f0-9]{8}\.webp$/.test(name),
  );
  assert.deepEqual(emittedNames.sort(), expectedNames.sort());
  assert.doesNotMatch(html, /\/images\/scene-poster-(landscape|portrait)\.webp/);
});

test("changing only fixture poster bytes changes only that poster URL", async () => {
  const scratchRoot = path.join(projectRoot, ".tmp-preview-review");
  await mkdir(scratchRoot, { recursive: true });
  const fixture = await mkdtemp(path.join(scratchRoot, "poster-build-"));
  const sourcePath = path.join(projectRoot, "images", "scene-poster-landscape.webp");
  const sourceBefore = await readFile(sourcePath);
  try {
    // Reuse the sanitized static payload; only the actual build script and its
    // unrewritten HTML/CSS inputs are copied from source. No user data or deps.
    await cp(distDir, fixture, { recursive: true });
    for (const file of ["build.mjs", "index.html", "404.html", "styles.css", "site-agents.md"]) {
      await cp(path.join(projectRoot, file), path.join(fixture, file));
    }
    await mkdir(path.join(fixture, "src"));
    await writeFile(path.join(fixture, "src", "app.js"), "void 0;");
    await writeFile(path.join(fixture, "src", "scene-entry.js"), "void 0;");
    async function posterUrls() {
      await execFileP(process.execPath, ["build.mjs", "--dist"], { cwd: fixture });
      const html = (await readdir(path.join(fixture, "dist", "images"))).map(name => `/images/${name}`).join(" ");
      return Object.fromEntries(
        ["landscape", "portrait"].map((orientation) => [
          orientation,
          html.match(new RegExp(`/images/scene-poster-${orientation}\\.[a-f0-9]{8}\\.webp`))?.[0],
        ]),
      );
    }
    const before = await posterUrls();
    assert.ok(before.landscape && before.portrait);
    const changed = Buffer.concat([sourceBefore, Buffer.from("fixture-only-poster-change")]);
    await writeFile(path.join(fixture, "images", "scene-poster-landscape.webp"), changed);
    const after = await posterUrls();
    const changedHash = createHash("sha256").update(changed).digest("hex").slice(0, 8);
    assert.equal(after.landscape, `/images/scene-poster-landscape.${changedHash}.webp`);
    assert.notEqual(after.landscape, before.landscape);
    assert.equal(after.portrait, before.portrait);
    assert.deepEqual(await readFile(sourcePath), sourceBefore, "tracked poster must not change");
  } finally {
    assert.equal(path.dirname(path.resolve(fixture)), scratchRoot);
    await rm(fixture, { recursive: true, force: true });
  }
});

test("architecture stays deferred and each selected model fits both tier budgets", async () => {
  const app = await readFile(await findHashedScript("app"), "utf8");
  const scene = await readFile(await findHashedScript("scene"), "utf8");
  assert.doesNotMatch(app, /images\/architecture\//);
  for (const [tier, limit] of [
    ["high", 6 * 1024 * 1024],
    ["balanced", 3 * 1024 * 1024],
  ]) {
    const bytesByRole = {};
    for (const role of ["stairs", "wall", "base", "crown", "tower", "tree"]) {
      const name = role + "-" + tier + ".glb";
      const source = await readFile(path.join(projectRoot, "images", "architecture", name));
      const hash = createHash("sha256").update(source).digest("hex").slice(0, 8);
      const hashedName = role + "-" + tier + "." + hash + ".glb";
      assert.deepEqual(
        await readFile(path.join(distDir, "images", "architecture", hashedName)),
        source,
      );
      assert.ok(
        scene.includes("/images/architecture/" + hashedName),
        "scene must request the current fingerprint",
      );
      assert.equal(source.toString("ascii", 0, 4), "glTF");
      assert.equal(source.readUInt32LE(8), source.length);
      const gltf = JSON.parse(source.toString("utf8", 20, 20 + source.readUInt32LE(12)));
      assert.equal(gltf.meshes.length, 1, name + " should have one shared mesh");
      assert.equal(gltf.meshes[0].primitives.length, 1, name + " should have one shared material");
      assert.ok(gltf.images.length > 0, name + " must retain source surface detail");
      for (const resource of [...gltf.images, ...gltf.buffers])
        assert.equal(resource.uri, undefined);
      assert.equal(gltf.animations?.length || 0, 0);
      const primitive = gltf.meshes[0].primitives[0];
      assert.equal(primitive.mode ?? 4, 4, "triangle topology required");
      for (const semantic of ["POSITION", "NORMAL", "TEXCOORD_0"])
        assert.ok(Number.isInteger(primitive.attributes[semantic]));
      bytesByRole[role] = source.length;
    }
    // The authored ground pair loads alongside either supplied model set.
    const groundSize = tier === "high" ? 1024 : 512;
    let groundBytes = 0;
    for (const kind of ["color", "normal"]) {
      const file = path.join(projectRoot, "images", "materials", `ground-${kind}-${groundSize}.webp`);
      groundBytes += (await stat(file)).size;
    }
    for (const [model, roles] of Object.entries({
      assembled: ["stairs", "wall", "base", "crown", "tree"],
      complete: ["tower", "tree"],
    })) {
      const total = roles.reduce((sum, role) => sum + bytesByRole[role], groundBytes);
      assert.ok(
        total <= limit,
        tier + " " + model + " architecture plus ground is " + total + " bytes; budget " + limit,
      );
    }
  }
});


test("filmic earth maps are deferred and fit both material and complete-scene budgets", async () => {
  const app=await readFile(await findHashedScript("app"),"utf8");assert.doesNotMatch(app,/earth-(?:color|normal|roughness)/);
  for(const [tier,size,limit,totalLimit] of [["high",1024,600*1024,6*1024*1024],["balanced",512,200*1024,3*1024*1024]]) {
    let bytes=0;
    for(const kind of ["color","normal","roughness"]) {
      const file=`earth-${kind}-${size}.webp`,source=await readFile(path.join(projectRoot,"images","materials",file));
      assert.equal(source.toString("ascii",8,12),"WEBP");assert.deepEqual(await readFile(path.join(distDir,"images","materials",file)),source);bytes+=source.length;
    }
    assert.ok(bytes<=limit,`${tier} earth: ${bytes}`);
    for(const role of ["tower","tree"])bytes+=(await stat(path.join(projectRoot,"images","architecture",`${role}-${tier}.glb`))).size;
    assert.ok(bytes<=totalLimit,`${tier} scene: ${bytes}`);
  }
});

test("grass color/mask maps are deferred and fit both their own and the complete-scene budgets", async () => {
  const app=await readFile(await findHashedScript("app"),"utf8");assert.doesNotMatch(app,/grass-(?:color|mask)/);
  for(const [tier,size,limit,totalLimit] of [["high",1024,250*1024,6*1024*1024],["balanced",512,90*1024,3*1024*1024]]) {
    let bytes=0;
    for(const kind of ["color","mask"]) {
      const file=`grass-${kind}-${size}.webp`,source=await readFile(path.join(projectRoot,"images","materials",file));
      assert.equal(source.toString("ascii",8,12),"WEBP");assert.deepEqual(await readFile(path.join(distDir,"images","materials",file)),source);bytes+=source.length;
    }
    assert.ok(bytes<=limit,`${tier} grass: ${bytes}`);
    for(const role of ["tower","tree"])bytes+=(await stat(path.join(projectRoot,"images","architecture",`${role}-${tier}.glb`))).size;
    for(const kind of ["color","normal","roughness"])bytes+=(await stat(path.join(projectRoot,"images","materials",`earth-${kind}-${size}.webp`))).size;
    assert.ok(bytes<=totalLimit,`${tier} scene incl. earth+grass: ${bytes}`);
  }
});

test("homepage discovers the deferred scene while its UI excludes the renderer and model loading", async () => {
  const html = await readFile(path.join(distDir, "index.html"), "utf8");
  const app = await readFile(await findHashedScript("app"), "utf8");
  const sceneName = path.basename(await findHashedScript("scene"));
  assert.ok(html.includes(`content="/scripts/${sceneName}" data-scene-script`));
  assert.doesNotMatch(html, /<script[^>]*src="[^\"]*scene[.]/);
  assert.match(app, /ensureSceneReady|initHomeScene/);
  assert.match(app, /getWebGLCapabilities/);
  assert.match(app, /initSceneMenu/);
  assert.doesNotMatch(app, /gl_Position|WebGLRenderer|GLTFLoader|images\/architecture\//);
});

test("About model icon states are fingerprinted and emitted intact", async () => {
  const html = await readFile(path.join(distDir, "index.html"), "utf8");
  let total = 0;
  for (const name of ["nav-about", "nav-about-active"]) {
    const bytes = await readFile(path.join(projectRoot, "images", `${name}.webp`));
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
    total += bytes.length;
    const hashedName = `${name}.${hash}.webp`;
    assert.ok(html.includes(`src="/images/${hashedName}"`));
    assert.ok(!html.includes(`src="/images/${name}.webp"`));
    assert.deepEqual(await readFile(path.join(distDir, "images", hashedName)), bytes);
  }
  assert.ok(total <= 80 * 1024);
  assert.doesNotMatch(html, /nav-contact|Leather_Envelope|Stylized_3D/);
});

test("paper textures are fingerprinted in CSS and stay under 200 KiB combined", async () => {
  const cssDir = path.join(distDir, "css");
  const cssName = (await readdir(cssDir)).find((name) => /^styles\.[a-f0-9]{8}\.css$/.test(name));
  const css = await readFile(path.join(cssDir, cssName), "utf8");
  assert.equal(cssName, `styles.${createHash("sha256").update(css).digest("hex").slice(0, 8)}.css`);
  let total = 0;
  for (const name of ["paper-grain", "paper-edge"]) {
    const source = await readFile(path.join(projectRoot, "images", `${name}.webp`));
    total += source.length;
    const hash = createHash("sha256").update(source).digest("hex").slice(0, 8);
    assert.ok(css.includes(`/images/${name}.${hash}.webp`));
    assert.ok(!css.includes(`/images/${name}.webp`));
    assert.deepEqual(await readFile(path.join(distDir, "images", `${name}.${hash}.webp`)), source);
  }
  assert.ok(total <= 200 * 1024, `${total} bytes of paper textures exceeds budget`);
});


test("estate map artwork is hashed, responsive and under 200 KiB combined", async () => {
  const cssName = (await readdir(path.join(distDir, "css"))).find(n => /^styles\.[a-f0-9]{8}\.css$/.test(n));
  const css = await readFile(path.join(distDir, "css", cssName), "utf8");
  let total = 0;
  for (const name of ["estate-map-desktop", "estate-map-portrait"]) {
    const bytes = await readFile(path.join(projectRoot, "images", name + ".webp"));
    total += bytes.length;
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0,8);
    assert.ok(css.includes(`/images/${name}.${hash}.webp`));
    assert.deepEqual(await readFile(path.join(distDir,"images",`${name}.${hash}.webp`)),bytes);
  }
  assert.ok(total <= 200 * 1024);
});
