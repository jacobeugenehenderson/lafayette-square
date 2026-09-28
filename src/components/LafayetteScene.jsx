import { useRef, useState, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildings as _allBuildings } from '../data/buildings'
import { useStreetLabels } from '../lib/streetLabels.js'
import { useLabelPlacements } from '../lib/useLabelPlacements.js'
import StreetLabels from './StreetLabels.jsx'
import { ParkTitle } from './LafayettePark'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { mergeBufferGeometries } from '../lib/mergeGeometries'

import usePlaceState from '../hooks/usePlaceState'
import { CATEGORY_HEX } from '../tokens/categories'
import { patchTerrain, patchTerrainAtCentroidRaw } from '../utils/terrainShader'
import { applyWeatherToShader } from '../lib/weather-uniforms.js'
import { terrainExag, terrainFloorRaw, RISER_LIFT_GLSL } from '../utils/terrainShader'
import { getElevation, getElevationRaw } from '../utils/elevation'
import { FOUNDATION_BELOW_GRADE_M, periodPedestalFor } from '../lib/foundationGeometry.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import SceneNeon, { useNeonLookup } from './SceneNeon.jsx'

// Deterministic string hash — same id always picks the same palette slot.
function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

// Effective per-building tint: per-building override > Look palette > legacy
// building.color (kept as a final fallback so the data file still works
// when no Look is loaded — e.g. tests, headless renders).
function effectiveBuildingColor(building, palette, override) {
  if (override) return override
  if (palette && palette.length > 0) {
    return palette[hashStr(building.id) % palette.length]
  }
  return building.color
}

// ============ BUILDING TEXTURES ============
// Tileable PBR textures for walls and roofs (CC0, Poly Haven)
// Desktop-only: on mobile the telephoto/browse views can't resolve individual
// brick patterns, but the 7 × 1024² textures cost ~28 MB VRAM.
// Lazy-loaded in useEffect — buildings render with vertex colors first,
// textures enhance when ready.
import { useQuality } from '../lib/qualityProfile.js'
const _BASE = import.meta.env.BASE_URL
const _buildingTextures = {}
let _texturesLoaded = false

function loadBuildingTextures(textured) {
  if (_texturesLoaded || !textured) return
  _texturesLoaded = true
  const loader = new THREE.TextureLoader()
  ;['brick_red', 'brick_weathered', 'stone', 'slate', 'metal', 'wood_siding', 'stucco'].forEach(name => {
    const tex = loader.load(
      `${_BASE}textures/buildings/${name}.jpg`,
      undefined,
      undefined,
      (err) => console.warn(`[Buildings] Failed to load texture ${name}:`, err)
    )
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    _buildingTextures[name] = tex
  })
}

// ── Drag guard: suppress clicks after pointer moves >6px (prevents accidental selection during pan) ──
let _pdx = 0, _pdy = 0
const _onPointerDown = (e) => { _pdx = e.clientX; _pdy = e.clientY }
function isDrag(e) {
  const ce = e.nativeEvent || e
  const dx = ce.clientX - _pdx, dy = ce.clientY - _pdy
  return dx * dx + dy * dy > 36
}
import { lookOf } from '../lib/lookOf.js'

// Per-building overrides (roof shape, foundation height, colour) are applied by the BAKE
// (cartograph/bake-buildings.js) and reach the player through the slab. This live path used to
// re-apply them from one town's src/data/buildingOverrides.json, which bundled that file into
// every town (docs/briefs/BRIEF-slab-loading.md ③). It no longer reads them.

// ============ FOUNDATION & ROOF HELPERS ============

// Average terrain elevation at building footprint corners
function getGroundElevation(building) {
  if (!building.footprint || building.footprint.length === 0) {
    return getElevation(building.position[0], building.position[2])
  }
  let sum = 0
  for (const [x, z] of building.footprint) {
    sum += getElevation(x, z)
  }
  return sum / building.footprint.length
}

// Thin alias preserving local call sites; canonical definition lives in
// src/lib/foundationGeometry.js (shared with cartograph/bake-buildings.js).
export function getFoundationHeight(building) {
  return periodPedestalFor(building, null)
}

// Building Y = foundation height only. Terrain displacement handled by
// patchTerrainAtCentroidRaw on GPU, lifting rigidly by the mean of
// footprint-corner elevations (the bake-buildings.js canonical centroidY).
// Doctrine: cartograph/FEATURES.md § "Anchor rule (foundations + walls)".
function getBuildingY(building) {
  return getFoundationHeight(building)
}

function classifyRoof(building) {
  const year = building.year_built
  const stories = building.stories || 1
  if (!year) return 'flat'
  if (stories >= 4) return 'flat'
  // 1-story with large footprint = commercial → flat
  if (stories === 1 && building.size[0] * building.size[2] > 500) return 'flat'
  if (year < 1900 && stories >= 2 && stories <= 3) return 'mansard'
  if (year < 1920 && stories >= 1 && stories <= 3) return 'hip'
  return 'flat'
}

function getLocalPts(building) {
  const fp = building.footprint
  if (!fp || fp.length < 3) return null
  return fp.map(([x, z]) => [x - building.position[0], z - building.position[2]])
}

function isConvex(pts) {
  const n = pts.length
  if (n < 3) return false
  let sign = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const c = pts[(i + 2) % n]
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) < 1e-10) continue
    if (sign === 0) sign = cross > 0 ? 1 : -1
    else if ((cross > 0 ? 1 : -1) !== sign) return false
  }
  return true
}

function signedArea2D(pts) {
  let area = 0
  for (let i = 0, n = pts.length; i < n; i++) {
    const j = (i + 1) % n
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
  }
  return area / 2
}

// Ensure CCW winding from above (negative signed area in XZ).
// This gives outward+upward face normals for roof slopes.
function ensureCCW(pts) {
  if (signedArea2D(pts) > 0) return [...pts].reverse()
  return pts
}

function centroid2D(pts) {
  let cx = 0, cz = 0
  for (const [x, z] of pts) { cx += x; cz += z }
  return [cx / pts.length, cz / pts.length]
}

function footprintRatio(pts) {
  // Ratio of min to max extent — 1.0 = square, <0.5 = elongated
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const [x, z] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  const dx = maxX - minX || 1, dz = maxZ - minZ || 1
  return Math.min(dx, dz) / Math.max(dx, dz)
}

function buildMansardRoof(localPts, wallHeight, stories) {
  localPts = ensureCCW(localPts)
  const mansardHeight = stories >= 3 ? 2.5 : 2.0
  const topY = wallHeight + mansardHeight
  const [cx, cz] = centroid2D(localPts)
  const inset = 0.30
  const n = localPts.length

  const innerPts = localPts.map(([x, z]) => [
    x + (cx - x) * inset,
    z + (cz - z) * inset,
  ])

  const vertices = []
  const indices = []

  // Side faces: quads from outer ring (wallHeight) to inner ring (topY)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const base = vertices.length / 3
    vertices.push(
      localPts[i][0], wallHeight, localPts[i][1],
      localPts[j][0], wallHeight, localPts[j][1],
      innerPts[j][0], topY, innerPts[j][1],
      innerPts[i][0], topY, innerPts[i][1],
    )
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  // Top face: triangle fan from centroid (avoids ShapeGeometry winding issues)
  const capBase = vertices.length / 3
  vertices.push(cx, topY, cz)
  for (let i = 0; i < n; i++) {
    vertices.push(innerPts[i][0], topY, innerPts[i][1])
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    indices.push(capBase, capBase + 1 + i, capBase + 1 + j)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()

  return { geos: [geo], peakHeight: mansardHeight }
}

function buildHipRoof(localPts, wallHeight, stories) {
  localPts = ensureCCW(localPts)
  const peakH = stories === 1 ? 1.8 : 1.5
  const peakY = wallHeight + peakH
  const [cx, cz] = centroid2D(localPts)
  const n = localPts.length

  const ratio = footprintRatio(localPts)

  const vertices = []
  const indices = []

  if (ratio > 0.8 || n > 8) {
    // Pyramid to single peak
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const base = vertices.length / 3
      vertices.push(
        localPts[i][0], wallHeight, localPts[i][1],
        localPts[j][0], wallHeight, localPts[j][1],
        cx, peakY, cz,
      )
      indices.push(base, base + 1, base + 2)
    }
  } else {
    // Ridge line along long axis
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const [x, z] of localPts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
    }
    const dx = maxX - minX, dz = maxZ - minZ
    const ridgeInset = 0.3
    let r0, r1
    if (dx >= dz) {
      // Ridge along X axis
      r0 = [minX + dx * ridgeInset, cz]
      r1 = [maxX - dx * ridgeInset, cz]
    } else {
      // Ridge along Z axis
      r0 = [cx, minZ + dz * ridgeInset]
      r1 = [cx, maxZ - dz * ridgeInset]
    }

    // Triangulate: each edge of footprint connects to nearest ridge endpoint
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const midX = (localPts[i][0] + localPts[j][0]) / 2
      const midZ = (localPts[i][1] + localPts[j][1]) / 2

      const d0 = (midX - r0[0]) ** 2 + (midZ - r0[1]) ** 2
      const d1 = (midX - r1[0]) ** 2 + (midZ - r1[1]) ** 2

      if (d0 < d1) {
        // Connect to r0
        const base = vertices.length / 3
        vertices.push(
          localPts[i][0], wallHeight, localPts[i][1],
          localPts[j][0], wallHeight, localPts[j][1],
          r0[0], peakY, r0[1],
        )
        indices.push(base, base + 1, base + 2)
      } else {
        // Connect to r1
        const base = vertices.length / 3
        vertices.push(
          localPts[i][0], wallHeight, localPts[i][1],
          localPts[j][0], wallHeight, localPts[j][1],
          r1[0], peakY, r1[1],
        )
        indices.push(base, base + 1, base + 2)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return { geos: [geo], peakHeight: peakH }
}

// roofTopRingFor — the rooftop-perimeter ring the neon tube should trace,
// derived from the SAME classify + shape logic LafayetteScene renders and that
// bake-buildings.js bakes into the slab's `roofOutline`. Returns world [x,z]:
//   • mansard (convex)  → inset top-cap ring. MUST match buildMansardRoof's
//                         innerPts above AND bake-buildings buildMansardRoofWorld
//                         (inset 0.30) — change all three together.
//   • flat / hip / non-convex-mansard → the footprint. A hip's true top edge is
//                         a degenerate ridge/apex (no perimeter), so neon sits
//                         on the eave == footprint, matching the slab consumer's
//                         <3-point roofOutline fallback (NeonBands.buildTube).
// Used by SceneNeon's live path so Stage neon traces the roof edge identically
// to the baked slab path (Preview slab A/B toggle shows no pop). Hoisted export
// → safe across the LafayetteScene⟷SceneNeon circular import, like getRoofPeakHeight.
export function roofTopRingFor(building) {
  const fp = building.footprint
  if (!fp || fp.length < 3) return fp || null
  let shape = classifyRoof(building)
  if (shape === 'mansard' && !isConvex(fp)) shape = 'flat'
  if (shape !== 'mansard') return fp
  const pts = ensureCCW(fp)
  const [cx, cz] = centroid2D(pts)
  const inset = 0.30
  return pts.map(([x, z]) => [x + (cx - x) * inset, z + (cz - z) * inset])
}

export function getRoofPeakHeight(building) {
  const roofType = classifyRoof(building)
  if (roofType === 'flat') return 0
  if (roofType === 'mansard') {
    const localPts = getLocalPts(building)
    if (!localPts || !isConvex(localPts)) return 0
    return building.stories >= 3 ? 2.5 : 2.0
  }
  if (roofType === 'hip') {
    const localPts = getLocalPts(building)
    if (!localPts || localPts.length > 8) return 0
    return building.stories === 1 ? 1.8 : 1.5
  }
  return 0
}

// ============ FOUNDATIONS (single merged mesh) ============

function Foundations({ buildings: buildingsProp, materialPhysics, materialColors } = {}) {
  const source = buildingsProp || _allBuildings
  const geometry = useMemo(() => {
    const geos = []

    // Per-building raw heightmap value (meters above local-min). Each
    // vertex of a building carries the same value so the runtime shader
    // can lift the block rigidly by `aCentroidY * uExag`, in lockstep
    // with the per-vertex ground (`raw * uExag`). Baking V_EXAG into the
    // geometry — the old getElevation()-then-translate pattern — left the
    // block stuck at V_EXAG-multiplied elevation when the runtime exag
    // dipped (e.g. Browse → 0), which is what produced the "100 ft tall
    // foundations" symptom.
    const centroidYsAll = []
    function stampCentroidY(geo, value) {
      const n = geo.attributes.position.count
      const arr = new Float32Array(n)
      for (let i = 0; i < n; i++) arr[i] = value
      geo.setAttribute('aCentroidY', new THREE.BufferAttribute(arr, 1))
    }

    source.forEach(building => {
      const fh = getFoundationHeight(building)
      const footprint = building.footprint
      // Anchor lift = mean of footprint-corner raw elevations (canonical, matches
      // cartograph/bake-buildings.js:571–575). Footprint-less buildings fall
      // back to the single-point sample at building.position.
      let groundYRaw
      if (footprint && footprint.length >= 3) {
        let sum = 0
        for (let i = 0; i < footprint.length; i++) {
          sum += getElevationRaw(footprint[i][0], footprint[i][1])
        }
        groundYRaw = sum / footprint.length
      } else {
        groundYRaw = getElevationRaw(building.position[0], building.position[2])
      }
      // Block goes from (-FOUNDATION_BELOW_GRADE_M) to (+fh) in local Y. At runtime the
      // top lifts by `aCentroidY * uExag` to (groundYRaw * uExag + fh); the below-grade
      // ring is placed on the town floor (RISER_LIFT_GLSL), so its baked depth only marks it.
      const top = fh
      const depth = top + FOUNDATION_BELOW_GRADE_M

      if (!footprint || footprint.length < 3) {
        const [w, , d] = building.size
        const geo = new THREE.BoxGeometry(w, depth, d)
        geo.translate(building.position[0], top - depth / 2, building.position[2])
        stampCentroidY(geo, groundYRaw)
        geos.push(geo)
      } else {
        try {
          const shape = new THREE.Shape()
          shape.moveTo(
            footprint[0][0] - building.position[0],
            -(footprint[0][1] - building.position[2])
          )
          for (let i = 1; i < footprint.length; i++) {
            shape.lineTo(
              footprint[i][0] - building.position[0],
              -(footprint[i][1] - building.position[2])
            )
          }
          shape.closePath()

          const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
          geo.rotateX(-Math.PI / 2)
          // Bottom at -FOUNDATION_BELOW_GRADE_M, top at +fh.
          geo.translate(building.position[0], top - depth, building.position[2])
          stampCentroidY(geo, groundYRaw)
          geos.push(geo)
        } catch (e) {
          const [w, , d] = building.size
          const geo = new THREE.BoxGeometry(w, depth, d)
          geo.translate(building.position[0], top - depth / 2, building.position[2])
          stampCentroidY(geo, groundYRaw)
          geos.push(geo)
        }
      }
    })

    if (geos.length === 0) return null
    const merged = mergeBufferGeometries(geos)
    geos.forEach(g => g.dispose())
    return merged
  }, [source])

  const meshRef = useRef()
  const prevDarkRef = useRef(-1)
  const getLightingPhase = useTimeOfDay((state) => state.getLightingPhase)
  const dayColor = useMemo(() => new THREE.Color('#B8A88A'), [])
  const nightColor = useMemo(() => new THREE.Color('#3d3530'), [])

  useFrame(() => {
    if (!meshRef.current) return
    const { sunAltitude } = getLightingPhase()
    const darkFactor = Math.min(1, Math.max(0, (0.2 - sunAltitude) / 0.35))
    const darkStep = Math.round(darkFactor * 20) / 20
    if (prevDarkRef.current !== darkStep) {
      prevDarkRef.current = darkStep
      meshRef.current.material.color.copy(dayColor).lerp(nightColor, darkFactor)
    }
  })

  const foundationMat = useMemo(() => {
    // shadowSide: both faces into the shadow map — see SlabBuildings (the lit strip).
    const mat = new THREE.MeshStandardMaterial({ color: '#B8A88A', roughness: 0.95, shadowSide: THREE.DoubleSide })
    // Per-vertex aCentroidY (raw heightmap, meters above local-min) lifts
    // each building's foundation block rigidly via the shared uExag uniform,
    // matching the per-vertex ground displacement that runs underneath.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uExag = terrainExag
      shader.uniforms.uRiserFloor = terrainFloorRaw
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         attribute float aCentroidY;
         uniform float uExag;
         uniform float uRiserFloor;`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>${RISER_LIFT_GLSL}`
      )
    }
    mat.customProgramCacheKey = () => 'foundation-terrain-v2-riser'
    return mat
  }, [])

  // ⛔ The shadow pass uses three's OWN MeshDepthMaterial, which carries none
  // of the lift above — so without this the foundation is recorded in the
  // shadow map UN-lifted, i.e. buried, and cannot shadow anything. Same defect
  // as SlabBuildings (huron, 2026-09-20); gated by
  // checks/claims-displaced-casters-have-a-depth-material.mjs.
  const foundationDepthMat = useMemo(() => {
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    dm.onBeforeCompile = (shader) => {
      shader.uniforms.uExag = terrainExag
      shader.uniforms.uRiserFloor = terrainFloorRaw
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
         attribute float aCentroidY;
         uniform float uExag;
         uniform float uRiserFloor;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>${RISER_LIFT_GLSL}`)
    }
    dm.customProgramCacheKey = () => 'foundation-terrain-depth-v2-riser'
    return dm
  }, [])

  // Static apply on scene load — foundation physics/color come from
  // scene.json via props (couplers plan §1). Replaces the prior per-frame
  // cartograph-store read; Stage operator now sees foundation updates on
  // re-bake rather than instant slider feedback.
  useEffect(() => {
    const phys = materialPhysics?.foundation
    const colorOv = materialColors?.foundation
    if (colorOv) foundationMat.color.set(colorOv)
    if (phys) {
      if (phys.roughness !== undefined) foundationMat.roughness = phys.roughness
      if (phys.metalness !== undefined) foundationMat.metalness = phys.metalness
      foundationMat.emissiveIntensity = phys.emissiveIntensity || 0
      if (phys.emissive) foundationMat.emissive.set(phys.emissive)
    }
    foundationMat.needsUpdate = true
  }, [foundationMat, materialPhysics, materialColors])

  if (!geometry) return null

  return (
    <mesh ref={meshRef} geometry={geometry} receiveShadow castShadow material={foundationMat} customDepthMaterial={foundationDepthMat} frustumCulled={false} />
  )
}

// ============ NEON BAND ============
// The open-by-hours filter, default zoning classification, neonLookup,
// and openPlaces computation now live in ./SceneNeon.jsx — the single
// neon consumer mounted by both LafayetteScene and Preview. See doctrine
// project_preview_equals_ls_literally.

// (NeonBand — the inline per-Building TubeGeometry+CatmullRom mount —
// was retired during the Path B migration. Production now mounts a
// single <NeonBands> in LafayetteScene's render: one merged mesh +
// shader covering every open place, with scene.json.neon driving
// the uCore/uTube/uBleed uniforms via useSceneJson. See
// src/components/NeonBands.jsx + HANDOFF-neon.md +
// plans/kit_couplers_parametrize.md §1.)

// ============ SIM COLOR ============
// Deterministic Victorian palette color for buildings without a real listing.
// Uses a simple hash of the building ID so the color is stable across randomize calls.
const _SIM_HEXES = Object.values(CATEGORY_HEX)
function simColor(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0
  return _SIM_HEXES[Math.abs(h) % _SIM_HEXES.length]
}

// ============ BUILDINGS ============
// Shared temp color to avoid per-frame allocations
const _tmpColor = new THREE.Color()

// ── Selection ring: neon outline around highlighted building ─────────────────
const _RING_COLOR = new THREE.Color('#ff6644')
const _RING_RADIUS = 0.045

function SelectionRing({ building }) {
  const ringRef = useRef()
  const phaseRef = useRef(0)
  const foundationY = getBuildingY(building)

  const ringGeometry = useMemo(() => {
    const height = building.size[1] + 0.15
    const footprint = building.footprint

    let points = []
    if (!footprint || footprint.length < 3) {
      const [w, , d] = building.size
      const hw = w / 2 + 0.15, hd = d / 2 + 0.15
      points = [
        new THREE.Vector3(-hw, height, -hd),
        new THREE.Vector3(hw, height, -hd),
        new THREE.Vector3(hw, height, hd),
        new THREE.Vector3(-hw, height, hd),
        new THREE.Vector3(-hw, height, -hd),
      ]
    } else {
      const cx = building.position[0], cz = building.position[2]
      points = footprint.map(([x, z]) => {
        const lx = x - cx, lz = z - cz
        const len = Math.sqrt(lx * lx + lz * lz) || 1
        return new THREE.Vector3(lx + (lx / len) * 0.15, height, lz + (lz / len) * 0.15)
      })
      points.push(points[0].clone())
    }

    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0)
    return new THREE.TubeGeometry(curve, points.length * 8, _RING_RADIUS, 6, false)
  }, [building])

  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: _RING_COLOR,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }), [])

  useFrame((_, delta) => {
    if (!ringRef.current) return
    const mat = ringRef.current.material
    const phase = phaseRef.current

    if (phase < 1) {
      phaseRef.current = Math.min(1, phase + delta * 2.5)
      const t = phaseRef.current
      const pulse = t < 0.5
        ? t * 2 * 1.4
        : 1.4 - (t - 0.5) * 2 * 0.4
      mat.opacity = Math.min(1, pulse * 0.85)
    } else {
      mat.opacity = 0.75 + Math.sin(Date.now() * 0.003) * 0.08
    }
  })

  return (
    <mesh
      ref={ringRef}
      position={[building.position[0], foundationY, building.position[2]]}
      geometry={ringGeometry}
      material={ringMaterial}
      renderOrder={999}
    />
  )
}

function Building({ building, neonInfo, palette, materialPhysics }) {
  const meshRef = useRef()
  const prevStateRef = useRef({ darkStep: -1, emissiveHex: 0 })
  const { selectedId, hoveredId, select, setHovered, clearHovered } = useSelectedBuilding()
  const getLightingPhase = useTimeOfDay((state) => state.getLightingPhase)
  const foundationY = getBuildingY(building)

  // Anchor lift for walls — mean of footprint-corner raw elevations, matching
  // Foundations and cartograph/bake-buildings.js:571–575. Walls lift rigidly
  // by `meanCornerRaw * uExag` via patchTerrainAtCentroidRaw, so Stage and
  // Preview agree on sloped terrain.
  const meanCornerRaw = useMemo(() => {
    const fp = building.footprint
    if (fp && fp.length >= 3) {
      let sum = 0
      for (let i = 0; i < fp.length; i++) sum += getElevationRaw(fp[i][0], fp[i][1])
      return sum / fp.length
    }
    return getElevationRaw(building.position[0], building.position[2])
  }, [building])

  // Per-building neon state — the actual mesh is one merged <NeonBands>
  // in LafayetteScene's render; this block resolves the per-id "showNeon"
  // hex/sim-open flags consumed elsewhere in this Building.
  const isSimOpen = usePlaceState((s) => s.openBuildings.has(building.id))
  const categoryHex = neonInfo?.hex
  const listingHours = neonInfo?.hours
  const neonForceOn = neonInfo?.forceOn || false
  const showNeon = !!categoryHex || isSimOpen
  const effectiveHex = categoryHex || simColor(building.id)

  const isSelected = selectedId === building.id
  const isHovered = hoveredId === building.id
  // Effective tint: the active Look's 12-slot palette (deterministic by id), else
  // the legacy `building.color` from buildings.json. Palette comes from
  // scene.json (frozen-at-bake) in production; Stage's mount in
  // CartographApp passes a live-subscribed paletteOverride through
  // LafayetteScene so the Surfaces panel still retints in real time.
  const wallTintHex = effectiveBuildingColor(building, palette, undefined)
  const baseColor = useMemo(() => new THREE.Color(wallTintHex), [wallTintHex])

  // Pre-compute night color: keep saturation, darken, cool-shift hue
  const nightColor = useMemo(() => {
    const c = baseColor.clone()
    const hsl = {}
    c.getHSL(hsl)
    const coolHue = hsl.h + 0.03
    c.setHSL(coolHue, hsl.s * 0.55, hsl.l * 0.32)
    return c
  }, [baseColor])

  const geometry = useMemo(() => {
    const footprint = building.footprint
    const wallHeight = building.size[1]
    let geo

    if (!footprint || footprint.length < 3) {
      geo = new THREE.BoxGeometry(building.size[0], wallHeight, building.size[2])
      geo.translate(0, wallHeight / 2, 0)
    } else {
      try {
        const shape = new THREE.Shape()
        shape.moveTo(footprint[0][0] - building.position[0], -(footprint[0][1] - building.position[2]))
        for (let i = 1; i < footprint.length; i++) {
          shape.lineTo(footprint[i][0] - building.position[0], -(footprint[i][1] - building.position[2]))
        }
        shape.closePath()

        geo = new THREE.ExtrudeGeometry(shape, { depth: wallHeight, bevelEnabled: false })
        geo.rotateX(-Math.PI / 2)
      } catch (e) {
        geo = new THREE.BoxGeometry(building.size[0], wallHeight, building.size[2])
        geo.translate(0, wallHeight / 2, 0)
      }
    }

    // Add roof geometry if applicable
    const roofType = classifyRoof(building)
    const localPts = getLocalPts(building)

    if (roofType === 'mansard' && localPts && isConvex(localPts)) {
      const { geos: roofGeos } = buildMansardRoof(localPts, wallHeight, building.stories)
      const allGeos = [geo, ...roofGeos]
      const merged = mergeBufferGeometries(allGeos)
      allGeos.forEach(g => g.dispose())
      return merged
    } else if (roofType === 'hip' && localPts && localPts.length <= 8) {
      const { geos: roofGeos } = buildHipRoof(localPts, wallHeight, building.stories)
      const allGeos = [geo, ...roofGeos]
      const merged = mergeBufferGeometries(allGeos)
      allGeos.forEach(g => g.dispose())
      return merged
    }

    return geo
  }, [building, baseColor])

  // Material with tileable texture injection (desktop only)
  const wallTex = _buildingTextures[building.wall_material] || _buildingTextures.brick_red
  const roofMat = building.roof_material
  const roofTex = (roofMat && roofMat !== 'flat') ? (_buildingTextures[roofMat] || null) : null
  const shaderRef = useRef(null)
  const hasTextures = !!wallTex  // false on mobile (no textures loaded)

  // Roof tint: derived from building color — desaturated + darkened to keep per-building personality
  const roofTintColor = useMemo(() => {
    const hsl = {}
    baseColor.getHSL(hsl)
    // Material-specific darkening: slate darkest, metal lighter, others mid
    const lum = roofMat === 'slate' ? 0.15 : roofMat === 'metal' ? 0.28 : 0.20
    const sat = hsl.s * 0.3  // keep a hint of the building's hue
    const c = new THREE.Color().setHSL(hsl.h, sat, lum)
    return new THREE.Vector3(c.r, c.g, c.b)
  }, [roofMat, baseColor])

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: baseColor,
      flatShading: true,
      roughness: 0.9,
      metalness: 0.05,
      shadowSide: THREE.DoubleSide,   // both faces into the shadow map — see SlabBuildings
    })

    const wallHeight = building.size[1]
    const roofStartY = foundationY + wallHeight - 0.3  // 30cm below top for clean transition
    const roofType = classifyRoof(building)
    const hasShapedRoof = roofType === 'mansard' || roofType === 'hip'

    if (!hasTextures) {
      // Mobile: lightweight roof-tinting shader — no texture sampling, just Y-threshold color.
      // Saves ~28 MB VRAM vs desktop textures while keeping roofs visually distinct.
      mat.onBeforeCompile = (shader) => {
        // Phase 7b/c (Tempest, 2026-05-20) — opt in roofs + walls to
        // wet/snow. Roof tops are top-facing → heavy snow accumulation.
        applyWeatherToShader(shader)
        shaderRef.current = shader
        shader.uniforms.uRoofStartY = { value: roofStartY }
        shader.uniforms.uRoofTint = { value: roofTintColor }
        shader.uniforms.uHasShapedRoof = { value: hasShapedRoof ? 1.0 : 0.0 }
        shader.uniforms.uDarkFactor = { value: 0.0 }

        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
           varying float vWorldY;`
        )
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vWorldY = (modelMatrix * vec4(position, 1.0)).y;`
        )

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           uniform float uRoofStartY;
           uniform vec3 uRoofTint;
           uniform float uHasShapedRoof;
           uniform float uDarkFactor;
           varying float vWorldY;`
        )
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           float bRoofMask = smoothstep(uRoofStartY, uRoofStartY + 0.1, vWorldY);
           float bRoofNight = 1.0 - uDarkFactor * 0.75;
           if (uHasShapedRoof > 0.5) {
             diffuseColor.rgb = mix(diffuseColor.rgb, uRoofTint * bRoofNight, bRoofMask);
           } else {
             vec3 bFlatRoof = vec3(0.04, 0.04, 0.045) * bRoofNight;
             diffuseColor.rgb = mix(diffuseColor.rgb, bFlatRoof, bRoofMask);
           }`
        )
      }
      mat.customProgramCacheKey = () => 'bldg-mobile-roof-wx1'
      return mat
    }

    mat.onBeforeCompile = (shader) => {
      // Phase 7b/c (Tempest, 2026-05-20): wet + snow on walls/roofs.
      applyWeatherToShader(shader)
      shaderRef.current = shader
      shader.uniforms.uWallTex = { value: wallTex }
      shader.uniforms.uRoofTex = { value: roofTex || wallTex }
      shader.uniforms.uHasRoofTex = { value: roofTex ? 1.0 : 0.0 }
      shader.uniforms.uRoofStartY = { value: roofStartY }
      shader.uniforms.uRoofTint = { value: roofTintColor }
      shader.uniforms.uTexStrength = { value: 0.4 }
      shader.uniforms.uDarkFactor = { value: 0.0 }
      // Texture-scale multipliers — 1.0 = default tiling, >1 = larger
      // tiles (less repeat), <1 = smaller. Driven by materialPhysics.
      shader.uniforms.uWallTexScale = { value: 1.0 }
      shader.uniforms.uRoofTexScale = { value: 1.0 }

      // Vertex: pass world position and normal to fragment
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vBldgWorldPos;
         varying vec3 vBldgWorldNorm;`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vBldgWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
         vBldgWorldNorm = normalize(mat3(modelMatrix) * normal);`
      )

      // Fragment: texture declarations
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D uWallTex;
         uniform sampler2D uRoofTex;
         uniform float uHasRoofTex;
         uniform float uRoofStartY;
         uniform vec3 uRoofTint;
         uniform float uTexStrength;
         uniform float uDarkFactor;
         uniform float uWallTexScale;
         uniform float uRoofTexScale;
         varying vec3 vBldgWorldPos;
         varying vec3 vBldgWorldNorm;
`
      )

      // Fragment: sample textures and blend
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>

         // Roof vs wall: Y position threshold
         float bRoofMask = smoothstep(uRoofStartY, uRoofStartY + 0.1, vBldgWorldPos.y);

         // Wall UV: triplanar — pick dominant axis
         vec2 bWallUV;
         if (abs(vBldgWorldNorm.x) > abs(vBldgWorldNorm.z)) {
           bWallUV = vec2(vBldgWorldPos.z, vBldgWorldPos.y) * 0.25;
         } else {
           bWallUV = vec2(vBldgWorldPos.x, vBldgWorldPos.y) * 0.25 / uWallTexScale;
         }

         // Roof UV: world XZ plane
         vec2 bRoofUV = vBldgWorldPos.xz * 0.2 / uRoofTexScale;

         // Sample textures
         vec3 bWallSample = texture2D(uWallTex, bWallUV).rgb;
         vec3 bRoofSample = texture2D(uRoofTex, bRoofUV).rgb;

         // Overlay blend: preserves base color luminance + saturation
         // overlay(a,b) = a<0.5 ? 2ab : 1-2(1-a)(1-b)
         vec3 bBase = diffuseColor.rgb;
         vec3 bOverlay = mix(
           2.0 * bBase * bWallSample,
           1.0 - 2.0 * (1.0 - bBase) * (1.0 - bWallSample),
           step(0.5, bBase)
         );
         // Blend between pure color and overlay-textured by strength
         vec3 bWallColor = mix(bBase, bOverlay, uTexStrength);

         // Night factor for roofs (synced with wall day/night cycle)
         float bRoofNight = 1.0 - uDarkFactor * 0.75;

         if (uHasRoofTex > 0.5) {
           // Shaped roof: tint derived from building color, texture adds surface detail
           vec3 bRoofOverlay = mix(
             2.0 * uRoofTint * bRoofSample,
             1.0 - 2.0 * (1.0 - uRoofTint) * (1.0 - bRoofSample),
             step(0.5, uRoofTint)
           );
           vec3 bRoofColor = mix(uRoofTint, bRoofOverlay, uTexStrength) * bRoofNight;
           diffuseColor.rgb = mix(bWallColor, bRoofColor, bRoofMask);
         } else {
           // Flat roof: dark neutral top, wall texture on sides
           vec3 bFlatRoof = vec3(0.04, 0.04, 0.045) * bRoofNight;
           diffuseColor.rgb = mix(bWallColor, bFlatRoof, bRoofMask);
         }

`
      )
    }

    mat.customProgramCacheKey = () => 'bldg-textured-wx1'
    patchTerrainAtCentroidRaw(mat, meanCornerRaw)
    return mat
  }, [baseColor, wallTex, roofTex, roofTintColor, hasTextures, foundationY, building, meanCornerRaw])

  // ⛔ THE SHADOW PASS MUST REPEAT THE LIFT. The `position` prop carries only the pedestal
  // (it rides modelMatrix, which the depth pass honours); the terrain lift is in the SHADER
  // above, which three's own depth material never runs — so without this, Stage's buildings
  // sat `meanCornerRaw × uExag` below where they are drawn in the shadow map.
  const depthMaterial = useMemo(() => {
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    patchTerrainAtCentroidRaw(dm, meanCornerRaw)
    return dm
  }, [meanCornerRaw])

  // Static apply on scene load — materialPhysics comes from scene.json via
  // prop (couplers plan §1). Replaces the prior per-frame cartograph-store
  // read; Stage operator now sees physics updates on re-bake rather than
  // instant slider feedback. Re-runs when the wall/roof material assignments
  // change (which they do per-Look, via scene.materialPhysics).
  useEffect(() => {
    const mat = meshRef.current?.material
    if (!mat) return
    const wallPhys = materialPhysics?.[building.wall_material]
    if (wallPhys) {
      if (wallPhys.roughness !== undefined) mat.roughness = wallPhys.roughness
      if (wallPhys.metalness !== undefined) mat.metalness = wallPhys.metalness
      if (shaderRef.current) {
        if (wallPhys.textureStrength !== undefined) {
          const s = shaderRef.current.uniforms.uTexStrength
          if (s) s.value = wallPhys.textureStrength
        }
        if (wallPhys.textureScale !== undefined) {
          const s = shaderRef.current.uniforms.uWallTexScale
          if (s) s.value = wallPhys.textureScale
        }
      }
    }
    const roofKey = `roof_${building.roof_material || 'flat'}`
    const roofPhys = materialPhysics?.[roofKey]
    if (roofPhys && shaderRef.current && roofPhys.textureScale !== undefined) {
      const s = shaderRef.current.uniforms.uRoofTexScale
      if (s) s.value = roofPhys.textureScale
    }
    mat.needsUpdate = true
  }, [materialPhysics, building.wall_material, building.roof_material])

  useFrame(() => {
    if (!meshRef.current) return
    const mat = meshRef.current.material
    const { sunAltitude } = getLightingPhase()

    // Darkness factor: 0 at full day (sun > 0.2), 1 at deep night (sun < -0.15)
    // Matches streetlamp turn-on schedule
    const darkFactor = Math.min(1, Math.max(0, (0.2 - sunAltitude) / 0.35))
    const darkStep = Math.round(darkFactor * 20) / 20 // quantize to avoid per-frame thrash

    // Shader uniform must be written every frame — onBeforeCompile initializes
    // uDarkFactor to 0.0, but the shader may compile after the first darkStep
    // comparison has already cached the current value, leaving roofs bright at night.
    if (shaderRef.current) {
      shaderRef.current.uniforms.uDarkFactor.value = darkFactor
    }

    // Emissive for selection/hover
    const emissiveHex = isSelected ? 0x333333 : isHovered ? 0x222222 : 0x000000

    const prev = prevStateRef.current
    if (prev.darkStep !== darkStep || prev.emissiveHex !== emissiveHex) {
      prev.darkStep = darkStep
      prev.emissiveHex = emissiveHex

      _tmpColor.copy(baseColor).lerp(nightColor, darkFactor)
      mat.color.copy(_tmpColor)
      mat.emissive.setHex(emissiveHex)
      mat.needsUpdate = true
    }
  })

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[building.position[0], foundationY, building.position[2]]}
        geometry={geometry}
        material={material}
        customDepthMaterial={depthMaterial}
        castShadow
        receiveShadow
        frustumCulled={false}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(building.id); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { clearHovered(); document.body.style.cursor = 'auto' }}
        // Defer select past the click (same drei <Html> mid-event crash guard as
        // the MapPin): select() re-renders/repositions the <Html> marker layer.
        onClick={(e) => { e.stopPropagation(); const ok = !isDrag(e); if (ok) requestAnimationFrame(() => select(building.id)) }}
      />
      {/* Neon retired from per-Building mount — see <NeonBands /> at the
          LafayetteScene render block. One merged mesh covers all open
          places; per-place hour gating happens at the caller's filter. */}
      {isSelected && <SelectionRing building={building} />}
    </group>
  )
}

// ============ MAIN ============

/**
 * Browse-only content is shown outside the movie shot (or always, on an authoring surface), after
 * `delayMs` when the profile staggers it. Shared by the street labels here and the player's markers.
 */
export function useBrowseContentReady(shot, forceContentReady, delayMs) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (forceContentReady) { setReady(true); return }
    if (shot === 'hero') { setReady(false); return }
    if (!delayMs) { setReady(true); return }
    const t = setTimeout(() => setReady(true), delayMs)
    return () => clearTimeout(t)
  }, [shot, forceContentReady, delayMs])
  return ready
}

function LafayetteScene({ town, lookId, bakeLastMs, paletteOverride, materialPhysicsOverride, materialColorsOverride, forceNeonOn, neonDensity, litIds, hiddenLayers, labelViewMode, forceContentReady } = {}) {
  // Panel layer toggles: { building, labels, ... } → boolean. Empty object in
  // production (no overrides). Stage passes the live store map; baked Stage
  // reads scene.json.layerVis. Foundations are tied to Building visibility.
  const hide = hiddenLayers || {}
  const scene = useSceneJson(lookOf(lookId, 'LafayetteScene'), bakeLastMs)
  // Stage's mount in CartographApp passes live-subscribed overrides from
  // the cartograph store so Surfaces panel drags retint instantly.
  // Production omits the overrides and reads scene.json frozen-at-bake.
  // Doctrine: project_authoring_is_live_production_is_static.
  const palette         = paletteOverride         ?? scene?.palette
  const materialPhysics = materialPhysicsOverride ?? scene?.materialPhysics
  const materialColors  = materialColorsOverride  ?? scene?.materialColors

  // The browse-only street labels follow the shot the town is drawn in (<Town shot>), which
  // <Town> passes as labelViewMode. Authoring surfaces pass forceContentReady instead.
  if (!labelViewMode && !forceContentReady) throw new Error('[LafayetteScene] ⛔ needs labelViewMode (the shot) or forceContentReady')
  const labelGateMode = labelViewMode
  const quality = useQuality()

  // Lazy-load building textures on first mount (the quality profile says whether)
  useEffect(() => { loadBuildingTextures(quality.buildingTextures) }, [quality.buildingTextures])

  // Register drag-guard listener with cleanup (avoids stacking on HMR)
  useEffect(() => {
    document.addEventListener('pointerdown', _onPointerDown)
    return () => document.removeEventListener('pointerdown', _onPointerDown)
  }, [])

  // Street labels are browse-only content. The phone profile staggers them in so the GPU compiles
  // in batches (the markers, the player's overlay, stagger the same way in LandmarkMarkers.jsx).
  const labelsReady = useBrowseContentReady(labelGateMode, forceContentReady, quality.staggerLabels ? 2000 : 0)

  // buildingId → { hex, hours, category } for currently-authored listings.
  // Shared with the neon mesh via the same hook SceneNeon uses, so the
  // per-id <Building> mounts below and the merged neon tubes never drift.
  const neonLookup = useNeonLookup()

  // Street labels — shared with Cartograph's MapLayers via the same pipeline
  // (streetLabels.js polylines → useLabelPlacements layout → StreetLabels
  // renderer + zoom-LOD) so Designer / Preview / LS never drift. Doctrine
  // [[project_preview_equals_ls_literally]]. The old LS-local
  // getStreetLabelPlacements, its SAME_NAME_MIN_DIST / ANY_LABEL_MIN_DIST
  // collision skip, and the EAST_OF_TRUMAN_ALLOWED whitelist are retired — the
  // collision de-dup now lives in labelLayout.js, the hood gate in the bake.
  // ⭐ THE STYLE COMES WITH THEM. The player does not hydrate the Cartograph
  // store, so the layout style has to arrive from the slab or the labels lay
  // out at defaults — which is exactly what they were doing. See
  // useLabelPlacements.js.
  const { labels: streetLabels, style: labelStyle } = useStreetLabels(lookOf(lookId, 'LafayetteScene'), bakeLastMs)
  const labelPlacements = useLabelPlacements(streetLabels, labelStyle)

  return (
    <group>
      {!hide.building && (
        <>
          <Foundations materialPhysics={materialPhysics} materialColors={materialColors} />

          {/* Buildings — per-id mount; neon is one merged mesh below. */}
          {_allBuildings.map(b => (
            <Building key={b.id} building={b} neonInfo={neonLookup[b.id]} palette={palette} materialPhysics={materialPhysics} />
          ))}
        </>
      )}

      {/* Neon — single Path B mesh over all currently-open places, with
          scene.json.neon driving the uCore/uTube/uBleed uniforms. Gated by
          hide.neon so Preview's per-layer toggle can isolate it; production
          and Stage pass no `neon` key, so it stays visible. Visibility-gated
          (not unmounted) so the Preview toggle is a clean per-frame on/off
          with no rebuild — it's one merged mesh, resident as in production
          (Vernier Phase 1b). */}
      <group visible={!hide.neon}>
        <SceneNeon forceNeonOn={forceNeonOn} density={neonDensity} materialColors={materialColorsOverride} lookId={lookOf(lookId, 'LafayetteScene')} litIds={litIds} />
      </group>

      {/* Street labels — the shared StreetLabels group (same component the
          Designer mounts, so they never drift): repeat + size k × widthM +
          fit/abbrev from labelLayout.js, thinned by the runtime zoom-LOD
          (labelLod.js) as the camera pulls out / in. */}
      {labelsReady && !hide.labels && <StreetLabels placements={labelPlacements} y={0.08} />}

      {/* Park title — the "LAFAYETTE PARK" landmark label. Has its OWN
          `parkTitle` toggle in the Labels panel (separate from `labels` =
          street labels), so the operator shows/hides it independently. NOT
          gated by labelsReady: it's a landmark establishing label shown in
          every shot (incl. Hero), unlike the browse-only street labels. */}
      {!hide.parkTitle && <ParkTitle town={town} lookId={lookOf(lookId, 'LafayetteScene')} />}
    </group>
  )
}

export default LafayetteScene
export { Building, Foundations, loadBuildingTextures, isDrag }
