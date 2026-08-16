const FLAG_KEY = "liora.perf";
const SAMPLE_SECONDS = 0.25;

export function isPerfHudEnabled(search = location.search) {
  const requested = new URLSearchParams(search).get("perf");
  try {
    if (requested === "1") localStorage.setItem(FLAG_KEY, "1");
    else if (requested === "0") localStorage.removeItem(FLAG_KEY);
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return requested === "1";
  }
}

export function createPerfHud({ renderer, enabled = false, getObjectCount = null, build = "" } = {}) {
  if (!enabled || !renderer) return { update() {}, dispose() {}, enabled: false };

  const element = document.createElement("div");
  element.id = "perf-hud";
  document.body.append(element);

  let elapsed = 0;
  let frames = 0;
  let worstDelta = 0;

  return {
    enabled: true,
    update(delta) {
      const step = Number.isFinite(delta) ? Math.max(0, delta) : 0;
      frames += 1;
      elapsed += step;
      if (step > worstDelta) worstDelta = step;
      if (elapsed < SAMPLE_SECONDS || frames === 0) return;

      const { render, memory, programs } = renderer.info;
      const fps = Math.round(frames / elapsed);
      const worstMs = Math.round(worstDelta * 1000);
      const objects = getObjectCount?.();

      element.textContent = [
        `${fps} fps  worst ${worstMs}ms`,
        `${render.calls} calls  ${Math.round(render.triangles / 1000)}k tris`,
        `${programs?.length ?? 0} programs  ${memory.geometries} geo  ${memory.textures} tex`,
        objects === undefined || objects === null ? null : `${objects} objects`,
        build ? `build ${build}` : null,
      ].filter(Boolean).join("\n");

      elapsed = 0;
      frames = 0;
      worstDelta = 0;
    },
    dispose() { element.remove(); },
  };
}
