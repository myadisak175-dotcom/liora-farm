export function createPerfHud(renderer, element) {
  let frames = 0;
  let elapsed = 0;
  let worst = 0;

  return {
    update(delta) {
      frames += 1;
      elapsed += delta;
      worst = Math.max(worst, delta);
      if (elapsed < 0.5) return;

      const fps = Math.round(frames / elapsed);
      const ms = Math.round(worst * 1000);
      const calls = renderer.info.render.calls;
      const tris = renderer.info.render.triangles;
      element.textContent = `${fps} fps · ${ms}ms · ${calls} calls · ${Math.round(tris / 1000)}k tris`;

      frames = 0;
      elapsed = 0;
      worst = 0;
    },
  };
}
