class MemoryStorage {
  constructor() { this.data = new Map(); }
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
  clear() { this.data.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const {
  WORLD_LOGIC_VERSION,
  WORLD_LOGIC_KINDS,
  createWorldLogic,
  sanitizeWorldLogic,
} = await import("../../src/systems/world-logic.js");
const { createWorldLogicRuntime } = await import("../../src/systems/world-logic-runtime.js");

let passed = 0;
function assert(value, message) {
  if (!value) throw new Error(message);
  passed += 1;
}

const migrated = sanitizeWorldLogic({ version: 1, spawn: { x: 3, z: -4 } });
assert(migrated.version === WORLD_LOGIC_VERSION, "v1 logic did not migrate to current schema");
assert(migrated.spawn.x === 3 && migrated.spawn.z === -4, "v1 spawn moved during migration");
assert(Array.isArray(migrated.nodes) && migrated.nodes.length === 0, "v1 migration invented nodes");

// A correctly-versioned but damaged payload must be rescued before any future
// save can overwrite it. This is the same no-data-loss policy as terrain/paint.
const malformedKey = "liora.test.malformed-world-logic.v2";
localStorage.setItem(malformedKey, JSON.stringify({
  version: WORLD_LOGIC_VERSION,
  spawn: { x: "broken", z: 2 },
  nodes: [],
}));
const damaged = createWorldLogic({ mapId: "home-island", storageKey: malformedKey });
assert(damaged.storeIssue?.kind === "malformed-world-logic", "malformed v2 payload was silently accepted");
assert(localStorage.getItem(`${malformedKey}.backup`) !== null, "malformed v2 payload was not backed up");

// Migrate the original prototype key once, then remove it. Otherwise Reset in
// v2 could resurrect the v1 spawn on the next page load.
const legacyMapId = "legacy-test";
const legacyKey = `liora.world-logic.v1::${legacyMapId}`;
const migratedV2Key = `liora.test.legacy-world-logic.v2::${legacyMapId}`;
localStorage.setItem(legacyKey, JSON.stringify({ version: 1, spawn: { x: 8, z: 9 } }));
const legacyLogic = createWorldLogic({ mapId: legacyMapId, storageKey: "liora.test.legacy-world-logic.v2" });
assert(legacyLogic.spawn.x === 8 && legacyLogic.spawn.z === 9, "legacy local spawn was not migrated");
assert(localStorage.getItem(legacyKey) === null, "legacy key survived successful v2 migration");
assert(localStorage.getItem(migratedV2Key) !== null, "migrated v2 payload was not persisted");

const authored = {
  version: WORLD_LOGIC_VERSION,
  spawn: { x: 1, z: 2 },
  nodes: [],
};
const storageKey = "liora.test.world-logic.v2";
const logic = createWorldLogic({ mapId: "logic-test", storageKey });
logic.importData(authored);
assert(logic.spawn.x === 1 && logic.spawn.z === 2, "authored spawn was not applied");
assert(logic.setSpawn({ x: "bad", z: 4 }) === false, "invalid spawn edit was accepted");

logic.setSpawn({ x: 7.25, z: -1.5 });
assert(logic.spawn.x === 7.25 && logic.spawn.z === -1.5, "spawn edit was not kept");

const zone = logic.addNode(WORLD_LOGIC_KINDS.ZONE, {
  x: 10,
  z: 10,
  radius: 2.5,
  label: "Test Zone",
  data: { role: "test" },
});
assert(zone?.kind === WORLD_LOGIC_KINDS.ZONE, "zone node was not created");
assert(logic.nodeCount === 1, "node count did not update");

logic.updateNode(zone.id, { radius: 4 });
assert(logic.getNode(zone.id)?.radius === 4, "node update did not persist");

const reloaded = createWorldLogic({ mapId: "logic-test", storageKey });
// Authored defaults are loaded every boot even when a local edit wins. This is
// what makes "reset" deterministic after reopening the game.
reloaded.importData(authored);
assert(reloaded.spawn.x === 7.25, "spawn did not persist through store reload");
assert(reloaded.getNode(zone.id)?.data.role === "test", "node data did not persist through store reload");

const events = [];
const runtime = createWorldLogicRuntime({
  logic: reloaded,
  onEvent: (event) => events.push(`${event.type}:${event.node.id}`),
});
runtime.update({ x: 0, z: 0 });
runtime.update({ x: 10, z: 10 });
runtime.update({ x: 10.5, z: 10.5 });
runtime.update({ x: 30, z: 30 });
assert(events.filter((entry) => entry === `enter:${zone.id}`).length === 1, "zone enter fired more than once");
assert(events.filter((entry) => entry === `exit:${zone.id}`).length === 1, "zone exit did not fire exactly once");
runtime.dispose();

reloaded.removeNode(zone.id);
assert(reloaded.nodeCount === 0, "node removal failed");
reloaded.resetToAuthored();
assert(reloaded.spawn.x === 1 && reloaded.spawn.z === 2, "reset did not restore authored logic");

console.log(`world-logic: ${passed} checks passed`);
