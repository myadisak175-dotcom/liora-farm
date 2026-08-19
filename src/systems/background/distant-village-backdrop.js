import * as THREE from "three";

/**
 * One authored village accent on the far horizon.
 *
 * Unlike the painted meadow / treeline / peaks rings, this texture is not
 * seamless and must not wrap around the whole world. A camera-facing sprite
 * keeps the authored village intact while still pinning it to one real world
 * direction, so it appears only when the player looks toward that horizon.
 */
export async function createDistantVillageBackdrop({
  url,
  radius = 500,
  bearingDeg = -135,
  y = 19,
  width = 165,
  tint = 0xffffff,
  haze = 0.14,
  renderOrder = -28.5,
  anisotropy = 1,
} = {}) {
  const group = new THREE.Group();
  group.name = "DistantVillageBackdrop";

  if (!url) {
    return {
      group,
      sprite: null,
      stats: { drawCalls: 0 },
      setAtmosphere() {},
      dispose() {},
    };
  }

  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.max(1, Number(anisotropy) || 1);

  const imageWidth = Number(texture.image?.naturalWidth || texture.image?.width || 0);
  const imageHeight = Number(texture.image?.naturalHeight || texture.image?.height || 0);
  const aspect = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 3;
  const spriteHeight = Math.max(1, Number(width) / Math.max(0.1, aspect));

  const base = new THREE.Color(tint);
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: base,
    transparent: true,
    opacity: 0.98,
    alphaTest: 0.02,
    depthTest: true,
    depthWrite: false,
    fog: false,
    toneMapped: true,
  });

  const angle = THREE.MathUtils.degToRad(Number(bearingDeg) || 0);
  const distance = Math.max(20, Number(radius) || 500);
  const sprite = new THREE.Sprite(material);
  sprite.name = "DistantVillage";
  sprite.position.set(Math.cos(angle) * distance, Number(y) || 0, Math.sin(angle) * distance);
  sprite.scale.set(Math.max(1, Number(width) || 165), spriteHeight, 1);
  sprite.renderOrder = Number.isFinite(renderOrder) ? renderOrder : -28.5;
  sprite.frustumCulled = true;
  group.add(sprite);

  const hazeAmount = THREE.MathUtils.clamp(Number(haze) || 0, 0, 1);

  return {
    group,
    sprite,
    stats: {
      drawCalls: 1,
      radius: distance,
      width: sprite.scale.x,
      height: sprite.scale.y,
      bearingDeg: Number(bearingDeg) || 0,
    },
    /** Match the existing painted horizon through sunset and night. */
    setAtmosphere(horizonColor) {
      if (!horizonColor) return;
      const luminance = horizonColor.r * 0.2126 + horizonColor.g * 0.7152 + horizonColor.b * 0.0722;
      const exposure = 0.22 + 0.78 * THREE.MathUtils.clamp(luminance, 0, 1);
      const eveningBlend = THREE.MathUtils.clamp(1 - luminance, 0, 1);
      material.color
        .copy(base)
        .lerp(horizonColor, THREE.MathUtils.clamp(hazeAmount + eveningBlend * 0.3, 0, 1))
        .multiplyScalar(exposure);
    },
    dispose() {
      group.remove(sprite);
      material.dispose();
      texture.dispose();
      group.clear();
    },
  };
}
