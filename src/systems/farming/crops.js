import * as THREE from "three";
import { createLocalStore } from "../local-store.js";

export const CROP_STATES = Object.freeze({
  EMPTY: "empty",
  GROWING: "growing",
  RIPE: "ripe",
});

/**
 * The first gameplay loop: plant -> wait -> harvest -> pouch.
 *
 * The 3x3 plot has existed as decoration since the beginning — plot.js already
 * handed out `cells`, nothing ever read them. This owns what is growing in
 * each of those cells and the meshes that show it. It touches no DOM; main.js
 * reads `pouch` and the current target to update the HUD.
 */
export function createCrops({ plot, config, onChange = () => {} }) {
  const group = new THREE.Group();
  group.name = "Crops";
  plot.group.add(group);

  // Cell centres in world space, measured once — the plot never moves.
  plot.group.updateMatrixWorld(true);
  const cells = plot.cells.map((cell, index) => ({
    index,
    local: cell.position.clone(),
    world: plot.group.localToWorld(cell.position.clone()),
    state: CROP_STATES.EMPTY,
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

  function applyView(cell) {
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
      applyView(cell);
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
      })),
    };
  }

  function save() {
    store.save(serialize());
  }

  function load() {
    const data = store.load();
    if (!data) return;
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
      applyView(cell);
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
    return { index: best.index, state: best.state, progress: progressOf(best) };
  }

  function cellAt(index) {
    return cells[index] ?? null;
  }

  function plant(index) {
    const cell = cellAt(index);
    if (!cell || cell.state !== CROP_STATES.EMPTY) return false;
    cell.state = CROP_STATES.GROWING;
    cell.plantedAt = Date.now();
    applyView(cell);
    save();
    onChange();
    return true;
  }

  function harvest(index) {
    const cell = cellAt(index);
    if (!cell || cell.state !== CROP_STATES.RIPE) return false;
    cell.state = CROP_STATES.EMPTY;
    cell.plantedAt = 0;
    applyView(cell);
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
    CROP_STATES,
    getTarget,
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
      // Growth is wall-clock based, so it only needs a look a few times a
      // second — not every frame.
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
