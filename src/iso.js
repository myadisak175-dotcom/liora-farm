import { TILE_W, TILE_H } from "./config.js";
export function tileToWorld(i,j){ return {x:((i-j)*TILE_W)/2,y:((i+j)*TILE_H)/2}; }
export function worldToTile(x,y){ const a=x/(TILE_W/2); const b=y/(TILE_H/2); return {i:(b+a)/2,j:(b-a)/2}; }
export function variantKey(i,j){ const a=(((i-j)%4)+4)%4; const b=(((i+j)%4)+4)%4; return `${a}${b}`; }
export function stableIndex(i,j,count){ const h=(i*73856093)^(j*19349663); return ((h%count)+count)%count; }
