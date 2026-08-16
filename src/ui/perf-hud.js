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

export function createPerfHud({
  renderer,
  enabled = false,
  getObjectCount = null,
  quality = null,
  build = "",
} = {}) {
  if (!enabled || !renderer) return { update() {}, dispose() {}, enabled: false };

  const element = document.createElement("div");
  element.id = "perf-hud";
  document.body.append(element);

  // Tapping the HUD cycles the quality tier. A number you cannot change while
  // watching it is not a profiling tool — being able to drop a tier and see
  // the frame time move in the same second is the whole point.
  if (quality) {
    element.style.cursor = "pointer";
    element.title = "แตะเพื่อสลับระดับคุณภาพ";
    element.addEventListener("click", () => {
      const ids = quality.presets.map((preset) => preset.id);
      const next = ids[(ids.indexOf(quality.id) + 1) % ids.length];
      quality.set(next);
    });
  }

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

      const preset = quality?.preset;

      element.textContent = [
        `${fps} fps  worst ${worstMs}ms`,
        `${render.calls} calls  ${Math.round(render.triangles / 1000)}k tris`,
        `${programs?.length ?? 0} programs  ${memory.geometries} geo  ${memory.textures} tex`,
        objects === undefined || objects === null ? null : `${objects} objects`,
        // What the tier actually did, not just its name — "medium" means
        // nothing while chasing a frame budget, "1.5x px  1024 shadow" does.
        preset
          ? `q:${preset.id}${quality.isAuto ? "*" : ""}  ${renderer.getPixelRatio()}x px  ${preset.shadowMapSize} shadow`
          : null,
        preset
          ? `clouds ${preset.cloudShadows ? "on" : "off"}  detail ${preset.detailNormals ? "on" : "off"}  blobs ${preset.blobShadows ? "on" : "off"}`
          : null,
        build ? `build ${build}` : null,
      ].filter(Boolean).join("\n");

      elapsed = 0;
      frames = 0;
      worstDelta = 0;
    },
    dispose() { element.remove(); },
  };
}
