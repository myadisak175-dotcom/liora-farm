// character-shadow.js
// The walker's own shadow: her real outline, thrown along the sun's direction, moving as she moves.
//
// One job, three small parts:
//   picture : the character seen from the sun (a small camera with no perspective), drawn each frame into a little picture.
//             Only its coverage is kept: where she is in the way of the light.
//   ground  : a patch of ground-hugging mesh around her feet and along the shadow. It carries no picture coordinates of its
//             own: every pixel of it asks "seen from the sun, is she in front of me?" and darkens the ground if so. That is
//             what makes the outline land correctly on slopes, bumps and the river bed, and stretch when the sun is low.
//   grass   : receive(material) teaches a grass shader to ask the same question for every blade, at the blade's own height,
//             so the outline lies across the tops of the grass instead of hiding under it.
// The shadow multiplies what is under it by the same cool tint as the trees' shadows, with a soft edge that widens away
// from her feet.
//
// Where a tree's shadow already lies there is no sunlight left to block, so hers fades out inside it (shade, optional).
//
//   const shadow = createCharacterShadow({ character, heightAt: level.heightAt });   // character: { object, height }
//   scene.add(shadow.object);
//   shadow.receive(level.grass.material);                                            // once: the grass takes it too
//   shadow.update(renderer, player.position, sunDirection, strength);                // every frame, before the scene is drawn
import * as THREE from 'three';

const MIN_SUN = 0.3;        // a sun on the horizon would throw endless shadows (the same floor the trees' shadows use)

// how much of her shadow lies on the point w. pic: w seen from the sun (0..1). ahead: how far w lies toward the sun from her
// (nothing between her and the sun can be in her shadow; the picture alone cannot tell, it has no depth)
const SHADOW_GLSL = /* glsl */`
uniform sampler2D uChPic, uChShade;
uniform float uChTexel, uChK;
uniform vec3 uChTint, uChFeet, uChSun, uChShadeRect;
float chShadow(vec2 pic, vec3 w, float ahead) {
  if (uChK <= 0.0) return 0.0;
  // outside the picture, or within its last few pixels: no shadow, and no hard cut where the picture ends
  vec2 edge = min(pic, 1.0 - pic);
  float inPic = smoothstep(0.0, 0.04, min(edge.x, edge.y));
  if (inPic <= 0.0) return 0.0;
  // the edge is crisp at her feet and softens the further the shadow has travelled
  float r = uChTexel * (1.3 + 4.0 * clamp(length(w - uChFeet) / 3.5, 0.0, 1.0));
  float a = texture2D(uChPic, pic).a * 4.0;
  a += (texture2D(uChPic, pic + vec2(r, 0.0)).a + texture2D(uChPic, pic - vec2(r, 0.0)).a
      + texture2D(uChPic, pic + vec2(0.0, r)).a + texture2D(uChPic, pic - vec2(0.0, r)).a) * 2.0;
  a += texture2D(uChPic, pic + vec2(r, r)).a + texture2D(uChPic, pic - vec2(r, r)).a
     + texture2D(uChPic, pic + vec2(r, -r)).a + texture2D(uChPic, pic - vec2(r, -r)).a;
  a *= 0.0625;
  a *= 1.0 - smoothstep(0.35, 0.9, ahead);
  // ground that is already in a tree's shadow gets no darker for her standing there
  a *= 1.0 - texture2D(uChShade, (w.xz - uChShadeRect.xy) * uChShadeRect.z + 0.5).r;
  return a * inPic * uChK;
}
`;

// the text between the bracket at `open` and its partner
function inside(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}
const beforeEnd = (src, code) => { const i = src.lastIndexOf('}'); return src.slice(0, i) + code + src.slice(i); };   // main() is the last thing in the shader

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
  // shared by the ground patch and every material that receives the shadow: one update reaches them all
  const uniforms = {
    uChPic: { value: target.texture }, uChPicMatrix: { value: new THREE.Matrix4() }, uChTexel: { value: 1 / size },
    uChTint: { value: new THREE.Vector3(...tint) }, uChK: { value: 0 },
    uChFeet: { value: new THREE.Vector3() }, uChSun: { value: new THREE.Vector3(0, 1, 0) },
    uChSunXZ: { value: new THREE.Vector2(0, 0) },                        // the sun's direction along the ground, length 1 (0 straight overhead)
    uChShade: { value: shade ? shade.texture : noShade }, uChShadeRect: { value: shade ? shade.rect : new THREE.Vector3(0, 0, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform mat4 uChPicMatrix;
      varying vec3 vW;
      varying vec2 vPic;
      void main() {
        vW = position;                                                   // the patch is laid out in world coordinates
        vPic = (uChPicMatrix * vec4(position, 1.0)).xy;                  // where this point is in the sun's picture
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${SHADOW_GLSL}
      varying vec3 vW;
      varying vec2 vPic;
      void main() {
        float a = chShadow(vPic, vW, dot(vW - uChFeet, uChSun));        // ground between her and the sun: no shadow
        if (a <= 0.0) discard;
        gl_FragColor = vec4(mix(vec3(1.0), uChTint, a), 1.0);            // multiplied onto what is under it
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

  // a shader whose vertex stage places points with "viewMatrix * vec4(<world position>)" can take the shadow.
  // Its colour is darkened before any haze laid over it, like the cloud shadows do.
  function receive(m) {
    if (!m || !m.isShaderMaterial || m.userData.charShadow) return !!(m && m.userData.charShadow);
    let vs = m.vertexShader, fs = m.fragmentShader;
    const at = vs.indexOf('viewMatrix * vec4(');
    if (at < 0) return false;
    const arg = inside(vs, at + 'viewMatrix * vec4'.length);
    const end = vs.indexOf(';', at);
    if (!arg || end < 0) return false;
    vs = vs.slice(0, end + 1) + ` { vec4 chW = vec4(${arg}); vChW = chW.xyz; vChPic = (uChPicMatrix * chW).xy; }` + vs.slice(end + 1);
    vs = 'uniform mat4 uChPicMatrix;\nvarying vec3 vChW;\nvarying vec2 vChPic;\n' + vs;
    // a blade is only in her shadow on her side away from the sun; along the ground, not up its own height
    const dark = 'mix(vec3(1.0), uChTint, chShadow(vChPic, vChW, dot(vChW.xz - uChFeet.xz, uChSunXZ)))';
    const hazed = fs.includes('uniform vec3 uFar, uHaze;') || /uniform vec3[^;]*\buHaze\b/.test(fs);
    fs = beforeEnd(fs, hazed && fs.includes('vHaze')
      ? `\n  { vec3 chH = uHaze * vHaze; gl_FragColor.rgb = (gl_FragColor.rgb - chH) * ${dark} + chH; }\n`
      : `\n  gl_FragColor.rgb *= ${dark};\n`);
    m.vertexShader = vs;
    m.fragmentShader = 'uniform vec2 uChSunXZ;\nvarying vec3 vChW;\nvarying vec2 vChPic;\n' + SHADOW_GLSL + fs;
    Object.assign(m.uniforms, uniforms);
    m.userData.charShadow = true;
    m.needsUpdate = true;
    return true;
  }

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
    receive,
    // feet: where she stands.  dir: a vector pointing at the sun.  k: how strongly the sun casts, 0 (night) .. 1
    update(renderer, feet, dir, k = 1) {
      if (!(k > 0.02) || !(dir.y > 0.01)) { mesh.visible = false; uniforms.uChK.value = 0; return; }
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
      uniforms.uChPicMatrix.value.copy(BIAS).multiply(eye.projectionMatrix).multiply(eye.matrixWorldInverse);
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

      // ---- the ground under it, and whatever grass took it
      lay(feet, sx, sz, H * flat / ly);
      uniforms.uChFeet.value.copy(feet);
      uniforms.uChSun.value.copy(sun);
      uniforms.uChSunXZ.value.set(-sx, -sz).multiplyScalar(dxz > 1e-5 ? 1 : 0);
      uniforms.uChK.value = Math.min(1, k) * 0.85;
      mesh.visible = true;
    },
    dispose() { target.dispose(); geo.dispose(); mat.dispose(); noShade.dispose(); },
  };
}
