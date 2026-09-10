import { Group } from "three";

export function createSceneEnvironment({ groundHeight, parent, profile }) {
  const root = new Group();
  parent.add(root);

  let crystalRecords = [];
  let disposed = false;
  let clutterEnabled = true;
  let groundPlantRecords = [];
  let lowPower = Boolean(profile?.isLow);
  let monolithGroup = null;

  return {
    lifecycleOrder: 10,
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
      crystalRecords = [];
      groundPlantRecords = [];
      monolithGroup = null;
      return true;
    },
    resize({ composition } = {}) {
      if (disposed || !composition) return false;
      root.position.y = composition.sceneOffsetY;
      return true;
    },
    setClutterEnabled(enabled) {
      clutterEnabled = Boolean(enabled);
    },
    setCrystalRecords(records) {
      crystalRecords = Array.isArray(records) ? records : [];
    },
    setGroundPlantRecords(records) {
      groundPlantRecords = Array.isArray(records) ? records : [];
    },
    setMonolithGroup(group) {
      monolithGroup = group || null;
    },
    update({ elapsedSeconds = 0, reducedMotion = false } = {}) {
      if (disposed) return false;
      if (!clutterEnabled) return false;
      crystalRecords.forEach((mesh, index) => {
        if (!reducedMotion) mesh.rotation.y += 0.0035 + 0.00012 * index;
        mesh.position.y =
          groundHeight(mesh.position.x, mesh.position.z) +
          3.55 +
          0.06 * Math.sin(1.4 * elapsedSeconds + index);
      });
      monolithGroup?.children.forEach((mesh, index) => {
        if (!reducedMotion) mesh.rotation.y += 0.002 + 0.0005 * index;
      });
      groundPlantRecords.forEach((record, index) => {
        const phase = elapsedSeconds * (0.9 + (index % 7) * 0.05) + record.phase;
        record.mesh.position.y = record.baseY + Math.sin(phase) * record.amp;
        record.mesh.material.opacity = (lowPower ? 0.26 : 0.33) + 0.03 * Math.sin(0.7 * phase);
      });
      return true;
    },
  };
}
