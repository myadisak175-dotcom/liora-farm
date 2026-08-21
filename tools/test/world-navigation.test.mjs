import {
  WORLD_ARRIVAL_STORAGE_KEY,
  createWorldNavigation,
} from "../../src/systems/world-navigation.js";

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
}

const docs = new Map([
  ["./maps/index.json", {
    version: 1,
    maps: [
      { id: "home-island", name: "Home", file: "./maps/home-island.json" },
      { id: "meadow-demo", name: "Meadow", file: "./maps/meadow-demo.json" },
    ],
  }],
  ["./maps/meadow-demo.json", {
    logic: {
      version: 2,
      nodes: [
        { id: "meadow-arrival", kind: "marker", label: "Arrival", x: 2, z: 3 },
        { id: "not-a-marker", kind: "zone", x: 9, z: 9 },
      ],
    },
  }],
]);
const fetcher = async (url) => ({
  ok: docs.has(url),
  async json() { return docs.get(url); },
});

let time = 1000;
const storage = new MemoryStorage();
const nav = createWorldNavigation({
  fetcher,
  storage,
  locationRef: null,
  now: () => time,
});

let passed = 0;
function assert(value, message) {
  if (!value) throw new Error(message);
  passed += 1;
}

const maps = await nav.listMaps();
assert(maps.length === 2, "map registry did not load");
assert((await nav.mapEntry("meadow-demo"))?.file === "./maps/meadow-demo.json", "map file was guessed instead of resolved from registry");
assert((await nav.mapEntry("missing-map")) === null, "unknown map was accepted");

const markers = await nav.listMarkers("meadow-demo");
assert(markers.length === 1 && markers[0].id === "meadow-arrival", "marker filter accepted non-markers");

assert(nav.setArrival({ mapId: "meadow-demo", markerId: "meadow-arrival" }), "arrival token could not be written");
assert(storage.getItem(WORLD_ARRIVAL_STORAGE_KEY), "arrival token was not stored");
const first = nav.consumeArrival("meadow-demo");
assert(first?.markerId === "meadow-arrival", "arrival token did not resolve");
assert(nav.consumeArrival("meadow-demo") === null, "arrival token was not one-shot");

nav.setArrival({ mapId: "meadow-demo", markerId: "meadow-arrival" });
time += 130000;
assert(nav.consumeArrival("meadow-demo") === null, "stale arrival token survived max age");

time = 2000;
nav.setArrival({ mapId: "meadow-demo", markerId: "meadow-arrival" });
assert(nav.consumeArrival("home-island") === null, "arrival token leaked into the wrong map");
assert(nav.consumeArrival("meadow-demo") === null, "wrong-map boot did not consume the unsafe token");

const prepared = await nav.navigate({ mapId: "meadow-demo", markerId: "meadow-arrival" });
assert(prepared.ok && prepared.code === "prepared", "valid portal target was not prepared");
assert(prepared.url.includes("map=meadow-demo"), "portal URL did not contain target map");
assert(nav.consumeArrival("meadow-demo")?.markerId === "meadow-arrival", "navigate did not write destination marker");

const unknown = await nav.navigate({ mapId: "missing-map", markerId: "x" });
assert(!unknown.ok && unknown.code === "unknown-map", "portal accepted an unregistered world");

nav.setArrival({ mapId: "meadow-demo", markerId: "meadow-arrival" });
const resolved = await nav.resolveArrivalSpawn("meadow-demo");
assert(resolved?.x === 2 && resolved?.z === 3, "authored marker did not resolve to a spawn point");

console.log(`world-navigation: ${passed} checks passed`);
