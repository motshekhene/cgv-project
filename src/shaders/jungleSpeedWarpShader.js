import * as THREE from "three";

/**
 * Jungle-trail speed shader for Level 1B.
 * Two additive ribbons sit at the path edges and stretch into longer,
 * brighter streaks as uSpeed approaches 1. This keeps the shader visible in
 * the new outdoor theme without replacing the PBR mud material underneath.
 */
export function createJungleSpeedWarpMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: 0 },
      uColor: { value: new THREE.Color(0xcfe8b4) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv = uv; // x across the ribbon, y along it
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); // object -> clip space
      }
    `,
    fragmentShader: `
      uniform float uTime; // seconds
      uniform float uSpeed; // 0..1: Kai's speed (game state), stretches and brightens the streaks
      uniform vec3 uColor;
      varying vec2 vUv;

      // 1 on a thin line at x = 0, soft-edged, 0 away from it
      float line(float x, float w){
        return 1.0 - smoothstep(w, w * 2.2, abs(x));
      }

      void main(){
        float s = smoothstep(0.16, 1.0, uSpeed); // nothing at a walk, full at a sprint
        float travel = uTime * mix(0.4, 7.0, s); // faster = the streaks rush past faster
        float cells = mix(10.0, 38.0, s); // and there are more of them
        float y = fract(vUv.y * cells + travel); // repeating cells along the ribbon
        float streak = line(y - 0.5, mix(0.15, 0.035, s)); // a line in each cell, thinner at speed
        float broken = step(0.42, fract(vUv.y * 7.0 + vUv.x * 11.0)); // gaps, so they read as dashes
        float sideFade = smoothstep(0.0, 0.32, vUv.x) * smoothstep(1.0, 0.68, vUv.x); // soft at both edges
        float a = streak * broken * sideFade * s * 0.34;
        gl_FragColor = vec4(uColor * (1.2 + s), a);
      }
    `,
  });
}

export function updateJungleSpeedWarp(material, dt, normalizedSpeed) {
  if (!material?.uniforms) return;
  material.uniforms.uTime.value += dt;
  material.uniforms.uSpeed.value = THREE.MathUtils.clamp(normalizedSpeed, 0, 1);
}
