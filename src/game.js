import { loadAssets } from "./assets.js";
import { Camera } from "./camera.js";
import { drawGround } from "./ground.js";
import { tileToWorld } from "./iso.js";
import { MAP_W, MAP_H } from "./map.js";
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const camera = new Camera();
let assets = null;
function resize() { const dpr = Math.min(window.devicePixelRatio || 1, 3); canvas.width = Math.floor(canvas.clientWidth * dpr); canvas.height = Math.floor(canvas.clientHeight * dpr); camera.resize(canvas.width, canvas.height); }
function frame() { ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle="#0e1410"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality="high"; camera.apply(ctx); drawGround(ctx,assets,camera.view); requestAnimationFrame(frame); }
let drag=null;
canvas.addEventListener("pointerdown",(e)=>{ drag={x:e.clientX,y:e.clientY}; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove",(e)=>{ if(!drag)return; const dpr=canvas.width/canvas.clientWidth; camera.panByPixels((e.clientX-drag.x)*dpr,(e.clientY-drag.y)*dpr); drag={x:e.clientX,y:e.clientY}; });
canvas.addEventListener("pointerup",()=>drag=null); canvas.addEventListener("pointercancel",()=>drag=null); window.addEventListener("resize",resize);
async function start(){ const status=document.getElementById("status"); try{ assets=await loadAssets(); }catch(err){ status.textContent=err.message; return; } status.remove(); resize(); const c=tileToWorld(MAP_H/2,MAP_W/2); camera.x=c.x; camera.y=c.y; requestAnimationFrame(frame); }
start();
