import { TILE_W, TILES_ACROSS } from "./config.js";
export class Camera {
  constructor() { this.x = 0; this.y = 0; this.scale = 1; this.viewW = 0; this.viewH = 0; }
  resize(pixelW, pixelH) { this.scale = pixelW / (TILES_ACROSS * TILE_W); this.viewW = pixelW / this.scale; this.viewH = pixelH / this.scale; }
  get view() { return { x: this.x - this.viewW / 2, y: this.y - this.viewH / 2, w: this.viewW, h: this.viewH }; }
  apply(ctx) { const v = this.view; ctx.setTransform(this.scale, 0, 0, this.scale, -v.x * this.scale, -v.y * this.scale); }
  panByPixels(dx, dy) { this.x -= dx / this.scale; this.y -= dy / this.scale; }
}
