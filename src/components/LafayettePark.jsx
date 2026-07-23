import { useMemo, useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
// ⚠️ DEFERRED-TO-PRODUCER exception (Universal Reader Phase 2, Jacob's ruling).
// LafayettePark is LS-specific landmark RENDER: park_water / ribbons / park-polygon
// / park-feature-elev (below) are installation-specific geometry (shared with the
// bake pipeline) feeding a module-scope cascade (_PARK_AXIS_RAD / PARK_HALF / label
// positions). Making it generic needs the geometry pipeline restructured (per-look
// park + ready-gates) — the producer/render-emit arc's job, not this reader phase.
// Left static; the component is mount-guarded to LS (below) so a non-LS look
// renders no park rather than LS's. Owner: roster/render arc.
import parkWaterData from '../data/lafayette-square/park_water.json'
import ribbonsData from '../data/ribbons.json'
import parkPolygon from '../../cartograph/data/lafayette-square/clean/park-polygon.json'
import { getElevationRaw, V_EXAG } from '../utils/elevation'
import { useSceneJson } from '../lib/useSceneJson.js'
import { INSTANCE } from '../instance.js'
import { makeGrassMaterial } from './grassMaterial.js'
import { getLampLightmap } from './lampLightmap.js'
import { terrainExag, patchTerrain } from '../utils/terrainShader'
import useCartographStore from '../cartograph/stores/useCartographStore.js'
import { ringsToFlatGeo } from '../lib/ringsToFlatGeo.js'
import { buildParkPathRings, mergeRings } from '../lib/parkPaths.js'
import { buildStairGeometry } from '../lib/buildStairGeometry.js'
import featureElev from '../data/park-feature-elev.json'
import { makeGravelPathMaterial } from './gravelPathMaterial.js'

// Lafayette Park: ~350m square park (30 acres) centered at origin.
// Bounded by Park Ave (N), Lafayette Ave (S), Mississippi Ave (W),
// Kennett Place (E). The actual fence in real life is rotated -9.2°
// from compass-N because the whole city grid sits at that bearing.
// All spatial data is in compass frame; the polygon's natural axes
// (axis-aligned ±a) bake in the real-world tilt via parkAxisToCompass
// to land at correct compass-frame positions. Source of truth: the
// authored 4-corner polygon at cartograph/data/lafayette-square/clean/
// park-polygon.json — see cartograph/FEATURES.md "The ribbon doctrine"
// for why polygons own corner geometry.
// LABEL_TEXT_ROT_Y rotates label text to read along the fence direction.
const _PARK_AXIS_RAD = parkPolygon.tiltDegrees * Math.PI / 180
const _C = Math.cos(_PARK_AXIS_RAD)
const _S = Math.sin(_PARK_AXIS_RAD)
function parkAxisToCompass(px, pz) {
  return [px * _C + pz * _S, -px * _S + pz * _C]
}

const PARK_HALF = parkPolygon.halfWidthMeters
const FENCE_INSET = 2
const PARK_FENCE_CORNERS = (() => {
  const a = PARK_HALF - FENCE_INSET
  return [
    parkAxisToCompass(-a, -a),
    parkAxisToCompass( a, -a),
    parkAxisToCompass( a,  a),
    parkAxisToCompass(-a,  a),
  ]
})()
// Inside the park, north of center (was -PARK_HALF-15/-23 — out over Park
// Avenue, colliding with the curved street labels; 2026-06-23). ~0.35 of the
// way from center toward the north edge: clear of the street. Operator-nudgeable.
// Exported so the 2D Designer map (MapLayers) can draw a flat park title at the
// SAME position/orientation as the 3D landmark — one source, so they can't drift.
export const LABEL_TITLE_POS    = parkAxisToCompass(0, -PARK_HALF * 0.35)
const LABEL_SUBTITLE_POS = parkAxisToCompass(0, -PARK_HALF * 0.35 + 9)
export const LABEL_TEXT_ROT_Y = _PARK_AXIS_RAD
// The default park-title center (between title + subtitle anchors). The move
// handle overrides it via store.parkTitlePos; null there = this.
export const PARK_TITLE_DEFAULT_CENTER = [
  (LABEL_TITLE_POS[0] + LABEL_SUBTITLE_POS[0]) / 2,
  (LABEL_TITLE_POS[1] + LABEL_SUBTITLE_POS[1]) / 2,
]

const FENCE_HEIGHT = 1.5
const FENCE_POST_SPACING = 8
const TAU = Math.PI * 2

// Lamp lightmap moved to ./lampLightmap.js for sharing with StreetRibbons.

// ── SVG clip mask for park boundary ──────────────────────────────────
const svgUrl = `${import.meta.env.BASE_URL}${INSTANCE.branding.assetSlug}.svg?v=${Date.now()}`
const SVG_WORLD_X = -843.2
const SVG_WORLD_Z = -1156.1
const SVG_VB_W = 2000
const SVG_VB_H = 2000

// ── Park Ground with procedural grass texture ──────────────────────────
function ParkGround() {
  const [clipTexture, setClipTexture] = useState(null)
  // shaderRef is owned by the grass material factory and populated on compile.
  const grassMatObj = useMemo(() => makeGrassMaterial({
    lampLightmap: getLampLightmap(),
    clipMin: new THREE.Vector2(SVG_WORLD_X, SVG_WORLD_Z),
    clipSize: new THREE.Vector2(SVG_VB_W, SVG_VB_H),
  }), [])
  const grassShaderRef = grassMatObj.shaderRef

  // Fetch SVG and rasterize park-boundary to a clip mask texture
  useEffect(() => {
    fetch(svgUrl)
      .then(r => r.text())
      .then(svgText => {
        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
        // Check for XML parse errors
        if (doc.querySelector('parsererror')) {
          console.warn('[ParkGround] SVG parse error:', doc.querySelector('parsererror').textContent)
          return
        }
        // The park boundary can come from two sources:
        // 1. The clip-path used by the paths group (simple closed polygon — preferred)
        // 2. The #park-boundary element (may be a sidewalk donut with 2 subpaths)
        // We prefer the clip-path because it's always a single closed polygon.
        let dAttrs = []

        // Strategy 1 (preferred): clip-path from the paths group
        const pathsGroup = doc.querySelector('[id="paths1"]')
        if (pathsGroup) {
          const clipped = pathsGroup.querySelector('[clip-path]') || pathsGroup
          const clipRef = (clipped.getAttribute('clip-path') || '').match(/url\(#(.+?)\)/)
          if (clipRef) {
            const clipEl = doc.querySelector(`[id="${clipRef[1]}"]`)
            if (clipEl) {
              dAttrs = [...clipEl.querySelectorAll('path')].map(p => p.getAttribute('d')).filter(Boolean)
            }
          }
        }

        // Strategy 2 (fallback): #park-boundary element — split multi-M paths
        // to fill each subpath separately (avoids winding cancellation)
        if (!dAttrs.length) {
          const boundary = doc.querySelector('[id^="park-boundary"]')
          if (boundary) {
            const ln = (boundary.tagName || '').toLowerCase()
            const paths = ln === 'path' ? [boundary] : [...boundary.querySelectorAll('path')]
            for (const p of paths) {
              const d = p.getAttribute('d')
              if (d) {
                // Split compound paths at M commands — fill each subpath independently
                // to avoid winding rule cancellation (outer+inner = empty with nonzero rule)
                for (const sub of d.split(/(?=M)/)) {
                  if (sub.length > 10) dAttrs.push(sub)
                }
              }
            }
          }
        }

        if (!dAttrs.length) { console.warn('[ParkGround] no park boundary found'); return }

        const RES = 4096
        const canvas = document.createElement('canvas')
        canvas.width = RES
        canvas.height = Math.round(RES * (SVG_VB_H / SVG_VB_W))
        const ctx = canvas.getContext('2d')

        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#fff'
        ctx.scale(canvas.width / SVG_VB_W, canvas.height / SVG_VB_H)

        // Fill park interior in white — grass renders inside this mask
        for (const d of dAttrs) {
          ctx.fill(new Path2D(d))
        }

        const tex = new THREE.CanvasTexture(canvas)
        tex.flipY = false
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
        tex.minFilter = THREE.LinearFilter
        setClipTexture(tex)
      })
      .catch(err => console.warn('[ParkGround] SVG fetch failed:', err))
  }, [])

  // Update clip uniform when texture loads (shader already compiled)
  useEffect(() => {
    if (grassShaderRef.current && clipTexture) {
      grassShaderRef.current.uniforms.uClipMap.value = clipTexture
      grassShaderRef.current.uniforms.uHasClip.value = 1.0
    }
  }, [clipTexture])

  const grassMat = grassMatObj.material

  useFrame(() => {
    if (grassShaderRef.current) {
      const { sunAltitude } = useTimeOfDay.getState().getLightingPhase()
      grassShaderRef.current.uniforms.uSunAltitude.value = sunAltitude
      // Apply clip mask (also handles HMR where shader recompiles after texture loaded)
      if (clipTexture) {
        grassShaderRef.current.uniforms.uClipMap.value = clipTexture
        grassShaderRef.current.uniforms.uHasClip.value = 1.0
      }
    }
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} receiveShadow material={grassMat} frustumCulled={false}>
      <planeGeometry args={[500, 500, 1, 1]} />
    </mesh>
  )
}

// ── Park Paths — UNIFIED onto the real path pipeline (2026-06-27) ────
// Park footpaths are real OSM data that already arrive in the shared prebake
// artifact `ribbons.json` `.paths`. The LAND footpaths are now baked into the
// ground stack as the `park_path` gravel group (cartograph/bake-ground.js →
// BakedGround's GravelMesh) and drawn in the 2D Designer — so they ride
// terrain, sit in paint order, gate off the `park_path` layer toggle, and ship
// in the slab. The old fork (a private buildPathRibbons + scripts/14 +
// src/data/park_paths.json) is gone; width = each path's `pavedWidth` (real OSM).
//
// The ONE remaining live piece here is the lake BRIDGE: a path over water can't
// drape onto the flat ground stack (it would sink under the water mesh), so it
// stays a lifted overlay until the Phase-5 off-the-ground-paths arc makes
// bridges first-class. It reads the SAME ribbons data via the SAME shared
// builder (buildParkPathRings) + gravel material — no fork — and gates off the
// SAME `park_path` toggle as the baked land paths.
const PATH_BRIDGE_Y = 0.5  // clear water (0.35) + island top (0.4)

function ParkBridge({ lookId, bakeLastMs }) {
  const scene = useSceneJson(resolveLookId(lookId), bakeLastMs)
  const hidden = scene?.layerVis?.park_path === false
  const tintHex = scene?.layerColors?.park_path
  const roughness = scene?.materialPhysics?.park_path?.roughness
  const scale = scene?.materialPhysics?.park_path?.scale
  const { shaderRef, material } = useMemo(
    () => makeGravelPathMaterial({ tintHex, roughness, scale }),
    [tintHex, roughness, scale]
  )

  const bridgeGeo = useMemo(() => {
    const { bridge } = buildParkPathRings(ribbonsData, { polygon: parkPolygon, water: parkWaterData })
    const rings = mergeRings(bridge)
    return rings.length ? ringsToFlatGeo(rings, 0) : null
  }, [])

  useFrame(() => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uSunAltitude.value = useTimeOfDay.getState().getLightingPhase().sunAltitude
    }
  })

  if (hidden || !bridgeGeo) return null
  return (
    <group position={[0, PATH_BRIDGE_Y, 0]}>
      <mesh geometry={bridgeGeo} material={material} receiveShadow frustumCulled={false} />
    </group>
  )
}

// ── Park Stairs (real treads/risers, Phase 5) ────────────────────────
// `steps` polylines become 3D staircases (buildStairGeometry), placed RIGIDLY
// on terrain (a staircase IS a grade transition — can't drape like flat ground;
// it's split out of the flat park_path group in parkPaths.js). Direction:
// descend toward water where an end is near it, else toward lower terrain. ⚠️
// Some park steps actually ASCEND to a monument/pedestal — we have no monument
// coordinates to auto-detect that, so those read backwards until flipped; the
// kit-general fix is carrying OSM `incline` + an operator override (BACKLOG).
const STAIR_DESCEND_WATER_THRESH = 25
function nearestWaterDist(p, water) {
  const rings = []
  if (water?.lake?.outer) rings.push(water.lake.outer)
  if (Array.isArray(water?.grotto)) rings.push(water.grotto)
  else if (water?.grotto?.outer) rings.push(water.grotto.outer)
  let min = Infinity
  for (const ring of rings) for (const v of ring) {
    const d = Math.hypot(p[0] - v[0], p[1] - v[1]); if (d < min) min = d
  }
  return min
}

// Match a step polyline to its 3DEP sidecar record (endpoints, either order);
// returns elevations aligned to the step's own a/b, or null. Higher end = up.
function lookupStepElev(a, b, records) {
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.0
  for (const r of (records || [])) {
    if (near(a, r.a) && near(b, r.b)) return { elevA: r.elevA, elevB: r.elevB }
    if (near(a, r.b) && near(b, r.a)) return { elevA: r.elevB, elevB: r.elevA }
  }
  return null
}

function ParkStairs({ lookId, bakeLastMs }) {
  const scene = useSceneJson(resolveLookId(lookId), bakeLastMs)
  const hidden = scene?.layerVis?.steps === false
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#A0907E', roughness: 0.9 }), [])
  const stairs = useMemo(() => {
    const { steps } = buildParkPathRings(ribbonsData, { polygon: parkPolygon, water: parkWaterData })
    const out = []
    for (const s of steps) {
      const a = s.points[0], b = s.points[s.points.length - 1]
      // Prefer the measured 3DEP micro-grade (real direction + drop, handles
      // descend-to-water AND ascend-to-monument); fall back to the
      // water/terrain heuristic where the probe has no record.
      const probe = lookupStepElev(a, b, featureElev?.steps)
      let descendToB, drop
      if (probe) {
        descendToB = probe.elevB < probe.elevA          // descend toward the lower end
        // Bake the vertical exaggeration into the flight (constant V_EXAG, NOT
        // the live terrainExag — a group scale.y collapses the stairs to zero
        // in flat/top-down camera modes). The lift below still rides the live
        // exag terrain; only the stair's own rise is boosted to read at scale.
        drop = Math.abs(probe.elevA - probe.elevB) * V_EXAG
      } else {
        const dwA = nearestWaterDist(a, parkWaterData), dwB = nearestWaterDist(b, parkWaterData)
        descendToB = Math.min(dwA, dwB) < STAIR_DESCEND_WATER_THRESH
          ? dwB < dwA
          : getElevationRaw(b[0], b[1]) <= getElevationRaw(a[0], a[1])
        drop = null
      }
      const g = buildStairGeometry(s.points, { width: s.pavedWidth || 1.5, descendToB, drop })
      if (!g) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3))
      geo.setIndex(g.indices)
      geo.computeVertexNormals()
      out.push({ geo, centroidRaw: getElevationRaw(g.centroid[0], g.centroid[1]) })
    }
    return out
  }, [])
  if (hidden || !stairs.length) return null
  return (
    <>
      {stairs.map((s, i) => (
        <StairLift key={i} centroidRaw={s.centroidRaw}>
          <mesh geometry={s.geo} material={mat} castShadow receiveShadow frustumCulled={false} />
        </StairLift>
      ))}
    </>
  )
}

function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

// ── Park Water Features (Lake + Grotto Pond) ─────────────────────────
function ParkWater({ lookId, bakeLastMs }) {
  const resolvedLookId = resolveLookId(lookId)
  const scene = useSceneJson(resolvedLookId, bakeLastMs)
  const waterHidden = scene?.layerVis?.water === false
  const waterShaderRef = useRef()

  // Build water + island + bank geometries from polygon data
  const { lakeWaterGeo, grottoWaterGeo, islandGeo, lakeBankGeo, grottoBankGeo,
          lakeY, grottoY, islandY } = useMemo(() => {
    // Helper: polygon array → THREE.Shape (x,z coords mapped to x,y in shape space)
    // Ensures CCW winding (required by THREE.Shape for outer rings)
    const polyToShape = (pts) => {
      // Compute signed area to detect winding
      let area = 0
      const n = pts.length - 1 // skip closing duplicate
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
      }
      // If CW (negative area), reverse to make CCW
      const ordered = area < 0 ? [...pts].reverse() : pts
      const shape = new THREE.Shape()
      shape.moveTo(ordered[0][0], ordered[0][1])
      for (let i = 1; i < ordered.length; i++) shape.lineTo(ordered[i][0], ordered[i][1])
      shape.closePath()
      return shape
    }

    // Helper: polygon array → THREE.Path for holes (CW winding)
    const polyToHole = (pts) => {
      let area = 0
      const n = pts.length - 1
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
      }
      // If CCW (positive area), reverse to make CW for hole
      const ordered = area > 0 ? [...pts].reverse() : pts
      const path = new THREE.Path()
      path.moveTo(ordered[0][0], ordered[0][1])
      for (let i = 1; i < ordered.length; i++) path.lineTo(ordered[i][0], ordered[i][1])
      path.closePath()
      return path
    }

    // Helper: expand polygon outward using vertex normals (handles concave shapes)
    const expandPoly = (pts, offset) => {
      // Strip closing duplicate if present
      const n = (pts.length > 1 && pts[pts.length - 1][0] === pts[0][0] && pts[pts.length - 1][1] === pts[0][1])
        ? pts.length - 1 : pts.length
      const result = []
      for (let i = 0; i < n; i++) {
        const prev = pts[(i - 1 + n) % n]
        const curr = pts[i]
        const next = pts[(i + 1) % n]
        // Edge normals (outward assuming CCW winding)
        const e1x = curr[0] - prev[0], e1z = curr[1] - prev[1]
        const e2x = next[0] - curr[0], e2z = next[1] - curr[1]
        let n1x = -e1z, n1z = e1x
        let n2x = -e2z, n2z = e2x
        const l1 = Math.sqrt(n1x * n1x + n1z * n1z)
        const l2 = Math.sqrt(n2x * n2x + n2z * n2z)
        if (l1 > 0.001) { n1x /= l1; n1z /= l1 }
        if (l2 > 0.001) { n2x /= l2; n2z /= l2 }
        // Average normal at vertex
        let nx = n1x + n2x, nz = n1z + n2z
        const nl = Math.sqrt(nx * nx + nz * nz)
        if (nl > 0.001) { nx /= nl; nz /= nl }
        else { nx = n1x; nz = n1z }
        result.push([curr[0] + nx * offset, curr[1] + nz * offset])
      }
      // Re-close
      result.push([result[0][0], result[0][1]])
      return result
    }

    // ShapeGeometry lives in XY plane. rotateX(-PI/2) maps (x, y, 0) → (x, 0, -y).
    // Water polygon coords are [x, z] with z+ = south. To get correct mesh z,
    // negate z before shape creation: shape(x, -z) → mesh(x, 0, -(-z)) = (x, 0, z). ✓
    const negZ = (pts) => pts.map(([x, z]) => [x, -z])

    // Lake outer shape with island hole
    const lakeShape = polyToShape(negZ(parkWaterData.lake.outer))
    lakeShape.holes.push(polyToHole(negZ(parkWaterData.lake.island)))

    const lakeWaterGeo = new THREE.ShapeGeometry(lakeShape)
    lakeWaterGeo.rotateX(-Math.PI / 2) // lay flat

    // Grotto pond
    const grottoShape = polyToShape(negZ(parkWaterData.grotto))
    const grottoWaterGeo = new THREE.ShapeGeometry(grottoShape)
    grottoWaterGeo.rotateX(-Math.PI / 2)

    // Island (grass patch)
    const islandShape = polyToShape(negZ(parkWaterData.lake.island))
    const islandGeo = new THREE.ShapeGeometry(islandShape)
    islandGeo.rotateX(-Math.PI / 2)

    // Shoreline banks — solid expanded shapes rendered below water level.
    // Water on top covers the interior; only the 1-2m outer edge peeks out.
    // Expand in original coords (correct normals), then negZ for rendering.
    const lakeBankGeo = new THREE.ShapeGeometry(polyToShape(negZ(expandPoly(parkWaterData.lake.outer, 1.5))))
    lakeBankGeo.rotateX(-Math.PI / 2)

    const grottoBankGeo = new THREE.ShapeGeometry(polyToShape(negZ(expandPoly(parkWaterData.grotto, 1.2))))
    grottoBankGeo.rotateX(-Math.PI / 2)

    // Ground reverted to flat (#19); water/island all at y=0.
    return { lakeWaterGeo, grottoWaterGeo, islandGeo, lakeBankGeo, grottoBankGeo,
             lakeY: 0, grottoY: 0, islandY: 0 }
  }, [])

  // Pond rigid-lift anchors: mean raw heightmap value across each pond's
  // outline. Computed once at mount — both shared materials (bank/water)
  // can stay shared because the per-pond lift happens at the GROUP level.
  const lakeCentroidRaw = useMemo(() => {
    const pts = parkWaterData.lake.outer
    let s = 0
    for (const [x, z] of pts) s += getElevationRaw(x, z)
    return s / pts.length
  }, [])
  const grottoCentroidRaw = useMemo(() => {
    const pts = parkWaterData.grotto
    let s = 0
    for (const [x, z] of pts) s += getElevationRaw(x, z)
    return s / pts.length
  }, [])

  // Animated water material with ripple shader
  const waterMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#1a4a5a',
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      roughness: 0.15,
      metalness: 0.35,
      side: THREE.DoubleSide,
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 }
      shader.uniforms.uSunAltitude = { value: 0.5 }
      waterShaderRef.current = shader

      // Vertex: pass world position to fragment
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWaterWorld;`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vWaterWorld = (modelMatrix * vec4(position, 1.0)).xyz;`
      )

      // Fragment: animated ripples + refraction distortion + depth darkening
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uSunAltitude;
         varying vec3 vWaterWorld;

         // Hash + noise for water
         float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
         float wNoise(vec2 p) {
           vec2 i = floor(p), f = fract(p);
           f = f * f * (3.0 - 2.0 * f);
           return mix(
             mix(wHash(i), wHash(i + vec2(1,0)), f.x),
             mix(wHash(i + vec2(0,1)), wHash(i + vec2(1,1)), f.x), f.y);
         }
         float wFBM(vec2 p) {
           float v = 0.0, a = 0.5;
           for (int i = 0; i < 5; i++) { v += a * wNoise(p); p *= 2.03; a *= 0.49; }
           return v;
         }`
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec2 wp = vWaterWorld.xz;

         // ── Animated ripple layers ──
         // Slow large ripples (wind-driven waves)
         float r1 = wFBM(wp * 0.12 + uTime * vec2(0.08, 0.05));
         // Medium ripples (cross-wave interference)
         float r2 = wFBM(wp * 0.3 + uTime * vec2(-0.12, 0.09));
         // Fine surface texture (capillary ripples)
         float r3 = wNoise(wp * 1.2 + uTime * vec2(0.2, -0.15));
         // Slow circular ripple pattern (like a disturbance)
         float dist = length(wp - vec2(25.0, 60.0));
         float circular = sin(dist * 0.4 - uTime * 1.5) * 0.5 + 0.5;
         circular *= smoothstep(50.0, 10.0, dist);

         // Combine ripple layers
         float ripple = r1 * 0.4 + r2 * 0.35 + r3 * 0.15 + circular * 0.1;

         // ── Water color with fake refraction ──
         // Distort UV by ripple for refraction effect
         vec2 refractOffset = vec2(
           wNoise(wp * 0.25 + uTime * 0.06) - 0.5,
           wNoise(wp * 0.25 + uTime * 0.06 + 100.0) - 0.5
         ) * 0.08;
         float refractedNoise = wFBM((wp + refractOffset) * 0.15);

         // Base water colors — deep and shallow tones
         vec3 wDeep    = vec3(0.06, 0.18, 0.25);  // dark teal depths
         vec3 wMid     = vec3(0.10, 0.28, 0.32);  // mid-water
         vec3 wShallow = vec3(0.14, 0.38, 0.38);  // lighter edges
         vec3 wHighlight = vec3(0.35, 0.55, 0.58); // ripple peaks / sun glints

         // Mix based on ripple + refraction
         vec3 waterCol = mix(wDeep, wMid, smoothstep(0.3, 0.55, ripple));
         waterCol = mix(waterCol, wShallow, smoothstep(0.5, 0.7, refractedNoise));

         // Specular-like highlights on ripple crests
         float highlight = smoothstep(0.62, 0.78, ripple) * smoothstep(0.5, 0.7, r1);
         waterCol = mix(waterCol, wHighlight, highlight * 0.6);

         // Subtle caustic pattern on the surface
         float caustic1 = wNoise(wp * 0.8 + uTime * vec2(0.15, 0.1));
         float caustic2 = wNoise(wp * 0.8 + uTime * vec2(-0.1, 0.15) + 50.0);
         float caustic = smoothstep(0.4, 0.6, caustic1) * smoothstep(0.4, 0.6, caustic2);
         waterCol += vec3(0.04, 0.07, 0.06) * caustic;

         // ── Time-of-day ──
         float dayBright = smoothstep(-0.12, 0.3, uSunAltitude);
         float brightness = mix(0.45, 1.0, dayBright);
         // Night: darker, more blue/indigo
         vec3 nightWater = vec3(0.05, 0.08, 0.16);
         waterCol = mix(nightWater, waterCol, dayBright) * brightness;

         // Moon/street light reflection at night
         float nightGlint = (1.0 - dayBright) * highlight * 0.4;
         waterCol += vec3(0.15, 0.18, 0.25) * nightGlint;

         // sRGB → linear
         diffuseColor.rgb = pow(waterCol, vec3(2.2));

         // Vary alpha slightly with ripple (thinner at highlights)
         diffuseColor.a = mix(0.72, 0.88, smoothstep(0.3, 0.6, ripple));`
      )
    }
    // Unique cache key so the ripple shader doesn't collapse onto a
    // sibling material's compiled program (see pathMat note above).
    // No patchTerrain: PondGroup lifts the whole lake rigidly by lake
    // centroid raw × uExag, preserving the Y separation with the bank
    // and island that per-vertex displacement was destroying.
    mat.customProgramCacheKey = () => 'park-water-ripple-v1'
    return mat
  }, [])

  // Animate water
  useFrame((_, delta) => {
    if (waterShaderRef.current) {
      waterShaderRef.current.uniforms.uTime.value += delta
      const { sunAltitude } = useTimeOfDay.getState().getLightingPhase()
      waterShaderRef.current.uniforms.uSunAltitude.value = sunAltitude
    }
  })

  // Simple island grass material. No patchTerrain — PondGroup wraps the
  // island mesh and lifts the whole group rigidly by the lake's centroid
  // raw. Per-vertex displacement here would produce a triangulated tilt
  // that mismatches the bank/water surfaces and z-fights at the rim.
  const islandMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: '#2a5528', roughness: 0.9 }), [])

  // Shoreline bank material — see islandMat note re: rigid lift.
  const bankMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: '#5a5040', roughness: 0.95 }), [])

  if (waterHidden) return null

  // park_water.json polygons are in compass frame; render directly with
  // no per-mesh rotation. Lake/grotto each rigid-lift by a per-pond
  // centroid sample so bank/water/island all rise together — preserving
  // the exact 0.15 m / 0.05 m Y separations between layers. Per-vertex
  // displacement on the bank/water/island materials (the previous
  // approach) gave each mesh its own interpolated surface, and where the
  // bank polygon interpolated higher than the water polygon (lake-in-a-
  // basin geometry), the brown bank fragments won the depth test and
  // covered the water. Rigid per-pond lift dodges that entirely.
  return (
    <group>
      <PondGroup centroidRaw={lakeCentroidRaw}>
        <mesh geometry={lakeBankGeo}  position={[0, lakeY   + 0.2,  0]} receiveShadow material={bankMat} />
        <mesh geometry={lakeWaterGeo} position={[0, lakeY   + 0.35, 0]} receiveShadow material={waterMat} />
        <mesh geometry={islandGeo}    position={[0, islandY + 0.4,  0]} receiveShadow material={islandMat} />
      </PondGroup>
      <PondGroup centroidRaw={grottoCentroidRaw}>
        <mesh geometry={grottoBankGeo}  position={[0, grottoY + 0.2,  0]} receiveShadow material={bankMat} />
        <mesh geometry={grottoWaterGeo} position={[0, grottoY + 0.35, 0]} receiveShadow material={waterMat} />
      </PondGroup>
    </group>
  )
}

// Rigid per-frame lift for all meshes inside the group. centroidRaw is
// the raw heightmap value (meters above local-min) averaged over the
// pond's polygon vertices; terrainExag.value × centroidRaw gives the
// world-Y the whole pond rides at, scaled with the global exag dial.
function PondGroup({ centroidRaw, children }) {
  const ref = useRef()
  useFrame(() => {
    if (ref.current) ref.current.position.y = centroidRaw * terrainExag.value
  })
  return <group ref={ref}>{children}</group>
}

// Rides the stair flight onto the (exaggerated) terrain like the pond — lift
// only, NO group scale (a scale.y = terrainExag collapses the flight to zero
// height in flat/top-down camera modes where exag→0). The flight's own rise is
// pre-exaggerated in the geometry (buildStairGeometry drop × V_EXAG), so it
// reads at scale without tracking the live exag. Bottom tread (y=0) lands on
// the ground here.
function StairLift({ centroidRaw, children }) {
  const ref = useRef()
  useFrame(() => {
    if (ref.current) ref.current.position.y = centroidRaw * terrainExag.value
  })
  return <group ref={ref}>{children}</group>
}


// ── Perimeter Fence ────────────────────────────────────────────────────
function PerimeterFence() {
  const { posts, rails } = useMemo(() => {
    const corners = PARK_FENCE_CORNERS
    const posts = [], rails = []
    for (let side = 0; side < 4; side++) {
      const [x1, z1] = corners[side]
      const [x2, z2] = corners[(side + 1) % 4]
      const dx = x2 - x1, dz = z2 - z1
      const len = Math.sqrt(dx * dx + dz * dz)
      const count = Math.floor(len / FENCE_POST_SPACING)
      for (let i = 0; i <= count; i++) {
        const t = i / count
        posts.push([x1 + dx * t, 0, z1 + dz * t])
      }
      rails.push({ from: [x1, z1], to: [x2, z2] })
    }
    return { posts, rails }
  }, [])

  // Shared materials across all posts / rails (reused for HMR stability).
  // patchTerrain rigid: each post/rail is its own <mesh> with its own world
  // position, so the rigid mode samples that position's terrain height —
  // every post grounds at the local heightfield independently. The earlier
  // rigid-group lift hid this but produced meters of edge mismatch once raw
  // values stopped being near-zero.
  const postMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.7, metalness: 0.3 })
    patchTerrain(mat)
    return mat
  }, [])
  const railMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6, metalness: 0.4 })
    patchTerrain(mat)
    return mat
  }, [])

  return (
    <group>
      {posts.map((pos, i) => (
        <mesh key={`p${i}`} position={[pos[0], FENCE_HEIGHT / 2, pos[2]]} castShadow material={postMat}>
          <boxGeometry args={[0.15, FENCE_HEIGHT, 0.15]} />
        </mesh>
      ))}
      {rails.map((rail, i) => {
        const mx = (rail.from[0] + rail.to[0]) / 2
        const mz = (rail.from[1] + rail.to[1]) / 2
        const dx = rail.to[0] - rail.from[0], dz = rail.to[1] - rail.from[1]
        const len = Math.sqrt(dx * dx + dz * dz)
        const angle = Math.atan2(dx, dz)
        return (
          <group key={`r${i}`}>
            <mesh position={[mx, FENCE_HEIGHT * 0.9, mz]} rotation={[0, angle, 0]} material={railMat}>
              <boxGeometry args={[0.08, 0.08, len]} />
            </mesh>
            <mesh position={[mx, FENCE_HEIGHT * 0.3, mz]} rotation={[0, angle, 0]} material={railMat}>
              <boxGeometry args={[0.08, 0.08, len]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// ── Main Park Component ────────────────────────────────────────────────
// Per-item terrain displacement: each park sub-mesh patches with its own
// terrain sample (paths/water/banks/island per-vertex; fence posts/rails
// rigid at each mesh's own world position). The earlier shared rigid-group
// lift assumed near-zero raw heightmap values; with b24fce5's local-min
// normalization the park-corner ground sits ~10 m below the park-center
// raw, producing the "fence hovering overhead" symptom. Each item now
// rides the heightfield directly so the joint between park feature and
// ground is local rather than averaged.
//
// Park title/subtitle are printed ON THE GRASS: the group sits at the LOCAL
// ground height under the label's anchor (the park is ~flat here, so one sample
// is the grass under the whole word) and the text lies just above it, drawn
// depth-off so the grass can't clip it. NO lift into the air — the old
// max-over-footprint lift + a 4 m local offset floated the word up off the
// grass, where the camera angle sheared its far side ("AFAYETTE PARK"). Sitting
// it on the grass, flat, reads as painted on and can't be clipped.
function ElevatedGroup({ at, children }) {
  const ref = useRef()
  const baseY = useMemo(() => getElevationRaw(at[0], at[1]), [at])
  useFrame(() => {
    if (ref.current) ref.current.position.y = baseY * terrainExag.value
  })
  return <group ref={ref}>{children}</group>
}

// Park title — the "LAFAYETTE PARK" landmark label + subtitle. Rendered by
// LafayetteScene alongside the street labels (gated by the `labels` layer
// toggle) so the operator controls it from the Labels section instead of it
// being an always-on orphan. Kept here so its park-relative position
// constants + terrain-lift (ElevatedGroup) stay with the park geometry.
// NOTE: landmark labels are a DISTINCT class from street labels — they live
// in the world on the terrain (occludable, height/position matter) and want
// their OWN operator controls, not the shared `labels` toggle. See
// ls/BACKLOG.md "Landmark labels need their own controls".
// DEPTH: occlusion is the CALLER's choice (`occlude` on ParkTitleMesh), because
// the two consumers want opposite things. 2026-06-30 the label was pulled OUT of
// the depth stack entirely (depthTest off) because terrain rising under the left
// of the word clipped the leading "L" ("AFAYETTE PARK") and any rigid lift that
// cleared it floated the whole word off the grass. That was always flagged as an
// eye-gate (ls/BACKLOG.md): always-on-top means the word draws OVER foreground
// trees. Once the title was moved into the clearing (2026-07-23) the terrain-clip
// cause was gone, so the 3D scene now depth-tests again and trees occlude it
// properly — trees are opaque (alphaTest, depthWrite on), so renderOrder=16 in
// the transparent queue orders correctly against them. The 2D Designer map keeps
// depthTest OFF: there the displaced ground would clip the quad and there are no
// trees to occlude it.
// The title + subtitle drawn onto one texture (canvas 2D), so it can ride a
// plain quad printed on the grass. Title white, subtitle grey, dark outline —
// matching the old troika look. Built once.
export function useParkTitleTexture() {
  // Same panel `labels` style the street labels use (SceneLabel reads the same),
  // so the park title stays consistent with them AND the Labels-panel controls
  // (halo, fill, weight, spacing, font) govern it too — not just the street labels.
  const style = useCartographStore(s => s.labels) || {}
  const fill = style.fill ?? '#e8e8f0'
  const halo = style.halo ?? '#14141c'
  const haloWidth = style.haloWidth ?? 0.07
  const weight = style.weight ?? 600
  const tracking = style.letterSpacing ?? 0.05
  const fam = (style.fontFamily || '').trim()
  const caseMode = style.case ?? 'mixed'
  return useMemo(() => {
    if (typeof document === 'undefined') return null
    const applyCase = t => caseMode === 'upper' ? t.toUpperCase()
                         : caseMode === 'lower' ? t.toLowerCase() : t
    const title = applyCase(INSTANCE.profile.landmarkName)
    const sub = applyCase(`EST. ${INSTANCE.profile.founded} · ${INSTANCE.geography.cityState}`)
    const W = 2048, H = 512
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, W, H)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'; ctx.miterLimit = 2
    const family = `${fam ? `"${fam}", ` : ''}system-ui, "Segoe UI", Arial, sans-serif`
    const draw = (text, px, cy, alpha) => {
      ctx.font = `${weight} ${px}px ${family}`
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(tracking * px)}px`
      ctx.globalAlpha = 1
      ctx.lineWidth = 2 * px * haloWidth           // haloWidth = fraction of glyph height, per side
      ctx.strokeStyle = halo; ctx.strokeText(text, W / 2, cy)
      ctx.globalAlpha = alpha
      ctx.fillStyle = fill; ctx.fillText(text, W / 2, cy)
    }
    draw(title, 200, 205, 1)      // title at full fill
    draw(sub, 86, 380, 0.65)      // subtitle dimmed for hierarchy
    ctx.globalAlpha = 1
    const tex = new THREE.CanvasTexture(canvas)
    tex.anisotropy = 8
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.needsUpdate = true
    return tex
  }, [fill, halo, haloWidth, weight, tracking, fam, caseMode])
}

// THE park-title mesh — the ONE source, reused by both the 2D Designer map
// (MapLayers) and the 3D scene (ParkTitle below) so it's in both by
// construction, never two drifting copies. A flat textured quad with a PLAIN
// material whose depth behaviour the caller picks (`occlude`) — see the DEPTH
// note above. This replaces the troika <Text>, whose
// depthTest flag didn't hold (its internal render material ignored it), which is
// why the word kept shearing ("AFAYETTE PARK"). `y` = height above whatever
// ground the caller sits it on. LS-only geometry (LABEL_TITLE_POS).
export function ParkTitleMesh({ y = 0.25, occlude = false }) {
  const tex = useParkTitleTexture()
  // Size knob (proportional scale, Auto/absent = 1×) scales the whole quad — the
  // same sizeK the street labels use, so the one control drives both.
  const sizeK = useCartographStore(s => s.labels?.sizeK) ?? 1
  const posOverride = useCartographStore(s => s.parkTitlePos)
  const mat = useMemo(() => tex && new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthTest: !!occlude, depthWrite: false, toneMapped: false,
  }), [tex, occlude])
  if (!mat) return null
  // Quad centered at the operator's moved position, or the default. 4:1 texture.
  const cx = posOverride ? posOverride[0] : PARK_TITLE_DEFAULT_CENTER[0]
  const cz = posOverride ? posOverride[1] : PARK_TITLE_DEFAULT_CENTER[1]
  return (
    <mesh
      position={[cx, y, cz]}
      rotation={[-Math.PI / 2, LABEL_TEXT_ROT_Y, 0]}
      scale={[sizeK, sizeK, 1]}
      material={mat}
      renderOrder={16}
    >
      <planeGeometry args={[76, 19]} />
    </mesh>
  )
}

// 3D scene: the same mesh printed on the grass at its LOCAL ground height. The
// ElevatedGroup samples terrain at the (possibly moved) center so the lift
// tracks the title.
export function ParkTitle() {
  const posOverride = useCartographStore(s => s.parkTitlePos)
  if (INSTANCE.lookId !== 'lafayette-square') return null   // HPDM-safety
  const cx = posOverride ? posOverride[0] : PARK_TITLE_DEFAULT_CENTER[0]
  const cz = posOverride ? posOverride[1] : PARK_TITLE_DEFAULT_CENTER[1]
  return (
    <ElevatedGroup at={[cx, cz]}>
      <ParkTitleMesh y={0.25} occlude />
    </ElevatedGroup>
  )
}

function LafayettePark({ lookId, bakeLastMs } = {}) {
  // HPDM-safety: LS-specific landmark render (see deferred-to-producer note at the
  // imports). Guarded to LS — byte-identical today (INSTANCE.lookId is always
  // 'lafayette-square' until instance-boot lands); a non-LS look renders no park.
  if (INSTANCE.lookId !== 'lafayette-square') return null
  return (
    <group>
      {/* ParkGround retired — StreetRibbons' park face now owns the grass surface (Phase 11.3, 2026-04-17). */}
      <ParkWater lookId={lookId} bakeLastMs={bakeLastMs} />
      <ParkBridge lookId={lookId} bakeLastMs={bakeLastMs} />
      {/* STAIRS PARKED: 3D stairs build + place correctly but render invisible
          (likely back-face culling — try side: DoubleSide on resume). Park steps
          render flat (parkPaths.js). Re-mount <ParkStairs/> when reviving. */}
      <PerimeterFence />
      {/* Park title (ParkTitle) moved to LafayetteScene so it's gated by the
          `labels` layer toggle with the rest of the text labels. */}
    </group>
  )
}

export default LafayettePark
