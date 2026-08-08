import { time } from "./time.js";

export const world = (() => {
  const WIDTH = 1600;
  const HEIGHT = 1200;

  // Isometric grass floor: 2:1 diamonds like the visual reference.
  const TILE_WIDTH = 128;
  const TILE_HEIGHT = 64;
  const HALF_TILE_WIDTH = TILE_WIDTH / 2;
  const HALF_TILE_HEIGHT = TILE_HEIGHT / 2;

  const PERIOD_PALETTES = Object.freeze({
    Morning: {
      base: "#78b82d",
      tileA: "#83c431",
      tileB: "#79b92d",
      edge: "#4f8d24",
      leafDark: "#619f28",
      leafLight: "#9bd33a",
      flower: "rgba(255, 248, 205, 0.72)",
    },
    Afternoon: {
      base: "#6cae2c",
      tileA: "#79bc30",
      tileB: "#70b22b",
      edge: "#4a8423",
      leafDark: "#5a9526",
      leafLight: "#91c936",
      flower: "rgba(255, 245, 205, 0.68)",
    },
    Evening: {
      base: "#78963a",
      tileA: "#83a542",
      tileB: "#77973a",
      edge: "#526c2a",
      leafDark: "#657d31",
      leafLight: "#98b84c",
      flower: "rgba(255, 231, 184, 0.56)",
    },
    Night: {
      base: "#315f43",
      tileA: "#396d49",
      tileB: "#346443",
      edge: "#244c36",
      leafDark: "#2c563c",
      leafLight: "#4f8055",
      flower: "rgba(194, 224, 198, 0.4)",
    },
  });

  function clampX(x, radius = 0) {
    return Math.min(WIDTH - radius, Math.max(radius, x));
  }

  function clampY(y, radius = 0) {
    return Math.min(HEIGHT - radius, Math.max(radius, y));
  }

  function noise(row, column, salt = 0) {
    const value = Math.sin((row + 13.37) * 12.9898 + (column - 4.12) * 78.233 + salt * 39.425) * 43758.5453;
    return value - Math.floor(value);
  }

  function traceDiamond(ctx, centerX, centerY) {
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - HALF_TILE_HEIGHT);
    ctx.lineTo(centerX + HALF_TILE_WIDTH, centerY);
    ctx.lineTo(centerX, centerY + HALF_TILE_HEIGHT);
    ctx.lineTo(centerX - HALF_TILE_WIDTH, centerY);
    ctx.closePath();
  }

  function drawGrassDetail(ctx, centerX, centerY, row, column, palette) {
    // A few tiny deterministic leaf clusters keep the floor alive without
    // turning every tile into an obvious repeated stamp.
    for (let index = 0; index < 6; index += 1) {
      const rx = noise(row, column, index * 2 + 1);
      const ry = noise(row, column, index * 2 + 2);
      const localX = (rx - 0.5) * 82;
      const maxY = 24 * (1 - Math.abs(localX) / HALF_TILE_WIDTH);
      const localY = (ry - 0.5) * maxY * 1.35;
      const x = centerX + localX;
      const y = centerY + localY;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((noise(row, column, 40 + index) - 0.5) * 1.2);
      ctx.fillStyle = index % 2 === 0 ? palette.leafLight : palette.leafDark;
      ctx.beginPath();
      ctx.ellipse(-2.5, 0, 3.8, 1.6, -0.5, 0, Math.PI * 2);
      ctx.ellipse(2.5, -1, 3.8, 1.6, 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Rare tiny pale flower specks, matching the reference without clutter.
    if (noise(row, column, 91) > 0.78) {
      const fx = centerX + (noise(row, column, 92) - 0.5) * 56;
      const fy = centerY + (noise(row, column, 93) - 0.5) * 16;
      ctx.fillStyle = palette.flower;
      ctx.beginPath();
      ctx.arc(fx - 2, fy, 1.35, 0, Math.PI * 2);
      ctx.arc(fx + 2, fy, 1.35, 0, Math.PI * 2);
      ctx.arc(fx, fy - 1.8, 1.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGrassTile(ctx, centerX, centerY, row, column, palette) {
    const variation = noise(row, column, 7);
    ctx.fillStyle = variation > 0.52 ? palette.tileA : palette.tileB;
    traceDiamond(ctx, centerX, centerY);
    ctx.fill();

    // Soft inner texture rather than dark gaps between tiles.
    ctx.save();
    traceDiamond(ctx, centerX, centerY);
    ctx.clip();
    drawGrassDetail(ctx, centerX, centerY, row, column, palette);
    ctx.restore();

    // Very subtle rhombus edge keeps the isometric structure readable.
    ctx.strokeStyle = palette.edge;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1.25;
    traceDiamond(ctx, centerX, centerY);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function draw(ctx) {
    const palette = PERIOD_PALETTES[time.getPeriod()] ?? PERIOD_PALETTES.Morning;
    ctx.fillStyle = palette.base;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Overscan so camera edges never expose an unpainted strip.
    const rows = Math.ceil(HEIGHT / HALF_TILE_HEIGHT) + 4;
    const columns = Math.ceil(WIDTH / TILE_WIDTH) + 4;

    for (let row = -2; row < rows; row += 1) {
      const offsetX = row % 2 === 0 ? 0 : HALF_TILE_WIDTH;
      const centerY = row * HALF_TILE_HEIGHT;

      for (let column = -2; column < columns; column += 1) {
        const centerX = column * TILE_WIDTH + offsetX;
        drawGrassTile(ctx, centerX, centerY, row, column, palette);
      }
    }
  }

  return { WIDTH, HEIGHT, clampX, clampY, draw };
})();
