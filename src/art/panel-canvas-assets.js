// PARKED — not currently imported anywhere, so esbuild won't bundle it.
//
// 2D canvas paintings of a hardcover notebook (About) and a folded letter
// (Contact), rendered with the same PSX-dither vocabulary as the former
// procedural bottom-bar icons. Originally invoked through a size
// guard inside drawNotebook / drawEnvelope (`if (width > 140)`) — the
// guard never triggered because the bottom-bar canvases are fixed at 88px,
// so this art shipped without ever being seen.
//
// Helpers (fillPoly, strokePolyline, hexToRgb, applyPsxDither, DITHER_4X4)
// were copied from the former procedural icons so this module is
// self-contained and trivially relocatable.
//
// To use: import this file once at boot, then call
//   site.art.drawNotebookPanelAsset(ctx, width, height, active)
//   site.art.drawLetterPanelAsset(ctx, width, height, active)
// against any 2D canvas context. Sized for ~360x280 reference; the
// functions internally scale to fit whatever w/h you pass.

(() => {
  const site = (window.BabelSite = window.BabelSite || {});
  const art = (site.art = site.art || {});

  function fillPoly(ctx, color, points) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(Math.round(points[0][0]), Math.round(points[0][1]));
    for (let idx = 1; idx < points.length; idx += 1) {
      ctx.lineTo(Math.round(points[idx][0]), Math.round(points[idx][1]));
    }
    ctx.closePath();
    ctx.fill();
  }

  const DITHER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16),
    };
  }

  function nearestPaletteColor(r, g, b, palette) {
    let best = palette[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (let idx = 0; idx < palette.length; idx += 1) {
      const entry = palette[idx];
      const dr = r - entry.r;
      const dg = g - entry.g;
      const db = b - entry.b;
      const score = dr * dr + dg * dg + db * db;
      if (score < bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    return best;
  }

  function applyPsxDither(ctx, x, y, w, h, palette, ditherStrength = 28, blockSize = 1) {
    const px = Math.max(0, Math.floor(x));
    const py = Math.max(0, Math.floor(y));
    const pw = Math.max(1, Math.ceil(w));
    const ph = Math.max(1, Math.ceil(h));
    const image = ctx.getImageData(px, py, pw, ph);
    const data = image.data;
    const strength = ditherStrength / 16;

    const step = Math.max(1, blockSize);
    for (let row = 0; row < ph; row += step) {
      for (let col = 0; col < pw; col += step) {
        const ptr = (row * pw + col) * 4;
        const alpha = data[ptr + 3];
        if (alpha < 8) {
          continue;
        }

        const dither = DITHER_4X4[(row & 3) * 4 + (col & 3)] - 7.5;
        const rr = Math.min(255, Math.max(0, data[ptr] + dither * strength));
        const gg = Math.min(255, Math.max(0, data[ptr + 1] + dither * strength));
        const bb = Math.min(255, Math.max(0, data[ptr + 2] + dither * strength));
        const nearest = nearestPaletteColor(rr, gg, bb, palette);

        for (let yOff = 0; yOff < step; yOff += 1) {
          for (let xOff = 0; xOff < step; xOff += 1) {
            const yy = row + yOff;
            const xx = col + xOff;
            if (yy >= ph || xx >= pw) {
              continue;
            }
            const outPtr = (yy * pw + xx) * 4;
            if (data[outPtr + 3] < 8) {
              continue;
            }
            data[outPtr] = nearest.r;
            data[outPtr + 1] = nearest.g;
            data[outPtr + 2] = nearest.b;
          }
        }
      }
    }

    ctx.putImageData(image, px, py);
  }

  function strokePolyline(ctx, color, width, points) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(Math.round(points[0][0]), Math.round(points[0][1]));
    for (let idx = 1; idx < points.length; idx += 1) {
      ctx.lineTo(Math.round(points[idx][0]), Math.round(points[idx][1]));
    }
    ctx.stroke();
  }

  function drawNotebookPanelAsset(ctx, width, height, active) {
    const scale = Math.min(width / 360, height / 280);
    const ox = (width - 360 * scale) / 2;
    const oy = (height - 280 * scale) / 2;
    const p = (xx, yy) => [ox + xx * scale, oy + yy * scale];
    const sx = (value) => value * scale;
    const palette = [
      "#eee2c9",
      "#d8c8a8",
      "#bda783",
      "#8a704e",
      "#514332",
      "#35302c",
      "#201d19",
    ].map(hexToRgb);

    const glow = ctx.createRadialGradient(ox + sx(180), oy + sx(220), 0, ox + sx(180), oy + sx(220), sx(170));
    glow.addColorStop(0, active ? "rgba(130,104,70,0.28)" : "rgba(98,78,52,0.2)");
    glow.addColorStop(1, "rgba(52,38,22,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    fillPoly(ctx, "rgba(42,31,20,0.28)", [p(54, 204), p(300, 186), p(322, 210), p(78, 236)]);

    // Cover boards and page block, slightly open in low-poly perspective.
    fillPoly(ctx, "#39332c", [p(50, 76), p(154, 54), p(168, 198), p(66, 220)]);
    fillPoly(ctx, "#2a2621", [p(166, 58), p(306, 80), p(294, 216), p(172, 198)]);
    fillPoly(ctx, "#c1aa83", [p(62, 84), p(154, 66), p(166, 188), p(76, 207)]);
    fillPoly(ctx, "#d9c8a7", [p(80, 82), p(158, 68), p(168, 188), p(86, 202)]);
    fillPoly(ctx, "#c8b38e", [p(158, 68), p(292, 88), p(282, 202), p(168, 188)]);
    fillPoly(ctx, "#eadfc6", [p(166, 70), p(284, 90), p(276, 194), p(172, 186)]);
    fillPoly(ctx, "#6f5c3f", [p(154, 54), p(166, 58), p(172, 198), p(168, 198)]);

    // Page thickness and bevels.
    fillPoly(ctx, "#b39f7e", [p(86, 202), p(168, 188), p(172, 198), p(76, 216)]);
    fillPoly(ctx, "#a58e69", [p(172, 186), p(276, 194), p(294, 216), p(172, 198)]);
    fillPoly(ctx, "#4b4032", [p(50, 76), p(62, 84), p(76, 216), p(66, 220)]);

    // Low-poly facets over the parchment pages.
    fillPoly(ctx, "rgba(255,248,226,0.34)", [p(84, 86), p(152, 74), p(158, 112), p(88, 122)]);
    fillPoly(ctx, "rgba(132,102,62,0.12)", [p(90, 142), p(164, 132), p(168, 184), p(88, 198)]);
    fillPoly(ctx, "rgba(255,248,226,0.24)", [p(170, 74), p(280, 92), p(276, 124), p(174, 110)]);
    fillPoly(ctx, "rgba(108,78,44,0.12)", [p(174, 154), p(278, 164), p(276, 194), p(172, 186)]);

    // Page rulings, writing, and cozy scribbles.
    for (let row = 0; row < 6; row += 1) {
      const y = 102 + row * 17;
      strokePolyline(ctx, "rgba(86,72,52,0.2)", sx(1), [p(92, y), p(158, y - 9)]);
      strokePolyline(ctx, "rgba(86,72,52,0.18)", sx(1), [p(178, y - 8), p(272, y + 3)]);
    }

    const scribble = active ? "rgba(49,42,35,0.62)" : "rgba(49,42,35,0.54)";
    [
      [98, 110, 136, 105],
      [99, 122, 146, 116],
      [102, 138, 130, 134],
      [106, 154, 154, 147],
      [184, 110, 238, 116],
      [184, 126, 262, 134],
      [184, 144, 244, 151],
      [184, 162, 224, 167],
    ].forEach(([x1, y1, x2, y2], idx) => {
      strokePolyline(ctx, scribble, sx(idx % 3 === 0 ? 2 : 1.4), [
        p(x1, y1),
        p((x1 + x2) / 2, y1 + (idx % 2 === 0 ? 4 : -3)),
        p(x2, y2),
      ]);
    });

    // Marginalia, tabs, and a small pencil tucked into the fold.
    fillPoly(ctx, "#b78e57", [p(276, 108), p(294, 111), p(291, 124), p(275, 121)]);
    fillPoly(ctx, "#8d6c44", [p(274, 146), p(291, 149), p(288, 162), p(273, 159)]);
    strokePolyline(ctx, "rgba(63,50,36,0.5)", sx(1.3), [p(128, 180), p(136, 172), p(146, 176), p(138, 183), p(128, 180)]);
    fillPoly(ctx, "#8f6d48", [p(146, 48), p(154, 46), p(174, 202), p(166, 204)]);
    fillPoly(ctx, "#d6bd84", [p(146, 48), p(154, 46), p(158, 62), p(150, 64)]);

    // Cover embossing.
    fillPoly(ctx, "#8e7654", [p(68, 104), p(76, 102), p(88, 190), p(80, 192)]);
    strokePolyline(ctx, "rgba(210,188,145,0.34)", sx(1.2), [p(68, 92), p(142, 78)]);
    strokePolyline(ctx, "rgba(210,188,145,0.24)", sx(1), [p(72, 202), p(160, 184)]);

    applyPsxDither(ctx, ox + sx(42), oy + sx(42), sx(282), sx(204), palette, active ? 8 : 6, 2);
  }

  function drawLetterPanelAsset(ctx, width, height, active) {
    const scale = Math.min(width / 360, height / 280);
    const ox = (width - 360 * scale) / 2;
    const oy = (height - 280 * scale) / 2;
    const p = (xx, yy) => [ox + xx * scale, oy + yy * scale];
    const sx = (value) => value * scale;
    const palette = [
      "#f0e5d2",
      "#d9cbb6",
      "#b9a486",
      "#98714d",
      "#76563a",
      "#4a3c30",
      "#2d251f",
    ].map(hexToRgb);

    const glow = ctx.createRadialGradient(ox + sx(180), oy + sx(212), 0, ox + sx(180), oy + sx(212), sx(164));
    glow.addColorStop(0, active ? "rgba(130,104,70,0.26)" : "rgba(98,78,52,0.18)");
    glow.addColorStop(1, "rgba(52,38,22,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    fillPoly(ctx, "rgba(42,31,20,0.26)", [p(48, 200), p(298, 178), p(322, 202), p(78, 234)]);

    // Thick cream envelope in perspective.
    fillPoly(ctx, "#b79f7f", [p(54, 92), p(282, 70), p(302, 180), p(74, 208)]);
    fillPoly(ctx, "#d9cbb6", [p(58, 84), p(284, 62), p(298, 172), p(74, 198)]);
    fillPoly(ctx, "#f0e5d2", [p(72, 92), p(276, 72), p(286, 164), p(84, 188)]);
    fillPoly(ctx, "#c8b497", [p(74, 198), p(298, 172), p(302, 180), p(74, 208)]);
    fillPoly(ctx, "#a88f70", [p(284, 62), p(298, 172), p(302, 180), p(282, 70)]);

    // Fold facets.
    fillPoly(ctx, "rgba(255,250,235,0.34)", [p(72, 92), p(178, 130), p(84, 188)]);
    fillPoly(ctx, "rgba(176,139,92,0.18)", [p(276, 72), p(178, 130), p(286, 164)]);
    fillPoly(ctx, "rgba(119,88,58,0.12)", [p(84, 188), p(178, 130), p(286, 164)]);
    strokePolyline(ctx, "rgba(73,58,42,0.44)", sx(1.4), [p(72, 92), p(178, 130), p(276, 72)]);
    strokePolyline(ctx, "rgba(73,58,42,0.34)", sx(1), [p(84, 188), p(178, 130), p(286, 164)]);

    // Stamp with tiny serration blocks.
    fillPoly(ctx, "#b8905c", [p(236, 88), p(266, 85), p(268, 114), p(238, 118)]);
    fillPoly(ctx, "#806040", [p(252, 102), p(268, 100), p(268, 114), p(252, 116)]);
    for (let idx = 0; idx < 5; idx += 1) {
      fillPoly(ctx, "#e3c793", [p(239 + idx * 5, 88), p(241 + idx * 5, 88), p(241 + idx * 5, 91), p(239 + idx * 5, 91)]);
      fillPoly(ctx, "#e3c793", [p(238 + idx * 5, 115), p(240 + idx * 5, 115), p(240 + idx * 5, 118), p(238 + idx * 5, 118)]);
    }

    // Address strokes: readable as writing without becoming literal UI text.
    const ink = active ? "rgba(57,47,39,0.62)" : "rgba(57,47,39,0.52)";
    [
      [98, 116, 166, 110],
      [102, 132, 190, 123],
      [104, 148, 160, 143],
      [110, 164, 208, 153],
    ].forEach(([x1, y1, x2, y2], idx) => {
      strokePolyline(ctx, ink, sx(idx === 1 ? 2 : 1.4), [
        p(x1, y1),
        p((x1 + x2) / 2, y1 + (idx % 2 ? 3 : -2)),
        p(x2, y2),
      ]);
    });

    // Wax seal: not a flat circle, a chunky faceted coin.
    fillPoly(ctx, "#5b3928", [p(176, 142), p(198, 136), p(218, 148), p(222, 170), p(202, 188), p(178, 182), p(166, 162)]);
    fillPoly(ctx, "#9b6746", [p(178, 142), p(198, 138), p(214, 148), p(218, 166), p(202, 182), p(182, 178), p(170, 160)]);
    fillPoly(ctx, "#c18b62", [p(184, 148), p(200, 144), p(210, 152), p(204, 162), p(188, 164)]);
    strokePolyline(ctx, "rgba(244,218,180,0.28)", sx(2), [p(184, 162), p(204, 158)]);
    strokePolyline(ctx, "rgba(244,218,180,0.2)", sx(2), [p(194, 150), p(196, 176)]);

    // Open paper corner and lower edge bevel.
    fillPoly(ctx, "#f7ecd7", [p(72, 92), p(104, 98), p(76, 120)]);
    strokePolyline(ctx, "rgba(73,58,42,0.26)", sx(1), [p(72, 92), p(104, 98), p(76, 120)]);
    strokePolyline(ctx, "rgba(255,250,235,0.42)", sx(1.4), [p(76, 188), p(286, 164)]);

    applyPsxDither(ctx, ox + sx(44), oy + sx(54), sx(274), sx(182), palette, active ? 8 : 6, 2);
  }

  art.drawNotebookPanelAsset = drawNotebookPanelAsset;
  art.drawLetterPanelAsset = drawLetterPanelAsset;
})();
