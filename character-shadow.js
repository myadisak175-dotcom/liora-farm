// character-shadow.js
// The walker's own shadow on the ground: her real outline, thrown along the sun's direction, moving as she moves.
//
// One job, two small parts:
//   picture : the character seen from the sun (a small camera with no perspective), drawn each frame into a little picture.
//             Only its coverage is kept: where she is in the way of the light.
//   ground  : a patch of ground-hugging mesh around her feet and along the shadow. It carries no picture coordinates of its
//             own: every pixel of it asks "seen from the sun, is she in front of me?" and darkens the ground if so. That is
//             what makes the outline land correctly on slopes, bumps and the river bed, and stretch when the sun is low.
// The shadow multiplies what is under it by the same cool tint as the trees' shadows, with a soft edge that widens away
// from her feet. Ground only: grass blades standing above the ground cover it, as they cover the ground itself.
//
// Where a tree's shadow already lies there is no sunlight left to block, so hers fades out inside it (shade, optional).
//
//   const shadow = createCharacterShadow({ character, heightAt: level.heightAt });   // character: { object, height }
//   scene.add(shadow.object);
//   shadow.update(renderer, player.position, sunDirection, strength);                // every frame, before the scene is drawn
import * as THREE from 'three';

const MIN_SUN = 0.3;        // a sun on the horizon would throw endless shadows (the same floor the trees' shadows use)

export function createCharacterShadow({
  character, heightAt,
  shade = null,                     // { texture, rect }: the level's picture of shadows already on the ground (red = how deep), rect = centre x, z, 1 / width
  tint = [0.5, 0.6, 0.76],          // what the light is multiplied by inside the shadow
  size = 256,                       // the picture, in pixels a side
  cell = 0.26,                      // the ground patch: metres between its points
  lift = 0.035,                     // how far above the ground it lies
} = {}) {
  const body = character.object, H = character.height || 1.6;
  const R = H * 0.72;               // half the picture's width in metres: she fits in it in any pose
  const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
  target.texture.minFilter = target.texture.magFilter = THREE.LinearFilter;
  target.texture.generateMipmaps = false;
  const eye = new THREE.OrthographicCamera(-R, R, R, -R, 0.1, 40);
  eye.layers.enableAll();                                                // whatever layers her parts are on
  const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

  // the longest the patch ever has to be: her height thrown at the lowest sun, and room for a downhill slope
  const maxLen = H * Math.sqrt(1 - MIN_SUN * MIN_SUN) / MIN_SUN;
  const NS = Math.ceil((maxLen * 1.35 + R * 2 + 0.8) / cell), NT = Math.ceil((R * 2 + 0.6) / cell);
  const pos = new Float32Array((NS + 1) * (NT + 1) * 3), idx = [];
  for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) {
    const a = i * (NT + 1) + j, b = a + NT + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);                             // facing up
  }
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3); aPos.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos);
  geo.setIndex(idx);
  const noShade = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); noShade.needsUpdate = true;
  const uniforms = {
    uPic: { value: target.texture }, uPicMatrix: { value: new THREE.Matrix4() }, uTexel: { value: 1 / size },
    uTint: { value: new THREE.Vector3(...tint) }, uK: { value: 1 },
    uFeet: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3(0, 1, 0) },
    uShade: { value: shade ? shade.texture : noShade }, uShadeRect: { value: shade ? shade.rect : new THREE.Vector3(0, 0, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform mat4 uPicMatrix;
      varying vec3 vW;
      varying vec2 vPic;
      void main() {
        vW = position;                                                   // the patch is laid out in world coordinates
        vPic = (uPicMatrix * vec4(position, 1.0)).xy;                    // where this point is in the sun's picture
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uPic, uShade;
      uniform float uTexel, uK;
      uniform vec3 uTint, uFeet, uSun, uShadeRect;
      varying vec3 vW;
      varying vec2 vPic;
      void main() {
        // outside the picture, or within its last few pixels: no shadow, and no hard cut where the picture ends
        vec2 edge = min(vPic, 1.0 - vPic);
        float inPic = smoothstep(0.0, 0.04, min(edge.x, edge.y));
        if (inPic <= 0.0) discard;
        // the edge is crisp at her feet and softens the further the shadow has travelled
        float r = uTexel * (1.3 + 4.0 * clamp(length(vW - uFeet) / 3.5, 0.0, 1.0));
        float a = texture2D(uPic, vPic).a * 4.0;
        a += (texture2D(uPic, vPic + vec2(r, 0.0)).a + texture2D(uPic, vPic - vec2(r, 0.0)).a
            + texture2D(uPic, vPic + vec2(0.0, r)).a + texture2D(uPic, vPic - vec2(0.0, r)).a) * 2.0;
        a += texture2D(uPic, vPic + vec2(r, r)).a + texture2D(uPic, vPic - vec2(r, r)).a
           + texture2D(uPic, vPic + vec2(r, -r)).a + texture2D(uPic, vPic - vec2(r, -r)).a;
        a *= 0.0625;
        // ground that lies between her and the sun cannot be in her shadow
        a *= 1.0 - smoothstep(0.35, 0.9, dot(vW - uFeet, uSun));
        // nor can ground that is already in a tree's shadow get any darker for her standing there
        a *= 1.0 - texture2D(uShade, (vW.xz - uShadeRect.xy) * uShadeRect.z + 0.5).r;
        a *= inPic * uK;
        gl_FragColor = vec4(mix(vec3(1.0), uTint, a), 1.0);              // multiplied onto what is under it
      }`,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  mat.userData.noGrade = true;                                           // it darkens light; the light of the hour is already in what it darkens
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'characterShadow';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 2;
  mesh.visible = false;

  const sun = new THREE.Vector3(), centre = new THREE.Vector3(), up = new THREE.Vector3(), clear = new THREE.Color();
  const laid = { x: NaN, z: NaN, sx: NaN, sz: NaN, len: NaN };

  // lay the patch over the ground: from behind her feet, along the shadow, as far as it can reach
  function lay(feet, sx, sz, len) {
    if (Math.abs(feet.x - laid.x) < 0.01 && Math.abs(feet.z - laid.z) < 0.01 && Math.abs(sx - laid.sx) < 1e-3 && Math.abs(sz - laid.sz) < 1e-3 && Math.abs(len - laid.len) < 0.01) return;
    laid.x = feet.x; laid.z = feet.z; laid.sx = sx; laid.sz = sz; laid.len = len;
    const s0 = -(R + 0.4), s1 = len * 1.35 + R + 0.4, t0 = -(R + 0.3), t1 = R + 0.3;
    const rows = Math.min(NS, Math.ceil((s1 - s0) / cell));              // a short shadow needs only the first rows of the patch
    geo.setDrawRange(0, rows * NT * 6);
    let o = 0;
    for (let i = 0; i <= rows; i++) {
      const s = s0 + (s1 - s0) * i / rows;
      for (let j = 0; j <= NT; j++) {
        const t = t0 + (t1 - t0) * j / NT;
        const x = feet.x + sx * s - sz * t, z = feet.z + sz * s + sx * t;
        pos[o++] = x; pos[o++] = heightAt(x, z) + lift; pos[o++] = z;
      }
    }
    aPos.needsUpdate = true;
  }

  return {
    object: mesh,
    // feet: where she stands.  dir: a vector pointing at the sun.  k: how strongly the sun casts, 0 (night) .. 1
    update(renderer, feet, dir, k = 1) {
      if (!(k > 0.02) || !(dir.y > 0.01)) { mesh.visible = false; return; }
      // the sun as the shadows see it: never lower than the floor
      const dxz = Math.hypot(dir.x, dir.z), ly = Math.max(MIN_SUN, dir.y / Math.hypot(dxz, dir.y));
      const flat = Math.sqrt(1 - ly * ly);
      if (dxz > 1e-5) sun.set(dir.x / dxz * flat, ly, dir.z / dxz * flat); else sun.set(0, 1, 0);
      const sx = dxz > 1e-5 ? -dir.x / dxz : 0, sz = dxz > 1e-5 ? -dir.z / dxz : 1;      // which way the shadow lies

      // ---- the picture: her, seen from the sun
      centre.set(feet.x, feet.y + H * 0.5, feet.z);
      eye.position.copy(centre).addScaledVector(sun, 12);
      up.set(sx, 0, sz);                                                 // the shadow's direction is "up" in the picture: never parallel to the sun
      if (flat < 1e-4) up.set(0, 0, 1);
      eye.up.copy(up);
      eye.lookAt(centre);
      eye.updateMatrixWorld();
      uniforms.uPicMatrix.value.copy(BIAS).multiply(eye.projectionMatrix).multiply(eye.matrixWorldInverse);
      const was = renderer.getRenderTarget(), wasAlpha = renderer.getClearAlpha(), wasAuto = renderer.autoClear;
      renderer.getClearColor(clear);
      body.updateWorldMatrix(true, false);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
      renderer.render(body, eye);
      renderer.setRenderTarget(was);
      renderer.setClearColor(clear, wasAlpha);
      renderer.autoClear = wasAuto;

      // ---- the ground under it
      lay(feet, sx, sz, H * flat / ly);
      uniforms.uFeet.value.copy(feet);
      uniforms.uSun.value.copy(sun);
      uniforms.uK.value = Math.min(1, k) * 0.85;
      mesh.visible = true;
    },
    dispose() { target.dispose(); geo.dispose(); mat.dispose(); noShade.dispose(); },
  };
}
