import * as THREE from "three";

/**
 * The far half of the shadow story.
 *
 * `CONFIG.shadows.bounds` is the radius of the real shadow map, and it follows
 * the player. That is the right call — a map big enough to cover the whole
 * island would spend all its resolution on ground the camera never looks at
 * closely. But it means every tree past that radius casts nothing at all, so
 * the middle distance reads as stickers standing on a painted field.
 *
 * The honest fix would be a second cascade, and it is the wrong fix here: a
 * second shadow map is a second full render of every caster in the scene,
 * every frame, on a phone. Instead each placed object gets a soft blob on the
 * ground beneath it — the same trick `contact-shadow.js` already uses for the
 * player, extended to the builder's objects and drawn as ONE instanced mesh,
 * so a hundred trees cost one draw call.
 *
 * The two systems must not overlap or near objects get two shadows stacked.
 * The shader fades each blob in only once it is outside the real shadow map's
 * coverage, using the same follow point the sun uses.
 */

function createBlobTexture(size = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 1, half, half, half - 3);
  gradient.addColorStop(0, "rgba(0,0,0,0.85)");
  gradient.addColorStop(0.45, "rgba(0,0,0,0.44)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createObjectShadows({
  scene = null,
  config = {},
  shadowBounds = 12,
  getGroundHeight = () => 0,
} = {}) {
  const enabled = config.enabled !== false;
  const capacityStep = Math.max(16, Math.round(Number(config.capacityStep) || 64));
  const opacity = THREE.MathUtils.clamp(Number(config.opacity ?? 0.34), 0, 1);
  const radiusScale = Math.max(0.1, Number(config.radiusScale) || 1.15);
  const maxRadius = Math.max(0.5, Number(config.maxRadius) || 6);
  const lift = Number(config.lift ?? 0.02);

  const group = new THREE.Group();
  group.name = "ObjectShadows";

  const entries = new Map(); // id -> { x, z, radius }
  const order = []; // id, in instance order
  const followPoint = new THREE.Vector2(0, 0);

  let texture = null;
  let geometry = null;
  let material = null;
  let mesh = null;
  let capacity = 0;
  let dirty = false;

  if (!enabled || !scene) {
    return {
      enabled: false,
      group,
      set() {}, remove() {}, clear() {}, refresh() {},
      setFollowPoint() {}, setShadowBounds() {}, setOpacity() {},
      get count() { return 0; },
      dispose() {},
    };
  }

  texture = createBlobTexture();
  geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);

  material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity,
    // Already black; tone mapping would lift it toward grey.
    toneMapped: false,
  });

  const uniforms = {
    uBlobFadeStart: { value: shadowBounds * 0.62 },
    uBlobFadeEnd: { value: shadowBounds * 1.05 },
    uBlobFollow: { value: followPoint },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform vec2 uBlobFollow;",
          "uniform float uBlobFadeStart;",
          "uniform float uBlobFadeEnd;",
          "varying float vBlobHandover;",
        ].join("\n")
      )
      .replace(
        "#include <project_vertex>",
        [
          "#include <project_vertex>",
          // Per-instance, not per-pixel: one smoothstep on the instance origin
          // is enough because a blob is small next to the handover band.
          "vec3 blobOrigin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;",
          "vBlobHandover = smoothstep( uBlobFadeStart, uBlobFadeEnd, distance( blobOrigin.xz, uBlobFollow ) );",
        ].join("\n")
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vBlobHandover;")
      .replace(
        "#include <opaque_fragment>",
        "diffuseColor.a *= vBlobHandover;\n#include <opaque_fragment>"
      );
  };
  material.customProgramCacheKey = () => "liora-object-shadow-blob";

  function ensureCapacity(needed) {
    if (mesh && needed <= capacity) return;
    const nextCapacity = Math.max(capacityStep, Math.ceil(needed / capacityStep) * capacityStep);
    if (mesh) {
      group.remove(mesh);
      mesh.dispose();
    }
    capacity = nextCapacity;
    mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = "ObjectShadowBlobs";
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = Number(config.renderOrder) || 3;
    group.add(mesh);
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  function rebuild() {
    dirty = false;
    ensureCapacity(order.length || 1);
    let index = 0;
    for (const id of order) {
      const entry = entries.get(id);
      if (!entry || index >= capacity) continue;
      const size = Math.min(maxRadius, entry.radius * radiusScale) * 2;
      position.set(entry.x, getGroundHeight(entry.x, entry.z) + lift, entry.z);
      scale.set(size, 1, size);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      index += 1;
    }
    // Unused slots collapse to zero rather than sitting at the origin as a
    // black disc under the farm.
    scale.set(0, 0, 0);
    position.set(0, -1000, 0);
    matrix.compose(position, quaternion, scale);
    for (let i = index; i < capacity; i += 1) mesh.setMatrixAt(i, matrix);
    mesh.count = capacity;
    mesh.instanceMatrix.needsUpdate = true;
  }

  scene.add(group);

  return {
    enabled: true,
    group,
    get count() { return entries.size; },
    set(id, { x, z, radius }) {
      if (!Number.isFinite(x) || !Number.isFinite(z) || !(radius > 0)) return;
      if (!entries.has(id)) order.push(id);
      entries.set(id, { x, z, radius });
      dirty = true;
    },
    remove(id) {
      if (!entries.delete(id)) return;
      const at = order.indexOf(id);
      if (at >= 0) order.splice(at, 1);
      dirty = true;
    },
    clear() {
      entries.clear();
      order.length = 0;
      dirty = true;
    },
    /** Call after sculpting: every blob sits on ground that may have moved. */
    invalidate() {
      dirty = true;
    },
    setFollowPoint(x, z) {
      followPoint.set(x, z);
    },
    setShadowBounds(bounds) {
      const size = Math.max(1, Number(bounds) || shadowBounds);
      uniforms.uBlobFadeStart.value = size * 0.62;
      uniforms.uBlobFadeEnd.value = size * 1.05;
    },
    setOpacity(value) {
      material.opacity = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
      group.visible = material.opacity > 0.01;
    },
    refresh() {
      if (dirty) rebuild();
    },
    dispose() {
      if (mesh) {
        group.remove(mesh);
        mesh.dispose();
      }
      geometry.dispose();
      material.dispose();
      texture.dispose();
      scene.remove(group);
    },
  };
}
