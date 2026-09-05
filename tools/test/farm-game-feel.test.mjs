import assert from "node:assert/strict";
import test from "node:test";
import { createFarmUI } from "../../src/ui/farm-ui.js";
import { getFarmJourney } from "../../src/systems/farming/journey.js";

// These fixtures model the asynchronous animation boundary. The production UI
// and journey run unchanged; no browser, renderer, timers or assets are needed.
function fixture() {
  const classNames = new Set();
  const button = {
    textContent: "", disabled: false, dataset: {}, attributes: {}, onclick: null,
    setAttribute(key, value) { this.attributes[key] = value; },
    classList: {
      add: (name) => classNames.add(name), remove: (name) => classNames.delete(name),
      toggle(name, on) { if (on) classNames.add(name); else classNames.delete(name); },
    },
  };
  const cells = Array.from({ length: 3 }, (_, i) => ({
    index: i, state: "empty", soilState: "plain", plantedAt: 0,
    world: { x: i, y: 0, z: 0 }, progress: 0,
  }));
  let selected = 0;
  let finish = null;
  let allowAnimation = true;
  let calls = 0;
  const completed = [];
  const started = [];
  const pouchCount = { textContent: "" };
  const crops = {
    cells, pouch: 0,
    getTarget() { return selected === null ? null : { ...cells[selected] }; },
    hoe(i) {
      const cell = cells[i];
      if (cell.state !== "empty" || cell.soilState !== "plain") return false;
      cell.soilState = "tilled";
      return true;
    },
    water(i) {
      const cell = cells[i];
      if (cell.soilState !== "tilled") return false;
      cell.soilState = "watered";
      return true;
    },
    plant(i) {
      const cell = cells[i];
      if (cell.state !== "empty" || cell.soilState !== "watered") return false;
      cell.state = "growing";
      cell.plantedAt = 100000;
      return true;
    },
    harvest(i) {
      const cell = cells[i];
      if (cell.state !== "ripe") return false;
      cell.state = "empty";
      cell.soilState = "tilled";
      this.pouch += 1;
      return true;
    },
  };
  const playerRuntime = {
    position: { x: 0, y: 0, z: 0 },
    playSpecial(name, done) {
      calls += 1;
      if (!allowAnimation || finish) return false;
      finish = done;
      return true;
    },
  };
  const ui = createFarmUI({
    crops, button, pouchCount, playerRuntime,
    animations: { hammer: "hoe", pickUp: "plant", pullRadish: "harvest" },
    onActionStart: (event) => started.push(event),
    onActionComplete: (event) => completed.push(event),
  });
  ui.refresh();
  return {
    ui, button, crops, cells, completed, started, pouchCount,
    select(i) { selected = i; },
    rejectAnimation() { allowAnimation = false; },
    get calls() { return calls; },
    tap() { button.onclick?.(); },
    finish() { const done = finish; finish = null; done?.(); return done; },
  };
}

test("the first basket follows saved soil and crop states without a second save", () => {
  const f = fixture();
  assert.equal(getFarmJourney(f.crops).phase, "hoe");
  for (const [phase, next] of [["hoe", "water"], ["water", "plant"], ["plant", "hoe"]]) {
    assert.equal(f.button.dataset.phase, phase);
    f.tap();
    assert.equal(f.ui.busy, true);
    assert.equal(f.completed.length, f.started.length - 1);
    f.finish();
    assert.equal(getFarmJourney(f.crops).phase, next);
  }
  f.ui.dispose();
});

test("harvest awards once after animation, even with rapid taps and a duplicate completion", () => {
  const f = fixture();
  f.cells[0].state = "ripe";
  f.ui.refresh();
  f.tap(); f.tap(); f.tap();
  assert.equal(f.calls, 1);
  assert.equal(f.crops.pouch, 0);
  assert.equal(f.button.attributes["aria-busy"], "true");
  const done = f.finish();
  done();
  assert.equal(f.crops.pouch, 1);
  assert.equal(f.completed.length, 1);
  assert.equal(f.completed[0].type, "harvest");
  assert.equal(f.pouchCount.textContent, "1");
  assert.equal(f.button.dataset.phase, "water");
  assert.equal(f.button.attributes["aria-busy"], "false");
  f.ui.dispose();
});

test("a tap rechecks the real target before starting an action", () => {
  const f = fixture();
  f.cells[1].soilState = "watered";
  f.select(1);
  f.tap(); f.finish();
  assert.equal(f.cells[0].soilState, "plain");
  assert.equal(f.cells[1].state, "growing");
  assert.equal(f.completed[0].index, 1);
  assert.equal(f.completed[0].type, "plant");
  f.ui.dispose();
});

test("leaving range before tapping never starts an action on the old target", () => {
  const f = fixture();
  f.select(null);
  f.tap();
  assert.equal(f.calls, 0);
  assert.equal(f.button.disabled, true);
  f.ui.dispose();
});

test("switching to Build cancels a pending harvest, including a quick return to Play", () => {
  const f = fixture();
  f.cells[0].state = "ripe";
  f.tap();
  f.ui.setActive(false);
  f.ui.setActive(true);
  f.finish();
  assert.equal(f.crops.pouch, 0);
  assert.equal(f.completed.length, 0);
  f.tap(); f.finish();
  assert.equal(f.crops.pouch, 1);
  f.ui.dispose();
});

test("a rejected animation cannot change the farm or generate a reward", () => {
  const f = fixture();
  f.rejectAnimation();
  f.tap();
  assert.equal(f.cells[0].soilState, "plain");
  assert.equal(f.started.length, 0);
  assert.equal(f.completed.length, 0);
  assert.equal(f.ui.busy, false);
  assert.equal(f.button.disabled, false);
  f.ui.dispose();
});

test("disposing a map while an animation is pending cannot modify its saved farm", () => {
  const f = fixture();
  f.tap();
  f.ui.dispose();
  f.finish();
  assert.equal(f.cells[0].soilState, "plain");
  assert.equal(f.completed.length, 0);
  assert.equal(f.button.onclick, null);
});

test("a crop changed during the animation receives no success feedback", () => {
  const f = fixture();
  f.cells[0].state = "ripe";
  f.tap();
  f.cells[0].state = "growing";
  f.finish();
  assert.equal(f.crops.pouch, 0);
  assert.equal(f.completed.length, 0);
  f.ui.dispose();
});

test("the journey waits for planted crops and gives harvest priority as soon as one is ripe", () => {
  const f = fixture();
  for (const cell of f.cells) { cell.state = "growing"; cell.plantedAt = 100000; }
  const waiting = getFarmJourney({ ...f.crops, now: 110000, growSeconds: 40 });
  assert.equal(waiting.phase, "growing");
  assert.match(waiting.hint, /30/);
  f.cells[1].state = "ripe";
  assert.equal(getFarmJourney(f.crops).phase, "harvest");
  f.ui.dispose();
});

test("three harvested crops complete the basket and restored saves keep their progress", () => {
  const f = fixture();
  for (const cell of f.cells) {
    cell.state = "ripe";
    f.select(cell.index);
    f.tap(); f.finish();
  }
  assert.equal(getFarmJourney(f.crops).complete, true);
  const restored = JSON.parse(JSON.stringify(f.crops));
  assert.equal(getFarmJourney(restored).progress, 3);
  assert.equal(getFarmJourney({ cells: [], pouch: 25 }).complete, true);
  assert.equal(getFarmJourney({ cells: [], pouch: 2 }).progress, 2);
  assert.equal(getFarmJourney({ cells: [], pouch: NaN }).complete, false);
  f.ui.dispose();
});
