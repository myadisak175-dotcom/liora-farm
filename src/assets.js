// Loads the exact original hand-painted Liora Farm atlas from the known-good
// liora-farm-test build. The historical repo copy contains the original WebP
// Base64 payload with only its 16-character WebP header removed.

const TILE_W = 192;
const TILE_H = 96;
const ORIGINAL_WEBP_HEADER = "UklGRv57BgBXRUJQ";
const ORIGINAL_ATLAS_TAIL_URL = "https://raw.githubusercontent.com/myadisak175-dotcom/liora-farm/242933325bbee41f2eb53c7600ed28ed9144b3ac/assets/tiles-atlas.webp";

const FRAMES = {
  "assets/edges/edge_ne_0.png":[0,0], "assets/edges/edge_ne_1.png":[192,0], "assets/edges/edge_ne_2.png":[384,0],
  "assets/edges/edge_nw_0.png":[576,0], "assets/edges/edge_nw_1.png":[768,0], "assets/edges/edge_nw_2.png":[960,0],
  "assets/edges/edge_se_0.png":[0,96], "assets/edges/edge_se_1.png":[192,96], "assets/edges/edge_se_2.png":[384,96],
  "assets/edges/edge_sw_0.png":[576,96], "assets/edges/edge_sw_1.png":[768,96], "assets/edges/edge_sw_2.png":[960,96],
  "assets/ground/dirt/dirt_00.png":[0,192], "assets/ground/dirt/dirt_01.png":[192,192], "assets/ground/dirt/dirt_02.png":[384,192], "assets/ground/dirt/dirt_03.png":[576,192],
  "assets/ground/dirt/dirt_04.png":[768,192], "assets/ground/dirt/dirt_05.png":[960,192], "assets/ground/dirt/dirt_06.png":[0,288], "assets/ground/dirt/dirt_07.png":[192,288],
  "assets/ground/grass/grass_00.png":[384,288], "assets/ground/grass/grass_01.png":[576,288], "assets/ground/grass/grass_02.png":[768,288], "assets/ground/grass/grass_03.png":[960,288],
  "assets/ground/grass/grass_04.png":[0,384], "assets/ground/grass/grass_05.png":[192,384], "assets/ground/grass/grass_06.png":[384,384], "assets/ground/grass/grass_07.png":[576,384],
  "assets/ground/water/water_00.png":[768,384], "assets/ground/water/water_01.png":[960,384], "assets/ground/water/water_02.png":[0,480], "assets/ground/water/water_03.png":[192,480],
  "assets/ground/water/water_04.png":[384,480], "assets/ground/water/water_05.png":[576,480], "assets/ground/water/water_06.png":[768,480], "assets/ground/water/water_07.png":[960,480]
};

const GROUND_PATHS = {
  grass:{"00":"assets/ground/grass/grass_00.png","02":"assets/ground/grass/grass_01.png","11":"assets/ground/grass/grass_02.png","13":"assets/ground/grass/grass_03.png","20":"assets/ground/grass/grass_04.png","22":"assets/ground/grass/grass_05.png","31":"assets/ground/grass/grass_06.png","33":"assets/ground/grass/grass_07.png"},
  dirt:{"00":"assets/ground/dirt/dirt_00.png","02":"assets/ground/dirt/dirt_01.png","11":"assets/ground/dirt/dirt_02.png","13":"assets/ground/dirt/dirt_03.png","20":"assets/ground/dirt/dirt_04.png","22":"assets/ground/dirt/dirt_05.png","31":"assets/ground/dirt/dirt_06.png","33":"assets/ground/dirt/dirt_07.png"},
  water:{"00":"assets/ground/water/water_00.png","02":"assets/ground/water/water_01.png","11":"assets/ground/water/water_02.png","13":"assets/ground/water/water_03.png","20":"assets/ground/water/water_04.png","22":"assets/ground/water/water_05.png","31":"assets/ground/water/water_06.png","33":"assets/ground/water/water_07.png"}
};

const EDGE_PATHS = {
  nw:["assets/edges/edge_nw_0.png","assets/edges/edge_nw_1.png","assets/edges/edge_nw_2.png"],
  ne:["assets/edges/edge_ne_0.png","assets/edges/edge_ne_1.png","assets/edges/edge_ne_2.png"],
  se:["assets/edges/edge_se_0.png","assets/edges/edge_se_1.png","assets/edges/edge_se_2.png"],
  sw:["assets/edges/edge_sw_0.png","assets/edges/edge_sw_1.png","assets/edges/edge_sw_2.png"]
};

async function loadAtlasImage(){
  const res = await fetch(ORIGINAL_ATLAS_TAIL_URL, { cache: "no-store" });
  if(!res.ok) throw new Error(`โหลด texture ต้นฉบับไม่ได้ (${res.status})`);
  const tail = (await res.text()).trim();
  const b64 = ORIGINAL_WEBP_HEADER + tail;
  if(!b64.startsWith("UklGRv57BgBXRUJQZCL77")) throw new Error("ข้อมูล texture ต้นฉบับไม่ตรงกับเวอร์ชันที่อนุมัติ");

  const image = new Image();
  image.src = `data:image/webp;base64,${b64}`;
  await image.decode();
  if(image.naturalWidth !== 1152 || image.naturalHeight !== 576){
    throw new Error(`ขนาด texture atlas ผิด: ${image.naturalWidth}x${image.naturalHeight}`);
  }
  return image;
}

function slice(atlas,path){
  const pos = FRAMES[path];
  if(!pos) throw new Error(`ไม่พบ tile ใน atlas: ${path}`);
  const canvas = document.createElement("canvas");
  canvas.width = TILE_W;
  canvas.height = TILE_H;
  canvas.getContext("2d").drawImage(atlas,pos[0],pos[1],TILE_W,TILE_H,0,0,TILE_W,TILE_H);
  return canvas;
}

export async function loadAssets(){
  const atlas = await loadAtlasImage();
  const ground = {grass:{},dirt:{},water:{}};
  for(const [layer,variants] of Object.entries(GROUND_PATHS)){
    for(const [key,path] of Object.entries(variants)) ground[layer][key] = slice(atlas,path);
  }
  const edges = {};
  for(const [dir,paths] of Object.entries(EDGE_PATHS)) edges[dir] = paths.map(path=>slice(atlas,path));
  return {ground,edges};
}
