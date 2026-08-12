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
  let pinchMidX = 0;
  let pinchMidY = 0;
  let orbitEnabled = true;

  const followTarget = new THREE.Vector3();
  const desiredFollow = new THREE.Vector3();
  const deltaToTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  // Build mode moves the view without moving Liora.
  const panOffset = new THREE.Vector3();
  let followReady = false;

  function setZoom(value) {
    zoom = THREE.MathUtils.clamp(value, config.minZoom, config.maxZoom);
  }

  function reset() {
    zoom = 1;
    yaw = initialYaw;
    pitch = initialPitch;
    panOffset.set(0, 0, 0);
  }

  function currentDistance() {
    return baseLength * zoom;
  }

  function currentOffset() {
    const distance = currentDistance();
    const horizontal = Math.cos(pitch) * distance;
    return new THREE.Vector3(
      Math.sin(yaw) * horizontal,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * horizontal
    );
  }

  /**
   * Screen pixels -> ground units at the current zoom, so a drag keeps the
   * same patch of ground under the finger regardless of how far out you are.
   */
  function worldPerPixel() {
    const viewHeight = Math.max(1, innerHeight);
    const fovRadians = THREE.MathUtils.degToRad(config.fov);
    return (2 * currentDistance() * Math.tan(fovRadians / 2)) / viewHeight;
  }

  function pan(dx, dy) {
    const unit = worldPerPixel();
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    // A shallow camera covers more ground per vertical pixel.
    const verticalUnit = unit / Math.max(0.35, Math.sin(pitch));

    panOffset.x -= dx * unit * rightX + dy * verticalUnit * forwardX;
    panOffset.z -= dx * unit * rightZ + dy * verticalUnit * forwardZ;

    const limit = config.panLimit;
    panOffset.x = THREE.MathUtils.clamp(panOffset.x, -limit, limit);
    panOffset.z = THREE.MathUtils.clamp(panOffset.z, -limit, limit);
  }

  function clearPan() {
    panOffset.set(0, 0, 0);
  }

  /** Where the camera is currently looking, on the ground plane. */
  function getFocus() {
    return {
      x: followTarget.x + panOffset.x,
      z: followTarget.z + panOffset.z,
    };
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
    if (!orbitEnabled) return;
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

  function touchMid(event) {
    return {
      x: (event.touches[0].clientX + event.touches[1].clientX) / 2,
      y: (event.touches[0].clientY + event.touches[1].clientY) / 2,
    };
  }

  surface.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 2) return;
    pinchStart = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY
    );
    pinchZoom = zoom;
    const mid = touchMid(event);
    pinchMidX = mid.x;
    pinchMidY = mid.y;
    orbitPointer = null;
  }, { passive: false });

  // Two fingers: spread to zoom, swivel to rotate. This is the only way to
  // turn the camera in build mode, where one finger belongs to the builder.
  surface.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 2 || !pinchStart) return;
    event.preventDefault();
    const distance = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY
    );
    setZoom(pinchZoom * (pinchStart / distance));

    const mid = touchMid(event);
    yaw -= (mid.x - pinchMidX) * config.twoFingerRotateSensitivity;
    pitch = THREE.MathUtils.clamp(
      pitch + (mid.y - pinchMidY) * config.twoFingerRotateSensitivity * 0.75,
      config.minPitch,
      config.maxPitch
    );
    pinchMidX = mid.x;
    pinchMidY = mid.y;
  }, { passive: false });

  surface.addEventListener("touchend", (event) => {
    if (event.touches.length < 2) pinchStart = null;
  });

  return {
    reset,
    pan,
    clearPan,
    getFocus,
    // Build mode takes over one-finger drags; two fingers stay with the camera.
    setOrbitEnabled(value) {
      orbitEnabled = Boolean(value);
      if (!orbitEnabled) orbitPointer = null;
    },
    update(target, delta) {
      updateFollow(target, delta);
      lookTarget.copy(followTarget).add(panOffset);
      const offset = currentOffset();
      const desiredPosition = lookTarget.clone().add(offset);
      const positionAlpha = 1 - Math.exp(-config.positionSharpness * delta);
      camera.position.lerp(desiredPosition, positionAlpha);
      camera.lookAt(lookTarget);
    },
  };
}
