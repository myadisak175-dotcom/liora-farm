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

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneState(value) {
  if (!isRecord(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

export function createSceneManager() {
  const scenes = new Map();
  const savedStates = new Map();
  let currentScene = null;

  function register(scene) {
    validateScene(scene);
    if (scenes.has(scene.id)) {
      throw new Error(`Scene already registered: ${scene.id}`);
    }
    scenes.set(scene.id, scene);
    return scene;
  }

  function has(sceneId) {
    return scenes.has(sceneId);
  }

  function setSaveState(sceneStates = {}) {
    savedStates.clear();
    if (!isRecord(sceneStates)) return;

    Object.entries(sceneStates).forEach(([sceneId, state]) => {
      if (!sceneId.trim() || !isRecord(state)) return;
      savedStates.set(sceneId, cloneState(state));
    });
  }

  function captureCurrentState() {
    if (!currentScene) return;
    savedStates.set(currentScene.id, cloneState(currentScene.getSaveState?.()));
  }

  function change(sceneId, payload = {}) {
    const nextScene = scenes.get(sceneId);
    if (!nextScene) throw new Error(`Unknown scene: ${sceneId}`);

    const { forceRestart = false, sceneState, ...enterPayload } = payload;
    if (nextScene === currentScene && !forceRestart) return false;

    const previousScene = currentScene;
    captureCurrentState();
    previousScene?.exit?.({ to: sceneId });
    currentScene = nextScene;

    const state = sceneState === undefined ? savedStates.get(sceneId) : sceneState;
    try {
      currentScene.enter?.({
        ...enterPayload,
        state: cloneState(state),
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
    captureCurrentState();
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
    captureCurrentState();
    return {
      currentScene: currentScene?.id ?? null,
      scenes: Object.fromEntries(
        [...savedStates.entries()].map(([sceneId, state]) => [sceneId, cloneState(state)]),
      ),
    };
  }

  function getTitle() {
    return currentScene?.title ?? null;
  }

  function getCurrentId() {
    return currentScene?.id ?? null;
  }

  return {
    register,
    has,
    setSaveState,
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
