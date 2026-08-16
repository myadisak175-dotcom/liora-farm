import * as THREE from "three";

function createShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 27);
  gradient.addColorStop(0, "rgba(0,0,0,0.78)");
  gradient.addColorStop(0.32, "rgba(0,0,0,0.46)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeShadowMesh(texture, width, depth, opacity, y, renderOrder) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    material
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  return mesh;
}

function waterVisibility(depth, interaction = {}) {
  const start = Number(interaction.shadowFadeStart ?? 0.04);
  const end = Math.max(start + 0.01, Number(interaction.shadowFadeEnd ?? 0.28));
  const t = THREE.MathUtils.clamp((Math.max(0, depth) - start) / (end - start), 0, 1);
  return 1 - t;
}

export function createContactShadow(scene, config) {
  const texture = createShadowTexture();

  const body = makeShadowMesh(
    texture,
    config.width,
    config.depth,
    config.opacity,
    config.y,
    config.renderOrder
  );

  const leftFoot = makeShadowMesh(
    texture,
    config.footWidth,
    config.footDepth,
    config.footOpacity,
    config.footY,
    config.renderOrder + 1
  );

  const rightFoot = makeShadowMesh(
    texture,
    config.footWidth,
    config.footDepth,
    config.footOpacity,
    config.footY,
    config.renderOrder + 1
  );

  scene.add(body, leftFoot, rightFoot);

  return {
    update(position, rotationY = 0, hour = 12, waterState = {}) {
      const night = hour >= 19 || hour < 6;
      const groundY = position.y;
      const waterFade = waterVisibility(
        Number(waterState.depth) || 0,
        waterState.interaction
      );

      body.position.set(position.x, groundY + config.y, position.z);
      body.material.opacity = (night ? config.nightOpacity : config.opacity) * waterFade;

      const forwardX = Math.sin(rotationY);
      const forwardZ = Math.cos(rotationY);
      const sideX = Math.cos(rotationY);
      const sideZ = -Math.sin(rotationY);

      leftFoot.position.set(
        position.x - sideX * config.footSide + forwardX * config.footForward,
        groundY + config.footY,
        position.z - sideZ * config.footSide + forwardZ * config.footForward
      );

      rightFoot.position.set(
        position.x + sideX * config.footSide + forwardX * config.footForward,
        groundY + config.footY,
        position.z + sideZ * config.footSide + forwardZ * config.footForward
      );

      const footOpacity = night
        ? config.footNightOpacity
        : config.footOpacity;
      leftFoot.material.opacity = footOpacity * waterFade;
      rightFoot.material.opacity = footOpacity * waterFade;
    },
    body,
    leftFoot,
    rightFoot,
  };
}
