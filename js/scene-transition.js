export function createSceneTransitionQueue() {
  let pending = null;

  function request(sceneId, options = {}) {
    if (typeof sceneId !== "string" || !sceneId.trim()) {
      throw new TypeError("A scene transition requires a non-empty scene id.");
    }
    if (pending) return false;

    pending = {
      sceneId: sceneId.trim(),
      payload: options && typeof options === "object" && !Array.isArray(options)
        ? { ...options }
        : {},
    };
    return true;
  }

  function consume() {
    const transition = pending;
    pending = null;
    return transition;
  }

  function clear() {
    pending = null;
  }

  return {
    request,
    consume,
    clear,
    hasPending: () => pending !== null,
  };
}
