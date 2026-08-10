import * as THREE from "three";

export function createMovementSystem(camera, config) {
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

  return {
    update({ player, input, delta }) {
      if (!player || player.isSpecial() || input.m <= 0.05) {
        moveDirection.set(0, 0, 0);
        return { moving: false, running: false, direction: moveDirection };
      }

      const running = input.m > config.runThreshold;
      const speed = running ? config.runSpeed : config.walkSpeed;
      const direction = getCameraRelativeDirection(input);

      player.root.position.addScaledVector(direction, speed * delta);
      rotateToward(player.root, direction, delta);
      clampToWorld(player.root);

      return { moving: true, running, direction };
    },
  };
}
