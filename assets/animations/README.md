# คลังท่า UAL → VRMA

84 ท่าจาก Quaternius Universal Animation Library 1 + 2 (รุ่น Standard) แปลงเป็น `.vrma` และอีก 1 ท่าที่ทำขึ้นเอง: `Climb_Loop` (ท่าปีนผนังวนลูป สร้างด้วย `tools/make-climb-anim.py` เพราะคลังไม่มีท่านี้)
ใช้กับโมเดล VRM ตัวไหนก็ได้ (ทดสอบแล้วกับ VRoid ชุด CC0) — ลิขสิทธิ์ CC0 ตาม `LICENSE.txt`

## โครงสร้าง

```
vrma/            84 ไฟล์ .vrma (ไฟล์ละ 1 ท่า, 30 fps, ไม่มี root motion)
vrma/index.json  รายชื่อท่า: name, file, source (UAL1/UAL2), duration, frames, loop
```

ตัวแปลงอยู่ใน repo ที่ `tools/ual_to_vrma.py` (ใช้ซ้ำได้ถ้าซื้อรุ่น Pro/Source มาเพิ่ม ต้องมี numpy)

## ใช้ในเกมนี้

เกมไม่ได้โหลด `.vrma` ตอนเล่น ท่าที่ใช้ถูกแปลงล่วงหน้าเป็น `character-anim.js` (ไฟล์เดียว ทุกตัวละครใช้ร่วมกัน):

```
python3 tools/bake-character-anim.py assets/animations/vrma
```

รายชื่อท่าที่เกมใช้อยู่ที่ `CLIPS` บนสุดของ `tools/bake-character-anim.py`

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
