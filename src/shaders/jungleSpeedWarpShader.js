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
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uSpeed;
      uniform vec3 uColor;
      varying vec2 vUv;

      float line(float x, float w){
        return 1.0 - smoothstep(w, w * 2.2, abs(x));
      }

      void main(){
        float s = smoothstep(0.16, 1.0, uSpeed);
        float travel = uTime * mix(0.4, 7.0, s);
        float cells = mix(10.0, 38.0, s);
        float y = fract(vUv.y * cells + travel);
        float streak = line(y - 0.5, mix(0.15, 0.035, s));
        float broken = step(0.42, fract(vUv.y * 7.0 + vUv.x * 11.0));
        float sideFade = smoothstep(0.0, 0.32, vUv.x) * smoothstep(1.0, 0.68, vUv.x);
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
