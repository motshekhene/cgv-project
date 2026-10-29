/**
 * Display-referred colours under PostFX.
 *
 * A few of our shaders write their colour straight to the screen, with no
 * tone mapping and no sRGB step (the jungle sky, glows, rain). Drawn directly,
 * what they write is what you see. Through PostFX the frame is tone mapped
 * (ACES) and converted to sRGB at the end, so those colours would come out a
 * second time through the curve: paler, hazier, washed out.
 *
 * displayToScene() undoes that in advance: it is the exact inverse of three's
 * ACES Filmic (its output matrix, the rational RRT+ODT fit solved with the
 * quadratic formula, its input matrix, the exposure) and of the sRGB curve,
 * so after PostFX's composite the pixel lands back on the colour the shader
 * meant. sceneToDisplay() is the forward direction, the same as three's.
 *
 * Both share two uniforms that Game keeps up to date: the renderer's exposure,
 * and whether this frame is going through PostFX at all.
 */
import * as THREE from 'three';

export const displayUniforms = {
  uDisplayExposure: { value: 1 },
  uViaPostFX: { value: 0 },
};

export const DISPLAY_GLSL = /* glsl */ `
  uniform float uDisplayExposure;
  uniform float uViaPostFX;
  const mat3 PFX_ACES_IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 PFX_ACES_OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 pfxRRT(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  // linear scene colour -> what three's ACES + sRGB would put on screen
  vec3 sceneToDisplay(vec3 c) {
    c *= uDisplayExposure / 0.6;
    c = PFX_ACES_OUT * pfxRRT(PFX_ACES_IN * c);
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  // the inverse: a colour meant for the screen -> the scene colour that PostFX will turn into it
  vec3 displayToScene(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    c = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); // sRGB -> linear
    // capped short of the curve's shoulder: near-white would invert to enormous values (and bloom)
    vec3 y = clamp(inverse(PFX_ACES_OUT) * c, 0.0, 0.93);
    // y = (v^2 + 0.0245786 v - 0.000090537) / (0.983729 v^2 + 0.432951 v + 0.238081), solved for v
    vec3 qa = 1.0 - 0.983729 * y;
    vec3 qb = 0.0245786 - 0.4329510 * y;
    vec3 qc = -(0.000090537 + 0.238081 * y);
    vec3 v = (-qb + sqrt(max(qb * qb - 4.0 * qa * qc, 0.0))) / (2.0 * qa);
    return max(inverse(PFX_ACES_IN) * v, 0.0) * 0.6 / uDisplayExposure;
  }
`;

/**
 * Make a ShaderMaterial that writes display colours come out right under
 * PostFX too: its final colour goes through displayToScene() whenever the
 * frame is being post-processed. Its own look is untouched otherwise.
 */
export function patchDisplayReferred(material) {
  if (material.userData.pfxPatched) return;
  material.userData.pfxPatched = true;
  const additive = material.blending === THREE.AdditiveBlending;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, displayUniforms);
    let fs = shader.fragmentShader;
    const main = fs.search(/void\s+main\s*\(/);
    const end = fs.lastIndexOf('}');
    if (main < 0 || end < 0) return;
    fs = fs.slice(0, main) + DISPLAY_GLSL + fs.slice(main, end)
      + '  if (uViaPostFX > 0.5) gl_FragColor.rgb = displayToScene(gl_FragColor.rgb);\n}' + fs.slice(end + 1);
    shader.fragmentShader = fs;
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + '|pfx';
  material.needsUpdate = true;
}

/** Does this material write straight to the screen (no tone mapping, no sRGB of its own)? */
export function isDisplayReferred(material) {
  return !!material && material.isShaderMaterial && !material.isRawShaderMaterial
    && !material.userData.pfxSkip
    && !/tonemapping_fragment|colorspace_fragment/.test(material.fragmentShader);
}

// the same inverse on the CPU, for colours three hands the GPU itself: the
// fog colour (mixed in after tone mapping, i.e. as a screen colour, in
// three's own shaders) and a plain-colour background (cleared, never toned)
const ACES_IN = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777);
const ACES_OUT = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
const ACES_IN_INV = ACES_IN.clone().invert();
const ACES_OUT_INV = ACES_OUT.clone().invert();
const _v = new THREE.Vector3();
const rrtInverse = (y) => {
  y = Math.min(Math.max(y, 0), 0.93);
  const a = 1 - 0.983729 * y, b = 0.0245786 - 0.432951 * y, c = -(0.000090537 + 0.238081 * y);
  return (-b + Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a);
};

/**
 * out = the scene colour that PostFX turns into `display` on screen, where
 * `display` is a colour three shows untouched by tone mapping (a clear colour).
 */
export function displayToSceneColor(display, exposure, out = new THREE.Color()) {
  // three encodes it to sRGB for the screen, so on screen it is the linear colour itself
  _v.set(display.r, display.g, display.b).clampScalar(0, 1).applyMatrix3(ACES_OUT_INV);
  _v.set(rrtInverse(_v.x), rrtInverse(_v.y), rrtInverse(_v.z)).applyMatrix3(ACES_IN_INV);
  _v.multiplyScalar(0.6 / exposure);
  return out.setRGB(Math.max(_v.x, 0), Math.max(_v.y, 0), Math.max(_v.z, 0), THREE.LinearSRGBColorSpace);
}

/**
 * Fog. three mixes the fog colour in after tone mapping and sRGB, i.e. on the
 * screen colour, and the whole game's fog was tuned that way. Drawn into
 * PostFX's HDR target (no tone mapping there), the same mix would happen in
 * linear HDR and come out a different haze. So, only in that case, three's own
 * fog chunk does it the screen's way: take the colour to the screen, mix in
 * the fog there, and move the scene colour by however much that changed it
 * (an offset, so with no fog the HDR colour, and its bloom, passes untouched).
 */
const FOG_PARS = /* glsl */ `
#if defined( USE_FOG ) && !defined( TONE_MAPPING )
  uniform float toneMappingExposure; // three sets it on every program that declares it
  const mat3 PFXF_IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 PFXF_OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 pfxfToDisplay(vec3 c) {
    c = PFXF_IN * (c * toneMappingExposure / 0.6);
    c = (c * (c + 0.0245786) - 0.000090537) / (c * (0.983729 * c + 0.4329510) + 0.238081);
    c = clamp(PFXF_OUT * c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  vec3 pfxfToScene(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    c = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
    vec3 y = clamp(inverse(PFXF_OUT) * c, 0.0, 0.93);
    vec3 qa = 1.0 - 0.983729 * y, qb = 0.0245786 - 0.4329510 * y, qc = -(0.000090537 + 0.238081 * y);
    vec3 v = (-qb + sqrt(max(qb * qb - 4.0 * qa * qc, 0.0))) / (2.0 * qa);
    return max(inverse(PFXF_IN) * v, 0.0) * 0.6 / toneMappingExposure;
  }
#endif
`;
const FOG_MIX = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );';
const FOG_MIX_PFX = /* glsl */ `
  #ifdef TONE_MAPPING
    ${FOG_MIX}
  #else
    if (fogFactor > 0.0005) {
      vec3 pfxD = pfxfToDisplay(gl_FragColor.rgb);
      vec3 pfxFrom = pfxfToScene(pfxD);
      // on screen three hands the fog colour over sRGB-encoded; into a target it stays linear
      vec3 pfxFog = mix(fogColor * 12.92, 1.055 * pow(fogColor, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, fogColor));
      vec3 pfxTo = pfxfToScene(mix(pfxD, pfxFog, fogFactor));
      // the colour's own HDR value, moved by what the fog did to it on screen
      gl_FragColor.rgb = max(gl_FragColor.rgb + pfxTo - pfxFrom, 0.0);
    }
  #endif`;
if (!THREE.ShaderChunk.fog_pars_fragment.includes('pfxfToScene')) {
  THREE.ShaderChunk.fog_pars_fragment += FOG_PARS;
  THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(FOG_MIX, FOG_MIX_PFX);
}
