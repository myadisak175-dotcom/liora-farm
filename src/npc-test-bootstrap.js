import { ANIMATIONS } from "./config.js";
import { createNpcLifeSystem } from "./systems/npc-life.js";

const params = new URLSearchParams(location.search);
if (params.get("npc") === "1") {
  const waitForGame = async () => {
    const started = performance.now();
    while (performance.now() - started < 15000) {
      const source = window.__lioraNpcSource;
      const height = window.__liora?.height;
      if (source?.root?.parent && height?.sample && window.__lioraBooted) {
        return { source, height, scene: source.root.parent };
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    throw new Error("NPC test timed out waiting for the game scene");
  };

  try {
    const { source, height, scene } = await waitForGame();
    const life = createNpcLifeSystem({
      scene,
      sourceModel: source.model,
      clips: source.clips,
      animations: ANIMATIONS,
      getGroundHeight: (x, z) => height.sample(x, z),
    });

    if (!life) throw new Error("NPC life system could not be created");
    window.__lioraNpcLife = life;

    const badge = document.createElement("div");
    badge.textContent = "NPC LIFE TEST ×2";
    Object.assign(badge.style, {
      position: "fixed",
      left: "12px",
      top: "54px",
      zIndex: "30",
      padding: "6px 9px",
      borderRadius: "999px",
      background: "rgba(20,34,38,.78)",
      color: "white",
      font: "700 11px system-ui,sans-serif",
      pointerEvents: "none",
      letterSpacing: ".03em",
    });
    document.body.append(badge);

    let previous = performance.now();
    let frame = 0;
    const tick = (now) => {
      const delta = Math.min((now - previous) / 1000, 0.04);
      previous = now;
      life.update(delta);
      if ((frame++ & 31) === 0) {
        const states = life.stats.states.join(" / ");
        badge.textContent = `NPC ×2 • ${states}`;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (error) {
    console.error("NPC life test failed", error);
    const toast = document.querySelector("#toast");
    if (toast) {
      toast.textContent = "NPC test โหลดไม่สำเร็จ";
      toast.classList.add("show");
    }
  }
}
