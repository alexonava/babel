// Developer-mode (first-person, grounded character) for the babel hero scene.
//
// With ?sceneDebug=1, press Backquote (`) to take over the orbital camera as a
// first-person character: WASD walks horizontally relative to where you're
// looking, Q/E strafe (aliases of A/D — matches the standing. project), Space
// jumps, R toggles autoRun, and you hold left-mouse-button and drag to look
// around. Whatever the screen center points at gets a brass outline.
// Press Backquote again to return to the orbital camera. The key is ignored
// while a panel is open, because developer mode hides all page UI.
//
// Movement model is hand-rolled Newtonian, ported from the standing. project's
// LocalMovementController (yards -> feet, x3, no R3F scaffolding). No physics
// dependency. No lateral collision in v1 — you can clip through the tower.
// Ground Y tracks scene.groundHeight(x, z) so the camera follows terrain.
//
// Drag-to-look (rather than pointer lock) is intentional: cursor stays
// available for DevTools, copying text, and clicking UI while inspecting.
//
// The module is bundled into scripts/scene.HASH.js, but initHomeScene only
// attaches it for ?sceneDebug=1 sessions; otherwise it registers nothing.
// Attached, it does nothing until the activation key; inactive cost is one
// keydown listener. The debug HUD is built on first entry, not shipped in the
// page markup. Touch devices are silently ignored (no click-and-drag look).
//
// Pure-function helpers (mouse-delta math, velocity-vector math, motion
// integration, ground clamp, hit picking) are exposed via
// `scene.devMode._test` for node:test coverage.
(() => {
  const site = (window.BabelSite = window.BabelSite || {});
  const scene = (site.scene = site.scene || {});

  const ACTIVATION_KEY = "Backquote";

  // External references injected by initHomeScene via attach(). Until attach
  // runs, the module just sits idle.
  let THREE = null;
  let camera = null;
  let homeScene = null;
  let canvas = null;
  let outlinePass = null;
  let requestOutlinePass = null;
  let raycaster = null;
  let euler = null;

  // Debug HUD: resolved once on first entry so update() doesn't re-query each
  // frame. An existing #dev-mode-hud is reused; otherwise one is built from
  // HUD_ROWS ([data-field, default text]) and removed again on dispose().
  // Field elements keyed by their data-field attribute.
  const HUD_ROWS = [
    ["pos", "0, 0, 0"],
    ["vel", "0, 0, 0"],
    ["speed", "0"],
    ["yaw", "0°"],
    ["mode", "idle"],
    ["grounded", "yes"],
    ["autoRun", "off"],
    ["ground", "0"],
  ];
  let hudRoot = null;
  let hudCreated = false;
  const hudFields = Object.create(null);

  // Per-session state.
  const keys = new Set();
  let mouseDeltaX = 0;
  let mouseDeltaY = 0;
  let yaw = 0;
  let pitch = 0;
  let isDragging = false;
  const velocity = { x: 0, y: 0, z: 0 };
  let grounded = true;
  let jumpRequested = false;
  let autoRun = false;
  let sessionAbort = null;
  let globalAbort = null;
  let onActivityChange = null;

  function isTouchDevice() {
    try {
      return window.matchMedia?.("(pointer: coarse)")?.matches === true;
    } catch (_err) {
      return false;
    }
  }

  function isFormTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  // panels.js marks <body data-panel-open> while any dialog is open.
  function isPanelOpen() {
    return document.body?.hasAttribute?.("data-panel-open") === true;
  }

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  // Pure: apply a mouse delta to a yaw/pitch pair, clamping pitch.
  function applyMouseDelta(currentYaw, currentPitch, dx, dy, sensitivity, pitchLimit) {
    return {
      yaw: currentYaw - dx * sensitivity,
      pitch: clamp(currentPitch - dy * sensitivity, -pitchLimit, pitchLimit),
    };
  }

  // Pure: read keystate + yaw, return horizontal world-space velocity.
  // Q aliases A (left strafe), E aliases D (right strafe) — matches standing.
  // No vertical component; gravity is the only Y influence on velocity.
  function buildGroundedVelocity(keySet, yawValue, runSpeed, backSpeed, strafeSpeed, autoRunOn) {
    let forward = 0;
    let strafe = 0;
    if (keySet.has("KeyW") || keySet.has("ArrowUp")) forward += 1;
    if (keySet.has("KeyS") || keySet.has("ArrowDown")) forward -= 1;
    if (keySet.has("KeyA") || keySet.has("ArrowLeft") || keySet.has("KeyQ")) strafe -= 1;
    if (keySet.has("KeyD") || keySet.has("ArrowRight") || keySet.has("KeyE")) strafe += 1;

    if (autoRunOn && forward < 1) forward = 1;

    if (forward === 0 && strafe === 0) return { x: 0, z: 0 };

    // Three.js camera looks toward -Z at yaw=0. Forward in world: (-sin, 0, -cos).
    // Right is rotated 90° clockwise from forward (viewed from above): (cos, 0, -sin).
    const fwdX = -Math.sin(yawValue);
    const fwdZ = -Math.cos(yawValue);
    const rightX = Math.cos(yawValue);
    const rightZ = -Math.sin(yawValue);

    const fwdSign = Math.sign(forward);
    const fwdSpeed = forward > 0 ? runSpeed : forward < 0 ? backSpeed : 0;

    let vx = fwdX * fwdSign * fwdSpeed + rightX * strafe * strafeSpeed;
    let vz = fwdZ * fwdSign * fwdSpeed + rightZ * strafe * strafeSpeed;

    // Clamp diagonal magnitude so W+D doesn't outpace W alone.
    const magnitude = Math.hypot(vx, vz);
    if (magnitude > runSpeed) {
      const scale = runSpeed / magnitude;
      vx *= scale;
      vz *= scale;
    }

    return { x: vx, z: vz };
  }

  // Pure: integrate one frame of velocity and position from input + state.
  // Does NOT apply ground clamp — that requires sampling the world at the
  // new (x, z), which is the caller's responsibility.
  function integrateMotion(state, input, delta, c) {
    let vx = state.velocity.x;
    let vy = state.velocity.y;
    let vz = state.velocity.z;
    let nextGrounded = state.grounded;
    let jumpConsumed = false;

    // Self-recovery: if flagged grounded but we're meaningfully above ground,
    // treat as airborne so gravity recovers us. Mirrors standing.'s 1e-3 slack.
    if (nextGrounded && state.position.y > state.groundY + 1e-3) {
      nextGrounded = false;
    }

    if (input.jumpRequested && nextGrounded) {
      vy = c.JUMP_VY;
      nextGrounded = false;
      jumpConsumed = true;
    }

    if (nextGrounded) {
      const horiz = buildGroundedVelocity(
        input.keys,
        state.yaw,
        c.RUN_SPEED,
        c.BACK_SPEED,
        c.STRAFE_SPEED,
        input.autoRun,
      );
      vx = horiz.x;
      vz = horiz.z;
    } else {
      // No air control; horizontal velocity persists from take-off.
      vy -= c.GRAVITY * delta;
    }

    return {
      position: {
        x: state.position.x + vx * delta,
        y: state.position.y + vy * delta,
        z: state.position.z + vz * delta,
      },
      velocity: { x: vx, y: vy, z: vz },
      grounded: nextGrounded,
      jumpConsumed,
    };
  }

  // Pure: snap Y to groundY when we're at-or-below it with non-positive vy.
  // Otherwise pass through unchanged.
  function applyGroundClamp(state, groundY) {
    if (state.position.y <= groundY && state.velocity.y <= 0) {
      return {
        position: { x: state.position.x, y: groundY, z: state.position.z },
        velocity: { x: state.velocity.x, y: 0, z: state.velocity.z },
        grounded: true,
      };
    }
    return state;
  }

  // Pure: classify the current movement state for the debug HUD. Mirrors
  // standing.'s MovementMode enum (idle / run / back / strafe / air).
  function getMode(keySet, autoRunOn, isGrounded) {
    if (!isGrounded) return "air";
    let forward =
      (keySet.has("KeyW") || keySet.has("ArrowUp") ? 1 : 0) -
      (keySet.has("KeyS") || keySet.has("ArrowDown") ? 1 : 0);
    if (autoRunOn && forward < 1) forward = 1;
    if (forward > 0) return "run";
    if (forward < 0) return "back";
    const strafe =
      (keySet.has("KeyD") || keySet.has("KeyE") || keySet.has("ArrowRight") ? 1 : 0) -
      (keySet.has("KeyA") || keySet.has("KeyQ") || keySet.has("ArrowLeft") ? 1 : 0);
    if (strafe !== 0) return "strafe";
    return "idle";
  }

  // Pure: from a list of raycaster hits, pick the first object suitable for
  // OutlinePass (Mesh-shaped, visible, not Sprite/Points).
  function pickFirstOutlineable(hits) {
    if (!hits) return null;
    for (let i = 0; i < hits.length; i += 1) {
      const obj = hits[i].object;
      if (!obj) continue;
      if (obj.isSprite || obj.isPoints) continue;
      if (obj.visible === false) continue;
      return obj;
    }
    return null;
  }

  function setOutlineTarget(pass, target) {
    if (!pass) return;
    pass.selectedObjects = target ? [target] : [];
    pass.enabled = Boolean(target);
  }

  function ensureDeveloperOutlinePass() {
    if (!outlinePass && requestOutlinePass) {
      outlinePass = requestOutlinePass() || null;
    }
    return outlinePass;
  }

  function attach(refs) {
    THREE = refs.THREE;
    camera = refs.camera;
    homeScene = refs.homeScene;
    canvas = refs.canvas;
    outlinePass = refs.outlinePass || null;
    requestOutlinePass =
      typeof refs.ensureOutlinePass === "function" ? refs.ensureOutlinePass : null;
    onActivityChange = typeof refs.onActivityChange === "function" ? refs.onActivityChange : null;
    setOutlineTarget(outlinePass, null);

    raycaster = new THREE.Raycaster();
    euler = new THREE.Euler(0, 0, 0, "YXZ");

    if (isTouchDevice()) return;

    globalAbort = new AbortController();
    window.addEventListener("keydown", onActivationKey, { signal: globalAbort.signal });
  }

  function ensureHud() {
    if (hudRoot) return hudRoot;
    hudRoot = document.getElementById("dev-mode-hud");
    if (hudRoot) {
      const nodes = hudRoot.querySelectorAll("[data-field]");
      for (let i = 0; i < nodes.length; i += 1) {
        hudFields[nodes[i].getAttribute("data-field")] = nodes[i];
      }
      return hudRoot;
    }
    if (!document.body || typeof document.createElement !== "function") return null;
    hudRoot = document.createElement("aside");
    hudRoot.id = "dev-mode-hud";
    hudRoot.className = "dev-mode-hud";
    hudRoot.hidden = true;
    hudRoot.setAttribute("aria-hidden", "true");
    for (const [name, text] of HUD_ROWS) {
      const row = document.createElement("div");
      const label = document.createElement("span");
      const field = document.createElement("span");
      row.className = "dev-mode-hud__row";
      label.textContent = name;
      field.setAttribute("data-field", name);
      field.textContent = text;
      row.appendChild(label);
      row.appendChild(field);
      hudRoot.appendChild(row);
      hudFields[name] = field;
    }
    document.body.appendChild(hudRoot);
    hudCreated = true;
    return hudRoot;
  }

  function fmt(n, digits = 1) {
    return Number(n).toFixed(digits);
  }

  function writeHUD(position, vel, mode, isGrounded, autoRunOn, yawValue, groundY) {
    if (!hudRoot || hudRoot.hidden) return;
    if (hudFields.pos)
      hudFields.pos.textContent = `${fmt(position.x)}, ${fmt(position.y)}, ${fmt(position.z)}`;
    if (hudFields.vel) hudFields.vel.textContent = `${fmt(vel.x)}, ${fmt(vel.y)}, ${fmt(vel.z)}`;
    if (hudFields.speed) hudFields.speed.textContent = fmt(Math.hypot(vel.x, vel.z));
    if (hudFields.yaw) hudFields.yaw.textContent = `${fmt((yawValue * 180) / Math.PI, 0)}°`;
    if (hudFields.mode) hudFields.mode.textContent = mode;
    if (hudFields.grounded) hudFields.grounded.textContent = isGrounded ? "yes" : "no";
    if (hudFields.autoRun) hudFields.autoRun.textContent = autoRunOn ? "on" : "off";
    if (hudFields.ground) hudFields.ground.textContent = fmt(groundY);
  }

  function onActivationKey(event) {
    if (event.repeat) return;
    if (event.code !== ACTIVATION_KEY) return;
    if (isFormTarget(event.target)) return;
    // Entering hides all page UI, so never cover an open dialog. Leaving only
    // reveals UI and stays available.
    if (!devMode.active && isPanelOpen()) return;
    event.preventDefault();
    if (devMode.active) {
      exit();
    } else {
      enter();
    }
  }

  function enter() {
    if (!camera || !canvas) return;
    ensureDeveloperOutlinePass();
    devMode.active = true;
    if (onActivityChange) onActivityChange(true);

    // Seed yaw/pitch from camera's current orientation.
    euler.setFromQuaternion(camera.quaternion);
    yaw = euler.y;
    const pitchLimit = scene.WORLD?.DEV_MODE?.PITCH_LIMIT ?? 1.55;
    pitch = clamp(euler.x, -pitchLimit, pitchLimit);

    // Spawn at ground-beneath-where-you-were-watching.
    const eyeHeight = scene.WORLD?.DEV_MODE?.EYE_HEIGHT ?? 4.86;
    const px = camera.position.x;
    const pz = camera.position.z;
    const groundFn = scene.groundHeight;
    const py = (typeof groundFn === "function" ? groundFn(px, pz) : 0) + eyeHeight;
    camera.position.set(px, py, pz);

    // Reset character state.
    velocity.x = 0;
    velocity.y = 0;
    velocity.z = 0;
    grounded = true;
    jumpRequested = false;
    autoRun = false;

    if (ensureHud()) hudRoot.hidden = false;
    if (document.body) document.body.classList.add("dev-mode-active");

    sessionAbort = new AbortController();
    const { signal } = sessionAbort;
    canvas.addEventListener("mousedown", onMouseDown, { signal });
    window.addEventListener("mouseup", onMouseUp, { signal });
    window.addEventListener("blur", onBlur, { signal });
    window.addEventListener("keydown", onKeyDown, { signal });
    window.addEventListener("keyup", onKeyUp, { signal });
    window.addEventListener("mousemove", onMouseMove, { signal });
  }

  function exit() {
    devMode.active = false;
    keys.clear();
    mouseDeltaX = 0;
    mouseDeltaY = 0;
    isDragging = false;
    velocity.x = 0;
    velocity.y = 0;
    velocity.z = 0;
    grounded = true;
    jumpRequested = false;
    autoRun = false;
    if (sessionAbort) {
      sessionAbort.abort();
      sessionAbort = null;
    }
    setOutlineTarget(outlinePass, null);
    if (onActivityChange) onActivityChange(false);
    if (hudRoot) hudRoot.hidden = true;
    if (document.body) document.body.classList.remove("dev-mode-active");
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    isDragging = true;
    mouseDeltaX = 0;
    mouseDeltaY = 0;
  }

  function onMouseUp(event) {
    if (event.button !== 0) return;
    isDragging = false;
  }

  function onBlur() {
    isDragging = false;
    keys.clear();
    jumpRequested = false;
    autoRun = false;
  }

  function onKeyDown(event) {
    if (event.code === ACTIVATION_KEY) return; // Toggle handled globally.
    if (event.code === "Space") {
      jumpRequested = true;
      event.preventDefault(); // Don't let Space scroll the page.
    }
    if (event.code === "KeyR") {
      autoRun = !autoRun;
    }
    if (event.code === "KeyW" || event.code === "KeyS") {
      autoRun = false;
    }
    keys.add(event.code);
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    if (!isDragging) return;
    mouseDeltaX += event.movementX || 0;
    mouseDeltaY += event.movementY || 0;
  }

  // Per-frame update called from the scene render loop. When this runs, the
  // orbital camera math is being skipped — we own the camera transform.
  function update(activeCamera, deltaSeconds) {
    if (!devMode.active) return;

    const c = scene.WORLD?.DEV_MODE;
    if (!c) return;

    // Look (mouse drag).
    const updated = applyMouseDelta(
      yaw,
      pitch,
      mouseDeltaX,
      mouseDeltaY,
      c.MOUSE_SENSITIVITY,
      c.PITCH_LIMIT,
    );
    yaw = updated.yaw;
    pitch = updated.pitch;
    mouseDeltaX = 0;
    mouseDeltaY = 0;
    euler.set(pitch, yaw, 0, "YXZ");
    activeCamera.quaternion.setFromEuler(euler);

    // Sample ground beneath the camera's current x,z for the self-recovery
    // check inside integrateMotion.
    const groundFn = scene.groundHeight;
    const groundYNow =
      (typeof groundFn === "function"
        ? groundFn(activeCamera.position.x, activeCamera.position.z)
        : 0) + c.EYE_HEIGHT;

    const stateIn = {
      position: {
        x: activeCamera.position.x,
        y: activeCamera.position.y,
        z: activeCamera.position.z,
      },
      velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
      yaw,
      grounded,
      groundY: groundYNow,
    };
    const input = { keys, jumpRequested, autoRun };

    const stepped = integrateMotion(stateIn, input, deltaSeconds, c);
    if (stepped.jumpConsumed) jumpRequested = false;

    // Sample ground at the NEW (x, z) for the landing clamp.
    const groundYNext =
      (typeof groundFn === "function" ? groundFn(stepped.position.x, stepped.position.z) : 0) +
      c.EYE_HEIGHT;
    const clamped = applyGroundClamp(stepped, groundYNext);

    activeCamera.position.set(clamped.position.x, clamped.position.y, clamped.position.z);
    velocity.x = clamped.velocity.x;
    velocity.y = clamped.velocity.y;
    velocity.z = clamped.velocity.z;
    grounded = clamped.grounded;

    writeHUD(
      clamped.position,
      velocity,
      getMode(keys, autoRun, grounded),
      grounded,
      autoRun,
      yaw,
      groundYNext,
    );

    // Outline raycast on screen-center.
    if (outlinePass && raycaster) {
      raycaster.setFromCamera({ x: 0, y: 0 }, activeCamera);
      const hits = raycaster.intersectObjects(homeScene.children, true);
      const target = pickFirstOutlineable(hits);
      setOutlineTarget(outlinePass, target);
    }
  }

  function dispose() {
    if (devMode.active) exit();
    if (globalAbort) {
      globalAbort.abort();
      globalAbort = null;
    }
    if (sessionAbort) {
      sessionAbort.abort();
      sessionAbort = null;
    }
    setOutlineTarget(outlinePass, null);
    keys.clear();
    THREE = null;
    camera = null;
    homeScene = null;
    canvas = null;
    outlinePass = null;
    requestOutlinePass = null;
    raycaster = null;
    euler = null;
    if (hudCreated) hudRoot?.remove();
    hudCreated = false;
    hudRoot = null;
    for (const field of Object.keys(hudFields)) {
      delete hudFields[field];
    }
    onActivityChange = null;
  }

  function getAttachmentState() {
    return {
      hasCamera: Boolean(camera),
      hasCanvas: Boolean(canvas),
      hasHomeScene: Boolean(homeScene),
      hasOutlinePass: Boolean(outlinePass),
      hasRaycaster: Boolean(raycaster),
      hasThree: Boolean(THREE),
    };
  }

  const devMode = {
    active: false,
    attach,
    dispose,
    update,
    _test: {
      applyMouseDelta,
      buildGroundedVelocity,
      integrateMotion,
      applyGroundClamp,
      getMode,
      getAttachmentState,
      ensureDeveloperOutlinePass,
      pickFirstOutlineable,
      setOutlineTarget,
      isTouchDevice,
      isFormTarget,
      ACTIVATION_KEY,
    },
  };
  scene.devMode = devMode;
})();
