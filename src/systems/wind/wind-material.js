import { classifyTreePart, getPartWeights } from "./wind-profiles.js";

const COMMON = "#include <common>";
const BEGIN_VERTEX = "#include <begin_vertex>";

const WIND_DECLARATIONS = `
uniform float lioraWindTime;
uniform vec2 lioraWindDirection;
uniform float lioraWindStrength;
uniform float lioraWindSpeed;
uniform float lioraWindGustStrength;
uniform float lioraWindGustSpeed;
uniform float lioraWindGustScale;
uniform float lioraWindMinY;
uniform float lioraWindInvHeight;
uniform vec4 lioraWindProfile;
uniform float lioraWindAmplitude;
uniform float lioraWindFrequency;
uniform float lioraWindSpatial;
uniform float lioraWindRootLock;
`;

const WIND_VERTEX = `
float lioraWindH = clamp((position.y - lioraWindMinY) * lioraWindInvHeight, 0.0, 1.0);
float lioraWindRoot = smoothstep(0.0, max(0.001, lioraWindRootLock), lioraWindH);
float lioraWindBase = lioraWindH * lioraWindProfile.x;
float lioraWindMid = smoothstep(0.18, 0.72, lioraWindH) * lioraWindProfile.y;
float lioraWindTip = smoothstep(0.48, 0.98, lioraWindH) * lioraWindProfile.z;
float lioraWindBend = lioraWindRoot * clamp(lioraWindBase + lioraWindMid + lioraWindTip, 0.0, 1.25);

vec2 lioraWindWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;
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
vec3 lioraWindAxisX = normalize(modelMatrix[0].xyz);
vec3 lioraWindAxisZ = normalize(modelMatrix[2].xyz);
vec3 lioraWindLocalDir = normalize(vec3(
  dot(lioraWindWorldDir, lioraWindAxisX),
  0.0,
  dot(lioraWindWorldDir, lioraWindAxisZ)
));

float lioraWindLocalHeight = 1.0 / max(lioraWindInvHeight, 0.0001);
float lioraWindAmount =
  lioraWindLocalHeight * lioraWindAmplitude * lioraWindStrength *
  lioraWindBend * lioraWindWave * lioraWindGust;
float lioraWindFlutter =
  lioraWindLocalHeight * lioraWindAmplitude * lioraWindStrength *
  lioraWindProfile.w * lioraWindRoot *
  sin(lioraWindPhase * 5.2 + lioraWindH * 8.0) * 0.28;

transformed.x += lioraWindLocalDir.x * lioraWindAmount + lioraWindLocalDir.z * lioraWindFlutter;
transformed.z += lioraWindLocalDir.z * lioraWindAmount - lioraWindLocalDir.x * lioraWindFlutter;
transformed.y += lioraWindFlutter * 0.05;
`;

function finiteBounds(geometry) {
  geometry?.computeBoundingBox?.();
  const bounds = geometry?.boundingBox;
  if (!bounds) return null;
  const minY = Number(bounds.min?.y);
  const maxY = Number(bounds.max?.y);
  const height = maxY - minY;
  if (![minY, maxY, height].every(Number.isFinite) || height <= 0.0001) return null;
  return { minY, height };
}

function patchShader(shader, uniforms, local) {
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
    lioraWindMinY: { value: local.minY },
    lioraWindInvHeight: { value: 1 / local.height },
    lioraWindProfile: { value: new Float32Array([local.base, local.mid, local.tip, local.flutter]) },
    lioraWindAmplitude: { value: local.amplitude },
    lioraWindFrequency: { value: local.frequency },
    lioraWindSpatial: { value: local.spatial },
    lioraWindRootLock: { value: local.rootLock },
  });

  shader.vertexShader = shader.vertexShader.replace(COMMON, `${COMMON}\n${WIND_DECLARATIONS}`);
  shader.vertexShader = shader.vertexShader.replace(BEGIN_VERTEX, `${BEGIN_VERTEX}\n${WIND_VERTEX}`);
}

/**
 * Adds visual-only vertex displacement to one material. Geometry, Object3D
 * transforms and collision metadata remain untouched.
 */
export function applyWindToMaterial({
  material,
  geometry,
  mesh,
  profileName,
  uniforms,
  quality,
  clone = true,
}) {
  const bounds = finiteBounds(geometry);
  if (!material || !bounds || !profileName) return null;

  const part = profileName === "tree" ? classifyTreePart(mesh, material) : "mixed";
  const weights = getPartWeights(profileName, part, quality);
  if (!weights) return null;

  const target = clone ? material.clone() : material;
  const previousCompile = target.onBeforeCompile?.bind(target);
  const previousCacheKey = target.customProgramCacheKey?.bind(target);

  target.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    patchShader(shader, uniforms, { ...bounds, ...weights });
  };
  target.customProgramCacheKey = () => `${previousCacheKey?.() ?? ""}|liora-wind-v1`;
  target.userData = { ...target.userData, lioraWind: true, lioraWindProfile: profileName, lioraWindPart: part };
  target.needsUpdate = true;
  return target;
}
