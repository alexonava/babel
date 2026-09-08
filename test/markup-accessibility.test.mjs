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

test("bottom-bar buttons have accessible names and are labeled or wrapped with aria-label", async () => {
  const html = await readIndexHtml();
  const buttonBlocks = html.match(/<button[^>]*class="bottom-btn[^"]*"[^>]*>/g) || [];
  assert.ok(buttonBlocks.length >= 2, "expected at least two bottom-bar buttons");
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
  assert.ok(overlayBlocks.length >= 2, "expected at least two modal overlays");
  for (const block of overlayBlocks) {
    assert.match(block, /role="dialog"/);
    assert.match(block, /aria-modal="true"/);
    assert.match(block, /aria-labelledby="/);
    assert.match(block, /\shidden(\s|>)/);
  }
});

test("about and contact panels share the parchment frame and each carry one ornament", async () => {
  const html = await readIndexHtml();
  const sharedFrames =
    html.match(/class="[^"]*\bpanel-parchment\b[^"]*\bpanel-surface\b[^"]*"/g) || [];

  assert.equal(
    sharedFrames.length,
    2,
    "both panels use the shared panel-parchment + panel-surface frame",
  );
  assert.match(html, /class="panel-parchment__watermark"/, "About carries the watermark ornament");
  assert.match(html, /class="panel-parchment__seal"/, "Contact carries the wax-seal ornament");
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

test("decorative regions are hidden from assistive tech and main content stays programmatically reachable", async () => {
  const html = await readIndexHtml();
  assert.match(html, /class="scene-shell"[^>]*aria-hidden="true"/);
  assert.match(html, /class="site-shell"[^>]*aria-hidden="true"/);
  assert.match(html, /<main[^>]*id="main"[^>]*tabindex="-1"/);
});

test("the loading ritual is decorative, self-contained, timed, and motion-safe", async () => {
  const html = await readIndexHtml();
  const styles = await readStyles();
  const ritualStart = html.indexOf('<div class="loading-ritual"');
  const sceneStart = html.indexOf('<div class="scene-shell"', ritualStart);
  const ritual = html.slice(ritualStart, sceneStart);

  assert.ok(ritualStart >= 0, "loading ritual is present");
  assert.ok(sceneStart > ritualStart, "loading ritual precedes the scene");
  assert.match(ritual, /aria-hidden="true"/);
  assert.match(ritual, /<svg[\s\S]*class="loading-ritual__seal"/);
  assert.match(ritual, /class="loading-ritual__tower"/);
  assert.doesNotMatch(ritual, /class="loading-ritual__name"/);
  assert.match(ritual, /class="loading-ritual__motto">Alex Nava</);
  assert.doesNotMatch(ritual, /loading-ritual__(?:fog|ticks|brazier|ember|progress)/);
  assert.doesNotMatch(ritual, /<(?:a|button|input|select|textarea)\b/i);
  assert.doesNotMatch(ritual, /\ssrc=/i, "the ritual adds no external media asset");
  assert.doesNotMatch(ritual, /https?:\/\//i);

  assert.match(styles, /--loading-ritual-duration:\s*900ms/);
  assert.match(
    styles,
    /\.loading-ritual\s*\{[\s\S]*?animation:\s*loading-ritual-exit 180ms[^;]*720ms both;/,
  );
  assert.match(
    styles,
    /@keyframes loading-ritual-exit[\s\S]*?to\s*\{[^}]*visibility:\s*hidden;[^}]*opacity:\s*0;/,
    "CSS hides the ritual without waiting for JavaScript",
  );
  assert.match(
    styles,
    /\.loading-ritual__content\s*\{[\s\S]*?animation:\s*loading-ritual-content-enter 420ms[^;]*60ms both;/,
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.loading-ritual\s*\{[^}]*animation:\s*loading-ritual-exit 120ms linear 250ms both;/,
  );
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]*?\.loading-ritual\s*\{[^}]*background:\s*Canvas;/,
  );
});

test("the decorative scene poster is eager, responsive, and only fades for a ready scene", async () => {
  const html = await readIndexHtml();
  const styles = await readStyles();
  const picture = html.match(/<picture class="scene-poster"[\s\S]*?<\/picture>/)?.[0] || "";
  const image = picture.match(/<img[\s\S]*?\/>/)?.[0] || "";

  assert.match(picture, /aria-hidden="true"/);
  assert.match(picture, /media="\(orientation: portrait\)"/);
  assert.match(picture, /srcset="\/images\/scene-poster-portrait\.webp"/);
  assert.match(image, /src="\/images\/scene-poster-landscape\.webp"/);
  assert.match(image, /alt=""/);
  assert.match(image, /loading="eager"/);
  assert.match(image, /fetchpriority="high"/);
  assert.match(image, /decoding="async"/);
  assert.match(styles, /\.scene-canvas\.is-ready \+ \.scene-poster\s*\{\s*opacity:\s*0;/);
  assert.doesNotMatch(
    styles,
    /\.scene-shell\s*\{[^}]*animation:/,
    "the first-paint poster must not wait on a shell opacity animation",
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.scene-canvas,\s*\.scene-poster\s*\{[^}]*transition:\s*none;/,
  );
});

test("external links that open in a new tab declare rel=noopener", async () => {
  const html = await readIndexHtml();
  const externalAnchors = html.match(/<a[^>]*target="_blank"[^>]*>/g) || [];
  for (const anchor of externalAnchors) {
    assert.match(anchor, /rel="[^"]*noopener[^"]*"/, `target="_blank" without noopener: ${anchor}`);
  }
});

test("hero and About copy remain clear, grounded, and free of scramble hooks", async () => {
  const html = await readIndexHtml();
  const hero = html.match(/<section id="home"[\s\S]*?<\/section>/)?.[0] || "";
  const heroText = hero
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  assert.equal(heroText, "Alex Nava A little about me and what I’m working on.");
  assert.equal(
    html.replace(/\s+/g, " ").split(
      "My background is in analytics, reporting, remediation, and controls, across banking and health analytics. This is my personal corner of the web.",
    ).length - 1,
    2,
  );
  assert.doesNotMatch(html, /Nine years|advisory inquiries|Core focus areas|Nava Designs/);
  assert.doesNotMatch(html, /Wells Fargo|CVS Health/);
  assert.match(html, /A little about me\./);
  assert.doesNotMatch(html, /data-scramble/);
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
  assert.match(sceneMeta, /content="\/scripts\/scene\.js\?v=648"/);
  assert.match(sceneMeta, /\sdata-scene-script(?:\s|\/?>)/);
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
