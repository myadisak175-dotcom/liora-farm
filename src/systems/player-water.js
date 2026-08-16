import * as THREE from "three";

const COMMON = "#include <common>";
const PROJECT_VERTEX = "#include <project_vertex>";
const COLOR_FRAGMENT = "#include <color_fragment>";

const DEFAULTS = Object.freeze({
  minDepth: 0.035,
  clipInset: 0.012,
  waterlineWidth: 0.085,
  tintStrength: 0.24,
  tintColor: 0x8bdfe6,
  ripplePool: 8,
  rippleInterval: 0.26,
  idleRippleInterval: 1.15,
  rippleLife: 0.72,
  rippleStartSize: 0.34,
  rippleEndSize: 1.08,
  rippleOpacity: 0.32,
  rippleColor: 0xe8ffff,
  rippleLift: 0.025,
});

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function mergedConfig(config = {}) {
  const fx = config.interaction ?? {};
  return {
    minDepth: positive(fx.minDepth, DEFAULTS.minDepth),
    clipInset: positive(fx.clipInset, DEFAULTS.clipInset),
    waterlineWidth: Math.max(0.001, positive(fx.waterlineWidth, DEFAULTS.waterlineWidth)),
    tintStrength: THREE.MathUtils.clamp(
      positive(fx.tintStrength, DEFAULTS.tintStrength),
      0,
      1
    ),
    tintColor: fx.tintColor ?? DEFAULTS.tintColor,
    ripplePool: Math.max(2, Math.round(positive(fx.ripplePool, DEFAULTS.ripplePool))),
    rippleInterval: Math.max(0.08, positive(fx.rippleInterval, DEFAULTS.rippleInterval)),
    idleRippleInterval: Math.max(
      0.4,
      positive(fx.idleRippleInterval, DEFAULTS.idleRippleInterval)
    ),
    rippleLife: Math.max(0.2, positive(fx.rippleLife, DEFAULTS.rippleLife)),
    rippleStartSize: Math.max(
      0.05,
      positive(fx.rippleStartSize, DEFAULTS.rippleStartSize)
    ),
    rippleEndSize: Math.max(
      0.1,
      positive(fx.rippleEndSize, DEFAULTS.rippleEndSize)
    ),
    rippleOpacity: THREE.MathUtils.clamp(
      positive(fx.rippleOpacity, DEFAULTS.rippleOpacity),
      0,
      1
    ),
    rippleColor: fx.rippleColor ?? DEFAULTS.rippleColor,
    rippleLift: positive(fx.rippleLift, DEFAULTS.rippleLift),
  };
}

function patchWaterShader(shader, uniforms) {
  if (
    !shader?.vertexShader?.includes(COMMON) ||
    !shader.vertexShader.includes(PROJECT_VERTEX) ||
    !shader?.fragmentShader?.includes(COMMON) ||
    !shader.fragmentShader.includes(COLOR_FRAGMENT)
  ) {
    throw new Error("Player water shader anchors were not found");
  }

  Object.assign(shader.uniforms, {
    lioraWaterLevel: uniforms.level,
    lioraWaterDepth: uniforms.depth,
    lioraWaterMinDepth: uniforms.minDepth,
    lioraWaterClipInset: uniforms.clipInset,
    lioraWaterlineWidth: uniforms.waterlineWidth,
    lioraWaterTintStrength: uniforms.tintStrength,
    lioraWaterTint: uniforms.tint,
  });

  shader.vertexShader = shader.vertexShader.replace(
    COMMON,
    `${COMMON}\nvarying float vLioraWaterWorldY;`
  );
  shader.vertexShader = shader.vertexShader.replace(
    PROJECT_VERTEX,
    `${PROJECT_VERTEX}\nvLioraWaterWorldY = (modelMatrix * vec4(transformed, 1.0)).y;`
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    COMMON,
    `${COMMON}
     uniform float lioraWaterLevel;
     uniform float lioraWaterDepth;
     uniform float lioraWaterMinDepth;
     uniform float lioraWaterClipInset;
     uniform float lioraWaterlineWidth;
     uniform float lioraWaterTintStrength;
     uniform vec3 lioraWaterTint;
     varying float vLioraWaterWorldY;`
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    COLOR_FRAGMENT,
    `${COLOR_FRAGMENT}
     float lioraImmersion = smoothstep(
       lioraWaterMinDepth,
       lioraWaterMinDepth + 0.055,
       lioraWaterDepth
     );
     if (
       lioraImmersion > 0.001 &&
       vLioraWaterWorldY < lioraWaterLevel - lioraWaterClipInset
     ) discard;

     float lioraAboveSurface = max(0.0, vLioraWaterWorldY - lioraWaterLevel);
     float lioraWaterline = 1.0 - smoothstep(
       0.0,
       lioraWaterlineWidth,
       lioraAboveSurface
     );
     float lioraWetBand = lioraWaterline * lioraImmersion * lioraWaterTintStrength;
     diffuseColor.rgb = mix(diffuseColor.rgb, lioraWaterTint, lioraWetBand);`
  );
}

/**
 * Adds a stylized waterline to an existing player material. The lower body is
 * clipped only while the sampled terrain is genuinely below the water plane;
 * the thin visible band immediately above the surface gets a cool wet tint.
 *
 * This is one shader branch on the player's existing draw call. It does not
 * clone the player mesh, add a refraction pass, or change animation/collision.
 */
export function applyPlayerWaterToMaterial({ material, uniforms }) {
  if (!material || !uniforms) return null;
  const previousCompile = material.onBeforeCompile?.bind(material);
  const previousCacheKey = material.customProgramCacheKey?.bind(material);

  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    patchWaterShader(shader, uniforms);
  };
  material.customProgramCacheKey = () =>
    `${previousCacheKey?.() ?? ""}|liora-player-water-v1`;
  material.userData = {
    ...material.userData,
    lioraPlayerWater: true,
    preserveShaderHooksOnClone: true,
  };
  material.needsUpdate = true;
  return material;
}

function createRippleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, 64, 64);
  context.strokeStyle = "rgba(255,255,255,0.95)";
  context.lineWidth = 3;
  context.beginPath();
  context.ellipse(32, 32, 25, 12, 0, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = "rgba(255,255,255,0.34)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.ellipse(32, 32, 19, 9, 0, 0, Math.PI * 2);
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createNoopInteraction() {
  return {
    update() {},
    dispose() {},
    get stats() {
      return { patchedMaterials: 0, activeRipples: 0 };
    },
  };
}

export function createPlayerWaterInteraction({ scene, player, config = {} } = {}) {
  if (!scene || !player?.model) return createNoopInteraction();

  const tuned = mergedConfig(config);
  const uniforms = {
    level: { value: Number(config.level) || 0 },
    depth: { value: 0 },
    minDepth: { value: tuned.minDepth },
    clipInset: { value: tuned.clipInset },
    waterlineWidth: { value: tuned.waterlineWidth },
    tintStrength: { value: tuned.tintStrength },
    tint: { value: new THREE.Color(tuned.tintColor) },
  };

  const patched = new Set();
  player.model.traverse((node) => {
    if (!node?.isMesh || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material || patched.has(material)) continue;
      try {
        applyPlayerWaterToMaterial({ material, uniforms });
        patched.add(material);
      } catch (error) {
        console.warn("Player waterline shader skipped a material", error);
      }
    }
  });

  const rippleTexture = createRippleTexture();
  const rippleGeometry = new THREE.PlaneGeometry(1, 1);
  const ripples = [];
  const rippleColor = new THREE.Color(tuned.rippleColor);
  for (let i = 0; i < tuned.ripplePool; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      map: rippleTexture,
      color: rippleColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(rippleGeometry, material);
    mesh.name = `PlayerWaterRipple${i}`;
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.renderOrder = (config.renderOrder ?? 1) + 2;
    mesh.frustumCulled = false;
    scene.add(mesh);
    ripples.push({ mesh, age: 0, life: tuned.rippleLife });
  }

  let poolIndex = 0;
  let rippleTimer = 0;
  let wasInWater = false;

  function spawnRipple(position, strength = 1) {
    const ripple = ripples[poolIndex];
    poolIndex = (poolIndex + 1) % ripples.length;
    ripple.age = 0;
    ripple.life = tuned.rippleLife * (0.92 + Math.random() * 0.16);
    ripple.mesh.position.set(
      position.x,
      uniforms.level.value + tuned.rippleLift,
      position.z
    );
    ripple.mesh.scale.setScalar(tuned.rippleStartSize * strength);
    ripple.mesh.material.opacity = tuned.rippleOpacity * strength;
    ripple.mesh.visible = true;
  }

  function updateRippleMeshes(delta) {
    for (const ripple of ripples) {
      if (!ripple.mesh.visible) continue;
      ripple.age += delta;
      const t = ripple.age / ripple.life;
      if (t >= 1) {
        ripple.mesh.visible = false;
        ripple.mesh.material.opacity = 0;
        continue;
      }
      const eased = 1 - Math.pow(1 - t, 2);
      const scale = THREE.MathUtils.lerp(
        tuned.rippleStartSize,
        tuned.rippleEndSize,
        eased
      );
      ripple.mesh.scale.setScalar(scale);
      ripple.mesh.material.opacity = tuned.rippleOpacity * Math.pow(1 - t, 1.7);
    }
  }

  return {
    update({ position, moving = false, depth = 0, delta = 0 } = {}) {
      uniforms.depth.value = Math.max(0, Number(depth) || 0);
      const inWater = uniforms.depth.value > tuned.minDepth;
      const step = Number.isFinite(delta) ? Math.max(0, delta) : 0;

      if (position && inWater) {
        if (!wasInWater) {
          spawnRipple(position, 0.9);
          rippleTimer = moving ? tuned.rippleInterval : tuned.idleRippleInterval;
        } else {
          rippleTimer -= step;
          if (rippleTimer <= 0) {
            spawnRipple(position, moving ? 1 : 0.68);
            rippleTimer = moving ? tuned.rippleInterval : tuned.idleRippleInterval;
          }
        }
      } else {
        rippleTimer = 0;
      }

      wasInWater = inWater;
      updateRippleMeshes(step);
    },
    dispose() {
      for (const ripple of ripples) {
        scene.remove(ripple.mesh);
        ripple.mesh.material.dispose();
      }
      rippleGeometry.dispose();
      rippleTexture.dispose();
    },
    get stats() {
      return {
        patchedMaterials: patched.size,
        activeRipples: ripples.filter((ripple) => ripple.mesh.visible).length,
      };
    },
    get uniforms() {
      return uniforms;
    },
  };
}
