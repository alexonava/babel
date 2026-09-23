import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, "..");
const devModePath = path.join(projectRoot, "src", "scene", "dev-mode.js");

// Constants matching src/scene/world.js DEV_MODE block. Tests pass these in
// explicitly so the pure helpers stay decoupled from WORLD.
const C = Object.freeze({
  RUN_SPEED: 21,
  BACK_SPEED: 13.5,
  STRAFE_SPEED: 21,
  GRAVITY: 32,
  JUMP_VY: 17,
  EYE_HEIGHT: 4.86,
  MOUSE_SENSITIVITY: 0.005,
  PITCH_LIMIT: 1.55,
});

function createContext({ touchPrimary = false } = {}) {
  const window = {
    BabelSite: {},
    matchMedia: () => ({ matches: touchPrimary }),
    addEventListener() {},
  };
  const document = {
    addEventListener() {},
    getElementById() {
      return null;
    },
  };
  return { window, document };
}

// Minimal DOM element: enough for the HUD builder, panel flag, and disposal.
function createFakeElement(tagName) {
  const attributes = new Map();
  const element = {
    tagName: tagName.toUpperCase(),
    id: "",
    className: "",
    hidden: false,
    textContent: "",
    children: [],
    parentNode: null,
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    appendChild(child) {
      child.parentNode = element;
      element.children.push(child);
      return child;
    },
    remove() {
      const parent = element.parentNode;
      if (!parent) return;
      parent.children.splice(parent.children.indexOf(element), 1);
      element.parentNode = null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, "[data-field]");
      const found = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (child.hasAttribute("data-field")) found.push(child);
          visit(child);
        }
      };
      visit(element);
      return found;
    },
  };
  return element;
}

// Desktop context with a body, recorded window listeners, and an optional
// pre-existing #dev-mode-hud element.
function createDomContext({ hud = null } = {}) {
  const body = createFakeElement("body");
  const classes = new Set();
  body.classList = {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    contains: (name) => classes.has(name),
  };
  if (hud) body.appendChild(hud);
  const listeners = [];
  const created = [];
  const window = {
    BabelSite: {},
    matchMedia: () => ({ matches: false }),
    addEventListener(type, listener, options) {
      listeners.push({ type, listener, signal: options?.signal });
    },
  };
  const document = {
    body,
    addEventListener() {},
    getElementById(id) {
      return hud && hud.parentNode && hud.id === id ? hud : null;
    },
    createElement(tagName) {
      const element = createFakeElement(tagName);
      created.push(element);
      return element;
    },
  };
  function pressKey(code) {
    let prevented = false;
    const event = {
      code,
      repeat: false,
      target: body,
      preventDefault() {
        prevented = true;
      },
    };
    for (const entry of [...listeners]) {
      if (entry.type === "keydown" && !entry.signal?.aborted) entry.listener(event);
    }
    return prevented;
  }
  return { window, document, body, created, pressKey };
}

function createAttachRefs() {
  return {
    THREE: {
      Euler: class Euler {
        setFromQuaternion() {
          return this;
        }
      },
      Raycaster: class Raycaster {},
    },
    camera: {
      quaternion: {},
      position: {
        x: 0,
        y: 0,
        z: 0,
        set(x, y, z) {
          Object.assign(this, { x, y, z });
        },
      },
    },
    homeScene: { children: [] },
    canvas: { addEventListener() {} },
  };
}

async function loadDevMode(context) {
  const source = await readFile(devModePath, "utf8");
  vm.runInNewContext(
    source,
    {
      window: context.window,
      document: context.document,
      console,
      AbortController,
    },
    { filename: devModePath },
  );
  return context.window.BabelSite.scene.devMode;
}

test("dev-mode exposes pure helpers and starts inactive", async () => {
  const devMode = await loadDevMode(createContext());
  assert.equal(devMode.active, false);
  assert.equal(typeof devMode.attach, "function");
  assert.equal(typeof devMode.update, "function");
  assert.ok(devMode._test, "test helpers exposed");
  assert.equal(typeof devMode._test.buildGroundedVelocity, "function");
  assert.equal(typeof devMode._test.integrateMotion, "function");
  assert.equal(typeof devMode._test.applyGroundClamp, "function");
});

test("dispose releases developer-mode attachment references", async () => {
  const devMode = await loadDevMode(createContext());
  const outlinePass = { enabled: true, selectedObjects: [{}] };
  const THREE = {
    Euler: class Euler {},
    Raycaster: class Raycaster {},
  };

  devMode.attach({
    THREE,
    camera: {},
    homeScene: {},
    canvas: {},
    outlinePass,
  });
  assert.equal(devMode._test.getAttachmentState().hasCamera, true);
  assert.equal(devMode._test.getAttachmentState().hasRaycaster, true);

  devMode.dispose();

  assert.deepEqual(
    { ...devMode._test.getAttachmentState() },
    {
      hasCamera: false,
      hasCanvas: false,
      hasHomeScene: false,
      hasOutlinePass: false,
      hasRaycaster: false,
      hasThree: false,
    },
  );
  assert.equal(outlinePass.enabled, false);
  assert.equal(outlinePass.selectedObjects.length, 0);
});

test("applyMouseDelta clamps pitch using the supplied limit", async () => {
  const { _test } = await loadDevMode(createContext());

  const small = _test.applyMouseDelta(0, 0, 100, 50, 0.005, 1.55);
  assert.equal(small.yaw, -0.5);
  assert.equal(small.pitch, -0.25);

  const upClamp = _test.applyMouseDelta(0, 0, 0, -10000, 0.005, 1.55);
  assert.ok(upClamp.pitch <= 1.55);
  assert.ok(upClamp.pitch >= 1.55 - 1e-6);

  const downClamp = _test.applyMouseDelta(0, 0, 0, 10000, 0.005, 1.55);
  assert.ok(downClamp.pitch >= -1.55);
  assert.ok(downClamp.pitch <= -1.55 + 1e-6);
});

test("buildGroundedVelocity returns zero with no input", async () => {
  const { _test } = await loadDevMode(createContext());
  const v = _test.buildGroundedVelocity(
    new Set(),
    0,
    C.RUN_SPEED,
    C.BACK_SPEED,
    C.STRAFE_SPEED,
    false,
  );
  assert.equal(v.x, 0);
  assert.equal(v.z, 0);
});

test("buildGroundedVelocity at yaw=0: W moves toward -Z, S moves slower toward +Z", async () => {
  const { _test } = await loadDevMode(createContext());

  const fwd = _test.buildGroundedVelocity(
    new Set(["KeyW"]),
    0,
    C.RUN_SPEED,
    C.BACK_SPEED,
    C.STRAFE_SPEED,
    false,
  );
  assert.ok(Math.abs(fwd.x) < 1e-9, `expected vx≈0, got ${fwd.x}`);
  assert.ok(Math.abs(fwd.z + C.RUN_SPEED) < 1e-9, `expected vz=-21, got ${fwd.z}`);

  const back = _test.buildGroundedVelocity(
    new Set(["KeyS"]),
    0,
    C.RUN_SPEED,
    C.BACK_SPEED,
    C.STRAFE_SPEED,
    false,
  );
  assert.ok(Math.abs(back.z - C.BACK_SPEED) < 1e-9, `expected vz=13.5, got ${back.z}`);
});

test("buildGroundedVelocity at yaw=0: A/Q move toward -X, D/E toward +X", async () => {
  const { _test } = await loadDevMode(createContext());

  const left = _test.buildGroundedVelocity(
    new Set(["KeyA"]),
    0,
    C.RUN_SPEED,
    C.BACK_SPEED,
    C.STRAFE_SPEED,
    false,
  );
  assert.ok(Math.abs(left.x + C.STRAFE_SPEED) < 1e-9);

  const right = _test.buildGroundedVelocity(
    new Set(["KeyD"]),
    0,
    C.RUN_SPEED,
    C.BACK_SPEED,
    C.STRAFE_SPEED,
    false,
  );
  assert.ok(Math.abs(right.x - C.STRAFE_SPEED) < 1e-9);

  const q = _test.buildGroundedVelocity(
    new Set(["KeyQ"]),
    0,
    C.RUN_SPEED,
    C.BACK_SPEED,
    C.STRAFE_SPEED,
    false,
  );
  assert.equal(q.x, left.x, "Q should alias A");

  const e = _test.buildGroundedVelocity(
    new Set(["KeyE"]),
    0,
    C.RUN_SPEED,
    C.BACK_SPEED,
    C.STRAFE_SPEED,
    false,
  );
  assert.equal(e.x, right.x, "E should alias D");
});

test("buildGroundedVelocity rotates with yaw: W at yaw=PI/2 moves toward -X", async () => {
  const { _test } = await loadDevMode(createContext());

  const v = _test.buildGroundedVelocity(
    new Set(["KeyW"]),
    Math.PI / 2,
    C.RUN_SPEED,
    C.BACK_SPEED,
    C.STRAFE_SPEED,
    false,
  );
  assert.ok(Math.abs(v.x + C.RUN_SPEED) < 1e-9, `vx should be -21, got ${v.x}`);
  assert.ok(Math.abs(v.z) < 1e-9, `vz should be ~0, got ${v.z}`);
});

test("buildGroundedVelocity clamps diagonal magnitude to RUN_SPEED", async () => {
  const { _test } = await loadDevMode(createContext());

  const diag = _test.buildGroundedVelocity(
    new Set(["KeyW", "KeyD"]),
    0,
    C.RUN_SPEED,
    C.BACK_SPEED,
    C.STRAFE_SPEED,
    false,
  );
  const mag = Math.hypot(diag.x, diag.z);
  assert.ok(
    Math.abs(mag - C.RUN_SPEED) < 1e-9,
    `diagonal magnitude should be RUN_SPEED, got ${mag}`,
  );
});

test("buildGroundedVelocity treats W+S as zero (cancel)", async () => {
  const { _test } = await loadDevMode(createContext());

  const v = _test.buildGroundedVelocity(
    new Set(["KeyW", "KeyS"]),
    0,
    C.RUN_SPEED,
    C.BACK_SPEED,
    C.STRAFE_SPEED,
    false,
  );
  assert.equal(v.x, 0);
  assert.equal(v.z, 0);
});

test("buildGroundedVelocity: autoRun=true with no keys runs forward", async () => {
  const { _test } = await loadDevMode(createContext());

  const auto = _test.buildGroundedVelocity(
    new Set(),
    0,
    C.RUN_SPEED,
    C.BACK_SPEED,
    C.STRAFE_SPEED,
    true,
  );
  assert.ok(Math.abs(auto.z + C.RUN_SPEED) < 1e-9, "autoRun should forward at run speed");

  // Strafing while autoRun is on still produces a diagonal (forward + strafe).
  const autoStrafe = _test.buildGroundedVelocity(
    new Set(["KeyD"]),
    0,
    C.RUN_SPEED,
    C.BACK_SPEED,
    C.STRAFE_SPEED,
    true,
  );
  assert.ok(autoStrafe.z < 0, "still moving forward");
  assert.ok(autoStrafe.x > 0, "still strafing right");
  // Diagonal magnitude clamped to RUN_SPEED.
  const mag = Math.hypot(autoStrafe.x, autoStrafe.z);
  assert.ok(Math.abs(mag - C.RUN_SPEED) < 1e-9);
});

test("integrateMotion: grounded W key sets horizontal velocity, no Y change", async () => {
  const { _test } = await loadDevMode(createContext());
  const state = {
    position: { x: 0, y: 4.86, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    grounded: true,
    groundY: 4.86,
  };
  const input = { keys: new Set(["KeyW"]), jumpRequested: false, autoRun: false };
  const out = _test.integrateMotion(state, input, 1 / 60, C);
  assert.ok(out.velocity.z < 0, "W should drive vz negative");
  assert.equal(out.velocity.y, 0, "no gravity while grounded");
  assert.equal(out.grounded, true);
  assert.equal(out.jumpConsumed, false);
});

test("integrateMotion: jump sets vy to JUMP_VY (minus one tick of gravity) and ungrounds", async () => {
  const { _test } = await loadDevMode(createContext());
  const state = {
    position: { x: 0, y: 4.86, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    grounded: true,
    groundY: 4.86,
  };
  const dt = 1 / 60;
  const input = { keys: new Set(), jumpRequested: true, autoRun: false };
  const out = _test.integrateMotion(state, input, dt, C);
  // The jump fires, ungrounds, then the same frame's airborne branch takes one
  // tick of gravity off vy. Mirrors standing.'s LocalMovementController.
  const expected = C.JUMP_VY - C.GRAVITY * dt;
  assert.ok(
    Math.abs(out.velocity.y - expected) < 1e-9,
    `expected vy≈${expected}, got ${out.velocity.y}`,
  );
  assert.equal(out.grounded, false);
  assert.equal(out.jumpConsumed, true);
});

test("integrateMotion: airborne applies gravity, no air control on x/z", async () => {
  const { _test } = await loadDevMode(createContext());
  const state = {
    position: { x: 0, y: 10, z: 0 },
    velocity: { x: 5, y: 0, z: 0 },
    yaw: 0,
    grounded: false,
    groundY: 4.86,
  };
  // W key while airborne should NOT change vx/vz (no air control).
  const input = { keys: new Set(["KeyW"]), jumpRequested: false, autoRun: false };
  const dt = 1 / 60;
  const out = _test.integrateMotion(state, input, dt, C);
  assert.equal(out.velocity.x, 5, "vx persists in air");
  assert.equal(out.velocity.z, 0, "vz persists in air, ignoring W");
  assert.ok(Math.abs(out.velocity.y + C.GRAVITY * dt) < 1e-9, "gravity applied to vy");
});

test("integrateMotion: jump cannot fire mid-air", async () => {
  const { _test } = await loadDevMode(createContext());
  const state = {
    position: { x: 0, y: 10, z: 0 },
    velocity: { x: 0, y: 5, z: 0 },
    yaw: 0,
    grounded: false,
    groundY: 4.86,
  };
  const input = { keys: new Set(), jumpRequested: true, autoRun: false };
  const out = _test.integrateMotion(state, input, 1 / 60, C);
  assert.equal(out.jumpConsumed, false);
  // vy stays at 5 minus gravity (no jump impulse).
  assert.ok(out.velocity.y < 5, "no jump in air");
});

test("integrateMotion: self-recovery when grounded but Y too high", async () => {
  const { _test } = await loadDevMode(createContext());
  const state = {
    position: { x: 0, y: 10, z: 0 }, // way above groundY
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    grounded: true, // claims grounded but isn't
    groundY: 4.86,
  };
  const input = { keys: new Set(), jumpRequested: false, autoRun: false };
  const out = _test.integrateMotion(state, input, 1 / 60, C);
  assert.equal(out.grounded, false, "self-recovers to airborne");
  assert.ok(out.velocity.y < 0, "gravity starts pulling down");
});

test("applyGroundClamp: snaps Y when at-or-below ground with non-positive vy", async () => {
  const { _test } = await loadDevMode(createContext());
  const state = {
    position: { x: 0, y: 4.0, z: 0 },
    velocity: { x: 5, y: -10, z: 3 },
    grounded: false,
  };
  const out = _test.applyGroundClamp(state, 4.86);
  assert.equal(out.position.y, 4.86);
  assert.equal(out.velocity.y, 0);
  assert.equal(out.grounded, true);
  // Horizontal velocity is preserved
  assert.equal(out.velocity.x, 5);
  assert.equal(out.velocity.z, 3);
});

test("applyGroundClamp: passes through when above ground or moving up", async () => {
  const { _test } = await loadDevMode(createContext());

  const above = {
    position: { x: 0, y: 10, z: 0 },
    velocity: { x: 0, y: -5, z: 0 },
    grounded: false,
  };
  assert.equal(_test.applyGroundClamp(above, 4.86), above, "above ground passes through");

  const ascending = {
    position: { x: 0, y: 4.0, z: 0 },
    velocity: { x: 0, y: 5, z: 0 }, // moving up
    grounded: false,
  };
  assert.equal(
    _test.applyGroundClamp(ascending, 4.86),
    ascending,
    "ascending pass-through even when below",
  );
});

test("getMode classifies movement state for the HUD", async () => {
  const { _test } = await loadDevMode(createContext());

  // Airborne always wins
  assert.equal(_test.getMode(new Set(["KeyW"]), false, false), "air");
  assert.equal(_test.getMode(new Set(), true, false), "air");

  // Grounded states from input
  assert.equal(_test.getMode(new Set(), false, true), "idle");
  assert.equal(_test.getMode(new Set(["KeyW"]), false, true), "run");
  assert.equal(_test.getMode(new Set(["KeyS"]), false, true), "back");
  assert.equal(_test.getMode(new Set(["KeyA"]), false, true), "strafe");
  assert.equal(_test.getMode(new Set(["KeyD"]), false, true), "strafe");
  assert.equal(_test.getMode(new Set(["KeyQ"]), false, true), "strafe", "Q is strafe");
  assert.equal(_test.getMode(new Set(["KeyE"]), false, true), "strafe", "E is strafe");

  // autoRun forces run when grounded with no key
  assert.equal(_test.getMode(new Set(), true, true), "run");
});

test("pickFirstOutlineable skips Sprite/Points/invisible objects", async () => {
  const { _test } = await loadDevMode(createContext());

  const mesh = { isMesh: true, visible: true };
  const sprite = { isSprite: true, visible: true };
  const points = { isPoints: true, visible: true };
  const hidden = { isMesh: true, visible: false };

  assert.equal(_test.pickFirstOutlineable([]), null);
  assert.equal(_test.pickFirstOutlineable(null), null);
  assert.equal(_test.pickFirstOutlineable([{ object: sprite }, { object: mesh }]), mesh);
  assert.equal(_test.pickFirstOutlineable([{ object: points }, { object: mesh }]), mesh);
  assert.equal(_test.pickFirstOutlineable([{ object: hidden }, { object: mesh }]), mesh);
  assert.equal(
    _test.pickFirstOutlineable([{ object: sprite }, { object: points }, { object: hidden }]),
    null,
  );
});

test("setOutlineTarget enables OutlinePass only while a developer target is active", async () => {
  const { _test } = await loadDevMode(createContext());
  const pass = { enabled: true, selectedObjects: [{}] };
  const target = { isMesh: true };

  _test.setOutlineTarget(pass, null);
  assert.equal(pass.enabled, false);
  assert.equal(pass.selectedObjects.length, 0);

  _test.setOutlineTarget(pass, target);
  assert.equal(pass.enabled, true);
  assert.equal(pass.selectedObjects[0], target);
});

test("isFormTarget gates form fields and contenteditable surfaces", async () => {
  const { _test } = await loadDevMode(createContext());
  assert.equal(_test.isFormTarget(null), false);
  assert.equal(_test.isFormTarget({ tagName: "DIV" }), false);
  assert.equal(_test.isFormTarget({ tagName: "INPUT" }), true);
  assert.equal(_test.isFormTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(_test.isFormTarget({ tagName: "SELECT" }), true);
  assert.equal(_test.isFormTarget({ tagName: "DIV", isContentEditable: true }), true);
});

test("isTouchDevice reports the matchMedia result", async () => {
  const desktop = await loadDevMode(createContext({ touchPrimary: false }));
  assert.equal(desktop._test.isTouchDevice(), false);

  const touch = await loadDevMode(createContext({ touchPrimary: true }));
  assert.equal(touch._test.isTouchDevice(), true);
});

test("scene bootstrap attaches the developer camera only for sceneDebug sessions", async () => {
  const source = await readFile(path.join(projectRoot, "src", "scene", "index.js"), "utf8");

  // The flag comes from the quality controls already parsed from the URL.
  assert.match(source, /const qualityControls = qualityState\.controls \|\|/);
  assert.equal(source.match(/scene\.devMode\.attach\(/g)?.length, 1);
  // The developer tools are imported on demand behind the flag. The request
  // starts as soon as the flag is known, so the download overlaps
  // initialization; attach waits for the chunk and runs only if the runtime is
  // still alive. Load and attach failures are both reported.
  assert.equal(source.match(/import\("\.\/developer-tools\.js"\)/g)?.length, 1);
  assert.match(
    source,
    /const developerTools = qualityControls\.debug\s*\? import\("\.\/developer-tools\.js"\)\.catch\(\(error\) => \{\s*console\.warn\("Scene developer tools failed to load\.", error\);\s*return null;\s*\}\)\s*: null;/,
  );
  assert.ok(
    source.indexOf("const developerTools = ") < source.indexOf("createSceneRendering("),
    "the developer chunk is requested before the renderer is built",
  );
  assert.match(
    source,
    /developerTools\s*\?\.then\(\(tools\) => \{\s*if \(!tools \|\| runtimeDisposed \|\| typeof scene\.devMode\?\.attach !== "function"\) return;\s*scene\.devMode\.attach\(/,
  );
  assert.match(
    source,
    /\.catch\(\(error\) => console\.warn\("Scene developer tools failed to attach\.", error\)\);/,
  );
  assert.match(
    source,
    /ensureOutlinePass: \(\) => rendering\.ensureOutlinePass\(tools\.createOutlinePass\)/,
  );
});

test("default visitors' scene modules never import the developer camera or OutlinePass", async () => {
  const read = (...parts) => readFile(path.join(projectRoot, "src", ...parts), "utf8");
  const entry = await read("scene-entry.js");
  const rendering = await read("scene", "rendering.js");
  const tools = await read("scene", "developer-tools.js");
  assert.doesNotMatch(entry, /^import[^\n]*(?:dev-mode|developer-tools)/m);
  assert.doesNotMatch(rendering, /OutlinePass\.js/);
  assert.match(rendering, /createOutlinePass = null,/);
  // developer-tools.js is the only module that brings both in.
  assert.match(tools, /^import "\.\/dev-mode\.js";$/m);
  assert.match(
    tools,
    /^import \{ OutlinePass \} from "three\/examples\/jsm\/postprocessing\/OutlinePass\.js";$/m,
  );
  assert.match(tools, /export function createOutlinePass\(size, homeScene, camera\) \{/);
  const sources = [];
  const walk = async (dir) => {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) await walk(file);
      else if (item.name.endsWith(".js")) sources.push(file);
    }
  };
  await walk(path.join(projectRoot, "src"));
  for (const file of sources) {
    if (file.endsWith(`${path.sep}developer-tools.js`)) continue;
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /import[^;]*["'][^"']*(?:dev-mode|OutlinePass)\.js["']/, file);
  }
});

test("dispose is safe when the developer camera was never attached", async () => {
  const context = createDomContext();
  const devMode = await loadDevMode(context);

  assert.doesNotThrow(() => devMode.dispose());
  assert.equal(devMode.active, false);
  assert.equal(context.body.children.length, 0);
  assert.equal(context.created.length, 0);
});

test("Backquote does nothing while a panel is open", async () => {
  const context = createDomContext();
  const devMode = await loadDevMode(context);
  devMode.attach(createAttachRefs());

  context.body.setAttribute("data-panel-open", "true");
  assert.equal(context.pressKey("Backquote"), false, "key is left to the page");
  assert.equal(devMode.active, false);
  assert.equal(context.body.classList.contains("dev-mode-active"), false);
  assert.equal(context.created.length, 0, "no HUD is built");

  context.body.removeAttribute("data-panel-open");
  assert.equal(context.pressKey("Backquote"), true);
  assert.equal(devMode.active, true);
  assert.equal(context.body.classList.contains("dev-mode-active"), true);

  // Leaving only reveals the page, so it is never blocked.
  context.body.setAttribute("data-panel-open", "true");
  context.pressKey("Backquote");
  assert.equal(devMode.active, false);
  assert.equal(context.body.classList.contains("dev-mode-active"), false);
  devMode.dispose();
});

test("the HUD is built on first entry when its markup is absent and removed on dispose", async () => {
  const context = createDomContext();
  const devMode = await loadDevMode(context);
  devMode.attach(createAttachRefs());
  assert.equal(context.body.children.length, 0, "attach alone builds nothing");

  context.pressKey("Backquote");
  assert.equal(context.body.children.length, 1);
  const hud = context.body.children[0];
  assert.equal(hud.tagName, "ASIDE");
  assert.equal(hud.id, "dev-mode-hud");
  assert.equal(hud.className, "dev-mode-hud");
  assert.equal(hud.getAttribute("aria-hidden"), "true");
  assert.equal(hud.hidden, false);
  assert.ok(hud.children.every((row) => row.className === "dev-mode-hud__row"));
  assert.deepEqual(
    hud.children.map(({ children: [label, field] }) => [
      label.textContent,
      field.getAttribute("data-field"),
      field.textContent,
    ]),
    [
      ["pos", "pos", "0, 0, 0"],
      ["vel", "vel", "0, 0, 0"],
      ["speed", "speed", "0"],
      ["yaw", "yaw", "0°"],
      ["mode", "mode", "idle"],
      ["grounded", "grounded", "yes"],
      ["autoRun", "autoRun", "off"],
      ["ground", "ground", "0"],
    ],
  );

  context.pressKey("Backquote");
  assert.equal(hud.hidden, true, "exit hides the HUD");
  const createdCount = context.created.length;
  context.pressKey("Backquote");
  assert.equal(context.body.children[0], hud, "re-entry reuses the built HUD");
  assert.equal(context.created.length, createdCount);

  devMode.dispose();
  assert.equal(context.body.children.length, 0);
  assert.equal(hud.parentNode, null);
});

test("an existing HUD element is reused and left in place on dispose", async () => {
  const hud = createFakeElement("aside");
  hud.id = "dev-mode-hud";
  hud.hidden = true;
  const field = createFakeElement("span");
  field.setAttribute("data-field", "mode");
  hud.appendChild(field);
  const context = createDomContext({ hud });
  const devMode = await loadDevMode(context);
  devMode.attach(createAttachRefs());

  context.pressKey("Backquote");
  assert.equal(context.created.length, 0);
  assert.equal(hud.hidden, false);

  devMode.dispose();
  assert.equal(hud.parentNode, context.body);
  assert.equal(hud.hidden, true);
});
