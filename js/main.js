const TITLE_COLOR = "#ffffff";

const loadedSave = save.load();
time.setState(loadedSave.time);
economy.setState(loadedSave.economy);
farm.setState(loadedSave.farm);

function saveGame() {
  save.save(time.getState(), farm.getState(), economy.getState());
}

function update(deltaTime) {
  const dayChanged = time.update(deltaTime);
  farm.update();
  if (dayChanged) saveGame();
}

function draw() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  ctx.clearRect(0, 0, width, height);
  time.drawBackground(ctx, width, height);
  farm.draw(ctx);

  ctx.fillStyle = TITLE_COLOR;
  ctx.font = "600 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Liora's Farm", width / 2, 78);
  time.draw(ctx);
  economy.drawHUD(ctx);
  economy.drawShop(ctx);
}

let previousTime = performance.now();

function gameLoop(currentTime) {
  const deltaTime = (currentTime - previousTime) / 1000;
  previousTime = currentTime;

  update(deltaTime);
  draw();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

let lastTouchTime = 0;

function handlePointer(clientX, clientY) {
  const bounds = canvas.getBoundingClientRect();
  const x = (clientX - bounds.left) * (window.innerWidth / bounds.width);
  const y = (clientY - bounds.top) * (window.innerHeight / bounds.height);
  if (economy.isShopOpen()) {
    if (economy.handleTap(x, y)) saveGame();
    return;
  }
  if (economy.handleTap(x, y)) saveGame();
  if (!economy.isShopOpen() && farm.handleTap(x, y)) saveGame();
}

canvas.addEventListener("touchstart", (event) => {
  event.preventDefault();
  lastTouchTime = performance.now();
  const touch = event.changedTouches[0];
  if (touch) handlePointer(touch.clientX, touch.clientY);
}, { passive: false });
canvas.addEventListener("click", (event) => {
  // Some mobile browsers synthesize a click after touchstart.
  if (performance.now() - lastTouchTime > 500) {
    handlePointer(event.clientX, event.clientY);
  }
});

// Save regularly so refreshing resumes near the last visible time.
window.setInterval(saveGame, 5000);
window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveGame();
  // Do not count time spent in a background tab as play time.
  previousTime = performance.now();
});
