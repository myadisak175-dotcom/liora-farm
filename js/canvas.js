// จัดเตรียม canvas และ context กลางสำหรับทุกระบบของเกม
export const canvas = document.getElementById("game");
export const ctx = canvas.getContext("2d");

function resizeCanvas() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;

  // ขนาด buffer ใช้พิกเซลจริง ส่วนการวาดยังใช้หน่วย CSS pixel
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);
