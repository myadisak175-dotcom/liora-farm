export function createWorldEventBus() {
  const listeners = new Set();

  function emit(event) {
    if (!event || typeof event !== "object") return;
    for (const listener of listeners) {
      try { listener(event); }
      catch (error) { console.error("World event listener failed", error); }
    }
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function clear() {
    listeners.clear();
  }

  return {
    emit,
    subscribe,
    clear,
    get listenerCount() { return listeners.size; },
  };
}

/** Shared gameplay event channel for the active world. */
export const WORLD_EVENTS = createWorldEventBus();
