import * as THREE from "three";

const INITIAL_CAPACITY = 32;
const WHITE = new THREE.Color(1, 1, 1);

/**
 * One draw call per plant *type* instead of one per placed plant.
 *
 * Only ground cover goes through here (`asset.instanced`, set for World V2
 * `kind: "plant"`). That split is deliberate, because instancing is not a free
 * win — it trades away per-object frustum culling. An `InstancedMesh` is
 * submitted or skipped as a whole, so 200 scattered grass clumps are always
 * drawn even when most are off screen. For a 58-tri clump that is still far
 * cheaper than 200 culled draw calls; for a 7,000-tri tree it would not be, and
 * trees are placed in tens, not hundreds. Trees, rocks and buildings therefore
 * stay on Builder's ordinary Object3D path, where culling and selection are
 * simpler and worth more.
 *
 * This owns GPU buffers only. It never decides what exists, never touches
 * persistence, and never reads the catalog beyond what Builder hands it.
 */
export function createInstancedPools({ scene }) {
  const group = new THREE.Group();
  group.name = "BuilderInstances";
  scene.add(group);

  const pools = new Map(); // assetId -> pool
  const owners = new Map(); // itemId -> pool

  const matrix = new THREE.Matrix4();
  const holder = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const movedColor = new THREE.Color();

  /**
   * A mesh whose material is an array needs per-group draws, which defeats the
   * point. Nothing in the plant set is built that way; refusing is cheaper than
   * a half-working special case, and Builder simply keeps that asset on the
   * ordinary path.
   */
  function collectParts(model) {
    const parts = [];
    let usable = true;
    model.traverse((node) => {
      if (!node?.isMesh || !node.geometry || !node.material) return;
      if (Array.isArray(node.material)) usable = false;
      parts.push({
        geometry: node.geometry,
        material: node.material,
        // Animated shadow depth is prepared before pooling. Carry the same
        // shared material onto the InstancedMesh so the shadow pass bends each
        // instance with the same world-position phase as the colour pass.
        customDepthMaterial: node.customDepthMaterial ?? null,
        // The model is unparented here, so its world matrix is the mesh's
        // offset inside the asset — exactly what each instance has to bake in.
        local: node.matrixWorld.clone(),
        castShadow: node.castShadow,
        receiveShadow: node.receiveShadow,
      });
    });
    return usable && parts.length ? parts : null;
  }

  function makeMesh(part, capacity) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = part.castShadow;
    mesh.receiveShadow = part.receiveShadow;
    if (part.customDepthMaterial) mesh.customDepthMaterial = part.customDepthMaterial;
    mesh.count = 0;
    // An InstancedMesh's own bounding sphere covers every instance, so Three.js
    // would otherwise cull the whole pool by the geometry's sphere at the
    // origin — the pool would blink out as soon as the origin left the screen.
    // `computeBoundingSphere()` after every edit keeps culling and raycasting
    // honest instead.
    mesh.frustumCulled = true;
    return mesh;
  }

  function createPool(assetId, parts, metrics) {
    const pool = {
      assetId,
      parts,
      capacity: INITIAL_CAPACITY,
      count: 0,
      items: [],
      indexOf: new Map(),
      holders: [],
      scaleNormalization: metrics.scaleNormalization,
      baseOffset: metrics.baseOffset,
      meshes: parts.map((part) => makeMesh(part, INITIAL_CAPACITY)),
    };
    for (const mesh of pool.meshes) {
      mesh.userData.assetId = assetId;
      group.add(mesh);
    }
    pools.set(assetId, pool);
    return pool;
  }

  /**
   * Doubles capacity by replacing the meshes and replaying every instance from
   * `pool.holders`, rather than copying the raw instance buffer across. The
   * holder matrices are the source of truth, so a rebuild cannot silently
   * inherit a stale or differently-laid-out buffer.
   */
  function grow(pool) {
    const capacity = pool.capacity * 2;
    const previous = pool.meshes;

    pool.meshes = pool.parts.map((part, index) => {
      const mesh = makeMesh(part, capacity);
      mesh.userData.assetId = pool.assetId;
      group.remove(previous[index]);
      group.add(mesh);
      return mesh;
    });
    pool.capacity = capacity;

    for (let index = 0; index < pool.count; index += 1) {
      writeInstance(pool, index);
      for (let i = 0; i < pool.meshes.length; i += 1) {
        if (!previous[i].instanceColor) continue;
        previous[i].getColorAt(index, movedColor);
        pool.meshes[i].setColorAt(index, movedColor);
      }
    }

    // Frees the old instance buffers only — geometry and material are shared
    // with the Builder catalog and must survive.
    for (const mesh of previous) mesh.dispose();
  }

  function writeInstance(pool, index) {
    const base = pool.holders[index];
    for (let i = 0; i < pool.meshes.length; i += 1) {
      matrix.multiplyMatrices(base, pool.parts[i].local);
      pool.meshes[i].setMatrixAt(index, matrix);
    }
  }

  /**
   * Recomputing a pool's bounds is O(instances), and sculpting re-snaps *every*
   * placed object to the new terrain on every frame of a brush stroke. Doing it
   * inside each `update()` would therefore cost O(instances²) per frame and
   * turn a 200-plant island into a slideshow the moment you touched the sculpt
   * brush.
   *
   * Publishing the matrices is O(1) and stays immediate; only the bounds pass
   * is coalesced, so a whole sync collapses into one recompute per pool.
   */
  const pendingBounds = new Set();
  let boundsScheduled = false;

  function commitBounds() {
    boundsScheduled = false;
    for (const pool of pendingBounds) {
      for (const mesh of pool.meshes) mesh.computeBoundingSphere();
    }
    pendingBounds.clear();
  }

  function flush(pool) {
    for (const mesh of pool.meshes) {
      mesh.count = pool.count;
      mesh.instanceMatrix.needsUpdate = true;
    }
    pendingBounds.add(pool);
    if (boundsScheduled) return;
    boundsScheduled = true;
    queueMicrotask(commitBounds);
  }

  function composeHolder(pool, item, groundY) {
    const totalScale = item.scale * pool.scaleNormalization;
    position.set(item.x, groundY - pool.baseOffset * totalScale, item.z);
    quaternion.setFromAxisAngle(upAxis, item.rotation);
    scale.setScalar(totalScale);
    return holder.compose(position, quaternion, scale);
  }

  return {
    group,

    has(assetId) {
      return pools.has(assetId);
    },

    holds(itemId) {
      return owners.has(itemId);
    },

    /**
     * Builds the pool for an asset from one already-loaded, already-decorated
     * model. Returns false when the asset cannot be instanced, so Builder can
     * fall back to a normal Object3D.
     */
    ensure(assetId, model, metrics) {
      if (pools.has(assetId)) return true;
      model.updateMatrixWorld?.(true);
      const parts = collectParts(model);
      if (!parts) return false;
      createPool(assetId, parts, metrics);
      return true;
    },

    add(item, groundY) {
      const pool = pools.get(item.assetId);
      if (!pool || owners.has(item.id)) return false;
      if (pool.count === pool.capacity) grow(pool);

      const index = pool.count;
      pool.count += 1;
      pool.items[index] = item.id;
      pool.indexOf.set(item.id, index);
      pool.holders[index] = composeHolder(pool, item, groundY).clone();
      owners.set(item.id, pool);
      writeInstance(pool, index);
      flush(pool);
      return true;
    },

    update(item, groundY) {
      const pool = owners.get(item.id);
      if (!pool) return false;
      const index = pool.indexOf.get(item.id);
      pool.holders[index].copy(composeHolder(pool, item, groundY));
      writeInstance(pool, index);
      flush(pool);
      return true;
    },

    /** Swap-remove: the last instance fills the hole so the range stays dense. */
    remove(itemId) {
      const pool = owners.get(itemId);
      if (!pool) return false;
      const index = pool.indexOf.get(itemId);
      const last = pool.count - 1;

      if (index !== last) {
        const movedId = pool.items[last];
        pool.holders[index].copy(pool.holders[last]);
        pool.items[index] = movedId;
        pool.indexOf.set(movedId, index);
        writeInstance(pool, index);
        // The instance that moved keeps whatever tint it had.
        for (const mesh of pool.meshes) {
          if (!mesh.instanceColor) continue;
          mesh.getColorAt(last, movedColor);
          mesh.setColorAt(index, movedColor);
          mesh.instanceColor.needsUpdate = true;
        }
      }

      pool.count -= 1;
      pool.items.length = pool.count;
      pool.indexOf.delete(itemId);
      owners.delete(itemId);
      flush(pool);
      return true;
    },

    clear() {
      for (const pool of pools.values()) {
        pool.count = 0;
        pool.items.length = 0;
        pool.indexOf.clear();
        flush(pool);
      }
      owners.clear();
    },

    /**
     * Selection tint. Instanced plants use a per-instance colour multiply
     * rather than the emissive clone Builder gives a single Object3D: one
     * material is shared by every copy, so tinting it would light up the whole
     * island. Same signal, no extra draw call, and nothing to unwind.
     */
    tint(itemId, color) {
      const pool = owners.get(itemId);
      if (!pool) return false;
      const index = pool.indexOf.get(itemId);
      for (const mesh of pool.meshes) {
        mesh.setColorAt(index, color ?? WHITE);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      return true;
    },

    /**
     * Raycast targets, not a raycast. Builder tests plants and Object3Ds in one
     * `intersectObjects` call so the nearest hit wins — picking pools
     * separately would let a distant tree beat the grass clump under the
     * finger.
     */
    pickTargets() {
      // Raycasting uses the bounding sphere as its broad phase, so any pending
      // bounds pass has to land before a tap is resolved.
      commitBounds();
      const meshes = [];
      for (const pool of pools.values()) {
        if (pool.count > 0) meshes.push(...pool.meshes);
      }
      return meshes;
    },

    /** The item id behind an intersection, or null if it was not a plant. */
    resolve(hit) {
      if (hit?.instanceId === undefined || hit.instanceId === null) return null;
      const pool = pools.get(hit.object?.userData?.assetId);
      return pool?.items[hit.instanceId] ?? null;
    },

    get stats() {
      let instances = 0;
      let drawCalls = 0;
      for (const pool of pools.values()) {
        instances += pool.count;
        if (pool.count > 0) drawCalls += pool.meshes.length;
      }
      return { pools: pools.size, instances, drawCalls };
    },

    dispose() {
      for (const pool of pools.values()) {
        for (const mesh of pool.meshes) mesh.dispose();
      }
      pools.clear();
      owners.clear();
      scene.remove(group);
    },
  };
}
