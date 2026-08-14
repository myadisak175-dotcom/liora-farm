import * as THREE from "three";

export function createMovementSystem(
  camera,
  config,
  getGroundHeight = () => 0,
  getColliders = () => []
) {
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const moveDirection = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);

  function getCameraRelativeDirection(input) {
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();
    cameraRight.crossVectors(cameraForward, worldUp).normalize();
    moveDirection.set(0, 0, 0);
    moveDirection.addScaledVector(cameraRight, input.x);
    moveDirection.addScaledVector(cameraForward, -input.z);
    if (moveDirection.lengthSq() > 0.0001) moveDirection.normalize();
    return moveDirection;
  }

  function rotateToward(root, direction, delta) {
    const targetAngle = Math.atan2(direction.x, direction.z);
    const difference = Math.atan2(
      Math.sin(targetAngle - root.rotation.y),
      Math.cos(targetAngle - root.rotation.y)
    );
    root.rotation.y += difference * Math.min(1, 10 * delta);
  }

  function clampToWorld(root) {
    root.position.x = THREE.MathUtils.clamp(root.position.x, -config.worldLimit, config.worldLimit);
    root.position.z = THREE.MathUtils.clamp(root.position.z, -config.worldLimit, config.worldLimit);
  }

  function resolveCollisions(root) {
    const colliders = getColliders();
    if (!colliders.length) return;
    const playerRadius = config.playerRadius ?? 0.3;
    for (let pass = 0; pass < 2; pass += 1) {
      let moved = false;
      for (const collider of colliders) {
        const minDistance = collider.radius + playerRadius;
        let dx = root.position.x - collider.x;
        let dz = root.position.z - collider.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= minDistance) continue;
        if (distance < 1e-4) {
          dx = 1;
          dz = 0;
        }
        const length = Math.hypot(dx, dz) || 1;
        root.position.x = collider.x + (dx / length) * minDistance;
        root.position.z = collider.z + (dz / length) * minDistance;
        moved = true;
      }
      if (!moved) break;
    }
  }

  function snapToTerrain(root) {
    root.position.y = getGroundHeight(root.position.x, root.position.z);
  }

  function waterDepthAt(x, z) {
    const level = Number(config.water?.level);
    if (!Number.isFinite(level)) return 0;
    return Math.max(0, level - getGroundHeight(x, z));
  }

  function groundSlope(x, z) {
    const step = 0.5;
    const dx = (getGroundHeight(x + step, z) - getGroundHeight(x - step, z)) / (2 * step);
    const dz = (getGroundHeight(x, z + step) - getGroundHeight(x, z - step)) / (2 * step);
    return Math.hypot(dx, dz);
  }

  function walkable(fromX, fromZ, toX, toZ) {
    const maxWadeDepth = config.water?.player?.maxWadeDepth;
    if (Number.isFinite(maxWadeDepth) && waterDepthAt(toX, toZ) > maxWadeDepth) return false;

    const limit = config.maxWalkSlope;
    if (!Number.isFinite(limit)) return true;
    if (groundSlope(toX, toZ) > limit) return false;
    const run = Math.hypot(toX - fromX, toZ - fromZ);
    if (run < 1e-5) return true;
    const rise = getGroundHeight(toX, toZ) - getGroundHeight(fromX, fromZ);
    return Math.abs(rise) / run <= limit;
  }

  function resolveWalkability(root, fromX, fromZ) {
    const { x, z } = root.position;
    if (walkable(fromX, fromZ, x, z)) return;
    if (walkable(fromX, fromZ, x, fromZ)) {
      root.position.z = fromZ;
      return;
    }
    if (walkable(fromX, fromZ, fromX, z)) {
      root.position.x = fromX;
      return;
    }
    root.position.x = fromX;
    root.position.z = fromZ;
  }

  function waterSpeedMultiplier(depth) {
    const water = config.water?.player;
    if (!water || depth <= (water.slowStart ?? 0.08)) return 1;
    const maxDepth = Math.max(water.slowStart ?? 0.08, water.maxWadeDepth ?? 0.9);
    const t = THREE.MathUtils.clamp((depth - (water.slowStart ?? 0.08)) / (maxDepth - (water.slowStart ?? 0.08)), 0, 1);
    return THREE.MathUtils.lerp(1, water.minSpeedMultiplier ?? 0.45, t);
  }

  return {
    waterDepthAt,
    update({ player, input, delta }) {
      if (!player) {
        moveDirection.set(0, 0, 0);
        return { moving: false, running: false, direction: moveDirection, waterDepth: 0 };
      }

      const currentDepth = waterDepthAt(player.root.position.x, player.root.position.z);
      if (player.isSpecial() || input.m <= 0.05) {
        moveDirection.set(0, 0, 0);
        snapToTerrain(player.root);
        return { moving: false, running: false, direction: moveDirection, waterDepth: currentDepth };
      }

      const runDepthLimit = config.water?.player?.runDepth ?? 0.16;
      const running = input.m > config.runThreshold && currentDepth <= runDepthLimit;
      const baseSpeed = running ? config.runSpeed : config.walkSpeed;
      const speed = baseSpeed * waterSpeedMultiplier(currentDepth);
      const direction = getCameraRelativeDirection(input);
      const fromX = player.root.position.x;
      const fromZ = player.root.position.z;

      player.root.position.addScaledVector(direction, speed * delta);
      rotateToward(player.root, direction, delta);
      resolveCollisions(player.root);
      clampToWorld(player.root);
      resolveWalkability(player.root, fromX, fromZ);
      snapToTerrain(player.root);

      return {
        moving: true,
        running,
        direction,
        waterDepth: waterDepthAt(player.root.position.x, player.root.position.z),
      };
    },
  };
}
