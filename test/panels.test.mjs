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

async function loadPanels(window, document) {
  const context = { window, document, console };
  const motionSource = await readFile(motionSourcePath, "utf8");
  vm.runInNewContext(motionSource, context, { filename: motionSourcePath });
  const source = await readFile(panelsSourcePath, "utf8");
  vm.runInNewContext(source, context, { filename: panelsSourcePath });
  window.BabelSite.ui.initPanels();
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
