export const camera = (() => {
  const FOLLOW_SPEED = 8;

  let x = 0;
  let y = 0;
  let initialized = false;
  let boundsWidth = 0;
  let boundsHeight = 0;

  function setBounds(width, height) {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new TypeError("Camera bounds must be positive finite numbers.");
    }
    boundsWidth = width;
    boundsHeight = height;
    initialized = false;
    clamp();
  }

  function getVerticalAnchor() {
    return window.innerWidth > window.innerHeight ? 0.78 : 0.68;
  }

  function getTarget(playerX, playerY) {
    return {
      x: playerX - window.innerWidth / 2,
      y: playerY - window.innerHeight * getVerticalAnchor(),
    };
  }

  function clamp() {
    const maxX = Math.max(0, boundsWidth - window.innerWidth);
    const maxY = Math.max(0, boundsHeight - window.innerHeight);
    x = Math.min(maxX, Math.max(0, x));
    y = Math.min(maxY, Math.max(0, y));
  }

  function snapTo(playerX, playerY) {
    const target = getTarget(playerX, playerY);
    x = target.x;
    y = target.y;
    initialized = true;
    clamp();
  }

  function update(playerX, playerY, deltaTime) {
    if (!initialized) {
      snapTo(playerX, playerY);
      return;
    }

    const target = getTarget(playerX, playerY);
    const blend = 1 - Math.exp(-FOLLOW_SPEED * Math.max(0, deltaTime));
    x += (target.x - x) * blend;
    y += (target.y - y) * blend;
    clamp();
  }

  function apply(ctx) {
    ctx.translate(-Math.round(x), -Math.round(y));
  }

  function worldToScreen(worldX, worldY) {
    return { x: worldX - x, y: worldY - y };
  }

  function getState() {
    return { x, y, boundsWidth, boundsHeight };
  }

  return { setBounds, snapTo, update, apply, worldToScreen, getState };
})();
