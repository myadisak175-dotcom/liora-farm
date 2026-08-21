import { applyBlockoutPreset } from "../systems/blockout-preset.js";
import { WORLD_LOGIC } from "../systems/world-logic.js";

const MAP_SCHEMA_VERSION = 2;

export function createLayoutRuntime({
  builder,
  builderView,
  layoutStore,
  world,
  defaultMapUrl,
  mapId = "home-island",
  mapName = "",
  getUI = () => null,
  getHorizon = () => null,
  onHorizon = () => {},
  onToast = () => {},
  onCollidersChange = () => {},
  onTerrainSync = () => {},
}) {
  async function fetchDefaultMap() {
    const response = await fetch(defaultMapUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Default map request failed: ${response.status}`);
    return response.json();
  }

  async function spawnAll() {
    const items = [...builder.items];
    const results = await Promise.allSettled(items.map((item) => builderView.spawn(item)));
    const failedIds = [];

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (result.status !== "rejected") continue;
      failedIds.push(items[index].id);
      console.error(`Builder object failed to load: ${items[index].assetId}`, result.reason);
    }

    builder.setInactiveItems(failedIds);
    onCollidersChange(builder.getColliders());

    if (failedIds.length) {
      onToast(`โหลดโมเดลไม่สำเร็จ ${failedIds.length} ชิ้น — ปิดการชนชั่วคราว`);
      getUI()?.warn(`มีโมเดล ${failedIds.length} ชิ้นโหลดไม่สำเร็จ จึงไม่ขวางการเดินหรือวางของ`);
    }
    getUI()?.render();
  }

  async function load() {
    if (!layoutStore.hasSavedLayout()) {
      try {
        const map = await fetchDefaultMap();
        if (Array.isArray(map.objects)) {
          for (const object of map.objects) {
            builder.addItem(object, {
              validate: false,
              saveLayout: false,
              recordHistory: false,
            });
          }
          builder.save({ immediate: true });
        }

        if (map.blockout) {
          const seeded = applyBlockoutPreset({
            height: world.height,
            paint: world.paint,
            preset: map.blockout,
          });
          if (map.blockout.terrain && !seeded.terrain) {
            console.warn("Blockout terrain seed could not be applied");
          }
          if (map.blockout.paint && !seeded.paint) {
            console.warn("Blockout paint seed could not be applied");
          }
        }

        if (map.groundPaint) world.paint.importData(map.groundPaint);
        if (map.terrainHeight) {
          if (!world.height.importData(map.terrainHeight)) {
            console.warn("Default map terrain height could not be loaded");
          }
        }
      } catch (error) {
        console.warn("Default map could not be loaded", error);
      }
    } else {
      builder.load();
    }

    // Sky and gameplay logic are properties of the map itself. A local edit
    // still wins, but untouched players always follow what the authored map
    // says after a content update.
    await applyAuthoredHorizon();
    await applyAuthoredLogic();

    await spawnAll();
    const report = builder.loadReport;
    if (report?.dropped) {
      getUI()?.warn(`ข้ามสิ่งของ ${report.dropped} ชิ้นที่ไม่รู้จัก (${report.unknownAssetIds.join(", ")})`);
    }
    if (report?.storeIssue?.kind === "version-mismatch") {
      getUI()?.warn(`แผนที่เดิมคนละเวอร์ชัน — สำรองไว้ที่ ${layoutStore.backupKey}`);
      onToast("แผนที่เดิมคนละเวอร์ชัน สำรองไว้แล้ว");
    }
  }

  async function applyAuthoredHorizon() {
    try {
      const map = await fetchDefaultMap();
      onHorizon(map?.horizon ?? null);
    } catch {
      onHorizon(null);
    }
  }

  async function applyAuthoredLogic() {
    try {
      const map = await fetchDefaultMap();
      WORLD_LOGIC.importData(map?.logic ?? null);
    } catch {
      WORLD_LOGIC.importData(null);
    }
  }

  async function reset() {
    try {
      const map = await fetchDefaultMap();
      builderView.clear();
      builder.resetTo(Array.isArray(map.objects) ? map.objects : []);
      await spawnAll();
      onTerrainSync();
      onToast("โหลดสิ่งของเริ่มต้นแล้ว — พื้นที่ระบายและปั้นไว้ยังอยู่");
    } catch (error) {
      console.warn("Default map could not be loaded", error);
      onToast("โหลดแผนที่เริ่มต้นไม่สำเร็จ");
    }
  }

  function exportMap(items) {
    const payload = {
      version: MAP_SCHEMA_VERSION,
      mapId,
      name: mapName || mapId,
      savedAt: new Date().toISOString(),
      // One world file owns presentation, geometry and gameplay authoring data.
      // Runtime objects never enter this payload: every section is plain data.
      horizon: getHorizon() ?? {},
      logic: WORLD_LOGIC.exportData(),
      objects: items.map(({ id, assetId, x, z, rotation, scale }) => ({
        id,
        assetId,
        x: +x.toFixed(3),
        z: +z.toFixed(3),
        rotation: +rotation.toFixed(4),
        scale: +scale.toFixed(3),
      })),
      groundPaint: world.paint.exportData(),
      terrainHeight: world.height.exportData(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${mapId}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return {
    load,
    reset,
    exportMap,
    spawnAll,
    applyAuthoredHorizon,
    applyAuthoredLogic,
  };
}
