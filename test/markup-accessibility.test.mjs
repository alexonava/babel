import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";
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

async function readNotFoundHtml() {
  return readFile(path.join(projectRoot, "404.html"), "utf8");
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

test("responsive scene posters paint before the deferred renderer and debug UI stays out of published markup", async () => {
  const html = await readIndexHtml();
  assert.match(html, /<picture class="scene-poster" aria-hidden="true">/);
  assert.match(html, /media="\(orientation: portrait\)"[\s\S]*?srcset="\/images\/scene-poster-portrait\.webp"/);
  assert.match(html, /src="\/images\/scene-poster-landscape\.webp"[\s\S]*?alt=""[\s\S]*?loading="eager"[\s\S]*?fetchpriority="high"/);
  assert.doesNotMatch(html, /dev-mode-hud/, "developer mode creates its HUD on demand");
  assert.doesNotMatch(html, /loading-ritual/);
});

test("the poster stays opaque until the canvas fade completes", async () => {
  const styles = await readStyles();
  const canvasFade = styles.match(/\.scene-canvas\s*\{[^}]*transition:\s*opacity (\d+)ms/)?.[1];
  assert.ok(canvasFade, "the canvas fades in");
  assert.match(
    styles,
    /\n\.scene-poster\s*\{[^}]*z-index:\s*0;[^}]*opacity:\s*1;[^}]*transition:\s*none;/,
    "the poster under the canvas returns at once when the canvas fades out",
  );
  assert.match(
    styles,
    new RegExp(
      `\\.scene-canvas\\.is-ready \\+ \\.scene-poster\\s*\\{[^}]*opacity:\\s*0;[^}]*transition:\\s*opacity 0s linear ${canvasFade}ms;`,
    ),
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.scene-canvas,\s*\.scene-poster,\s*\.scene-canvas\.is-ready \+ \.scene-poster\s*\{\s*transition:\s*none;/,
    "reduced motion swaps the poster and canvas immediately",
  );
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
  // Later same-selector rules must not override the restrained brown ink.
  const eyebrowColors = [...styles.matchAll(/\.panel-parchment__sheet \.eyebrow\s*\{([^}]*)\}/g)]
    .map((match) => match[1].match(/(?:^|[;\s])color:\s*([^;]+);/)?.[1])
    .filter(Boolean);
  assert.deepEqual(eyebrowColors, ["#60492e"], "the paper eyebrow ink that renders is #60492e");
  assert.match(
    styles,
    /\.panel-parchment__sheet \.panel-footnote\s*\{[^}]*color:\s*#55493a;[^}]*font-size:\s*12px;/,
  );
});

test("both contact addresses sit inside Cloudflare email_off markers", async () => {
  const html = await readIndexHtml();
  const wrapped =
    html.match(/<!--email_off--><a href="mailto:[^"]+">[^<]+<\/a><!--\/email_off-->/g) || [];
  assert.equal(wrapped.length, 2, "the fallback Contact section and Contact dialog keep literal links");
  const outside = html.replace(/<!--email_off-->[\s\S]*?<!--\/email_off-->/g, "");
  assert.doesNotMatch(outside, /mailto:|[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
});

test("variable font faces supply real weights without the retired static face", async () => {
  const styles = await readStyles();
  const html = await readIndexHtml();
  const faces = styles.match(/@font-face\s*\{[^}]*\}/g) || [];
  assert.equal(faces.length, 2);
  assert.match(faces.find((face) => face.includes("cormorant-garamond-500.woff2")), /font-weight:\s*300 700;/);
  assert.match(faces.find((face) => face.includes("instrument-sans-400.woff2")), /font-weight:\s*400 700;/);
  assert.doesNotMatch(`${styles}\n${html}`, /instrument-sans-600/);
  const fontUrls = [
    ...[...styles.matchAll(/url\("(\/fonts\/[^"]+)"\)/g)].map((match) => match[1]),
    ...[...html.matchAll(/href="(\/fonts\/[^"]+)"/g)].map((match) => match[1]),
  ];
  assert.ok(fontUrls.length >= 4);
  for (const url of fontUrls) await access(path.join(projectRoot, url));
  for (const rule of [
    /\.hero h1\s*\{[^}]*font-weight:\s*700;[^}]*font-synthesis-weight:\s*none;/,
    /\.estate-title\s*\{[^}]*font: 600[^}]*font-synthesis-weight:\s*none;/,
    /\.estate-destination span\s*\{[^}]*font: 600[^}]*font-synthesis-weight:\s*none;/,
  ]) {
    assert.match(styles, rule);
  }
});

test("the visible About label forwards clicks to its control", async () => {
  const styles = await readStyles();
  const label = styles.match(/\.btn-icon-label\s*\{[^}]*\}/)[0];
  assert.match(label, /position:\s*absolute;/, "the label stays outside the bar's layout rectangle");
  assert.match(label, /pointer-events:\s*auto;/);
});

test("forced colors and high-contrast modes keep system colors and the system cursor", async () => {
  const styles = await readStyles();
  assert.doesNotMatch(styles, /forced-color-adjust:\s*none/);
  assert.match(styles, /\.panel-overlay\s*\{\s*cursor:\s*auto;\s*\}/);
  assert.match(
    styles,
    /@media \(forced-colors: active\), \(prefers-contrast: more\)\s*\{\s*html,\s*body\s*\{\s*cursor:\s*auto;/,
  );
});

test("no-JavaScript fallback links use the light dark-background link ink", async () => {
  const styles = await readStyles();
  assert.match(
    styles,
    /\.scene-fallback-content a\s*\{[^}]*color:\s*var\(--parchment-200\);[^}]*text-decoration-color:\s*rgba\(198, 208, 202, 0\.48\);/,
  );
  assert.match(styles, /--parchment-200:\s*#[0-9a-f]{6};/i);
});

test("the 3:2 estate map fits short laptop and landscape-phone viewports", async () => {
  const styles = await readStyles();
  assert.match(
    styles,
    /\.panel-overlay\s*\{[^}]*padding:\s*max\(24px, env\(safe-area-inset-top\)\)[^;]*max\(24px, env\(safe-area-inset-bottom\)\)/,
  );
  assert.match(styles, /\.panel-estate\s*\{[^}]*width:\s*min\(100%, 960px, calc\(\(100svh - 48px\) \* 1\.5\)\);/);
  assert.match(
    styles,
    /@media \(orientation: landscape\) and \(max-height: 500px\)\s*\{\s*\.panel-estate\s*\{\s*width:\s*min\(\s*100%,\s*960px,\s*calc\(\(100svh - max\(8px, env\(safe-area-inset-top\)\) - max\(10px, env\(safe-area-inset-bottom\)\)\) \* 1\.5\)\s*\);/,
  );
  // The portrait map below 600px keeps its own width after the caps.
  const cap = styles.lastIndexOf("(100svh - max(8px");
  const portrait = styles.indexOf(".panel-estate { width: min(100%, 440px); }");
  assert.ok(cap > 0 && portrait > cap);
});

test("phones do not gain a phantom scroll below the small-viewport hero", async () => {
  const styles = await readStyles();
  assert.match(styles, /\nbody\s*\{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100svh;/);
  assert.doesNotMatch(styles, /100dvh/);
});

test("fixed chrome and dialogs clear left and right safe-area insets", async () => {
  const styles = await readStyles();
  assert.match(styles, /\.hero\s*\{[^}]*padding-left:\s*max\(0px, calc\(env\(safe-area-inset-left\) - 16px\)\);/);
  assert.match(styles, /\.site-copyright\s*\{[^}]*left:\s*max\(20px, calc\(env\(safe-area-inset-left\) \+ 8px\)\);/);
  const sidePaddings = [...styles.matchAll(/\.panel-overlay\s*\{[^}]*padding:([^;]+);/g)]
    .map((match) => match[1].trim())
    .filter((padding) => padding.includes("safe-area-inset-left"));
  assert.deepEqual(
    sidePaddings.map((padding) => padding.match(/^max\((\d+px)/)[1]),
    ["24px", "8px"],
    "the base and short-landscape overlays pad for side insets",
  );
  for (const padding of sidePaddings) {
    assert.match(padding, /max\(\d+px, env\(safe-area-inset-right\)\)\s+max\(\d+px, env\(safe-area-inset-bottom\)\)\s+max\(\d+px, env\(safe-area-inset-left\)\)$/);
  }
});

test("landmarks and heading levels describe the page structure", async () => {
  const html = await readIndexHtml();
  const styles = await readStyles();
  assert.match(html, /<footer class="site-footer">\s*<p class="site-copyright">&copy; 2026 Alex Nava<\/p>\s*<\/footer>/);
  assert.match(styles, /body\.dev-mode-active > \*:not\(\.scene-shell\):not\(\.dev-mode-hud\)/);
  const fallback = html.match(/<div class="scene-fallback-content"[\s\S]*?<\/main>/)[0];
  assert.deepEqual(
    [...fallback.matchAll(/<(h[1-6])>([^<]+)<\/h[1-6]>/g)].map((match) => `${match[1]} ${match[2]}`),
    ["h2 About", "h3 Profile", "h3 Experience", "h3 Contact"],
  );

  const notFound = await readNotFoundHtml();
  assert.match(notFound, /<h1>That page isn't here\.<\/h1>/);
  assert.doesNotMatch(notFound, /<h2>/);
  assert.match(notFound, /<meta name="theme-color" content="#0b1020" \/>/);
  assert.match(notFound, /<picture class="scene-poster" aria-hidden="true">/);
  const classTokens = [...notFound.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/));
  for (const token of classTokens) {
    assert.match(styles, new RegExp(`\\.${token}(?![\\w-])`), `404 class "${token}" has no styles`);
  }
  for (const selector of [/\.story-shell h1,\s*\.story-shell h2,\s*\.panel-card h2\s*\{/, /\.story-shell h1,\s*\.story-shell h2\s*\{/]) {
    assert.match(styles, selector);
  }
});

test("social previews describe the share image", async () => {
  const html = await readIndexHtml();
  const alt = "Alex Nava — a stone watchtower under a night sky";
  assert.ok(html.includes(`<meta property="og:image:alt" content="${alt}" />`));
  assert.ok(html.includes(`<meta name="twitter:image:alt" content="${alt}" />`));
});
