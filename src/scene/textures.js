import { wantsFilmTreatment } from "./directed-shots.js";
import { createEarthDetail } from "./filmic-earth.js";
import { createGrassDetail } from "./grass-detail.js";
import { makeMudCanvases, MUD_TILE_WIDTH } from "./mud-ground.js";
import {
  createStoneDetailController,
  groundMaterialUrl,
  createGroundDetailMaps,
  GROUND_DETAIL_SETTINGS,
  paintStoneCell,
  STONE_DETAIL_SETTINGS,
} from "./stone-detail.js";

(() => {
  const site = (window.BabelSite = window.BabelSite || {});
  const scene = (site.scene = site.scene || {});
  const { clamp01, smoothstep01, wrappedDistance, wrap01 } = scene;
  const {
    GROUND_TEXTURE_PALETTE: groundPalette,
    MARBLE_PALETTE: marblePalette,
    TOWER_TEXTURE_PALETTE: towerPalette,
  } = scene;
  const { hexToRgba } = site.shared;

  function hashNoise(xx, yy, zz = 0) {
    const val = 43758.5453123 * Math.sin(12.9898 * xx + 78.233 * yy + 37.719 * zz);
    return val - Math.floor(val);
  }

  function makeTexture(THREE, canvas, configure) {
    const tex = new THREE.CanvasTexture(canvas);
    configure(tex);
    return tex;
  }

  function resolveProfile(profile, lowPower) {
    if (profile) return profile;
    if (typeof scene.getSceneQualityProfile === "function") {
      return scene.getSceneQualityProfile(lowPower ? "low" : "high");
    }
    return {
      anisotropy: { min: 1, max: lowPower ? 4 : 8 },
      textures: {
        groundSize: lowPower ? 512 : 1024,
        marbleCanvasSize: lowPower ? 256 : 1024,
        overlaySize: lowPower ? 256 : 512,
        towerWidth: lowPower ? 320 : 1280,
      },
      geometry: {
        marbleCanvasSize: lowPower ? 256 : 1024,
      },
      counts: {
        marbleVeinCount: lowPower ? 8 : 16,
      },
      tier: lowPower ? "low" : "high",
    };
  }

  function setSrgbTextureCompat(THREE, texture) {
    if (THREE.SRGBColorSpace && "colorSpace" in texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else if (THREE.sRGBEncoding && "encoding" in texture) {
      texture.encoding = THREE.sRGBEncoding;
    }
    return texture;
  }

  function makeWanderingPath(index, size, { crack = false } = {}) {
    const pointCount = crack ? 9 : 7;
    const horizontal = hashNoise(index, crack ? 931 : 131) > 0.35;
    const startCross = hashNoise(index, crack ? 932 : 132) * size;
    const drift = (hashNoise(index, crack ? 933 : 133) - 0.5) * size * (crack ? 0.42 : 0.28);
    const waveA = (0.06 + 0.18 * hashNoise(index, crack ? 934 : 134)) * size;
    const waveB = (0.02 + 0.08 * hashNoise(index, crack ? 935 : 135)) * size;
    const phaseA = hashNoise(index, crack ? 936 : 136) * Math.PI * 2;
    const phaseB = hashNoise(index, crack ? 937 : 137) * Math.PI * 2;
    const points = [];

    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      const t = pointIndex / Math.max(1, pointCount - 1);
      const across = -0.08 * size + t * size * 1.16;
      const wobble =
        Math.sin(t * Math.PI * (1.15 + hashNoise(index, 141)) + phaseA) * waveA +
        Math.sin(t * Math.PI * (2.1 + hashNoise(index, 142)) + phaseB) * waveB +
        (hashNoise(index, pointIndex, crack ? 943 : 143) - 0.5) * size * (crack ? 0.065 : 0.04);
      const cross = startCross + drift * (t - 0.5) + wobble;
      points.push(horizontal ? [across, cross] : [cross, across]);
    }

    return {
      lineWidth: crack ? 3 + 2 * hashNoise(index, 951) : 1.5 + 1.5 * hashNoise(index, 151),
      points,
    };
  }

  function strokeWanderingPath(ctx, path, { color, alpha, scale = 1 }) {
    const points = path.points;
    if (!points || points.length < 2) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = path.lineWidth * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let idx = 1; idx < points.length - 1; idx += 1) {
      const midX = (points[idx][0] + points[idx + 1][0]) * 0.5;
      const midY = (points[idx][1] + points[idx + 1][1]) * 0.5;
      ctx.quadraticCurveTo(points[idx][0], points[idx][1], midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
    ctx.restore();
  }

  function blurCanvas(canvas, ctx) {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx || !("filter" in ctx)) return;

    tempCtx.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = "blur(1px)";
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
  }

  scene.createMarbleTextures = function ({ THREE, lowPower, qualityProfile, chooseAnisotropy }) {
    const profile = resolveProfile(qualityProfile, lowPower);
    const size =
      profile.geometry?.marbleCanvasSize ||
      profile.textures?.marbleCanvasSize ||
      (lowPower ? 256 : profile.tier === "balanced" ? 512 : 1024);
    const veinCount =
      profile.counts?.marbleVeinCount || (lowPower ? 8 : profile.tier === "balanced" ? 12 : 16);
    const colorCanvas = document.createElement("canvas");
    const bumpCanvas = document.createElement("canvas");
    colorCanvas.width = size;
    colorCanvas.height = size;
    bumpCanvas.width = size;
    bumpCanvas.height = size;

    const colorCtx = colorCanvas.getContext("2d");
    const bumpCtx = bumpCanvas.getContext("2d");
    if (!colorCtx || !bumpCtx) return { colorMap: null, bumpMap: null };

    const palette = marblePalette || {
      marbleBase: "#d8d2cc",
      marbleVein: "#6f7886",
      marbleHighlight: "#efeae3",
      marbleShadow: "#9ea4ab",
    };
    const veinPaths = [];
    for (let idx = 0; idx < veinCount; idx += 1) {
      veinPaths.push(makeWanderingPath(idx, size));
    }
    const crackCount = 2 + Math.floor(hashNoise(size, 877) * 3);
    const crackPaths = [];
    for (let idx = 0; idx < crackCount; idx += 1) {
      crackPaths.push(makeWanderingPath(idx + 100, size, { crack: true }));
    }

    colorCtx.fillStyle = palette.marbleBase;
    colorCtx.fillRect(0, 0, size, size);
    bumpCtx.fillStyle = "#000000";
    bumpCtx.fillRect(0, 0, size, size);

    for (const path of veinPaths) {
      strokeWanderingPath(colorCtx, path, {
        color: palette.marbleVein,
        alpha: 0.18,
      });
      strokeWanderingPath(bumpCtx, path, {
        color: "#ffffff",
        alpha: 1,
        scale: 0.82,
      });
    }

    for (const path of crackPaths) {
      strokeWanderingPath(colorCtx, path, {
        color: palette.marbleShadow,
        alpha: 0.32,
        scale: 1.1,
      });
    }

    const center = size / 2;
    const highlight = colorCtx.createRadialGradient(center, center, 0, center, center, size * 0.62);
    highlight.addColorStop(0, hexToRgba(palette.marbleHighlight, 0.12));
    highlight.addColorStop(1, hexToRgba(palette.marbleHighlight, 0));
    colorCtx.fillStyle = highlight;
    colorCtx.fillRect(0, 0, size, size);
    blurCanvas(colorCanvas, colorCtx);

    const aniso =
      typeof chooseAnisotropy === "function"
        ? chooseAnisotropy(2, 8)
        : Math.max(1, Math.min(8, profile.anisotropy?.max || 8));
    return {
      colorMap: makeTexture(THREE, colorCanvas, (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = aniso;
        setSrgbTextureCompat(THREE, tex);
      }),
      bumpMap: makeTexture(THREE, bumpCanvas, (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = aniso;
      }),
    };
  };

  scene.createGroundTextures = function ({
    THREE,
    lowPower,
    qualityProfile,
    chooseAnisotropy,
    search = "",
    onDetailChange = () => {},
    onDetailStatus = () => {},
    onGrassChange = () => {},
    onGrassStatus = () => {},
  }) {
    const profile = resolveProfile(qualityProfile, lowPower);
    const balanced = profile.tier === "balanced";
    const size = profile.textures.groundSize;
    const colorCanvas = document.createElement("canvas");
    const bumpCanvas = document.createElement("canvas");
    colorCanvas.width = size;
    colorCanvas.height = size;
    bumpCanvas.width = size;
    bumpCanvas.height = size;

    const colorCtx = colorCanvas.getContext("2d");
    const bumpCtx = bumpCanvas.getContext("2d");
    if (!colorCtx || !bumpCtx) {
      return { colorMap: null, bumpMap: null, applyQuality: () => false, dispose: () => false };
    }

    colorCtx.fillStyle = groundPalette.baseColor;
    colorCtx.fillRect(0, 0, size, size);
    bumpCtx.fillStyle = groundPalette.bumpBase;
    bumpCtx.fillRect(0, 0, size, size);

    const dirtBlotchCount = lowPower ? 60 : balanced ? 90 : 120;
    for (let idx = 0; idx < dirtBlotchCount; idx += 1) {
      const cx = hashNoise(idx, 601) * size;
      const cy = hashNoise(idx, 602) * size;
      const radius = size * (0.025 + 0.07 * hashNoise(idx, 603));
      const tone = hashNoise(idx, 604);
      const colorGrad = colorCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      colorGrad.addColorStop(
        0,
        tone > 0.58
          ? `rgba(86, 70, 54, ${0.12 + 0.1 * hashNoise(idx, 605)})`
          : tone < 0.32
            ? `rgba(232, 218, 196, ${0.08 + 0.08 * hashNoise(idx, 606)})`
            : `rgba(168, 148, 124, ${0.06 + 0.08 * hashNoise(idx, 607)})`,
      );
      colorGrad.addColorStop(1, "rgba(120, 104, 84, 0)");
      colorCtx.fillStyle = colorGrad;
      colorCtx.beginPath();
      colorCtx.ellipse(
        cx,
        cy,
        radius,
        radius * (0.6 + 0.5 * hashNoise(idx, 608)),
        hashNoise(idx, 609) * Math.PI,
        0,
        2 * Math.PI,
      );
      colorCtx.fill();

      const bumpGrad = bumpCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      bumpGrad.addColorStop(0, tone > 0.5 ? "#9b8e7e" : "#d3c8ba");
      bumpGrad.addColorStop(1, groundPalette.bumpBase);
      bumpCtx.fillStyle = bumpGrad;
      bumpCtx.beginPath();
      bumpCtx.ellipse(
        cx,
        cy,
        radius,
        radius * (0.6 + 0.5 * hashNoise(idx, 608)),
        hashNoise(idx, 609) * Math.PI,
        0,
        2 * Math.PI,
      );
      bumpCtx.fill();
    }

    const dustCount = lowPower ? 2600 : balanced ? 3900 : 5200;
    for (let idx = 0; idx < dustCount; idx += 1) {
      const px = hashNoise(idx, 21) * size;
      const py = hashNoise(idx, 22) * size;
      const radius = size * (8e-4 + 0.0038 * hashNoise(idx, 23));
      const tone = hashNoise(idx, 24);
      colorCtx.fillStyle =
        tone > 0.68
          ? groundPalette.emberDustColor
          : tone < 0.22
            ? groundPalette.coolDustColor
            : `rgba(118, 108, 102, ${0.04 + 0.08 * hashNoise(idx, 25)})`;
      colorCtx.beginPath();
      colorCtx.arc(px, py, radius, 0, 2 * Math.PI);
      colorCtx.fill();

      const gray = 135 + Math.floor(80 * hashNoise(idx, 26));
      bumpCtx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
      bumpCtx.beginPath();
      bumpCtx.arc(px, py, radius, 0, 2 * Math.PI);
      bumpCtx.fill();
    }

    const pebbleCount = lowPower ? 260 : balanced ? 360 : 520;
    for (let idx = 0; idx < pebbleCount; idx += 1) {
      const cx = hashNoise(idx, 301) * size;
      const cy = hashNoise(idx, 302) * size;
      const big = hashNoise(idx, 310) > 0.86;
      const radius =
        size * (big ? 0.006 + 0.012 * hashNoise(idx, 303) : 0.0022 + 0.005 * hashNoise(idx, 303));
      const base = 44 + Math.floor(46 * hashNoise(idx, 304));
      const shade = hashNoise(idx, 305);
      const shadowOffset = radius * 0.35;

      colorCtx.save();
      colorCtx.fillStyle = `rgba(20, 14, 8, ${0.22 + 0.14 * hashNoise(idx, 320)})`;
      colorCtx.beginPath();
      colorCtx.ellipse(
        cx + shadowOffset,
        cy + shadowOffset,
        radius * 1.05,
        radius * 0.75,
        0,
        0,
        2 * Math.PI,
      );
      colorCtx.fill();
      colorCtx.restore();

      colorCtx.fillStyle =
        shade > 0.68
          ? `rgba(${Math.min(240, base + 70)}, ${Math.min(230, base + 60)}, ${Math.min(210, base + 44)}, ${0.55 + 0.25 * hashNoise(idx, 306)})`
          : shade > 0.36
            ? `rgba(${base + 26}, ${base + 18}, ${base + 8}, ${0.48 + 0.25 * hashNoise(idx, 307)})`
            : `rgba(${Math.max(28, base - 18)}, ${Math.max(22, base - 24)}, ${Math.max(16, base - 30)}, ${0.5 + 0.25 * hashNoise(idx, 308)})`;
      colorCtx.beginPath();
      colorCtx.ellipse(
        cx,
        cy,
        radius,
        radius * (0.75 + 0.25 * hashNoise(idx, 311)),
        hashNoise(idx, 312) * Math.PI,
        0,
        2 * Math.PI,
      );
      colorCtx.fill();

      if (big) {
        const hi = colorCtx.createRadialGradient(
          cx - radius * 0.3,
          cy - radius * 0.3,
          0,
          cx - radius * 0.3,
          cy - radius * 0.3,
          radius * 0.7,
        );
        hi.addColorStop(0, "rgba(255, 246, 224, 0.35)");
        hi.addColorStop(1, "rgba(255, 246, 224, 0)");
        colorCtx.fillStyle = hi;
        colorCtx.beginPath();
        colorCtx.ellipse(
          cx - radius * 0.3,
          cy - radius * 0.3,
          radius * 0.5,
          radius * 0.35,
          0,
          0,
          2 * Math.PI,
        );
        colorCtx.fill();
      }

      const bumpGray = big
        ? 210 + Math.floor(40 * hashNoise(idx, 309))
        : 170 + Math.floor(60 * hashNoise(idx, 309));
      bumpCtx.fillStyle = `rgb(${bumpGray}, ${bumpGray}, ${bumpGray})`;
      bumpCtx.beginPath();
      bumpCtx.ellipse(
        cx,
        cy,
        radius,
        radius * (0.75 + 0.25 * hashNoise(idx, 311)),
        hashNoise(idx, 312) * Math.PI,
        0,
        2 * Math.PI,
      );
      bumpCtx.fill();
      bumpCtx.fillStyle = "#7d7468";
      bumpCtx.beginPath();
      bumpCtx.ellipse(
        cx + shadowOffset,
        cy + shadowOffset,
        radius * 1.05,
        radius * 0.75,
        0,
        0,
        2 * Math.PI,
      );
      bumpCtx.fill();
    }

    const mossColor = groundPalette.mossColor || "rgba(66, 84, 44, 0.14)";
    const mossCore = groundPalette.mossCore || "rgba(86, 104, 54, 0.18)";
    const mossCount = lowPower ? 3 : balanced ? 5 : 6;
    for (let idx = 0; idx < mossCount; idx += 1) {
      const cx = hashNoise(idx, 401) * size;
      const cy = hashNoise(idx, 402) * size;
      const radius = size * (0.03 + 0.05 * hashNoise(idx, 403));
      const grad = colorCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, mossCore);
      grad.addColorStop(0.5, mossColor);
      grad.addColorStop(1, "rgba(66, 84, 44, 0)");
      colorCtx.fillStyle = grad;
      colorCtx.beginPath();
      colorCtx.ellipse(
        cx,
        cy,
        radius,
        radius * (0.6 + 0.5 * hashNoise(idx, 404)),
        hashNoise(idx, 405) * Math.PI,
        0,
        2 * Math.PI,
      );
      colorCtx.fill();

      for (let fleck = 0; fleck < 8; fleck += 1) {
        const fx = cx + radius * 0.6 * (hashNoise(idx, 410 + fleck) - 0.5) * 2;
        const fy = cy + radius * 0.6 * (hashNoise(idx, 420 + fleck) - 0.5) * 2;
        colorCtx.fillStyle = `rgba(86, 104, 54, ${0.12 + 0.14 * hashNoise(idx, 430 + fleck)})`;
        colorCtx.beginPath();
        colorCtx.arc(fx, fy, 0.9 + 1.4 * hashNoise(idx, 440 + fleck), 0, 2 * Math.PI);
        colorCtx.fill();
      }
    }

    const breakupCount = lowPower ? 40 : balanced ? 60 : 90;
    for (let idx = 0; idx < breakupCount; idx += 1) {
      const cx = hashNoise(idx, 501) * size;
      const cy = hashNoise(idx, 502) * size;
      const radius = size * (0.05 + 0.12 * hashNoise(idx, 503));
      const grad = colorCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      const tone = hashNoise(idx, 504);
      grad.addColorStop(
        0,
        tone > 0.5
          ? `rgba(40, 34, 28, ${0.03 + 0.04 * hashNoise(idx, 505)})`
          : `rgba(248, 236, 216, ${0.02 + 0.03 * hashNoise(idx, 506)})`,
      );
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      colorCtx.fillStyle = grad;
      colorCtx.beginPath();
      colorCtx.arc(cx, cy, radius, 0, 2 * Math.PI);
      colorCtx.fill();
    }

    const aniso = chooseAnisotropy(profile.anisotropy.min, profile.anisotropy.max);
    const textures = {
      colorMap: makeTexture(THREE, colorCanvas, (tex) => {
        tex.wrapS = THREE.MirroredRepeatWrapping;
        tex.wrapT = THREE.MirroredRepeatWrapping;
        tex.repeat.set(4, 4);
        tex.anisotropy = aniso;
        tex.colorSpace = THREE.SRGBColorSpace;
      }),
      bumpMap: makeTexture(THREE, bumpCanvas, (tex) => {
        tex.wrapS = THREE.MirroredRepeatWrapping;
        tex.wrapT = THREE.MirroredRepeatWrapping;
        tex.repeat.set(4, 4);
        tex.anisotropy = aniso;
      }),
    };

    // The authored maps replace the procedural pair only after they decode; the
    // procedural canvases stay alive so a reset or fallback can rebind them.
    let authored = null;
    let mud = null;
    let mudActive = false;
    const filmRequested = wantsFilmTreatment(search) && !["desert", "procedural"].includes(new URLSearchParams(search).get("ground"));
    function publishGround() {
      if (!authored) { onDetailChange({ ...textures, normalMap: null, roughnessMap: null, normalScale: 0, muddy: false }); return; }
      if (mudActive && !mud) {
        const canvases = makeMudCanvases(authored.colorMap.image);
        const prepared = {};
        try {
          for (const [kind, canvas] of Object.entries(canvases)) {
            prepared[kind] = makeTexture(THREE, canvas, tex => {
              tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
              tex.repeat.set(176 / MUD_TILE_WIDTH, 176 / MUD_TILE_WIDTH);
              tex.anisotropy = aniso;
              if (kind === "color") tex.colorSpace = THREE.SRGBColorSpace;
            });
          }
          mud = prepared;
        } catch (error) { Object.values(prepared).forEach(tex => tex.dispose()); throw error; }
      }
      onDetailChange(mudActive ? {
        colorMap: mud.color, normalMap: mud.normal, roughnessMap: mud.roughness,
        normalScale: .22, bumpMap: null, muddy: true,
      } : { ...authored, roughnessMap: null, normalScale: GROUND_DETAIL_SETTINGS.normalScale, bumpMap: null, muddy: false });
    }
    function disposeAuthored() {
      authored?.colorMap.dispose();
      authored?.normalMap.dispose();
      authored = null;
      if (mud) Object.values(mud).forEach(tex => tex.dispose());
      mud = null;
    }
    const detail = createStoneDetailController({
      profile,
      disabled: filmRequested || new URLSearchParams(search).get("ground") === "procedural",
      report: onDetailStatus,
      kinds: ["color", "normal"],
      urlFor: groundMaterialUrl,
      apply(sources) {
        const maps = createGroundDetailMaps(sources, (source, kind) => {
          const canvas = document.createElement("canvas");
          canvas.width = source.width;
          canvas.height = source.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Ground material canvas unavailable.");
          ctx.drawImage(source, 0, 0);
          return makeTexture(THREE, canvas, (tex) => {
            tex.wrapS = THREE.MirroredRepeatWrapping;
            tex.wrapT = THREE.MirroredRepeatWrapping;
            tex.repeat.set(GROUND_DETAIL_SETTINGS.repeat, GROUND_DETAIL_SETTINGS.repeat);
            tex.anisotropy = aniso;
            if (kind === "color") tex.colorSpace = THREE.SRGBColorSpace;
          });
        });
        disposeAuthored();
        authored = { colorMap: maps.color, normalMap: maps.normal };
        publishGround();
      },
      reset() {
        onDetailChange({
          colorMap: textures.colorMap,
          roughnessMap: null, muddy: false,
          normalMap: null,
          normalScale: 0,
          bumpMap: textures.bumpMap,
        });
        disposeAuthored();
      },
    });
    const earth = createEarthDetail({ profile, disabled: !filmRequested, anisotropy: aniso,
      publish: onDetailChange, restore: publishGround,
      report(status) { if (filmRequested) onDetailStatus({ ...status, material: "Poly Haven Dirt" }); },
    });
    // Grass is a secondary shader-only blend over the earth ground, never a
    // base map swap, so it publishes through its own channel rather than
    // onDetailChange's ground-map-replacement shape.
    const grass = createGrassDetail({ profile, disabled: !filmRequested, anisotropy: aniso,
      publish: onGrassChange, restore: () => onGrassChange(null),
      report(status) { if (filmRequested) onGrassStatus({ ...status, material: "Poly Haven Sparse Grass" }); },
    });
    return {
      ...textures,
      setFilmActive(active) { publishGround(); earth.setActive(active); grass.setActive(active); },
      setMudActive(active) {
        mudActive = Boolean(active);
        try { publishGround(); }
        catch { mudActive = false; publishGround(); onDetailStatus({ status: "fallback", reason: "mud-preparation" }); }
      },
      lifecycleOrder: detail.lifecycleOrder,
      applyQuality(profile) { detail.applyQuality(profile); earth.applyQuality(profile); grass.applyQuality(profile); },
      dispose() { earth.dispose(); grass.dispose(); return detail.dispose(); },
    };
  };

  scene.createGroundOverlayTexture = function ({ THREE, lowPower, qualityProfile }) {
    const profile = resolveProfile(qualityProfile, lowPower);
    const size = profile.textures.overlaySize;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, size, size);

    const center = size / 2;
    const dampColor = groundPalette.dampColor || "rgba(64, 82, 110, 0.10)";

    const dampGrad = ctx.createRadialGradient(center, center, 0, center, center, 0.22 * size);
    dampGrad.addColorStop(0, dampColor);
    dampGrad.addColorStop(0.5, "rgba(64, 82, 110, 0.04)");
    dampGrad.addColorStop(1, "rgba(64, 82, 110, 0)");
    ctx.fillStyle = dampGrad;
    ctx.fillRect(0, 0, size, size);

    const warmGrad = ctx.createRadialGradient(
      center,
      center,
      0.06 * size,
      center,
      center,
      0.36 * size,
    );
    warmGrad.addColorStop(0, "rgba(174, 120, 72, 0.13)");
    warmGrad.addColorStop(0.55, "rgba(174, 120, 72, 0.05)");
    warmGrad.addColorStop(1, "rgba(174, 120, 72, 0)");
    ctx.fillStyle = warmGrad;
    ctx.fillRect(0, 0, size, size);

    const shadowGrad = ctx.createRadialGradient(center, center, 0, center, center, 0.12 * size);
    shadowGrad.addColorStop(0, "rgba(12, 16, 24, 0.22)");
    shadowGrad.addColorStop(0.7, "rgba(12, 16, 24, 0.06)");
    shadowGrad.addColorStop(1, "rgba(12, 16, 24, 0)");
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(0, 0, size, size);

    const vignette = ctx.createRadialGradient(
      center,
      center,
      0.38 * size,
      center,
      center,
      0.5 * size,
    );
    vignette.addColorStop(0, "rgba(10, 12, 22, 0)");
    vignette.addColorStop(1, "rgba(10, 12, 22, 0.22)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  scene.createTowerTextures = function ({
    THREE,
    lowPower,
    qualityProfile,
    chooseAnisotropy,
    collapseYaw,
    collapseSpread,
    search = "",
    includeBrickDetail = false,
    onDetailChange = () => {},
    onDetailStatus = () => {},
  }) {
    const profile = resolveProfile(qualityProfile, lowPower);
    const balanced = profile.tier === "balanced";
    const width = profile.textures.towerWidth;
    const height = 2 * width;
    const rowCount = lowPower ? 20 : balanced ? 32 : 48;
    const columnCount = lowPower ? 20 : balanced ? 28 : 34;
    const colorCanvas = document.createElement("canvas");
    const bumpCanvas = document.createElement("canvas");
    colorCanvas.width = width;
    colorCanvas.height = height;
    bumpCanvas.width = width;
    bumpCanvas.height = height;

    const colorCtx = colorCanvas.getContext("2d");
    const bumpCtx = bumpCanvas.getContext("2d");
    if (!colorCtx || !bumpCtx) return { colorMap: null, bumpMap: null };

    const yawWrap = wrap01(collapseYaw / (2 * Math.PI));
    const spreadWrap = Math.max(0.08, collapseSpread / (2 * Math.PI));
    const rowHeight = height / rowCount;
    const columnWidth = width / columnCount;
    const mortarThickness = lowPower ? 1 : balanced ? 1.2 : 1.4;

    let roughnessCanvas = null;
    let roughnessCtx = null;
    let roughnessMap = null;
    let brickMaps = null;

    function paintTower(sources = null) {
      if (sources) {
        roughnessCtx.fillStyle = "#ffffff";
        roughnessCtx.fillRect(0, 0, roughnessCanvas.width, roughnessCanvas.height);
      }
      colorCtx.imageSmoothingEnabled = false;
      bumpCtx.imageSmoothingEnabled = false;
      colorCtx.fillStyle = towerPalette.mapBase;
      colorCtx.fillRect(0, 0, width, height);
      bumpCtx.fillStyle = towerPalette.bumpBase;
      bumpCtx.fillRect(0, 0, width, height);

      for (let row = 0; row < rowCount; row += 1) {
        const rowY = row * rowHeight;
        const rowFrac = row / Math.max(1, rowCount - 1);
        const rowCurve = Math.pow(rowFrac, 1.55);
        const colOffset = row % 2 == 0 ? 0 : columnWidth / 2;

        colorCtx.fillStyle = row % 5 == 0 ? "rgba(0, 0, 0, 0.018)" : "rgba(255, 255, 255, 0.012)";
        colorCtx.fillRect(0, rowY, width, rowHeight);

        for (let col = -1; col <= columnCount + 1; col += 1) {
          const colX = col * columnWidth + colOffset;
          const brickWrap = wrap01((colX + 0.5 * columnWidth) / width);
          const collapseWeight =
            clamp01(1 - wrappedDistance(brickWrap, yawWrap) / spreadWrap) *
            smoothstep01(Math.max(0, (rowFrac - 0.42) / 0.58));
          const brickInsetX =
            mortarThickness * (0.62 + 0.48 * hashNoise(row, col, 1) * (1 + rowCurve));
          const brickInsetY =
            mortarThickness * (0.72 + 0.44 * hashNoise(row, col, 2) * (1 + rowCurve));
          const brickW = Math.max(columnWidth - 2 * brickInsetX, 0.58 * columnWidth);
          const brickH = Math.max(rowHeight - 1.6 * brickInsetY, 0.52 * rowHeight);
          const brickX = colX + brickInsetX;
          const brickY = rowY + brickInsetY;
          const shadeOffset = (hashNoise(row, col, 3) - 0.5) * (0.16 + 0.12 * rowCurve);
          const stainPick = hashNoise(row, col, 4);

          if (sources) {
            paintStoneCell({
              colorCtx,
              roughnessCtx,
              sources,
              cell: { x: brickX, y: brickY, width: brickW, height: brickH },
              sample: { x: hashNoise(row, col, 21), y: hashNoise(row, col, 22) },
              scale: roughnessCanvas.width / width,
            });
          }

          colorCtx.fillStyle =
            shadeOffset >= 0
              ? `rgba(255, 255, 255, ${shadeOffset})`
              : `rgba(0, 0, 0, ${Math.abs(shadeOffset)})`;
          colorCtx.fillRect(brickX, brickY, brickW, brickH);

          if (stainPick > 0.72) {
            colorCtx.fillStyle = towerPalette.warmStain;
            colorCtx.fillRect(brickX, brickY, brickW, brickH);
          } else if (stainPick > 0.48) {
            colorCtx.fillStyle = towerPalette.coolStain;
            colorCtx.fillRect(brickX, brickY, brickW, brickH);
          } else if (stainPick < 0.16) {
            colorCtx.fillStyle = towerPalette.mossStain;
            colorCtx.fillRect(brickX, brickY, brickW, brickH);
          }

          colorCtx.fillStyle = towerPalette.mortarShadow;
          colorCtx.fillRect(brickX, brickY + brickH - 1, brickW, 1);
          colorCtx.fillStyle = towerPalette.mortarHighlight;
          colorCtx.fillRect(brickX, brickY, brickW, 1);

          if (collapseWeight > 0.02) {
            colorCtx.fillStyle = `rgba(0, 0, 0, ${0.01 + 0.06 * collapseWeight})`;
            colorCtx.fillRect(brickX, brickY, brickW, brickH);

            if (hashNoise(row, col, 5) > 0.58) {
              const crackW =
                mortarThickness * (1.2 + 2.8 * hashNoise(row, col, 6) + 1.8 * collapseWeight);
              const crackH = rowHeight * (0.08 + 0.18 * hashNoise(row, col, 7));
              const crackX = hashNoise(row, col, 8) > 0.5 ? brickX : brickX + brickW - crackW;
              const crackY = brickY + hashNoise(row, col, 9) * Math.max(1, brickH - crackH);
              colorCtx.fillStyle = towerPalette.sootStain;
              colorCtx.fillRect(crackX, crackY, crackW, crackH);
              bumpCtx.fillStyle = "#98a3b8";
              bumpCtx.fillRect(crackX, crackY, crackW, crackH);
            }
          }

          const mortarX =
            colX -
            mortarThickness / 2 +
            (hashNoise(row, col, 10) - 0.5) * mortarThickness * (0.7 + rowCurve);
          const mortarY = rowY + 0.8 * mortarThickness;
          const mortarH = Math.max(
            0.38 * rowHeight,
            rowHeight - mortarThickness * (1.8 + hashNoise(row, col, 11) * (1 + rowCurve)),
          );

          colorCtx.fillStyle = towerPalette.mortarShadow;
          colorCtx.fillRect(mortarX, mortarY, mortarThickness, mortarH);
          bumpCtx.fillStyle = "#98a3b8";
          bumpCtx.fillRect(mortarX, mortarY, mortarThickness, mortarH);

          if (rowFrac > 0.52 && hashNoise(row, col, 12) > 0.64 - 0.2 * collapseWeight) {
            const streakH = rowHeight * (0.32 + 0.58 * hashNoise(row, col, 13));
            const streakW = columnWidth * (0.02 + 0.04 * hashNoise(row, col, 14));
            const streakGrad = colorCtx.createLinearGradient(0, rowY, 0, rowY + streakH);
            streakGrad.addColorStop(0, towerPalette.sootStain);
            streakGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
            colorCtx.fillStyle = streakGrad;
            colorCtx.fillRect(brickX + brickW * hashNoise(row, col, 15), rowY, streakW, streakH);
          }
        }
      }

      const collapseGradient = colorCtx.createLinearGradient(
        yawWrap * width - 0.24 * width,
        0,
        yawWrap * width + 0.18 * width,
        0,
      );
      collapseGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
      collapseGradient.addColorStop(0.36, "rgba(0, 0, 0, 0.05)");
      collapseGradient.addColorStop(0.5, towerPalette.collapseShadow);
      collapseGradient.addColorStop(0.68, "rgba(0, 0, 0, 0.04)");
      collapseGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      colorCtx.fillStyle = collapseGradient;
      colorCtx.fillRect(0, 0, width, height);

      const weatheringCount = lowPower ? 48 : 150;
      for (let idx = 0; idx < weatheringCount; idx += 1) {
        const wx = hashNoise(idx, 101) * width;
        const wy = height * (0.06 + 0.88 * hashNoise(idx, 102));
        const wrx = width * (0.0014 + 0.0038 * hashNoise(idx, 103));
        const wry = height * (0.001 + 0.0028 * hashNoise(idx, 104));
        colorCtx.fillStyle = `rgba(0, 0, 0, ${0.01 + 0.012 * hashNoise(idx, 105)})`;
        colorCtx.beginPath();
        colorCtx.ellipse(wx, wy, wrx, wry, hashNoise(idx, 106) * Math.PI, 0, 2 * Math.PI);
        colorCtx.fill();
        bumpCtx.fillStyle = "#aca59d";
        bumpCtx.beginPath();
        bumpCtx.ellipse(wx, wy, wrx, wry, hashNoise(idx, 107) * Math.PI, 0, 2 * Math.PI);
        bumpCtx.fill();
      }

      const baseFade = colorCtx.createLinearGradient(0, 0.56 * height, 0, height);
      baseFade.addColorStop(0, "rgba(0, 0, 0, 0)");
      baseFade.addColorStop(1, "rgba(0, 0, 0, 0.05)");
      colorCtx.fillStyle = baseFade;
      colorCtx.fillRect(0, 0.56 * height, width, 0.44 * height);
    }
    paintTower();

    const aniso = chooseAnisotropy(3, 8);
    const textures = {
      colorMap: makeTexture(THREE, colorCanvas, (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = aniso;
      }),
      bumpMap: makeTexture(THREE, bumpCanvas, (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = aniso;
      }),
    };
    const detail = createStoneDetailController({
      profile,
      disabled: new URLSearchParams(search).get("stone") === "procedural",
      report: onDetailStatus,
      apply(sources) {
        roughnessCanvas = document.createElement("canvas");
        roughnessCanvas.width = Math.min(width, STONE_DETAIL_SETTINGS.maxRoughnessWidth);
        roughnessCanvas.height = 2 * roughnessCanvas.width;
        roughnessCtx = roughnessCanvas.getContext("2d");
        if (!roughnessCtx) throw new Error("Stone roughness canvas unavailable.");
        roughnessMap = makeTexture(THREE, roughnessCanvas, (tex) => {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.anisotropy = aniso;
        });
        if (includeBrickDetail) {
          // Reuse the same decoded mineral images before the controller closes them.
          // A single brick should not sample the entire wall's mortar atlas.
          const brickColorCanvas = document.createElement("canvas");
          const brickRoughnessCanvas = document.createElement("canvas");
          const size = sources.color.width;
          brickColorCanvas.width = brickColorCanvas.height = size;
          brickRoughnessCanvas.width = brickRoughnessCanvas.height = size;
          const brickColor = brickColorCanvas.getContext("2d");
          const brickRoughness = brickRoughnessCanvas.getContext("2d");
          if (!brickColor || !brickRoughness) throw new Error("Brick material canvas unavailable.");
          brickColor.fillStyle = towerPalette.mapBase;
          brickColor.fillRect(0, 0, size, size);
          brickColor.globalCompositeOperation = "soft-light";
          brickColor.globalAlpha = STONE_DETAIL_SETTINGS.colorStrength;
          brickColor.drawImage(sources.color, 0, 0);
          brickRoughness.fillStyle = "#ffffff";
          brickRoughness.fillRect(0, 0, size, size);
          brickRoughness.globalAlpha = STONE_DETAIL_SETTINGS.roughnessStrength;
          brickRoughness.drawImage(sources.roughness, 0, 0);
          brickMaps = {
            colorMap: makeTexture(THREE, brickColorCanvas, (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.anisotropy = aniso;
            }),
          };
          brickMaps.roughnessMap = makeTexture(THREE, brickRoughnessCanvas, (tex) => {
            tex.anisotropy = aniso;
          });
        }
        paintTower(sources);
        textures.colorMap.needsUpdate = true;
        roughnessMap.needsUpdate = true;
        onDetailChange({ colorMap: textures.colorMap, roughnessMap, brickMaps });
      },
      reset({ disposing }) {
        if (!disposing) {
          paintTower();
          textures.colorMap.needsUpdate = true;
        }
        onDetailChange({ colorMap: textures.colorMap, roughnessMap: null, brickMaps: null });
        brickMaps?.colorMap?.dispose();
        brickMaps?.roughnessMap?.dispose();
        brickMaps = null;
        roughnessMap?.dispose();
        roughnessMap = null;
        roughnessCanvas = null;
        roughnessCtx = null;
      },
    });
    return {
      ...textures,
      lifecycleOrder: detail.lifecycleOrder,
      applyQuality: detail.applyQuality,
      dispose: detail.dispose,
    };
  };
})();
