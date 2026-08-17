/**
 * `bind` is the only way listeners are attached here.
 *
 * Input is the system that hurts most when a second boot leaves the first
 * one's listeners alive: two joysticks both writing movement, keys sticking
 * down on a player object that no longer exists. Routing every listener
 * through one helper means `dispose()` cannot miss one.
 */
export function createInput() {
  const keys = {};
  const joystick = { x: 0, y: 0 };
  let pointer = null;
  const bound = [];
  const bind = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    bound.push(() => target.removeEventListener(type, handler, options));
  };

  bind(window, "keydown", (event) => { keys[event.key.toLowerCase()] = true; });
  bind(window, "keyup", (event) => { keys[event.key.toLowerCase()] = false; });

  const joy = document.querySelector("#joy");
  const stick = document.querySelector("#stick");

  function move(event) {
    const rect = joy.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = event.clientX - cx;
    let dy = event.clientY - cy;
    const max = 40;
    const length = Math.hypot(dx, dy) || 1;
    if (length > max) {
      dx *= max / length;
      dy *= max / length;
    }
    joystick.x = dx / max;
    joystick.y = dy / max;
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function reset() {
    pointer = null;
    joystick.x = 0;
    joystick.y = 0;
    stick.style.transform = "translate(0, 0)";
  }

  function end(event) {
    if (event.pointerId !== pointer) return;
    reset();
  }

  bind(joy, "pointerdown", (event) => {
    // The first finger owns the joystick until it ends. A second finger is
    // commonly used for camera gestures and must never steal movement input.
    if (pointer !== null) return;
    if (event.pointerType === "touch" && event.isPrimary === false) return;
    pointer = event.pointerId;
    joy.setPointerCapture(pointer);
    move(event);
  });
  bind(joy, "pointermove", (event) => {
    if (event.pointerId === pointer) move(event);
  });
  bind(joy, "pointerup", end);
  bind(joy, "pointercancel", end);
  bind(window, "blur", reset);

  return {
    /** Drop every listener and centre the stick. Safe to call twice. */
    dispose() {
      for (const off of bound.splice(0)) off();
      reset();
    },
    get() {
      let x = joystick.x;
      let z = joystick.y;
      if (keys.a || keys.arrowleft) x -= 1;
      if (keys.d || keys.arrowright) x += 1;
      if (keys.w || keys.arrowup) z -= 1;
      if (keys.s || keys.arrowdown) z += 1;
      const magnitude = Math.hypot(x, z);
      if (magnitude <= 0.05) return { x: 0, z: 0, m: 0 };
      return {
        x: x / Math.max(1, magnitude),
        z: z / Math.max(1, magnitude),
        m: magnitude,
      };
    },
  };
}
