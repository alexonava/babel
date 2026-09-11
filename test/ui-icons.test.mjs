import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
test("estate homepage exposes categories directly without the old icon entry", async () => {
 const html=await readFile(new URL("index.html",root),"utf8");
 assert.doesNotMatch(html,/data-panel="about"|nav-about|nav-contact/);
 for(const name of ["profile","experience","contact"]) assert.ok(html.includes(`aria-controls="panel-${name}"`));
});

test("navigation model renders have 256px alpha canvases and fit the combined transfer budget", async () => {
  let total = 0;
  for (const name of ["about", "contact", "about-active", "contact-active"]) {
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


test("estate destinations are labeled HTML buttons in keyboard order without floating icons", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const map = html.match(/<nav class="estate-destinations"[\s\S]*?<\/nav>/)[0];
  const destinations = [...map.matchAll(/data-panel="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(destinations, ["profile", "experience", "contact"]);
  assert.doesNotMatch(map, /<img|<canvas/);
  for (const name of destinations) {
    assert.ok(map.includes(`aria-controls="panel-${name}"`));
    assert.ok(map.includes(`<span>${name[0].toUpperCase() + name.slice(1)}</span>`));
  }
});
