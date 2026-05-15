import { useMemo, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { CATEGORY_HEX } from '../tokens/categories'
import { neon as _neonUniforms } from '../preview/neonState.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { UNIFORMS as TERRAIN_UNIFORMS } from '../utils/terrainShader'

/**
 * NeonBands — Path B runtime renderer per HANDOFF-neon.md.
 *
 * Quarter-round profile (top + outer ring) walking the building
 * footprint offset outward by OFFSET_OUT meters. At each convex corner
 * the tube sweeps an arc (K=CORNER_ARC_SEGS extra rings) around the
 * original corner with radius OFFSET_OUT, so the offset is uniform
 * throughout including around bends. Concave corners and near-straight
 * bends fall back to a single mitred ring.
 *
 * Quarter-round (vs the prior half-tube): top + outer facets only.
 * Reads as a real wall-mounted neon tube — a glass ¼-bend sitting on
 * the parapet edge — and additive bleed onto the roof tiles becomes a
 * free upper-rim wash light. No bottom facet means no downward
 * emitter, which kills the "neon glowing from under the building"
 * artifact when the camera creeps below rooftop height.
 *
 * GPU economy: per ring = 2 verts. Typical Victorian (15 corners,
 * mostly 90°) ≈ 90 verts / 60 tris. LS peak (30 places open)
 * ≈ 2700 verts / 1800 tris. Single draw, single shader (Bloom-stable).
 *
 * The "round tube" look is shader, not geometry:
 * `r = 1 - dot(worldNormal, viewDir)` paints a hot core on front-facing
 * fragments and a soft halo at silhouette. Bloom amplifies the bleed
 * mask into volumetric glow at zero geometric cost.
 *
 * Three Gaussian masks (uCore / uTube / uBleed) feed the operator's
 * group-of-3 channel in Sky & Light.
 */

// Placement constants. Doctrine: real neon signage mounts on the wall
// fascia BELOW the roof eave, hanging a few decimeters out from the
// wall face. Earlier `roofLift=0.3` parked the tube ABOVE the rooftop
// inside the gable/hip roof volume — only visible through eave gaps,
// giving the "peeks out from somewhere" symptom. We retire the
// `neonTube` channel: these three are physically motivated, not
// authored values.
const TUBE_RADIUS      = 0.4    // ~16" — chunky enough to read at LS hero/browse distance
const ROOF_DROP        = 0.2    // tube center sits this far below rooftop seam (wall-mounted, not roof-mounted)
const OFFSET_OUT       = 0.35   // meters past the wall face — clears any eave overhang
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

// Quarter-round cross-section along the ring chain (top + outer).
// Returns flat arrays for the caller to merge.
//
// `centroidXZ` is the building's terrain-lift anchor: the X/Z where the
// owning building samples the heightmap. Buildings render via
// patchTerrain (rigid) which samples at modelMatrix[3] (=
// b.position.xz), so neon uses the same point. Every vertex of this
// place's tube carries the same aCentroidXZ; in the vertex shader the
// terrain texture is sampled there and `transformed.y` gets lifted by
// `sample * uExag`, matching the building's GPU lift exactly. Without
// this the tube sits 10–25 m below the rooftop on LS terrain.
function buildTubeFor(building) {
  const fp = building.footprint
  if (!fp || fp.length < 3) return null
  // Tube center sits ROOF_DROP below the rooftop edge — wall-mounted
  // signage, hanging OFFSET_OUT out from the wall face. GPU adds the
  // terrain lift per-vertex via aCentroidXZ + uTerrainMap.
  const baseY = (building.baseY ?? building.size?.[1] ?? 0) - ROOF_DROP
  const r = TUBE_RADIUS
  const rings = buildRingPath(fp)
  const m = rings.length
  if (m < 2) return null

  const cx = building.position?.[0] ?? 0
  const cz = building.position?.[2] ?? 0

  const positions = []
  const normals = []
  const uvs = []
  const centroidXZ = []
  for (let i = 0; i <= m; i++) {
    const ring = rings[i % m]
    const u = i / m
    // top, outer — radial smooth normals. Bottom + inner facets retired:
    // bottom lit the underside (camera below rooftop saw glow with no
    // physical emitter); inner lived inside the wall.
    positions.push(ring.x,                   baseY + r, ring.z)
    normals.push(0, 1, 0); uvs.push(u, 0);   centroidXZ.push(cx, cz)
    positions.push(ring.x + ring.nx * r,     baseY,     ring.z + ring.nz * r)
    normals.push(ring.nx, 0, ring.nz); uvs.push(u, 1); centroidXZ.push(cx, cz)
  }

  // 1 facet (top↔outer) per ring connection × 2 tris.
  const indices = []
  for (let i = 0; i < m; i++) {
    const a = i * 2
    const b = (i + 1) * 2
    indices.push(a + 0, b + 0, a + 1)
    indices.push(a + 1, b + 0, b + 1)
  }
  return { positions, normals, uvs, centroidXZ, indices }
}

const VERT = /* glsl */`
attribute vec3 aColor;
attribute vec2 aCentroidXZ;
uniform sampler2D uTerrainMap;
uniform float uBMinX, uBMinZ, uSpanX, uSpanZ, uExag;
varying vec3 vColor;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
void main() {
  vColor = aColor;
  vec3 lifted = position;
  // Per-building terrain lift — sample at the owning building's
  // (position.x, position.z), the same XZ buildings sample via
  // patchTerrain (rigid). All rings of one place lift together, so the
  // tube stays rigid relative to its rooftop.
  vec2 _tuv = clamp(vec2(
    (aCentroidXZ.x - uBMinX) / uSpanX,
    (aCentroidXZ.y - uBMinZ) / uSpanZ
  ), 0.0, 1.0);
  lifted.y += texture2D(uTerrainMap, _tuv).r * uExag;
  vec4 wp = modelMatrix * vec4(lifted, 1.0);
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
uniform float uEmissive;
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
  emissive *= uEmissive * uForceOn;

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
 * @param {boolean} [forceOn=true] — uniform render gate. Toy + Stage
 *   pass true so the shader fires regardless; production passes true
 *   too and gates visibility upstream via LafayetteScene's `openPlaces`
 *   (business-hours filter). When uForceOn=0 the shader discards.
 * @param {string} [lookId] — when provided, fetches the per-Look
 *   scene.json via `useSceneJson` and applies `scene.neon.values` to
 *   the shared `_neonUniforms` (uCore/uTube/uBleed Gaussian intensity
 *   masks + emissive). Authoring contexts (Cartograph Stage) skip the
 *   lookId pump path — CartographApp's per-frame `NeonPump` is the
 *   authoritative writer for these uniforms in that context.
 *
 * Geometry constants (tube radius, roof drop, wall offset) are no
 * longer operator-authored — they're physically motivated and live as
 * top-of-file constants. The previous `neonTube` channel retired
 * because authoring those values offered no design value while letting
 * the operator place the tube somewhere it would be occluded.
 */
export default function NeonBands({ places, forceOn = true, lookId }) {
  const scene = useSceneJson(lookId || '')
  useEffect(() => {
    if (!lookId || !scene?.neon?.values) return
    const v = scene.neon.values
    _neonUniforms.coreUniform.value     = v.core     ?? 0
    _neonUniforms.tubeUniform.value     = v.tube     ?? 0
    _neonUniforms.bleedUniform.value    = v.bleed    ?? 0
    _neonUniforms.emissiveUniform.value = v.emissive ?? 4
  }, [lookId, scene])

  const geometry = useMemo(() => {
    const positions  = []
    const normals    = []
    const uvs        = []
    const colors     = []
    const centroidXZ = []
    const indices    = []
    let baseVert = 0
    for (const p of places) {
      if (!p.neon?.category) continue
      const tube = buildTubeFor(p)
      if (!tube) continue
      const rgb = categoryColorVec(p.neon.category)
      const count = tube.positions.length / 3
      for (let i = 0; i < tube.positions.length;  i++) positions.push(tube.positions[i])
      for (let i = 0; i < tube.normals.length;    i++) normals.push(tube.normals[i])
      for (let i = 0; i < tube.uvs.length;        i++) uvs.push(tube.uvs[i])
      for (let i = 0; i < tube.centroidXZ.length; i++) centroidXZ.push(tube.centroidXZ[i])
      for (let i = 0; i < count; i++) colors.push(rgb[0], rgb[1], rgb[2])
      for (let i = 0; i < tube.indices.length; i++) indices.push(baseVert + tube.indices[i])
      baseVert += count
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position',    new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal',      new THREE.Float32BufferAttribute(normals, 3))
    geo.setAttribute('uv',          new THREE.Float32BufferAttribute(uvs, 2))
    geo.setAttribute('aColor',      new THREE.Float32BufferAttribute(colors, 3))
    geo.setAttribute('aCentroidXZ', new THREE.Float32BufferAttribute(centroidXZ, 2))
    geo.setIndex(indices)
    // Bounding sphere intentionally NOT computed: CPU positions are in
    // terrain-naive Y; the GPU vertex shader lifts every vertex by
    // ~10–25m at LS scale before draw. A sphere fit on CPU positions
    // lies meters below the actual rendered mesh and gets the whole
    // thing frustum-culled at close range, producing the "neon
    // flashes and disappears as I creep around" symptom. We turn
    // off frustum culling on the mesh instead — single small draw,
    // the cost of always submitting it is trivial.
    return geo
  }, [places])

  // Material is stable; forceOn live updates write through the
  // material's uniform refs so we avoid rebuilding the ShaderMaterial.
  // Intensity + emissive uniforms are shared module-scope refs that
  // NeonPump / the useEffect above mutate directly.
  const materialRef = useRef(null)
  if (!materialRef.current) {
    materialRef.current = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uCore:       _neonUniforms.coreUniform,
        uTube:       _neonUniforms.tubeUniform,
        uBleed:      _neonUniforms.bleedUniform,
        uEmissive:   _neonUniforms.emissiveUniform,
        uForceOn:    { value: forceOn ? 1.0 : 0.0 },
        // Shared terrain uniforms — by reference, so the per-frame
        // uExag update from StreetRibbons drives this material too.
        uTerrainMap: TERRAIN_UNIFORMS.uTerrainMap,
        uBMinX:      TERRAIN_UNIFORMS.uBMinX,
        uBMinZ:      TERRAIN_UNIFORMS.uBMinZ,
        uSpanX:      TERRAIN_UNIFORMS.uSpanX,
        uSpanZ:      TERRAIN_UNIFORMS.uSpanZ,
        uExag:       TERRAIN_UNIFORMS.uExag,
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
    })
    // Unique program cache key — half-tube terrain-lifted neon is a
    // distinct shader family from any other patched material.
    // [[feedback_unique_program_cache_key_before_wrappers]]
    materialRef.current.customProgramCacheKey = () => 'neon-bands-halftube-terrain-v1'
  }
  materialRef.current.uniforms.uForceOn.value = forceOn ? 1.0 : 0.0

  useEffect(() => () => { geometry.dispose() }, [geometry])
  useEffect(() => () => { materialRef.current?.dispose() }, [])

  return <mesh geometry={geometry} material={materialRef.current} renderOrder={20} frustumCulled={false} />
}
