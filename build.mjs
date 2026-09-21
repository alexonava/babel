import { build } from "esbuild";
import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { publishBuild } from "./tools/build-output.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The UI entry stays small for first paint. The scene entry carries Three.js
// and the tower runtime, then main.js loads it after the hero has rendered.
const APP_ENTRY = "src/app.js";
const SCENE_ENTRY = "src/scene-entry.js";
const SCRIPT_ENTRIES = [
  { basename: "app", entry: APP_ENTRY },
  { basename: "scene", entry: SCENE_ENTRY },
];

// Files copied verbatim (no URL rewriting).
const STATIC_FILES = [
  "LICENSE",
  "favicon.svg",
  "icon.svg",
  "icon-maskable.svg",
  "manifest.webmanifest",
  "og.png",
  "robots.txt",
  "llms.txt",
  "sitemap.md",
  "index.md",
  "_headers",
  "_redirects",
];
const STATIC_FILE_ALIASES = [{ source: "site-agents.md", destination: "AGENTS.md" }];
const STATIC_DIRS = ["fonts", "images"];
const FINGERPRINTED_POSTERS = ["scene-poster-landscape.webp", "scene-poster-portrait.webp"];
const FINGERPRINTED_PAPER = [
  "paper-grain.webp",
  "paper-edge.webp",
  "paper-vignette-profile.webp",
  "paper-vignette-experience.webp",
  "paper-vignette-contact.webp",
  "estate-map-desktop.webp",
  "estate-map-portrait.webp",
];
const FINGERPRINTED_ICONS = ["nav-about.webp", "nav-about-active.webp"];
export const BUILD_INPUT_FILES = [
  ...STATIC_FILES,
  ...STATIC_FILE_ALIASES.map(({ source }) => source),
  "index.html",
  "404.html",
  "styles.css",
  "build.mjs",
  "package.json",
  "package-lock.json",
];
export const BUILD_INPUT_DIRS = ["src", ...STATIC_DIRS, "tools"];

const scriptBuildOptions = (entry) => ({
  entryPoints: [join(__dirname, entry)],
  bundle: true,
  minify: true,
  target: "es2022",
  format: "iife",
  legalComments: "none",
  write: false,
});

function sha8(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

async function architectureAssetManifest() {
  const urls = {};
  const files = [];
  for (const tier of ["high", "balanced"]) {
    urls[tier] = {};
    for (const role of ["stairs", "wall", "base", "crown", "tower", "tree"]) {
      const name = role + "-" + tier + ".glb";
      const bytes = await readFile(join(__dirname, "images", "architecture", name));
      const hashedName = name.replace(".glb", "." + sha8(bytes) + ".glb");
      urls[tier][role] = "/images/architecture/" + hashedName;
      files.push({ hashedName, bytes });
    }
  }
  return { urls, files };
}

async function buildScriptBundle(entry, architecture) {
  const options = scriptBuildOptions(entry);
  if (entry === SCENE_ENTRY) {
    options.define = {
      __BABEL_ARCHITECTURE_URLS__: JSON.stringify(
        (architecture ?? (await architectureAssetManifest())).urls,
      ),
    };
  }
  const result = await build(options);
  const out = result.outputFiles?.[0];
  if (!out) throw new Error(`esbuild produced no output for ${entry}`);
  return out.text;
}

function rewriteHtml(src, { appPath, cssPath, scenePath, posterPaths }) {
  // Match source refs with or without a ?v=NNN query,
  // so stale query strings in source can't drift away from the real hashed path.
  let html = src
    .replace(/\/styles\.css(\?v=\d+)?/g, cssPath)
    .replace(/\/scripts\/app\.js(\?v=\d+)?/g, appPath)
    .replace(/\/scripts\/scene\.js(\?v=\d+)?/g, scenePath);
  for (const [sourcePath, hashedPath] of Object.entries(posterPaths)) {
    html = html.replaceAll(sourcePath, hashedPath);
  }
  return html;
}

async function writePayload(DIST_DIR) {
  const DIST_SCRIPTS_DIR = join(DIST_DIR, "scripts");
  const DIST_CSS_DIR = join(DIST_DIR, "css");
  await mkdir(DIST_SCRIPTS_DIR, { recursive: true });
  await mkdir(DIST_CSS_DIR, { recursive: true });
  const architecture = await architectureAssetManifest();
  const fingerprintedImages = new Map();
  for (const name of [...FINGERPRINTED_POSTERS, ...FINGERPRINTED_ICONS, ...FINGERPRINTED_PAPER]) {
    fingerprintedImages.set(name, await readFile(join(__dirname, "images", name)));
  }

  const scriptPaths = {};
  for (const { basename, entry } of SCRIPT_ENTRIES) {
    const bundled = await buildScriptBundle(entry, architecture);
    const scriptHash = sha8(bundled);
    const scriptHashedName = `${basename}.${scriptHash}.js`;
    const scriptHashedUrl = `/scripts/${scriptHashedName}`;
    await writeFile(join(DIST_SCRIPTS_DIR, scriptHashedName), bundled);
    scriptPaths[basename] = scriptHashedUrl;

    const scriptKb = (Buffer.byteLength(bundled) / 1024).toFixed(1);
    console.log(`bundled ${entry} -> scripts/${scriptHashedName} (${scriptKb} kB)`);
  }

  // Git checkouts can use CRLF on Windows; hash and publish the same LF bytes
  // everywhere so a release has one asset URL independent of the build host.
  let cssSrc = (await readFile(join(__dirname, "styles.css"), "utf8")).replace(/\r\n?/g, "\n");
  for (const name of FINGERPRINTED_PAPER) {
    const bytes = fingerprintedImages.get(name);
    cssSrc = cssSrc.replaceAll(
      `/images/${name}`,
      `/images/${name.replace(/\.webp$/, `.${sha8(bytes)}.webp`)}`,
    );
  }
  const cssHash = sha8(cssSrc);
  const cssHashedName = `styles.${cssHash}.css`;
  const cssHashedUrl = `/css/${cssHashedName}`;
  await writeFile(join(DIST_CSS_DIR, cssHashedName), cssSrc);

  await Promise.all(
    STATIC_FILES.map((file) => copyFile(join(__dirname, file), join(DIST_DIR, file))),
  );
  await Promise.all(
    STATIC_FILE_ALIASES.map(({ source, destination }) =>
      copyFile(join(__dirname, source), join(DIST_DIR, destination)),
    ),
  );
  await Promise.all(
    STATIC_DIRS.map((dir) => cp(join(__dirname, dir), join(DIST_DIR, dir), { recursive: true })),
  );

  // Model revisions receive a new URL without invalidating the accepted classic assets.
  for (const { hashedName, bytes } of architecture.files) {
    await writeFile(join(DIST_DIR, "images", "architecture", hashedName), bytes);
  }

  // Keep the stable copies for older HTML while new pages receive a fresh URL
  // whenever poster or navigation icon bytes change, independent of the browser's image cache.
  const posterPaths = {};
  for (const name of [...FINGERPRINTED_POSTERS, ...FINGERPRINTED_ICONS, ...FINGERPRINTED_PAPER]) {
    const bytes = fingerprintedImages.get(name);
    const hashedName = name.replace(/\.webp$/, `.${sha8(bytes)}.webp`);
    await writeFile(join(DIST_DIR, "images", hashedName), bytes);
    posterPaths[`/images/${name}`] = `/images/${hashedName}`;
  }

  for (const name of ["index.html", "404.html"]) {
    const htmlSrc = await readFile(join(__dirname, name), "utf8");
    const rewritten = rewriteHtml(htmlSrc, {
      appPath: scriptPaths.app,
      cssPath: cssHashedUrl,
      scenePath: scriptPaths.scene,
      posterPaths,
    });
    await writeFile(join(DIST_DIR, name), rewritten);
  }

  const today = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://alexnava.me/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
  await writeFile(join(DIST_DIR, "sitemap.xml"), sitemap);

  console.log(`hashed assets: css/${cssHashedName}`);
}

export async function buildDist(
  outputDirectory = join(__dirname, "dist"),
  { retainAssets = false } = {},
) {
  await publishBuild({
    projectRoot: __dirname,
    outputDirectory,
    retainAssets,
    prepare: writePayload,
  });
}

async function main() {
  const args = process.argv.slice(2);
  let mode = "--dist";
  let modeChosen = false;
  let outputDirectory = join(__dirname, "dist");
  let retainAssets = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (["--watch", "--check", "--dist"].includes(arg)) {
      if (modeChosen) throw new Error("Use only one of --watch, --check, or --dist.");
      mode = arg;
      modeChosen = true;
    } else if (arg === "--outdir") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("--outdir requires a directory.");
      outputDirectory = resolve(__dirname, value);
    } else if (arg === "--retain-assets") retainAssets = true;
    else throw new Error(`Unknown build option: ${arg}`);
  }
  if (mode === "--watch") {
    const { runWatch } = await import("./tools/watch.mjs");
    await runWatch({
      projectRoot: __dirname,
      outputDirectory,
      files: BUILD_INPUT_FILES,
      directories: BUILD_INPUT_DIRS,
    });
  } else if (mode === "--check") {
    for (const { entry } of SCRIPT_ENTRIES) await buildScriptBundle(entry);
    console.log(`verified ${SCRIPT_ENTRIES.map(({ entry }) => entry).join(", ")}`);
  } else {
    await buildDist(outputDirectory, { retainAssets });
    console.log(`built deployable ${outputDirectory}`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await main();
