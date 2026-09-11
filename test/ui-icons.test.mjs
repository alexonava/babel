import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
test("navigation model renders are decorative and buttons remain labeled without images", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  for (const name of ["about", "contact"]) {
    const button = [...html.matchAll(/<button\b[\s\S]*?<\/button>/g)]
      .map((m) => m[0])
      .find((s) => s.includes('data-panel="' + name + '"'));
    assert.ok(button);
    assert.match(
      button,
      new RegExp('aria-label="' + (name === "about" ? "About" : "Contact") + '"'),
    );
    assert.match(button, /class="btn-icon-label"/);
    assert.match(button, new RegExp('aria-controls="panel-' + name + '"'));
    const img = button.match(/<img\b[^>]+>/)?.[0];
    assert.ok(img);
    assert.ok(img.includes('src="/images/nav-' + name + '.webp"'));
    assert.match(img, /alt=""/);
    assert.match(img, /aria-hidden="true"/);
    assert.match(img, /width="256" height="256"/);
    assert.doesNotMatch(button, /<canvas/);
  }
});

test("navigation renders have 256px alpha canvases and fit the combined transfer budget", async () => {
  let total = 0;
  for (const name of ["about", "contact"]) {
    const data = await readFile(new URL("images/nav-" + name + ".webp", root));
    total += data.length;
    assert.equal(data.toString("ascii", 0, 4), "RIFF");
    assert.equal(data.toString("ascii", 8, 12), "WEBP");
    assert.equal(data.toString("ascii", 12, 16), "VP8X");
    assert.ok(data[20] & 0x10, "transparent canvas required");
    assert.equal(data.readUIntLE(24, 3) + 1, 256);
    assert.equal(data.readUIntLE(27, 3) + 1, 256);
  }
  assert.ok(total <= 80 * 1024, "navigation icons exceed 80 KiB");
});
