const farm = (() => {
  const ROWS = 4;
  const COLUMNS = 4;
  const GROWTH_DAYS = GAME_BALANCE.cropGrowthDays;
  const GAP = 7;
  const EMPTY = "empty";
  const SEED = "seed";
  const GROWING = "growing";
  const READY = "ready";

  let plots = createEmptyPlots();
  let message = "เดินเข้าใกล้แปลงแล้วกด ACTION";
  let messageUntil = 0;

  function createEmptyPlots() {
    return Array.from({ length: ROWS * COLUMNS }, () => ({
      state: EMPTY,
      plantedDay: null,
    }));
  }

  function setState(savedPlots) {
    if (!Array.isArray(savedPlots) || savedPlots.length !== ROWS * COLUMNS) {
      plots = createEmptyPlots();
      return;
    }

    plots = savedPlots.map((plot) => {
      const plantedDay = plot?.plantedDay;
      if (!Number.isInteger(plantedDay) || plantedDay < 1) {
        return { state: EMPTY, plantedDay: null };
      }
      return { state: SEED, plantedDay };
    });
    update();
  }

  function getState() {
    return plots.map(({ state, plantedDay }) => ({ state, plantedDay }));
  }

  function getLayout() {
    const availableHeight = Math.max(140, window.innerHeight - 300);
    const gridSize = Math.min(360, window.innerWidth - 48, availableHeight);
    const cellSize = (gridSize - GAP * (COLUMNS - 1)) / COLUMNS;
    return {
      x: (window.innerWidth - gridSize) / 2,
      y: Math.max(150, (window.innerHeight - gridSize) / 2 - 12),
      gridSize,
      cellSize,
    };
  }

  function update() {
    const currentDay = time.getDay();
    plots.forEach((plot) => {
      if (plot.plantedDay === null) return;
      const daysPassed = Math.max(0, currentDay - plot.plantedDay);
      if (daysPassed >= GROWTH_DAYS) plot.state = READY;
      else if (daysPassed >= 1) plot.state = GROWING;
      else plot.state = SEED;
    });
  }

  function showMessage(text) {
    message = text;
    messageUntil = performance.now() + 2400;
  }

  function interactPlot(plot) {
    if (plot.state === EMPTY) {
      if (!economy.hasSeed()) {
        showMessage("ไม่มีเมล็ด ไปซื้อที่ร้าน");
        return false;
      }
      economy.useSeed();
      plot.plantedDay = time.getDay();
      plot.state = SEED;
      showMessage("ปลูกเมล็ดแล้ว!");
      return true;
    }

    if (plot.state === READY) {
      economy.addCrop();
      plot.plantedDay = null;
      plot.state = EMPTY;
      showMessage("เก็บเกี่ยวแล้ว! ได้ผลผลิต 1 ชิ้น");
      return true;
    }

    const daysLeft = Math.max(1, GROWTH_DAYS - (time.getDay() - plot.plantedDay));
    showMessage(`พืชจะโตในอีก ${daysLeft} วัน`);
    return false;
  }

  function interactNear(playerX, playerY, maxDistance) {
    const layout = getLayout();
    let nearest = null;
    let nearestDistance = Infinity;

    plots.forEach((plot, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const centerX = layout.x + column * (layout.cellSize + GAP) + layout.cellSize / 2;
      const centerY = layout.y + row * (layout.cellSize + GAP) + layout.cellSize / 2;
      const distance = Math.hypot(playerX - centerX, playerY - centerY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = plot;
      }
    });

    if (!nearest || nearestDistance > maxDistance) {
      showMessage("เข้าใกล้แปลงอีกนิด แล้วกด ACTION");
      return false;
    }

    return interactPlot(nearest);
  }

  function drawPlant(ctx, plot, centerX, centerY, cellSize) {
    if (plot.state === EMPTY) return;

    if (plot.state === SEED) {
      ctx.fillStyle = "#362014";
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.max(4, cellSize * 0.07), 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.fillStyle = plot.state === READY ? "#4fc34a" : "#69a943";
    const stemHeight = plot.state === READY ? cellSize * 0.5 : cellSize * 0.28;
    ctx.fillRect(centerX - 4, centerY - stemHeight / 2, 8, stemHeight);
    ctx.beginPath();
    ctx.ellipse(centerX - cellSize * 0.13, centerY - stemHeight * 0.15, cellSize * 0.16, cellSize * 0.1, -0.5, 0, Math.PI * 2);
    ctx.ellipse(centerX + cellSize * 0.13, centerY - stemHeight * 0.35, cellSize * 0.16, cellSize * 0.1, 0.5, 0, Math.PI * 2);
    ctx.fill();

    if (plot.state === READY) {
      ctx.fillStyle = "#ffe36c";
      ctx.beginPath();
      ctx.arc(centerX, centerY - stemHeight * 0.55, cellSize * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw(ctx) {
    const { x, y, cellSize } = getLayout();
    plots.forEach((plot, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const cellX = x + column * (cellSize + GAP);
      const cellY = y + row * (cellSize + GAP);

      ctx.fillStyle = "#704425";
      ctx.fillRect(cellX, cellY, cellSize, cellSize);
      ctx.strokeStyle = plot.state === READY ? "#ffe36c" : "#9a6338";
      ctx.lineWidth = plot.state === READY ? 4 : 2;
      ctx.strokeRect(cellX + 1, cellY + 1, cellSize - 2, cellSize - 2);
      drawPlant(ctx, plot, cellX + cellSize / 2, cellY + cellSize / 2, cellSize);
    });

    if (performance.now() < messageUntil || messageUntil === 0) {
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const textY = Math.min(window.innerHeight - 128, y + (cellSize + GAP) * ROWS + 32);
      const textWidth = Math.min(window.innerWidth - 32, ctx.measureText(message).width + 24);
      ctx.fillStyle = "rgba(10, 24, 25, 0.78)";
      ctx.fillRect(window.innerWidth / 2 - textWidth / 2, textY - 26, textWidth, 32);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(message, window.innerWidth / 2, textY);
    }
  }

  return {
    setState,
    getState,
    interactNear,
    update,
    draw,
  };
})();
