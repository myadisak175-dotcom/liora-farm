/**
 * Splat painter — spec docs/GROUND_SYSTEM.md section 2.
 *
 * Owns the stroke list and knows how to draw a stroke into a 2D canvas.
 * It is deliberately ignorant of Three.js: it receives a canvas, a context and
 * a commit callback from ground-material.js. That keeps it testable and lets
 * the material stay the only file touching GPU state.
 *
 * Channel layout matches the shader: R = dirt, G = sand, B = rock.
 * Grass is not a channel — it is what shows when the other three are low.
 */

export const SPLAT_LAYERS = Object.freeze({
  DIRT: 0,
  SAND: 1,
  ROCK: 2,
  ERASE: 3,
  GRASS: 4,
});

const LAYER_INK = Object.freeze({
  [SPLAT_LAYERS.DIRT]: "255,0,0",
  [SPLAT_LAYERS.SAND]: "0,255,0",
  [SPLAT_LAYERS.ROCK]: "0,0,255",
});

export function createSplatPainter({
  canvas,
  context,
  commit,
  worldSize = 42,
  resolution = canvas.width,
}) {
  const strokes = [];
  const half = worldSize / 2;
  const pixelsPerUnit = resolution / worldSize;

  function toCanvasX(x) {
    return (x + half) * pixelsPerUnit;
  }

  function toCanvasY(z) {
    return (z + half) * pixelsPerUnit;
  }

  // Softer falloff: solid center, long feathered transition, gentle outer edge.
  // This keeps painted terrain from looking like circular stickers on mobile.
  function radialGradient(cx, cy, r, innerRgb, outerRgb) {
    const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, `rgb(${innerRgb})`);
    gradient.addColorStop(0.38, `rgb(${innerRgb})`);
    gradient.addColorStop(0.68, `color-mix(in srgb, rgb(${innerRgb}) 68%, rgb(${outerRgb}))`);
    gradient.addColorStop(0.86, `color-mix(in srgb, rgb(${innerRgb}) 28%, rgb(${outerRgb}))`);
    gradient.addColorStop(1, `rgb(${outerRgb})`);
    return gradient;
  }

  function stamp(cx, cy, r, gradient, mode, alpha) {
    context.save();
    context.globalCompositeOperation = mode;
    context.globalAlpha = alpha;
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function draw(x, z, radius, layer, strength) {
    const cx = toCanvasX(x);
    const cy = toCanvasY(z);
    const r = Math.max(1, radius * pixelsPerUnit);
    const alpha = Math.min(1, Math.max(0, strength));

    if (layer === SPLAT_LAYERS.ERASE || layer === SPLAT_LAYERS.GRASS) {
      stamp(cx, cy, r, radialGradient(cx, cy, r, "0,0,0", "255,255,255"), "multiply", alpha);
      return;
    }

    const ink = LAYER_INK[layer];
    if (!ink) return;

    stamp(cx, cy, r, radialGradient(cx, cy, r, ink, "255,255,255"), "multiply", alpha);
    stamp(cx, cy, r, radialGradient(cx, cy, r, ink, "0,0,0"), "lighter", alpha);
  }

  function clear() {
    context.save();
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }

  function replay(list = strokes) {
    clear();
    for (const [x, z, radius, layer, strength] of list) {
      draw(x, z, radius, layer, strength);
    }
    commit();
  }

  return {
    strokes,
    paint(x, z, radius, layer, strength = 1) {
      strokes.push([
        Number(x.toFixed(2)),
        Number(z.toFixed(2)),
        Number(radius.toFixed(2)),
        layer,
        Number(strength.toFixed(2)),
      ]);
      draw(x, z, radius, layer, strength);
      commit();
    },
    undo(count = 1) {
      if (!strokes.length) return false;
      strokes.splice(-count, count);
      replay();
      return true;
    },
    load(list) {
      strokes.length = 0;
      for (const stroke of list) strokes.push(stroke);
      replay();
    },
    reset() {
      strokes.length = 0;
      clear();
      commit();
    },
    replay,
    count: () => strokes.length,
  };
}
