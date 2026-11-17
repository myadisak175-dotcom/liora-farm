/* ==========================================================================
   world-switch.js  —  the button that switches the hill village between its living world and its cursed one

     const sw = createWorldSwitch({ player, tod, map: MAP });      // once, after the clock is made; null on a map with no cursed world
     sw.restored                                                   // true: this load came from the button, and was put back as it was

   One job: compare the two worlds from the same place. The cursed world is not a filter over the living one: its water,
   its land and its map are worked out as the level loads (?curse=1: drought.js, the level), so the map loads again in the
   other world. Before it goes, where she stands, which way she faces, where the camera looks from, and the hour and
   whether the clock runs are noted (this tab only); the map loading again puts all of it back, once. Every other part of
   the address (?dev=1, ?map=...) is kept.
   ========================================================================== */
const KEY = 'liora.world.switch';
const WORLDS = ['hillvillage'];            // the maps that have a cursed world (the hill village's level reads ?curse=1)

export function createWorldSwitch({ player, tod = null, map }) {
  if (!WORLDS.includes(map)) return null;
  const here = new URL(location.href), cursed = here.searchParams.has('curse');

  // ---- put her back where she was, if the button brought her here
  let restored = false;
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    sessionStorage.removeItem(KEY);
    if (s && s.map === map && Number.isFinite(s.x) && Number.isFinite(s.z)) {
      player.teleport(s.x, s.z, Number.isFinite(s.heading) ? s.heading : undefined);
      if (Number.isFinite(s.camYaw)) player.setView(s.camYaw, s.camPitch, s.camDist);
      if (tod && Number.isFinite(s.hour)) { tod.set(s.hour); tod.auto = !!s.auto; }
      restored = true;
    }
  } catch (e) { /* nothing noted */ }

  // ---- the button
  const btn = document.createElement('button');
  btn.id = 'worldBtn';
  btn.className = cursed ? 'toLiving' : 'toCursed';
  btn.textContent = cursed ? '🌿 ไปโลกปกติ' : '🥀 ไปโลกคำสาป';
  btn.onpointerdown = e => e.stopPropagation();          // (a tap on it does not turn the camera)
  btn.onclick = () => {
    btn.disabled = true; btn.textContent = '…กำลังสลับโลก';
    try {
      sessionStorage.setItem(KEY, JSON.stringify({
        map, x: player.position.x, z: player.position.z, heading: player.heading,
        camYaw: player.camYaw, camPitch: player.camPitch, camDist: player.camDist,
        hour: tod ? tod.hour : null, auto: tod ? tod.auto : null,
      }));
    } catch (e) { /* the other world opens at its start */ }
    const to = new URL(location.href);
    if (cursed) to.searchParams.delete('curse'); else to.searchParams.set('curse', '1');
    location.replace(to.href);
  };
  document.body.append(btn);
  document.body.classList.add('world');
  return { button: btn, restored };
}
