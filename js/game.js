import { canvas, ctx } from "./canvas.js";
import { economy } from "./economy.js";
import { input } from "./input.js";
import { inventory } from "./inventory.js";
import { save } from "./save.js";
import { createSaveSnapshot, DEFAULT_SCENE_ID } from "./save-schema.js";
import { createSceneManager } from "./scene-manager.js";
import { createSceneTransitionQueue } from "./scene-transition.js";
import { createFarmExteriorScene } from "./scenes/farm-exterior.js";
import { createHouseInteriorScene } from "./scenes/house-interior.js";
import { time } from "./time.js";

const TITLE_COLOR = "#ffffff";
const AUTOSAVE_INTERVAL_MS = 3000;

export function createGame() {
  const scenes = createSceneManager();
  const transitions = createSceneTransitionQueue();

  function requestSceneChange(sceneId, options = {}) {
    if (!scenes.has(sceneId)) {
      console.warn(`Ignored transition to unknown scene: ${sceneId}`);
      return false;
    }
    return transitions.request(sceneId, options);
  }

  scenes.register(createFarmExteriorScene({ requestSceneChange }));
  scenes.register(createHouseInteriorScene({ requestSceneChange }));

  let started = false;
  let previousTime = 0;
  let animationFrameId = null;
  let autosaveTimerId = null;

  function getSaveSnapshot() {
    const sceneSnapshot = scenes.getSaveState();
    return createSaveSnapshot({
      time: time.getState(),
      economy: economy.getState(),
      inventory: inventory.getState(),
      currentScene: sceneSnapshot.currentScene ?? DEFAULT_SCENE_ID,
      scenes: sceneSnapshot.scenes,
    });
  }

  function saveGame() {
    return save.save(getSaveSnapshot());
  }

  function applyPendingTransition() {
    const transition = transitions.consume();
    if (!transition) return false;
    return scenes.change(transition.sceneId, transition.payload);
  }

  function update(deltaTime) {
    const dayChanged = time.update(deltaTime);
    const movementEnabled = !economy.isShopOpen();
    scenes.update(deltaTime, { movementEnabled });

    let stateChanged = false;
    const actionPressed = input.consumeAction();
    if (actionPressed && movementEnabled) {
      stateChanged = scenes.handleAction();
    }

    const sceneChanged = applyPendingTransition();
    if (stateChanged || sceneChanged || dayChanged) saveGame();
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
    time.setState(loadedSave.global.time);
    economy.setState(loadedSave.global.economy);
    inventory.setState(loadedSave.global.inventory);
    scenes.setSaveState(loadedSave.scenes);

    const initialSceneId = scenes.has(loadedSave.currentScene)
      ? loadedSave.currentScene
      : DEFAULT_SCENE_ID;
    scenes.change(initialSceneId);

    started = true;
    previousTime = performance.now();
    addEventListeners();
    autosaveTimerId = window.setInterval(saveGame, AUTOSAVE_INTERVAL_MS);
    animationFrameId = requestAnimationFrame(gameLoop);
    return true;
  }

  function changeScene(sceneId, payload = {}) {
    if (!started) return false;
    transitions.clear();
    const changed = scenes.change(sceneId, payload);
    if (changed) saveGame();
    return changed;
  }

  function stop() {
    if (!started) return false;

    saveGame();
    started = false;
    transitions.clear();

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
    changeScene,
    getCurrentSceneId: scenes.getCurrentId,
  };
}
