import { loadAssets } from "./assets.js";
import { Camera } from "./camera.js";
import { drawGround } from "./ground.js";
import { drawExits } from "./exits.js";
import { loadTreeAsset, drawTrees } from "./trees.js";
import { tileToWorld } from "./iso.js";
import { ZONES, currentZone, setZone, zoneSize } from "./world.js";
const canvas=document.getElementById("game"); const ctx=canvas.getContext("2d"); const camera=new Camera(); let assets=null; let showExits=true;
function resize(){ const dpr=Math.min(window.devicePixelRatio||1,3); canvas.width=Math.floor(canvas.clientWidth*dpr); canvas.height=Math.floor(canvas.clientHeight*dpr); camera.resize(canvas.width,canvas.height); }
function centreOnZone(){ const {h,w}=zoneSize(); const c=tileToWorld(h/2,w/2); camera.x=c.x; camera.y=c.y; }
function frame(){ ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle="#0e1410"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality="high"; camera.apply(ctx); drawGround(ctx,assets,camera.view); drawTrees(ctx); if(showExits)drawExits(ctx); requestAnimationFrame(frame); }
let drag=null; canvas.addEventListener("pointerdown",e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId)}); canvas.addEventListener("pointermove",e=>{if(!drag)return;const dpr=canvas.width/canvas.clientWidth;camera.panByPixels((e.clientX-drag.x)*dpr,(e.clientY-drag.y)*dpr);drag={x:e.clientX,y:e.clientY}}); canvas.addEventListener("pointerup",()=>drag=null); canvas.addEventListener("pointercancel",()=>drag=null); window.addEventListener("resize",resize);
function syncZoneBar(){ const id=currentZone().id; document.querySelectorAll("#zonebar button[data-zone]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.zone===id))); }
function buildZoneBar(){ const bar=document.getElementById("zonebar"); for(const [id,zone] of Object.entries(ZONES)){ const btn=document.createElement("button"); btn.textContent=zone.title; btn.dataset.zone=id; btn.onclick=()=>{setZone(id);centreOnZone();syncZoneBar()}; bar.appendChild(btn); } const toggle=document.createElement("button"); toggle.textContent="ทางออก"; toggle.setAttribute("aria-pressed","true"); toggle.onclick=()=>{showExits=!showExits;toggle.setAttribute("aria-pressed",String(showExits))}; bar.appendChild(toggle); syncZoneBar(); }
async function start(){ const status=document.getElementById("status"); try{ [assets]=await Promise.all([loadAssets(),loadTreeAsset()]); }catch(err){status.textContent=err.message;return} status.remove(); resize(); centreOnZone(); buildZoneBar(); requestAnimationFrame(frame); }
start();
