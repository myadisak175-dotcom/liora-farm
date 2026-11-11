// The original farm's mesh and UVs, repainted with broad, warm wood colours for the cozy village.
// Bake repeated placements into two meshes so the village stays cheap to draw on phones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propMaterial } from './stylized-props.js';

const SOURCES = {
  crates: new URL('./assets/models/builder/crate-stylized.glb', import.meta.url).href,
  barrels: new URL('./assets/models/builder/wine_barrel-stylized.glb', import.meta.url).href,
};

export async function loadLegacyWoodProps() {
  const loader = new GLTFLoader(), templates = new Map();
  const results = await Promise.allSettled(Object.entries(SOURCES).map(async ([kind, url]) => {
    const gltf = await loader.loadAsync(url), model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true), center = box.getCenter(new THREE.Vector3());
    const height = box.max.y - box.min.y;
    const normalize = new THREE.Matrix4().makeScale(1 / height, 1 / height, 1 / height)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
    const parts = [], maps = new Set();
    model.traverse(o => {
      if (!o.isMesh) return;
      const source = o.material, g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalize, o.matrixWorld));
      parts.push({ geometry: g, material: propMaterial(source.map) });
      if (source.map) maps.add(source.map);
      source.dispose(); o.geometry.dispose();
    });
    templates.set(kind, { parts, maps, placements: [] });
  }));
  results.forEach((result, i) => {
    if (result.status === 'rejected') console.warn('Original farm prop unavailable:', Object.keys(SOURCES)[i], result.reason);
  });

  return {
    // Returns false on a failed model load so the village can retain that stand-in.
    place(kind, x, z, yaw, heightAt, seed) {
      const template = templates.get(kind);
      if (!template) return false;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const items = kind === 'crates'
        ? [[0, 0, 0, 0.6, 0.2], [0.85, 0, 0.15, 0.5, -0.3], [0.15, 0.6, 0.05, 0.45, 0.7]]
        : [[0, 0, 0, 0.9, 0], [0.72, 0, 0.1, 0.8, 0.2], ...(seed % 2 ? [[0.3, 0, 0.62, 0.72, -0.3]] : [])];
      const base = heightAt(x, z) - 0.03;
      for (const [dx, dy, dz, h, turn] of items) {
        const wx = x + dx * c + dz * s, wz = z - dx * s + dz * c;
        const y = dy > 0 ? base + dy : heightAt(wx, wz) - 0.03;
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(wx, y, wz),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + turn), new THREE.Vector3(h, h, h));
        template.placements.push(matrix);
      }
      return true;
    },
    finish() {
      const group = new THREE.Group();
      group.name = 'legacyWoodProps';
      const resources = [];
      for (const [kind, template] of templates) {
        for (const part of template.parts) {
          const copies = template.placements.map(matrix => part.geometry.clone().applyMatrix4(matrix));
          if (copies.length) {
            const geometry = mergeGeometries(copies);
            const mesh = new THREE.Mesh(geometry, part.material);
            mesh.name = kind === 'crates' ? 'originalFarmCrates' : 'originalFarmBarrels';
            mesh.userData.modelCount = copies.length;
            group.add(mesh); resources.push(geometry);
          }
          copies.forEach(g => g.dispose()); part.geometry.dispose();
          resources.push(part.material);
        }
        resources.push(...template.maps);
      }
      group.userData.dispose = () => resources.forEach(resource => resource.dispose());
      return group;
    },
  };
}
