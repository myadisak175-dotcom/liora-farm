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

  /** Steepness of the ground itself at a point, by central difference. */
  function groundSlope(x, z) {
    const step = 0.5;
    const dx =
      (getGroundHeight(x + step, z) - getGroundHeight(x - step, z)) / (2 * step);
    const dz =
      (getGroundHeight(x, z + step) - getGroundHeight(x, z - step)) / (2 * step);
    return Math.hypot(dx, dz);
  }

  /**
   * Two rules, both needed:
   *   - the destination must not be ground too steep to stand on, otherwise a
   *     wall can be zigzagged up diagonally (a diagonal path across a 45° face
   *     measures as only 35°, which is technically true and reads as cheating);
   *   - the step itself must not be a cliff, which catches ledges between two
   *     otherwise flat areas.
   * Both are symmetric — free descent would turn a sculpted pit into a trap you
   * can drop into but never climb out of.
   */
  function walkable(fromX, fromZ, toX, toZ) {
    const limit = config.maxWalkSlope;
    if (!Number.isFinite(limit)) return true;
    if (groundSlope(toX, toZ) > limit) return false;
    const run = Math.hypot(toX - fromX, toZ - fromZ);
    if (run < 1e-5) return true;
    const rise = getGroundHeight(toX, toZ) - getGroundHeight(fromX, fromZ);
    return Math.abs(rise) / run <= limit;
  }

  /**
   * Too steep head-on? Try each axis on its own, which reads as sliding along
   * the contour instead of sticking to the hillside.
   */
  function resolveSlope(root, fromX, fromZ) {
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

      const fromX = player.root.position.x;
      const fromZ = player.root.position.z;

      player.root.position.addScaledVector(direction, speed * delta);
      rotateToward(player.root, direction, delta);
      resolveCollisions(player.root);
      clampToWorld(player.root);
      resolveSlope(player.root, fromX, fromZ);
      snapToTerrain(player.root);

      return { moving: true, running, direction };
    },
  };
}
