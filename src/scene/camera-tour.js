import { DIRECTED_SHOTS } from "./directed-shots.js";

const TOUR_INTERVALS = Object.freeze([3, 5, 20]);

export function readTourInterval(search = "") {
  const query = new URLSearchParams(search);
  // A selected view sets the opening composition, not a static mode. The
  // tour stays alive unless a reviewer explicitly requests tour=0.
  if (!query.has("tour")) return 5;
  const seconds = Number(query.get("tour"));
  return TOUR_INTERVALS.includes(seconds) ? seconds : 0;
}

// Uses scene time rather than a separate timer: hidden/offscreen tabs do not skip
// shots, and all geometry, materials and decoded images remain loaded.
// A brief dip masks a hard camera cut without obscuring the composition long
// enough to feel stalled at the five-second cadence.
export const TOUR_FADE = Object.freeze({ out: 0.3, in: 0.45 });

// The 20-second mode's actual pacing: mostly a long, intimate dwell, with an
// occasional short wildcard shot for variety. Sampled fresh each time a shot
// starts, so wildcards land unpredictably rather than on a fixed cadence.
export const TOUR_DWELL = Object.freeze({ base: 20, wildcard: 5, wildcardChance: 0.2 });

export function createCameraTour({ camera, interval = 5, invalidate = () => {}, random = Math.random }) {
  let baseInterval = TOUR_INTERVALS.includes(interval) ? interval : 5;
  function sampleDuration() {
    return baseInterval === 20 && random() < TOUR_DWELL.wildcardChance
      ? TOUR_DWELL.wildcard
      : baseInterval;
  }
  let duration = sampleDuration(),
    elapsed = 0,
    lastTime = null,
    wasActive = false,
    paused = false,
    reduced = false,
    ready = false,
    disposed = false;
  function next() {
    const towerCount = DIRECTED_SHOTS.tower.length,
      total = towerCount + DIRECTED_SHOTS.tree.length;
    const start = (camera.current === "tree" ? towerCount : 0) + camera.angle;
    for (let offset = 1; offset <= total; offset++) {
      const i = (start + offset) % total,
        subject = i < towerCount ? "tower" : "tree",
        localAngle = i < towerCount ? i : i - towerCount;
      if (camera.setPreviewShot(subject, localAngle)) break;
    }
    duration = sampleDuration();
    elapsed = 0;
    lastTime = null;
    wasActive = false;
    invalidate();
  }
  return {
    get fade() {
      if (disposed || !ready || paused || reduced) return 0;
      let f = 0;
      if (elapsed < TOUR_FADE.in) f = 1 - elapsed / TOUR_FADE.in;
      else if (elapsed > duration - TOUR_FADE.out)
        f = (elapsed - (duration - TOUR_FADE.out)) / TOUR_FADE.out;
      f = Math.max(0, Math.min(1, f));
      return f * f * (3 - 2 * f);
    },
    get state() {
      const subject = camera.current,
        towerCount = DIRECTED_SHOTS.tower.length,
        total = towerCount + DIRECTED_SHOTS.tree.length;
      return {
        interval: baseInterval,
        dwell: duration,
        paused,
        reduced,
        ready,
        name: DIRECTED_SHOTS[subject]?.[camera.angle]?.name || "Loading views",
        index: (subject === "tree" ? towerCount : 0) + camera.angle + 1,
        total,
      };
    },
    update({ elapsedSeconds, reducedMotion = false, developer = false, panelOpen = false }) {
      if (disposed) return null;
      reduced = reducedMotion;
      ready = camera.ready && camera.isAvailable(camera.current);
      const active = ready && !paused && !reduced && !developer && !panelOpen;
      if (active && wasActive && lastTime !== null)
        elapsed += Math.max(0, elapsedSeconds - lastTime);
      if (elapsed >= duration) next();
      lastTime = elapsedSeconds;
      wasActive = active;
      return reduced ? 0.5 : elapsed / duration;
    },
    toggle() {
      if (disposed) return;
      paused = !paused;
      lastTime = null;
      wasActive = false;
      invalidate();
    },
    next() {
      if (!disposed) next();
    },
    setInterval(seconds) {
      if (disposed || !TOUR_INTERVALS.includes(seconds)) return;
      baseInterval = seconds;
      duration = sampleDuration();
      elapsed = 0;
      lastTime = null;
      wasActive = false;
      invalidate();
    },
    dispose() {
      disposed = true;
      lastTime = null;
      wasActive = false;
    },
  };
}

export function createTourControls({ tour, parent, document }) {
  const root = document.createElement("div");
  root.className = "scene-tour";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Camera preview");
  const label = document.createElement("span");
  label.className = "scene-tour-label";
  const pause = document.createElement("button");
  pause.type = "button";
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Next view";
  const speed = document.createElement("select");
  speed.setAttribute("aria-label", "Seconds per view");
  for (const seconds of [3, 5, 20]) {
    const option = document.createElement("option");
    option.value = String(seconds);
    option.textContent = `${seconds} seconds`;
    speed.append(option);
  }
  const onPause = () => {
    tour.toggle();
    update();
  };
  const onNext = () => {
    tour.next();
    update();
  };
  const onSpeed = () => {
    tour.setInterval(Number(speed.value));
    update();
  };
  pause.addEventListener("click", onPause);
  next.addEventListener("click", onNext);
  speed.addEventListener("change", onSpeed);
  root.append(label, pause, next, speed);
  parent?.append(root);
  let key = "";
  function update() {
    const state = tour.state,
      nextKey = JSON.stringify(state);
    if (key === nextKey) return;
    key = nextKey;
    label.textContent = state.ready ? `${state.name} / ${state.index} of ${state.total}` : "Loading views";
    pause.textContent = state.reduced ? "Motion off" : state.paused ? "Resume" : "Pause";
    pause.disabled = state.reduced || !state.ready;
    next.disabled = !state.ready;
    speed.value = String(state.interval);
  }
  update();
  return {
    update,
    dispose() {
      pause.removeEventListener("click", onPause);
      next.removeEventListener("click", onNext);
      speed.removeEventListener("change", onSpeed);
      root.remove();
      tour.dispose();
    },
  };
}
