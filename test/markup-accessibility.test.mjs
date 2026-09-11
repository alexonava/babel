import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, "..");

async function readIndexHtml() {
  return readFile(path.join(projectRoot, "index.html"), "utf8");
}

async function readStyles() {
  return readFile(path.join(projectRoot, "styles.css"), "utf8");
}

function collectMatches(regex, source) {
  const out = [];
  for (const match of source.matchAll(regex)) out.push(match[1]);
  return out;
}

test("every aria-controls target resolves to an element id in the same document", async () => {
  const html = await readIndexHtml();
  const controls = collectMatches(/aria-controls="([^"]+)"/g, html);
  assert.ok(controls.length > 0, "sanity: fixture exposes aria-controls");

  for (const targetId of controls) {
    const idAttr = new RegExp(`id="${targetId}"`);
    assert.match(html, idAttr, `aria-controls="${targetId}" has no matching element`);
  }
});

test("every aria-labelledby reference resolves to an element id", async () => {
  const html = await readIndexHtml();
  const refs = collectMatches(/aria-labelledby="([^"]+)"/g, html);
  assert.ok(refs.length > 0);
  for (const targetId of refs) {
    assert.match(html, new RegExp(`id="${targetId}"`), `aria-labelledby="${targetId}" missing`);
  }
});

test("the skip-link points at an id that exists on the page", async () => {
  const html = await readIndexHtml();
  const skipMatch = html.match(/class="skip-link"\s+href="#([^"]+)"/);
  assert.ok(skipMatch, "skip-link is present");
  assert.match(html, new RegExp(`id="${skipMatch[1]}"`));
});

test("About and estate buttons have accessible names and reference their dialogs", async () => {
  const html = await readIndexHtml();
  const buttonBlocks = html.match(/<button[^>]*class="bottom-btn[^"]*"[^>]*>/g) || [];
  assert.ok(buttonBlocks.length === 4, "About and its three destinations expose dialog buttons");
  for (const block of buttonBlocks) {
    assert.match(block, /aria-label="[^"]+"/, `bottom-bar button is missing aria-label: ${block}`);
    assert.match(
      block,
      /aria-expanded="(true|false)"/,
      "bottom-bar button tracks aria-expanded state",
    );
    assert.match(
      block,
      /aria-controls="[^"]+"/,
      "bottom-bar button references the panel it toggles",
    );
  }
});

test("modal overlays declare dialog semantics and start hidden", async () => {
  const html = await readIndexHtml();
  const overlayBlocks = html.match(/<div[^>]*class="panel-overlay"[\s\S]*?>/g) || [];
  assert.ok(overlayBlocks.length === 4, "About and its three categories each expose a dialog");
  for (const block of overlayBlocks) {
    assert.match(block, /role="dialog"/);
    assert.match(block, /aria-modal="true"/);
    assert.match(block, /aria-labelledby="/);
    assert.match(block, /\shidden(\s|>)/);
  }
});

test("all estate panels share the parchment frame without decorative monograms or seals", async () => {
  const html = await readIndexHtml();
  const sharedFrames =
    html.match(/class="[^"]*\bpanel-parchment\b[^"]*\bpanel-surface\b[^"]*"/g) || [];

  assert.equal(
    sharedFrames.length,
    3,
    "all panels use the shared panel-parchment + panel-surface frame",
  );
  assert.doesNotMatch(html, /class="panel-parchment__watermark"/);
  assert.doesNotMatch(html, /class="panel-parchment__seal"/);
  assert.doesNotMatch(html, /panel-object-stage/, "the 3D panel-object stage is removed");
  assert.doesNotMatch(html, /data-panel-object/);
  assert.doesNotMatch(html, /panel-parchment--notebook/, "metaphor-named modifiers are gone");
  assert.doesNotMatch(html, /panel-parchment--letter/);
  assert.doesNotMatch(html, /panel-art-about/);
  assert.doesNotMatch(html, /panel-art-contact/);
  assert.doesNotMatch(html, /panel-parchment__rail/);
  assert.doesNotMatch(html, /panel-notebook/);
  assert.doesNotMatch(html, /panel-letter/);
  assert.doesNotMatch(html, /panel-letter__quill/);
});

test("the scene is the landing content and the estate starts inside the hidden About dialog", async () => {
  const html = await readIndexHtml();
  assert.match(html, /<body class="scene-home">/);
  assert.match(html, /<main[^>]*id="main"[^>]*tabindex="-1"/);
  assert.match(html, /<div class="scene-shell" aria-hidden="true">/);
  assert.match(html, /id="home-scene" class="scene-canvas"/);
  const main = html.match(/<main[\s\S]*?<\/main>/)[0];
  assert.match(main, /id="home" class="hero section"/);
  assert.doesNotMatch(main, /class="estate-map"|class="estate-destinations"/);
  assert.match(html, /id="panel-about"[^>]* hidden>[\s\S]*?class="estate-destinations"/);
  assert.match(html, /class="panel-close" aria-label="Close About"/);
  assert.equal((html.match(/class="panel-close panel-back" aria-label="Back to About"/g) || []).length, 3);
});

test("responsive scene posters paint before the deferred renderer and developer HUD stays hidden", async () => {
  const html = await readIndexHtml();
  assert.match(html, /<picture class="scene-poster" aria-hidden="true">/);
  assert.match(html, /media="\(orientation: portrait\)"[\s\S]*?srcset="\/images\/scene-poster-portrait\.webp"/);
  assert.match(html, /src="\/images\/scene-poster-landscape\.webp"[\s\S]*?alt=""[\s\S]*?loading="eager"[\s\S]*?fetchpriority="high"/);
  assert.match(html, /<aside[^>]*id="dev-mode-hud"[^>]* hidden aria-hidden="true"/);
  assert.doesNotMatch(html, /loading-ritual/);
});

test("estate layers preserve artwork proportions without masking labels", async () => {
  const css = await readStyles();
  assert.match(css, /aspect-ratio: 3 \/ 2/);
  assert.match(css, /aspect-ratio: 2 \/ 3/);
  assert.match(css, /\.estate-home-map \.estate-map::before/);
  assert.match(css, /\.scene-entry\[hidden\], \[data-scene-fallback\]\[hidden\] \{ display: none; \}/);
});

test("external links that open in a new tab declare rel=noopener", async () => {
  const html = await readIndexHtml();
  const externalAnchors = html.match(/<a[^>]*target="_blank"[^>]*>/g) || [];
  for (const anchor of externalAnchors) {
    assert.match(anchor, /rel="[^"]*noopener[^"]*"/, `target="_blank" without noopener: ${anchor}`);
  }
});

test("fallback About link and matching category copy remain usable before scene menu initialization", async () => {
  const html = await readIndexHtml();
  assert.match(html, /<h1>[\s\S]*?class="hero-word">Alex<\/span>[\s\S]*?class="hero-word">Nava<\/span>[\s\S]*?<\/h1>/);
  assert.doesNotMatch(html, /<noscript>|data-scramble|Wells Fargo|CVS Health/);
  const fallbackLink = html.match(/<a[^>]*href="#about-text"[^>]*>/)[0];
  assert.match(fallbackLink, /aria-label="About"/);
  assert.match(fallbackLink, /data-scene-fallback/);
  assert.doesNotMatch(fallbackLink, / hidden/);
  const fallbackContent = html.match(/<div class="scene-fallback-content"[^>]*>/)[0];
  assert.match(fallbackContent, /id="about-text"/);
  assert.match(fallbackContent, /data-scene-fallback/);
  assert.doesNotMatch(fallbackContent, / hidden/);
  const fallbackNav = html.match(/<nav class="estate-text-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual(
    [...fallbackNav.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]),
    ["profile-text", "experience-text", "contact-text"],
  );
  assert.match(html, /<button[^>]*class="[^"]*scene-entry"[^>]* hidden>/);
  const text = (value) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  for (const category of ["profile", "experience", "contact"]) {
    const inline = html.match(new RegExp(`id="${category}-text"[^>]*>[\\s\\S]*?<p>([\\s\\S]*?)</p>`))[1];
    const dialog = html.match(new RegExp(`id="panel-${category}"[\\s\\S]*?<p class="panel-body">([\\s\\S]*?)</p>`))[1];
    assert.equal(text(inline), text(dialog), `${category} fallback wording drifted`);
  }
});

test("homepage modification metadata matches its public Markdown equivalent", async () => {
  const html = await readIndexHtml();
  const markdown = await readFile(path.join(projectRoot, "index.md"), "utf8");
  assert.equal(
    html.match(/"dateModified": "([^"]+)"/)[1],
    markdown.match(/dateModified: (\S+)/)[1],
  );
});

test("personal metadata stays consistent and scene discovery uses inert metadata", async () => {
  const html = await readIndexHtml();
  const description = "Alex Nava’s personal website";
  const sceneMeta = html.match(/<meta[^>]*name="babel:scene-script"[^>]*>/)?.[0] || "";

  assert.ok(
    html.split(description).length - 1 >= 3,
    "the shared public description must remain present in core and structured metadata",
  );

  assert.match(html, /<title>Alex Nava<\/title>/);
  assert.match(sceneMeta, /content="\/scripts\/scene\.js" data-scene-script/);
  assert.doesNotMatch(html, /<script[^>]*src="\/scripts\/scene\.js"/);
  assert.doesNotMatch(html, /<link[^>]*data-scene-script/);
  assert.doesNotMatch(html, /rel="prefetch"[^>]*scene\.js/);
});

test("first-paint hero, action cursors, microcopy, and short-landscape labels stay legible", async () => {
  const styles = await readStyles();

  assert.doesNotMatch(
    styles,
    /@keyframes hero-rise\s*\{\s*from\s*\{\s*opacity:\s*0/,
    "the hero must not begin hidden",
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.hero-minimal,[\s\S]*?animation:\s*none;/,
    "the unified hero reveal is static when reduced motion is requested",
  );
  assert.match(styles, /a,\s*button\s*\{\s*cursor:\s*pointer;/);
  assert.doesNotMatch(
    styles,
    /font-size:\s*(?:[0-9](?:\.[0-9]+)?|1[01](?:\.[0-9]+)?)px/,
    "user-facing microcopy must not fall below 12px",
  );
  assert.match(
    styles,
    /@media \(orientation: landscape\) and \(max-height: 500px\)[\s\S]*?\.btn-icon-label\s*\{[^}]*opacity:\s*1;/,
  );
  assert.match(styles, /\.btn-icon-label\s*\{[^}]*opacity:\s*1;/);
  assert.match(
    styles,
    /\.panel-parchment__sheet\s*\{[^}]*min-height:\s*clamp\(280px, 36vh, 380px\);/,
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.hero\s*\{[^}]*align-items:\s*flex-start;/,
  );
  assert.match(
    styles,
    /\.panel-parchment__sheet \.eyebrow\s*\{[^}]*color:\s*#60492e;[^}]*opacity:\s*1;/,
  );
  assert.match(
    styles,
    /\.panel-parchment__sheet \.panel-footnote\s*\{[^}]*color:\s*#55493a;[^}]*font-size:\s*12px;/,
  );
});
