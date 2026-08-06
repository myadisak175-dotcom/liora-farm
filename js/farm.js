const farm = (() => {
  const ROWS = 4;
  const COLUMNS = 4;
  const GROWTH_DAYS = GAME_BALANCE.cropGrowthDays;
  const GAP = 6;
  const GRID_SIZE = 300;
  const CELL_SIZE = (GRID_SIZE - GAP * (COLUMNS - 1)) / COLUMNS;
  const WORLD_X = world.WIDTH / 2 - GRID_SIZE / 2;
  const WORLD_Y = 340;
  const EMPTY = "empty";
  const SEED = "seed";
  const GROWING = "growing";
  const READY = "ready";

  let plots = createEmptyPlots();

  function createEmptyPlots() {
    return Array.from({ length: ROWS * COLUMNS }, () => ({ state: EMPTY, plantedDay: null }));
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
    return {
      x: WORLD_X,
      y: WORLD_Y,
      gridSize: GRID_SIZE,
      cellSize: CELL_SIZE,
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

  function interactPlot(plot) {
    if (plot.state === EMPTY) {
      if (!economy.hasSeed()) {
        interactions.notify("ไม่มีเมล็ด ไปซื้อที่ร้าน");
        return false;
      }
      economy.useSeed();
      plot.plantedDay = time.getDay();
      plot.state = SEED;
      interactions.notify("ปลูกเมล็ดแล้ว!");
      return true;
    }

    if (plot.state === READY) {
      economy.addCrop();
      plot.plantedDay = null;
      plot.state = EMPTY;
      interactions.notify("เก็บเกี่ยวแล้ว! ได้ผลผลิต 1 ชิ้น");
      return true;
    }

    const daysLeft = Math.max(1, GROWTH_DAYS - (time.getDay() - plot.plantedDay));
    interactions.notify(`พืชจะโตในอีก ${daysLeft} วัน`);
    return false;
  }

  function getPlotLabel(plot) {
    if (plot.state === EMPTY) return economy.hasSeed() ? "ปลูก" : "ไม่มีเมล็ด";
    if (plot.state === READY) return "เก็บเกี่ยว";
    return "ตรวจดู";
  }

  function getInteractions() {
    return plots.map((plot, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      return {
        id: `farm-plot-${index}`,
        x: WORLD_X + column * (CELL_SIZE + GAP) + CELL_SIZE / 2,
        y: WORLD_Y + row * (CELL_SIZE + GAP) + CELL_SIZE / 2,
        radius: 78,
        priority: 10,
        highlightRadius: CELL_SIZE * 0.43,
        label: () => getPlotLabel(plot),
        action: () => interactPlot(plot),
      };
    });
  }

  function drawPlant(ctx, plot, centerX, centerY) {
    if (plot.state === EMPTY) return;

    if (plot.state === SEED) {
      ctx.fillStyle = "#362014";
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.max(4, CELL_SIZE * 0.07), 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.fillStyle = plot.state === READY ? "#4fc34a" : "#69a943";
    const stemHeight = plot.state === READY ? CELL_SIZE * 0.5 : CELL_SIZE * 0.28;
    ctx.fillRect(centerX - 4, centerY - stemHeight / 2, 8, stemHeight);
    ctx.beginPath();
    ctx.ellipse(centerX - CELL_SIZE * 0.13, centerY - stemHeight * 0.15, CELL_SIZE * 0.16, CELL_SIZE * 0.1, -0.5, 0, Math.PI * 2);
    ctx.ellipse(centerX + CELL_SIZE * 0.13, centerY - stemHeight * 0.35, CELL_SIZE * 0.16, CELL_SIZE * 0.1, 0.5, 0, Math.PI * 2);
    ctx.fill();

    if (plot.state === READY) {
      ctx.fillStyle = "#ffe36c";
      ctx.beginPath();
      ctx.arc(centerX, centerY - stemHeight * 0.55, CELL_SIZE * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw(ctx) {
    plots.forEach((plot, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const cellX = WORLD_X + column * (CELL_SIZE + GAP);
      const cellY = WORLD_Y + row * (CELL_SIZE + GAP);

      ctx.fillStyle = "#704425";
      ctx.fillRect(cellX, cellY, CELL_SIZE, CELL_SIZE);
      ctx.strokeStyle = plot.state === READY ? "#ffe36c" : "#9a6338";
      ctx.lineWidth = plot.state === READY ? 4 : 2;
      ctx.strokeRect(cellX + 1, cellY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      drawPlant(ctx, plot, cellX + CELL_SIZE / 2, cellY + CELL_SIZE / 2);
    });
  }

  return { setState, getState, getLayout, getInteractions, update, draw };
})();
