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
});

test("authored material pairs fit transfer budgets and are copied intact into dist", async () => {
  for (const [size, budget] of [
    [1024, 750 * 1024],
    [512, 256 * 1024],
  ]) {
    let bytes = 0;
    for (const kind of ["color", "roughness"]) {
      const relative = path.join("images", "materials", `stone-${kind}-${size}.webp`);
      const source = await readFile(path.join(projectRoot, relative));
      const published = await readFile(path.join(distDir, relative));
      assert.ok(source.length > 0);
      assert.deepEqual(published, source);
      bytes += source.length;
    }
    assert.ok(bytes <= budget, `${size} material pair is ${bytes} bytes; budget ${budget}`);
  }
});

test("brick request and BRK1 decoder stay inside the deferred scene bundle", async () => {
  const app = await readFile(await findHashedScript("app"), "utf8");
  const scene = await readFile(await findHashedScript("scene"), "utf8");
  for (const marker of [/images\/materials\/stone-brick\.bin/, /Invalid BRK1 brick geometry/]) {
    assert.doesNotMatch(app, marker, "brick loading or decoding leaked into the UI bundle");
    assert.match(scene, marker, "deferred scene is missing the brick loader or decoder");
  }
});

test("shared brick binary is copied intact and fits the combined detail transfer budgets", async () => {
  const relative = path.join("images", "materials", "stone-brick.bin");
  const source = await readFile(path.join(projectRoot, relative));
  const published = await readFile(path.join(distDir, relative));
  assert.equal(source.toString("ascii", 0, 4), "BRK1");
  assert.ok(
    source.length > 8 && source.length < 48 * 1024,
    `brick binary is ${source.length} bytes`,
  );
  assert.deepEqual(published, source);

  for (const [size, budget] of [
    [1024, 750 * 1024],
    [512, 256 * 1024],
  ]) {
    let bytes = source.length;
    for (const kind of ["color", "roughness"]) {
      const map = path.join(distDir, "images", "materials", `stone-${kind}-${size}.webp`);
      bytes += (await stat(map)).size;
    }
    assert.ok(
      bytes <= budget,
      `${size} maps plus shared brick are ${bytes} bytes; budget ${budget}`,
    );
  }
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
    assert.ok(html.includes(`${attribute}="/images/${hashedName}"`));
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
      const html = await readFile(path.join(fixture, "dist", "index.html"), "utf8");
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
