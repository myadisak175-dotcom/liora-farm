import * as THREE from "three";

export function createBrushCursor({ scene, getGroundHeight, config }) {
  const segments = config.segments;
  const positions = new Float32Array((segments + 1) * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: config.color,
    transparent: true,
    opacity: config.opacity,
    depthTest: false,
  });

  const ring = new THREE.Line(geometry, material);
  ring.name = "BrushCursor";
  ring.renderOrder = config.renderOrder;
  ring.frustumCulled = false;
  ring.visible = false;
  scene.add(ring);

  let radius = 1;
  let x = 0;
  let z = 0;

  function rebuild() {
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      positions[i * 3] = px;
      positions[i * 3 + 1] = getGroundHeight(px, pz) + config.lift;
      positions[i * 3 + 2] = pz;
    }
    geometry.getAttribute("position").needsUpdate = true;
    geometry.computeBoundingSphere();
  }

  function setState(state) {
    if (state === true) state = "blocked";
    if (state === false || !state) state = "normal";
    if (state === "normal" && Number.isFinite(config.waterLevel) && getGroundHeight(x, z) <= config.waterLevel) state = "water";
    const color =
      state === "blocked"
        ? config.blockedColor
        : state === "water"
          ? config.waterColor
          : config.color;
    material.color.set(color);
  }

  return {
    ring,
    show(nextX, nextZ, nextRadius, state = "normal") {
      x = nextX;
      z = nextZ;
      radius = Math.max(0.05, nextRadius);
      setState(state);
      ring.visible = true;
      rebuild();
    },
    resize(nextRadius) {
      if (!ring.visible) return;
      radius = Math.max(0.05, nextRadius);
      rebuild();
    },
    refresh() {
      if (ring.visible) rebuild();
    },
    hide() {
      ring.visible = false;
    },
    dispose() {
      scene.remove(ring);
      geometry.dispose();
      material.dispose();
    },
  };
}
