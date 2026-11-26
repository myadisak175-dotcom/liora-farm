/* ==========================================================================
   npc-face.js  —  an NPC's face, for a model that has one (stylized-character.js's ch.face: a model made with
   tools/prep-vrm1.py --faces happy,relaxed,aa,ih,ou,ee,oh,blink). npc.js drives it; it only moves her face.

   She blinks now and then, whatever she is doing. When she greets the player she smiles, a beaming smile at first
   (her eyes closing into it, VRM "happy") that settles into a soft one ("relaxed") for as long as they talk; while a
   line of hers is up she moves her mouth through the vowels (aa ih ou ee oh), syllable by syllable, as long as the line
   would take to say; then her mouth comes to rest. When they part the smile fades.

     const face = createNpcFace(ch.face)      // null when the model has no face to move
     face.greet()                             // the player has come up: the big smile
     face.say(text)                           // a line of hers has come up: her mouth moves for as long as it takes
     every frame: face.update(dt, talking)    // talking: she is with the player (smiling)
   ========================================================================== */

const SYLLABLE = 0.13;                  // seconds a mouth shape is held, about (Thai speech: some 7 syllables a second)
const PER_CHAR = 0.055;                 // seconds of talking a character of the line takes (Thai: vowels and tones are characters too)
const VOWELS = ['aa', 'ih', 'ou', 'ee', 'oh'];
const OPEN = { aa: 0.55, ih: 0.4, ou: 0.45, ee: 0.4, oh: 0.5 };   // how far each opens (all the way looks shouted)
const BEAM = 1, BEAM_FOR = 1.3;         // the greeting's smile, and how long before it settles
const SOFT = 0.5;                       // the smile she keeps while they talk

export function createNpcFace(f) {
  if (!f) return null;
  const has = new Set(f.names);
  const w = { happy: 0, relaxed: 0, blink: 0 };
  for (const v of VOWELS) w[v] = 0;
  let beamT = 0, mouthT = 0, sylT = 0, vowel = null, vowelOpen = 0;
  let blinkIn = 1.5 + Math.random() * 3, blinkT = -1;
  const ease = (cur, want, rate, dt) => cur + (want - cur) * Math.min(1, dt * rate);

  return {
    greet() { beamT = BEAM_FOR; },
    say(text) { mouthT = Math.max(0.6, String(text).length * PER_CHAR); sylT = 0; },
    update(dt, talking) {
      // the smile: beaming just after the greeting, soft while they talk, none when they part
      if (beamT > 0) beamT -= dt;
      const beam = beamT > 0 ? BEAM : 0, soft = talking ? SOFT : 0;
      w.happy = ease(w.happy, beam, beam ? 9 : 3, dt);
      w.relaxed = ease(w.relaxed, beam ? 0 : soft, 3, dt);
      // her mouth: a new shape every syllable while the line lasts, closing a little between some of them
      if (mouthT > 0) {
        mouthT -= dt;
        if ((sylT -= dt) <= 0) {
          sylT = SYLLABLE * (0.7 + Math.random() * 0.6);
          const pause = Math.random() < 0.18;
          vowel = VOWELS[(Math.random() * VOWELS.length) | 0];
          vowelOpen = pause ? 0.08 : OPEN[vowel] * (0.75 + Math.random() * 0.25);
        }
      } else vowelOpen = 0;
      for (const v of VOWELS) w[v] = ease(w[v], v === vowel ? vowelOpen : 0, 18, dt);
      // blinking: quick shut, a little slower open; not while her eyes are already closed in the big smile
      if (blinkT < 0 && (blinkIn -= dt) <= 0 && w.happy < 0.3) { blinkT = 0; blinkIn = 2 + Math.random() * 4.5; if (Math.random() < 0.15) blinkIn = 0.25; }
      if (blinkT >= 0) {
        blinkT += dt;
        w.blink = blinkT < 0.06 ? blinkT / 0.06 : blinkT < 0.1 ? 1 : Math.max(0, 1 - (blinkT - 0.1) / 0.1);
        if (blinkT > 0.2) { blinkT = -1; w.blink = 0; }
      }
      // smiling closes her eyes partly already: a blink on top only closes them the rest of the way
      const shut = Math.min(1, w.blink * (1 - w.happy));
      for (const k in w) if (has.has(k)) f.set(k, k === 'blink' ? shut : w[k]);
    },
  };
}
