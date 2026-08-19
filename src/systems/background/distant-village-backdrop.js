import * as THREE from "three";

function siblingAssetUrl(url, filename) {
  const source = String(url ?? "");
  const queryAt = source.indexOf("?");
  const clean = queryAt >= 0 ? source.slice(0, queryAt) : source;
  const slashAt = clean.lastIndexOf("/");
  return slashAt >= 0 ? `${clean.slice(0, slashAt + 1)}${filename}` : filename;
}

function prepareTexture(texture, anisotropy) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.max(1, Number(anisotropy) || 1);
  return texture;
}

function makeSprite({
  texture,
  name,
  angle,
  radius,
  y,
  width,
  tint,
  renderOrder,
  opacity = 0.98,
}) {
  const imageWidth = Number(texture.image?.naturalWidth || texture.image?.width || 0);
  const imageHeight = Number(texture.image?.naturalHeight || texture.image?.height || 0);
  const aspect = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 3;
  const resolvedWidth = Math.max(1, Number(width) || 1);
  const height = resolvedWidth / Math.max(0.1, aspect);
  const base = new THREE.Color(tint ?? 0xffffff);
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: base,
    transparent: true,
    opacity,
    alphaTest: 0.02,
    depthTest: true,
    depthWrite: false,
    fog: false,
    toneMapped: true,
  });

  const distance = Math.max(20, Number(radius) || 20);
  const sprite = new THREE.Sprite(material);
  sprite.name = name;
  // Authored cutouts contain transparent space above the artwork. Pinning near
  // the bottom turns y into a useful ground line instead of an image-centre
  // offset, and lets the nearer meadow hide just the base of each layer.
  sprite.center.set(0.5, 0.06);
  sprite.position.set(Math.cos(angle) * distance, Number(y) || 0, Math.sin(angle) * distance);
  sprite.scale.set(resolvedWidth, height, 1);
  sprite.renderOrder = renderOrder;
  sprite.frustumCulled = true;

  return { sprite, material, texture, base, radius: distance, width: resolvedWidth, height };
}

function tintForAtmosphere(layer, horizonColor, haze) {
  if (!layer || !horizonColor) return;
  const luminance = horizonColor.r * 0.2126 + horizonColor.g * 0.7152 + horizonColor.b * 0.0722;
  const exposure = 0.22 + 0.78 * THREE.MathUtils.clamp(luminance, 0, 1);
  const eveningBlend = THREE.MathUtils.clamp(1 - luminance, 0, 1);
  layer.material.color
    .copy(layer.base)
    .lerp(horizonColor, THREE.MathUtils.clamp(haze + eveningBlend * 0.3, 0, 1))
    .multiplyScalar(exposure);
}

/**
 * Authored horizon landmarks that do not repeat around the world.
 *
 * The village remains at -135 degrees with its small foreground hill. The
 * World Tree is an independent transparent sprite at 45 degrees, exactly the
 * opposite direction, so the two landmarks never compete in the same view.
 * Existing meadow / treeline / peaks bands are unchanged.
 */
export async function createDistantVillageBackdrop({
  url,
  foregroundUrl,
  worldTreeUrl,
  radius = 500,
  bearingDeg = -135,
  y = 9,
  // Slightly smaller than village2 so the town reads farther away and leaves
  // more mountain visible around its silhouette.
  width = 138,
  tint = 0xffffff,
  haze = 0.14,
  renderOrder = -28.5,
  // The grassy knoll sits a little closer than the village, but still behind
  // PaintedMeadow (radius 430 / renderOrder -28).
  foregroundRadius = 474,
  foregroundY = -3,
  foregroundWidth = 156,
  foregroundTint = 0xffffff,
  foregroundHaze = 0.08,
  foregroundRenderOrder = -28.25,
  // World Tree: one quiet landmark on the exact opposite horizon.
  worldTreeBearingDeg = 45,
  worldTreeRadius = 520,
  worldTreeY = 9,
  worldTreeWidth = 128,
  worldTreeTint = 0xffffff,
  worldTreeHaze = 0.16,
  worldTreeRenderOrder = -28.6,
  anisotropy = 1,
} = {}) {
  const group = new THREE.Group();
  group.name = "DistantVillageBackdrop";

  if (!url) {
    return {
      group,
      sprite: null,
      foreground: null,
      worldTree: null,
      stats: { drawCalls: 0 },
      setAtmosphere() {},
      dispose() {},
    };
  }

  const loader = new THREE.TextureLoader();
  const angle = THREE.MathUtils.degToRad(Number(bearingDeg) || 0);

  const villageTexture = prepareTexture(await loader.loadAsync(url), anisotropy);
  const village = makeSprite({
    texture: villageTexture,
    name: "DistantVillage",
    angle,
    radius,
    y,
    width,
    tint,
    renderOrder: Number.isFinite(renderOrder) ? renderOrder : -28.5,
  });
  group.add(village.sprite);

  let foreground = null;
  const resolvedForegroundUrl = foregroundUrl || siblingAssetUrl(url, "hill_front_layer.webp");
  if (resolvedForegroundUrl) {
    try {
      const foregroundTexture = prepareTexture(await loader.loadAsync(resolvedForegroundUrl), anisotropy);
      foreground = makeSprite({
        texture: foregroundTexture,
        name: "DistantVillageFrontHill",
        angle,
        radius: foregroundRadius,
        y: foregroundY,
        width: foregroundWidth,
        tint: foregroundTint,
        renderOrder: Number.isFinite(foregroundRenderOrder) ? foregroundRenderOrder : -28.25,
        opacity: 0.99,
      });
      group.add(foreground.sprite);
    } catch (error) {
      // Decorative only: keep the proven village/game alive if the hill fails.
      console.warn("Distant village foreground hill unavailable", error);
    }
  }

  let worldTree = null;
  const resolvedWorldTreeUrl = worldTreeUrl || siblingAssetUrl(url, "world_tree_background.webp");
  if (resolvedWorldTreeUrl) {
    try {
      const worldTreeTexture = prepareTexture(await loader.loadAsync(resolvedWorldTreeUrl), anisotropy);
      worldTree = makeSprite({
        texture: worldTreeTexture,
        name: "WorldTreeLandmark",
        angle: THREE.MathUtils.degToRad(Number(worldTreeBearingDeg) || 45),
        radius: worldTreeRadius,
        y: worldTreeY,
        width: worldTreeWidth,
        tint: worldTreeTint,
        renderOrder: Number.isFinite(worldTreeRenderOrder) ? worldTreeRenderOrder : -28.6,
        opacity: 0.98,
      });
      group.add(worldTree.sprite);
    } catch (error) {
      // The tree is a visual landmark only and must never block game startup.
      console.warn("World Tree landmark unavailable", error);
    }
  }

  const villageHaze = THREE.MathUtils.clamp(Number(haze) || 0, 0, 1);
  const hillHaze = THREE.MathUtils.clamp(Number(foregroundHaze) || 0, 0, 1);
  const treeHaze = THREE.MathUtils.clamp(Number(worldTreeHaze) || 0, 0, 1);

  return {
    group,
    sprite: village.sprite,
    foreground: foreground?.sprite ?? null,
    worldTree: worldTree?.sprite ?? null,
    stats: {
      drawCalls: 1 + (foreground ? 1 : 0) + (worldTree ? 1 : 0),
      radius: village.radius,
      width: village.width,
      height: village.height,
      bearingDeg: Number(bearingDeg) || 0,
      groundY: Number(y) || 0,
      foreground: foreground ? {
        radius: foreground.radius,
        width: foreground.width,
        height: foreground.height,
        groundY: Number(foregroundY) || 0,
      } : null,
      worldTree: worldTree ? {
        radius: worldTree.radius,
        width: worldTree.width,
        height: worldTree.height,
        bearingDeg: Number(worldTreeBearingDeg) || 45,
        groundY: Number(worldTreeY) || 0,
      } : null,
    },
    /** Match all authored cutouts to the established horizon at every hour. */
    setAtmosphere(horizonColor) {
      tintForAtmosphere(village, horizonColor, villageHaze);
      tintForAtmosphere(foreground, horizonColor, hillHaze);
      tintForAtmosphere(worldTree, horizonColor, treeHaze);
    },
    dispose() {
      for (const layer of [worldTree, foreground, village]) {
        if (!layer) continue;
        group.remove(layer.sprite);
        layer.material.dispose();
        layer.texture.dispose();
      }
      group.clear();
    },
  };
}
