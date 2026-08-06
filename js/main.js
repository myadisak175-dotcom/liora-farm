const TITLE_COLOR = "#ffffff";

time.setState(save.load());

function update(deltaTime) {
  if (time.update(deltaTime)) save.save(time.getState());
}

function draw() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  ctx.clearRect(0, 0, width, height);
  time.drawBackground(ctx, width, height);

  ctx.fillStyle = TITLE_COLOR;
  ctx.font = "600 32px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Liora's Farm", width / 2, height / 2);
  time.draw(ctx);
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

// Save regularly so refreshing resumes near the last visible time.
window.setInterval(() => save.save(time.getState()), 5000);
window.addEventListener("pagehide", () => save.save(time.getState()));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) save.save(time.getState());
  // Do not count time spent in a background tab as play time.
  previousTime = performance.now();
});
