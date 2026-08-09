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

  function setZoom(value) {
    zoom = THREE.MathUtils.clamp(value, config.minZoom, config.maxZoom);
  }

  function reset() {
    zoom = 1;
    yaw = initialYaw;
    pitch = initialPitch;
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
      const offset = currentOffset();
      camera.position.lerp(
        target.clone().add(offset),
        1 - Math.pow(0.002, delta)
      );
      camera.lookAt(target);
    },
  };
}
