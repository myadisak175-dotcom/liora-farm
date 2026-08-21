import { WORLD_LOGIC } from "./world-logic.js";
import { WORLD_EVENTS } from "./world-events.js";

/**
 * Minimal gameplay runtime for authored logic nodes.
 *
 * It knows only geometry and lifecycle: a node with x/z/radius can be entered
 * and exited. What "enter" means belongs to subscribers on WORLD_EVENTS.
 * This keeps the primitive reusable for farms, doors, quests, NPC work areas,
 * ambience volumes, checkpoints and anything else that needs proximity.
 */
export function createWorldLogicRuntime({
  logic = WORLD_LOGIC,
  onEvent = (event) => WORLD_EVENTS.emit(event),
} = {}) {
  let nodes = logic.listNodes();
  let inside = new Set();

  const unsubscribe = logic.subscribe((snapshot) => {
    nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
    const live = new Set(nodes.map((node) => node.id));
    inside = new Set([...inside].filter((id) => live.has(id)));
  });

  function emit(type, node, position) {
    try {
      onEvent({
        type,
        node: { ...node, data: { ...(node.data ?? {}) } },
        position: { x: Number(position.x) || 0, z: Number(position.z) || 0 },
      });
    } catch (error) {
      console.error("World logic event handler failed", error);
    }
  }

  function update(position) {
    const x = Number(position?.x);
    const z = Number(position?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;

    const nextInside = new Set();
    for (const node of nodes) {
      if (node?.enabled === false) continue;
      const radius = Math.max(0.25, Number(node?.radius) || 0);
      const dx = x - Number(node?.x || 0);
      const dz = z - Number(node?.z || 0);
      const hit = dx * dx + dz * dz <= radius * radius;
      if (!hit) continue;
      nextInside.add(node.id);
      if (!inside.has(node.id)) emit("enter", node, { x, z });
    }

    for (const id of inside) {
      if (nextInside.has(id)) continue;
      const node = nodes.find((entry) => entry.id === id);
      if (node) emit("exit", node, { x, z });
    }
    inside = nextInside;
  }

  function isInside(id) {
    return inside.has(id);
  }

  function dispose() {
    unsubscribe();
    inside.clear();
    nodes = [];
  }

  return {
    update,
    isInside,
    dispose,
    get activeNodeIds() { return [...inside]; },
  };
}
