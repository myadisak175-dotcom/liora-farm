import { getCatalogCategories } from "./asset-catalog.js";

export function createBuilderUI({ mount, controller, view, catalog }) {
  if (!mount || !controller || !view || !catalog) {
    throw new Error("createBuilderUI requires mount, controller, view and catalog");
  }

  const style = document.createElement("style");
  style.textContent = `
    :root{--builder-ink:#101A16;--builder-moss:#1B2B23F2;--builder-edge:#3D5648;--builder-cream:#F2EFE4;--builder-amber:#E8A33D}
    #ui{position:fixed;inset:0;z-index:20;pointer-events:none;transition:opacity .16s;font-family:"IBM Plex Sans Thai",system-ui,sans-serif;color:var(--builder-cream)}
    #ui>*{pointer-events:auto}
    #ui .dot{position:fixed;border-radius:50%;border:1px solid var(--builder-edge);background:var(--builder-moss);color:var(--builder-cream);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font:inherit;backdrop-filter:blur(8px);-webkit-tap-highlight-color:transparent}
    #ui .dot em{font-style:normal;line-height:1} #ui .dot small{font-size:9px;opacity:.72;font-weight:700}
    #ui .dot:active{transform:scale(.96)}
    #ui #builder-main{right:16px;bottom:calc(env(safe-area-inset-bottom) + 18px);width:76px;height:76px;background:var(--builder-amber);border-color:var(--builder-amber);color:#1A1206}
    #ui #builder-main em{font-size:28px}
    #ui #builder-r1{right:26px;bottom:calc(env(safe-area-inset-bottom) + 108px);width:56px;height:56px}
    #ui #builder-r2{right:26px;bottom:calc(env(safe-area-inset-bottom) + 174px);width:56px;height:56px}
    #ui #builder-r1 em,#ui #builder-r2 em{font-size:20px}
    #ui #builder-esc{left:16px;bottom:calc(env(safe-area-inset-bottom) + 18px);width:60px;height:60px}
    #ui #builder-s1{left:20px;bottom:calc(env(safe-area-inset-bottom) + 92px);width:50px;height:50px}
    #ui #builder-s2{left:20px;bottom:calc(env(safe-area-inset-bottom) + 150px);width:50px;height:50px}
    #ui #builder-s1 em,#ui #builder-s2 em{font-size:24px;font-weight:900}
    #ui #builder-esc em{font-size:22px}
    #ui .hide{display:none!important}
    #ui #builder-reticle{position:fixed;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;pointer-events:none;opacity:0;transition:opacity .18s}
    #ui #builder-reticle.on{opacity:1}
    #ui #builder-reticle svg{width:100%;height:100%}
    #ui #builder-scrim{position:fixed;inset:0;z-index:4;background:#0009;opacity:0;pointer-events:none;transition:opacity .22s}
    #ui #builder-scrim.on{opacity:1;pointer-events:auto}
    #ui #builder-sheet{position:fixed;left:0;right:0;bottom:0;z-index:5;background:#1B2B23;border-top:1px solid var(--builder-edge);border-radius:22px 22px 0 0;padding:14px 14px calc(env(safe-area-inset-bottom) + 16px);transform:translateY(110%);transition:transform .24s cubic-bezier(.3,.9,.3,1);max-height:64vh;overflow:auto}
    #ui #builder-sheet.open{transform:translateY(0)}
    #ui #builder-tabs{display:flex;gap:8px;overflow-x:auto;margin:0 0 12px;padding-bottom:2px}
    #ui .builder-tab{border:1px solid var(--builder-edge);background:var(--builder-ink);color:var(--builder-cream);border-radius:999px;padding:8px 12px;white-space:nowrap;font:700 11px inherit}
    #ui .builder-tab.active{border-color:var(--builder-amber);color:var(--builder-amber)}
    #ui #builder-grid{display:grid;grid-template-columns:repeat(4,64px);justify-content:space-between;gap:10px 6px}
    #ui .builder-card{width:64px;height:64px;border:1px solid var(--builder-edge);background:var(--builder-ink);border-radius:14px;color:var(--builder-cream);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font:600 9px inherit;text-align:center;padding:3px}
    #ui .builder-card .icon{font-size:24px;line-height:1}
    #ui .builder-card:active{border-color:var(--builder-amber)}
    @media(prefers-reduced-motion:reduce){#ui,#ui #builder-sheet,#ui #builder-scrim{transition:none}}
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "ui";
  root.innerHTML = `
    <div id="builder-reticle"><svg viewBox="0 0 52 52" fill="none"><circle cx="26" cy="26" r="16" stroke="#E8A33D" stroke-width="2" stroke-dasharray="5 7"/><circle cx="26" cy="26" r="3" fill="#E8A33D"/></svg></div>
    <button class="dot" id="builder-main" type="button"></button>
    <button class="dot" id="builder-r1" type="button"></button>
    <button class="dot" id="builder-r2" type="button"></button>
    <button class="dot" id="builder-s1" type="button"></button>
    <button class="dot" id="builder-s2" type="button"></button>
    <button class="dot" id="builder-esc" type="button"></button>
    <div id="builder-scrim"></div>
    <section id="builder-sheet" aria-label="เลือกของที่จะวาง"><div id="builder-tabs"></div><div id="builder-grid"></div></section>
  `;
  mount.appendChild(root);

  const main = root.querySelector("#builder-main");
  const r1 = root.querySelector("#builder-r1");
  const r2 = root.querySelector("#builder-r2");
  const s1 = root.querySelector("#builder-s1");
  const s2 = root.querySelector("#builder-s2");
  const esc = root.querySelector("#builder-esc");
  const reticle = root.querySelector("#builder-reticle");
  const sheet = root.querySelector("#builder-sheet");
  const scrim = root.querySelector("#builder-scrim");
  const tabs = root.querySelector("#builder-tabs");
  const grid = root.querySelector("#builder-grid");
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.hidden = true;
  root.appendChild(importInput);

  let selectedId = null;
  let activeAsset = null;
  let moving = false;
  let activeCategory = getCatalogCategories()[0] ?? null;

  function setButton(element, icon, label, handler) {
    if (!icon) {
      element.classList.add("hide");
      element.onclick = null;
      return;
    }
    element.classList.remove("hide");
    element.innerHTML = `<em>${icon}</em><small>${label ?? ""}</small>`;
    element.onclick = handler;
  }

  function selectedItem() {
    return controller.items.find((item) => item.id === selectedId) ?? null;
  }

  function selectedAsset() {
    const item = selectedItem();
    return item ? catalog[item.assetId] ?? null : null;
  }

  function clampScale(value, asset) {
    const min = Number(asset?.minScale ?? .35);
    const max = Number(asset?.maxScale ?? 3);
    return Math.min(max, Math.max(min, value));
  }

  async function scaleSelected(factor) {
    const item = selectedItem();
    const asset = selectedAsset();
    if (!item || !asset) return;
    const next = clampScale((Number(item.scale) || 1) * factor, asset);
    controller.updateSelected({ scale: next });
    await view.syncItems(controller.items);
    view.highlight(selectedId);
  }

  function openSheet() {
    renderCatalog();
    sheet.classList.add("open");
    scrim.classList.add("on");
  }

  function closeSheet() {
    sheet.classList.remove("open");
    scrim.classList.remove("on");
  }

  async function startPlacement(asset) {
    closeSheet();
    selectedId = null;
    activeAsset = asset;
    moving = false;
    view.highlight(null);
    controller.beginPlacement(asset.id);
    await view.beginPreview(asset);
    refresh();
  }

  async function confirmPlacement() {
    const transform = view.getPreviewTransform();
    if (!activeAsset || !transform) return;
    const asset = activeAsset;
    controller.addItem({ assetId: asset.id, ...transform });
    await view.syncItems(controller.items);
    controller.beginPlacement(asset.id);
    await view.beginPreview(asset);
    refresh();
  }

  async function cancelPlacement() {
    view.endPreview();
    activeAsset = null;
    moving = false;
    controller.cancelPlacement();
    await view.syncItems(controller.items);
    refresh();
  }

  async function startMove() {
    if (!selectedId) return;
    view.highlight(null);
    view.beginMove(selectedId);
    moving = true;
    refresh();
  }

  async function confirmMove() {
    const transform = view.getPreviewTransform();
    if (!selectedId || !transform) return;
    controller.updateSelected(transform);
    await view.syncItems(controller.items);
    moving = false;
    view.highlight(selectedId);
    refresh();
  }

  async function cancelMove() {
    view.endPreview();
    await view.syncItems(controller.items);
    moving = false;
    view.highlight(selectedId);
    refresh();
  }

  async function rotateSelected(step) {
    const item = selectedItem();
    if (!item) return;
    controller.updateSelected({ rotation: item.rotation + step * Math.PI / 8 });
    await view.syncItems(controller.items);
    view.highlight(selectedId);
  }

  async function deleteSelected() {
    if (!selectedId) return;
    controller.deleteSelected();
    selectedId = null;
    view.highlight(null);
    await view.syncItems(controller.items);
    refresh();
  }

  async function undo() {
    if (!controller.undo()) return;
    selectedId = null;
    activeAsset = null;
    moving = false;
    view.highlight(null);
    await view.syncItems(controller.items);
    refresh();
  }

  async function importMap(file) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const objects = Array.isArray(payload) ? payload : payload.objects ?? payload.items;
      controller.importItems(objects);
      selectedId = null;
      activeAsset = null;
      moving = false;
      view.highlight(null);
      await view.syncItems(controller.items);
      refresh();
    } catch (error) {
      console.warn("Builder map import failed", error);
      window.alert(`นำเข้าแผนที่ไม่สำเร็จ\n${error?.message ?? error}`);
    } finally {
      importInput.value = "";
    }
  }

  async function placeAnother() {
    const item = selectedItem();
    if (!item) return;
    const asset = catalog[item.assetId];
    if (asset) await startPlacement(asset);
  }

  function exportMap() {
    const payload = {
      version: 1,
      mapId: "home-island",
      savedAt: new Date().toISOString(),
      objects: controller.items.map(({ id, assetId, x, z, rotation, scale }) => ({ id, assetId, x, z, rotation, scale })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "home-island.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function renderCatalog() {
    const categories = getCatalogCategories();
    if (!categories.includes(activeCategory)) activeCategory = categories[0] ?? null;
    tabs.replaceChildren();
    for (const category of categories) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `builder-tab${category === activeCategory ? " active" : ""}`;
      tab.textContent = category;
      tab.onclick = () => { activeCategory = category; renderCatalog(); };
      tabs.appendChild(tab);
    }

    grid.replaceChildren();
    for (const asset of Object.values(catalog).filter((entry) => entry.category === activeCategory)) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "builder-card";
      card.innerHTML = `<span class="icon">${asset.icon}</span><span>${asset.label}</span>`;
      card.onclick = () => startPlacement(asset);
      grid.appendChild(card);
    }
  }

  importInput.onchange = () => importMap(importInput.files?.[0]);

  function refresh() {
    const placing = controller.isPlacing && !moving;
    const editing = controller.isEditing && !moving;
    reticle.classList.toggle("on", placing || moving);

    if (placing || moving) {
      setButton(main, "✓", "วาง", moving ? confirmMove : confirmPlacement);
      setButton(r1, "↻", "หมุน", () => view.rotatePreview(1));
      setButton(r2, "↺", "หมุน", () => view.rotatePreview(-1));
      setButton(s1, "−", "เล็กลง", () => view.scalePreview(.9));
      setButton(s2, "+", "ใหญ่ขึ้น", () => view.scalePreview(1.1));
      setButton(esc, "✕", "ยกเลิก", moving ? cancelMove : cancelPlacement);
      return;
    }

    if (editing && selectedId) {
      setButton(main, "✥", "ย้าย", startMove);
      setButton(r1, "↻", "หมุน", () => rotateSelected(1));
      setButton(r2, "⧉", "วางอีก", placeAnother);
      setButton(s1, "−", "เล็กลง", () => scaleSelected(.9));
      setButton(s2, "+", "ใหญ่ขึ้น", () => scaleSelected(1.1));
      setButton(esc, "🗑", "ลบ", deleteSelected);
      return;
    }

    setButton(main, "▦", "เลือกของ", openSheet);
    setButton(r1, "↶", "ย้อนกลับ", undo);
    setButton(r2, null);
    setButton(s1, "⇧", "นำเข้า", () => importInput.click());
    setButton(s2, null);
    setButton(esc, "⇩", "บันทึกแผนที่", exportMap);
  }

  function setSelection(id) {
    selectedId = id;
    activeAsset = null;
    moving = false;
    refresh();
  }

  scrim.onclick = closeSheet;
  renderCatalog();
  refresh();

  return {
    refresh,
    setSelection,
    get element() { return root; },
    dispose() { root.remove(); style.remove(); },
  };
}
