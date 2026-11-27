// Pose Vivi over the library idle. solveLimb places a bent elbow or knee from an
// anatomical pole, then the end joint keeps its grip or its planted orientation.
import * as THREE from 'three';

const UP=new THREE.Vector3(0,1,0);
const temp=new THREE.Vector3(), rotation=new THREE.Quaternion(), parentQ=new THREE.Quaternion();
function setWorldRotation(bone,q) {
  bone.parent.getWorldQuaternion(parentQ);
  bone.quaternion.copy(parentQ.invert()).multiply(q);
  bone.updateWorldMatrix(false,true);
}
function rotateWorld(bone,axis,angle) {
  bone.getWorldQuaternion(rotation);
  rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(axis,angle));
  setWorldRotation(bone,rotation);
}
function pointBone(bone,child,goal) {
  const a=bone.getWorldPosition(new THREE.Vector3());
  const oldDirection=child.getWorldPosition(new THREE.Vector3()).sub(a).normalize();
  const newDirection=temp.copy(goal).sub(a).normalize();
  const q=new THREE.Quaternion().setFromUnitVectors(oldDirection,newDirection);
  setWorldRotation(bone,q.multiply(bone.getWorldQuaternion(rotation)));
}
function solveLimb(limb,goal,pole,endRotation) {
  const [upper,lower,end]=limb;
  const a=upper.getWorldPosition(new THREE.Vector3()), b=lower.getWorldPosition(new THREE.Vector3());
  const c=end.getWorldPosition(new THREE.Vector3());
  const l1=a.distanceTo(b),l2=b.distanceTo(c);
  const axis=goal.clone().sub(a);
  const dist=THREE.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.0001,l1+l2-.0001);
  axis.normalize();
  const bend=pole.clone().sub(a);
  bend.addScaledVector(axis,-bend.dot(axis)).normalize();
  const along=(l1*l1+dist*dist-l2*l2)/(2*dist);
  const mid=a.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
  pointBone(upper,lower,mid);
  pointBone(lower,end,a.addScaledVector(axis,dist));
  setWorldRotation(end,endRotation);
}

export function createFishingRig(character) {
  const {object,model}=character;
  character.mixer.setTime(0);
  object.updateMatrixWorld(true);
  const bone=name=>model.getObjectByName('J_Bip_'+name);
  const hips=bone('C_Hips'),spine=bone('C_Spine'),chest=bone('C_Chest'),neck=bone('C_Neck');
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(object.quaternion);
  const side=new THREE.Vector3().crossVectors(forward,UP).normalize();
  const point=(f,y,r)=>new THREE.Vector3(0,y,0).addScaledVector(forward,f).addScaledVector(side,r);
  function limb(s,names){return names.map(n=>bone(s+'_'+n));}
  const arms=['R','L'].map(s=>limb(s,['UpperArm','LowerArm','Hand']));
  const legs=['R','L'].map(s=>limb(s,['UpperLeg','LowerLeg','Foot']));
  const feet=legs.map((leg,i)=>{
    const sign=i===0?1:-1;
    return {goal:leg[2].getWorldPosition(new THREE.Vector3()).addScaledVector(forward,-sign*.038).addScaledVector(side,.018*sign),
      rotation:leg[2].getWorldQuaternion(new THREE.Quaternion())};
  });
  const saved=[hips,spine,chest,neck,...arms.flat(),...legs.flat()].map(b=>({b,q:b.quaternion.clone(),p:b.position.clone()}));
  // Handle passes through the inside of the curled first knuckles, in hand-local metres.
  const palmOffsets=arms.map((arm,i)=>{
    const finger=bone((i===0?'R':'L')+'_Middle1');
    return finger.position.clone().multiplyScalar(.77).add(new THREE.Vector3(0,-.010,-.006));
  });
  const fist=[];
  for(const sideName of ['R','L'])for(const finger of ['Index','Middle','Ring','Little'])for(let n=1;n<=3;n++){
    const b=bone(sideName+'_'+finger+n);
    if(b)fist.push({b,sign:sideName==='R'?-1:1,n});
  }
  // Close the fingers around the narrow rod instead of the torch from the source idle.
  for(const {b,sign,n} of fist) {
    const rest=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),sign*(n===1?.62:n===2?.90:.65));
    b.quaternion.slerp(rest,.72);
  }
  const grip=new THREE.Vector3(),axis=new THREE.Vector3(),reelHub=new THREE.Vector3(),knob=new THREE.Vector3();
  function pose(p) {
    for(const {b,q,p:position} of saved){b.quaternion.copy(q);b.position.copy(position);}
    object.updateMatrixWorld(true);
    const h=hips.getWorldPosition(new THREE.Vector3()).addScaledVector(forward,p.shift);
    h.y-=p.drop;
    hips.position.copy(hips.parent.worldToLocal(h));
    hips.updateWorldMatrix(false,true);
    for(const [joint,lean,turn] of [[hips,.24,.23],[spine,.36,.35],[chest,.40,.42],[neck,-.46,-.43]]) {
      rotateWorld(joint,side,-p.lean*lean);
      rotateWorld(joint,UP,p.turn*turn);
    }
    legs.forEach((leg,i)=>solveLimb(leg,feet[i].goal,point(.90,.57,i===0?.18:-.18),feet[i].rotation));

    // Roll the rod across the right palm. The left hand circles its own reel axle.
    const azimuth=.10+p.turn*.31;
    const heading=forward.clone().multiplyScalar(Math.cos(azimuth)).addScaledVector(side,Math.sin(azimuth));
    axis.copy(heading).multiplyScalar(Math.cos(p.pitch)).addScaledVector(UP,Math.sin(p.pitch)).normalize();
    const cross=new THREE.Vector3().crossVectors(heading,UP).normalize();
    const radial=new THREE.Vector3().crossVectors(axis,cross).normalize();
    const handX=radial.clone().multiplyScalar(.87).addScaledVector(cross,-.49).normalize();
    const handZ=axis.clone().negate(), handY=new THREE.Vector3().crossVectors(handZ,handX).normalize();
    const rightQ=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(handX,handY,handZ));
    const handle=point(p.reach,p.height,p.side);
    const wrist=(position,offset,q)=>position.clone().sub(offset.clone().multiplyScalar(character.size).applyQuaternion(q));
    solveLimb(arms[0],wrist(handle,palmOffsets[0],rightQ),point(-.24,1.00,.64),rightQ);
    grip.copy(arms[0][2].localToWorld(palmOffsets[0].clone()));
    // Read shaft direction back from the posed wrist, including any IK reach limit.
    axis.set(0,0,-1).applyQuaternion(arms[0][2].getWorldQuaternion(rotation)).normalize();
    reelHub.copy(grip).addScaledVector(axis,-.11).addScaledVector(radial,.040);
    const leftTarget=reelHub.clone().addScaledVector(cross,-.075).addScaledVector(axis,.045*Math.cos(p.crank)).addScaledVector(radial,.045*Math.sin(p.crank));
    const leftX=handX.clone().negate(), leftY=new THREE.Vector3().crossVectors(handZ,leftX).normalize();
    const leftQ=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(leftX,leftY,handZ));
    solveLimb(arms[1],wrist(leftTarget,palmOffsets[1],leftQ),point(-.19,.91,-.59),leftQ);
    knob.copy(arms[1][2].localToWorld(palmOffsets[1].clone()));
    object.updateMatrixWorld(true);
    return {grip,axis,reelHub,knob};
  }
  return {pose};
}