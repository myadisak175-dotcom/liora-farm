/**
 * Extensible action vocabulary for authored gameplay.
 *
 * Logic nodes describe WHEN something happens. Actions describe WHAT happens.
 * This registry connects action `type` strings to runtime handlers without a
 * central switch statement that would otherwise grow with every game feature.
 */
const TYPE_RE = /^[a-z][a-z0-9-]{0,31}$/;

function cleanType(value) {
  const type = String(value ?? "").trim().toLowerCase();
  return TYPE_RE.test(type) ? type : null;
}

function cloneAction(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const type = cleanType(value.type);
  if (!type) return null;
  try {
    const copy = JSON.parse(JSON.stringify(value));
    copy.type = type;
    return copy;
  } catch {
    return { type };
  }
}

export function createWorldActionRegistry() {
  const handlers = new Map();
  const listeners = new Set();

  function register(type, handler) {
    const key = cleanType(type);
    if (!key) throw new Error(`Invalid world action type: ${type}`);
    if (typeof handler !== "function") throw new Error(`World action "${key}" requires a handler`);
    if (handlers.has(key)) throw new Error(`World action "${key}" is already registered`);
    handlers.set(key, handler);
    return () => {
      if (handlers.get(key) === handler) handlers.delete(key);
    };
  }

  function has(type) {
    const key = cleanType(type);
    return Boolean(key && handlers.has(key));
  }

  function notify(result) {
    for (const listener of listeners) {
      try { listener(result); }
      catch (error) { console.error("World action observer failed", error); }
    }
  }

  function execute(value, context = {}) {
    const action = cloneAction(value);
    if (!action) {
      const result = { ok: false, code: "invalid-action", action: null, context };
      notify(result);
      return result;
    }

    const handler = handlers.get(action.type);
    if (!handler) {
      const result = { ok: false, code: "unknown-action", action, context };
      notify(result);
      return result;
    }

    try {
      const output = handler(action, context);
      if (output && typeof output.then === "function") {
        output.catch((error) => {
          console.error(`World action "${action.type}" failed`, error);
          notify({ ok: false, code: "handler-failed", action, context, error });
        });
      }
      const result = { ok: true, code: "executed", action, context, output };
      notify(result);
      return result;
    } catch (error) {
      console.error(`World action "${action.type}" failed`, error);
      const result = { ok: false, code: "handler-failed", action, context, error };
      notify(result);
      return result;
    }
  }

  function executeMany(values, context = {}) {
    const actions = Array.isArray(values) ? values : [];
    return actions.map((action) => execute(action, context));
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function clear() {
    handlers.clear();
    listeners.clear();
  }

  return {
    register,
    has,
    execute,
    executeMany,
    subscribe,
    clear,
    get types() { return [...handlers.keys()]; },
  };
}

/** One action vocabulary shared by the active world runtime. */
export const WORLD_ACTIONS = createWorldActionRegistry();
