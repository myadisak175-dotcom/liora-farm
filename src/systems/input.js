export function createInput() {
  const keys = {};
  const joystick = { x: 0, y: 0 };
  let pointer = null;

  addEventListener("keydown", (event) => { keys[event.key.toLowerCase()] = true; });
  addEventListener("keyup", (event) => { keys[event.key.toLowerCase()] = false; });

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

  function end(event) {
    if (event.pointerId !== pointer) return;
    pointer = null;
    joystick.x = 0;
    joystick.y = 0;
    stick.style.transform = "translate(0, 0)";
  }

  joy.addEventListener("pointerdown", (event) => {
    pointer = event.pointerId;
    joy.setPointerCapture(pointer);
    move(event);
  });
  joy.addEventListener("pointermove", (event) => {
    if (event.pointerId === pointer) move(event);
  });
  joy.addEventListener("pointerup", end);
  joy.addEventListener("pointercancel", end);

  return {
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
