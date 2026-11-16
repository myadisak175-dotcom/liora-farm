// character-springs.js
// Hair, skirt, sleeves and chest that swing as she moves: VRM spring bones, solved by three-vrm's own spring-bone code
// (the same as any VRM viewer), rebuilt by bone name on a character whose VRM data was stripped for the web.
//
//   const springs = createSprings(model, data);   // model: her loaded scene; data: assets/characters/<id>.springs.json
//   springs.setScale(k);       // she is drawn k times her modelled size: the collision spheres grow with her
//   springs.reset();           // after a teleport: the hair starts at rest where she lands instead of whipping across the map
//   every frame, after her pose and her place in the world are set: springs.update(dt)
//
// Built the way three-vrm's VRMSpringBoneLoaderPlugin builds a VRM 0.x file's springs: every bone under a chain's root is
// a joint whose tail is its first child; collision spheres hang on body bones (head, chest, arms, legs).

import * as THREE from 'three';
import { VRMSpringBoneManager, VRMSpringBoneJoint, VRMSpringBoneCollider, VRMSpringBoneColliderShapeSphere } from '@pixiv/three-vrm-springbone';

export function createSprings(model, data) {
  const manager = new VRMSpringBoneManager();
  const byName = name => model.getObjectByName(name);
  const shapes = [];          // [shape, radius at modelled size]
  const joints = [];          // [joint, hit radius at modelled size]

  const groups = data.colliderGroups.map(g => {
    const bone = byName(g.bone);
    if (!bone) return null;
    return {
      colliders: g.colliders.map(c => {
        const shape = new VRMSpringBoneColliderShapeSphere({ offset: new THREE.Vector3(...c.offset), radius: c.radius, inside: false });
        const collider = new VRMSpringBoneCollider(shape);
        bone.add(collider);
        shapes.push([shape, c.radius]);
        return collider;
      }),
    };
  });

  for (const s of data.springs) {
    const settings = { hitRadius: s.hitRadius, dragForce: s.dragForce, gravityPower: s.gravityPower, stiffness: s.stiffness,
      gravityDir: new THREE.Vector3(...s.gravityDir) };
    const colliderGroups = s.colliderGroups.map(i => groups[i]).filter(Boolean);
    const center = s.center ? byName(s.center) : null;
    for (const rootName of s.roots) {
      const root = byName(rootName);
      if (!root) continue;
      root.traverse(node => {
        if (node instanceof VRMSpringBoneCollider) return;
        const child = node.children.find(c => !(c instanceof VRMSpringBoneCollider)) || null;
        const joint = new VRMSpringBoneJoint(node, child, settings, colliderGroups);
        if (center) joint.center = center;
        manager.addJoint(joint);
        joints.push([joint, s.hitRadius]);
      });
    }
  }
  model.updateMatrixWorld(true);
  manager.setInitState();

  let resetDue = false;
  return {
    manager,
    count: joints.length,
    setScale(k) {
      for (const [shape, r] of shapes) shape.radius = r * k;
      for (const [joint, r] of joints) joint.settings.hitRadius = r * k;
      resetDue = true;
    },
    reset() { resetDue = true; },
    update(dt) {
      if (resetDue) { resetDue = false; manager.reset(); return; }
      manager.update(Math.min(dt, 0.05));
    },
  };
}
