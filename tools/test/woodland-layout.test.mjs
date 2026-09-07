import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import {
  createWoodlandPlan, distanceToWoodlandTrail, woodlandItemAllowed, woodlandGroundStrokes,
} from "../../src/systems/woodland-layout.js";

// The real config/catalog load unchanged. Rendering is not involved in these
// placement and movement constraints, so only their two math imports need a stub.
const mathOnly = `export class Vector3 { constructor(x,y,z){Object.assign(this,{x,y,z});} }
export const MathUtils = { degToRad: n => n * Math.PI / 180 };`;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    return specifier === "three"
      ? { url: `data:text/javascript,${encodeURIComponent(mathOnly)}`, shortCircuit: true }
      : next(specifier, context);
  },
});
const { CONFIG } = await import("../../src/config.js");
const { NATURE_V2_ASSETS: assets } = await import("../../src/editor/nature-catalog-v2.js");
hooks.deregister();
const config = CONFIG.woodland;
const plan = createWoodlandPlan(config, assets);

test("the authored grove is repeatable and fills its bounded mobile budget", () => {
  assert.deepEqual(createWoodlandPlan(config, assets), plan);
  assert.notDeepEqual(createWoodlandPlan({ ...config, seed: config.seed + 1 }, assets).items, plan.items);
  for (const kind of ["tree", "rock", "plant"]) {
    assert.equal(plan.items.filter((item) => item.kind === kind).length, config[`${kind}Count`]);
  }
  assert.equal(new Set(plan.items.map((item) => item.id)).size, plan.items.length);
  assert.ok(plan.items.reduce((total, item) => total + assets[item.assetId].tris, 0) < 500000);
});

test("every trail has a continuous player-width corridor through the trees and rocks", () => {
  for (const trail of plan.trails) {
    for (let i = 1; i < trail.length; i += 1) {
      assert.ok(Math.hypot(trail[i].x - trail[i - 1].x, trail[i].z - trail[i - 1].z) < 1);
    }
  }
  for (const item of plan.items) {
    const distance = distanceToWoodlandTrail(item.x, item.z, plan.trails);
    assert.ok(distance >= config.trailRadius + item.clearance - 0.002, item.id);
    if (item.radius) assert.ok(distance > item.radius + CONFIG.playerRadius + 0.5, item.id);
  }
});

test("forest stays inside walkable terrain and out of the farm, arrival and glade", () => {
  for (const item of plan.items) {
    assert.ok(Math.abs(item.x) + item.radius < CONFIG.worldLimit);
    assert.ok(Math.abs(item.z) + item.radius < CONFIG.worldLimit);
    for (const area of config.clearings) {
      assert.ok(Math.hypot(item.x - area.x, item.z - area.z) >= area.radius + item.clearance - 0.002);
    }
  }
  const trees = plan.items.filter((item) => item.kind === "tree");
  for (let i = 0; i < trees.length; i += 1) {
    for (let j = i + 1; j < trees.length; j += 1) {
      assert.ok(Math.hypot(trees[i].x - trees[j].x, trees[i].z - trees[j].z) >= config.treeSpacing - 0.002);
    }
  }
});

test("a saved building masks the grove locally without moving any other tree", () => {
  const item = plan.items[0];
  const before = structuredClone(plan);
  assert.equal(woodlandItemAllowed(item, { config, heightAt: () => 0 }), true);
  assert.equal(woodlandItemAllowed(item, {
    config, heightAt: () => 0, blockers: [{ x: item.x, z: item.z, radius: 3 }],
  }), false);
  assert.equal(woodlandItemAllowed(item, { config, heightAt: () => 0, blockers: [] }), true);
  assert.deepEqual(plan, before);
});

test("flooded, invalid and steep ground cannot gain an invisible trunk collider", () => {
  const item = plan.items[0];
  assert.equal(woodlandItemAllowed(item, { config, heightAt: () => -1, waterLevel: -0.6 }), false);
  assert.equal(woodlandItemAllowed(item, { config, heightAt: () => NaN }), false);
  assert.equal(woodlandItemAllowed(item, { config, heightAt: (x) => x * 2 }), false);
  assert.equal(woodlandItemAllowed(item, { config, heightAt: (x) => x * 0.1 }), true);
});

test("ground strokes use the game's dirt layer and only active trees get litter", () => {
  const activeTree = plan.items.find((item) => item.kind === "tree");
  const strokes = woodlandGroundStrokes(plan, [activeTree], config);
  assert.equal(strokes.length, 1 + plan.trails.reduce((sum, trail) => sum + trail.length, 0));
  assert.deepEqual(strokes[0].slice(0, 2), [activeTree.x, activeTree.z]);
  assert.ok(strokes.every((stroke) => stroke.every(Number.isFinite) && stroke[3] === config.dirtLayer));
});
