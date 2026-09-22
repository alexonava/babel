import { DIRECTED_SHOTS } from "./directed-shots.js";

const TOUR_INTERVALS = Object.freeze([3, 5, 20]);
const directedViews = Object.entries(DIRECTED_SHOTS).flatMap(([subject, shots]) =>
  shots.map((shot, angle) => ({ subject, angle, shot })),
);
const tourViews = directedViews.filter(({ shot }) => shot.tour !== false);

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
