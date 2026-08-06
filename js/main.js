const BACKGROUND_COLOR = "#5f9f55";
const TITLE_COLOR = "#ffffff";

function update(_deltaTime) {
  // ระบบเกมในเฟสถัดไปจะอัปเดตสถานะจากจุดนี้
}

function draw() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = TITLE_COLOR;
  ctx.font = "600 32px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Liora's Farm", width / 2, height / 2);
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
