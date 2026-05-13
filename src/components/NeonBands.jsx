import { useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { CATEGORY_HEX } from '../tokens/categories'
import { neon as _neonUniforms } from '../preview/neonState.js'
import { useSceneJson } from '../lib/useSceneJson.js'

/**
 * NeonBands — Path B runtime renderer per HANDOFF-neon.md.
 *
 * One 4-facet diamond tube per place, walking the building footprint
 * offset outward by OFFSET_OUT meters. At each convex corner the tube
 * sweeps an arc (K=CORNER_ARC_SEGS extra rings) around the original
 * corner with radius OFFSET_OUT, so the offset is uniform throughout
 * including around bends. Concave corners and near-straight bends fall
 * back to a single mitred ring.
 *
 * GPU economy: per ring = 4 verts (cardinal cross-section points),
 * radial smooth normals so the shader interpolates round across the
 * facet. Typical Victorian (15 corners, mostly 90°) ≈ 180 verts /
 * 360 tris. LS peak (30 places open) ≈ 5400 verts / 10800 tris. Single
 * draw, single shader (Bloom-stable).
 *
 * The "round tube" look is shader, not geometry:
 * `r = 1 - dot(worldNormal, viewDir)` paints a hot core on front-facing
 * fragments and a soft halo at silhouette. Bloom amplifies the bleed
 * mask into volumetric glow at zero geometric cost.
 *
 * Three Gaussian masks (uCore / uTube / uBleed) feed the operator's
 * group-of-3 channel in Sky & Light.
 */

// PROVISIONAL (pre-authoring): chunky values picked to guarantee visibility
// at LS Browse/Hero/Street distances. Real-neon-realistic radius (~0.06) goes
// sub-pixel from 200-600m altitude and bloom can't grab the coverage. Tomorrow:
// parameterize TUBE_RADIUS + ROOF_LIFT + emissive multiplier as Cartograph
// authoring controls (Sky & Light panel sits next to the existing Neon channel)
// + add a "Force Neon On (test)" toggle so the shader can be tuned without
// scrubbing TOD to find an open hour.
const TUBE_RADIUS      = 0.20   // ~8" diameter — visibly chunky from Browse altitude
const OFFSET_OUT       = 0.08   // meters past the footprint edge (~3" — real neon mounts close to the wall)
const ROOF_LIFT        = 0.30   // clear roof / parapet / depth noise at LS scale
const CORNER_ARC_SEGS  = 2      // arc segments per convex corner (K=2 → 3 rings, 45°/seg for a 90° corner)
const CORNER_ARC_MIN   = 15 * Math.PI / 180  // turn smaller than this stays a single mitred ring

function categoryColorVec(category) {
  const key = (category || '').replace(/^neon_/, '')
  const hex = CATEGORY_HEX[key] || '#ff66cc'
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}

// Walk the footprint and build the ring chain at uniform OFFSET_OUT from
// the wall. Convex corners get K+1 arc rings; concave/straight stay
// single-ring (mitred).
function buildRingPath(footprint) {
  const n = footprint.length
  const rings = []   // { x, z, nx, nz }
  for (let i = 0; i < n; i++) {
    const prev = footprint[(i - 1 + n) % n]
    const cur  = footprint[i]
    const next = footprint[(i + 1) % n]
    const e1x = cur[0] - prev[0], e1z = cur[1] - prev[1]
    const e2x = next[0] - cur[0], e2z = next[1] - cur[1]
    const l1 = Math.hypot(e1x, e1z) || 1
    const l2 = Math.hypot(e2x, e2z) || 1
    const n1x = e1z / l1, n1z = -e1x / l1
    const n2x = e2z / l2, n2z = -e2x / l2
    const dotN = Math.max(-1, Math.min(1, n1x * n2x + n1z * n2z))
    const turn = Math.acos(dotN)                          // unsigned turn angle
    const cross = n1x * n2z - n1z * n2x                   // >0 = convex CCW corner

    if (cross <= 0 || turn < CORNER_ARC_MIN) {
      // Concave or near-straight — single mitred ring.
      let nx = (n1x + n2x) / 2
      let nz = (n1z + n2z) / 2
      const nl = Math.hypot(nx, nz) || 1
      nx /= nl; nz /= nl
      const mitre = Math.min(1 / Math.sqrt((1 + dotN) / 2), 4)
      const k = OFFSET_OUT * mitre
      rings.push({ x: cur[0] + nx * k, z: cur[1] + nz * k, nx, nz })
    } else {
      // Convex corner — sweep arc from n1 to n2 around `cur`, radius OFFSET_OUT.
      const a1 = Math.atan2(n1z, n1x)
      const segs = Math.max(1, Math.min(CORNER_ARC_SEGS, Math.ceil(turn / (Math.PI / 4))))
      for (let s = 0; s <= segs; s++) {
        const t = s / segs
        const a = a1 + turn * t
        const nx = Math.cos(a)
        const nz = Math.sin(a)
        rings.push({
          x: cur[0] + nx * OFFSET_OUT,
          z: cur[1] + nz * OFFSET_OUT,
          nx, nz,
        })
      }
    }
  }
  return rings
}

// Diamond-cross-section tube along the ring chain. Returns flat arrays
// for the caller to merge.
function buildTubeFor(building) {
  const fp = building.footprint
  if (!fp || fp.length < 3) return null
  // Rooftop world Y. Callers should pass `baseY` when foundationHeight
  // (period-pedestal lift) is non-zero — see LafayetteScene's openPlaces
  // construction. Toy / flat-grade scenes fall back to size[1].
  const baseY = (building.baseY ?? building.size?.[1] ?? 0) + ROOF_LIFT
  const r = TUBE_RADIUS
  const rings = buildRingPath(fp)
  const m = rings.length
  if (m < 2) return null

  const positions = []
  const normals = []
  const uvs = []
  for (let i = 0; i <= m; i++) {
    const ring = rings[i % m]
    const u = i / m
    // top, outer, bottom, inner — radial smooth normals
    positions.push(ring.x,                   baseY + r, ring.z)
    normals.push(0, 1, 0); uvs.push(u, 0)
    positions.push(ring.x + ring.nx * r,     baseY,     ring.z + ring.nz * r)
    normals.push(ring.nx, 0, ring.nz); uvs.push(u, 0.25)
    positions.push(ring.x,                   baseY - r, ring.z)
    normals.push(0, -1, 0); uvs.push(u, 0.5)
    positions.push(ring.x - ring.nx * r,     baseY,     ring.z - ring.nz * r)
    normals.push(-ring.nx, 0, -ring.nz); uvs.push(u, 0.75)
  }

  // 4 facets per ring connection × 2 triangles = 8 tris per segment.
  const indices = []
  for (let i = 0; i < m; i++) {
    const a = i * 4
    const b = (i + 1) * 4
    for (let f = 0; f < 4; f++) {
      const v0 = a + f
      const v1 = a + ((f + 1) % 4)
      const v2 = b + f
      const v3 = b + ((f + 1) % 4)
      indices.push(v0, v2, v1)
      indices.push(v1, v2, v3)
    }
  }
  return { positions, normals, uvs, indices }
}

const VERT = /* glsl */`
attribute vec3 aColor;
varying vec3 vColor;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
void main() {
  vColor = aColor;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FRAG = /* glsl */`
precision highp float;
uniform float uCore;
uniform float uTube;
uniform float uBleed;
uniform float uForceOn;
varying vec3 vColor;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main() {
  vec3 N = normalize(vWorldNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorldPos);
  float facing = max(0.0, dot(N, V));
  float r = 1.0 - facing;

  float coreMask  = exp(-r * r * 16.0);
  float tubeMask  = exp(-r * r *  4.0);
  float bleedMask = exp(-r * r *  1.0);

  vec3 emissive = vec3(0.0);
  emissive += mix(vColor, vec3(1.0), 0.7) * coreMask  * uCore;
  emissive += vColor                       * tubeMask  * uTube;
  emissive += vColor * 0.4                 * bleedMask * uBleed;
  // PROVISIONAL: matches OLD inline NeonBand's emissiveIntensity=4.0 so the
  // shader peak clears bloom threshold at LS Browse/Hero/Street. Tomorrow
  // this becomes a Cartograph-authored multiplier.
  emissive *= 4.0 * uForceOn;

  float alpha = max(coreMask * uCore, max(tubeMask * uTube, bleedMask * uBleed));
  alpha *= uForceOn;
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(emissive, alpha);
}
`

/**
 * NeonBands — Path B runtime renderer per HANDOFF-neon.md.
 *
 * Props:
 * @param {Array} places — buildings eligible for neon. Each must have
 *   `neon.category` (or it's skipped), plus `footprint` + position.
 * @param {boolean} [forceOn=true] — single uniform multiplier;
 *   when paired with per-place caller-side filtering of `places`,
 *   keep this true. When unspecified caller uses lookId pump (below).
 * @param {string} [lookId] — when provided, fetches the per-Look
 *   scene.json via `useSceneJson` and writes its `neon.values` into
 *   the shared `_neonUniforms` module once per fetch resolution.
 *   This is the production-side driver of the three masks (uCore /
 *   uTube / uBleed) — see SLAB-CONTRACT §4 + couplers plan §1.
 *   Authoring contexts (Cartograph Designer / Stage) skip the prop
 *   so CartographApp's per-frame `NeonPump` (which pulls from the
 *   cartograph store's TOD-animated curve) remains the authoritative
 *   writer in those contexts.
 */
export default function NeonBands({ places, forceOn = true, lookId }) {
  // Production-side uniform driver: when a lookId is passed, fetch
  // the slab's scene.json once and apply scene.neon.values to the
  // shared uniforms. No per-frame work — production curve is static
  // under current design.json. Future TOD-animated curves replace
  // this useEffect with a per-frame pump in this same place.
  const scene = useSceneJson(lookId || '')
  useEffect(() => {
    console.log('[neon-pump]', { lookId, sceneIsNull: scene === null, hasNeon: !!scene?.neon, values: scene?.neon?.values })
    if (!lookId || !scene?.neon?.values) return
    const v = scene.neon.values
    _neonUniforms.coreUniform.value  = v.core  ?? 0
    _neonUniforms.tubeUniform.value  = v.tube  ?? 0
    _neonUniforms.bleedUniform.value = v.bleed ?? 0
    console.log('[neon-pump] uniforms written:', {
      core: _neonUniforms.coreUniform.value,
      tube: _neonUniforms.tubeUniform.value,
      bleed: _neonUniforms.bleedUniform.value,
    })
    if (typeof window !== 'undefined') window.__neon = _neonUniforms
  }, [lookId, scene])

  const geometry = useMemo(() => {
    const positions = []
    const normals   = []
    const uvs       = []
    const colors    = []
    const indices   = []
    let baseVert = 0
    for (const p of places) {
      if (!p.neon?.category) continue
      const tube = buildTubeFor(p)
      if (!tube) continue
      const rgb = categoryColorVec(p.neon.category)
      const count = tube.positions.length / 3
      for (let i = 0; i < tube.positions.length; i++) positions.push(tube.positions[i])
      for (let i = 0; i < tube.normals.length;   i++) normals.push(tube.normals[i])
      for (let i = 0; i < tube.uvs.length;       i++) uvs.push(tube.uvs[i])
      for (let i = 0; i < count; i++) colors.push(rgb[0], rgb[1], rgb[2])
      for (let i = 0; i < tube.indices.length; i++) indices.push(baseVert + tube.indices[i])
      baseVert += count
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3))
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2))
    geo.setAttribute('aColor',   new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeBoundingSphere()
    return geo
  }, [places])

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uCore:    _neonUniforms.coreUniform,
        uTube:    _neonUniforms.tubeUniform,
        uBleed:   _neonUniforms.bleedUniform,
        uForceOn: { value: forceOn ? 1.0 : 0.0 },
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    })
  }, [forceOn])

  useEffect(() => () => { geometry.dispose() }, [geometry])
  useEffect(() => () => { material.dispose() }, [material])

  return <mesh geometry={geometry} material={material} renderOrder={20} />
}
