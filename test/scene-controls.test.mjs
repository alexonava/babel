import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../src/ui/scene-controls.js", import.meta.url), "utf8");
const STORAGE_KEY = "babel:scene-paused";

function createFixture({
  stored,
  storage = "memory",
  button = true,
  host = true,
  email = true,
} = {}) {
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target, options) {
      observers.push({ observer: this, target, options });
    }
  }
  const classes = new Set();
  const sceneHost = {
    classList: {
      contains: (token) => classes.has(token),
      add(token) {
        classes.add(token);
        notify();
      },
      remove(token) {
        classes.delete(token);
        notify();
      },
    },
  };
  function notify() {
    for (const { observer, target, options } of observers) {
      if (target === sceneHost && options.attributeFilter.includes("class")) observer.callback([]);
    }
  }
  const clickHandlers = [];
  const attributes = new Map();
  const pauseButton = {
    hidden: true,
    textContent: "Pause scene",
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) => attributes.get(name) ?? null,
    addEventListener(type, handler) {
      if (type === "click") clickHandlers.push(handler);
    },
    click() {
      clickHandlers.forEach((handler) => handler({ type: "click" }));
    },
  };
  const items = new Map(stored === undefined ? [] : [[STORAGE_KEY, stored]]);
  const memoryStorage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
  const window = { BabelSite: {} };
  if (storage === "memory") window.localStorage = memoryStorage;
  else if (storage === "throws") {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("SecurityError: storage is blocked");
      },
    });
  }
  const focusCalls = [];
  const focusable = (name) => ({
    name,
    focus(options) {
      focusCalls.push({ name, options });
      document.activeElement = this;
    },
  });
  const emailLink = focusable("email");
  const main = focusable("main");
  pauseButton.focus = focusable("scene-pause").focus;
  const document = {
    activeElement: null,
    getElementById(id) {
      if (id === "scene-pause") return button ? pauseButton : null;
      if (id === "home-scene") return host ? sceneHost : null;
      if (id === "main") return main;
      return null;
    },
    querySelector: (selector) => (selector === ".site-footer__email" && email ? emailLink : null),
  };
  vm.runInNewContext(
    source,
    { window, document, MutationObserver: FakeMutationObserver },
    { filename: "src/ui/scene-controls.js" },
  );
  return {
    window,
    button: pauseButton,
    host: sceneHost,
    items,
    observers,
    clickHandlers,
    document,
    emailLink,
    main,
    focusCalls,
    get site() {
      return window.BabelSite;
    },
    initialize() {
      return window.BabelSite.ui.initSceneControls();
    },
    // What the deferred scene bundle attaches to the shared namespace.
    loadScene({ appliesPreference = true } = {}) {
      const scene = window.BabelSite.scene;
      let paused = appliesPreference ? scene.visitorPausedPreference === true : false;
      scene.calls = [];
      scene.setVisitorPaused = (next) => {
        scene.calls.push(next);
        paused = next;
      };
      scene.isVisitorPaused = () => paused;
      return scene;
    },
  };
}

function assertShowsPlaying(button) {
  assert.equal(button.getAttribute("data-paused"), "false");
  assert.equal(button.textContent, "Pause scene");
}

// The label names the next action, as media controls do.
function assertShowsPaused(button) {
  assert.equal(button.getAttribute("data-paused"), "true");
  assert.equal(button.textContent, "Play scene");
}

test("the pause control appears only while the live scene is revealed", () => {
  const fixture = createFixture();
  assert.equal(fixture.initialize(), true);
  assert.equal(fixture.button.hidden, true, "the static poster has nothing to pause");
  fixture.loadScene();
  fixture.host.classList.add("is-ready");
  assert.equal(fixture.button.hidden, false);
  assertShowsPlaying(fixture.button);
  fixture.host.classList.remove("is-ready");
  assert.equal(
    fixture.button.hidden,
    true,
    "a scene that falls back to the poster hides the control",
  );
  fixture.host.classList.add("is-ready");
  assert.equal(fixture.button.hidden, false);
});

test("pressing the control pauses and resumes the scene and remembers the choice", () => {
  const fixture = createFixture();
  fixture.initialize();
  const scene = fixture.loadScene();
  fixture.host.classList.add("is-ready");
  assert.deepEqual(scene.calls, [], "a playing scene needs no instruction on reveal");

  fixture.button.click();
  assert.deepEqual(scene.calls, [true]);
  assert.equal(scene.isVisitorPaused(), true);
  assertShowsPaused(fixture.button);
  assert.equal(fixture.items.get(STORAGE_KEY), "1");
  assert.equal(scene.visitorPausedPreference, true);

  fixture.button.click();
  assert.deepEqual(scene.calls, [true, false]);
  assertShowsPlaying(fixture.button);
  assert.equal(fixture.items.get(STORAGE_KEY), "0");
  assert.equal(scene.visitorPausedPreference, false);
});

test("a stored pause is handed to the scene before it loads and shown once it reveals", () => {
  const fixture = createFixture({ stored: "1" });
  fixture.initialize();
  assert.equal(fixture.site.scene.visitorPausedPreference, true);
  assert.equal(fixture.button.hidden, true);
  const scene = fixture.loadScene();
  fixture.host.classList.add("is-ready");
  assert.equal(fixture.button.hidden, false);
  assertShowsPaused(fixture.button);
  assert.deepEqual(scene.calls, [], "the scene applied the stored preference itself");
  fixture.button.click();
  assert.deepEqual(scene.calls, [false]);
  assertShowsPlaying(fixture.button);
  assert.equal(fixture.items.get(STORAGE_KEY), "0");
});

test("a revealed scene that missed the stored pause is brought in line with the control", () => {
  const fixture = createFixture({ stored: "1" });
  fixture.initialize();
  const scene = fixture.loadScene({ appliesPreference: false });
  fixture.host.classList.add("is-ready");
  assert.deepEqual(scene.calls, [true]);
  assert.equal(scene.isVisitorPaused(), true);
  assertShowsPaused(fixture.button);
});

test("stored values other than 1 leave the scene playing", () => {
  for (const stored of [undefined, "0", "true", ""]) {
    const fixture = createFixture({ stored });
    fixture.initialize();
    assert.equal(fixture.site.scene.visitorPausedPreference, false, String(stored));
    assertShowsPlaying(fixture.button);
  }
});

test("blocked or missing storage keeps the control working for the visit", () => {
  for (const storage of ["throws", "missing"]) {
    const fixture = createFixture({ storage });
    assert.equal(fixture.initialize(), true, storage);
    assert.equal(fixture.site.scene.visitorPausedPreference, false);
    const scene = fixture.loadScene();
    fixture.host.classList.add("is-ready");
    assert.doesNotThrow(() => fixture.button.click());
    assert.deepEqual(scene.calls, [true]);
    assertShowsPaused(fixture.button);
  }
});

test("pressing before the scene API exists only records the preference", () => {
  const fixture = createFixture();
  fixture.initialize();
  assert.doesNotThrow(() => fixture.button.click());
  assertShowsPaused(fixture.button);
  assert.equal(fixture.site.scene.visitorPausedPreference, true);
  assert.equal(fixture.items.get(STORAGE_KEY), "1");
  const scene = fixture.loadScene();
  assert.equal(scene.isVisitorPaused(), true, "the scene reads the updated preference");
});

test("missing markup is a safe no-op and initialization binds once", () => {
  for (const missing of ["button", "host"]) {
    const fixture = createFixture({ [missing]: false });
    assert.equal(fixture.initialize(), false, missing);
    assert.equal(fixture.observers.length, 0);
    assert.equal(fixture.clickHandlers.length, 0);
  }
  const fixture = createFixture();
  for (let i = 0; i < 3; i++) assert.equal(fixture.initialize(), true);
  assert.equal(fixture.observers.length, 1);
  assert.equal(fixture.clickHandlers.length, 1);
  const { options } = fixture.observers[0];
  assert.equal(options.attributes, true);
  assert.deepEqual([...options.attributeFilter], ["class"]);
});

test("hiding the control under keyboard focus keeps focus in the footer", () => {
  const fixture = createFixture();
  fixture.initialize();
  fixture.loadScene();
  fixture.host.classList.add("is-ready");
  fixture.button.focus();
  fixture.focusCalls.length = 0;
  fixture.host.classList.remove("is-ready");
  assert.equal(fixture.button.hidden, true);
  assert.equal(fixture.document.activeElement, fixture.emailLink);
  assert.equal(fixture.focusCalls[0].options.preventScroll, true);

  fixture.host.classList.add("is-ready");
  assert.equal(fixture.document.activeElement, fixture.emailLink, "reappearing never steals focus");
  fixture.host.classList.remove("is-ready");
  assert.equal(fixture.focusCalls.length, 1, "an unfocused control hides without moving focus");

  const withoutEmail = createFixture({ email: false });
  withoutEmail.initialize();
  withoutEmail.host.classList.add("is-ready");
  withoutEmail.button.focus();
  withoutEmail.host.classList.remove("is-ready");
  assert.equal(withoutEmail.document.activeElement, withoutEmail.main);
});
