// Vivi's library cast and idle, plus the moving reel grip, projected back onto the tackle canvas.
import * as THREE from 'three';
import { loadCharacter } from '../stylized-character.js';
import { reach } from '../player-vault.js';
import { CHARACTER_ANIM } from './fishing-anim.js';

export async function loadAngler(canvas) {
  const response=await fetch(new URL('../assets/characters/vivi.glb',import.meta.url));
  if(!response.ok)throw Error('Vivi '+response.status);
  const ch=await loadCharacter(await response.arrayBuffer(),CHARACTER_ANIM);
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setClearColor(0,0);renderer.setPixelRatio(Math.min(1.7,devicePixelRatio||1));
  const scene=new THREE.Scene();scene.add(ch.object);ch.setSize(1.65/ch.baseHeight);
  ch.object.rotation.y=2.1;
  const camera=new THREE.OrthographicCamera(-1.14,1.14,1.91,-.22,.01,20);
  camera.position.set(0,1.12,6);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const pos=new THREE.Vector3(),right=new THREE.Vector3(),left=new THREE.Vector3();
  const arm=side=>['UpperArm','LowerArm','Hand','Middle1'].map(n=>ch.model.getObjectByName('J_Bip_'+side+'_'+n));
  const a=arm('R'),b=arm('L'),original=[...a.slice(0,3),...b.slice(0,3)].map(bone=>({bone,q:bone.quaternion.clone()}));
  const hand=a[3];let box,phase='',elapsed=0,work=0,blend=1,hasPose=false;
  function resize({x,y,s}){
    const height=s*2.13/1.65,width=height*2.28/2.13;
    box={width,height,left:x-width*.5,top:y-height*1.91/2.13};
    Object.assign(canvas.style,{width:width+'px',height:height+'px',left:box.left+'px',top:box.top+'px'});
    renderer.setSize(Math.ceil(width),Math.ceil(height),false);
  }
  function frame(state,dt){
    if(hasPose)for(const saved of original)saved.bone.quaternion.copy(saved.q);
    if(state.phase!==phase){phase=state.phase;ch.play(phase==='cast'?'cast':'idle',.16,false);ch.setRate(phase==='cast'?1.33/1.15:1);}
    ch.update(dt);elapsed+=dt;
    for(const saved of original)saved.q.copy(saved.bone.quaternion);
    ch.object.updateMatrixWorld(true);
    work+=(Number(phase==='reel'&&state.holding)-work)*(1-Math.exp(-dt*12));
    blend+=((phase==='cast'?0:1)-blend)*(1-Math.exp(-dt*18));
    right.set(.34,1.01+Math.sin(elapsed*2)*.014+work*.055,-.16);
    left.copy(right);left.x-=.105;left.y-=.045+Math.sin(elapsed*12)*.065*work;left.z-=.035+Math.cos(elapsed*12)*.055*work;
    reach(...a,right,blend);reach(...b,left,blend*.92);hasPose=true;
    hand.getWorldPosition(pos).project(camera);
    renderer.render(scene,camera);
    return {x:box.left+(pos.x*.5+.5)*box.width,y:box.top+(.5-pos.y*.5)*box.height};
  }
  return {resize,frame};
}
