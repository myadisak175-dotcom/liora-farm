import { classifyTreePart, getPartWeights } from "./wind-profiles.js";

const COMMON = "#include <common>";
const BEGIN_VERTEX = "#include <begin_vertex>";
const COLOR_FRAGMENT = "#include <color_fragment>";
const WORLD_UP = Object.freeze({ x: 0, y: 1, z: 0 });
const MIN_HEIGHT = 0.0001;

const WIND_DECLARATIONS = `
uniform float lioraWindTime;
uniform vec2 lioraWindDirection;
uniform float lioraWindStrength;
uniform float lioraWindSpeed;
uniform float lioraWindGustStrength;
uniform float lioraWindGustSpeed;
uniform float lioraWindGustScale;
uniform vec3 lioraWindUp;
uniform float lioraWindMinH;
uniform float lioraWindInvHeight;
uniform vec4 lioraWindProfile;
uniform float lioraWindAmplitude;
uniform float lioraWindFrequency;
uniform float lioraWindSpatial;
uniform float lioraWindRootLock;
uniform vec2 lioraInteractionPosition;
uniform vec2 lioraInteractionDirection;
uniform float lioraInteractionRadius;
uniform float lioraInteractionStrength;
uniform float lioraInteractionMotion;
uniform float lioraInteractionActive;
uniform float lioraInteractionWeight;
`;

const PALETTE_DECLARATIONS = `
uniform float lioraNaturePaletteStrength;
`;

/**
 * One master knob grades only pixels that are actually green. This matters for
 * atlased nature materials where bark, leaves and flowers can share a texture:
 * material-level HSL would mute the pink petals and brown trunks as collateral.
 *
 * At strength 0.28 a strongly-green pixel loses about 28% saturation and gets
 * a very small warm bias (slightly more red, slightly less blue). Brown bark,
 * grey rocks and pink/purple flowers receive little or no grade because their
 * green mask approaches zero.
 */
const PALETTE_FRAGMENT = `
float lioraPaletteMaxC = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
float lioraPaletteMinC = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
float lioraPaletteChroma = lioraPaletteMaxC - lioraPaletteMinC;
float lioraPaletteGreen =
  smoothstep(-0.12, 0.08, diffuseColor.g - diffuseColor.r) *
  smoothstep(-0.02, 0.12, diffuseColor.g - diffuseColor.b) *
  smoothstep(0.035, 0.16, lioraPaletteChroma);
float lioraPaletteAmount = clamp(lioraNaturePaletteStrength * lioraPaletteGreen, 0.0, 1.0);
float lioraPaletteLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lioraPaletteLuma), lioraPaletteAmount);
diffuseColor.r *= 1.0 + lioraPaletteAmount * 0.10;
diffuseColor.b *= 1.0 - lioraPaletteAmount * 0.08;
diffuseColor.rgb = clamp(diffuseColor.rgb, 0.0, 1.0);
`;

// `lioraWindUp` is the object-space direction that points at world up. It is
// not assumed to be (0,1,0): the World V2 nature GLBs are authored Z-up (and
// the bushes carry arbitrary tilts), so height, bend axis and flutter axis all
// have to be built from that vector instead of from `position.y`.
const WIND_VERTEX = `
// Pooled plants are drawn as instances, so the object's real world placement
// lives in instanceMatrix, not modelMatrix. Reading modelMatrix alone would
// give every clump on the island the same world position — and therefore the
// same phase — so a whole meadow would sway in perfect lockstep.
#ifdef USE_INSTANCING
  mat4 lioraWindModel = modelMatrix * instanceMatrix;
#else
  mat4 lioraWindModel = modelMatrix;
#endif

float lioraWindH = clamp((dot(position, lioraWindUp) - lioraWindMinH) * lioraWindInvHeight, 0.0, 1.0);
float lioraWindRoot = smoothstep(0.0, max(0.001, lioraWindRootLock), lioraWindH);
float lioraWindBase = lioraWindH * lioraWindProfile.x;
float lioraWindMid = smoothstep(0.18, 0.72, lioraWindH) * lioraWindProfile.y;
float lioraWindTip = smoothstep(0.48, 0.98, lioraWindH) * lioraWindProfile.z;
float lioraWindBend = lioraWindRoot * clamp(lioraWindBase + lioraWindMid + lioraWindTip, 0.0, 1.25);

vec2 lioraWindWorldXZ = (lioraWindModel * vec4(position, 1.0)).xz;
float lioraWindPhase =
  lioraWindTime * lioraWindSpeed * lioraWindFrequency +
  dot(lioraWindWorldXZ, vec2(0.173, 0.219)) * lioraWindSpatial;
float lioraWindWave =
  sin(lioraWindPhase) * 0.72 +
  sin(lioraWindPhase * 1.87 + 1.31) * 0.28;
float lioraWindGust = 1.0 + lioraWindGustStrength *
  (0.5 + 0.5 * sin(lioraWindTime * lioraWindGustSpeed +
  dot(lioraWindWorldXZ, vec2(lioraWindGustScale, -lioraWindGustScale * 0.73))));

vec3 lioraWindWorldDir = normalize(vec3(lioraWindDirection.x, 0.0, lioraWindDirection.y));
vec3 lioraWindLocalDir = vec3(
  dot(lioraWindWorldDir, normalize(lioraWindModel[0].xyz)),
  dot(lioraWindWorldDir, normalize(lioraWindModel[1].xyz)),
  dot(lioraWindWorldDir, normalize(lioraWindModel[2].xyz))
);
lioraWindLocalDir -= lioraWindUp * dot(lioraWindLocalDir, lioraWindUp);
float lioraWindDirLength = length(lioraWindLocalDir);
lioraWindLocalDir = lioraWindDirLength > 0.001
  ? lioraWindLocalDir / lioraWindDirLength
  : vec3(0.0);
vec3 lioraWindSideDir = cross(lioraWindUp, lioraWindLocalDir);

float lioraWindLocalHeight = 1.0 / max(lioraWindInvHeight, 0.0001);
float lioraWindAmount =
  lioraWindLocalHeight * lioraWindAmplitude * lioraWindStrength *
  lioraWindBend * lioraWindWave * lioraWindGust;
float lioraWindFlutter =
  lioraWindLocalHeight * lioraWindAmplitude * lioraWindStrength *
  lioraWindProfile.w * lioraWindRoot *
  sin(lioraWindPhase * 5.2 + lioraWindH * 8.0) * 0.28;

transformed +=
  lioraWindLocalDir * lioraWindAmount +
  lioraWindSideDir * lioraWindFlutter +
  lioraWindUp * lioraWindFlutter * 0.05;
`;

const INTERACTION_VERTEX = `
// Grass, flowers and soft bushes make room for Liora without changing their
// Object3D transforms or collision data. The distance field is evaluated in
// world space, which means one shared material works for every pooled plant.
vec2 lioraInteractionDelta = lioraWindWorldXZ - lioraInteractionPosition;
float lioraInteractionDistance = length(lioraInteractionDelta);
float lioraInteractionFalloff = 1.0 - smoothstep(
  lioraInteractionRadius * 0.18,
  max(lioraInteractionRadius, 0.001),
  lioraInteractionDistance
);
lioraInteractionFalloff *= lioraInteractionActive * lioraInteractionWeight;

vec2 lioraInteractionPushXZ = lioraInteractionDistance > 0.015
  ? lioraInteractionDelta / lioraInteractionDistance
  : lioraInteractionDirection;
float lioraInteractionPushLength = length(lioraInteractionPushXZ);
lioraInteractionPushXZ = lioraInteractionPushLength > 0.001
  ? lioraInteractionPushXZ / lioraInteractionPushLength
  : lioraWindDirection;

vec3 lioraInteractionWorldDir = vec3(
  lioraInteractionPushXZ.x,
  0.0,
  lioraInteractionPushXZ.y
);
vec3 lioraInteractionLocalDir = vec3(
  dot(lioraInteractionWorldDir, normalize(lioraWindModel[0].xyz)),
  dot(lioraInteractionWorldDir, normalize(lioraWindModel[1].xyz)),
  dot(lioraInteractionWorldDir, normalize(lioraWindModel[2].xyz))
);
lioraInteractionLocalDir -= lioraWindUp * dot(lioraInteractionLocalDir, lioraWindUp);
float lioraInteractionLocalLength = length(lioraInteractionLocalDir);
lioraInteractionLocalDir = lioraInteractionLocalLength > 0.001
  ? lioraInteractionLocalDir / lioraInteractionLocalLength
  : vec3(0.0);

float lioraInteractionHeight = lioraWindRoot * smoothstep(0.08, 0.95, lioraWindH);
float lioraInteractionMotionBoost = mix(0.62, 0.82, lioraInteractionMotion);
float lioraInteractionAmount =
  lioraWindLocalHeight * lioraInteractionStrength *
  lioraInteractionFalloff * lioraInteractionHeight *
  lioraInteractionMotionBoost;
transformed +=
  lioraInteractionLocalDir * lioraInteractionAmount -
  lioraWindUp * abs(lioraInteractionAmount) * 0.025;
`;

function normalizeAxis(x, y, z) {
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length < 1e-6) return { ...WORLD_UP };
  return { x: x / length, y: y / length, z: z / length };
}

/**
 * The object-space vector that points at world up.
 *
 * `matrixWorld` maps object space to world space, so for the rigid transforms
 * glTF nodes use, the transpose of its basis maps world up back into object
 * space — that is the second row, `(e[1], e[5], e[9])`.
 */
export function localUpAxis(object) {
  const elements = object?.matrixWorld?.elements;
  if (!elements || elements.length < 11) return { ...WORLD_UP };
  return normalizeAxis(Number(elements[1]) || 0, Number(elements[5]) || 0, Number(elements[9]) || 0);
}

/**
 * Extent of a geometry along an arbitrary axis. Projecting the eight bounding
 * box corners is exact for the axis-aligned boxes Three.js produces and stays
 * cheap enough to run per mesh at spawn time.
 */
export function boundsAlongAxis(geometry, up = WORLD_UP) {
  geometry?.computeBoundingBox?.();
  const box = geometry?.boundingBox;
  if (!box?.min || !box?.max) return null;

  const xs = [Number(box.min.x) || 0, Number(box.max.x) || 0];
  const ys = [Number(box.min.y) || 0, Number(box.max.y) || 0];
  const zs = [Number(box.min.z) || 0, Number(box.max.z) || 0];

  let minH = Infinity;
  let maxH = -Infinity;
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const h = x * up.x + y * up.y + z * up.z;
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
  }

  const height = maxH - minH;
  if (![minH, height].every(Number.isFinite) || height <= MIN_HEIGHT) return null;
  return { minH, height };
}

/**
 * One height frame for a whole model so a trunk mesh and its separate leaf
 * mesh share the same base-to-tip gradient. Without this the leaves would
 * restart at h = 0 partway up the tree and lock exactly where they should be
 * moving most.
 */
export function createModelWindFrame(model) {
  let up = null;
  let minH = Infinity;
  let maxH = -Infinity;

  model?.traverse?.((node) => {
    if (!node?.isMesh || !node.geometry) return;
    if (!up) up = localUpAxis(node);
    const bounds = boundsAlongAxis(node.geometry, up);
    if (!bounds) return;
    minH = Math.min(minH, bounds.minH);
    maxH = Math.max(maxH, bounds.minH + bounds.height);
  });

  const height = maxH - minH;
  const usable = [minH, height].every(Number.isFinite) && height > MIN_HEIGHT;
  return { up: up ?? { ...WORLD_UP }, bounds: usable ? { minH, height } : null };
}

function patchShader(shader, uniforms, local, up) {
  if (!shader?.vertexShader?.includes(COMMON) || !shader.vertexShader.includes(BEGIN_VERTEX)) {
    throw new Error("Wind shader anchors were not found");
  }

  Object.assign(shader.uniforms, {
    lioraWindTime: uniforms.time,
    lioraWindDirection: uniforms.direction,
    lioraWindStrength: uniforms.strength,
    lioraWindSpeed: uniforms.speed,
    lioraWindGustStrength: uniforms.gustStrength,
    lioraWindGustSpeed: uniforms.gustSpeed,
    lioraWindGustScale: uniforms.gustScale,
    lioraWindUp: { value: new Float32Array([up.x, up.y, up.z]) },
    lioraWindMinH: { value: local.minH },
    lioraWindInvHeight: { value: 1 / local.height },
    lioraWindProfile: { value: new Float32Array([local.base, local.mid, local.tip, local.flutter]) },
    lioraWindAmplitude: { value: local.amplitude },
    lioraWindFrequency: { value: local.frequency },
    lioraWindSpatial: { value: local.spatial },
    lioraWindRootLock: { value: local.rootLock },
    lioraInteractionPosition: uniforms.interactionPosition ?? { value: { x: 100000, y: 100000 } },
    lioraInteractionDirection: uniforms.interactionDirection ?? { value: { x: 1, y: 0 } },
    lioraInteractionRadius: uniforms.interactionRadius ?? { value: 0 },
    lioraInteractionStrength: uniforms.interactionStrength ?? { value: 0 },
    lioraInteractionMotion: uniforms.interactionMotion ?? { value: 0 },
    lioraInteractionActive: uniforms.interactionActive ?? { value: 0 },
    lioraInteractionWeight: { value: local.interaction ?? 0 },
  });

  shader.vertexShader = shader.vertexShader.replace(COMMON, `${COMMON}\n${WIND_DECLARATIONS}`);
  const interactionVertex = local.interaction > 0 ? INTERACTION_VERTEX : "";
  shader.vertexShader = shader.vertexShader.replace(
    BEGIN_VERTEX,
    `${BEGIN_VERTEX}\n${WIND_VERTEX}${interactionVertex}`
  );

  const paletteStrength = Number(uniforms.paletteStrength?.value) || 0;
  if (paletteStrength > 0 && shader.fragmentShader?.includes(COLOR_FRAGMENT)) {
    shader.uniforms.lioraNaturePaletteStrength = uniforms.paletteStrength;
    shader.fragmentShader = shader.fragmentShader.replace(
      COMMON,
      `${COMMON}\n${PALETTE_DECLARATIONS}`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      COLOR_FRAGMENT,
      `${COLOR_FRAGMENT}\n${PALETTE_FRAGMENT}`
    );
  }
}

/**
 * Adds visual-only vertex displacement and optional green-only colour grading
 * to one material. Geometry, Object3D transforms and collision metadata remain
 * untouched.
 */
export function applyWindToMaterial({
  material,
  geometry,
  mesh,
  profileName,
  uniforms,
  quality,
  clone = true,
  shared = false,
  up = null,
  bounds = null,
}) {
  const axis = up ?? localUpAxis(mesh);
  const span = bounds ?? boundsAlongAxis(geometry, axis);
  if (!material || !span || !profileName) return null;

  const part = profileName === "tree" ? classifyTreePart(mesh, material) : "mixed";
  const weights = getPartWeights(profileName, part, quality);
  if (!weights) return null;

  const target = clone ? material.clone() : material;
  const previousCompile = target.onBeforeCompile?.bind(target);
  const previousCacheKey = target.customProgramCacheKey?.bind(target);

  target.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    patchShader(shader, uniforms, { ...span, ...weights }, axis);
  };
  target.customProgramCacheKey = () =>
    `${previousCacheKey?.() ?? ""}|liora-wind-v3-interaction:${weights.interaction > 0 ? 1 : 0}|liora-nature-palette-v1`;
  target.userData = {
    ...target.userData,
    lioraWind: true,
    lioraWindProfile: profileName,
    lioraWindPart: part,
    lioraWindShared: shared,
    lioraNaturePalette: (Number(uniforms.paletteStrength?.value) || 0) > 0,
    preserveShaderHooksOnClone: true,
    // A shared material is reused by every copy of the asset and must survive
    // any one of them being deleted.
    disposeWithBuilderView:
      (clone && !shared) || Boolean(target.userData?.disposeWithBuilderView),
  };
  target.needsUpdate = true;
  return target;
}
