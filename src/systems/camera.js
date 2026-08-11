import * as THREE from "three";

export function createCameraController(camera, config, surface) {
  const baseLength = config.baseOffset.length();
  const initialYaw = Math.atan2(config.baseOffset.x, config.baseOffset.z);
  const initialPitch = Math.asin(config.baseOffset.y / baseLength);

  let zoom = 1;
  let yaw = initialYaw;
  let pitch = initialPitch;

  let orbitPointer = null;
  let lastX = 0;
  let lastY = 0;

  let pinchStart = null;
  let pinchZoom = 1;

  const followTarget = new THREE.Vector3();
  const desiredFollow = new THREE.Vector3();
  const deltaToTarget = new THREE.Vector3();
  let followReady = false;

  function setZoom(value) {
    zoom = THREE.MathUtils.clamp(value, config.minZoom, config.maxZoom);
  }

  function reset() {
    zoom = 1;
    yaw = initialYaw;
    pitch = initialPitch;
    followReady = false;
  }

  function currentOffset() {
    const distance = baseLength * zoom;
    const horizontal = Math.cos(pitch) * distance;
    return new THREE.Vector3(
      Math.sin(yaw) * horizontal,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * horizontal
    );
  }

  function updateFollow(target, delta) {
    if (!followReady) {
      followTarget.copy(target);
      followReady = true;
      return;
    }

    deltaToTarget.copy(target).sub(followTarget);
    deltaToTarget.y = 0;
    const distance = deltaToTarget.length();

    if (distance > config.followDeadZone) {
      desiredFollow.copy(target);
      desiredFollow.addScaledVector(
        deltaToTarget,
        -config.followDeadZone / distance
      );

      const followAlpha = 1 - Math.exp(-config.followSharpness * delta);
      followTarget.lerp(desiredFollow, followAlpha);
    }

    followTarget.y = target.y;
  }

  document.querySelector("#zin").onclick = () => setZoom(zoom - config.zoomStep);
  document.querySelector("#zout").onclick = () => setZoom(zoom + config.zoomStep);
  document.querySelector("#camera-reset").onclick = reset;

  surface.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" && event.isPrimary === false) return;
    orbitPointer = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    surface.setPointerCapture?.(orbitPointer);
  });

  surface.addEventListener("pointermove", (event) => {
    if (event.pointerId !== orbitPointer || pinchStart) return;

    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    yaw -= dx * config.orbitSensitivity;
    pitch = THREE.MathUtils.clamp(
      pitch + dy * config.pitchSensitivity,
      config.minPitch,
      config.maxPitch
    );
  });

  function endOrbit(event) {
    if (event.pointerId === orbitPointer) orbitPointer = null;
  }

  surface.addEventListener("pointerup", endOrbit);
  surface.addEventListener("pointercancel", endOrbit);

  surface.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 2) return;
    pinchStart = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY
    );
    pinchZoom = zoom;
    orbitPointer = null;
  }, { passive: false });

  surface.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 2 || !pinchStart) return;
    event.preventDefault();
    const distance = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY
    );
    setZoom(pinchZoom * (pinchStart / distance));
  }, { passive: false });

  surface.addEventListener("touchend", (event) => {
    if (event.touches.length < 2) pinchStart = null;
  });

  return {
    reset,
    update(target, delta) {
      updateFollow(target, delta);
      const offset = currentOffset();
      const desiredPosition = followTarget.clone().add(offset);
      const positionAlpha = 1 - Math.exp(-config.positionSharpness * delta);
      camera.position.lerp(desiredPosition, positionAlpha);
      camera.lookAt(followTarget);
    },
  };
}
