import { Group, Vector3 } from "three";

export function createSceneAtmosphere({
  onInvalidate,
  parent,
  profile,
  qualityDebug,
  visibilityTracker,
}) {
  const root = new Group();
  parent.add(root);

  const cloudGroups = [];
  const decorativeSystems = [];
  let cloudAnchor = null;
  let cloudsEnabled = true;
  let disposed = false;
  let lowPower = Boolean(profile?.isLow);
  let pointField = null, film = false, pointSize = 1;

  function setCloudGroupSceneVisibility(group, visible) {
    if (!group) return;
    group.userData = group.userData || {};
    group.userData.sceneVisible = visible;
    group.visible = cloudsEnabled && visible;
  }

  function applyCloudVisibility() {
    cloudGroups.forEach((group) => {
      if (!group) return;
      const sceneVisible = group.userData?.sceneVisible !== false;
      group.visible = cloudsEnabled && sceneVisible;
    });
  }

  function updateDecorativeVisibility() {
    const debugSystems = qualityDebug ? {} : null;
    let cloudVisibilityDirty = false;
    visibilityTracker?.updateCameraState();
    decorativeSystems.forEach((system) => {
      if (system.enabled === false) {
        system.active = false;
        if (system.renderVisible !== false) {
          system.renderVisible = false;
          system.setVisible?.(false);
        }
        if (system.group) system.group.visible = false;
        if (debugSystems) debugSystems[system.name] = { active: false, bucket: "disabled" };
        return;
      }
      if (!visibilityTracker || system.importance === "core") {
        system.active = true;
        system.bucket = system.importance === "core" ? "core" : system.bucket;
      } else {
        const center = system.getCenter(system._center || (system._center = new Vector3()));
        system.bucket = visibilityTracker.classifySphere({
          center,
          importance: system.importance,
          previousBucket: system.bucket,
          radius: system.radius || 0,
        });
        system.active = visibilityTracker.shouldUpdateBucket(system.bucket);
      }
      if (system.group) {
        if (system.isCloudGroup) {
          setCloudGroupSceneVisibility(system.group, system.active);
          cloudVisibilityDirty = true;
        } else {
          system.group.visible = visibilityTracker
            ? visibilityTracker.shouldRenderBucket(system.bucket)
            : system.active;
        }
      }
      if (typeof system.setVisible === "function") {
        const nextVisible = visibilityTracker
          ? visibilityTracker.shouldRenderBucket(system.bucket)
          : system.active;
        if (nextVisible !== system.renderVisible) {
          system.renderVisible = nextVisible;
          system.setVisible(nextVisible);
        }
      }
      if (debugSystems) {
        debugSystems[system.name] = {
          active: system.active,
          bucket: system.bucket,
        };
      }
    });
    if (cloudVisibilityDirty) applyCloudVisibility();
    if (debugSystems) qualityDebug.systems = debugSystems;
  }

  return {
    lifecycleOrder: 30,
    root,
    applyQuality(nextProfile = {}) {
      if (disposed) return false;
      lowPower = Boolean(nextProfile.isLow);
      return true;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      root.visible = false;
      cloudGroups.length = 0;
      decorativeSystems.length = 0;
      cloudAnchor = null;
      pointField = null;
      return true;
    },
    registerCloudGroup(group, visible = true) {
      if (!group || cloudGroups.includes(group)) return group;
      cloudGroups.push(group);
      setCloudGroupSceneVisibility(group, visible);
      return group;
    },
    registerDecorativeSystem(config) {
      const system = {
        active: true,
        bucket: config.importance === "core" ? "core" : "midAtmosphere",
        renderVisible: true,
        ...config,
      };
      decorativeSystems.push(system);
      return system;
    },
    resize({ composition } = {}) {
      if (disposed || !composition || !cloudAnchor) return false;
      cloudAnchor.position.y = composition.cloudAnchorY;
      return true;
    },
    setCloudAnchor(group) {
      cloudAnchor = group || null;
    },
    setClouds(on) {
      if (disposed) return false;
      cloudsEnabled = Boolean(on);
      applyCloudVisibility();
      onInvalidate?.();
      return cloudsEnabled;
    },
    setFilmTreatment(active) { film = Boolean(active); if (pointField) pointField.material.size = pointSize * (film ? .55 : 1); },
    setPointField(points) {
      pointField = points || null;
      if (pointField) { pointSize = pointField.material.size; pointField.material.size = pointSize * (film ? .55 : 1); }
    },
    toggleClouds() {
      return this.setClouds(!cloudsEnabled);
    },
    update({ elapsedSeconds = 0, visibilityScale = 1 } = {}) {
      if (disposed) return false;
      updateDecorativeVisibility();
      if (pointField) {
        pointField.rotation.y = 0.02 * elapsedSeconds;
        pointField.material.opacity = (lowPower ? 0.42 : 0.5) * visibilityScale * (film ? .4 : 1);
      }
      return true;
    },
  };
}
