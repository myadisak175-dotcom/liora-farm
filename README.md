# Liora Farm

เว็บเกมฟาร์ม 2D isometric แบบ mobile-first ใช้ Canvas + ES modules โดยไม่ต้องมี build step หรือ dependency เพิ่ม

## สถานะปัจจุบัน

**Phase 1 — Ground system** ✅

- พื้นหญ้า ดิน และน้ำแบบ tileable
- ขอบหญ้า 4 ทิศแบบ deterministic
- กล้องลากด้วย pointer/touch
- culling เฉพาะ tile ที่อยู่ใน viewport
- texture atlas เดียว ลดจำนวน request และจัด asset ให้ง่ายขึ้น

ยังไม่มี: ตัวละคร, collision, object/depth sorting, farming loop, save data

## โครงสร้าง

```text
index.html              หน้าเกม + canvas
src/
  assets.js             โหลด atlas และสร้าง tile cache
  camera.js             กล้องและ responsive scale
  config.js             ค่าคงที่ส่วนกลาง
  game.js               bootstrap + input + render loop
  ground.js             วาด ground layer และ grass edges
  iso.js                คณิตศาสตร์ isometric grid
  map.js                ข้อมูลแผนที่ทดสอบ
assets/
  atlas.json             ตำแหน่ง tile ทั้งหมดใน atlas
  tiles-atlas.webp.b64   texture atlas (Base64 WebP payload) ของหญ้า/ดิน/น้ำ/edges
```

หลักการของโปรเจกต์: **หนึ่งไฟล์หนึ่งหน้าที่** และเพิ่มระบบใหม่เป็น module ใหม่แทนการยัดทุกอย่างไว้ใน `game.js`

## รันในเครื่อง

ES modules ต้องเปิดผ่าน web server:

```bash
python3 -m http.server 8000
```

จากนั้นเปิด `http://localhost:8000`

## GitHub Pages

ตั้งค่า repository ที่ **Settings → Pages → Deploy from a branch → main / (root)**

## ขั้นต่อไป

1. Liora sprite + เดิน 4 ทิศ
2. collision กับน้ำ
3. object layer + depth sorting
4. บ้าน ต้นไม้ แปลงผัก
5. farming loop: ไถ → ปลูก → รดน้ำ → เก็บ
