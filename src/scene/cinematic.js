import { Box3, Vector3 } from "three";
import { DIRECTED_SHOTS, measureShot, fitShot } from "./directed-shots.js";

export function chooseCinematicView(search = "", random = Math.random) {
  const q = new URLSearchParams(search);
  if (["classic", "assembled"].includes(q.get("architecture")) || q.get("setting") === "previous")
    return "orbit";
  const view = q.get("view");
  return ["tree", "tower", "orbit"].includes(view) ? view : random() < 0.5 ? "tower" : "tree";
}
// Alternate entrance-side views and lantern-side tree views, selected once.
export const CINEMATIC_ANGLES = { tower: [-0.1, -0.55, 1.25], tree: [-1.95, -2.55, -1.35] };
export function chooseCinematicAngle(search = "", view = null, random = Math.random) {
  const q = new URLSearchParams(search),
    explicit = Number(q.get("angle")),
    count = DIRECTED_SHOTS[view]?.length ?? 3;
  if (Number.isInteger(explicit) && explicit >= 1 && explicit <= count) return explicit - 1;
  // A subject override is reproducible even without an angle parameter.
  return q.has("view") ? 0 : Math.floor(random() * count);
}
export function cinematicSafeArea(width, height, hero, nav) {
  const stacked = width < 900 || height > width;
  const top = stacked ? Math.max(24, (hero?.bottom || 180) + 24) : 32;
  const bottom = Math.max(top + 120, Math.min(height - 32, (nav?.top || height - 120) - 28));
  const left = stacked
    ? 20
    : Math.min(width * 0.48, Math.max(width * 0.34, (hero?.right || 300) + 36));
  return {
    left,
    top,
    width: Math.max(140, width - left - 24),
    height: Math.max(120, bottom - top),
  };
}
// Largest dolly-in fraction of the fitted distance within one shot.
export const PUSH_IN = 0.045;
export function createCinematicCamera({
  camera,
  fog,
  selected,
  angle = 0,
  film = false,
  getSafeArea,
  getGroundY,
}) {
  let tower = null,
    tree = null,
    disposed = false,
    started = null,
    applied = false;
  let status = { tower: "pending", tree: "pending" };
  const target = new Vector3();
  let measured = null,
    fitted = null,
    measurementKey = "",
    fitKey = "";
  let currentShot = null;
  const measurements = new Map(),
    fits = new Map();
  const originalFog = fog ? { near: fog.near, far: fog.far } : null;
  function resolved() {
    if (selected === "orbit") return "orbit";
    if (status.tower === "fallback" || status.tower === "procedural") return "orbit";
    if (!tower || status.tower !== "ready") return null;
    if (selected === "tower") return "tower";
    if (tree && status.tree === "ready") return "tree";
    return ["fallback", "procedural"].includes(status.tree) ? "tower" : null;
  }
  return {
    get selected() {
      return selected;
    },
    get angle() {
      return angle;
    },
    isAvailable(kind) {
      return (
        !disposed &&
        Boolean(tower) &&
        status.tower === "ready" &&
        (kind === "tower" || (kind === "tree" && Boolean(tree) && status.tree === "ready"))
      );
    },
    setPreviewShot(kind, nextAngle) {
      if (
        !film ||
        !this.isAvailable(kind) ||
        !Number.isInteger(nextAngle) ||
        nextAngle < 0 ||
        nextAngle >= (DIRECTED_SHOTS[kind]?.length ?? 0)
      )
        return false;
      selected = kind;
      angle = nextAngle;
      started = null;
      measured = fitted = null;
      return true;
    },
    get shot() {
      return currentShot;
    },
    get frame() {
      return fitted;
    },
    get ready() {
      return resolved() !== null;
    },
    get current() {
      return resolved();
    },
    get target() {
      return target;
    },
    applyQuality(profile) {
      if (disposed || !originalFog || !profile?.lighting) return;
      originalFog.near = profile.lighting.fogNear;
      originalFog.far = profile.lighting.fogFar;
    },
    setSubject(kind, root) {
      if (disposed) return;
      measured = fitted = null;
      measurements.clear();
      fits.clear();
      if (kind === "tower") tower = root;
      else tree = root;
    },
    setStatus(record) {
      if (!disposed) status[record.kind] = record.status;
    },
    apply({
      width,
      height,
      elapsedSeconds = 0,
      reducedMotion = false,
      developer = false,
      fallbackFov = 45,
      tourPhase = null,
    }) {
      if (disposed) return false;
      const view = resolved();
      if (developer || !view || view === "orbit") {
        if (applied) {
          if (fog) Object.assign(fog, originalFog);
          if (!developer) camera.fov = fallbackFov;
          camera.updateProjectionMatrix();
          applied = false;
        }
        return false;
      }
      started ??= elapsedSeconds;
      const root = view === "tree" ? tree : tower;
      root.updateWorldMatrix(true, true);
      if (film) {
        const shot = DIRECTED_SHOTS[view][angle] || DIRECTED_SHOTS[view][0];
        const key = root.uuid + root.matrixWorld.elements.join(",") + shot.name;
        if (!measured || measurementKey !== key) {
          measured = measurements.get(key) || measureShot(root, shot);
          measurements.set(key, measured);
          measurementKey = key;
          fitted = null;
        }
        const area = getSafeArea(width, height);
        const nextFitKey = [width, height, area.left, area.top, area.width, area.height].join(",");
        if (fitKey !== nextFitKey) {
          fits.clear();
          fitted = null;
          fitKey = nextFitKey;
        }
        fitted ||= fits.get(measurementKey);
        if (!fitted) {
          let cameraY = measured.cameraY;
          const targetFoot = root.getWorldPosition(new Vector3());
          for (let pass = 0; pass < 6; pass++) {
            fitted = fitShot({ ...measured, cameraY }, shot, area, width, height);
            fitted.cameraY = cameraY;
            if (!getGroundY) break;
            let clearanceY = cameraY;
            // Sample the whole sweep and the dolly-in range (up to PUSH_IN).
            for (let step = -4; step <= 4; step++) {
              const yaw = ((shot.azimuth + (step * shot.arc) / 4) * Math.PI) / 180;
              for (const reach of [1, 1 - PUSH_IN]) {
              const x = measured.target.x + Math.cos(yaw) * fitted.distance * reach,
                z = measured.target.z + Math.sin(yaw) * fitted.distance * reach;
              clearanceY = Math.max(clearanceY, getGroundY(x, z) + 0.8);
              // A low camera can be above the earth yet look through a hill.
              // Keep footing views clear without moving or resizing the subject.
              if (shot.region[0] === 0) {
                const footY =
                  Math.max(measured.footing, getGroundY(targetFoot.x, targetFoot.z)) + 0.18;
                for (let sample = 1; sample < 24; sample++) {
                  const t = sample / 24;
                  const groundY = getGroundY(
                    x * (1 - t) + targetFoot.x * t,
                    z * (1 - t) + targetFoot.z * t,
                  );
                  clearanceY = Math.max(clearanceY, (groundY + 0.08 - footY * t) / (1 - t));
                }
              }
              }
            }
            if (clearanceY - cameraY < 0.005) break;
            cameraY = clearanceY;
          }
          fits.set(measurementKey, fitted);
        }
        currentShot = shot;
        target.copy(measured.target);
        const arc = reducedMotion
          ? 0
          : tourPhase !== null
            ? Math.sin((tourPhase - 0.5) * Math.PI) * shot.arc * 0.5
            : Math.sin(((elapsedSeconds - started) * Math.PI * 2) / 48) * shot.arc;
        // A slow dolly-in gives each dwell a direction: 4.5% over a tour shot,
        // a 2.5% breath over the 48-second arc. The fit keeps a 15% margin.
        const push = reducedMotion
          ? 0
          : tourPhase !== null
            ? PUSH_IN * tourPhase * tourPhase * (3 - 2 * tourPhase)
            : 0.025 * (0.5 - 0.5 * Math.cos(((elapsedSeconds - started) * Math.PI * 2) / 48));
        const distance = fitted.distance * (1 - push);
        const yaw = ((shot.azimuth + arc) * Math.PI) / 180;
        camera.position.set(
          target.x + Math.cos(yaw) * distance,
          fitted.cameraY,
          target.z + Math.sin(yaw) * distance,
        );
        camera.lookAt(target);
        camera.fov = shot.fov;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        camera.projectionMatrix.elements[8] = -((2 * (area.left + area.width / 2)) / width - 1);
        camera.projectionMatrix.elements[9] = -(1 - (2 * (area.top + area.height / 2)) / height);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        if (fog) {
          fog.near = Math.max(originalFog.near, fitted.distance * 0.88);
          fog.far = Math.max(originalFog.far, fitted.distance + 85);
        }
        applied = true;
        return true;
      }
      const subject = view === "tree" ? root.getObjectByName("meshy-tree") || root : root;
      const box = new Box3().setFromObject(subject),
        size = box.getSize(new Vector3());
      box.getCenter(target);
      const area = getSafeArea(width, height),
        aspect = width / height,
        tan = Math.tan((38 * Math.PI) / 360);
      // Fit the box at both arc limits, including perspective depth. This avoids
      // the unnecessary diagonal-width padding that made portrait shots distant.
      const baseYaw = CINEMATIC_ANGLES[view][angle] ?? CINEMATIC_ANGLES[view][0];
      const elevation = Math.atan(0.1),
        c = Math.cos(elevation),
        e = Math.sin(elevation);
      let distance = 0;
      for (const offset of [-4, 0, 4]) {
        const angle = baseYaw + (offset * Math.PI) / 180;
        const depth = (size.x * Math.abs(Math.cos(angle)) + size.z * Math.abs(Math.sin(angle))) / 2;
        const wide = (size.x * Math.abs(Math.sin(angle)) + size.z * Math.abs(Math.cos(angle))) / 2;
        const tall = (size.y / 2) * c + depth * e;
        const nearDepth = depth * c + (size.y / 2) * e;
        distance = Math.max(
          distance,
          (Math.max(
            tall / (tan * (area.height / height) * 0.93),
            wide / (tan * aspect * (area.width / width) * 0.93),
          ) +
            nearDepth) *
            c,
        );
      }
      if (fog) {
        fog.near = Math.max(originalFog.near, distance * 0.9);
        fog.far = Math.max(originalFog.far, distance + 90);
      }
      const arc = reducedMotion
        ? 0
        : (Math.sin(((elapsedSeconds - started) * Math.PI * 2) / 48) * 4 * Math.PI) / 180;
      const yaw = baseYaw + arc;
      camera.position.set(
        target.x + Math.cos(yaw) * distance,
        target.y + distance * 0.1,
        target.z + Math.sin(yaw) * distance,
      );
      camera.lookAt(target);
      camera.fov = 38;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const nx = (2 * (area.left + area.width / 2)) / width - 1,
        ny = 1 - (2 * (area.top + area.height / 2)) / height;
      camera.projectionMatrix.elements[8] = -nx;
      camera.projectionMatrix.elements[9] = -ny;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      applied = true;
      return true;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      tower = tree = null;
      measured = fitted = currentShot = null;
      measurements.clear();
      fits.clear();
      if (fog) Object.assign(fog, originalFog);
      if (applied) {
        camera.fov = 45;
        camera.updateProjectionMatrix();
      }
      return true;
    },
  };
}
export function createQuietScene(objects, setAnimationEnabled = () => {}) {
  let active = false,
    disposed = false,
    saved = [];
  return {
    get active() {
      return active;
    },
    setActive(next) {
      if (disposed || Boolean(next) === active) return;
      active = Boolean(next);
      if (active) {
        saved = [...new Set(objects.filter(Boolean))].map((o) => [o, o.visible]);
        setAnimationEnabled(false);
        this.enforce();
      } else {
        saved.forEach(([o, v]) => (o.visible = v));
        saved = [];
        setAnimationEnabled(true);
      }
    },
    enforce() {
      if (active && !disposed) saved.forEach(([o]) => (o.visible = false));
    },
    dispose() {
      if (disposed) return false;
      this.setActive(false);
      disposed = true;
      return true;
    },
  };
}
