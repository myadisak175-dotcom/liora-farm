const input = (() => {
  const keys = new Set();
  let joystickPointerId = null;
  let joystickVector = { x: 0, y: 0 };
  let actionQueued = false;

  function getJoystickLayout() {
    const radius = Math.min(54, Math.max(42, window.innerWidth * 0.13));
    return { x: 24 + radius, y: window.innerHeight - 24 - radius, radius };
  }

  function getActionLayout() {
    const radius = Math.min(46, Math.max(38, window.innerWidth * 0.11));
    return { x: window.innerWidth - 24 - radius, y: window.innerHeight - 24 - radius, radius };
  }

  function distanceSquared(aX, aY, bX, bY) {
    const dx = aX - bX;
    const dy = aY - bY;
    return dx * dx + dy * dy;
  }

  function updateJoystick(x, y) {
    const layout = getJoystickLayout();
    const dx = x - layout.x;
    const dy = y - layout.y;
    const distance = Math.hypot(dx, dy);
    const maxDistance = layout.radius;
    if (distance === 0) {
      joystickVector = { x: 0, y: 0 };
      return;
    }
    const strength = Math.min(1, distance / maxDistance);
    joystickVector = {
      x: (dx / distance) * strength,
      y: (dy / distance) * strength,
    };
  }

  function pointerDown(pointerId, x, y) {
    const action = getActionLayout();
    if (distanceSquared(x, y, action.x, action.y) <= action.radius ** 2) {
      actionQueued = true;
      return true;
    }

    const joystick = getJoystickLayout();
    if (distanceSquared(x, y, joystick.x, joystick.y) <= (joystick.radius * 1.45) ** 2) {
      joystickPointerId = pointerId;
      updateJoystick(x, y);
      return true;
    }
    return false;
  }

  function pointerMove(pointerId, x, y) {
    if (pointerId !== joystickPointerId) return false;
    updateJoystick(x, y);
    return true;
  }

  function pointerUp(pointerId) {
    if (pointerId !== joystickPointerId) return false;
    joystickPointerId = null;
    joystickVector = { x: 0, y: 0 };
    return true;
  }

  function getMovement() {
    let x = joystickVector.x;
    let y = joystickVector.y;
    if (keys.has("arrowleft") || keys.has("a")) x -= 1;
    if (keys.has("arrowright") || keys.has("d")) x += 1;
    if (keys.has("arrowup") || keys.has("w")) y -= 1;
    if (keys.has("arrowdown") || keys.has("s")) y += 1;
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  function consumeAction() {
    if (!actionQueued) return false;
    actionQueued = false;
    return true;
  }

  function draw(ctx, contextualLabel = null) {
    const joystick = getJoystickLayout();
    ctx.fillStyle = "rgba(9, 24, 28, 0.38)";
    ctx.beginPath();
    ctx.arc(joystick.x, joystick.y, joystick.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.stroke();

    const knobX = joystick.x + joystickVector.x * joystick.radius * 0.55;
    const knobY = joystick.y + joystickVector.y * joystick.radius * 0.55;
    ctx.fillStyle = "rgba(255,255,255,0.76)";
    ctx.beginPath();
    ctx.arc(knobX, knobY, joystick.radius * 0.38, 0, Math.PI * 2);
    ctx.fill();

    const action = getActionLayout();
    ctx.fillStyle = "rgba(180, 107, 44, 0.88)";
    ctx.beginPath();
    ctx.arc(action.x, action.y, action.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 3;
    ctx.stroke();
    if (contextualLabel) {
      const prompt = `ACTION · ${contextualLabel}`;
      ctx.font = "700 13px system-ui, sans-serif";
      const promptWidth = Math.min(170, ctx.measureText(prompt).width + 20);
      const promptY = action.y - action.radius - 30;
      ctx.fillStyle = "rgba(9, 24, 28, 0.82)";
      ctx.fillRect(action.x - promptWidth / 2, promptY - 13, promptWidth, 26);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(prompt, action.x, promptY, promptWidth - 12);
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ACTION", action.x, action.y);
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    keys.add(key);
    if (key === " " || key === "enter" || key === "e") actionQueued = true;
  });
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));

  return {
    pointerDown,
    pointerMove,
    pointerUp,
    getMovement,
    consumeAction,
    draw,
  };
})();
