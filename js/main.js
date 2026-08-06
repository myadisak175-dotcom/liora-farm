const TITLE_COLOR = "#ffffff";
const loadedSave = save.load();
time.setState(loadedSave.time);
economy.setState(loadedSave.economy);
farm.setState(loadedSave.farm);
player.setState(loadedSave.player);

const startingPosition = player.getPosition();
camera.snapTo(startingPosition.x, startingPosition.y);

function saveGame() {
  save.save(time.getState(), farm.getState(), economy.getState(), player.getState());
}

function update(deltaTime) {
  const dayChanged = time.update(deltaTime);
  farm.update();
  player.update(deltaTime, !economy.isShopOpen());

  if (input.consumeAction() && !economy.isShopOpen()) {
    if (player.interact()) saveGame();
  }

  const position = player.getPosition();
  camera.update(position.x, position.y, deltaTime);

  if (dayChanged) saveGame();
}

function draw() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  ctx.clearRect(0, 0, width, height);

  time.drawBackground(ctx, width, height);

  ctx.save();
  camera.apply(ctx);
  world.draw(ctx);
  gameMap.drawGround(ctx);
  farm.draw(ctx);

  const position = player.getPosition();
  gameMap.drawBefore(ctx, position.y);
  player.draw(ctx);
  gameMap.drawAfter(ctx, position.y);
  ctx.restore();

  ctx.fillStyle = TITLE_COLOR;
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Liora's Farm", width / 2, 10);

  time.draw(ctx);
  economy.drawHUD(ctx);
  farm.drawMessage(ctx);
  if (!economy.isShopOpen()) input.draw(ctx);
  economy.drawShop(ctx);
}

let previousTime = performance.now();
function gameLoop(currentTime) {
  const deltaTime = Math.min(0.05, (currentTime - previousTime) / 1000);
  previousTime = currentTime;
  update(deltaTime);
  draw();
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

function pointerPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (window.innerWidth / bounds.width),
    y: (event.clientY - bounds.top) * (window.innerHeight / bounds.height),
  };
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  const point = pointerPosition(event);

  if (economy.isShopOpen()) {
    if (economy.handleTap(point.x, point.y)) saveGame();
    return;
  }

  if (economy.handleTap(point.x, point.y)) saveGame();
  if (!economy.isShopOpen() && input.pointerDown(event.pointerId, point.x, point.y)) {
    canvas.setPointerCapture(event.pointerId);
  }
});

canvas.addEventListener("pointermove", (event) => {
  const point = pointerPosition(event);
  input.pointerMove(event.pointerId, point.x, point.y);
});
canvas.addEventListener("pointerup", (event) => input.pointerUp(event.pointerId));
canvas.addEventListener("pointercancel", (event) => input.pointerUp(event.pointerId));

window.setInterval(saveGame, 3000);
window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveGame();
  previousTime = performance.now();
});
