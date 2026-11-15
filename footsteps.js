// footsteps.js
// The sound of her feet on the land. player.js says when a foot comes down (onStep); this plays the step.
//
//   const steps = createFootsteps();
//   steps.step(pace)        // pace 0 = a walk, 1 = a full run: a run is louder and a little brighter
//
// One recording (assets/sounds/step-grass.mp3), played a touch higher or lower and louder or softer each time, so a walk
// does not sound like the same clip over and over. Phones keep sound locked until the first touch or key: the first one
// opens it. The sound pauses with the page when the game is hidden.

const URL_GRASS = new URL('./assets/sounds/step-grass.mp3', import.meta.url).href;

export function createFootsteps({ url = URL_GRASS, volume = 0.55 } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return { step() {}, set volume(v) {}, get volume() { return 0; } };
  let ctx = null, out = null, buffer = null, loading = null, last = 0, side = 1;

  function open() {
    if (!ctx) {
      ctx = new AC();
      out = ctx.createGain(); out.gain.value = volume; out.connect(ctx.destination);
      loading = fetch(url).then(r => r.arrayBuffer())
        .then(data => new Promise((ok, fail) => ctx.decodeAudioData(data, ok, fail)))
        .then(b => { buffer = b; })
        .catch(e => console.warn('[footsteps] the step sound could not be loaded', e));
    }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
  }
  for (const type of ['pointerdown', 'touchend', 'keydown']) addEventListener(type, open, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
  });

  return {
    get volume() { return volume; },
    set volume(v) { volume = v; if (out) out.gain.value = v; },
    step(pace = 0) {
      if (!buffer || !ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (now - last < 0.12) return;                     // two feet a hair apart (a stop, a turn on the spot): one sound
      last = now;
      side = -side;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = (0.92 + Math.random() * 0.16) * (1 + 0.06 * pace);
      const g = ctx.createGain();
      g.gain.value = (0.7 + Math.random() * 0.25) * (0.75 + 0.45 * pace);
      let node = g;
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = 0.12 * side; g.connect(p); node = p; }   // left foot, right foot
      src.connect(g); node.connect(out);
      src.start(now);
    },
  };
}
