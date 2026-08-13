# Liora's Farm

Top-down 3D farming game for mobile browsers. Three.js ES modules, no build step.

Live: https://myadisak175-dotcom.github.io/liora-farm/

## Run locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` on the phone. A server is required — ES modules
and `fetch` do not work from `file://`.

## What works

- **เล่น** — walk, run, 4 action animations, orbit camera, day/night clock.
- **สร้าง → วางสิ่งของ** — place 9 assets, drag to move, rotate, scale,
  duplicate, delete. Autosaves.
- **สร้าง → ระบายพื้น** — free-brush dirt / sand / rock over grass, with undo.
- **บันทึกแผนที่** — exports `home-island.json` to commit as the new default.

## ตรวจสภาพหลังแก้โค้ด (selftest.html)

```
http://localhost:8000/selftest.html
```

เปิดบนมือถือแล้วกด "เริ่มตรวจ" มันโหลด `index.html` จริงในเฟรมซ่อน แล้วลองใช้งาน
แบบเดียวกับนิ้วคน: แตะ ลาก กดปุ่ม แล้วเช็คว่าผลลัพธ์เกิดขึ้นจริง — ปุ่มอยู่ในจอไหม
ปุ่มเล็กกว่า 44px ไหม กดวางแล้วของถูกเซฟไหม โหมดเล่นรั่วไหม ระบายแล้วย้อนได้ไหม

เซฟจริงถูกสำรองก่อนตรวจและคืนให้เมื่อจบ (ถ้าปิดกลางคัน กดปุ่ม "กู้เซฟคืน")

รันทุกครั้งที่แก้ `main.js`, `builder-ui.js` หรือ `main.css` — บั๊กสองตัวที่ทำให้
วางของไม่ได้เลย (ปุ่มอยู่นอกจอ กับทุกการแตะยกเลิกการวาง) ไม่มีทางเห็นจากการอ่านโค้ด

## Adding a placeable asset

1. Upload the `.glb` to `builder/assets/models/builder/`.
2. Add one entry to `src/editor/asset-catalog.js`.

That is the whole process. No UI code changes.

## Notes

- Binary files (`.glb`, `.webp`) must be uploaded through the GitHub web UI.
  Text-based tooling corrupts them — a ~15 KB `.glb` or `.webp` is a corrupt file.
- See `docs/ARCHITECTURE.md` before adding systems.
