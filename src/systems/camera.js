import * as THREE from "three";

export function createCameraController(camera, config) {
  let zoom = 1;
  let pinchStart = null;
  let pinchZoom = 1;

  function setZoom(value) {
    zoom = THREE.MathUtils.clamp(value, config.minZoom, config.maxZoom);
  }

  document.querySelector("#zin").onclick = () => setZoom(zoom - config.zoomStep);
  document.querySelector("#zout").onclick = () => setZoom(zoom + config.zoomStep);

  addEventListener("touchstart", (event) => {
    if (event.touches.length !== 2) return;
    pinchStart = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY
    );
    pinchZoom = zoom;
  }, { passive: false });

  addEventListener("touchmove", (event) => {
    if (event.touches.length !== 2 || !pinchStart) return;
    event.preventDefault();
    const distance = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY
    );
    setZoom(pinchZoom * (pinchStart / distance));
  }, { passive: false });

  addEventListener("touchend", (event) => {
    if (event.touches.length < 2) pinchStart = null;
  });

  return {
    update(target, delta) {
      const offset = config.baseOffset.clone().multiplyScalar(zoom);
      camera.position.lerp(
        target.clone().add(offset),
        1 - Math.pow(0.002, delta)
      );
      camera.lookAt(target);
    },
  };
}
