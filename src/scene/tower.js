import { Group } from "three";

export function createSceneTower({ parent, profile }) {
  const root = new Group();
  parent.add(root);

  let disposed = false;
  let architecturalLights = [];
  let architecturalLightScale = 1,
    film = false;
  let groundRing = null;
  let lowPower = Boolean(profile?.isLow);
  let orbitRings = [];
  let practicalLights = [];
  root.userData.lowPower = lowPower;

  function applyPracticalLightScale(lighting = {}) {
    const scale = Number.isFinite(lighting.practicalIntensityScale)
      ? lighting.practicalIntensityScale
      : 1;
    practicalLights.forEach((record) => {
      record.light.intensity = lowPower && record.disableOnLow ? 0 : record.baseIntensity * scale;
    });
  }

  function applyArchitecturalLightScale(lighting = {}) {
    architecturalLightScale = Number.isFinite(lighting.towerLightIntensityScale)
      ? lighting.towerLightIntensityScale
      : 1;
    architecturalLights.forEach((record) => {
      record.light.visible = !film && architecturalLightScale > 0;
    });
  }

  return {
    lifecycleOrder: 20,
    root,
    applyQuality(nextProfile = {}) {
      if (disposed) return false;
      lowPower = Boolean(nextProfile.isLow);
      root.userData.lowPower = lowPower;
      applyArchitecturalLightScale(nextProfile.lighting);
      applyPracticalLightScale(nextProfile.lighting);
      return true;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      root.visible = false;
      architecturalLights = [];
      groundRing = null;
      orbitRings = [];
      practicalLights = [];
      return true;
    },
    resize({ composition } = {}) {
      if (disposed || !composition) return false;
      root.scale.setScalar(composition.towerScale || 1);
      return true;
    },
    setOrbitDecor({ ground, rings } = {}) {
      groundRing = ground || null;
      orbitRings = Array.isArray(rings) ? rings : [];
    },
    setFilmTreatment(active) {
      film = Boolean(active);
      architecturalLights.forEach((record) => {
        record.light.visible = !film && architecturalLightScale > 0;
      });
    },
    setArchitecturalLights(records) {
      architecturalLights = Array.isArray(records)
        ? records.filter((record) => record?.light && Number.isFinite(record.baseIntensity))
        : [];
      applyArchitecturalLightScale(profile?.lighting);
    },
    setPracticalLights(records) {
      practicalLights = Array.isArray(records)
        ? records.filter((record) => record?.light && Number.isFinite(record.baseIntensity))
        : [];
      applyPracticalLightScale(profile?.lighting);
    },
    update({ elapsedSeconds = 0 } = {}) {
      if (disposed || film) return false;
      architecturalLights.forEach((record) => {
        const slowBreath =
          0.82 +
          0.14 * Math.sin(0.24 * elapsedSeconds + record.phase) +
          0.04 * Math.sin(0.071 * elapsedSeconds + 1.7 * record.phase);
        record.light.intensity =
          record.baseIntensity * architecturalLightScale * Math.max(0.64, slowBreath);
      });
      if (groundRing) {
        groundRing.material.opacity = 0.12 + 0.02 * Math.sin(1.3 * elapsedSeconds);
      }
      orbitRings.forEach((ring, index) => {
        ring.rotation.z = elapsedSeconds * (0.1 + 0.02 * index);
        ring.material.opacity =
          0.12 + 0.018 * index + 0.03 + 0.02 * Math.sin(elapsedSeconds * (1.2 + 0.3 * index));
      });
      return true;
    },
  };
}
