const {
  SFX_BANK,
  SFX_NAMES,
  TOAST_YIELD_MS,
  createSfxGate,
  playbackRateFor,
  sfxEntry,
  soundForButton,
  soundForFarmAction,
  soundForWorldEvent,
} = await import("../../src/systems/sfx-bank.js");

let passed = 0;
function assert(value, message) {
  if (!value) throw new Error(message);
  passed += 1;
}

// --- the bank itself -------------------------------------------------------
const files = new Set();
for (const name of SFX_NAMES) {
  const bank = SFX_BANK[name];
  assert(/^sfx_[a-z_]+\.mp3$/.test(bank.file), `${name}: file name ${bank.file} is not sfx_*.mp3`);
  assert(!files.has(bank.file), `${name}: file ${bank.file} is used twice`);
  files.add(bank.file);
  assert(bank.gain > 0 && bank.gain <= 1, `${name}: gain ${bank.gain} out of range`);
  assert(bank.cooldownMs >= 0, `${name}: negative cooldown`);
  assert(bank.jitter >= 0 && bank.jitter <= 0.1, `${name}: jitter ${bank.jitter} would change pitch audibly`);
}
assert(sfxEntry("hoe") === SFX_BANK.hoe, "a known name resolves to its entry");
assert(sfxEntry("constructor") === null, "a prototype property is not a sound");
assert(sfxEntry("__proto__") === null, "__proto__ is not a sound");
assert(sfxEntry(undefined) === null, "a missing name is not a sound");

// --- events to sounds ------------------------------------------------------
for (const type of ["hoe", "water", "plant", "harvest"]) {
  assert(soundForFarmAction(type) === type, `farm action ${type} has its own sound`);
}
assert(soundForFarmAction("constructor") === null, "farm lookup ignores prototype names");
assert(soundForFarmAction(undefined) === null, "farm lookup ignores a missing action");

assert(soundForWorldEvent({ type: "farm-action", action: "harvest" }) === "harvest", "harvest event");
assert(soundForWorldEvent({ type: "farm-action", action: "dance" }) === null, "unknown farm action is silent");
assert(soundForWorldEvent({ type: "enter", node: { enabled: true } }) === "zoneEnter", "zone entry");
assert(soundForWorldEvent({ type: "enter", node: { enabled: false } }) === null, "a disabled zone is silent");
assert(soundForWorldEvent({ type: "enter" }) === null, "entry without a node is silent");
assert(soundForWorldEvent({ type: "exit", node: { enabled: true } }) === null, "leaving a zone is silent");
assert(soundForWorldEvent(null) === null, "null event");
assert(soundForWorldEvent("enter") === null, "non-object event");

// --- buttons ---------------------------------------------------------------
assert(soundForButton({ mode: "play" }) === "uiTap", "a plain button taps");
assert(soundForButton({ mode: "build" }) === null, "the builder stays quiet");
assert(soundForButton({}) === null, "no mode, no sound");
assert(soundForButton({ mode: "play", action: "farm" }) === null, "the farm button is silent at the tap");
for (const action of ["pickUp", "hammer", "mirror"]) {
  assert(soundForButton({ mode: "play", action, started: true }) === action, `${action} emote sound`);
  assert(soundForButton({ mode: "play", action, started: false }) === null, `${action} refused: no sound`);
  assert(soundForButton({ mode: "build", action, started: true }) === null, `${action} in build mode: silent`);
}

// Every bank entry must be reachable, so a sound added to the bank without a
// route cannot ship silently unused. "toast" is routed by the DOM watcher in
// audio-sfx.js rather than by a mapping function.
const reachable = new Set(["toast"]);
for (const type of ["hoe", "water", "plant", "harvest"]) reachable.add(soundForFarmAction(type));
for (const action of ["pickUp", "hammer", "mirror", undefined]) {
  reachable.add(soundForButton({ mode: "play", action, started: true }));
}
reachable.add(soundForWorldEvent({ type: "enter", node: { enabled: true } }));
for (const name of SFX_NAMES) assert(reachable.has(name), `${name} has no route to it`);
for (const name of reachable) assert(SFX_NAMES.includes(name), `a route points at unknown sound ${name}`);

// --- the gate --------------------------------------------------------------
{
  const gate = createSfxGate();
  assert(gate.allow("hoe", 1000) === true, "first play passes");
  assert(gate.allow("hoe", 1100) === false, "repeat inside the cooldown is blocked");
  assert(gate.allow("hoe", 1199) === false, "still inside the cooldown");
  assert(gate.allow("hoe", 1200) === true, "allowed once the cooldown has passed");
  assert(gate.allow("water", 1200) === true, "another sound has its own cooldown");
  assert(gate.allow("nonsense", 1300) === false, "unknown sound never plays");
  assert(gate.allow("hoe", Number.NaN) === false, "a broken clock never plays");
  assert(gate.allow("hoe", undefined) === false, "a missing clock never plays");
}
{
  const gate = createSfxGate();
  // A blocked repeat must not push the cooldown further out.
  gate.allow("uiTap", 0);
  gate.allow("uiTap", 30);
  assert(gate.allow("uiTap", 60) === true, "cooldown is measured from the last sound that played");
}
{
  const gate = createSfxGate();
  gate.allow("water", 5000);
  assert(gate.allow("toast", 5100) === false, "a toast yields to an action sound");
  assert(gate.allow("toast", 5000 + TOAST_YIELD_MS - 1) === false, "still yielding");
  assert(gate.allow("toast", 5000 + TOAST_YIELD_MS) === true, "the toast chimes after the yield window");
  assert(gate.allow("hoe", 5000 + TOAST_YIELD_MS + 10) === true, "a toast never holds an action sound back");
}
{
  const gate = createSfxGate();
  assert(gate.allow("toast", 0) === true, "a lone toast chimes, even at t=0");
  assert(gate.allow("toast", 100) === false, "a toast has its own cooldown");
  gate.reset();
  assert(gate.allow("toast", 100) === true, "reset forgets history");
}

// --- playback rate ---------------------------------------------------------
{
  const jitter = SFX_BANK.hoe.jitter;
  assert(Math.abs(playbackRateFor("hoe", () => 0) - (1 - jitter)) < 1e-9, "lowest rate is 1 - jitter");
  assert(Math.abs(playbackRateFor("hoe", () => 1) - (1 + jitter)) < 1e-9, "highest rate is 1 + jitter");
  assert(Math.abs(playbackRateFor("hoe", () => 0.5) - 1) < 1e-9, "the middle roll leaves the pitch alone");
  assert(playbackRateFor("hoe", () => 7) <= 1 + jitter + 1e-9, "a roll above 1 is clamped");
  assert(playbackRateFor("hoe", () => -3) >= 1 - jitter - 1e-9, "a roll below 0 is clamped");
  assert(playbackRateFor("hoe", () => Number.NaN) === 1, "a broken random source means no pitch change");
  assert(playbackRateFor("toast", () => 0) === 1, "chimes are never pitch-shifted");
  assert(playbackRateFor("zoneEnter", () => 1) === 1, "the zone chime is never pitch-shifted");
  assert(playbackRateFor("nonsense", () => 0) === 1, "an unknown sound has no jitter");
}

console.log(`sfx-bank: ${passed} assertions passed`);
