/* ==========================================================================
   dungeon-in-game.js  —  the dungeon in the game itself (index.html; ?cave=0: none): its first room, the fang hall, loaded into the
   page beside the hill village. She walks into it from behind the big fall and back out; the village is never left

     const dungeon = createDungeonInGame({ renderer, camera, village: scene, player, mouth, sprite, carry, night, sounds,
                                           airVolume, shadows, map })
       mouth      the mouth in the village (cave-mouth.js): it says when she comes near the fall (the room begins to load
                  then, so going in is quick) and when she walks into the dark (in she goes)
       carry      what goes in and out with her: her (player.object), the jump's circles, her spells' light
       night      of those, what shines more by night (setNight): it does in here
       sprite     the sprite at her shoulder (sprite-companion.js): in here it is the light (a warm round light that goes
                  with her, as on dungeon.html)
       sounds     her steps (step-sounds.js): on bare rock in here, the boss hall's (as on dungeon.html); the room's own
                  sounds play on their AudioContext, as loud as airVolume() (the air about her, as the settings set it)
       shadows    the clouds' shade and the hour's light on everything (cloud-shadows.js): put by while she is in here
       map        the village's map (game-map.js): put away in here, the cave's own in its place
     every frame while dungeon.inside, in place of the village's (index.html: her and what goes with her updated as ever):
       dungeon.update(dt); renderer.render(dungeon.scene, camera)
     dungeon.busy       the screen is dark (going in, coming out): nothing is drawn meanwhile
     dungeon.drowned    how much the fall takes of what is heard (music.js goes down by it)
     dungeon.prepare()  begin to load it now (the mouth does, as she comes near)

   Until 28 Nov 2026 the dungeon was a page of its own (dungeon.html) and coming out of it loaded the village again, some
   20 s ("20 เลย เหรอนาน มาก ทำให้โหลดเร็วได้ไหม โหลดข้อมูลที่จำเป็นก็พอ"). Now only the room is loaded, once: its bake
   (assets/caves/fang-hall.bin + .json, 3.9 MB), its pictures, its sounds, its map, and the code that builds it
   (fang-hall.js, cave-level.js, cave-light.js, fang-hall-sounds.js), fetched as she comes within some 60 m of the fall,
   built the first time she walks into the dark (behind a moment of black, with every shader it needs made then: not as
   she plays). Then it is kept: going in again is at once, as is coming out.

   In there the game's own frame is not run: no land, no water, no sky, no grass, no shadow of hers are drawn; she, the
   sprite and her spells are put in the room's own scene (the room is where tools/make-fang-hall.py baked it, in the
   village's own frame: so the way in and out is the same spot in both). Her level is the room's (cave-level.js, through the
   mouth: mouth.use); its light is on her and the ferns (cave-light.js, on only while she is in here); the haze, the ferns'
   sun, the hour's light and the clouds' shade, shared with the whole game, are the room's, and put back as she comes out.
   The village's air about her is let down to nothing meanwhile (index.html), the room's own heard instead.
   ========================================================================== */
import * as THREE from 'three';
import * as N from './stylized-nature.js';
import { setGroundCoverSun } from './ground-cover.js';
import { createGameMap } from './game-map.js';

const IN_AT = 1.4;                 // m in from the mouth: where she is put going in, facing in (as dungeon.html)
// her steps on bare rock (step-sounds.js' own): the boss hall's, as its sounds are made (boss-hall-sounds.js' MADE, read as
// the room begins to load: nothing of it is loaded before)
const stoneSteps = (made) => [1, 2, 3, 4, 5, 6].map((i) => `boss/step-${i}.mp3?v=${made}`);
const MAP = './assets/maps/fang-hall-map.json';
const ICON = { 'ทางเข้า': '📍', 'ปากเขี้ยว': '🦷', 'ริมสระ': '💧', 'หิ้งหิน': '🪨' };
const IN_FADE = 500, OUT_FADE = 300, SHOW_FADE = 450;      // ms: the dark coming down going in, coming out; and lifting

const noCave = (root) => root.traverse((o) => { for (const m of [].concat(o.material || [])) { m.userData = m.userData || {}; m.userData.noCave = true; } });
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export function createDungeonInGame({ renderer, camera, village, player, mouth, sprite = null, carry = [], night = [], sounds = null, airVolume = () => 1, shadows = null, map = null }) {
  let mods = null, hall = null, level = null, scene = null, heard = null, caveMap = null, halo = null, body = null, fernSun = null;
  let inside = false, busy = false, going = false, built = false, warmed = false, kept = null, ratio = 1, STONE = null;
  const took = { files: 0, build: 0, warm: 0, enter: 0, exit: 0 };      // ms each took, the last time (for a test, or the console: dungeon.took)

  // ---- the dark between the two (with a word on it)
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;background:#05080a;opacity:0;pointer-events:none;transition:opacity .5s;z-index:60;display:grid;place-items:center;color:#cfeff2;font:600 15px system-ui';
  document.body.append(veil);
  const fade = (to, ms, text = '') => new Promise((r) => {
    veil.textContent = text;
    veil.style.transition = `opacity ${ms}ms`;
    veil.style.pointerEvents = to > 0 ? 'auto' : 'none';
    veil.style.opacity = String(to);
    setTimeout(r, ms + 30);
  });

  // ---- loading: the code and the files, as she comes near (nothing built yet: that would hold her frames up as she plays)
  let loading = null;
  function prepare() {
    if (loading) return loading;
    loading = (async () => {
      const t0 = performance.now();
      const [hallMod, levelMod, soundsMod, bossSounds] = await Promise.all([import('./fang-hall.js'), import('./cave-level.js'),
        sounds ? import('./fang-hall-sounds.js') : null, sounds ? import('./boss-hall-sounds.js') : null]);
      if (bossSounds) STONE = stoneSteps(bossSounds.MADE);
      const files = hallMod.fetchFangHall();
      const [L] = await files;
      // the room's sounds: made now (from its plan alone), so their files are on their way; her steps on rock and the
      // map's picture fetched too, into the browser's cache (step-sounds.js and game-map.js ask for them going in)
      if (soundsMod) heard = soundsMod.createFangSounds({ context: () => sounds.context, volume: airVolume(), hall: { frame: L.frame, layout: L } });
      if (STONE) for (const f of STONE) fetch('./assets/audio/' + f).then((r) => r.arrayBuffer()).catch(() => {});
      fetch(MAP).then((r) => r.json()).then((m) => fetch(new URL(m.file, new URL(MAP, location.href)).href)).then((r) => r.blob()).catch(() => {});
      await files;
      took.files = performance.now() - t0;
      return (mods = { hallMod, levelMod, files });
    })();
    loading.catch((err) => { console.warn('[dungeon]', err); loading = null; });      // (tried again next time)
    return loading;
  }

  // ---- built the first time she goes in: the room, its level, its scene, the sprite's light, its map
  async function build() {
    const { hallMod, levelMod, files } = mods || await prepare();
    const t0 = performance.now();
    hall = await hallMod.createFangHall({ files, globals: false, onDrip: (x, y, z) => { if (heard) heard.drip(x, y, z); }, pixelRatio: renderer.getPixelRatio() });
    level = levelMod.createCaveLevel(hall);
    scene = new THREE.Scene();
    scene.name = 'dungeon';
    scene.background = new THREE.Color(hall.look.fog);
    scene.add(hall.group);
    // the ferns' sun: one for every fern of the game (ground-cover.js), read here off the room's own (to be put back)
    const cover = hall.group.getObjectByName('cave-cover');
    if (cover) cover.traverse((o) => { if (!fernSun && o.material && o.material.uniforms && o.material.uniforms.uSun) fernSun = o.material.uniforms.uSun; });
    // the sprite's light: a soft warm glow round it, and its light on the room and on her (cave-light.js)
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,240,205,0.85)'); gr.addColorStop(0.25, 'rgba(255,226,170,0.35)'); gr.addColorStop(1, 'rgba(255,210,150,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const glow = new THREE.CanvasTexture(c); glow.colorSpace = THREE.NoColorSpace;
    halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.material.userData.noCave = true;
    halo.scale.setScalar(1.7); halo.renderOrder = 6;
    scene.add(halo);
    if (sprite) body = sprite.object.getObjectByName('body') || sprite.object;
    // what lights itself, or is the light (her circles, her spells, the sprite, the patch of dark under her feet): not lit
    // by the room's light
    for (const o of carry) if (o !== player.object) noCave(o);
    if (player.blob) noCave(player.blob);
    if (sprite) noCave(sprite.object);
    // the room's map, in the village's place while she is in here
    caveMap = await createGameMap({ url: MAP, player,
      places: level.places.map((p, i) => ({ key: 'fang' + i, label: `${ICON[p.name] || '📍'} ${p.name}`, x: p.x, z: p.z, yaw: p.heading })) });
    caveMap.hidden = true;
    built = true;                                            // (only now: a build that failed half way is begun again next time)
    took.build = performance.now() - t0;
  }

  // ---- every shader the room needs made, and every picture it wears sent, behind the dark (as index.html's warm-up)
  async function warm() {
    const t0 = performance.now();
    try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera); }
    catch (err) { console.warn('[dungeon] warm-up', err); }
    const pictures = new Set(), take = (v) => { if (v && v.isTexture) pictures.add(v); else if (Array.isArray(v)) v.forEach(take); };
    scene.traverse((o) => {
      for (const m of [].concat(o.material || [])) {
        for (const k in m) if (k !== 'uniforms') take(m[k]);
        if (m.uniforms) for (const k in m.uniforms) take(m.uniforms[k] && m.uniforms[k].value);
      }
    });
    for (const t of pictures) if (!t.isRenderTargetTexture) try { renderer.initTexture(t); } catch (err) { /* (sent as it is first drawn) */ }
    took.warm = performance.now() - t0;
  }

  // ---- in and out
  const FR = () => hall.frame;
  function swapIn() {
    inside = true;                                           // (first: should anything here fail, swapOut undoes it)
    mouth.use(level);                                        // (her level: the room's, from here on)
    for (const o of carry) scene.add(o);
    if (sprite) { scene.add(sprite.object); sprite.shadow.visible = false; }
    if (hall.light.apply(scene) && warmed) warmed = false;   // (once for each thing; again only for what is new, another character: made behind the dark)
    hall.light.on = true;
    // the world out there's light, put by: the haze and the ferns' sun (shared by every plant of the game), the hour's light
    // and the clouds' shade on her (cloud-shadows.js)
    const U = N.uniforms;
    kept = { haze: U.uHaze.value.clone(), near: U.uHazeNear.value, far: U.uHazeFar.value, max: U.uHazeMax.value, sun: fernSun ? fernSun.value.clone() : null };
    N.setHaze(hall.haze);
    if (fernSun) setGroundCoverSun(hall.sun);
    if (shadows) {
      const S = shadows.uniforms;
      kept.grade = S.uGrade.value.clone(); kept.gradeW = S.uGradeW.value.clone(); kept.cloud = S.uCloudP.value.z;
      S.uGrade.value.set(1, 1, 1); S.uGradeW.value.set(1, 1, 1); S.uCloudP.value.z = 0;
    }
    for (const fx of night) if (fx && fx.setNight) fx.setNight(true);          // (it is dark in here)
    if (player.blob) player.blob.material.opacity = 1;                       // (as by night)
    hall.setPixelRatio(ratio = renderer.getPixelRatio());
    const F = FR(), LW = hall.layout.curtain.ledge, w = (LW[0] + LW[1]) / 2;
    player.teleport(F.mouth[0] + F.in[0] * IN_AT + F.right[0] * w, F.mouth[2] + F.in[1] * IN_AT + F.right[1] * w, Math.atan2(F.in[0], F.in[1]));
    if (sounds && sounds.own && STONE) sounds.own({ stone: STONE });
    if (heard) heard.air(true);
    if (map) map.hidden = true;
    caveMap.hidden = false;
    document.body.classList.add('in-cave');
  }
  function swapOut() {
    inside = false;
    mouth.use(null);
    for (const o of carry) village.add(o);
    if (sprite) { village.add(sprite.object); sprite.shadow.visible = true; }
    hall.light.on = false;
    if (kept) {
      N.setHaze({ near: kept.near, far: kept.far, max: kept.max });
      N.uniforms.uHaze.value.copy(kept.haze);
      if (fernSun && kept.sun) fernSun.value.copy(kept.sun);
      if (shadows && kept.grade) { const S = shadows.uniforms; S.uGrade.value.copy(kept.grade); S.uGradeW.value.copy(kept.gradeW); S.uCloudP.value.z = kept.cloud; }
      kept = null;
    }
    player.teleport(mouth.spot.x, mouth.spot.z, mouth.spot.yaw);            // (on the ledge behind the fall, facing out)
    if (sounds && sounds.own) sounds.own(null);
    if (heard) heard.air(false);
    if (caveMap) caveMap.hidden = true;
    if (map) map.hidden = false;
    document.body.classList.remove('in-cave');
  }

  async function enter() {
    if (going || inside) return;
    going = true;
    const t0 = performance.now();
    await fade(1, IN_FADE, 'เข้าถ้ำ…');
    busy = true;
    try {
      if (!built) { veil.textContent = 'กำลังโหลดถ้ำ…'; await nextFrame(); await build(); }
      swapIn();
      if (!warmed) { veil.textContent = 'เตรียมภาพในถ้ำ…'; await warm(); warmed = true; }
    } catch (err) {
      console.warn('[dungeon]', err);
      if (inside) swapOut(); else player.teleport(mouth.spot.x, mouth.spot.z, mouth.spot.yaw);
      busy = false;
      veil.textContent = 'โหลดถ้ำไม่ได้ ลองเดินเข้าไปใหม่อีกครั้ง';
      await new Promise((r) => setTimeout(r, 1600));
      await fade(0, SHOW_FADE);
      going = false;
      return;
    }
    busy = false;
    await nextFrame(); await nextFrame();                  // (the room's first frames drawn behind the dark: what is drawn the first time sent then)
    took.enter = performance.now() - t0;
    await fade(0, SHOW_FADE);
    going = false;
  }
  async function exit() {
    if (going || !inside) return;
    going = true;
    const t0 = performance.now();
    await fade(1, OUT_FADE);
    busy = true;
    swapOut();
    busy = false;
    await nextFrame();
    took.exit = performance.now() - t0;
    await fade(0, SHOW_FADE);
    going = false;
  }
  mouth.onNear = () => { prepare(); };
  mouth.onEnter = () => { enter(); };

  // ---- her camera is the game's; in here it is also kept under the roof, out of the rock, and this side of the falling
  // water (beyond it nothing is made: it would hide her behind the curtain). As dungeon.html
  const look = new THREE.Vector3(), ray = new THREE.Vector3(), lamp = new THREE.Vector3();
  function keepCameraInAir() {
    const p = player.position, h = (player.character && player.character.height) || 1.75;
    look.set(p.x, p.y + h * 0.82, p.z);
    ray.subVectors(camera.position, look);
    const len = ray.length();
    if (len < 1e-3) return;
    ray.divideScalar(len);
    let ok = len;
    for (let t = 0.25; t <= len; t += 0.2) {
      const x = look.x + ray.x * t, y = look.y + ray.y * t, z = look.z + ray.z * t;
      if (y < level.heightAt(x, z) + 0.3 || y > level.ceilAt(x, z) - 0.4 || hall.inward(x, z) < hall.curtainAt(y) + 0.45) { ok = Math.max(0.35, t - 0.3); break; }
    }
    if (ok < len) camera.position.copy(look).addScaledVector(ray, ok);
  }
  // the sprite's light: where its body is (or, without it, over her shoulder)
  function lampAt() {
    if (body) body.getWorldPosition(lamp); else lamp.set(player.position.x, player.position.y + 1.9, player.position.z);
    lamp.y += 0.25;
    hall.light.setSprite(lamp, true);
    halo.position.copy(lamp);
  }

  return {
    prepare, enter, exit,
    get inside() { return inside; },
    get busy() { return busy; },
    get going() { return going; },
    took,
    get scene() { return scene; },
    get hall() { return hall; },
    get level() { return level; },
    get heard() { return heard; },
    get map() { return caveMap; },
    get drowned() { return heard ? heard.drowned : 0; },
    update(dt) {
      if (renderer.getPixelRatio() !== ratio) hall.setPixelRatio(ratio = renderer.getPixelRatio());      // (the picture's setting changed meanwhile)
      N.setWalker(player.position, 0.55);
      hall.update(dt, camera);                              // (the plants' time and wind too: N.update)
      keepCameraInAir();
      lampAt();
      caveMap.update();
      if (heard) { heard.volume = airVolume(); heard.update(dt, camera); }
      // out onto the ledge, past the curtain's line: back to the village
      if (!going && player.mode === 'ground' && hall.inward(player.position.x, player.position.z) < hall.layout.curtain.exit) exit();
    },
  };
}
