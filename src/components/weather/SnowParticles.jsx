/**
 * SnowParticles — point-sprite snowflakes with curl-noise lateral
 * meander. Camera-following cylinder volume. Phase 7c (Tempest,
 * 2026-05-20).
 *
 * Per-particle: position + phase. Vertex shader computes a deterministic
 * column position from phase, applies wind drift + procedural curl, and
 * emits a point with size attenuation. Fragment renders a soft disc.
 *
 * Accumulation lives in the parent SnowAccumulationDriver; the falling
 * points are kinetic decoration, the whitened surfaces are the percept
 * (NOTES.md 2026-05-20: "Snow ON things is what reads as a snowy day").
 */
import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useAtmosphere from '../../hooks/useAtmosphere.js'

const POOL_SIZE = 4000
const RADIUS = 180
const TOP_Y = 100
const BOTTOM_Y = -20
const BASE_FALL = 3.5            // m/s — slow drift, snow physics
const POINT_SIZE = 14            // on-screen px at 1m camera distance

const VERT = /* glsl */`
attribute float aPhase;
attribute float aSpeed;
attribute float aRadius;
attribute float aActiveCutoff;
uniform float uTime;
uniform float uActiveFraction;
uniform vec3 uCameraPos;
uniform vec3 uWindDir;
uniform float uWindStrength;
uniform float uPointSize;

varying float vActive;

#include <common>
#include <logdepthbuf_pars_vertex>

float sHash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}
// cheap curl-noise stand-in: two offset sin lobes in XZ.
vec2 curl(vec3 p) {
  float a = sin(p.x * 0.2 + p.y * 0.1 + uTime * 0.7);
  float b = sin(p.z * 0.2 - p.y * 0.1 + uTime * 0.5);
  return vec2(b, -a);
}

void main() {
  float colH = TOP_Y_DEF - BOTTOM_Y_DEF;
  float yLocal = mod(aPhase * colH - uTime * aSpeed, colH);

  float ang = aPhase * 6.2831853;
  float radius = RADIUS_DEF * (0.2 + 0.8 * aRadius);
  vec3 worldPos;
  worldPos.x = uCameraPos.x + cos(ang) * radius;
  worldPos.z = uCameraPos.z + sin(ang) * radius;
  worldPos.y = uCameraPos.y + TOP_Y_DEF - yLocal;

  // Wind drift + curl meander.
  float fallTime = yLocal / max(aSpeed, 0.5);
  worldPos.xz += uWindDir.xz * uWindStrength * fallTime * 2.5;
  worldPos.xz += curl(worldPos * 0.05 + vec3(aPhase * 17.0)) * 1.6;

  vActive = step(aActiveCutoff, uActiveFraction);
  if (vActive < 0.5) {
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  vec4 mvPos = viewMatrix * vec4(worldPos, 1.0);
  gl_Position = projectionMatrix * mvPos;
  float dist = max(length(mvPos.xyz), 1.0);
  gl_PointSize = uPointSize * (50.0 / dist);
  #include <logdepthbuf_vertex>
}
`

const FRAG = /* glsl */`
precision highp float;
varying float vActive;

#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  if (vActive < 0.5) discard;
  vec2 uv = gl_PointCoord - 0.5;
  float r = length(uv);
  if (r > 0.5) discard;
  float alpha = smoothstep(0.5, 0.0, r);
  gl_FragColor = vec4(0.98, 0.99, 1.00, alpha * 0.85);
  #include <logdepthbuf_fragment>
}
`

function makeMaterial() {
  const sub = (s) => s
    .replace(/TOP_Y_DEF/g, TOP_Y.toFixed(3))
    .replace(/BOTTOM_Y_DEF/g, BOTTOM_Y.toFixed(3))
    .replace(/RADIUS_DEF/g, RADIUS.toFixed(3))
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:           { value: 0 },
      uActiveFraction: { value: 0 },
      uCameraPos:      { value: new THREE.Vector3() },
      uWindDir:        { value: new THREE.Vector3(1, 0, 0) },
      uWindStrength:   { value: 1.0 },
      uPointSize:      { value: POINT_SIZE },
    },
    vertexShader: sub(VERT),
    fragmentShader: sub(FRAG),
    transparent: true,
    depthWrite: false,
    depthTest: true,
  })
  mat.customProgramCacheKey = () => 'weather-snow-points-v1'
  return mat
}

export default function SnowParticles({ intensity = 0.5 }) {
  const material = useMemo(makeMaterial, [])
  const { camera } = useThree()

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    const pos = new Float32Array(POOL_SIZE * 3) // zero positions — vertex shader writes
    const phase = new Float32Array(POOL_SIZE)
    const speed = new Float32Array(POOL_SIZE)
    const radius = new Float32Array(POOL_SIZE)
    const cutoff = new Float32Array(POOL_SIZE)
    for (let i = 0; i < POOL_SIZE; i++) {
      phase[i] = Math.random()
      speed[i] = BASE_FALL * (0.6 + Math.random() * 0.8)
      radius[i] = Math.random()
      cutoff[i] = Math.random()
    }
    geom.setAttribute('position',       new THREE.BufferAttribute(pos, 3))
    geom.setAttribute('aPhase',         new THREE.BufferAttribute(phase, 1))
    geom.setAttribute('aSpeed',         new THREE.BufferAttribute(speed, 1))
    geom.setAttribute('aRadius',        new THREE.BufferAttribute(radius, 1))
    geom.setAttribute('aActiveCutoff',  new THREE.BufferAttribute(cutoff, 1))
    return geom
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ clock }) => {
    const dir = useAtmosphere.getState().tweenedDirective
    const u = material.uniforms
    u.uTime.value = clock.elapsedTime
    u.uCameraPos.value.copy(camera.position)
    u.uActiveFraction.value = intensity * 0.7 + 0.3
    if (dir?.wind) {
      const fromRad = (dir.wind.dir ?? 0) * Math.PI / 180
      u.uWindDir.value.set(-Math.sin(fromRad), 0, -Math.cos(fromRad)).normalize()
      u.uWindStrength.value = (dir.wind.scale ?? 1) * 0.7  // wind dominates snow
    }
  })

  return (
    <points
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={2001}
    />
  )
}
