class MemoryStorage {
  constructor() { this.data = new Map(); }
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
}

globalThis.localStorage = new MemoryStorage();

const { createWorldEventBus } = await import("../../src/systems/world-events.js");
const { createWorldActionRegistry } = await import("../../src/systems/world-actions.js");
const { createWorldActionRuntime } = await import("../../src/systems/world-action-runtime.js");
const { createWorldLogic, WORLD_LOGIC_KINDS } = await import("../../src/systems/world-logic.js");
const { createWorldLogicRuntime } = await import("../../src/systems/world-logic-runtime.js");

let passed = 0;
function assert(value, message) {
  if (!value) throw new Error(message);
  passed += 1;
}

const events = createWorldEventBus();
const actions = createWorldActionRegistry();
const actionRuntime = createWorldActionRuntime({ events, actions });
const seen = [];
const unregister = actions.register("test-action", (action, context) => {
  seen.push({ value: action.value, phase: context.phase, node: context.node.id });
});

assert(actions.has("test-action"), "registered action type is missing");
assert(actions.execute({ type: "missing" }).code === "unknown-action", "unknown action was not isolated");

const logic = createWorldLogic({ mapId: "action-test", storageKey: "liora.test.actions.v2" });
const zone = logic.addNode(WORLD_LOGIC_KINDS.ZONE, {
  x: 4,
  z: 4,
  radius: 1.5,
  label: "Action Zone",
  data: {
    actions: {
      enter: [{ type: "test-action", value: 42 }],
      exit: [{ type: "test-action", value: 99 }],
    },
  },
});

const proximity = createWorldLogicRuntime({
  logic,
  onEvent: (event) => events.emit(event),
});
proximity.update({ x: 0, z: 0 });
proximity.update({ x: 4, z: 4 });
proximity.update({ x: 4.2, z: 4.2 });
proximity.update({ x: 10, z: 10 });

assert(seen.length === 2, `expected enter + exit actions, got ${seen.length}`);
assert(seen[0].value === 42 && seen[0].phase === "enter", "enter action did not receive event context");
assert(seen[1].value === 99 && seen[1].phase === "exit", "exit action did not receive event context");
assert(seen.every((entry) => entry.node === zone.id), "action context lost node identity");

unregister();
assert(!actions.has("test-action"), "action unregister failed");
proximity.dispose();
actionRuntime.dispose();

console.log(`world-actions: ${passed} checks passed`);
