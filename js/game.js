import { canvas, ctx } from "./canvas.js";
import { economy } from "./economy.js";
import { input } from "./input.js";
import { save } from "./save.js";
import { createSceneManager } from "./scene-manager.js";
import { createFarmExteriorScene } from "./scenes/farm-exterior.js";
import { time } from "./time.js";

const DEFAULT_SCENE_ID = "farm-exterior";
const TITLE_COLOR = "#ffffff";
const AUTOSAVE_INTERVAL_MS = 3000;

export function createGame() {
  const scenes = createSceneManager();
  scenes.register(createFarmExteriorScene());

  let started = false;
  let previousTime = 0;
  let animationFrameId = null;
  let autosaveTimerId = null;

  function saveGame() {
    const sceneState = scenes.getSaveState();
    save.save(
      time.getState(),
      sceneState.farm,
      economy.getState(),
      sceneState.player,
    );
  }

  function update(deltaTime) {
    const dayChanged = time.update(deltaTime);
    const movementEnabled = !economy.isShopOpen();
    scenes.update(deltaTime, { movementEnabled });

    const actionPressed = input.consumeAction();
    if (actionPressed && movementEnabled && scenes.handleAction()) {
      saveGame();
    }

    if (dayChanged) saveGame();
  }

  function drawTitle() {
    ctx.fillStyle = TITLE_COLOR;
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(scenes.getTitle() ?? "Liora's Farm", window.innerWidth / 2, 10);
  }

  function draw() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    ctx.clearRect(0, 0, width, height);

    time.drawBackground(ctx, width, height);
    scenes.draw(ctx);
    drawTitle();
    time.draw(ctx);
    economy.drawHUD(ctx);
    scenes.drawUI(ctx);

    if (!economy.isShopOpen()) {
      input.draw(ctx, scenes.getActionLabel());
    }
    economy.drawShop(ctx);
  }

  function gameLoop(currentTime) {
    if (!started) return;

    const deltaTime = Math.min(0.05, (currentTime - previousTime) / 1000);
    previousTime = currentTime;
    update(deltaTime);
    draw();
    animationFrameId = requestAnimationFrame(gameLoop);
  }

  function pointerPosition(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (window.innerWidth / bounds.width),
      y: (event.clientY - bounds.top) * (window.innerHeight / bounds.height),
    };
  }

  function handlePointerDown(event) {
    event.preventDefault();
    const point = pointerPosition(event);

    if (economy.isShopOpen()) {
      if (economy.handleTap(point.x, point.y)) saveGame();
      return;
    }

    if (economy.handleTap(point.x, point.y)) saveGame();
    if (!economy.isShopOpen() && input.pointerDown(event.pointerId, point.x, point.y)) {
      canvas.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event) {
    const point = pointerPosition(event);
    input.pointerMove(event.pointerId, point.x, point.y);
  }

  function handlePointerUp(event) {
    input.pointerUp(event.pointerId);
  }

  function handlePageHide() {
    saveGame();
  }

  function handleVisibilityChange() {
    if (document.hidden) saveGame();
    previousTime = performance.now();
  }

  function addEventListeners() {
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  function removeEventListeners() {
    canvas.removeEventListener("pointerdown", handlePointerDown);
    canvas.removeEventListener("pointermove", handlePointerMove);
    canvas.removeEventListener("pointerup", handlePointerUp);
    canvas.removeEventListener("pointercancel", handlePointerUp);
    window.removeEventListener("pagehide", handlePageHide);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }

  function start() {
    if (started) return false;

    const loadedSave = save.load();
    time.setState(loadedSave.time);
    economy.setState(loadedSave.economy);
    scenes.change(DEFAULT_SCENE_ID, {
      farmState: loadedSave.farm,
      playerState: loadedSave.player,
    });

    started = true;
    previousTime = performance.now();
    addEventListeners();
    autosaveTimerId = window.setInterval(saveGame, AUTOSAVE_INTERVAL_MS);
    animationFrameId = requestAnimationFrame(gameLoop);
    return true;
  }

  function stop() {
    if (!started) return false;

    saveGame();
    started = false;

    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    if (autosaveTimerId !== null) window.clearInterval(autosaveTimerId);
    animationFrameId = null;
    autosaveTimerId = null;

    removeEventListeners();
    scenes.stop();
    return true;
  }

  return {
    start,
    stop,
    save: saveGame,
    getCurrentSceneId: scenes.getCurrentId,
  };
}
