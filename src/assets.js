// โหลด texture atlas เพียงครั้งเดียว แล้วตัดเป็น tile canvas ตาม atlas.json
const ATLAS_MANIFEST = "assets/atlas.json";
function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error(`โหลดไม่ได้: ${src}`)); img.src = src; }); }
function sliceFrame(atlas, frame) { const canvas = document.createElement("canvas"); canvas.width = frame.w; canvas.height = frame.h; const ctx = canvas.getContext("2d"); ctx.drawImage(atlas, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h); return canvas; }
export async function loadAssets() {
  const manifest = await fetch(ATLAS_MANIFEST).then((response) => { if (!response.ok) throw new Error(`โหลดไม่ได้: ${ATLAS_MANIFEST}`); return response.json(); });
  const encodedAtlas = await fetch(`assets/${manifest.image}`).then((response) => { if (!response.ok) throw new Error(`โหลดไม่ได้: assets/${manifest.image}`); return response.text(); });
  const atlas = await loadImage(`data:image/webp;base64,${encodedAtlas.trim()}`);
  const cache = new Map();
  const getFrame = (path) => { if (cache.has(path)) return cache.get(path); const frame = manifest.frames[path]; if (!frame) throw new Error(`ไม่พบ frame ใน atlas: ${path}`); const tile = sliceFrame(atlas, frame); cache.set(path, tile); return tile; };
  const ground = {};
  for (const [layer, lookup] of Object.entries(manifest.ground)) { ground[layer] = {}; for (const [key, path] of Object.entries(lookup)) ground[layer][key] = getFrame(path); }
  const edges = {};
  for (const [direction, paths] of Object.entries(manifest.edges)) edges[direction] = paths.map(getFrame);
  return { ground, edges };
}
