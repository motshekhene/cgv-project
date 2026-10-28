/**
 * Wind — trees, bushes and grass sway, injected into their ordinary
 * MeshStandardMaterial (onBeforeCompile), so they keep every bit of three's
 * lighting, fog and shadows. Done in the vertex shader, in world space:
 *
 *   - the BEND grows with height above the plant's own origin (linear plus
 *     squared), so the base stays planted and the crown moves most
 *   - each plant gets its own phase from where it stands, so a forest doesn't
 *     sway in lock-step, and two sines at different rates never quite repeat
 *   - a fast, small FLUTTER on top, varying across the plant, for the leaves
 *
 * Every material shares one clock (windTime), which Game advances each frame
 * with the game's own dt, so the wind slows down in slow motion too.
 *
 *   applyWind(material, { amp: 0.4 });
 */
export const windTime = { value: 0 };

const SWAY = /* glsl */ `
  mat4 windModel = modelMatrix;
  #ifdef USE_INSTANCING
    windModel = modelMatrix * instanceMatrix;
  #endif
  vec4 windPos = windModel * vec4(transformed, 1.0);
  vec3 windRoot = windModel[3].xyz; // where the plant stands
  float windH = max(windPos.y - windRoot.y, 0.0);
  float windPhase = dot(windRoot.xz, vec2(0.173, 0.219));
  float windBend = (windH * 0.04 + windH * windH * 0.0015) * uWindAmp;
  vec2 windDir = vec2(sin(uWindTime * 1.3 + windPhase) + 0.45 * sin(uWindTime * 2.9 + windPhase * 1.7),
                      cos(uWindTime * 1.1 + windPhase * 1.3) * 0.6);
  windPos.xz += windDir * windBend;
  // leaf flutter: fast, small, different across the plant
  windPos.xyz += vec3(sin(uWindTime * 7.0 + windPos.x * 2.3 + windPos.z * 1.9),
                      sin(uWindTime * 6.1 + windPos.z * 2.1) * 0.5,
                      cos(uWindTime * 6.6 + windPos.x * 1.7)) * 0.012 * uWindAmp * min(windH, 3.0);
  vec4 mvPosition = viewMatrix * windPos;
  gl_Position = projectionMatrix * mvPosition;
`;

export function applyWind(material, { amp = 0.4 } = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.uWindTime = windTime;
    shader.uniforms.uWindAmp = { value: amp };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;\nuniform float uWindAmp;')
      .replace('#include <project_vertex>', SWAY);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + '|wind';
  material.userData.wind = amp;
  return material;
}
