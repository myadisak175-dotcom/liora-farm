class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
}

const storage = new MemoryStorage();
let assigned = "";
globalThis.sessionStorage = storage;
globalThis.window = { __lioraRevision: "portal-test" };
globalThis.location = {
  href: "https://example.test/liora/",
  assign(url) { assigned = String(url); },
};
globalThis.fetch = async (url) => {
  if (url === "./maps/index.json") {
    return {
      ok: true,
      async json() {
        return {
          maps: [
            { id: "home-island", file: "./maps/home-island.json" },
            { id: "meadow-demo", file: "./maps/meadow-demo.json" },
          ],
        };
      },
    };
  }
  return { ok: false, async json() { return null; } };
};

const { WORLD_ACTIONS } = await import("../../src/systems/world-actions.js");
await import("../../src/systems/world-navigation-actions.js");
const { WORLD_ARRIVAL_STORAGE_KEY } = await import("../../src/systems/world-navigation.js");

let passed = 0;
function assert(value, message) {
  if (!value) throw new Error(message);
  passed += 1;
}

assert(WORLD_ACTIONS.has("portal"), "portal action plugin did not register");
const result = WORLD_ACTIONS.execute({
  type: "portal",
  mapId: "meadow-demo",
  markerId: "meadow-arrival",
});
assert(result.ok && result.output && typeof result.output.then === "function", "portal action did not execute asynchronously");
const navigation = await result.output;
assert(navigation.ok, `portal navigation failed: ${navigation.code}`);
assert(assigned.includes("map=meadow-demo"), "portal did not navigate to target map");
assert(assigned.includes("v=portal-test"), "portal navigation lost app revision");
const arrival = JSON.parse(storage.getItem(WORLD_ARRIVAL_STORAGE_KEY) ?? "null");
assert(arrival?.markerId === "meadow-arrival", "portal did not persist destination marker");

const missing = WORLD_ACTIONS.execute({ type: "portal", mapId: "missing-map", markerId: "x" });
let rejected = false;
try { await missing.output; } catch { rejected = true; }
assert(rejected, "unknown portal world did not reject");

console.log(`world-portal-action: ${passed} checks passed`);
