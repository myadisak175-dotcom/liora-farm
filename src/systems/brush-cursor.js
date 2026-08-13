import * as THREE from "three";

/**
 * A ring on the ground showing where the brush will land and how wide it is.
 *
 * Painting and sculpting both had the same problem: the only way to learn what
 * "3.0 ม." meant was to apply it and undo. Worse on a phone, where the finger
 * covers the exact spot being worked on — the ring is visible around the
 * fingertip even when the middle is hidden.
 *
 * It follows the height field, so on a slope it drapes instead of cutting
 * through the hill.
 */
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

  return {
    ring,
    show(nextX, nextZ, nextRadius, blocked = false) {
      x = nextX;
      z = nextZ;
      radius = Math.max(0.05, nextRadius);
      material.color.set(blocked ? config.blockedColor : config.color);
      ring.visible = true;
      rebuild();
    },
    /** Same spot, new size — used while dragging the size slider. */
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
