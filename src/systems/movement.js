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
    root.position.x = THREE.MathUtils.clamp(
      root.position.x,
      -config.worldLimit,
      config.worldLimit
    );
    root.position.z = THREE.MathUtils.clamp(
      root.position.z,
      -config.worldLimit,
      config.worldLimit
    );
  }

  /**
   * Placed objects used to be pure decoration — Liora walked straight through
   * houses. Each solid object is a circle; overlapping just pushes her back out
   * along the normal, which reads as sliding along the wall rather than
   * stopping dead.
   */
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

  return {
    update({ player, input, delta }) {
      if (!player) {
        moveDirection.set(0, 0, 0);
        return { moving: false, running: false, direction: moveDirection };
      }

      if (player.isSpecial() || input.m <= 0.05) {
        moveDirection.set(0, 0, 0);
        snapToTerrain(player.root);
        return { moving: false, running: false, direction: moveDirection };
      }

      const running = input.m > config.runThreshold;
      const speed = running ? config.runSpeed : config.walkSpeed;
      const direction = getCameraRelativeDirection(input);

      player.root.position.addScaledVector(direction, speed * delta);
      rotateToward(player.root, direction, delta);
      resolveCollisions(player.root);
      clampToWorld(player.root);
      snapToTerrain(player.root);

      return { moving: true, running, direction };
    },
  };
}
