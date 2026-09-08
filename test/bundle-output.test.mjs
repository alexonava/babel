import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, readdir, readFile, stat } from "node:fs/promises";
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

test("built HTML references fingerprinted responsive scene posters", async () => {
  const html = await readFile(path.join(distDir, "index.html"), "utf8");
  const posterPaths = [
    ...html.matchAll(/\/images\/(scene-poster-(?:landscape|portrait)\.[a-f0-9]{8}\.webp)/g),
  ].map((match) => match[1]);

  assert.deepEqual(
    posterPaths
      .map((name) => name.replace(/\.[a-f0-9]{8}(?=\.webp$)/, ""))
      .sort(),
    ["scene-poster-landscape.webp", "scene-poster-portrait.webp"],
    "both responsive poster variants are fingerprinted exactly once",
  );
  assert.doesNotMatch(
    html,
    /\/images\/scene-poster-(?:landscape|portrait)\.webp(?:\?v=\d+)?/,
    "stable poster URLs are removed from built HTML",
  );
  await Promise.all(posterPaths.map((name) => access(path.join(distDir, "images", name))));
});
