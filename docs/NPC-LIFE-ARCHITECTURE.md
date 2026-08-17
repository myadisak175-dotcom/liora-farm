# NPC Life Loop — Baseline Architecture

สถานะ: **ล็อกเป็น baseline สำหรับต่อยอดภายหลัง**

## เป้าหมายของแนวทางนี้

ให้ NPC หลายตัวดูมีชีวิต โดยไม่โหลด resource หนักซ้ำโดยไม่จำเป็น

หลักที่ต้องรักษา:

- แชร์ Geometry / Material / Texture เมื่อใช้โมเดลฐานเดียวกัน
- แชร์ AnimationClip / Animation Library
- แต่ละ NPC มี Skeleton pose และ AnimationMixer ของตัวเอง
- แต่ละ NPC มี state, position, rotation, timers และ routine ของตัวเอง
- เปลี่ยนความหลากหลายด้วย appearance / accessory / color / behavior ก่อนสร้าง asset ใหม่ทั้งตัว

## Baseline ที่ทดสอบแล้ว

โหมดทดสอบเปิดด้วย:

`?npc=1`

และดู performance พร้อมกันด้วย:

`?npc=1&perf=1`

ปัจจุบันใช้ NPC 2 ตัวที่ clone จากโมเดลผู้เล่นที่โหลดอยู่แล้ว และให้แต่ละตัวทำ Life Loop แยกกัน

Life Loop ปัจจุบัน:

`Idle -> เดิน/วิ่ง -> Idle -> สุ่มทำกิจกรรม -> เดินต่อ -> loop`

กิจกรรมที่ใช้เฉพาะ animation ที่มีอยู่ใน player GLB เช่น:

- Pick Up
- Hammer
- Mirror

ระบบนี้ยังไม่ใช่ AI เต็มรูปแบบ และยังไม่มี schedule, needs, dialogue graph หรือ pathfinding

## ไฟล์หลัก

- `src/systems/npc-life.js`
  - clone skeleton
  - สร้าง mixer ต่อ NPC
  - state machine เบา ๆ
  - random waypoint routine
  - animation cross-fade

- `src/npc-test-bootstrap.js`
  - โหลดเฉพาะเมื่อมี `?npc=1`
  - เชื่อมระบบ NPC เข้ากับ scene หลังเกม boot แล้ว

- `src/entities/player.js`
  - expose player model + clips เฉพาะ test mode เพื่อให้ NPC reuse resource เดิม

- `index.html`
  - gate การโหลด NPC test module ด้วย query parameter

## กฎสำหรับการต่อยอดในอนาคต

### 1. NPC appearance

พยายามใช้ rig เดียวกันก่อน แล้วเปลี่ยน:

- hair
- outfit
- color palette
- accessory
- scale เล็กน้อย

ถ้าจำเป็นต้องมี mesh คนละชุด ให้ยังคง skeleton hierarchy และ animation naming compatible เท่าที่ทำได้

### 2. NPC behavior

แยก behavior ออกจาก animation

โครงที่ควรไปต่อ:

`NpcController -> Routine/Brain -> Action -> Animation`

ตัวอย่าง:

`Routine: goToFarm -> Action: walk -> Animation: Walking`

`Routine: work -> Action: harvest -> Animation: PickUp`

### 3. Navigation

ตอนนี้เดิน waypoint ตรง ๆ เท่านั้น

ภายหลังค่อยเพิ่ม:

- collision-aware movement
- waypoint graph
- navmesh/pathfinding เมื่อ world ซับซ้อนพอ

อย่าเพิ่ม pathfinding ก่อนจำเป็น เพราะมีค่า CPU สูงกว่า state machine ปัจจุบันมาก

### 4. Performance scaling

เมื่อจำนวน NPC เพิ่ม ให้เพิ่ม optimization ตามลำดับ:

1. จำกัดจำนวน NPC ที่ active ใกล้กล้อง
2. NPC ไกล ๆ ลด animation update rate
3. NPC นอกจอหยุด skinning/update หรือใช้ simulation แบบเบา
4. reuse clips/materials/textures ต่อไป
5. พิจารณา animation LOD / GPU crowd technique เมื่อจำนวน NPC สูงจริง

### 5. Dialogue / interaction

Dialogue ต้องเป็นระบบแยกจาก Life Loop

NPC routine ควรสามารถ pause -> interact -> resume ได้

อย่าฝังข้อความสนทนาไว้ใน movement state machine โดยตรง

## สิ่งที่ยังไม่ทำตอนนี้

- daily schedule
- hunger / sleep / work needs
- relationship system
- quest system
- dialogue choices
- social AI
- navmesh
- crowd manager
- NPC save/load state

ทั้งหมดนี้เป็น future work และไม่ควรเพิ่มก่อนมีเหตุผลด้าน gameplay ชัดเจน

## Baseline performance reference

จากการทดสอบบนมือถือในฉากจริง พร้อม Player + NPC 2 ตัว:

- ~60 FPS
- worst frame ~17 ms
- ~271k triangles
- ~75 draw calls
- ~148 objects

ให้ใช้ชุดตัวเลขนี้เป็น reference point เมื่อต่อ NPC เพิ่มในอนาคต

## Design decision

แนวทาง NPC ของ Liora Farm คือ:

**shared heavy resources + independent lightweight lives**

ให้คงหลักนี้เป็น default จนกว่าการทดสอบ performance หรือ gameplay จะพิสูจน์ว่าจำเป็นต้องเปลี่ยน
