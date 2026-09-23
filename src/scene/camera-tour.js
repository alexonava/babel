import { DIRECTED_SHOTS } from "./directed-shots.js";

const TOUR_INTERVALS = Object.freeze([3, 5, 20]);
// Visitors get the long 20-second dwell; 3 and 5 remain review cadences.
export const DEFAULT_TOUR_INTERVAL = 20;
const directedViews = Object.entries(DIRECTED_SHOTS).flatMap(([subject, shots]) =>
  shots.map((shot, angle) => ({ subject, angle, shot })),
);
const tourViews = directedViews.filter(({ shot }) => shot.tour !== false);

export function readTourInterval(search = "") {
  const query = new URLSearchParams(search);
  // A selected view sets the opening composition, not a static mode. The
  // tour stays alive unless a reviewer explicitly requests tour=0.
  if (!query.has("tour")) return DEFAULT_TOUR_INTERVAL;
  const seconds = Number(query.get("tour"));
  return TOUR_INTERVALS.includes(seconds) ? seconds : 0;
}

// Uses scene time rather than a separate timer: hidden/offscreen tabs do not skip
// shots, and all geometry, materials and decoded images remain loaded.
// A brief dip masks a hard camera cut without obscuring the composition long
// enough to feel stalled at a five-second dwell.
export const TOUR_FADE = Object.freeze({ out: 0.3, in: 0.45 });

// The default 20-second mode's pacing: mostly a long, intimate dwell, with an
// occasional short wildcard shot for variety. Sampled fresh each time a shot
// starts, so wildcards land unpredictably rather than on a fixed cadence.
export const TOUR_DWELL = Object.freeze({ base: 20, wildcard: 5, wildcardChance: 0.2 });

export function createCameraTour({
  camera,
  interval = DEFAULT_TOUR_INTERVAL,
  invalidate = () => {},
  random = Math.random,
}) {
  let baseInterval = TOUR_INTERVALS.includes(interval) ? interval : DEFAULT_TOUR_INTERVAL;
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
    held = false,
    ready = false,
    disposed = false;
  function next() {
    const start = directedViews.findIndex(
      ({ subject, angle }) => subject === camera.current && angle === camera.angle,
    );
    for (let offset = 1; offset <= directedViews.length; offset++) {
      const { subject, angle, shot } = directedViews[(start + offset) % directedViews.length];
      if (shot.tour !== false && camera.setPreviewShot(subject, angle)) break;
    }
    duration = sampleDuration();
    elapsed = 0;
    lastTime = null;
    wasActive = false;
    invalidate();
  }
  // Pausing keeps the current shot and its elapsed dwell; resuming continues
  // from there without counting the paused time. A pause shows the shot clear,
  // so resuming steps out of a dip window: an interrupted fade-in stays clear
  // and an interrupted fade-out restarts from clear before its cut.
  function setPaused(value) {
    if (disposed || paused === Boolean(value)) return;
    paused = Boolean(value);
    if (!paused) elapsed = Math.min(Math.max(elapsed, TOUR_FADE.in), duration - TOUR_FADE.out);
    lastTime = null;
    wasActive = false;
    invalidate();
  }
  return {
    // A dialog, a visitor pause or the developer camera can hold the tour
    // mid-dip; show the held shot undimmed rather than a near-black backdrop.
    get fade() {
      if (disposed || !ready || paused || reduced || held) return 0;
      let f = 0;
      if (elapsed < TOUR_FADE.in) f = 1 - elapsed / TOUR_FADE.in;
      else if (elapsed > duration - TOUR_FADE.out)
        f = (elapsed - (duration - TOUR_FADE.out)) / TOUR_FADE.out;
      f = Math.max(0, Math.min(1, f));
      return f * f * (3 - 2 * f);
    },
    get state() {
      const subject = camera.current,
        tourIndex = tourViews.findIndex(
          (view) => view.subject === subject && view.angle === camera.angle,
        );
      return {
        interval: baseInterval,
        dwell: duration,
        paused,
        reduced,
        ready,
        name: DIRECTED_SHOTS[subject]?.[camera.angle]?.name || "Loading views",
        index: tourIndex < 0 ? null : tourIndex + 1,
        total: tourViews.length,
      };
    },
    update({ elapsedSeconds, reducedMotion = false, developer = false, panelOpen = false }) {
      if (disposed) return null;
      reduced = reducedMotion;
      held = developer || panelOpen;
      ready = camera.ready && camera.isAvailable(camera.current);
      const active = ready && !paused && !reduced && !held;
      if (active && wasActive && lastTime !== null)
        elapsed += Math.max(0, elapsedSeconds - lastTime);
      if (elapsed >= duration) next();
      lastTime = elapsedSeconds;
      wasActive = active;
      return reduced ? 0.5 : elapsed / duration;
    },
    setPaused,
    toggle() {
      setPaused(!paused);
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
