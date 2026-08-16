const FLAG_KEY = "liora.perf";
const SAMPLE_SECONDS = 0.25;

/**
 * Reads the perf overlay flag from the URL, then remembers it.
 *
 * A phone has no console and no dev tools worth using, so the switch has to be
 * something you can type once: `?perf=1` turns it on and it stays on across
 * reloads, `?perf=0` turns it off again.
 */
export function isPerfHudEnabled(search = location.search) {
  const requested = new URLSearchParams(search).get("perf");
  try {
    if (requested === "1") localStorage.setItem(FLAG_KEY, "1");
    else if (requested === "0") localStorage.removeItem(FLAG_KEY);
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    // Private mode with storage denied — honour the URL for this session only.
    return requested === "1";
  }
}

/**
 * Frame cost readout: average FPS, the worst frame in the sample window, and
 * what the renderer actually did to produce it.
 *
 * Worst-frame is the number that matters on a phone. An average of 60 fps with
 * one 90 ms frame per second reads as a stutter, and an average alone hides it
 * completely — which is exactly the failure this is here to catch.
 *
 * Disabled it allocates nothing and `update()` is an empty call, so it is safe
 * to leave wired into the frame loop.
 */
export function createPerfHud({ renderer, enabled = false, getObjectCount = null } = {}) {
  if (!enabled || !renderer) return { update() {}, dispose() {}, enabled: false };

  const element = document.createElement("div");
  element.id = "perf-hud";
  document.body.append(element);

  let elapsed = 0;
  let frames = 0;
  let worstDelta = 0;

  return {
    enabled: true,
    /** Call after renderer.render() — Three.js resets its counters each frame. */
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
      ]
        .filter(Boolean)
        .join("\n");

      elapsed = 0;
      frames = 0;
      worstDelta = 0;
    },
    dispose() {
      element.remove();
    },
  };
}
