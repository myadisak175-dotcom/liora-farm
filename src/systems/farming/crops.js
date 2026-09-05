import * as THREE from "three";
import { createLocalStore } from "../local-store.js";
import { SOIL_STATES, CROP_STATES } from "./states.js";
export { SOIL_STATES, CROP_STATES } from "./states.js";

/**
 * Harvest-Moon-style first farm loop:
 * plain -> hoe -> tilled -> water -> watered -> plant -> grow -> harvest.
 *
 * Save schema intentionally stays at v1. Older v1 saves had only crop state;
 * when they load, empty cells become plain soil and planted cells become
 * watered soil so existing crops survive this upgrade instead of being reset.
 */
export function createCrops({ plot, config, onChange = () => {} }) {
  const group = new THREE.Group();
  group.name = "Crops";
  plot.group.add(group);

  plot.group.updateMatrixWorld(true);
  const cells = plot.cells.map((cell, index) => ({
    index,
    local: cell.position.clone(),
    world: plot.group.localToWorld(cell.position.clone()),
    soilState: SOIL_STATES.PLAIN,
    wateredToday: false,
    state: CROP_STATES.EMPTY,
    cropType: null,
    plantedAt: 0,
    view: null,
  }));

  const leafMaterial = new THREE.MeshStandardMaterial({
    color: config.leafColor,
    roughness: 0.85,
    metalness: 0,
  });
  const sproutMaterial = new THREE.MeshStandardMaterial({
    color: config.seedColor,
    roughness: 0.9,
    metalness: 0,
  });
  const rootMaterial = new THREE.MeshStandardMaterial({
    color: config.rootColor,
    roughness: 0.7,
    metalness: 0,
  });

  const leafGeometry = new THREE.ConeGeometry(0.12, 0.3, 6);
  const rootGeometry = new THREE.SphereGeometry(0.13, 10, 8);
  const store = createLocalStore({ key: config.storageKey, version: 1 });

  let pouch = 0;

  function makeCropView(cell) {
    const view = new THREE.Group();
    view.position.copy(cell.local);

    const root = new THREE.Mesh(rootGeometry, rootMaterial);
    root.name = "root";
    root.castShadow = true;
    root.scale.setScalar(0.5);
    view.add(root);

    for (let i = 0; i < 3; i += 1) {
      const leaf = new THREE.Mesh(leafGeometry, i === 0 ? leafMaterial : sproutMaterial);
      leaf.name = "leaf";
      leaf.castShadow = true;
      const angle = (i / 3) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 0.07, 0.14, Math.sin(angle) * 0.07);
      leaf.rotation.z = Math.cos(angle) * 0.25;
      leaf.rotation.x = -Math.sin(angle) * 0.25;
      view.add(leaf);
    }

    group.add(view);
    return view;
  }

  function progressOf(cell) {
    if (cell.state === CROP_STATES.EMPTY) return 0;
    if (cell.state === CROP_STATES.RIPE) return 1;
    const seconds = (Date.now() - cell.plantedAt) / 1000;
    return THREE.MathUtils.clamp(seconds / config.growSeconds, 0, 1);
  }

  function applySoilView(cell) {
    plot.setSoilState?.(cell.index, cell.soilState);
  }

  function applyCropView(cell) {
    if (cell.state === CROP_STATES.EMPTY) {
      if (cell.view) {
        group.remove(cell.view);
        cell.view = null;
      }
      return;
    }
    if (!cell.view) cell.view = makeCropView(cell);

    const progress = progressOf(cell);
    const eased = 0.25 + 0.75 * progress;
    const height = THREE.MathUtils.lerp(config.sproutHeight, config.ripeHeight, progress);
    cell.view.scale.set(eased, height / config.ripeHeight, eased);

    const ripe = cell.state === CROP_STATES.RIPE;
    for (const child of cell.view.children) {
      if (child.name === "root") child.visible = ripe;
      if (child.name === "leaf") child.material = ripe ? leafMaterial : sproutMaterial;
    }
  }

  function refreshRipeness() {
    let changed = false;
    for (const cell of cells) {
      if (cell.state !== CROP_STATES.GROWING) continue;
      if (progressOf(cell) >= 1) {
        cell.state = CROP_STATES.RIPE;
        changed = true;
      }
      applyCropView(cell);
    }
    return changed;
  }

  function serialize() {
    return {
      version: 1,
      pouch,
      cells: cells.map((cell) => ({
        i: cell.index,
        s: cell.state,
        t: cell.plantedAt,
        o: cell.soilState,
        w: cell.wateredToday,
        c: cell.cropType,
      })),
    };
  }

  function save() {
    store.save(serialize());
  }

  function load() {
    const data = store.load();
    if (!data) {
      for (const cell of cells) applySoilView(cell);
      return;
    }
    if (!Array.isArray(data.cells)) {
      store.rejectLoaded("malformed");
      return;
    }

    pouch = Number.isFinite(data.pouch) ? data.pouch : 0;
    for (const entry of data.cells) {
      const cell = cells[entry.i];
      if (!cell) continue;
      if (!Object.values(CROP_STATES).includes(entry.s)) continue;

      cell.state = entry.s;
      cell.plantedAt = Number(entry.t) || 0;
      cell.cropType = typeof entry.c === "string"
        ? entry.c
        : cell.state === CROP_STATES.EMPTY ? null : "radish";

      const savedSoil = Object.values(SOIL_STATES).includes(entry.o) ? entry.o : null;
      cell.soilState = savedSoil ?? (
        cell.state === CROP_STATES.EMPTY ? SOIL_STATES.PLAIN : SOIL_STATES.WATERED
      );
      cell.wateredToday = typeof entry.w === "boolean"
        ? entry.w
        : cell.soilState === SOIL_STATES.WATERED;

      applySoilView(cell);
      applyCropView(cell);
    }
    refreshRipeness();
  }

  /** Nearest cell within arm's reach, or null. */
  function getTarget(position) {
    let best = null;
    let bestDistance = config.reach;
    for (const cell of cells) {
      const distance = Math.hypot(
        position.x - cell.world.x,
        position.z - cell.world.z
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = cell;
      }
    }
    if (!best) return null;
    return {
      index: best.index,
      state: best.state,
      cropState: best.state,
      soilState: best.soilState,
      cropType: best.cropType,
      wateredToday: best.wateredToday,
      progress: progressOf(best),
    };
  }

  function cellAt(index) {
    return cells[index] ?? null;
  }

  function hoe(index) {
    const cell = cellAt(index);
    if (!cell || cell.state !== CROP_STATES.EMPTY) return false;
    if (cell.soilState !== SOIL_STATES.PLAIN) return false;

    cell.soilState = SOIL_STATES.TILLED;
    cell.wateredToday = false;
    applySoilView(cell);
    save();
    onChange();
    return true;
  }

  function water(index) {
    const cell = cellAt(index);
    if (!cell || cell.soilState === SOIL_STATES.PLAIN) return false;
    if (cell.soilState === SOIL_STATES.WATERED) return false;

    cell.soilState = SOIL_STATES.WATERED;
    cell.wateredToday = true;
    applySoilView(cell);
    save();
    onChange();
    return true;
  }

  function plant(index, cropType = "radish") {
    const cell = cellAt(index);
    if (!cell || cell.state !== CROP_STATES.EMPTY) return false;
    if (cell.soilState !== SOIL_STATES.WATERED) return false;

    cell.state = CROP_STATES.GROWING;
    cell.cropType = cropType;
    cell.plantedAt = Date.now();
    applyCropView(cell);
    save();
    onChange();
    return true;
  }

  function harvest(index) {
    const cell = cellAt(index);
    if (!cell || cell.state !== CROP_STATES.RIPE) return false;

    cell.state = CROP_STATES.EMPTY;
    cell.cropType = null;
    cell.plantedAt = 0;
    cell.soilState = SOIL_STATES.TILLED;
    cell.wateredToday = false;
    applyCropView(cell);
    applySoilView(cell);
    pouch += 1;
    save();
    onChange();
    return true;
  }

  load();

  let sinceCheck = 0;

  return {
    group,
    cells,
    SOIL_STATES,
    CROP_STATES,
    getTarget,
    hoe,
    water,
    plant,
    harvest,
    get pouch() {
      return pouch;
    },
    get storeIssue() {
      return store.lastIssue;
    },
    get backupKey() {
      return store.backupKey;
    },
    update(delta) {
      sinceCheck += delta;
      if (sinceCheck < 0.25) return;
      sinceCheck = 0;
      if (refreshRipeness()) onChange();
    },
    dispose() {
      leafGeometry.dispose();
      rootGeometry.dispose();
      leafMaterial.dispose();
      sproutMaterial.dispose();
      rootMaterial.dispose();
      plot.group.remove(group);
    },
  };
}
