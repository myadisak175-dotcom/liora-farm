// player-input.js
// What the player's hands say, for the player with the moves (player-moves.js): touch screens (landscape first) and
// keyboard + mouse. The same hands as player.js, read in one place.
//
//   left side of the screen  : floating joystick (push far = run)        keyboard: WASD / arrows, C = walk
//   right side of the screen : drag to look around                       mouse: drag, wheel = nearer / further
//   jump, dash buttons (index.html) call player.jump(), player.dash()    keyboard: Space, Shift
//   attack, roll, barrier buttons (index.html): player.attack() .. release(), player.roll(), player.barrier()
//                                                                        keyboard: J (held: held), K, B
//   blink button (index.html, blink.html): player.blink()                keyboard: E or L
//
//   const input = createPlayerInput({ dom: renderer.domElement, ui: document.getElementById('stick'), onTap, onJump, onDash, onLook, onZoom,
//                                     onAttack, onAttackUp, onRoll, onBarrier, onBlink });
//   input.stick(out)   every frame: fills out (a Vector2: x to the right, y towards the player, -1..1) and returns how far it is pushed, 0..1
//   input.looking      a finger (or the mouse) is turning the camera right now
//
// onLook(yaw, pitch): how far the look was dragged since the last call, in radians (the camera's: player-camera.js).

import * as THREE from 'three';

const STICK_R = 56;                           // the joystick's reach on the screen (px)

export function createPlayerInput({ dom, ui = null, onTap = null, onJump = null, onDash = null, onLook = null, onZoom = null,
  onAttack = null, onAttackUp = null, onRoll = null, onBarrier = null, onBlink = null }) {
  const move = new THREE.Vector2();           // the joystick, -1..1
  const keys = new Set();
  let stickId = null, lookId = null, tapT = 0;
  const stick0 = new THREE.Vector2(), look0 = new THREE.Vector2(), tap0 = new THREE.Vector2();
  const base = ui, knob = ui ? ui.firstElementChild : null;
  const showStick = (on, x = 0, y = 0) => { if (base) { base.style.opacity = on ? 1 : 0; if (on) { base.style.left = x + 'px'; base.style.top = y + 'px'; } } };
  const setKnob = (dx, dy) => { if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`; };

  // ---- touch: one finger on each half of the screen
  dom.addEventListener('pointerdown', e => {
    dom.setPointerCapture(e.pointerId);
    const touch = e.pointerType !== 'mouse';
    if (touch && e.clientX < innerWidth * 0.45 && stickId === null) {
      stickId = e.pointerId; stick0.set(e.clientX, e.clientY); showStick(true, e.clientX, e.clientY); setKnob(0, 0);
    } else if (lookId === null) { lookId = e.pointerId; look0.set(e.clientX, e.clientY); tap0.set(e.clientX, e.clientY); tapT = performance.now(); }
  });
  dom.addEventListener('pointermove', e => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - stick0.x, dy = e.clientY - stick0.y;
      const l = Math.hypot(dx, dy);
      if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
      setKnob(dx, dy);
      move.set(dx / STICK_R, dy / STICK_R);
    } else if (e.pointerId === lookId) {
      const k = 0.0052 * Math.min(1.6, 900 / Math.max(innerWidth, innerHeight) + 0.55);      // (a small screen turns further per pixel)
      if (onLook) onLook(-(e.clientX - look0.x) * k, (e.clientY - look0.y) * k * 0.8);
      look0.set(e.clientX, e.clientY);
    }
  });
  const up = e => {
    if (e.pointerId === stickId) { stickId = null; move.set(0, 0); showStick(false); }
    if (e.pointerId === lookId) {
      lookId = null;
      // a quick touch that did not drag is a tap on the world
      if (onTap && e.type === 'pointerup' && performance.now() - tapT < 320 && Math.hypot(e.clientX - tap0.x, e.clientY - tap0.y) < 10) onTap(e.clientX, e.clientY);
    }
  };
  dom.addEventListener('pointerup', up);
  dom.addEventListener('pointercancel', up);
  dom.addEventListener('wheel', e => { if (onZoom) onZoom(e.deltaY * 0.004); }, { passive: true });

  // ---- keyboard
  addEventListener('keydown', e => {
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Space' && onJump) onJump();
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && onDash) onDash();
    if (e.code === 'KeyJ' && onAttack) onAttack();
    if (e.code === 'KeyK' && onRoll) onRoll();
    if (e.code === 'KeyB' && onBarrier) onBarrier();
    if ((e.code === 'KeyE' || e.code === 'KeyL') && onBlink) onBlink();
  });
  addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'KeyJ' && onAttackUp) onAttackUp(); });
  addEventListener('blur', () => keys.clear());

  return {
    get looking() { return lookId !== null; },
    stick(out) {
      if (stickId !== null) out.copy(move);
      else {
        let mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
        let mz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
        const l = Math.hypot(mx, mz);
        if (l > 0) { const s = (keys.has('KeyC') ? 0.5 : 1) / l; mx *= s; mz *= s; }
        out.set(mx, mz);
      }
      return Math.min(1, out.length());
    },
  };
}
