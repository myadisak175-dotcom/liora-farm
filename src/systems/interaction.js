import * as THREE from "three";
import { getInteractionDefinition } from "../data/interactions.js";

const actorPosition = new THREE.Vector3();
const targetPosition = new THREE.Vector3();

function getWorldPosition(object, out) {
  if (!object?.getWorldPosition) return null;
  object.getWorldPosition(out);
  return out;
}

function horizontalDistanceSq(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/**
 * Collects Builder-placed runtime roots without depending on Editor internals.
 * Preview/ghost objects are excluded automatically.
 */
export function getSceneInteractableRoots(scene) {
  if (!scene?.children) return [];
  return scene.children.filter((object) =>
    object?.visible !== false &&
    object?.userData?.builderAssetId &&
    !object?.userData?.builderPreview
  );
}

/**
 * Generic proximity interaction system.
 *
 * The system knows nothing about Tree, Door, NPC or Inventory behavior.
 * It only chooses the best nearby target and dispatches a semantic action to
 * a registered handler.
 */
export function createInteractionSystem({
  actor,
  getTargets = () => [],
  resolve = (target) => getInteractionDefinition(target?.userData?.builderAssetId),
  canInteract = () => true,
  onFocusChanged = null,
} = {}) {
  if (!actor) throw new Error("createInteractionSystem requires an actor");

  const handlers = new Map();
  let current = null;

  function actorRoot() {
    return typeof actor === "function" ? actor() : actor;
  }

  function makeCandidate(target, definition, distanceSq) {
    return {
      target,
      definition,
      distance: Math.sqrt(distanceSq),
      assetId: target?.userData?.builderAssetId ?? definition?.assetId ?? null,
      itemId: target?.userData?.builderItemId ?? null,
    };
  }

  function chooseBest() {
    const root = actorRoot();
    if (!root || !canInteract()) return null;
    if (!getWorldPosition(root, actorPosition)) return null;

    let best = null;
    let bestScore = Infinity;

    for (const target of getTargets() ?? []) {
      if (!target || target === root || target.visible === false) continue;
      const definition = resolve(target);
      if (!definition) continue;
      if (!getWorldPosition(target, targetPosition)) continue;

      const distanceSq = horizontalDistanceSq(actorPosition, targetPosition);
      const range = Math.max(0, Number(definition.range ?? 2));
      if (distanceSq > range * range) continue;

      // Distance is the dominant factor. Priority breaks close ties without
      // letting a far high-priority object steal focus from a nearby object.
      const priority = Number(definition.priority ?? 0);
      const score = distanceSq - priority * 0.0025;
      if (score >= bestScore) continue;

      bestScore = score;
      best = makeCandidate(target, definition, distanceSq);
    }

    return best;
  }

  function sameFocus(a, b) {
    return a?.target === b?.target && a?.definition?.type === b?.definition?.type;
  }

  function update() {
    const next = chooseBest();
    if (!sameFocus(current, next)) {
      const previous = current;
      current = next;
      onFocusChanged?.(current, previous);
    } else {
      current = next;
    }
    return current;
  }

  function register(type, handler) {
    if (!type || typeof handler !== "function") {
      throw new Error("interaction.register requires type and handler");
    }
    handlers.set(type, handler);
    return () => handlers.delete(type);
  }

  async function perform(context = {}) {
    const focus = update();
    if (!focus) return { ok: false, reason: "no-target" };

    const handler = handlers.get(focus.definition.type);
    if (!handler) {
      return {
        ok: false,
        reason: "no-handler",
        interaction: focus,
      };
    }

    const result = await handler({
      ...context,
      interaction: focus,
      target: focus.target,
      definition: focus.definition,
      assetId: focus.assetId,
      itemId: focus.itemId,
    });

    return {
      ok: result !== false,
      interaction: focus,
      result,
    };
  }

  function clear() {
    if (!current) return;
    const previous = current;
    current = null;
    onFocusChanged?.(null, previous);
  }

  return {
    update,
    perform,
    register,
    clear,
    getCurrent: () => current,
    hasTarget: () => Boolean(current),
  };
}
