# คลังท่า UAL → VRMA

84 ท่าจาก Quaternius Universal Animation Library 1 + 2 (รุ่น Standard) แปลงเป็น `.vrma` และอีก 3 ท่าที่ทำขึ้นเอง: `Climb_Loop` (ท่าปีนผนังวนลูป สร้างด้วย `tools/make-climb-anim.py` เพราะคลังไม่มีท่านี้), `Hop` (ท่ากระโดดข้ามรั้ว จาก `NinjaJump_Start` ด้วย `tools/make-hop-anim.py`) และ `Barrier_Cast` (ท่าร่ายบาเรียน้ำ ต่อจาก `Spell_Simple_Enter` ด้วย `tools/make-barrier-anim.py`)
ใช้กับโมเดล VRM ตัวไหนก็ได้ (ทดสอบแล้วกับ VRoid ชุด CC0) — ลิขสิทธิ์ CC0 ตาม `LICENSE.txt`

## โครงสร้าง

```
vrma/            ไฟล์ .vrma (ไฟล์ละ 1 ท่า, 30 fps, ไม่มี root motion): 84 จากคลัง + 3 ที่ทำเอง
vrma/index.json  รายชื่อท่า: name, file, source (UAL1/UAL2), duration, frames, loop
```

ตัวแปลงอยู่ใน repo ที่ `tools/ual_to_vrma.py` (ใช้ซ้ำได้ถ้าซื้อรุ่น Pro/Source มาเพิ่ม ต้องมี numpy)

ท่าจาก Mixamo (Adobe) และจากแพ็กของ Kevin Iglesias ไม่ใช่ CC0 ใช้ในเกมได้แต่แจกเป็นไฟล์ไม่ได้ จึงแปลงด้วย `tools/mixamo-to-vrma.mjs` ไปไว้ที่ `mixamo/` ซึ่งไม่ขึ้น repo (อยู่ใน `.gitignore`) เกมเก็บเฉพาะท่าที่ bake แล้ว (`magic-jump-mocap-anim.js`, `vault-anim.js`, และของหน้าทดลองคอมโบเวท `magic-combo-anim.js` ซึ่งทำด้วย `tools/make-magic-combo-anim.py`)

## ใช้ในเกมนี้

เกมไม่ได้โหลด `.vrma` ตอนเล่น ท่าที่ใช้ถูกแปลงล่วงหน้าเป็น `character-anim.js` (ไฟล์เดียว ทุกตัวละครใช้ร่วมกัน):

```
python3 tools/bake-character-anim.py assets/animations/vrma
```

รายชื่อท่าที่เกมใช้อยู่ที่ `CLIPS` บนสุดของ `tools/bake-character-anim.py`

หน้าที่แยกจากเกม แปลงเฉพาะท่าที่ตัวเองใช้ลงไฟล์ของตัวเอง (`character-anim.js` ของเกมจะได้ไม่ใหญ่ขึ้น) เช่นหน้าบาเรียน้ำ:

```
python3 tools/bake-character-anim.py assets/animations/vrma barrier-anim.js idle:Idle_Loop barrier:Barrier_Cast
```

`loop: true` ดูจากชื่อท่าที่มีคำว่า `Loop` เท่านั้น ท่าที่ไม่มีคำนี้แต่จะวนก็ได้ (เช่น `Sword_Idle`) ให้ตั้งเองในเกม

## ใช้ใน three.js

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

const vrmLoader = new GLTFLoader();
vrmLoader.register((p) => new VRMLoaderPlugin(p));
const animLoader = new GLTFLoader();
animLoader.register((p) => new VRMAnimationLoaderPlugin(p));

const vrm = (await vrmLoader.loadAsync('Sendagaya_Shino.vrm')).userData.vrm;
VRMUtils.rotateVRM0(vrm);            // โมเดล VRoid ชุด CC0 เป็น VRM 0.x
scene.add(vrm.scene);

const mixer = new THREE.AnimationMixer(vrm.scene);
const walk = (await animLoader.loadAsync('vrma/Walk_Loop.vrma')).userData.vrmAnimations[0];
mixer.clipAction(createVRMAnimationClip(walk, vrm)).play();

// ในลูปเกม:  mixer.update(dt);  vrm.update(dt);
```

## ข้อจำกัด

- โมเดลที่ไม่มีกระดูก `upperChest` ช่วงแขนกับหัวจะเพี้ยนได้ถึง ~40° ในบางท่า
  (VRoid ทุกตัวมีกระดูกนี้ ไม่โดน)
- ท่าไม่มี root motion — ให้โค้ดเกมเป็นคนเลื่อนตัวละครเอง
- ไม่มีสีหน้า/การมอง — ท่าพวกนี้ขยับแค่กระดูก
