import * as THREE from "three";

export function createContactShadow(scene, config) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, "rgba(0,0,0,0.58)");
  gradient.addColorStop(0.45, "rgba(0,0,0,0.34)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: config.opacity,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(config.width, config.depth),
    material
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = config.y;
  mesh.renderOrder = config.renderOrder;
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    update(position, hour = 12) {
      mesh.position.x = position.x;
      mesh.position.z = position.z;
      const night = hour >= 19 || hour < 6;
      material.opacity = night ? config.nightOpacity : config.opacity;
    },
    mesh,
  };
}
