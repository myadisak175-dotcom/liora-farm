// Render the full-resolution skinned actor. The grip and reel are projected from her hands.
import * as THREE from 'three';
import { loadCharacter } from '../stylized-character.js';
import { CHARACTER_ANIM } from './fishing-anim.js';
import { actorFrame, actorBox } from './fishing-motion.js?v=2';
import { createFishingRig } from './fishing-rig.js?v=2';

export async function loadAngler(canvas) {
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  try {
    const response=await fetch(new URL('../assets/characters/vivi.glb',import.meta.url));
    if(!response.ok) throw Error('Vivi '+response.status);
    const ch=await loadCharacter(await response.arrayBuffer(),CHARACTER_ANIM);
    renderer.setClearColor(0,0);
    renderer.setPixelRatio(Math.min(1.7,devicePixelRatio||1));
    const scene=new THREE.Scene();
    scene.add(ch.object);
    ch.setSize(1.65/ch.baseHeight);
    ch.object.rotation.y=2.1;
    const rig=createFishingRig(ch);
    const {width,height,worldHeight,centerX,top}=actorFrame;
    const worldWidth=worldHeight*width/height;
    const camera=new THREE.OrthographicCamera(centerX-worldWidth/2,centerX+worldWidth/2,top,top-worldHeight,.01,20);
    camera.position.set(0,1.12,6);
    camera.lookAt(0,0,0);
    camera.updateMatrixWorld();
    let box;
    function resize(v){
      box=actorBox(v);
      for(const key of ['width','height','left','top'])canvas.style[key]=box[key]+'px';
      renderer.setSize(Math.ceil(box.width),Math.ceil(box.height),false);
    }
    const temp=new THREE.Vector3();
    function project(position) {
      temp.copy(position).project(camera);
      return {x:box.left+(.5+.5*temp.x)*box.width,y:box.top+(.5-.5*temp.y)*box.height};
    }
    function frame(motion,v) {
      const {grip,axis,reelHub,knob}=rig.pose(motion.pose);
      const g=project(grip),unit=project(temp.copy(grip).add(axis));
      renderer.render(scene,camera);
      return {...g,dx:(unit.x-g.x)*1.65/v.s,dy:(g.y-unit.y)*1.65/v.s,hub:project(reelHub),knob:project(knob)};
    }
    return {resize,frame};
  } catch(error) {
    renderer.dispose();
    throw error;
  }
}
