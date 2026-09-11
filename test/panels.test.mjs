import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, "..");
const panelsSourcePath = path.join(projectRoot, "src", "ui", "panels.js");
const motionSourcePath = path.join(projectRoot, "src", "shared", "motion.js");
const stylesPath = path.join(projectRoot, "styles.css");

class FakeClassList {
  constructor(element, initial = []) {
    this.element = element;
    this.items = new Set(initial);
  }

  add(...tokens) {
    for (const token of tokens) {
      this.items.add(token);
    }
    this.#sync();
  }

  remove(...tokens) {
    for (const token of tokens) {
      this.items.delete(token);
    }
    this.#sync();
  }

  contains(token) {
    return this.items.has(token);
  }

  #sync() {
    this.element.className = Array.from(this.items).join(" ");
  }
}

class FakeElement {
  constructor(document, tagName, options = {}) {
    this.document = document;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = { ...(options.dataset || {}) };
    this.hidden = options.hidden || false;
    this.inert = false;
    this.id = options.id || "";
    this.className = "";
    this.classList = new FakeClassList(this, options.classNames || []);
    this.textContent = options.textContent || "";

    if (this.id) {
      this.setAttribute("id", this.id);
    }

    for (const [key, value] of Object.entries(options.attributes || {})) {
      this.setAttribute(key, value);
    }

    for (const [key, value] of Object.entries(this.dataset)) {
      this.setAttribute(
        `data-${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`,
        value,
      );
    }
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      handlers.filter((candidate) => candidate !== handler),
    );
  }

  dispatchEvent(event) {
    event.target ||= this;
    event.currentTarget = this;
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) {
      handler.call(this, event);
    }
    return !event.defaultPrevented;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "id") {
      this.id = String(value);
    }
    if (name === "class") {
      this.className = String(value);
      this.classList = new FakeClassList(this, String(value).split(/\s+/).filter(Boolean));
    }
    if (name === "tabindex") {
      this.tabIndex = Number(value);
    }
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  focus() {
    this.document.activeElement = this;
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return queryAll(this.children, selector);
  }

  get offsetWidth() {
    return 1;
  }
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
    this.activeElement = null;
    this.body = new FakeElement(this, "body");
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== handler));
  }
  dispatchEvent(event) {
    event.target ||= this;
    event.currentTarget = this;
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) {
      handler.call(this, event);
    }
    return !event.defaultPrevented;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return queryAll(this.body.children, selector);
  }

  getElementById(id) {
    return queryAll(this.body.children, `#${id}`)[0] || null;
  }
}

function createEvent(type, properties = {}) {
  return {
    type,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...properties,
  };
}

function queryAll(nodes, selector) {
  const matches = [];
  for (const node of nodes) {
    if (matchesSelector(node, selector)) {
      matches.push(node);
    }
    matches.push(...queryAll(node.children, selector));
  }
  return matches;
}

function matchesSelector(element, selector) {
  const selectors = selector.split(",").map((entry) => entry.trim());
  return selectors.some((entry) => matchesSimpleSelector(element, entry));
}

function matchesSimpleSelector(element, selector) {
  if (selector === ".skip-link") {
    return element.classList.contains("skip-link");
  }
  if (selector === ".scene-shell") {
    return element.classList.contains("scene-shell");
  }
  if (selector === ".site-shell") {
    return element.classList.contains("site-shell");
  }
  if (selector === ".bottom-bar") {
    return element.classList.contains("bottom-bar");
  }
  if (selector === ".site-copyright") {
    return element.classList.contains("site-copyright");
  }
  if (selector === ".panel-overlay") {
    return element.classList.contains("panel-overlay");
  }
  if (selector === ".panel-close") {
    return element.classList.contains("panel-close");
  }
  if (selector === ".panel-surface") return element.classList.contains("panel-surface");
  if (selector === ".panel-card") {
    return element.classList.contains("panel-card");
  }
  if (selector === ".bottom-btn[data-panel]") {
    return element.classList.contains("bottom-btn") && Boolean(element.dataset.panel);
  }
  if (selector === "button:not([disabled])") {
    return element.tagName === "BUTTON" && !element.hasAttribute("disabled");
  }
  if (selector === "a[href]") {
    return element.tagName === "A" && element.hasAttribute("href");
  }
  if (selector === '[tabindex]:not([tabindex="-1"])') {
    return element.hasAttribute("tabindex") && element.getAttribute("tabindex") !== "-1";
  }
  if (selector === "main") {
    return element.tagName === "MAIN";
  }
  if (selector.startsWith("#")) {
    return element.id === selector.slice(1);
  }
  return false;
}

function append(parent, child) {
  parent.appendChild(child);
  return child;
}

function createSiteDom({ reduceMotion = true } = {}) {
  const document = new FakeDocument();
  const window = {
    document,
    BabelSite: {},
    setTimeout,
    clearTimeout,
    matchMedia() {
      return {
        matches: reduceMotion,
        addEventListener() {},
        addListener() {},
      };
    },
  };

  const skipLink = append(
    document.body,
    new FakeElement(document, "a", {
      classNames: ["skip-link"],
      attributes: { href: "#main" },
    }),
  );
  const sceneShell = append(
    document.body,
    new FakeElement(document, "div", { classNames: ["scene-shell"] }),
  );
  append(
    sceneShell,
    new FakeElement(document, "div", { classNames: ["scene-canvas"], id: "home-scene" }),
  );
  append(sceneShell, new FakeElement(document, "div", { classNames: ["scene-vignette"] }));
  const siteShell = append(
    document.body,
    new FakeElement(document, "div", { classNames: ["site-shell"] }),
  );
  const main = append(
    document.body,
    new FakeElement(document, "main", { id: "main", attributes: { tabindex: "-1" } }),
  );
  append(main, new FakeElement(document, "section", { classNames: ["hero", "section"] }));
  const bottomBar = append(
    document.body,
    new FakeElement(document, "nav", { classNames: ["bottom-bar"] }),
  );
  const aboutButton = append(
    bottomBar,
    new FakeElement(document, "button", {
      classNames: ["bottom-btn", "bottom-btn--icon"],
      dataset: { panel: "about" },
      attributes: {
        "aria-expanded": "false",
        "aria-controls": "panel-about",
        "aria-label": "About",
      },
    }),
  );
  append(
    aboutButton,
    new FakeElement(document, "img", { classNames: ["btn-icon"], id: "btn-icon-about" }),
  );
  append(
    aboutButton,
    new FakeElement(document, "span", { classNames: ["btn-icon-label"], textContent: "About" }),
  );
  const contactButton = append(
    bottomBar,
    new FakeElement(document, "button", {
      classNames: ["bottom-btn", "bottom-btn--icon"],
      dataset: { panel: "contact" },
      attributes: {
        "aria-expanded": "false",
        "aria-controls": "panel-contact",
        "aria-label": "Contact",
      },
    }),
  );
  append(
    contactButton,
    new FakeElement(document, "canvas", { classNames: ["btn-icon"], id: "btn-icon-contact" }),
  );
  append(
    contactButton,
    new FakeElement(document, "span", { classNames: ["btn-icon-label"], textContent: "Contact" }),
  );
  const copyright = append(
    document.body,
    new FakeElement(document, "p", { classNames: ["site-copyright"] }),
  );

  const aboutOverlay = append(
    document.body,
    new FakeElement(document, "div", {
      classNames: ["panel-overlay"],
      id: "panel-about",
      hidden: true,
      attributes: {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "panel-about-title",
      },
    }),
  );
  const aboutCard = append(
    aboutOverlay,
    new FakeElement(document, "div", { classNames: ["panel-card"] }),
  );
  const aboutClose = append(
    aboutCard,
    new FakeElement(document, "button", {
      classNames: ["panel-close"],
      attributes: { "aria-label": "Close" },
    }),
  );
  append(aboutCard, new FakeElement(document, "h2", { id: "panel-about-title" }));
  append(
    aboutCard,
    new FakeElement(document, "a", {
      attributes: { href: "https://threejs.org" },
    }),
  );

  const contactOverlay = append(
    document.body,
    new FakeElement(document, "div", {
      classNames: ["panel-overlay"],
      id: "panel-contact",
      hidden: true,
      attributes: {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "panel-contact-title",
      },
    }),
  );
  const contactCard = append(
    contactOverlay,
    new FakeElement(document, "div", { classNames: ["panel-card"] }),
  );
  const contactClose = append(
    contactCard,
    new FakeElement(document, "button", {
      classNames: ["panel-close"],
      attributes: { "aria-label": "Close" },
    }),
  );
  append(contactCard, new FakeElement(document, "h2", { id: "panel-contact-title" }));
  const contactLink = append(
    contactCard,
    new FakeElement(document, "a", {
      attributes: { href: "mailto:alexonava@gmail.com" },
    }),
  );

  return {
    window,
    document,
    elements: {
      skipLink,
      sceneShell,
      siteShell,
      main,
      bottomBar,
      aboutButton,
      contactButton,
      copyright,
      aboutOverlay,
      aboutCard,
      aboutClose,
      contactOverlay,
      contactCard,
      contactClose,
      contactLink,
    },
  };
}

async function loadPanels(window, document, { initialize = true } = {}) {
  const context = { window, document, console };
  const motionSource = await readFile(motionSourcePath, "utf8");
  vm.runInNewContext(motionSource, context, { filename: motionSourcePath });
  const source = await readFile(panelsSourcePath, "utf8");
  vm.runInNewContext(source, context, { filename: panelsSourcePath });
  return initialize ? window.BabelSite.ui.initPanels() : undefined;
}

test("modal open/close locks the page, marks background inert, and restores focus", async () => {
  const { window, document, elements } = createSiteDom();
  await loadPanels(window, document);

  elements.aboutButton.dispatchEvent(createEvent("click"));

  assert.equal(elements.aboutOverlay.hidden, false);
  assert.equal(elements.aboutOverlay.inert, false);
  assert.equal(elements.aboutOverlay.getAttribute("aria-hidden"), null);
  assert.equal(elements.aboutButton.getAttribute("aria-expanded"), "true");
  assert.equal(document.body.getAttribute("data-panel-open"), "true");
  assert.equal(document.activeElement, elements.aboutClose);
  assert.equal(elements.skipLink.inert, true);
  assert.equal(elements.sceneShell.inert, true);
  assert.equal(elements.siteShell.inert, true);
  assert.equal(elements.main.inert, true);
  assert.equal(elements.bottomBar.inert, true);
  assert.equal(elements.copyright.inert, true);

  document.dispatchEvent(createEvent("keydown", { key: "Escape" }));

  assert.equal(elements.aboutOverlay.hidden, true);
  assert.equal(elements.aboutOverlay.inert, true);
  assert.equal(elements.aboutOverlay.getAttribute("aria-hidden"), "true");
  assert.equal(elements.aboutButton.getAttribute("aria-expanded"), "false");
  assert.equal(document.body.getAttribute("data-panel-open"), null);
  assert.equal(document.activeElement, elements.aboutButton);
  assert.equal(elements.skipLink.inert, false);
  assert.equal(elements.sceneShell.inert, false);
  assert.equal(elements.siteShell.inert, false);
  assert.equal(elements.main.inert, false);
  assert.equal(elements.bottomBar.inert, false);
  assert.equal(elements.copyright.inert, false);
});

test("a closing dialog becomes inert and aria-hidden before its visual transition ends", async () => {
  const { window, document, elements } = createSiteDom({ reduceMotion: false });
  await loadPanels(window, document);

  elements.aboutButton.dispatchEvent(createEvent("click"));
  elements.aboutClose.dispatchEvent(createEvent("click"));

  assert.equal(elements.aboutOverlay.hidden, false, "the exit transition can remain visible");
  assert.equal(elements.aboutOverlay.inert, true);
  assert.equal(elements.aboutOverlay.getAttribute("aria-hidden"), "true");
  assert.equal(document.body.getAttribute("data-panel-open"), null);
  assert.equal(document.activeElement, elements.aboutButton);

  elements.aboutOverlay.dispatchEvent(
    createEvent("transitionend", { target: elements.aboutOverlay }),
  );
  assert.equal(elements.aboutOverlay.hidden, true);
});

test("focus stays trapped within the active panel", async () => {
  const { window, document, elements } = createSiteDom();
  await loadPanels(window, document);

  elements.contactButton.dispatchEvent(createEvent("click"));
  elements.contactLink.focus();

  const forwardTab = createEvent("keydown", { key: "Tab" });
  document.dispatchEvent(forwardTab);

  assert.equal(forwardTab.defaultPrevented, true);
  assert.equal(document.activeElement, elements.contactClose);

  elements.contactClose.focus();

  const reverseTab = createEvent("keydown", { key: "Tab", shiftKey: true });
  document.dispatchEvent(reverseTab);

  assert.equal(reverseTab.defaultPrevented, true);
  assert.equal(document.activeElement, elements.contactLink);
});

test("coarse-pointer labels and scroll-safe panel rules exist in the stylesheet", async () => {
  const styles = await readFile(stylesPath, "utf8");

  assert.match(styles, /body\[data-panel-open="true"\]\s*\{[^}]*overflow:\s*hidden;/);
  assert.match(
    styles,
    /@media \(hover: none\), \(pointer: coarse\)\s*\{[\s\S]*?\.btn-icon-label\s*\{[\s\S]*?transform:\s*translate\(-50%, 0\);[\s\S]*?opacity:\s*1;/,
  );
  assert.match(styles, /\.panel-overlay\s*\{[^}]*overflow-y:\s*auto;/);
  assert.match(styles, /\.panel-close\s*\{[^}]*position:\s*sticky;/);
  assert.doesNotMatch(styles, /max-height:\s*calc\(100svh\s*-\s*132px\)/);
});

test("panel interaction code does not mutate copy with random scramble effects", async () => {
  const source = await readFile(panelsSourcePath, "utf8");

  assert.doesNotMatch(source, /scramble/i);
  assert.doesNotMatch(source, /Math\.random/);
});


test("reopening cancels an old exit, including stale callbacks during a later exit", async () => {
  const { window, document, elements: e } = createSiteDom({ reduceMotion: false });
  const callbacks = [];
  const cancelled = [];
  window.setTimeout = (callback) => { callbacks.push(callback); return callbacks.length; };
  window.clearTimeout = (id) => cancelled.push(id);
  await loadPanels(window, document);
  e.aboutButton.dispatchEvent(createEvent("click"));
  e.aboutClose.dispatchEvent(createEvent("click"));
  e.aboutButton.dispatchEvent(createEvent("click"));
  assert.ok(cancelled.includes(1));
  callbacks[0]();
  assert.equal(e.aboutOverlay.hidden, false);
  assert.equal(e.aboutOverlay.inert, false);
  e.aboutClose.dispatchEvent(createEvent("click"));
  callbacks[0]();
  assert.equal(e.aboutOverlay.hidden, false, "a stale callback cannot complete a newer exit");
  e.aboutOverlay.dispatchEvent(createEvent("transitionend", { target: e.aboutClose }));
  assert.equal(e.aboutOverlay.hidden, false, "child transitions cannot close the panel");
  callbacks[1]();
  assert.equal(e.aboutOverlay.hidden, true, "fallback completes an interrupted transition");
});

test("switching to reduced motion immediately completes pending exits", async () => {
  const { window, document, elements: e } = createSiteDom({ reduceMotion: false });
  let onChange;
  const query = { matches: false, addEventListener: (_, callback) => { onChange = callback; } };
  window.matchMedia = () => query;
  await loadPanels(window, document);
  e.contactButton.dispatchEvent(createEvent("click"));
  e.contactClose.dispatchEvent(createEvent("click"));
  assert.equal(e.contactOverlay.hidden, false);
  query.matches = true;
  onChange();
  assert.equal(e.contactOverlay.hidden, true);
  e.contactButton.dispatchEvent(createEvent("click"));
  assert.equal(e.contactOverlay.hidden, false);
  e.contactClose.dispatchEvent(createEvent("click"));
  assert.equal(e.contactOverlay.hidden, true);
});


test("nested Contact returns to About before restoring the outer trigger", async () => {
  const { window, document, elements: e } = createSiteDom();
  e.bottomBar.children = e.bottomBar.children.filter(child => child !== e.contactButton);
  e.aboutOverlay.appendChild(e.contactButton);
  await loadPanels(window, document);
  e.aboutButton.dispatchEvent(createEvent("click"));
  e.contactButton.dispatchEvent(createEvent("click"));
  assert.equal(e.contactOverlay.hidden, false);
  assert.equal(e.aboutOverlay.inert, true);
  assert.equal(e.aboutButton.getAttribute("aria-expanded"), "true");
  document.dispatchEvent(createEvent("keydown", {key: "Escape"}));
  assert.equal(e.aboutOverlay.hidden, false);
  assert.equal(e.aboutOverlay.inert, false);
  assert.equal(e.contactOverlay.hidden, true);
  assert.equal(document.activeElement, e.contactButton);
  assert.equal(e.bottomBar.inert, true);
  document.dispatchEvent(createEvent("keydown", {key: "Escape"}));
  assert.equal(e.aboutOverlay.hidden, true);
  assert.equal(document.activeElement, e.aboutButton);
  assert.equal(e.bottomBar.inert, false);
});

// Current homepage fixture: three sibling destinations in main, with no About menu.
function createEstateDom({ reduceMotion = true } = {}) {
  const document = new FakeDocument();
  const media = new FakeElement(document, "media-query");
  media.matches = reduceMotion;
  const window = {
    document, BabelSite: {}, setTimeout, clearTimeout, matchMedia: () => media,
  };
  const skipLink = append(document.body, new FakeElement(document, "a", {
    classNames: ["skip-link"], attributes: { href: "#main" },
  }));
  const main = append(document.body, new FakeElement(document, "main", { id: "main" }));
  const navigation = append(main, new FakeElement(document, "nav"));
  const copyright = append(document.body, new FakeElement(document, "p", {
    classNames: ["site-copyright"],
  }));
  const destinations = {};
  for (const name of ["profile", "experience", "contact"]) {
    const button = append(navigation, new FakeElement(document, "button", {
      classNames: ["bottom-btn", "estate-destination"], dataset: { panel: name },
      attributes: { "aria-expanded": "false", "aria-controls": "panel-" + name },
    }));
    const panel = append(document.body, new FakeElement(document, "div", {
      classNames: ["panel-overlay"], id: "panel-" + name, hidden: true,
    }));
    const card = append(panel, new FakeElement(document, "div", {
      classNames: ["panel-parchment", "panel-surface"], attributes: { tabindex: "-1" },
    }));
    const close = append(card, new FakeElement(document, "button", {
      classNames: ["panel-close"], attributes: { "aria-label": "Close" },
    }));
    const copy = append(card, new FakeElement(document, "p", { textContent: name + " copy" }));
    const link = name === "contact" ? append(card, new FakeElement(document, "a", {
      attributes: { href: "mailto:hello@example.test" },
    })) : null;
    destinations[name] = { button, panel, card, close, copy, link };
  }
  return { window, document, media, main, navigation, copyright, skipLink, destinations };
}

function listenerCount(target) {
  return [...target.listeners.values()].reduce((sum, handlers) => sum + handlers.length, 0);
}

test("each estate destination returns directly to its own trigger on close, backdrop, or Escape", async () => {
  const dom = createEstateDom();
  const { window, document, destinations } = dom;
  assert.equal(await loadPanels(window, document), true);
  for (const destination of Object.values(destinations)) {
    for (const closeBy of ["button", "backdrop", "Escape"]) {
      destination.button.focus();
      destination.button.dispatchEvent(createEvent("click"));
      assert.equal(document.activeElement, destination.close);
      assert.equal(destination.panel.hidden, false);
      assert.equal(destination.button.getAttribute("aria-expanded"), "true");
      for (const node of [dom.main, dom.copyright, dom.skipLink]) assert.equal(node.inert, true);
      for (const other of Object.values(destinations).filter((item) => item !== destination)) {
        assert.equal(other.panel.hidden, true);
        assert.equal(other.button.getAttribute("aria-expanded"), "false");
      }
      destination.panel.dispatchEvent(createEvent("click", { target: destination.copy }));
      assert.equal(destination.panel.hidden, false, "clicking the writing area keeps the dialog open");
      if (closeBy === "button") destination.close.dispatchEvent(createEvent("click"));
      else if (closeBy === "backdrop") destination.panel.dispatchEvent(createEvent("click"));
      else document.dispatchEvent(createEvent("keydown", { key: "Escape" }));
      assert.equal(destination.panel.hidden, true);
      assert.equal(destination.panel.inert, true);
      assert.equal(destination.button.getAttribute("aria-expanded"), "false");
      assert.equal(document.activeElement, destination.button);
      assert.equal(document.body.getAttribute("data-panel-open"), null);
      for (const node of [dom.main, dom.copyright, dom.skipLink]) assert.equal(node.inert, false);
    }
  }
});

test("estate dialogs trap focus with either one control or the Contact email link", async () => {
  const dom = createEstateDom();
  await loadPanels(dom.window, dom.document);
  for (const item of Object.values(dom.destinations)) {
    item.button.dispatchEvent(createEvent("click"));
    const last = item.link || item.close;
    last.focus();
    const forward = createEvent("keydown", { key: "Tab" });
    dom.document.dispatchEvent(forward);
    assert.equal(forward.defaultPrevented, true);
    assert.equal(dom.document.activeElement, item.close);
    const reverse = createEvent("keydown", { key: "Tab", shiftKey: true });
    dom.document.dispatchEvent(reverse);
    assert.equal(reverse.defaultPrevented, true);
    assert.equal(dom.document.activeElement, last);
    dom.main.focus();
    dom.document.dispatchEvent(createEvent("keydown", { key: "Tab" }));
    assert.equal(dom.document.activeElement, item.close, "an escaped focus is returned to the dialog");
    item.close.dispatchEvent(createEvent("click"));
  }
});

test("estate reopening and category switches cannot be hidden by stale transition callbacks", async () => {
  const dom = createEstateDom({ reduceMotion: false });
  const callbacks = [];
  dom.window.setTimeout = (callback) => { callbacks.push(callback); return callbacks.length; };
  dom.window.clearTimeout = () => {};
  await loadPanels(dom.window, dom.document);
  const profile = dom.destinations.profile;
  const contact = dom.destinations.contact;
  profile.button.dispatchEvent(createEvent("click"));
  profile.close.dispatchEvent(createEvent("click"));
  profile.button.dispatchEvent(createEvent("click"));
  callbacks[0]();
  assert.equal(profile.panel.hidden, false);
  assert.equal(profile.panel.inert, false);
  profile.close.dispatchEvent(createEvent("click"));
  contact.button.dispatchEvent(createEvent("click"));
  callbacks[1]();
  assert.equal(profile.panel.hidden, true);
  assert.equal(contact.panel.hidden, false);
  assert.equal(dom.document.activeElement, contact.close);
  contact.close.dispatchEvent(createEvent("click"));
  dom.media.matches = true;
  dom.media.dispatchEvent(createEvent("change"));
  assert.equal(contact.panel.hidden, true, "reduced motion finishes the pending close immediately");
  dom.destinations.experience.button.dispatchEvent(createEvent("click"));
  dom.destinations.experience.close.dispatchEvent(createEvent("click"));
  assert.equal(dom.destinations.experience.panel.hidden, true);
  assert.equal(dom.document.activeElement, dom.destinations.experience.button);
});

test("panel initialization is idempotent without duplicate listeners or toggled-open dialogs", async () => {
  const dom = createEstateDom();
  await loadPanels(dom.window, dom.document);
  for (let i = 0; i < 3; i++) assert.equal(dom.window.BabelSite.ui.initPanels(), true);
  assert.equal(listenerCount(dom.document), 1);
  assert.equal(listenerCount(dom.media), 1);
  for (const item of Object.values(dom.destinations)) {
    assert.equal(listenerCount(item.button), 1);
    assert.equal(listenerCount(item.close), 1);
    assert.equal(listenerCount(item.panel), 1);
    item.button.dispatchEvent(createEvent("click"));
    assert.equal(item.panel.hidden, false);
    item.close.dispatchEvent(createEvent("click"));
  }
});

test("invalid estate panel markup fails without binding and can be repaired before retry", async (t) => {
  for (const missing of ["buttons", "panels", "target", "surface", "close"]) {
    await t.test(missing, async () => {
      const dom = createEstateDom();
      const item = dom.destinations.experience;
      let restore;
      if (missing === "buttons") {
        const saved = dom.navigation.children;
        dom.navigation.children = [];
        restore = () => { dom.navigation.children = saved; };
      } else if (missing === "panels") {
        const saved = dom.document.body.children;
        dom.document.body.children = saved.filter((node) => !node.classList.contains("panel-overlay"));
        restore = () => { dom.document.body.children = saved; };
      } else if (missing === "target") {
        item.button.dataset.panel = "missing";
        restore = () => { item.button.dataset.panel = "experience"; };
      } else if (missing === "surface") {
        item.card.classList.remove("panel-surface");
        restore = () => item.card.classList.add("panel-surface");
      } else {
        item.close.classList.remove("panel-close");
        restore = () => item.close.classList.add("panel-close");
      }
      await loadPanels(dom.window, dom.document, { initialize: false });
      assert.equal(dom.window.BabelSite.ui.initPanels(), false);
      assert.equal(listenerCount(dom.document) + listenerCount(dom.media), 0);
      for (const destination of Object.values(dom.destinations)) {
        assert.equal(listenerCount(destination.button), 0);
        assert.equal(destination.panel.hidden, true);
      }
      restore();
      assert.equal(dom.window.BabelSite.ui.initPanels(), true);
      item.button.dispatchEvent(createEvent("click"));
      assert.equal(item.panel.hidden, false);
      item.close.dispatchEvent(createEvent("click"));
      assert.equal(dom.document.activeElement, item.button);
    });
  }
});

test("a late binding failure rolls back all earlier registrations and allows a clean retry", async () => {
  const dom = createEstateDom();
  await loadPanels(dom.window, dom.document, { initialize: false });
  const originalListen = dom.document.addEventListener;
  dom.document.addEventListener = () => { throw new Error("simulated event registration failure"); };
  assert.equal(dom.window.BabelSite.ui.initPanels(), false);
  assert.equal(listenerCount(dom.media), 0);
  for (const item of Object.values(dom.destinations)) {
    assert.equal(listenerCount(item.button) + listenerCount(item.close) + listenerCount(item.panel), 0);
    item.button.dispatchEvent(createEvent("click"));
    assert.equal(item.panel.hidden, true);
  }
  assert.equal(dom.document.body.getAttribute("data-panel-open"), null);
  assert.equal(dom.main.inert, false);
  dom.document.addEventListener = originalListen;
  assert.equal(dom.window.BabelSite.ui.initPanels(), true);
  assert.equal(listenerCount(dom.document), 1);
  const item = dom.destinations.profile;
  item.button.dispatchEvent(createEvent("click"));
  assert.equal(item.panel.hidden, false);
  item.close.dispatchEvent(createEvent("click"));
  assert.equal(dom.document.activeElement, item.button);
});