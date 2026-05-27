import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useCamera from '../hooks/useCamera'
import useSkyState from '../hooks/useSkyState'
import { SKY_RADIUS } from './CelestialBodies'

// Wind offset accumulator (persists across frames)
const _windOffset = new THREE.Vector2(0, 0)

function CloudDome() {
  const materialRef = useRef()
  const viewMode = useCamera((s) => s.viewMode)

  const cloudMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uCloudCover: { value: 0.0 },
      uStorminess: { value: 0.0 },
      uSunsetPotential: { value: 0.0 },
      uBeautyBias: { value: 0.6 },
      uSunDir: { value: new THREE.Vector3(0, 0.3, 1) },
      uSunAlt: { value: 0.5 },
      uMoonDir: { value: new THREE.Vector3(0, 0.3, -1) },
      uWindOffset: { value: new THREE.Vector2(0, 0) },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uCloudCover;
      uniform float uStorminess;
      uniform float uSunsetPotential;
      uniform float uBeautyBias;
      uniform vec3 uSunDir;
      uniform float uSunAlt;
      uniform vec3 uMoonDir;
      uniform vec2 uWindOffset;
      uniform float uTime;

      varying vec3 vWorldPosition;

      // ── Value noise (procedural, no textures) ──
      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f); // smoothstep
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      // ── 4-octave FBM with domain warp ──
      float fbm(vec2 p) {
        // First domain warp pass
        vec2 warp1 = vec2(
          noise(p + vec2(0.0, 0.0)),
          noise(p + vec2(5.2, 1.3))
        );
        p += warp1 * 2.0;

        // Second domain warp pass
        vec2 warp2 = vec2(
          noise(p + vec2(1.7, 9.2)),
          noise(p + vec2(8.3, 2.8))
        );
        p += warp2 * 1.0;

        // 4-octave FBM
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        for (int i = 0; i < 4; i++) {
          value += amplitude * noise(p * frequency);
          frequency *= 2.0;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = dir.y;

        // Discard below horizon
        if (h < 0.0) discard;

        // ── Cloud UV: cylindrical projection, avoids pole distortion ──
        vec2 cloudUV = dir.xz / max(h + 0.1, 0.15);
        cloudUV *= 0.4; // scale for nice cloud size
        cloudUV += uWindOffset; // wind drift

        // ── Noise evaluation ──
        float n = fbm(cloudUV);

        // ── Coverage mapping ──
        float threshold = mix(0.75, 0.15, uCloudCover);
        float density = smoothstep(threshold, threshold + 0.25, n);

        // Horizon fade: clouds thin near horizon
        density *= smoothstep(0.0, 0.15, h);

        // Early discard for performance
        if (density < 0.005) discard;

        // ── Lighting ──
        float sunDot = max(0.0, dot(dir, uSunDir));
        float isDay = smoothstep(-0.1, 0.1, uSunAlt);

        // Base cloud colors
        vec3 litColor = vec3(1.0, 0.98, 0.95);
        vec3 shadowColor = vec3(0.35, 0.38, 0.45);

        // Self-shadowing approximation: denser = darker
        float selfShadow = 1.0 - density * 0.6;

        // Silver lining on edges facing sun
        float edgeFactor = (1.0 - density) * sunDot;
        float silverLining = pow(edgeFactor, 2.0) * 0.8;

        // Sunset warm tint
        vec3 sunsetTint = vec3(1.0, 0.6, 0.3);
        float sunsetMix = uSunsetPotential * uBeautyBias;
        litColor = mix(litColor, sunsetTint, sunsetMix * 0.4);

        // Storm: darken shadow color, reduce lit brightness
        shadowColor = mix(shadowColor, vec3(0.15, 0.16, 0.2), uStorminess);
        litColor *= (1.0 - uStorminess * 0.3);

        // Compose lit vs shadow
        float lightAmount = selfShadow * isDay * (0.4 + sunDot * 0.6);
        vec3 cloudColor = mix(shadowColor, litColor, lightAmount);
        cloudColor += litColor * silverLining * isDay;

        // Night: clouds go near-black with slight blue from ambient moonlight
        float nightFade = 1.0 - isDay;
        vec3 nightColor = vec3(0.04, 0.05, 0.08);
        float moonDot = max(0.0, dot(dir, uMoonDir));
        nightColor += vec3(0.02, 0.03, 0.06) * moonDot;
        cloudColor = mix(cloudColor, nightColor, nightFade);

        // ── Opacity ──
        float alpha = density * mix(0.7, 0.9, uCloudCover);
        // Storm boosts opacity
        alpha *= (1.0 + uStorminess * 0.3);
        alpha = min(alpha, 0.95);

        gl_FragColor = vec4(cloudColor, alpha);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  }), [])

  useFrame((_, delta) => {
    if (!materialRef.current) return

    const sky = useSkyState.getState()
    const dt = Math.min(delta, 0.1)

    // Update uniforms
    materialRef.current.uniforms.uCloudCover.value = sky.cloudCover
    materialRef.current.uniforms.uStorminess.value = sky.storminess
    materialRef.current.uniforms.uSunsetPotential.value = sky.sunsetPotential
    materialRef.current.uniforms.uBeautyBias.value = sky.beautyBias
    materialRef.current.uniforms.uSunDir.value.copy(sky.sunDirection)
    materialRef.current.uniforms.uSunAlt.value = sky.sunElevation
    materialRef.current.uniforms.uMoonDir.value.copy(sky.moonDirection)

    // Accumulate wind offset
    if (!sky.isBackgroundTab) {
      _windOffset.x += sky.windVector.x * dt * 0.0003
      _windOffset.y += sky.windVector.y * dt * 0.0003
      // Slow baseline drift even with no wind
      _windOffset.x += dt * 0.002
      _windOffset.y += dt * 0.001
    }
    materialRef.current.uniforms.uWindOffset.value.copy(_windOffset)
    materialRef.current.uniforms.uTime.value += dt
  })

  // Only render in hero mode
  if (viewMode !== 'hero') return null

  return (
    <mesh>
      <sphereGeometry args={[SKY_RADIUS * 0.85, 64, 32]} />
      <primitive object={cloudMaterial} ref={materialRef} />
    </mesh>
  )
}

export default CloudDome
