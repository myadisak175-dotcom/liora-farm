/* ==========================================================================
   speech-bubbles.js  —  words over a speaker's head: a small rounded bubble with a tail, that follows the speaker on
   the screen, pops in, stays a while and fades. A shout is bigger, in hot colours, and shakes. One job: draw them.
   (Who says what, and when, is the speaker's business.) A bubble sits over the speaker's head; where there is no room
   above it on the screen (a tall speaker seen from close by), it sits beside the head instead, its tail pointing in,
   on the side of the screen the head is on. It is always kept on the screen.

     const bubbles = createSpeechBubbles({ camera, far })   far: metres from the camera past which none is shown (55)
     bubbles.say(id, text, { lasts, loud })                 id: who says it (one bubble each: a new line takes the
                                                            place of the last); lasts: seconds; loud: a shout
     every frame: bubbles.update(dt, where)                 where(id, out): put the speaker's mouth (world) in out, or
                                                            return false to hide its bubble
     bubbles.clear()

   Plain page elements over the canvas (no picture is drawn in the 3D scene: the words stay sharp at any distance and
   cost the GPU nothing). They take no touches: the game under them plays on.
   ========================================================================== */
import * as THREE from 'three';

const CSS = `
.sb-bubble { position: fixed; left: 0; top: 0; z-index: 3; pointer-events: none; max-width: min(46vw, 230px); padding: 7px 12px 8px;
  border-radius: 14px; background: #fffdf3; color: #2b2a1c; border: 2px solid #3d4a24; box-shadow: 0 3px 10px #0004;
  font: 700 15px/1.3 system-ui, "Noto Sans Thai", sans-serif; text-align: center; white-space: normal; will-change: transform, opacity;
  opacity: 0; transition: opacity 0.18s; }
.sb-bubble::after { content: ''; position: absolute; left: 50%; bottom: -9px; width: 14px; height: 14px; margin-left: -7px; background: inherit;
  border: inherit; border-top: none; border-left: none; transform: rotate(45deg); border-radius: 0 0 4px 0; }
.sb-bubble.side-l::after { left: auto; right: -9px; bottom: auto; top: 50%; margin: -7px 0 0 0; transform: rotate(-45deg); }
.sb-bubble.side-r::after { left: -9px; bottom: auto; top: 50%; margin: -7px 0 0 0; transform: rotate(135deg); }
.sb-bubble.loud { background: #ffe9c2; color: #8a1c0c; border-color: #b8361c; font-size: 19px; font-weight: 900; letter-spacing: 0.5px; }
.sb-bubble .sb-in { display: block; animation: sb-pop 0.22s cubic-bezier(.3,1.6,.6,1); }
.sb-bubble.loud .sb-in { animation: sb-pop 0.22s cubic-bezier(.3,1.6,.6,1), sb-shake 0.09s linear 0.22s 12; }
@keyframes sb-pop { from { transform: scale(0.4); } to { transform: scale(1); } }
@keyframes sb-shake { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(-2px, 1px); } 75% { transform: translate(2px, -1px); } }
@media (prefers-reduced-motion: reduce) { .sb-bubble .sb-in, .sb-bubble.loud .sb-in { animation: none; } }
`;

export function createSpeechBubbles({ camera, far = 55 } = {}) {
  if (!document.getElementById('sb-style')) { const st = document.createElement('style'); st.id = 'sb-style'; st.textContent = CSS; document.head.append(st); }
  const live = new Map();                           // id -> { el, left, w, h }: its element, seconds left, its size on the screen
  const EDGE = 8;                                   // pixels kept clear at the screen's edges
  const at = new THREE.Vector3(), ndc = new THREE.Vector3();

  function say(id, text, { lasts = 2.5, loud = false } = {}) {
    let b = live.get(id);
    if (!b) { const el = document.createElement('div'); el.className = 'sb-bubble'; document.body.append(el); b = { el, left: 0 }; live.set(id, b); }
    b.el.classList.toggle('loud', !!loud);
    b.el.innerHTML = '';
    const inner = document.createElement('span'); inner.className = 'sb-in'; inner.textContent = text;      // (text, never markup)
    b.el.append(inner);
    b.left = lasts; b.w = 0;                        // (measured when it is first placed)
  }
  function hide(b) { if (b.el.style.opacity !== '0') b.el.style.opacity = '0'; }

  function update(dt, where) {
    const w = innerWidth, h = innerHeight;
    for (const [id, b] of live) {
      b.left -= dt;
      if (b.left <= 0 || !where(id, at)) { hide(b); if (b.left < -1) { b.el.remove(); live.delete(id); } continue; }
      if (at.distanceTo(camera.position) > far) { hide(b); continue; }
      ndc.copy(at).project(camera);
      if (ndc.z > 1 || Math.abs(ndc.x) > 1.5 || ndc.y < -1.2) { hide(b); continue; }       // behind the camera, or well off its sides or below it (above it: kept at the top edge, a tall speaker seen from close by)
      const x = (ndc.x * 0.5 + 0.5) * w, y = (-ndc.y * 0.5 + 0.5) * h;
      if (!b.w) { b.w = b.el.offsetWidth; b.h = b.el.offsetHeight; }
      // over the head; or, with no room above it, beside it (on the side of the screen it is on), its tail pointing in.
      // Either way its middle (cx, cy) is kept on the screen
      let cx = x, cy = y - 12 - b.h / 2, side = '';
      if (cy - b.h / 2 < EDGE) { side = x < w / 2 ? 'l' : 'r'; cx = x + (side === 'l' ? -1 : 1) * (b.w / 2 + 30); cy = y; }
      cx = Math.min(w - EDGE - b.w / 2, Math.max(EDGE + b.w / 2, cx)); cy = Math.min(h - EDGE - b.h / 2, Math.max(EDGE + b.h / 2, cy));
      if (b.side !== side) { b.el.classList.toggle('side-l', side === 'l'); b.el.classList.toggle('side-r', side === 'r'); b.side = side; }
      b.el.style.transform = `translate(${(cx - b.w / 2).toFixed(1)}px, ${(cy - b.h / 2).toFixed(1)}px)`;
      b.el.style.opacity = String(Math.min(1, b.left / 0.35));                 // (it fades as it ends)
    }
  }
  function clear() { for (const b of live.values()) b.el.remove(); live.clear(); }
  return { say, update, clear };
}
