/**
 * RainParticles — instanced billboarded streak quads that follow the
 * camera horizontally, fall vertically, tilt with wind direction.
 *
 * Phase 7b (Tempest, 2026-05-20). Driven by directive.precip.intensity
 * via the WeatherEffects parent. Particle count scales with intensity:
 * ~30% of pool active at intensity 0, 100% at intensity 1 (clipped via
 * a per-instance "active" attribute the shader uses to skip drawing).
 *
 * Streak geometry — vertical alpha gradient quad — gives the perceived
 * "rain look." Points read as snow at any color
 * (`feedback` doctrine, NOTES.md 2026-05-20).
 *
 * `directive.precip.kind === 'hail'` flips a uniform that doubles the
 * particle width + greys + speeds — minor visual nod. No accumulation;
 * hail uses the wet integrator like rain.
 */
import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useAtmosphere from '../../hooks/useAtmosphere.js'

const POOL_SIZE = 6000          // max instances; intensity gates active count
const RADIUS = 180              // horizontal radius around camera
const TOP_Y = 120               // spawn height above camera-Y
const BOTTOM_Y = -20            // recycle threshold below camera-Y
const STREAK_W = 0.06           // 6cm wide
const STREAK_H = 0.6            // 60cm tall
const BASE_SPEED = 35           // m/s

const VERT = /* glsl */`
attribute float aSpeed;
attribute float aPhase;
attribute float aActiveCutoff;
uniform float uTime;
uniform float uActiveFraction;
uniform vec3 uCameraPos;
uniform vec3 uWindDir;
uniform float uWindStrength;
uniform float uHail;

varying float vAlphaGrad;
varying float vActive;

#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  // Wrap (aPhase + t*aSpeed) into a column-height envelope per particle.
  float colH = TOP_Y_DEF - BOTTOM_Y_DEF;
  float yLocal = mod(aPhase - uTime * aSpeed, colH);
  // Lateral drift via accumulated wind (≈ tilt while falling).
  float fallTime = yLocal / aSpeed;
  vec3 windOffset = uWindDir * uWindStrength * fallTime * 8.0;

  // Per-particle XZ from aPhase (deterministic ring around camera).
  float ang = aPhase * 6.2831853;
  float radius = RADIUS_DEF * (0.2 + 0.8 * fract(aPhase * 13.37));
  vec3 worldPos;
  worldPos.x = uCameraPos.x + cos(ang) * radius + windOffset.x;
  worldPos.z = uCameraPos.z + sin(ang) * radius + windOffset.z;
  worldPos.y = uCameraPos.y + TOP_Y_DEF - yLocal;

  // Active-pool gating: skip drawing if this instance's slot is beyond
  // the intensity-scaled active fraction.
  vActive = step(aActiveCutoff, uActiveFraction);
  if (vActive < 0.5) {
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0); // off-screen
    vAlphaGrad = 0.0;
    return;
  }

  // Billboard the quad: face camera but keep streak vertical.
  // position is unit quad: x ∈ [-0.5, 0.5], y ∈ [-0.5, 0.5].
  vec3 toCam = normalize(uCameraPos - worldPos);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  float widthMul = 1.0 + 1.0 * uHail;
  float heightMul = 1.0 - 0.4 * uHail;  // hail shorter
  vec3 off = right * position.x * STREAK_W_DEF * widthMul
           + vec3(0.0, 1.0, 0.0) * position.y * STREAK_H_DEF * heightMul;
  vec3 finalPos = worldPos + off;

  // Vertical alpha gradient: 1 at top of streak (position.y = 0.5),
  // 0 at bottom (position.y = -0.5).
  vAlphaGrad = position.y + 0.5;

  vec4 mvPos = viewMatrix * vec4(finalPos, 1.0);
  gl_Position = projectionMatrix * mvPos;
  #include <logdepthbuf_vertex>
}
`

const FRAG = /* glsl */`
precision highp float;
uniform float uHail;
varying float vAlphaGrad;
varying float vActive;

#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  if (vActive < 0.5) discard;
  // Greyish tint; hail = bluer + brighter.
  vec3 col = mix(vec3(0.78, 0.82, 0.90), vec3(0.85, 0.90, 1.00), uHail);
  float alpha = vAlphaGrad * 0.55;
  gl_FragColor = vec4(col, alpha);
  #include <logdepthbuf_fragment>
}
`

function makeMaterial() {
  const constants = (s) => s
    .replace(/TOP_Y_DEF/g, TOP_Y.toFixed(3))
    .replace(/BOTTOM_Y_DEF/g, BOTTOM_Y.toFixed(3))
    .replace(/RADIUS_DEF/g, RADIUS.toFixed(3))
    .replace(/STREAK_W_DEF/g, STREAK_W.toFixed(4))
    .replace(/STREAK_H_DEF/g, STREAK_H.toFixed(4))
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:           { value: 0 },
      uActiveFraction: { value: 0 },
      uCameraPos:      { value: new THREE.Vector3() },
      uWindDir:        { value: new THREE.Vector3(1, 0, 0) },
      uWindStrength:   { value: 1.0 },
      uHail:           { value: 0 },
    },
    vertexShader: constants(VERT),
    fragmentShader: constants(FRAG),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  })
  mat.customProgramCacheKey = () => 'weather-rain-streak-v1'
  return mat
}

export default function RainParticles({ intensity = 0.5, kind = 'rain' }) {
  const meshRef = useRef()
  const material = useMemo(makeMaterial, [])
  const { camera } = useThree()

  // Geometry: unit quad with per-instance attributes.
  const geometry = useMemo(() => {
    const quad = new THREE.PlaneGeometry(1, 1)
    const geom = new THREE.InstancedBufferGeometry()
    geom.index = quad.index
    geom.attributes.position = quad.attributes.position
    geom.attributes.normal = quad.attributes.normal
    geom.attributes.uv = quad.attributes.uv
    const speed = new Float32Array(POOL_SIZE)
    const phase = new Float32Array(POOL_SIZE)
    const cutoff = new Float32Array(POOL_SIZE)
    for (let i = 0; i < POOL_SIZE; i++) {
      speed[i] = BASE_SPEED * (0.7 + Math.random() * 0.6)  // ±30%
      phase[i] = Math.random() * (TOP_Y - BOTTOM_Y)
      // cutoff: a value in [0,1]; instance is active when uActiveFraction > cutoff.
      // Shuffled assignment so any active fraction pulls a spatially-random subset.
      cutoff[i] = Math.random()
    }
    geom.setAttribute('aSpeed',         new THREE.InstancedBufferAttribute(speed, 1))
    geom.setAttribute('aPhase',         new THREE.InstancedBufferAttribute(phase, 1))
    geom.setAttribute('aActiveCutoff',  new THREE.InstancedBufferAttribute(cutoff, 1))
    geom.instanceCount = POOL_SIZE
    return geom
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ clock }) => {
    const dir = useAtmosphere.getState().tweenedDirective
    const u = material.uniforms
    u.uTime.value = clock.elapsedTime
    u.uCameraPos.value.copy(camera.position)
    // Intensity envelope: 0.3 floor → 1.0 ceiling so light rain shows ~30% pool.
    u.uActiveFraction.value = intensity * 0.7 + 0.3
    u.uHail.value = kind === 'hail' ? 1.0 : 0.0
    // Wind: tilt direction + strength. Use a dirived XZ unit vector and a
    // mild strength factor (heavy rain = bigger lateral drift).
    if (dir?.wind) {
      const fromRad = (dir.wind.dir ?? 0) * Math.PI / 180
      u.uWindDir.value.set(-Math.sin(fromRad), 0, -Math.cos(fromRad)).normalize()
      u.uWindStrength.value = (dir.wind.scale ?? 1) * 0.3
    }
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={2000}
    />
  )
}
