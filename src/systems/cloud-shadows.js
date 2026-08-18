import * as THREE from "three";

/**
 * Drifting cloud shadows across the ground.
 *
 * This is the cheapest dimension-per-millisecond trick available here. A big
 * open field lit by one sun is uniformly bright everywhere, so the eye gets no
 * cue about how large it is; break it into slow-moving light and dark patches
 * and the same geometry suddenly reads as landscape with air above it.
 *
 * Implementation notes that matter:
 *
 * - It is a baked texture, not procedural noise. Two-octave value noise in the
 *   fragment shader is roughly eight hash evaluations per pixel across most of
 *   the screen; two texture fetches of a pre-baked tile cost a fraction of it
 *   on a phone and give softer, more organic shapes.
 * - Two fetches at different scales and drift speeds, because a single scrolled
 *   tile announces its own repeat within seconds.
 * - The shadow multiplies `outgoingLight`, i.e. after lighting and before tone
 *   mapping. Multiplying albedo instead would darken the surface itself and
 *   read as a stain painted on the grass rather than as less light arriving.
 */

function bakeCloudTile(size, seed) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.createImageData(size, size);

  // Value noise built from a seeded lattice, summed over octaves and wrapped
  // so the tile is seamless in both axes.
  //
  // `salt` is not decoration. Every octave used to restart the generator from
  // the same state, so grid[i] held the identical number in all of them: the
  // coarse octave and the fine one put the same value on the same lattice
  // corner and reinforced each other there instead of cancelling. Combined
  // with cell counts that were powers of two — every coarse corner sitting
  // exactly on a fine one — the tile grew a hard axis-aligned grid, which at
  // a 190 m world scale is a 47 m checkerboard laid across the whole field.
  const lattice = (octaveSize, salt) => {
    const grid = new Float32Array(octaveSize * octaveSize);
    let state = (seed * 2654435761 + salt * 2246822519 + 374761393) >>> 0;
    for (let i = 0; i < grid.length; i += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      grid[i] = state / 4294967296;
    }
    return grid;
  };

  const smooth = (t) => t * t * (3 - 2 * t);
  // Coprime cell counts, so two octaves share a lattice corner only at the
  // tile's own origin rather than everywhere. A fourth octave costs nothing
  // here — this runs once, at load — and buys the shapes some edge detail.
  const octaves = [
    { cells: 3, weight: 0.5 },
    { cells: 7, weight: 0.27 },
    { cells: 13, weight: 0.15 },
    { cells: 23, weight: 0.08 },
  ].map((octave, index) => ({ ...octave, grid: lattice(octave.cells, index + 1) }));

  let min = Infinity;
  let max = -Infinity;
  const values = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let total = 0;
      for (const { cells, weight, grid } of octaves) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const x0 = Math.floor(fx) % cells;
        const y0 = Math.floor(fy) % cells;
        const x1 = (x0 + 1) % cells;
        const y1 = (y0 + 1) % cells;
        const tx = smooth(fx - Math.floor(fx));
        const ty = smooth(fy - Math.floor(fy));
        const top = grid[y0 * cells + x0] + (grid[y0 * cells + x1] - grid[y0 * cells + x0]) * tx;
        const bottom = grid[y1 * cells + x0] + (grid[y1 * cells + x1] - grid[y1 * cells + x0]) * tx;
        total += (top + (bottom - top) * ty) * weight;
      }
      values[y * size + x] = total;
      if (total < min) min = total;
      if (total > max) max = total;
    }
  }

  const span = Math.max(1e-5, max - min);
  for (let i = 0; i < values.length; i += 1) {
    const v = Math.round(((values[i] - min) / span) * 255);
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // Coverage data, not colour — an sRGB decode here would skew the contrast.
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

export function createCloudShadows(config = {}, windConfig = {}) {
  const enabled = config.enabled !== false;
  const strength = THREE.MathUtils.clamp(Number(config.strength ?? 0.3), 0, 1);
  const scale = Math.max(1, Number(config.scale) || 190);
  const detailScale = Math.max(1, Number(config.detailScale) || 74);
  const speed = Number(config.speed ?? 0.0075);
  const coverage = THREE.MathUtils.clamp(Number(config.coverage ?? 0.52), 0, 1);
  const softness = THREE.MathUtils.clamp(Number(config.softness ?? 0.36), 0.02, 1);
  const tileSize = Math.max(32, Math.min(256, Math.round(Number(config.tileSize) || 128)));

  // Clouds drift with the same wind that moves the trees, or the scene reads
  // as two independent weather systems layered on one island.
  const dirX = Number(windConfig?.direction?.x ?? 0.8);
  const dirZ = Number(windConfig?.direction?.z ?? 0.35);
  const length = Math.hypot(dirX, dirZ) || 1;

  const texture = enabled ? bakeCloudTile(tileSize, Number(config.seed) || 11) : null;

  const uniforms = {
    uCloudShadowMap: { value: texture },
    uCloudShadowTime: { value: 0 },
    uCloudShadowStrength: { value: enabled ? strength : 0 },
    uCloudShadowScale: { value: 1 / scale },
    uCloudShadowDetailScale: { value: 1 / detailScale },
    uCloudShadowDrift: { value: new THREE.Vector2((dirX / length) * speed, (dirZ / length) * speed) },
    uCloudShadowCoverage: { value: coverage },
    uCloudShadowSoftness: { value: softness },
  };

  const DECLARATIONS = [
    "uniform sampler2D uCloudShadowMap;",
    "uniform float uCloudShadowTime;",
    "uniform float uCloudShadowStrength;",
    "uniform float uCloudShadowScale;",
    "uniform float uCloudShadowDetailScale;",
    "uniform vec2 uCloudShadowDrift;",
    "uniform float uCloudShadowCoverage;",
    "uniform float uCloudShadowSoftness;",
    "varying vec3 vCloudShadowWorld;",
    // Whatever grid value noise still carries runs along its own axes. Reading
    // the second layer through a rotation puts its grid at 34° to the first, so
    // the two can soften each other's lines but never stack into a rectangle.
    "const mat2 cloudDetailRotation = mat2( 0.8290, 0.5592, -0.5592, 0.8290 );",
  ].join("\n");

  const FRAGMENT = [
    "if ( uCloudShadowStrength > 0.0 ) {",
    "  vec2 cloudDrift = uCloudShadowDrift * uCloudShadowTime;",
    // Subtracting lookup drift makes the texture feature itself travel in the
    // positive wind direction, matching the visible cloud field in sky.js.
    "  vec2 cloudBaseUv = vCloudShadowWorld.xz * uCloudShadowScale - cloudDrift;",
    // The second layer runs at a different scale, a different speed AND a
    // different orientation, so the two never line up again after the first
    // frame and the tile stops reading as a tile.
    "  vec2 cloudDetailUv = cloudDetailRotation * vCloudShadowWorld.xz * uCloudShadowDetailScale - cloudDrift * 1.7;",
    "  float cloudMask = texture2D( uCloudShadowMap, cloudBaseUv ).r * 0.65",
    "    + texture2D( uCloudShadowMap, cloudDetailUv ).r * 0.35;",
    "  float cloudShade = smoothstep(",
    "    uCloudShadowCoverage - uCloudShadowSoftness,",
    "    uCloudShadowCoverage + uCloudShadowSoftness,",
    "    cloudMask",
    "  );",
    "  outgoingLight *= mix( 1.0 - uCloudShadowStrength, 1.0, cloudShade );",
    "}",
  ].join("\n");

  /**
   * Composes onto whatever the material already does. The terrain material has
   * the ground-paint splat shader on it and the outer ground has its own
   * distance shading, so replacing onBeforeCompile here would silently delete
   * one of them.
   */
  function applyTo(material) {
    if (!material || !enabled) return material;

    const previousCompile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;

    material.onBeforeCompile = (shader, renderer) => {
      previousCompile?.call(material, shader, renderer);
      Object.assign(shader.uniforms, uniforms);

      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCloudShadowWorld;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvCloudShadowWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;"
        );

      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${DECLARATIONS}`)
        .replace("#include <opaque_fragment>", `${FRAGMENT}\n#include <opaque_fragment>`);
    };

    material.customProgramCacheKey = () =>
      `${previousKey ? previousKey.call(material) : material.type}|clouds:${tileSize}`;
    material.needsUpdate = true;
    return material;
  }

  return {
    enabled,
    uniforms,
    applyTo,
    update(delta) {
      if (!enabled) return;
      uniforms.uCloudShadowTime.value += delta;
    },
    setStrength(value) {
      uniforms.uCloudShadowStrength.value = enabled
        ? THREE.MathUtils.clamp(Number(value) || 0, 0, 1)
        : 0;
    },
    dispose() {
      texture?.dispose();
    },
  };
}
