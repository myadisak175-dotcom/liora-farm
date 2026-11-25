/* ==========================================================================
   parry-fx.js  —  her parry, seen: the circle of her magic that snaps open at her palm, facing what comes ("แบบ doctor
   strange", 26 Nov 2026; asked to be the game's own look, not the film's orange). It is the lance's circle
   (magic-combo-fx.js' gate: three layers that turn against each other and come together, the one the user asked for on
   23 Nov 2026), opened and shut far faster: the three layers spring out toward what comes and click together into one in
   a tenth of a second. A blow taken on it: it flares and breaks, throwing a hoop of her water and slivers of ice out
   round it (the gate's own, as when the lance goes through it), and her water splashes where the blow struck. Nothing
   taken: it breaks up. One job: draw that; parry.js says when and where.

     const fx = createParryFx({ combo })     combo: magic-combo-fx.js' createMagicComboFx() (the page's, or her spells')
     fxScene.add(fx.object)                  (combo.object: if the page draws the combo itself, leave it out)
     fx.raise(size)                          the press: a circle snaps open (size: of her 1.75 m)
     fx.place(at, dir, radius)               every frame it shows: its middle, the way it faces (unit: toward what comes)
     fx.take(point, dir, size)               a blow taken there: the flare, the hoop, the splash
     fx.whiff()                              nothing came: it breaks up
     fx.update(dt, camera)                   every frame (the combo's update)
     fx.setNight(on)
   ========================================================================== */
import * as THREE from 'three';

export const PARRY_FX = {
  open: 0.06,        // s the circle takes to open
  shut: 42,          // 1/s its three layers come together (the lance's: 9)
  level: 3,          // how ornate (the lance's: how grown, 0..3; 3 has the seals on its rim)
  splash: 0.9,       // the splash of water where a blow is taken (of her size)
};

export function createParryFx({ combo }) {
  let gate = null;
  const tmp = new THREE.Vector3();
  return {
    object: combo.object,
    raise(size = 1) {
      if (gate) gate.end();
      gate = combo.gate({ open: PARRY_FX.open, shut: PARRY_FX.shut });
      gate.size(PARRY_FX.level);
      gate.close(1);
    },
    place(at, dir, radius) { if (gate) gate.place(at, dir, radius); },
    take(point, dir, size = 1) {
      if (gate) { gate.fire(); gate = null; }
      combo.burst(tmp.copy(point), PARRY_FX.splash * size, true, 'water');
    },
    whiff() { if (gate) { gate.end(); gate = null; } },
    get up() { return !!gate; },
    update(dt, camera) { combo.update(dt, camera); },
    setNight(on) { if (combo.setNight) combo.setNight(on); },
  };
}
