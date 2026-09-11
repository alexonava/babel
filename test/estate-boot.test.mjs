import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../src/estate-main.js", import.meta.url), "utf8");

function createFixture({ readyState = "complete", init = () => true } = {}) {
  const navigation = { hidden: true };
  const fallback = Array.from({ length: 4 }, () => {
    const element = {
      hidden: false,
      children: [{ kind: "ordinary-link-or-selectable-copy" }],
      contains(target) { return target === this || this.children.includes(target); },
    };
    return element;
  });
  const listeners = new Map();
  const document = {
    readyState,
    activeElement: { kind: "body" },
    querySelector: (selector) => selector === ".estate-destinations" ? navigation : null,
    querySelectorAll: (selector) => selector === "[data-estate-fallback]" ? fallback : [],
    addEventListener(type, callback, options) {
      const registrations = listeners.get(type) || [];
      registrations.push({ callback, options });
      listeners.set(type, registrations);
    },
    dispatch(type) {
      for (const registration of [...(listeners.get(type) || [])]) {
        if (registration.options?.once) {
          listeners.set(type, listeners.get(type).filter((item) => item !== registration));
        }
        registration.callback();
      }
    },
  };
  let calls = 0;
  const window = {
    BabelSite: { ui: { initPanels() { calls++; return init({ navigation, fallback, document }); } } },
  };
  return {
    window, document, navigation, fallback, listeners,
    get calls() { return calls; },
    boot() { vm.runInNewContext(source, { window, document }, { filename: "src/estate-main.js" }); },
  };
}

function assertFallbackAvailable(fixture) {
  assert.equal(fixture.navigation.hidden, true, "nonfunctional dialog controls stay hidden");
  assert.ok(fixture.fallback.every((element) => !element.hidden), "ordinary navigation and copy remain available");
}

test("estate boot reveals dialogs only after successful binding and leaves focus in place", () => {
  const fixture = createFixture({
    init({ navigation, fallback }) {
      assert.equal(navigation.hidden, true);
      assert.ok(fallback.every((element) => !element.hidden), "fallback remains until binding succeeds");
      return true;
    },
  });
  const previousFocus = fixture.document.activeElement;
  fixture.boot();
  assert.equal(fixture.calls, 1);
  assert.equal(fixture.navigation.hidden, false);
  assert.ok(fixture.fallback.every((element) => element.hidden));
  assert.equal(fixture.document.activeElement, previousFocus);
});

test("failed, unavailable, or incomplete dialog initialization preserves the ordinary homepage", async (t) => {
  const cases = [
    ["false result", () => false],
    ["missing success result", () => undefined],
    ["truthy non-success result", () => 1],
    ["thrown error", () => { throw new Error("binding failed"); }],
  ];
  for (const [name, init] of cases) {
    await t.test(name, () => {
      const fixture = createFixture({ init });
      assert.doesNotThrow(() => fixture.boot());
      assert.equal(fixture.calls, 1);
      assertFallbackAvailable(fixture);
    });
  }
  for (const absent of ["namespace", "ui", "initializer"]) {
    await t.test("missing " + absent, () => {
      const fixture = createFixture();
      if (absent === "namespace") delete fixture.window.BabelSite;
      else if (absent === "ui") delete fixture.window.BabelSite.ui;
      else delete fixture.window.BabelSite.ui.initPanels;
      assert.doesNotThrow(() => fixture.boot());
      assertFallbackAvailable(fixture);
    });
  }
});

test("loading documents retain fallback until DOMContentLoaded and initialize only once", () => {
  const fixture = createFixture({ readyState: "loading" });
  fixture.boot();
  assert.equal(fixture.calls, 0);
  assertFallbackAvailable(fixture);
  assert.equal(fixture.listeners.get("DOMContentLoaded").length, 1);
  fixture.document.readyState = "interactive";
  fixture.document.dispatch("DOMContentLoaded");
  assert.equal(fixture.calls, 1);
  assert.equal(fixture.navigation.hidden, false);
  fixture.document.dispatch("DOMContentLoaded");
  assert.equal(fixture.calls, 1);
});

test("a delayed initializer preserves every focused fallback destination or section", () => {
  for (const index of [0, 1, 2, 3]) {
    for (const focusRoot of [false, true]) {
      const fixture = createFixture({ readyState: "loading" });
      fixture.boot();
      const selected = focusRoot ? fixture.fallback[index] : fixture.fallback[index].children[0];
      fixture.document.activeElement = selected;
      fixture.document.dispatch("DOMContentLoaded");
      assert.equal(fixture.calls, 0, "active fallback use prevents enhancement");
      assertFallbackAvailable(fixture);
      assert.equal(fixture.document.activeElement, selected);
    }
  }
});

test("already-ready interactive documents enhance without waiting for another load event", () => {
  const fixture = createFixture({ readyState: "interactive" });
  fixture.boot();
  assert.equal(fixture.calls, 1);
  assert.equal(fixture.navigation.hidden, false);
  assert.equal(fixture.listeners.size, 0);
});

test("incomplete homepage markup never attempts panel initialization", () => {
  for (const missing of ["navigation", "fallback"]) {
    const fixture = createFixture();
    if (missing === "navigation") fixture.document.querySelector = () => null;
    else fixture.document.querySelectorAll = () => [];
    assert.doesNotThrow(() => fixture.boot());
    assert.equal(fixture.calls, 0);
    assertFallbackAvailable(fixture);
  }
});
