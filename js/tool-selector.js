import { toolSystem } from "./tool-system.js";

export const toolSelector = (() => {
  function getLayout() {
    const width = Math.min(132, Math.max(108, window.innerWidth * 0.34));
    const height = 42;
    return {
      x: (window.innerWidth - width) / 2,
      y: window.innerHeight - 24 - height,
      width,
      height,
    };
  }

  function contains(layout, x, y) {
    return x >= layout.x && x <= layout.x + layout.width &&
      y >= layout.y && y <= layout.y + layout.height;
  }

  function handleTap(x, y) {
    if (!contains(getLayout(), x, y)) return false;
    return toolSystem.cycle(1);
  }

  function draw(ctx) {
    const layout = getLayout();
    const selected = toolSystem.getSelected();
    if (!selected) return;

    ctx.fillStyle = "rgba(9, 24, 28, 0.82)";
    ctx.fillRect(layout.x, layout.y, layout.width, layout.height);
    ctx.strokeStyle = "rgba(255,255,255,0.62)";
    ctx.lineWidth = 2;
    ctx.strokeRect(layout.x, layout.y, layout.width, layout.height);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `${selected.icon} ${selected.name}  ›`,
      layout.x + layout.width / 2,
      layout.y + layout.height / 2,
      layout.width - 12,
    );
  }

  return { getLayout, handleTap, draw };
})();
