(() => {
  const site = (window.BabelSite = window.BabelSite || {});
  const scene = (site.scene = site.scene || {});

  scene.GROUND_TEXTURE_PALETTE = {
    baseColor: "#7c8290",
    bumpBase: "#5d6574",
    shadowColor: "rgba(31, 38, 59, 0.2)",
    highlightColor: "rgba(197, 187, 169, 0.15)",
    sootColor: "rgba(54, 43, 40, 0.16)",
    emberDustColor: "rgba(157, 89, 65, 0.16)",
    coolDustColor: "rgba(78, 91, 126, 0.14)",
    crackColor: "rgba(47, 40, 44, 0.28)",
    crackHighlight: "rgba(242, 215, 170, 0.22)",
    pavingTones: ["#777e8e", "#5d6574", "#90909a"],
    pavingShadow: "rgba(18, 22, 34, 0.38)",
    pavingHighlight: "rgba(200, 190, 173, 0.13)",
    mossColor: "rgba(63, 72, 47, 0.18)",
    mossCore: "rgba(74, 83, 54, 0.22)",
    dampColor: "rgba(66, 77, 105, 0.14)",
  };

  scene.PLANT_PALETTE = {
    leafDeep: "#303925",
    leafMid: "#586242",
    leafTip: "#8b9468",
    leafVein: "rgba(38, 44, 29, 0.48)",
    leafHighlight: "rgba(220, 214, 159, 0.34)",
    leafShadow: "rgba(27, 30, 24, 0.4)",
    grassRoot: "#465038",
    grassTip: "#899365",
    grassShadow: "rgba(24, 29, 22, 0.4)",
  };

  scene.TOWER_TEXTURE_PALETTE = {
    mapBase: "#b7b5ae",
    bumpBase: "#82838a",
    mortarShadow: "rgba(40, 46, 61, 0.34)",
    mortarHighlight: "rgba(232, 222, 201, 0.16)",
    warmStain: "rgba(144, 95, 72, 0.14)",
    coolStain: "rgba(65, 83, 120, 0.2)",
    sootStain: "rgba(48, 38, 39, 0.2)",
    limeWash: "rgba(234, 219, 193, 0.18)",
    mossStain: "rgba(79, 91, 55, 0.18)",
    collapseShadow: "rgba(45, 37, 45, 0.28)",
  };

  scene.MARBLE_PALETTE = Object.freeze({
    marbleBase: "#ded1b8",
    marbleVein: "#777681",
    marbleHighlight: "#f5e7c9",
    marbleShadow: "#a99c91",
  });

  scene.GROUND_SURFACE_MATERIAL = {
    color: 0x5d6574,
    // The default film slate: the same authored pair, tinted warm so that the
    // cool film light leaves it a dark grey near the classic ground's balance,
    // only slightly cool in moonlight and short of brown under the lantern.
    filmColor: 0x5c5048,
    roughness: 0.98,
    metalness: 0.02,
    bumpScale: { lowPower: 0.1, default: 0.28 },
  };

  scene.TOWER_SURFACE_MATERIALS = {
    plinthColor: 0x484f5c,
    ringColor: 0x252b38,
    shellColor: 0xb1b1ad,
    shellInnerColor: 0x303642,
    shellBumpScale: { lowPower: 0.09, default: 0.24 },
  };
})();
