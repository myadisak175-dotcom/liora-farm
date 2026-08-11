import * as THREE from "three";

// Best-of ground paint:
// - interaction model from Builder v6.17-v6.19 (paint while playing/building)
// - real project textures for all four ground types
// - current Hybrid/Live Build API
const STORAGE_KEY = "liora-bestof-play-ground-v1";
const TILE_SIZE = 0.8;
const LIFT = 0.024;

const LABELS = {
  grass: "หญ้า",
  dirt: "ดิน",
  sand: "ทราย",
  rock: "หิน",
  erase: "ลบ",
};

export function createGroundPaint({ scene, camera, renderer, orbit, mount = document.body } = {}) {
  if (!scene || !camera || !renderer || !orbit || !mount) {
    throw new Error("createGroundPaint requires scene, camera, renderer, orbit and mount");
  }

  const textureLoader = new THREE.TextureLoader();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const tiles = new Map();
  let mode = "off";
  let brushSize = 1;
  let pointerId = null;
  let lastKey = null;
  let saveTimer = null;

  function makeMaterial(url) {
    const map = textureLoader.load(url);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return new THREE.MeshStandardMaterial({
      map,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }

  const materials = {
    dirt: makeMaterial("../assets/textures/dirt.webp"),
    sand: makeMaterial("../assets/textures/sand.webp"),
    rock: makeMaterial("../assets/textures/rock.webp"),
  };

  const style = document.createElement("style");
  style.textContent = `
    #ground-paint-ui{position:fixed;z-index:35;left:12px;top:calc(env(safe-area-inset-top) + 12px);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#f2efe4;pointer-events:none}
    #ground-paint-ui>*{pointer-events:auto}
    #ground-paint-toggle{border:1px solid #ffffff70;background:#173c4be8;color:#fff;border-radius:999px;padding:10px 14px;font-weight:800;font-size:12px;box-shadow:0 5px 18px #0003;backdrop-filter:blur(8px)}
    #ground-paint-panel{display:none;margin-top:8px;width:min(92vw,360px);background:#1b2b23f2;border:1px solid #ffffff38;border-radius:16px;padding:9px;box-shadow:0 8px 24px #0004;backdrop-filter:blur(10px)}
    #ground-paint-panel.open{display:block}
    #ground-paint-modes{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
    #ground-paint-modes::-webkit-scrollbar{display:none}
    .ground-mode{flex:0 0 62px;border:1px solid #ffffff38;background:#101a16;color:#f2efe4;border-radius:12px;padding:7px 3px;font-size:10px;font-weight:800;min-height:50px}
    .ground-mode span{display:block;font-size:20px;line-height:1.1;margin-bottom:3px}
    .ground-mode.active{outline:2px solid #fff;background:#426153}
    #ground-paint-tools{display:flex;gap:6px;margin-top:7px;overflow-x:auto}
    #ground-paint-tools button{flex:1 0 auto;border:1px solid #ffffff38;background:#29463a;color:#fff;border-radius:11px;padding:9px 10px;font-weight:800;font-size:11px}
    #ground-paint-hint{margin-top:6px;font-size:10px;opacity:.76;text-align:center}
  `;
  document.head.appendChild(style);

  const ui = document.createElement("div");
  ui.id = "ground-paint-ui";
  ui.innerHTML = `
    <button id="ground-paint-toggle" type="button">🎨 Paint</button>
    <div id="ground-paint-panel">
      <div id="ground-paint-modes">
        <button class="ground-mode" data-mode="grass" type="button"><span>🌿</span>หญ้า</button>
        <button class="ground-mode" data-mode="dirt" type="button"><span>🟫</span>ดิน</button>
        <button class="ground-mode" data-mode="sand" type="button"><span>🏖️</span>ทราย</button>
        <button class="ground-mode" data-mode="rock" type="button"><span>🪨</span>หิน</button>
        <button class="ground-mode" data-mode="erase" type="button"><span>🧹</span>ลบ</button>
      </div>
      <div id="ground-paint-tools">
        <button id="ground-brush" type="button">Brush 1×</button>
        <button id="ground-undo" type="button">↶ Undo</button>
        <button id="ground-close" type="button">✓ Done</button>
      </div>
      <div id="ground-paint-hint">แบบ Play Builder เดิม • เลือกพื้นแล้วลากนิ้วระบายได้ทันที</div>
    </div>
  `;
  mount.appendChild(ui);

  const toggle = ui.querySelector("#ground-paint-toggle");
  const panel = ui.querySelector("#ground-paint-panel");
  const brush = ui.querySelector("#ground-brush");
  const undo = ui.querySelector("#ground-undo");
  const close = ui.querySelector("#ground-close");
  const modeButtons = [...ui.querySelectorAll(".ground-mode")];
  const history = [];

  const key = (ix, iz) => `${ix},${iz}`;

  function removeTile(ix, iz, record = true) {
    const k = key(ix, iz);
    const mesh = tiles.get(k);
    if (!mesh) return false;
    if (record) history.push({ type: "restore", ix, iz, groundType: mesh.userData.groundType });
    scene.remove(mesh);
    mesh.geometry.dispose();
    tiles.delete(k);
    return true;
  }

  function setTile(ix, iz, type, record = true) {
    const existing = tiles.get(key(ix, iz));
    if (type === "grass" || type === "erase") {
      removeTile(ix, iz, record);
      return;
    }
    if (!materials[type]) return;
    if (existing?.userData.groundType === type) return;
    if (record) {
      history.push(existing
        ? { type: "restore", ix, iz, groundType: existing.userData.groundType }
        : { type: "remove", ix, iz });
    }
    if (existing) removeTile(ix, iz, false);

    const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, materials[type]);
    mesh.position.set(ix * TILE_SIZE, LIFT, iz * TILE_SIZE);
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
    return [...tiles.values()].map(mesh => ({
      type: mesh.userData.groundType,
      ix: mesh.userData.ix,
      iz: mesh.userData.iz,
    }));
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize())); }
    catch (error) { console.warn("Ground paint save failed", error); }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 120);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return;
      for (const item of data) {
        if (!Number.isFinite(item?.ix) || !Number.isFinite(item?.iz)) continue;
        if (!materials[item.type]) continue;
        setTile(item.ix, item.iz, item.type, false);
      }
      history.length = 0;
    } catch (error) { console.warn("Ground paint load failed", error); }
  }

  function updateUI() {
    for (const button of modeButtons) button.classList.toggle("active", button.dataset.mode === mode);
    brush.textContent = `Brush ${brushSize}×`;
    toggle.textContent = mode === "off" ? "🎨 Paint" : `🎨 ${LABELS[mode] ?? "Paint"}`;
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
        setTile(cx + dx, cz + dz, mode, true);
      }
    }
    scheduleSave();
  }

  function onPointerDown(event) {
    if (mode === "off") return;
    const point = screenToGround(event);
    if (!point) return;
    pointerId = event.pointerId;
    history.push({ type: "stroke" });
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

  function undoStroke() {
    if (!history.length) return;
    const ops = [];
    while (history.length) {
      const op = history.pop();
      if (op.type === "stroke") break;
      ops.push(op);
    }
    for (const op of ops) {
      if (op.type === "remove") removeTile(op.ix, op.iz, false);
      else if (op.type === "restore") setTile(op.ix, op.iz, op.groundType, false);
    }
    save();
  }

  toggle.onclick = () => panel.classList.toggle("open");
  close.onclick = () => { setMode("off"); panel.classList.remove("open"); };
  for (const button of modeButtons) button.onclick = () => setMode(button.dataset.mode);
  brush.onclick = () => { brushSize = brushSize % 3 + 1; updateUI(); };
  undo.onclick = undoStroke;

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
      history.length = 0;
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
