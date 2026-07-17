import { useMemo, useState, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CATEGORY_HEX } from '../tokens/categories'
import { neon as _neonUniforms } from '../preview/neonState.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { UNIFORMS as TERRAIN_UNIFORMS } from '../utils/terrainShader'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import { NEON_FIELD_KEYS, NEON_FLAT_DEFAULTS } from '../cartograph/skyLightChannels.js'

/**
 * NeonBands — wall-mounted glass-tube signage along the rooftop perimeter
 * of every open place. One merged mesh per scene, one draw, one
 * ShaderMaterial. (Renamed from NeonBandsV2.jsx 2026-05-18 after the
 * V2 rewrite shipped and v1 was excised; see BACKLOG 2026-05-16 entry
 * for the rewrite arc and the five-wrong-diagnoses lesson record.)
 *
 * Design rules followed:
 *   - One merged mesh per scene (per HANDOFF-neon Path B + FEATURES §Neon)
 *   - Slab-completeness: intensity from scene.json.neon.values, by
 *     reference (NeonPump writes the shared uniform refs in Stage;
 *     production reads scene.json once via useSceneJson)
 *   - Per-vertex terrain lift via the shared `aCentroidY` attribute
 *     (mean of footprint-corner raw elevations, threaded through
 *     openPlaces as `place.groundYRaw`) — matches the canonical
 *     anchor mechanism used by Foundations and Building walls per
 *     FEATURES.md anchor-rule doctrine. NOT a GPU terrain-map
 *     texture sample.
 *   - No operator-authored geometry knobs (radius / drop / offset);
 *     they're physically motivated constants
 *
 * Geometry pipeline per building:
 *   1. Walk footprint → ring chain offset OFFSET_OUT outward from wall
 *      (winding detected per-footprint via point-in-polygon probe so
 *      mixed CW/CCW datasets all land outside the wall)
 *   2. Convex corners sweep an arc to keep offset uniform; concave
 *      corners mitre; near-straight bends collapse to one offset point
 *   3. Sweep a FULL circular cross-section (CROSS_SEGS facets) along
 *      the chain. Tube center axis sits at baseY = rooftop − ROOF_DROP
 *      so it reads as wall-fascia signage, not roof-mounted
 *   4. Index winding emits outward-facing triangles; the cross-section
 *      is fully closed so every camera angle sees some part of the tube
 *
 * Material: DoubleSide + AdditiveBlending ShaderMaterial. The fragment
 * shader does NOT flip the normal on back faces — back faces compute
 * dot(N, V) < 0 which clamps to 0, producing a dim bleed-only halo on
 * the camera-far side. That's the physically correct look for an
 * omnidirectional glass emitter: bright on the near side, soft glow on
 * the far side. Earlier prototypes that flipped the normal on the back
 * face made both sides hit coreMask ≈ 1 at the same camera angle and
 * the tube read as a flat ribbon. The <logdepthbuf_*> GLSL chunks are
 * #included so this raw ShaderMaterial can participate in the Canvas's
 * logarithmic depth buffer — but the USE_LOGDEPTHBUF define is gated on the
 * renderer's actual `logarithmicDepthBuffer` capability (Stage/Preview run log
 * depth, production runs linear), so neon always matches the depth encoding the
 * rest of the scene uses and occludes correctly. See
 * feedback_raw_shadermaterial_needs_logdepth_chunks memory + the material below.
 */

// ── Geometry constants ──────────────────────────────────────────────
// Tube radius is operator-authored as a TOD-animatable field in the
// `neon` channel (Sky & Light → Neon → Tube radius slider). It flows
// through the same module-uniform container as core/tube/bleed/emissive
// (_neonUniforms.tubeRadiusUniform). In Stage, NeonPump writes it every
// frame from the resolved channel; in production, the component's
// useEffect writes the scene.json baseline. Unlike the four shader
// uniforms, this one drives vertex positions, so the geometry useFrame
// quantizes and rebuilds the merged BufferGeometry when the value
// crosses a step boundary. ROOF_DROP is computed inside buildTube as
// `-tubeRadius` so the tube BOTTOM always lands flush with the rooftop.
const DEFAULT_TUBE_RADIUS = 1.0
const TUBE_RADIUS_STEP    = 0.05               // quantize per-frame radius read to this step before triggering rebuild
// Screen-relative floor (universal neon facelift, 2026-07-16). The tube is built
// in world meters, so past street level a 1m tube shrinks to a sub-pixel strip —
// the neon vanishes exactly where the browse/overhead shot most wants it. The
// vertex shader floors the on-screen tube radius to MIN_SCREEN_PX device pixels:
// close up (hero) it stays physical; far away it grows just enough to keep a
// readable, glowing line. Physically-motivated + by-eye tuned, not an operator knob.
const MIN_SCREEN_PX = 2.5
const OFFSET_OUT   = 0.5                       // meters past wall face — clears any eave/cornice
const CROSS_SEGS   = 8                         // facets around the circular cross-section
const CORNER_SEGS  = 3                         // arc segs per convex corner
const CORNER_MIN   = 15 * Math.PI / 180        // turns smaller than this collapse to one mitred point

// ── Helpers ─────────────────────────────────────────────────────────

function pointInPolyXZ(px, pz, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Resolve the outward perpendicular sign for a footprint walked in
 * either winding. Probe the first edge's midpoint offset by the raw
 * `(e_z, -e_x)` normal; if that probe point falls INSIDE the polygon
 * the raw normal is inward and we flip. Robust per-footprint — works
 * with the mixed CW/CCW windings in buildings.json.
 */
function detectOutwardSign(footprint) {
  const [x1, z1] = footprint[0]
  const [x2, z2] = footprint[1]
  const ex = x2 - x1, ez = z2 - z1
  const L = Math.hypot(ex, ez) || 1
  const nx = ez / L, nz = -ex / L
  const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2
  return pointInPolyXZ(mx + nx * 0.01, mz + nz * 0.01, footprint) ? -1 : 1
}

/**
 * Walk footprint → emit ring chain at uniform OFFSET_OUT outward.
 * Convex corners: arc sweep (smooth offset). Concave: mitred ring.
 * Near-straight: single averaged ring.
 *
 * Each ring carries { x, z, nx, nz } — center XZ + outward direction.
 * The outward direction is needed downstream to orient the tube's
 * cross-section.
 */
function buildPath(footprint) {
  const n = footprint.length
  const ws = detectOutwardSign(footprint)
  const rings = []
  for (let i = 0; i < n; i++) {
    const prev = footprint[(i - 1 + n) % n]
    const cur  = footprint[i]
    const next = footprint[(i + 1) % n]
    const e1x = cur[0] - prev[0], e1z = cur[1] - prev[1]
    const e2x = next[0] - cur[0], e2z = next[1] - cur[1]
    const l1 = Math.hypot(e1x, e1z) || 1
    const l2 = Math.hypot(e2x, e2z) || 1
    const n1x = ws * (e1z / l1), n1z = ws * (-e1x / l1)
    const n2x = ws * (e2z / l2), n2z = ws * (-e2x / l2)
    const dotN = Math.max(-1, Math.min(1, n1x * n2x + n1z * n2z))
    const turn = Math.acos(dotN)
    // Convex when the turn opens away from the interior — sign depends
    // on the footprint winding which `ws` already captures.
    const isConvex = (n1x * n2z - n1z * n2x) * ws > 0

    if (turn < CORNER_MIN) {
      let nx = (n1x + n2x) / 2, nz = (n1z + n2z) / 2
      const nl = Math.hypot(nx, nz) || 1
      nx /= nl; nz /= nl
      rings.push({ x: cur[0] + nx * OFFSET_OUT, z: cur[1] + nz * OFFSET_OUT, nx, nz })
    } else if (isConvex) {
      const a1 = Math.atan2(n1z, n1x)
      const segs = Math.max(1, Math.min(CORNER_SEGS, Math.ceil(turn / (Math.PI / 4))))
      for (let s = 0; s <= segs; s++) {
        const a = a1 + turn * (s / segs) * ws  // sweep direction follows winding
        const nx = Math.cos(a), nz = Math.sin(a)
        rings.push({ x: cur[0] + nx * OFFSET_OUT, z: cur[1] + nz * OFFSET_OUT, nx, nz })
      }
    } else {
      let nx = (n1x + n2x) / 2, nz = (n1z + n2z) / 2
      const nl = Math.hypot(nx, nz) || 1
      nx /= nl; nz /= nl
      const mitre = Math.min(1 / Math.sqrt((1 + dotN) / 2), 4)
      rings.push({ x: cur[0] + nx * OFFSET_OUT * mitre, z: cur[1] + nz * OFFSET_OUT * mitre, nx, nz })
    }
  }
  return rings
}

/**
 * Sweep a circular cross-section along the ring chain → cylindrical
 * tube. Returns flat geometry buffers (caller merges all places into
 * one BufferGeometry).
 *
 * Cross-section: full circle (CROSS_SEGS facets) in the vertical plane
 * spanned by ŷ (up) and n̂ (outward from wall). Vertex at angle θ:
 *     P = ring + r * (cos θ · ŷ + sin θ · n̂)
 *     N = cos θ · ŷ + sin θ · n̂          (smooth radial normal)
 *
 * Index winding: outward-facing (CCW viewed from outside the tube).
 * Verified by cross-product on a +X-edge / +Z-outward facet: the order
 * (P00, P01, P10) yields a triangle whose geometric normal points
 * up-and-outward, matching the smooth vertex normals.
 *
 * Closure: one extra ring at i=m and one extra vertex at s=CROSS_SEGS
 * gives degenerate-free UV wrap. The closure vertices are positionally
 * identical to their counterparts at i=0 / s=0 — no extra draws since
 * they're index-referenced from neighboring quads.
 */
function buildTube(building, tubeRadius) {
  // Trace the building FOOTPRINT at the eave (the wall/roof joint), so neon hugs
  // the building outline and matches its size on every roof type — including
  // mansards, whose inset top-cap used to read as a small ring floating up at the
  // peak (Jacob 2026-06-27). (Was: trace `roofOutline` at the roof peak.)
  const fp = building.footprint
  if (!fp || fp.length < 3) return null
  const r = tubeRadius
  // ROOF_DROP = -r puts tube BOTTOM at rooftop seam (whole tube above
  // wall geometry, regardless of authored radius).
  const baseY = (building.baseY ?? building.size?.[1] ?? 0) - (-r)
  const path = buildPath(fp)
  const m = path.length
  if (m < 2) return null

  // Per-building terrain anchor: mean of footprint-corner raw elevations,
  // matching Foundations (LafayetteScene.jsx:368) and Building walls
  // (LafayetteScene.jsx:615). Threaded through openPlaces as place.groundYRaw.
  const centroidY = building.groundYRaw ?? 0

  const VPR = CROSS_SEGS + 1
  const positions = []
  const normals = []
  const uvs = []
  const centroidYs = []
  for (let i = 0; i <= m; i++) {
    const ring = path[i % m]
    const u = i / m
    for (let s = 0; s <= CROSS_SEGS; s++) {
      const theta = (s / CROSS_SEGS) * Math.PI * 2
      const cs = Math.cos(theta), sn = Math.sin(theta)
      positions.push(
        ring.x + sn * r * ring.nx,
        baseY + cs * r,
        ring.z + sn * r * ring.nz,
      )
      normals.push(sn * ring.nx, cs, sn * ring.nz)
      uvs.push(u, s / CROSS_SEGS)
      centroidYs.push(centroidY)
    }
  }

  const indices = []
  for (let i = 0; i < m; i++) {
    const a = i * VPR
    const b = (i + 1) * VPR
    for (let s = 0; s < CROSS_SEGS; s++) {
      indices.push(a + s,     a + s + 1, b + s)
      indices.push(a + s + 1, b + s + 1, b + s)
    }
  }
  return { positions, normals, uvs, centroidYs, indices }
}

function categoryColorVec(category) {
  const key = (category || '').replace(/^neon_/, '')
  const c = new THREE.Color(CATEGORY_HEX[key] || '#ff66cc')
  return [c.r, c.g, c.b]
}

// ── Shader ──────────────────────────────────────────────────────────
//
// "Round tube" look is a SHADER illusion, not pure geometry. The
// Gaussian masks (core / tube / bleed) are sampled by view-fresnel
// `r = 1 − dot(N, V)` so the core is hot where the tube faces the
// camera and fades at the silhouette — bloom turns the bleed term
// into volumetric glow at zero geometric cost.

const VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aColor;
attribute float aCentroidY;
uniform float uExag;
uniform float uBuiltRadius;   // world radius the merged geometry was swept at (== the live tubeRadius)
uniform float uMinPx;         // screen-relative floor: tube never renders thinner than this (device px)
uniform float uMaxPx;         // screen-relative ceiling: tube never renders fatter than this (0 = disabled)
uniform float uViewportH;     // drawing-buffer height in device px
varying vec3 vColor;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
void main() {
  vColor = aColor;
  // Screen-relative floor. Each vertex is axis + uBuiltRadius * normal, where
  // normal is the unit radial dir of the circular cross-section — so the axis
  // (tube centerline) recovers exactly as position - uBuiltRadius * normal. We
  // re-emit the vertex at an EFFECTIVE radius that never falls below uMinPx on
  // screen: physical when close, floored when far. It still shrinks with distance
  // down to the floor, then holds — the tube reads as a glowing line at any zoom.
  float liftY = aCentroidY * uExag;
  vec3 axis = position - uBuiltRadius * normal;
  vec4 axisWorld = modelMatrix * vec4(axis + vec3(0.0, liftY, 0.0), 1.0);
  vec4 clipAxis = projectionMatrix * viewMatrix * axisWorld;
  // Isotropic pixels-per-meter at this depth. Perspective: clip.w == -viewZ;
  // ortho: clip.w == 1 (distance-independent). projectionMatrix[1][1] is the
  // y-scale (1/tan(fov/2) perspective, 2/(t-b) ortho) — both > 0.
  float pxPerM = projectionMatrix[1][1] * 0.5 * uViewportH / max(clipAxis.w, 1e-4);
  float invPxPerM = 1.0 / max(pxPerM, 1e-6);
  // Floor: never thinner than uMinPx on screen.
  float rEff = max(uBuiltRadius, uMinPx * invPxPerM);
  // Ceiling: never fatter than uMaxPx on screen (uMaxPx <= 0 disables it).
  if (uMaxPx > 0.0) rEff = min(rEff, uMaxPx * invPxPerM);
  vec3 lifted = axis + normal * rEff + vec3(0.0, liftY, 0.0);
  vec4 wp = modelMatrix * vec4(lifted, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`

const FRAG = /* glsl */`
precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uCore;
uniform float uTube;
uniform float uBleed;
uniform float uEmissive;
uniform float uForceOn;
varying vec3 vColor;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vWorldNormal);
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

// ── Component ───────────────────────────────────────────────────────

export default function NeonBands({ places, forceOn = true, lookId }) {
  const scene = useSceneJson(lookId || '')

  // Match the renderer's ACTUAL depth encoding. The Canvas this neon mounts in
  // may run linear depth (production Scene.jsx) or logarithmic (Stage / Preview,
  // which set logarithmicDepthBuffer:true). three only uploads the `logDepthBufFC`
  // uniform when the renderer was created with logarithmicDepthBuffer:true
  // (WebGLRenderer.setProgram). Forcing the logdepth chunk on in a LINEAR
  // renderer therefore runs the vertex transform with logDepthBufFC=0, which
  // collapses every neon vertex to NDC z=-1 (the near plane) — so the tube draws
  // over everything, including nearer trees in hero. Gating the define on the
  // real capability makes neon use whatever depth the rest of the scene uses, so
  // it occludes correctly in both. See HANDOFF-neon-roof-depth.md Phase 2 and
  // [[feedback_raw_shadermaterial_needs_logdepth_chunks]].
  const logDepth = useThree((s) => s.gl.capabilities.logarithmicDepthBuffer)
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!lookId || !scene?.neon?.values) return
    // Resolve the (TOD-animated) neon channel at the current minute — same as
    // Stage's NeonPump. The OLD code flat-read `scene.neon.values.core`, which
    // is `undefined` once neon is `animated:"tod"` (values is slot-keyed, e.g.
    // {golden:{…}}) → core/tube = 0 → tubes built but rendered at ZERO intensity
    // → INVISIBLE in production. Force-on "worked" only in Stage, where NeonPump
    // resolves the slot. (2026-06-29 regression fix.) In Stage, NeonPump's
    // per-frame write still wins; this mount-time resolve is the production /
    // Preview baseline (single-slot today → constant; promote to a gated
    // per-frame pump if a multi-slot neon TOD curve is ever authored).
    const tod = useTimeOfDay.getState()
    const slotMinutes = scene.neon.animated ? getTodSlotMinutes(tod.currentTime) : null
    const v = resolveGroupAtMinute(scene.neon, tod.getMinuteOfDay(), slotMinutes, NEON_FIELD_KEYS, NEON_FLAT_DEFAULTS)
    _neonUniforms.coreUniform.value       = v.core       ?? 0
    _neonUniforms.tubeUniform.value       = v.tube       ?? 0
    _neonUniforms.bleedUniform.value      = v.bleed      ?? 0
    _neonUniforms.emissiveUniform.value   = v.emissive   ?? 4
    _neonUniforms.tubeRadiusUniform.value = v.tubeRadius ?? DEFAULT_TUBE_RADIUS
    _neonUniforms.screenFloorUniform.value = v.screenFloor ?? MIN_SCREEN_PX
    _neonUniforms.screenCeilUniform.value  = v.screenCeil  ?? 0
    // Production runs frameloop="demand". These are imperative writes to shared
    // uniform objects (not React props), so they don't trigger R3F's auto-
    // invalidate — and the uniforms init to 0 (alpha<0.01 → discard → invisible).
    // Without this, neon mounts dark, the values land here, and no frame is ever
    // requested → neon stays off until a camera nudge. (2026-06-28 — the "neon
    // not showing at all" bug; sibling of the InstancedTrees demand-mode fix.)
    invalidate()
  }, [lookId, scene, invalidate])

  // Tube radius — animated like the other four fields, but the value
  // drives vertex positions (not a shader uniform), so a change must
  // trigger a merged BufferGeometry rebuild. Poll the shared module
  // container each frame; quantize to TUBE_RADIUS_STEP so smooth TOD
  // interpolation between authored slots only rebuilds when the value
  // actually crosses a step boundary (≤ ~60 rebuilds per full sweep
  // across the 0.1–3.0 range, not 60/sec). No debounce: now that the
  // depthbuf bug is fixed and the per-frame quantization is correct,
  // immediate commit keeps the slider feeling responsive.
  const [r, setR] = useState(DEFAULT_TUBE_RADIUS)
  useFrame(() => {
    const live = _neonUniforms.tubeRadiusUniform.value || DEFAULT_TUBE_RADIUS
    const q = Math.round(live / TUBE_RADIUS_STEP) * TUBE_RADIUS_STEP
    if (Math.abs(q - r) > 1e-6) setR(q)
    // Keep the screen-relative floor honest: the tube's on-screen radius is
    // computed against the live drawing-buffer height (device px, DPR-correct).
    const mat = materialRef.current
    if (mat) mat.uniforms.uViewportH.value = gl.domElement.height
  })

  const geometry = useMemo(() => {
    const positions = [], normals = [], uvs = [], colors = [], centroidYs = [], indices = []
    let baseVert = 0
    for (const p of places) {
      if (!p.neon?.category) continue
      const tube = buildTube(p, r)
      if (!tube) continue
      const rgb = categoryColorVec(p.neon.category)
      const count = tube.positions.length / 3
      for (let i = 0; i < tube.positions.length;  i++) positions.push(tube.positions[i])
      for (let i = 0; i < tube.normals.length;    i++) normals.push(tube.normals[i])
      for (let i = 0; i < tube.uvs.length;        i++) uvs.push(tube.uvs[i])
      for (let i = 0; i < tube.centroidYs.length; i++) centroidYs.push(tube.centroidYs[i])
      for (let i = 0; i < count; i++) colors.push(rgb[0], rgb[1], rgb[2])
      for (let i = 0; i < tube.indices.length; i++) indices.push(baseVert + tube.indices[i])
      baseVert += count
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position',    new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('normal',      new THREE.Float32BufferAttribute(normals, 3))
    g.setAttribute('uv',          new THREE.Float32BufferAttribute(uvs, 2))
    g.setAttribute('aColor',      new THREE.Float32BufferAttribute(colors, 3))
    g.setAttribute('aCentroidY', new THREE.Float32BufferAttribute(centroidYs, 1))
    g.setIndex(indices)
    // Bounding sphere intentionally not computed: vertex shader lifts
    // every vertex by ~10–25m on LS terrain, so a CPU-fit sphere lies
    // meters below the rendered geometry and gets frustum-culled at
    // close range. `frustumCulled={false}` on the mesh instead — one
    // small draw, trivial cost.
    return g
  }, [places, r])

  const materialRef = useRef(null)
  if (!materialRef.current) {
    materialRef.current = new THREE.ShaderMaterial({
      // Define ONLY when the renderer actually runs a log-depth buffer (Stage /
      // Preview). Then three compiles in the <logdepthbuf_*> chunks the VERT/FRAG
      // strings #include AND uploads logDepthBufFC, so neon shares the log-depth
      // encoding every standard material uses. In a LINEAR renderer (production
      // Scene.jsx) the define is dropped → the #ifdef'd chunks compile to no-ops →
      // neon writes the same standard gl_Position.z as every other material and
      // depth-tests correctly. Forcing the define unconditionally was the hero
      // depth bug (logDepthBufFC=0 → near-plane collapse). See FEATURES.md
      // §"Layering / coplanar stacking / depth precision",
      // [[feedback_raw_shadermaterial_needs_logdepth_chunks]], and
      // HANDOFF-neon-roof-depth.md Phase 2.
      defines: logDepth ? { USE_LOGDEPTHBUF: '' } : {},
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uCore:       _neonUniforms.coreUniform,
        uTube:       _neonUniforms.tubeUniform,
        uBleed:      _neonUniforms.bleedUniform,
        uEmissive:   _neonUniforms.emissiveUniform,
        uForceOn:    { value: forceOn ? 1.0 : 0.0 },
        uExag:       TERRAIN_UNIFORMS.uExag,
        uBuiltRadius:{ value: DEFAULT_TUBE_RADIUS },
        uMinPx:      _neonUniforms.screenFloorUniform,  // shared ref: NeonPump/production write it live
        uMaxPx:      _neonUniforms.screenCeilUniform,   // 0 → no ceiling
        uViewportH:  { value: 1080 },
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      // DoubleSide + no normal flip in the fragment: back faces compute
      // dot(N, V) < 0 which clamps to 0, producing a dim bleed-only
      // halo on the camera-far side. Full doctrine in the file header.
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    // Unique key — distinct shader family, do NOT collide with the
    // terrain-patched program cache. [[feedback_unique_program_cache_key_before_wrappers]]
    // Encode the logdepth variant: the linear and log builds differ by the
    // USE_LOGDEPTHBUF define, so they must not share a cached program if both
    // ever live in one process (e.g. a linear production view + a log preview).
    materialRef.current.customProgramCacheKey = () => `neon-bands-full-cylinder-${logDepth ? 'logdepth' : 'lineardepth'}`
  }
  materialRef.current.uniforms.uForceOn.value = forceOn ? 1.0 : 0.0
  // The screen-floor shader recovers each tube's axis as position - uBuiltRadius *
  // normal, so this MUST equal the radius the merged geometry was actually swept at
  // (the quantized `r`, which drives the geometry rebuild above). Set every render.
  materialRef.current.uniforms.uBuiltRadius.value = r

  useEffect(() => () => { geometry.dispose() }, [geometry])
  useEffect(() => () => { materialRef.current?.dispose() }, [])

  // renderOrder above every baked-ground transparent group (bake max is
  // ~42 — `mat.path` slot in the current LS look — plus StreetLights pool
  // at 50). Neon is `depthWrite:false`, so if it drew BEFORE the ground,
  // pixels of neon-against-sky leave the depth buffer at 1.0 and any
  // later transparent ground fragment (asphalt at street level, ~0.95)
  // passes its depthTest against that 1.0 and overdraws the neon. Drawing
  // neon LAST puts the ground's depth in the buffer first; the tube then
  // depth-tests correctly (against the same depth encoding the renderer uses —
  // see the logDepth gating on the material). This ordering is about
  // transparent compositing + depthWrite:false, independent of log vs linear.
  return <mesh geometry={geometry} material={materialRef.current} renderOrder={100} frustumCulled={false} />
}
