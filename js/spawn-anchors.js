function normalizeAnchor(anchor, id) {
  if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
    throw new TypeError(`Spawn anchor ${id} must contain finite x and y values.`);
  }

  return Object.freeze({
    x: anchor.x,
    y: anchor.y,
    facingX: Number.isFinite(anchor.facingX) ? anchor.facingX : 0,
    facingY: Number.isFinite(anchor.facingY) ? anchor.facingY : -1,
  });
}

export function createSpawnAnchors(definitions, defaultId = "default") {
  if (!definitions || typeof definitions !== "object" || Array.isArray(definitions)) {
    throw new TypeError("Spawn anchors must be defined as an object.");
  }

  const anchors = new Map(
    Object.entries(definitions).map(([id, anchor]) => [id, normalizeAnchor(anchor, id)]),
  );

  if (!anchors.has(defaultId)) {
    throw new Error(`Missing default spawn anchor: ${defaultId}`);
  }

  function has(anchorId) {
    return typeof anchorId === "string" && anchors.has(anchorId);
  }

  function resolve(anchorId = defaultId) {
    const selectedId = has(anchorId) ? anchorId : defaultId;
    return { ...anchors.get(selectedId), id: selectedId };
  }

  return {
    has,
    resolve,
    getDefaultId: () => defaultId,
  };
}
