const player = (() => {
  const SPEED = 190;
  const RADIUS = 18;
  const INTERACTION_DISTANCE = 76;
  const DEFAULT_POSITION = Object.freeze({ x: world.WIDTH / 2, y: 735 });

  let x = DEFAULT_POSITION.x;
  let y = DEFAULT_POSITION.y;
  let facingX = 0;
  let facingY = -1;

  function clampToWorld() {
    x = world.clampX(x, RADIUS);
    y = world.clampY(y, RADIUS);
  }

  function setState(state) {
    if (state?.space === "world" && Number.isFinite(state.x) && Number.isFinite(state.y)) {
      x = state.x;
      y = state.y;
    } else {
      x = DEFAULT_POSITION.x;
      y = DEFAULT_POSITION.y;
    }
    clampToWorld();
  }

  function getState() {
    return {
      space: "world",
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
    };
  }

  function getPosition() {
    return { x, y };
  }

  function update(deltaTime, movementEnabled = true) {
    if (!movementEnabled) return false;
    const movement = input.getMovement();
    if (movement.x === 0 && movement.y === 0) return false;

    const deltaX = movement.x * SPEED * deltaTime;
    const deltaY = movement.y * SPEED * deltaTime;
    const nextPosition = collision.moveCircle(
      x,
      y,
      deltaX,
      deltaY,
      RADIUS,
      gameMap.getColliders(),
    );

    x = nextPosition.x;
    y = nextPosition.y;
    facingX = movement.x;
    facingY = movement.y;
    clampToWorld();
    return true;
  }

  function interact() {
    return farm.interactNear(x, y, INTERACTION_DISTANCE);
  }

  function draw(ctx) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(13, 30, 25, 0.25)";
    ctx.beginPath();
    ctx.ellipse(0, RADIUS + 7, RADIUS * 0.95, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f5d7b5";
    ctx.beginPath();
    ctx.arc(0, -10, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f7f2e7";
    ctx.beginPath();
    ctx.roundRect(-15, 1, 30, 31, 10);
    ctx.fill();

    ctx.fillStyle = "#735443";
    ctx.beginPath();
    ctx.arc(0, -13, 13, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#6f4525";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(facingX * 11, 10 + facingY * 11);
    ctx.stroke();
    ctx.restore();
  }

  return { setState, getState, getPosition, update, interact, draw };
})();
