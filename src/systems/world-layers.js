/**
 * The world as one ordered stack of distances.
 *
 * Seven things stand between Liora and the sky, and until this file they were
 * declared in six places: the farm in `terrain`, the scattered trees in
 * `treeLine`, the visual land in `outerWorld`, two paintings in
 * `paintedBackdrop.bands`, the drifting islands in `floatingIslands`, and the
 * dome in `sky`. Each knew its own radius. None knew it was in a stack.
 *
 * The constraints between them were therefore discovered one crash at a time,
 * and each arrived as its own hand-written rule:
 *
 *   - a band authored past the camera's far plane renders nothing at all, with
 *     no error — that was 800 m, found by rendering;
 *   - opaque ground authored past a band is drawn over it, because backdrops
 *     deliberately do not write depth — that was the fog bar across the
 *     treeline, found on a phone;
 *   - and the sky dome sat at 700 m with a painted band at 720 m *outside* it.
 *     That one has never been visible, because the dome opts out of depth
 *     entirely — both test and write are off, and GL does not update the depth
 *     buffer while the test is disabled, so neither flag alone changes
 *     anything. Turn both on and the mountains vanish: verified by rendering
 *     it, at 700 m the peaks band is erased and only the forest survives; at
 *     820 m both stand. So the stack's correctness rested on the dome
 *     declining to participate in depth, which nothing recorded and no test
 *     could have found, because nothing knew the two numbers were related.
 *
 * So the stack is stated once, here, and checked as a stack. A new layer
 * inherits every constraint by appearing in the list.
 *
 * Nothing here imports THREE or reads the DOM: it is config in, findings out.
 */

/**
 * What a layer is made of, which decides what may pass through it.
 *
 *   ground    opaque, writes depth — must never extend past a backdrop
 *   scenery   opaque objects standing on the ground, free to overlap it
 *   backdrop  painted, does not write depth — must stay inside the sky
 *   sky       the dome, and by definition the outermost thing there is
 */
export const LAYER_KINDS = Object.freeze(["ground", "scenery", "backdrop", "sky"]);

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/**
 * Every layer of the world, ordered outward.
 *
 * `near`/`far` are world radii. `farthest` is what the camera can actually be
 * looking across, which for anything centred on the world means adding the
 * distance the player can walk away from it — the mistake that hid the first
 * painted band was measuring from the centre while standing at the edge.
 */
export function worldLayers(config = {}) {
  const reach = num(config.worldLimit, 0);
  const terrainHalf = num(config.terrain?.size, 0) / 2;
  const ground = config.outerWorld ?? {};
  const trees = config.treeLine ?? {};
  const bands = Array.isArray(config.paintedBackdrop?.bands) ? config.paintedBackdrop.bands : [];
  const islands = config.floatingIslands ?? {};

  const layers = [];

  layers.push({
    id: "terrain", label: "ไร่", kind: "ground",
    near: 0, far: terrainHalf * Math.SQRT2,
    bottom: num(config.sculpt?.minHeight, 0), top: num(config.sculpt?.maxHeight, 0),
  });

  if (trees.enabled !== false && num(trees.count) > 0) {
    layers.push({
      id: "treeLine", label: "ต้นไม้กลางทุ่ง", kind: "scenery",
      near: num(trees.innerRadius), far: num(trees.outerRadius),
      bottom: 0, top: num(trees.minHeight, 0) * 4,
    });
  }

  if (ground.enabled !== false) {
    const swing = num(ground.heightVariation);
    layers.push({
      id: "ground", label: "พื้นไกล", kind: "ground",
      near: num(ground.innerRadius), far: num(ground.outerRadius),
      bottom: Math.min(num(ground.innerYOffset), num(ground.outerY)) - swing,
      top: Math.max(num(ground.innerYOffset), num(ground.outerY)) + swing,
    });
  }

  for (const band of bands) {
    const height = num(band.height);
    layers.push({
      id: band.name ?? "band", label: band.name ?? "แถบภาพ", kind: "backdrop",
      near: num(band.radius), far: num(band.radius),
      bottom: num(band.y) - height / 2, top: num(band.y) + height / 2,
    });
  }

  if (islands.enabled !== false) {
    const items = Array.isArray(islands.items) ? islands.items : [];
    if (items.length > 0) {
      layers.push({
        id: "floatingIslands", label: "เกาะลอยฟ้า", kind: "scenery",
        near: Math.min(...items.map((item) => num(item.radius))),
        far: Math.max(...items.map((item) => num(item.radius))),
        bottom: Math.min(...items.map((item) => num(item.y))),
        top: Math.max(...items.map((item) => num(item.y))),
      });
    }
  }

  // The dome rides with the camera, so its distance never changes — no reach
  // is added below, and that is the whole reason it can sit closer to the far
  // plane than anything centred on the world.
  layers.push({
    id: "sky", label: "โดมฟ้า", kind: "sky",
    near: num(config.sky?.radius), far: num(config.sky?.radius),
    bottom: -num(config.sky?.radius), top: num(config.sky?.radius),
    cameraCentred: true,
  });

  return layers
    .map((layer) => ({
      ...layer,
      farthest: layer.cameraCentred ? layer.far : layer.far + reach,
      nearest: layer.cameraCentred ? layer.near : Math.max(0, layer.near - reach),
    }))
    .sort((a, b) => a.farthest - b.farthest);
}

/**
 * The three things that are true of any stack that renders.
 *
 * Each returns the layers that break it, named, so a failure reads as "the
 * ground reaches 456 m and PaintedForest is at 430 m" rather than as a
 * boolean. Empty arrays mean the stack is sound.
 */
export function checkLayerStack(config = {}) {
  const layers = worldLayers(config);
  const cameraFar = num(config.camera?.far, Infinity);

  // 1. Anything past the far plane renders nothing, silently.
  const clipped = layers.filter((layer) => layer.farthest >= cameraFar);

  // 2. The sky is the outermost thing there is. A backdrop outside the dome
  //    survives only as long as nothing in the chain writes depth.
  const sky = layers.find((layer) => layer.kind === "sky") ?? null;
  const outsideSky = sky
    ? layers.filter((layer) => layer.kind === "backdrop" && layer.farthest >= sky.farthest)
    : [];

  // 3. Opaque ground behind a backdrop is either invisible or drawn over it,
  //    because backdrops do not write depth. Either way it is ground nobody
  //    asked for, and the part that shows is a bar across the horizon.
  const nearestBackdrop = layers
    .filter((layer) => layer.kind === "backdrop")
    .reduce((lowest, layer) => (lowest === null || layer.near < lowest.near ? layer : lowest), null);
  const overrunning = nearestBackdrop
    ? layers.filter((layer) => layer.kind === "ground" && layer.far > nearestBackdrop.near)
    : [];

  return { layers, sky, nearestBackdrop, clipped, outsideSky, overrunning, cameraFar };
}

/** One line per layer, for the horizon panel and for failure messages. */
export function describeLayerStack(layers) {
  return layers
    .map((layer) => `${layer.label} ${Math.round(layer.nearest)}–${Math.round(layer.farthest)} ม.`)
    .join(" · ");
}
