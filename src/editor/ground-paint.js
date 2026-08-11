import * as THREE from "three";

const STORAGE_KEY = "liora-hybrid-ground-paint-v1";
const TILE_SIZE = 0.8;
const LIFT = 0.018;

export function createGroundPaint({ scene, camera, renderer, orbit, mount = document.body } = {}) {
  if (!scene || !camera || !renderer || !orbit || !mount) {
    throw new Error("createGroundPaint requires scene, camera, renderer, orbit and mount");
  }

  const tiles = new Map();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const textureLoader = new THREE.TextureLoader();
  let mode = "off";
  let brushSize = 1;
  let pointerId = null;
  let lastKey = null;
  let saveTimer = null;

  function loadTexture(url) {
    const texture = textureLoader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  const materials = {
    dirt: new THREE.MeshStandardMaterial({ map: loadTexture("../assets/textures/dirt.webp"), roughness: 1, metalness: 0 }),
    sand: new THREE.MeshStandardMaterial({ map: loadTexture("../assets/textures/sand.webp"), roughness: 1, metalness: 0 }),
    rock: new THREE.MeshStandardMaterial({ map: loadTexture("../assets/textures/rock.webp"), roughness: 1, metalness: 0 }),
  };

  const style = document.createElement("style");
  style.textContent = `
    #ground-paint-ui{position:fixed;z-index:35;left:12px;top:calc(env(safe-area-inset-top) + 12px);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#f2efe4;pointer-events:none}
    #ground-paint-ui>*{pointer-events:auto}
    #ground-paint-toggle{border:1px solid #3d5648;background:#1b2b23f2;color:#f2efe4;border-radius:999px;padding:10px 14px;font-weight:800;font-size:12px;backdrop-filter:blur(8px)}
    #ground-paint-panel{display:none;margin-top:8px;width:min(92vw,330px);background:#1b2b23f2;border:1px solid #3d5648;border-radius:16px;padding:10px;box-shadow:0 8px 24px #0004;backdrop-filter:blur(10px)}
    #ground-paint-panel.open{display:block}
    #ground-paint-modes{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
    .ground-mode{border:1px solid #3d5648;background:#101a16;color:#f2efe4;border-radius:12px;padding:8px 3px;font-size:10px;font-weight:800;min-height:52px}
    .ground-mode span{display:block;font-size:20px;line-height:1.1;margin-bottom:3px}
    .ground-mode.active{border-color:#e8a33d;color:#e8a33d}
    #ground-paint-brush{margin-top:8px;width:100%;border:1px solid #3d5648;background:#101a16;color:#f2efe4;border-radius:12px;padding:9px;font-weight:800}
    #ground-paint-hint{margin-top:7px;font-size:10px;opacity:.72;text-align:center}
  `;
  document.head.appendChild(style);

  const ui = document.createElement("div");
  ui.id = "ground-paint-ui";
  ui.innerHTML = `
    <button id="ground-paint-toggle" type="button">🎨 พื้น</button>
    <div id="ground-paint-panel">
      <div id="ground-paint-modes">
        <button class="ground-mode" data-mode="grass" type="button"><span>🌿</span>หญ้า</button>
        <button class="ground-mode" data-mode="dirt" type="button"><span>🟫</span>ดิน</button>
        <button class="ground-mode" data-mode="sand" type="button"><span>🏖️</span>ทราย</button>
        <button class="ground-mode" data-mode="rock" type="button"><span>🪨</span>หิน</button>
        <button class="ground-mode" data-mode="erase" type="button"><span>🧹</span>ลบ</button>
      </div>
      <button id="ground-paint-brush" type="button">Brush 1×1</button>
      <div id="ground-paint-hint">เลือกชนิดพื้น แล้วลากนิ้วบนพื้น • กดชนิดเดิมอีกครั้งเพื่อปิด</div>
    </div>
  `;
  mount.appendChild(ui);

  const toggle = ui.querySelector("#ground-paint-toggle");
  const panel = ui.querySelector("#ground-paint-panel");
  const brush = ui.querySelector("#ground-paint-brush");
  const modeButtons = [...ui.querySelectorAll(".ground-mode")];

  function key(ix, iz) { return `${ix},${iz}`; }

  function tileGeometry(ix, iz) {
    const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(ix * TILE_SIZE, LIFT, iz * TILE_SIZE);
    return geometry;
  }

  function removeTile(ix, iz) {
    const k = key(ix, iz);
    const mesh = tiles.get(k);
    if (!mesh) return false;
    scene.remove(mesh);
    mesh.geometry.dispose();
    tiles.delete(k);
    return true;
  }

  function setTile(ix, iz, type) {
    if (type === "grass" || type === "erase") {
      removeTile(ix, iz);
      return;
    }
    if (!materials[type]) return;
    removeTile(ix, iz);
    const mesh = new THREE.Mesh(tileGeometry(ix, iz), materials[type]);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    mesh.userData.groundPaint = true;
    mesh.userData.groundType = type;
    mesh.userData.ix = ix;
    mesh.userData.iz = iz;
    scene.add(mesh);
    tiles.set(key(ix, iz), mesh);
  }

  function serialize() {
    return [...tiles.values()].map((mesh) => ({
      type: mesh.userData.groundType,
      ix: mesh.userData.ix,
      iz: mesh.userData.iz,
    }));
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 120);
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return;
      for (const item of data) {
        if (!Number.isFinite(item?.ix) || !Number.isFinite(item?.iz)) continue;
        if (!materials[item.type]) continue;
        setTile(item.ix, item.iz, item.type);
      }
    } catch (error) {
      console.warn("Ground paint load failed", error);
    }
  }

  function updateUI() {
    for (const button of modeButtons) button.classList.toggle("active", button.dataset.mode === mode);
    brush.textContent = `Brush ${brushSize}×${brushSize}`;
    toggle.textContent = mode === "off" ? "🎨 พื้น" : `🎨 ${mode === "grass" ? "หญ้า" : mode === "dirt" ? "ดิน" : mode === "sand" ? "ทราย" : mode === "rock" ? "หิน" : "ลบ"}`;
  }

  function setMode(nextMode) {
    mode = mode === nextMode ? "off" : nextMode;
    pointerId = null;
    lastKey = null;
    orbit.enabled = mode === "off";
    updateUI();
  }

  function screenToGround(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  function paintAt(x, z) {
    const cx = Math.round(x / TILE_SIZE);
    const cz = Math.round(z / TILE_SIZE);
    const radius = Math.max(0, brushSize - 1);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        setTile(cx + dx, cz + dz, mode);
      }
    }
    scheduleSave();
  }

  function onPointerDown(event) {
    if (mode === "off") return;
    const point = screenToGround(event);
    if (!point) return;
    pointerId = event.pointerId;
    paintAt(point.x, point.z);
    lastKey = `${Math.round(point.x / TILE_SIZE)},${Math.round(point.z / TILE_SIZE)}`;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onPointerMove(event) {
    if (mode === "off" || pointerId !== event.pointerId) return;
    const point = screenToGround(event);
    if (!point) return;
    const k = `${Math.round(point.x / TILE_SIZE)},${Math.round(point.z / TILE_SIZE)}`;
    if (k === lastKey) return;
    paintAt(point.x, point.z);
    lastKey = k;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onPointerUp(event) {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    lastKey = null;
    scheduleSave();
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  toggle.onclick = () => panel.classList.toggle("open");
  for (const button of modeButtons) button.onclick = () => setMode(button.dataset.mode);
  brush.onclick = () => {
    brushSize = brushSize % 3 + 1;
    updateUI();
  };

  renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
  renderer.domElement.addEventListener("pointermove", onPointerMove, true);
  renderer.domElement.addEventListener("pointerup", onPointerUp, true);
  renderer.domElement.addEventListener("pointercancel", onPointerUp, true);

  load();
  updateUI();

  return {
    get mode() { return mode; },
    setMode,
    save,
    clear() {
      for (const mesh of tiles.values()) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      tiles.clear();
      localStorage.removeItem(STORAGE_KEY);
    },
    dispose() {
      clearTimeout(saveTimer);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
      renderer.domElement.removeEventListener("pointermove", onPointerMove, true);
      renderer.domElement.removeEventListener("pointerup", onPointerUp, true);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp, true);
      orbit.enabled = true;
      ui.remove();
      style.remove();
      for (const material of Object.values(materials)) {
        material.map?.dispose?.();
        material.dispose();
      }
    },
  };
}
