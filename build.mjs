import { build, context } from "esbuild";
import { watch as watchFiles } from "node:fs";
import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The UI entry stays small for first paint. The scene entry carries Three.js
// and the tower runtime, then main.js loads it after the hero has rendered.
const APP_ENTRY = "src/app.js";
const SCENE_ENTRY = "src/scene-entry.js";
const SCRIPT_ENTRIES = [
  { basename: "app", entry: APP_ENTRY },
  { basename: "scene", entry: SCENE_ENTRY },
];

const args = new Set(process.argv.slice(2));
const watch = args.has("--watch");
const check = args.has("--check");
const dist = args.has("--dist");

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
const DIST_DIR = join(__dirname, "dist");
const DIST_SCRIPTS_DIR = join(DIST_DIR, "scripts");
const DIST_CSS_DIR = join(DIST_DIR, "css");

if ((watch && check) || (watch && dist) || (check && dist)) {
  throw new Error("Use only one of --watch, --check, or --dist.");
}

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

// In watch mode each entry gets a persistent esbuild context so subsequent
// rebuilds reuse the dependency-graph cache instead of paying cold-start cost
// every time a source file is saved. One-shot paths (--check, --dist) stay
// on the simple build() call so they don't have to manage a context lifecycle.
const scriptContexts = new Map();

async function buildScriptBundle(entry) {
  const ctx = scriptContexts.get(entry);
  const result = ctx ? await ctx.rebuild() : await build(scriptBuildOptions(entry));
  const out = result.outputFiles?.[0];
  if (!out) throw new Error(`esbuild produced no output for ${entry}`);
  return out.text;
}

async function openScriptContexts() {
  for (const { entry } of SCRIPT_ENTRIES) {
    scriptContexts.set(entry, await context(scriptBuildOptions(entry)));
  }
}

async function closeScriptContexts() {
  await Promise.all([...scriptContexts.values()].map((ctx) => ctx.dispose()));
  scriptContexts.clear();
}

function rewriteHtml(src, { appPath, cssPath, scenePath }) {
  // Match source refs with or without a ?v=NNN query,
  // so stale query strings in source can't drift away from the real hashed path.
  return src
    .replace(/\/styles\.css(\?v=\d+)?/g, cssPath)
    .replace(/\/scripts\/app\.js(\?v=\d+)?/g, appPath)
    .replace(/\/scripts\/scene\.js(\?v=\d+)?/g, scenePath);
}

async function clearDist() {
  // Empty dist/ contents without removing the dir itself — a live preview
  // server (python http.server) can hold the dir handle open on Windows.
  await mkdir(DIST_DIR, { recursive: true });
  const entries = await readdir(DIST_DIR);
  await Promise.all(
    entries.map((entry) => rm(join(DIST_DIR, entry), { recursive: true, force: true })),
  );
}

async function buildDist() {
  await clearDist();
  await mkdir(DIST_SCRIPTS_DIR, { recursive: true });
  await mkdir(DIST_CSS_DIR, { recursive: true });

  const scriptPaths = {};
  for (const { basename, entry } of SCRIPT_ENTRIES) {
    const bundled = await buildScriptBundle(entry);
    const scriptHash = sha8(bundled);
    const scriptHashedName = `${basename}.${scriptHash}.js`;
    const scriptHashedUrl = `/scripts/${scriptHashedName}`;
    await writeFile(join(DIST_SCRIPTS_DIR, scriptHashedName), bundled);
    scriptPaths[basename] = scriptHashedUrl;

    const scriptKb = (Buffer.byteLength(bundled) / 1024).toFixed(1);
    console.log(`bundled ${entry} -> scripts/${scriptHashedName} (${scriptKb} kB)`);
  }

  const cssSrc = await readFile(join(__dirname, "styles.css"));
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

  for (const name of ["index.html", "404.html"]) {
    const htmlSrc = await readFile(join(__dirname, name), "utf8");
    const rewritten = rewriteHtml(htmlSrc, {
      appPath: scriptPaths.app,
      cssPath: cssHashedUrl,
      scenePath: scriptPaths.scene,
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

function watchSourceTree() {
  let timer = null;
  const sourceRoot = join(__dirname, "src");
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await buildDist();
        console.log("rebuilt dist/");
      } catch (err) {
        console.error(err);
      }
    }, 120);
  };

  const watcher = watchFiles(sourceRoot, { recursive: true }, rebuild);
  const shutdown = async () => {
    watcher.close();
    await closeScriptContexts();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (watch) {
  await openScriptContexts();
  await buildDist();
  watchSourceTree();
  console.log("watching src/ (rerun build:dist after static asset changes)");
  await new Promise(() => {});
} else if (check) {
  for (const { entry } of SCRIPT_ENTRIES) {
    await buildScriptBundle(entry);
  }
  console.log(`verified ${SCRIPT_ENTRIES.map(({ entry }) => entry).join(", ")}`);
} else {
  await buildDist();
  console.log("built deployable dist/");
}
