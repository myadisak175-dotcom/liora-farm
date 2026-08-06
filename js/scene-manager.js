const OPTIONAL_METHODS = [
  "enter",
  "exit",
  "update",
  "draw",
  "drawUI",
  "handleAction",
  "getActionLabel",
  "getSaveState",
];

function validateScene(scene) {
  if (!scene || typeof scene.id !== "string" || !scene.id.trim()) {
    throw new TypeError("A scene must have a non-empty string id.");
  }

  OPTIONAL_METHODS.forEach((methodName) => {
    if (scene[methodName] !== undefined && typeof scene[methodName] !== "function") {
      throw new TypeError(`Scene ${scene.id}: ${methodName} must be a function.`);
    }
  });
}

export function createSceneManager() {
  const scenes = new Map();
  let currentScene = null;

  function register(scene) {
    validateScene(scene);
    if (scenes.has(scene.id)) {
      throw new Error(`Scene already registered: ${scene.id}`);
    }
    scenes.set(scene.id, scene);
    return scene;
  }

  function change(sceneId, payload = {}) {
    const nextScene = scenes.get(sceneId);
    if (!nextScene) throw new Error(`Unknown scene: ${sceneId}`);
    if (nextScene === currentScene && !payload.forceRestart) return false;

    const previousScene = currentScene;
    previousScene?.exit?.({ to: sceneId });
    currentScene = nextScene;

    try {
      currentScene.enter?.({
        ...payload,
        from: previousScene?.id ?? null,
      });
    } catch (error) {
      currentScene = null;
      throw error;
    }

    return true;
  }

  function stop() {
    if (!currentScene) return false;
    currentScene.exit?.({ to: null });
    currentScene = null;
    return true;
  }

  function update(deltaTime, context = {}) {
    return currentScene?.update?.(deltaTime, context) ?? false;
  }

  function draw(ctx) {
    currentScene?.draw?.(ctx);
  }

  function drawUI(ctx) {
    currentScene?.drawUI?.(ctx);
  }

  function handleAction() {
    return Boolean(currentScene?.handleAction?.());
  }

  function getActionLabel() {
    return currentScene?.getActionLabel?.() ?? null;
  }

  function getSaveState() {
    return currentScene?.getSaveState?.() ?? {};
  }

  function getTitle() {
    return currentScene?.title ?? null;
  }

  function getCurrentId() {
    return currentScene?.id ?? null;
  }

  return {
    register,
    change,
    stop,
    update,
    draw,
    drawUI,
    handleAction,
    getActionLabel,
    getSaveState,
    getTitle,
    getCurrentId,
  };
}
