import { collision } from "./collision.js";
import { input } from "./input.js";

export const player = (() => {
  const SPEED = 190;
  const RADIUS = 18;

  let environment = {
    space: "unconfigured",
    acceptedSpaces: new Set(["unconfigured"]),
    width: 1,
    height: 1,
    defaultPosition: { x: RADIUS, y: RADIUS, facingX: 0, facingY: -1 },
    getColliders: () => [],
  };

  let x = RADIUS;
  let y = RADIUS;
  let facingX = 0;
  let facingY = -1;

  function normalizePoint(value) {
    if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
    return {
      x: value.x,
      y: value.y,
      facingX: Number.isFinite(value.facingX) ? value.facingX : undefined,
      facingY: Number.isFinite(value.facingY) ? value.facingY : undefined,
    };
  }

  function configure({
    space,
    bounds,
    defaultPosition,
    getColliders = () => [],
    legacySpaces = [],
  }) {
    if (typeof space !== "string" || !space.trim()) {
      throw new TypeError("Player environment requires a non-empty space id.");
    }
    if (
      !bounds || !Number.isFinite(bounds.width) || bounds.width <= RADIUS * 2 ||
      !Number.isFinite(bounds.height) || bounds.height <= RADIUS * 2
    ) {
      throw new TypeError("Player environment requires positive finite bounds.");
    }
    const normalizedDefault = normalizePoint(defaultPosition);
    if (!normalizedDefault) {
      throw new TypeError("Player environment requires a valid default position.");
    }
    if (typeof getColliders !== "function") {
      throw new TypeError("Player environment getColliders must be a function.");
    }

    environment = {
      space: space.trim(),
      acceptedSpaces: new Set([
        space.trim(),
        ...legacySpaces
          .filter((value) => typeof value === "string" && value.trim())
          .map((value) => value.trim()),
      ]),
      width: bounds.width,
      height: bounds.height,
      defaultPosition: {
        ...normalizedDefault,
        facingX: normalizedDefault.facingX ?? 0,
        facingY: normalizedDefault.facingY ?? -1,
      },
      getColliders,
    };
  }

  function clampToBounds() {
    x = Math.min(environment.width - RADIUS, Math.max(RADIUS, x));
    y = Math.min(environment.height - RADIUS, Math.max(RADIUS, y));
  }

  function applyPosition(position) {
    x = position.x;
    y = position.y;
    if (Number.isFinite(position.facingX) && Number.isFinite(position.facingY)) {
      facingX = position.facingX;
      facingY = position.facingY;
    }
    clampToBounds();
  }

  function setState(state, spawnOverride = null) {
    const spawn = normalizePoint(spawnOverride);
    const savedPosition = environment.acceptedSpaces.has(state?.space)
      ? normalizePoint(state)
      : null;

    const position = spawn ?? savedPosition ?? environment.defaultPosition;
    applyPosition({
      ...position,
      facingX: position.facingX ?? state?.facingX ?? environment.defaultPosition.facingX,
      facingY: position.facingY ?? state?.facingY ?? environment.defaultPosition.facingY,
    });
  }

  function teleport(position) {
    const normalized = normalizePoint(position);
    if (!normalized) return false;
    applyPosition(normalized);
    return true;
  }

  function getState() {
    return {
      space: environment.space,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      facingX: Math.round(facingX * 1000) / 1000,
      facingY: Math.round(facingY * 1000) / 1000,
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
    const colliders = environment.getColliders();
    const nextPosition = collision.moveCircle(
      x,
      y,
      deltaX,
      deltaY,
      RADIUS,
      Array.isArray(colliders) ? colliders : [],
    );

    x = nextPosition.x;
    y = nextPosition.y;
    facingX = movement.x;
    facingY = movement.y;
    clampToBounds();
    return true;
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

  return {
    configure,
    setState,
    teleport,
    getState,
    getPosition,
    update,
    draw,
  };
})();
