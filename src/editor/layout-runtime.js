export function createLayoutRuntime({
  builder,
  builderView,
  layoutStore,
  world,
  defaultMapUrl,
  getUI = () => null,
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
      version: 1,
      mapId: "home-island",
      savedAt: new Date().toISOString(),
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
    link.download = "home-island.json";
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
  };
}
