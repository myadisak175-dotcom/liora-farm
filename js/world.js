const world = (() => {
  const WIDTH = 1600;
  const HEIGHT = 1200;
  const TILE_SIZE = 80;

  const PERIOD_PALETTES = Object.freeze({
    Morning: { ground: "#79b96a", patch: "#72ae63", path: "#c8a66d" },
    Afternoon: { ground: "#66a85f", patch: "#5f9e58", path: "#bd975f" },
    Evening: { ground: "#8d8058", patch: "#81764f", path: "#b78658" },
    Night: { ground: "#294654", patch: "#243e4b", path: "#665b50" },
  });

  function clampX(x, radius = 0) {
    return Math.min(WIDTH - radius, Math.max(radius, x));
  }

  function clampY(y, radius = 0) {
    return Math.min(HEIGHT - radius, Math.max(radius, y));
  }

  function draw(ctx) {
    const palette = PERIOD_PALETTES[time.getPeriod()] ?? PERIOD_PALETTES.Morning;

    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = palette.patch;
    for (let row = 0; row < HEIGHT / TILE_SIZE; row += 1) {
      for (let column = 0; column < WIDTH / TILE_SIZE; column += 1) {
        if ((row + column) % 2 === 0) {
          ctx.fillRect(column * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // ทางเดินหลักช่วยให้เห็นการเคลื่อนที่ของกล้องได้ชัด และเป็นฐานวางสิ่งปลูกสร้างภายหลัง
    ctx.fillStyle = palette.path;
    ctx.fillRect(0, 755, WIDTH, 92);
    ctx.fillRect(754, 0, 92, HEIGHT);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, WIDTH - 8, HEIGHT - 8);
  }

  return { WIDTH, HEIGHT, clampX, clampY, draw };
})();
