// The authored toon props, shared across all maps. GLBs are mobile LODs of the Blender sources.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as N from './stylized-nature.js';

export async function createForestForage({ level, onStep = async () => {} }) {
  await onStep('วางเห็ดและบลูเบอร์รี');
  const loader = new GLTFLoader();
  const [mushroom, berries] = await Promise.all(['mushroom', 'blueberries'].map(n => loader.loadAsync(new URL(`./assets/forage/${n}.glb`, import.meta.url).href)));
  const group = new THREE.Group(); group.name = 'forest-forage';
  const items = [], s = level.spawn, dry = (x,z) => {
    const y = level.heightAt(x,z), p = {x,z};
    if (level.confine) level.confine(p);
    return Number.isFinite(y) && Math.hypot(p.x-x,p.z-z)<.1 && level.waterDepthAt(x,z)<.04
      && Math.abs(level.heightAt(x+.5,z)-y)<.5 && Math.abs(level.heightAt(x,z+.5)-y)<.5;
  };
  const open = (x,z,r) => dry(x,z) && !level.colliders.some(([cx,cz,cr])=>Math.hypot(cx-x,cz-z)<cr+r);
  const bushSites = [];
  const candidates=[[0,-3.2],[2.7,-2.7],[-2.7,-2.7],[3,-4],[-4,-5],[5,-10],[-6,-13],[9,-6],[-9,-4],[4,5],[-4,6],[12,2],[-12,2]];
  // Search more than a handful of fixed points: a map's rocks/river can occupy all of them.
  for(const r of [3.5,5,7,10,14]) for(let k=0;k<16;k++) {
    const a=(s.yaw||0)+k*Math.PI/8;candidates.push([Math.sin(a)*r,Math.cos(a)*r]);
  }
  for (const [dx,dz] of candidates) {
    const x=s.x+dx,z=s.z+dz;
    if(open(x,z,1.25) && bushSites.every(p=>Math.hypot(p.x-x,p.z-z)>4)) bushSites.push({x,z,y:level.heightAt(x,z)});
    if(bushSites.length===4) break;
  }
  if (!bushSites.length) console.warn('No dry, open blueberry site near spawn');
  const plants=bushSites.map((p,i)=>({kind:'bush',type:'round',seed:781+i,x:p.x,y:p.y,z:p.z,scale:.5,rotY:i*1.7}));
  if(plants.length) group.add(N.createForest(plants));
  const branchGeo=new THREE.CylinderGeometry(.012,.023,1,5), branchMat=new THREE.MeshBasicMaterial({color:'#795239'});
  bushSites.forEach((p,i)=>{
    // Both bunches are attached to visible outer branches, not resting on the ground.
    for(let j=0;j<2;j++) {
      // A .5-scale shrub's core radius is about .65m, with leaf cards reaching ~1m.
      // Keep the whole bunch beyond that envelope and well above the tall grass.
      const a=i*1.7+j*2.7+.5, end=new THREE.Vector3(p.x+Math.sin(a)*1.38,p.y+1.12+j*.15,p.z+Math.cos(a)*1.38);
      const start=new THREE.Vector3(p.x,p.y+.15,p.z), v=end.clone().sub(start);
      const branch=new THREE.Mesh(branchGeo,branchMat); branch.position.copy(start).addScaledVector(v,.5);
      branch.scale.y=v.length(); branch.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()); group.add(branch);
      items.push({id:`b${i}-${j}`,kind:'blueberry',x:end.x,z:end.z,y:end.y-.08,scale:.18,yaw:a});
    }
    // Berry shrubs block walking, just like the other shrubs on the map.
    level.colliders.push([p.x,p.z,.55]);
  });
  // Prefer genuine tree feet on accessible ground, ordered from the player's start.
  const trunks=[...(level.cameraTrunks||[])].sort((a,b)=>Math.hypot(a[0]-s.x,a[1]-s.z)-Math.hypot(b[0]-s.x,b[1]-s.z));
  for(const [x,z,r] of trunks) {
    if(items.filter(p=>p.kind==='mushroom').length>=12) break;
    if(Math.hypot(x-s.x,z-s.z)>45) continue;
    for(const a of [.6,2.9]) {
      const px=x+Math.sin(a)*(r+.48),pz=z+Math.cos(a)*(r+.48);
      if(!open(px,pz,.12)) continue;
      if(bushSites.some(p=>Math.hypot(p.x-px,p.z-pz)<1.3)) continue;
      items.push({id:`m${items.length}`,kind:'mushroom',x:px,z:pz,y:level.heightAt(px,pz),scale:.23,yaw:a});
    }
  }
  // Also put two at the edge of the first berry shrub, so the new objects are easy to find.
  if(bushSites[0]) for(const [dx,dz] of [[1.25,.4],[1.65,.2]]) {
    const x=bushSites[0].x+dx,z=bushSites[0].z+dz;
    if(open(x,z,.12)) items.push({id:`starter${dx}`,kind:'mushroom',x,z,y:level.heightAt(x,z),scale:.23,yaw:dx});
  }
  const key=`liora.forage.v1.${level.group.userData.kind||'map'}`;
  let saved={picked:[],mushroom:0,blueberry:0};
  try {const d=JSON.parse(localStorage.getItem(key)||'null'); if(d&&Array.isArray(d.picked)) saved={...saved,...d};} catch{}
  const picked=new Set(saved.picked), banks=[];
  const matrix=new THREE.Matrix4(), q=new THREE.Quaternion(), pos=new THREE.Vector3(), sc=new THREE.Vector3();
  function itemMatrix(item) {
    q.setFromAxisAngle(new THREE.Vector3(0,1,0),item.yaw);pos.set(item.x,item.y,item.z);
    sc.setScalar(picked.has(item.id)?0:item.scale);return matrix.compose(pos,q,sc);
  }
  for(const [kind,asset] of [['mushroom',mushroom],['blueberry',berries]]) {
    const list=items.filter(p=>p.kind===kind); if(!list.length) continue;
    asset.scene.updateMatrixWorld(true);
    asset.scene.traverse(o=>{
      if(!o.isMesh) return;
      const geo=o.geometry.clone().applyMatrix4(o.matrixWorld);
      const mesh=new THREE.InstancedMesh(geo,o.material,list.length);mesh.name=`${kind}-instances`;
      list.forEach((p,i)=>mesh.setMatrixAt(i,itemMatrix(p))); mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();group.add(mesh);banks.push({mesh,list});
    });
  }
  const inventory=document.createElement('div');inventory.id='forage-bag';inventory.setAttribute('aria-live','polite');
  const button=document.createElement('button');button.id='forage-pick';button.hidden=true;
  const style=document.createElement('style');style.textContent=`
    #forage-bag{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(16px,env(safe-area-inset-bottom));z-index:4;padding:7px 12px;border-radius:20px;background:#263d2cce;color:white;font:13px system-ui;pointer-events:none}
    #forage-pick{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(70px + env(safe-area-inset-bottom));z-index:4;background:#fff5dbeF;color:#3b4925;border:2px solid #afc883;border-radius:24px;padding:14px 23px;font:600 16px system-ui;touch-action:manipulation}
    #forage-pick[hidden]{display:none}
    #forage-view{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:calc(60px + env(safe-area-inset-bottom));z-index:4;background:#435e33df;color:white;border:1px solid #dce8ba;border-radius:20px;padding:9px 13px;font:12px system-ui;touch-action:manipulation}
  `;document.head.append(style);document.body.append(inventory,button);
  const refresh=()=>{inventory.textContent=`🍄 ${saved.mushroom}　🫐 ${saved.blueberry}`;};refresh();
  let nearest=null,lastPosition=null,timer=0;
  const find=position=>{
    let best=null,distance=2.1;
    for(const item of items) {
      if(picked.has(item.id))continue;
      const d=Math.hypot(position.x-item.x,position.z-item.z);
      if(d<distance&&Math.abs(position.y-level.heightAt(item.x,item.z))<1.4){best=item;distance=d;}
    }
    return best;
  };
  const pick=()=>{
    // Re-check distance when clicked; a stale prompt never collects from across the map.
    const item=lastPosition&&find(lastPosition);if(!item)return;
    picked.add(item.id);saved[item.kind]+=item.kind==='blueberry'?4:1;saved.picked=[...picked];
    try{localStorage.setItem(key,JSON.stringify(saved));}catch{}
    for(const {mesh,list}of banks){const i=list.indexOf(item);if(i>=0){mesh.setMatrixAt(i,itemMatrix(item));mesh.instanceMatrix.needsUpdate=true;}}
    refresh();nearest=null;button.hidden=true;timer=.2;
  };
  button.addEventListener('pointerdown',e=>e.stopPropagation());button.onclick=pick;
  level.group.add(group);
  return {
    group,items,bushSites,stats:{mushrooms:items.filter(p=>p.kind==='mushroom').length,blueberryBunches:items.filter(p=>p.kind==='blueberry').length,bushes:bushSites.length},
    pick,
    update(dt,position){lastPosition=position;timer+=dt;if(timer<.12)return;timer=0;nearest=find(position);button.hidden=!nearest;if(nearest)button.textContent=nearest.kind==='mushroom'?'🍄 เก็บเห็ด':'🫐 เก็บบลูเบอร์รี';},
    visit(player){
      // Face a visible bunch directly, rather than the opaque middle of its bush.
      const item=items.find(p=>p.kind==='blueberry'&&!picked.has(p.id))||items.find(p=>!picked.has(p.id));
      if(!item)return;
      for(const delta of [0,.5,-.5,1,-1,Math.PI]){
        const a=item.yaw+delta,x=item.x+Math.sin(a)*1.8,z=item.z+Math.cos(a)*1.8;
        if(open(x,z,.6)){
          const yaw=Math.atan2(item.x-x,item.z-z);player.teleport(x,z,yaw);player.setView(yaw-Math.PI,.2,3.1);break;
        }
      }
    },
    dispose(){inventory.remove();button.remove();style.remove();group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});branchGeo.dispose();branchMat.dispose();}
  };
}