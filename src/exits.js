import { TILE_W, TILE_H } from "./config.js";
import { tileToWorld } from "./iso.js";
import { currentZone } from "./world.js";

export function drawExits(ctx) {
  ctx.save();
  for (const exit of currentZone().exits) {
    const [i0, j0, i1, j1] = exit.rect;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const { x, y } = tileToWorld(i, j);
        ctx.beginPath();
        ctx.moveTo(x + TILE_W / 2, y);
        ctx.lineTo(x + TILE_W, y + TILE_H / 2);
        ctx.lineTo(x + TILE_W / 2, y + TILE_H);
        ctx.lineTo(x, y + TILE_H / 2);
        ctx.closePath();
        ctx.fillStyle = "rgba(255, 236, 150, 0.30)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 236, 150, 0.65)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
