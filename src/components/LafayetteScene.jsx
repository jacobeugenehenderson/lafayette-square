import { useRef, useState, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { buildings as _allBuildings, buildingMap as _buildingMap } from '../data/buildings'
import getStreetLabels from '../lib/streetLabels.js'
import SceneLabel from './SceneLabel.jsx'
import useListings from '../hooks/useListings'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { mergeBufferGeometries } from '../lib/mergeGeometries'
import { INSTANCE } from '../instance.js'

import usePlaceState from '../hooks/usePlaceState'
import useLandmarkFilter from '../hooks/useLandmarkFilter'
import useCamera from '../hooks/useCamera'
import { CATEGORY_HEX } from '../tokens/categories'
import { patchTerrain } from '../utils/terrainShader'
import { terrainExag } from '../utils/terrainShader'
import { getElevation, getElevationRaw } from '../utils/elevation'
import { FOUNDATION_BELOW_GRADE_M, periodPedestalFor } from '../lib/foundationGeometry.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import NeonBands from './NeonBands.jsx'

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
const _IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
const _BASE = import.meta.env.BASE_URL
const _buildingTextures = {}
let _texturesLoaded = false

function loadBuildingTextures() {
  if (_texturesLoaded || _IS_MOBILE) return
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
import buildingOverridesData from '../data/buildingOverrides.json'

// ============ PER-BUILDING OVERRIDES ============
// Override lookup: individual buildings can have custom roof_shape, foundation_height, etc.
// Add entries to src/data/buildingOverrides.json to refine beyond rule-based defaults.
const _overrides = buildingOverridesData.overrides || {}

function getOverride(buildingId, key) {
  const o = _overrides[buildingId]
  return o ? o[key] : undefined
}

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
function getFoundationHeight(building) {
  return periodPedestalFor(building, _overrides)
}

// Building Y = foundation height only. Terrain displacement handled by patchTerrain on GPU.
function getBuildingY(building) {
  return getFoundationHeight(building)
}

function classifyRoof(building) {
  const override = getOverride(building.id, 'roof_shape')
  if (override !== undefined) return override

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

function getRoofPeakHeight(building) {
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
      const groundYRaw = getElevationRaw(building.position[0], building.position[2])
      // Block goes from (-FOUNDATION_BELOW_GRADE_M) to (+fh) in local Y.
      // Runtime adds `aCentroidY * uExag` to every vertex so the top sits
      // at (groundYRaw * uExag + fh) and the bottom at
      // (groundYRaw * uExag - FOUNDATION_BELOW_GRADE_M).
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
    const mat = new THREE.MeshStandardMaterial({ color: '#B8A88A', roughness: 0.95 })
    // Per-vertex aCentroidY (raw heightmap, meters above local-min) lifts
    // each building's foundation block rigidly via the shared uExag uniform,
    // matching the per-vertex ground displacement that runs underneath.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uExag = terrainExag
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         attribute float aCentroidY;
         uniform float uExag;`
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.y += aCentroidY * uExag;`
      )
    }
    mat.customProgramCacheKey = () => 'foundation-terrain-v1'
    return mat
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
    <mesh ref={meshRef} geometry={geometry} receiveShadow castShadow material={foundationMat} />
  )
}

// ============ NEON BAND ============
// Glows when the place is currently open AND it's dark enough to see.
// Real listings check their hours; simulated listings are always "open."
const _DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
function _isWithinHours(hours, time) {
  if (!hours) return false // no hours set → neon off
  const day = _DAYS[time.getDay()]
  const slot = hours[day]
  if (!slot || !slot.open || !slot.close) return false // closed that day
  const mins = time.getHours() * 60 + time.getMinutes()
  const [oh, om] = slot.open.split(':').map(Number)
  const [ch, cm] = slot.close.split(':').map(Number)
  return mins >= oh * 60 + om && mins < ch * 60 + cm
}

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

  // Neon band: real listings always mount (hours checked inside NeonBand),
  // simulated listings mount only when the storefront sim slider marks them open
  const isSimOpen = usePlaceState((s) => s.openBuildings.has(building.id))
  const categoryHex = neonInfo?.hex
  const listingHours = neonInfo?.hours
  const neonForceOn = neonInfo?.forceOn || false
  const showNeon = !!categoryHex || isSimOpen
  const effectiveHex = categoryHex || simColor(building.id)

  const isSelected = selectedId === building.id
  const isHovered = hoveredId === building.id
  // Effective tint: per-building override (buildingOverrides.color) wins,
  // else the active Look's 12-slot palette (deterministic by id), else
  // the legacy `building.color` from buildings.json. Palette comes from
  // scene.json (frozen-at-bake) in production; Stage's mount in
  // CartographApp passes a live-subscribed paletteOverride through
  // LafayetteScene so the Surfaces panel still retints in real time.
  const colorOverride = getOverride(building.id, 'color')
  const wallTintHex = effectiveBuildingColor(building, palette, colorOverride)
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
    })

    const wallHeight = building.size[1]
    const roofStartY = foundationY + wallHeight - 0.3  // 30cm below top for clean transition
    const roofType = classifyRoof(building)
    const hasShapedRoof = roofType === 'mansard' || roofType === 'hip'

    if (!hasTextures) {
      // Mobile: lightweight roof-tinting shader — no texture sampling, just Y-threshold color.
      // Saves ~28 MB VRAM vs desktop textures while keeping roofs visually distinct.
      mat.onBeforeCompile = (shader) => {
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
      return mat
    }

    mat.onBeforeCompile = (shader) => {
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

    patchTerrain(mat)
    return mat
  }, [baseColor, wallTex, roofTex, roofTintColor, hasTextures, foundationY, building])

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
        castShadow
        receiveShadow
        onPointerOver={(e) => { e.stopPropagation(); setHovered(building.id); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { clearHovered(); document.body.style.cursor = 'auto' }}
        onClick={(e) => { e.stopPropagation(); if (!isDrag(e)) select(building.id) }}
      />
      {/* Neon retired from per-Building mount — see <NeonBands /> at the
          LafayetteScene render block. One merged mesh covers all open
          places; per-place hour gating happens at the caller's filter. */}
      {isSelected && <SelectionRing building={building} />}
    </group>
  )
}

function ClickCatcher() {
  const deselect = useSelectedBuilding((state) => state.deselect)
  return (
    <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={(e) => { if (!isDrag(e)) deselect() }}>
      <planeGeometry args={[2000, 2000]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

// ============ MAP PIN MARKERS ============

function getInitials(name) {
  if (!name) return '?'
  const words = name.split(/\s+/).filter(w => w.length > 0)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const PIN_STEM_GEO = new THREE.CylinderGeometry(0.12, 0.12, 1, 4)

function MapPin({ listing, building, xOffset = 0, zOffset = 0 }) {
  const select = useSelectedBuilding((state) => state.select)
  const categoryHex = CATEGORY_HEX[listing.category] || '#888888'
  const roofY = getFoundationHeight(building) + building.size[1] + getRoofPeakHeight(building)
  const stemHeight = 18
  const initials = getInitials(listing.name)
  const thumbnail = listing.logo || null
  const [logoSize, setLogoSize] = useState(null) // { w, h } after image loads
  const [logoFailed, setLogoFailed] = useState(false)

  const stemMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: categoryHex,
    transparent: true,
    opacity: 0.5,
  }), [categoryHex])

  // Compute container size from logo's natural aspect ratio
  const PIN_H = 42
  const PAD = 6
  const containerStyle = useMemo(() => {
    if (!thumbnail || logoFailed || !logoSize) {
      // Circle for initials (or while logo is loading)
      return { width: '40px', height: '40px', borderRadius: '50%' }
    }
    const ratio = logoSize.w / logoSize.h
    if (ratio < 1.4) {
      // Square-ish logo → compact square container
      return { width: `${PIN_H}px`, height: `${PIN_H}px`, borderRadius: '8px', padding: `${PAD}px` }
    }
    // Wide logo → snug rectangle
    const w = Math.min(Math.round(PIN_H * ratio * 0.7), 110)
    return { width: `${w}px`, height: `${PIN_H}px`, borderRadius: '8px', padding: `${PAD}px` }
  }, [thumbnail, logoFailed, logoSize])

  const hasLogo = thumbnail && !logoFailed && logoSize

  return (
    <group position={[building.position[0] + xOffset, 0, building.position[2] + zOffset]}>
      {/* Stem line from roof to pin */}
      <mesh
        position={[0, roofY + stemHeight / 2, 0]}
        scale={[1, stemHeight, 1]}
        geometry={PIN_STEM_GEO}
        material={stemMat}
      />

      {/* Pin head */}
      <Html
        center
        position={[0, roofY + stemHeight + 4, 0]}
        zIndexRange={[1, 10]}
      >
        <div
          onClick={(e) => { e.stopPropagation(); if (!isDrag(e)) select(listing.id, listing.building_id) }}
          onPointerOver={() => { document.body.style.cursor = 'pointer' }}
          onPointerOut={() => { document.body.style.cursor = 'auto' }}
          style={{
            ...containerStyle,
            background: hasLogo
              ? 'linear-gradient(135deg, #880e4f 0%, #ad1457 50%, #c2185b 100%)'
              : categoryHex,
            border: `2.5px solid ${hasLogo ? categoryHex : 'rgba(255,255,255,0.25)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
            overflow: 'hidden',
          }}
        >
          {thumbnail && !logoFailed ? (
            <img
              src={`${import.meta.env.BASE_URL}${thumbnail.replace(/^\//, '')}`}
              alt={listing.name}
              style={{
                maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                display: logoSize ? 'block' : 'none',
              }}
              onLoad={(e) => setLogoSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
              onError={() => setLogoFailed(true)}
            />
          ) : null}
          <span style={{
            display: hasLogo ? 'none' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 700,
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            letterSpacing: '0.5px',
            textShadow: '0 1px 2px rgba(0,0,0,0.4)',
          }}>
            {initials}
          </span>
        </div>
      </Html>
    </group>
  )
}

function LandmarkMarkers() {
  const activeTags = useLandmarkFilter((state) => state.activeTags)
  const selectedListingId = useSelectedBuilding((state) => state.selectedListingId)
  const listings = useListings((s) => s.listings)

  const filteredLandmarks = useMemo(() => {
    return listings.filter(l =>
      !l._bare && (activeTags.has(l.subcategory) || activeTags.has(l.category) || l.id === selectedListingId)
    )
  }, [activeTags, listings, selectedListingId])

  const buildingMap = useMemo(() => {
    const map = {}
    _allBuildings.forEach(b => { map[b.id] = b })
    return map
  }, [])

  // De-overlap: spread pins that are too close in XZ space
  const pinOffsets = useMemo(() => {
    const THRESH = 25  // detection radius
    const SPREAD = 20  // spacing between spread pins
    const entries = filteredLandmarks.map(l => {
      const b = buildingMap[l.building_id]
      return b ? { id: l.id, x: b.position[0], z: b.position[2] } : null
    }).filter(Boolean)

    const dx = {}, dz = {}
    entries.forEach(e => { dx[e.id] = 0; dz[e.id] = 0 })

    // Group pins within THRESH of each other
    const assigned = new Set()
    for (let i = 0; i < entries.length; i++) {
      if (assigned.has(i)) continue
      const cluster = [i]
      for (let j = i + 1; j < entries.length; j++) {
        if (assigned.has(j)) continue
        const ex = entries[i].x - entries[j].x
        const ez = entries[i].z - entries[j].z
        if (Math.sqrt(ex * ex + ez * ez) < THRESH) cluster.push(j)
      }
      if (cluster.length < 2) continue
      cluster.forEach(ci => assigned.add(ci))
      // Fan out radially around the cluster center
      const cx = cluster.reduce((s, ci) => s + entries[ci].x, 0) / cluster.length
      const cz = cluster.reduce((s, ci) => s + entries[ci].z, 0) / cluster.length
      cluster.forEach((ci, idx) => {
        const angle = (idx / cluster.length) * Math.PI * 2 - Math.PI / 2
        dx[entries[ci].id] = Math.cos(angle) * SPREAD
        dz[entries[ci].id] = Math.sin(angle) * SPREAD
      })
    }
    return { dx, dz }
  }, [filteredLandmarks, buildingMap])

  if (filteredLandmarks.length === 0) return null

  return (
    <group>
      {filteredLandmarks.map(listing => {
        const building = buildingMap[listing.building_id]
        if (!building) return null
        return (
          <MapPin
            key={listing.id}
            listing={listing}
            building={building}
            xOffset={pinOffsets.dx[listing.id] || 0}
            zOffset={pinOffsets.dz[listing.id] || 0}
          />
        )
      })}
    </group>
  )
}

// ============ MAIN ============
function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

function LafayetteScene({ lookId, bakeLastMs, paletteOverride, materialPhysicsOverride, materialColorsOverride, neonTubeOverride, forceNeonOn } = {}) {
  const scene = useSceneJson(resolveLookId(lookId), bakeLastMs)
  // Stage's mount in CartographApp passes live-subscribed overrides from
  // the cartograph store so Surfaces panel drags retint instantly.
  // Production omits the overrides and reads scene.json frozen-at-bake.
  // Doctrine: project_authoring_is_live_production_is_static.
  const palette         = paletteOverride         ?? scene?.palette
  const materialPhysics = materialPhysicsOverride ?? scene?.materialPhysics
  const materialColors  = materialColorsOverride  ?? scene?.materialColors

  const deselect = useSelectedBuilding((state) => state.deselect)
  const listings = useListings((s) => s.listings)
  const viewMode = useCamera((s) => s.viewMode)

  // Lazy-load building textures on first mount (desktop only)
  useEffect(() => { loadBuildingTextures() }, [])

  // Register drag-guard listener with cleanup (avoids stacking on HMR)
  useEffect(() => {
    document.addEventListener('pointerdown', _onPointerDown)
    return () => document.removeEventListener('pointerdown', _onPointerDown)
  }, [])

  // On mobile, stagger browse-only content across several seconds so the GPU
  // can compile shaders and upload textures in batches instead of all at once.
  // Desktop mounts everything immediately.
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  const [labelsReady, setLabelsReady] = useState(false)
  const [markersReady, setMarkersReady] = useState(false)
  useEffect(() => {
    if (viewMode !== 'hero') {
      if (isMobile) {
        const t1 = setTimeout(() => setLabelsReady(true), 2000)
        const t2 = setTimeout(() => setMarkersReady(true), 3500)
        return () => { clearTimeout(t1); clearTimeout(t2) }
      }
      setLabelsReady(true)
      setMarkersReady(true)
    } else {
      setLabelsReady(false)
      setMarkersReady(false)
    }
  }, [viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build a buildingId → { hex, hours } lookup — only for currently open listings.
  // Re-check every 60s so neon bands mount/unmount as places open and close,
  // instead of mounting all ~100+ and hiding with opacity:0.
  const [neonTick, setNeonTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNeonTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  const activeTags = useLandmarkFilter((s) => s.activeTags)

  const neonLookup = useMemo(() => {
    const map = {}
    listings.forEach(l => {
      const bid = l.building_id || l.id
      const hex = CATEGORY_HEX[l.category]
      if (!bid || !hex) return
      // Eligible if the listing has hours OR the Society Pages filter
      // tags this listing — `_isWithinHours` decides on/off at the
      // openPlaces filter below; NeonBands itself renders binary
      // (one merged mesh, all-or-nothing per uniform).
      if (l.hours) {
        map[bid] = { hex, hours: l.hours, category: l.category }
      }
      if (activeTags.size > 0 && (activeTags.has(l.subcategory) || activeTags.has(l.category))) {
        if (!map[bid]) map[bid] = { hex, hours: null, forceOn: true, category: l.category }
        else map[bid] = { ...map[bid], forceOn: true }
      }
    })
    return map
  }, [listings, neonTick, activeTags])

  // openPlaces — buildings whose neonLookup entry resolves "on" at the
  // current time (or is force-on from a Society Pages filter). Drives
  // the single <NeonBands> mesh in the render block. Refreshed on
  // neonTick (60s) + activeTags + listings; geometry rebuilds at that
  // cadence. Per-instance aIsOpen is the HANDOFF-neon §"Instancing"
  // amendment, deferred to v1.1.
  const openPlaces = useMemo(() => {
    const places = []
    const now = useTimeOfDay.getState().currentTime
    for (const b of _allBuildings) {
      const info = neonLookup[b.id]
      if (!info) continue
      // forceNeonOn (Stage QA toggle) bypasses the hours filter so the
      // operator can preview neon visibility at any TOD without scrubbing
      // to night. Production never sees it (prop omitted in Scene.jsx).
      const on = forceNeonOn || info.forceOn || _isWithinHours(info.hours, now)
      if (!on) continue
      // baseY = world Y of the rooftop. Foundation pedestal lift
      // (pre-1900: +1.2m, pre-1920: +0.8m, else 0) shifts the
      // building's mounted position; the neon tube must sit at the
      // same rooftop. NeonBands.buildTubeFor reads place.baseY.
      const baseY = getFoundationHeight(b) + b.size[1]
      places.push({ ...b, baseY, neon: { category: info.category } })
    }
    return places
  }, [neonLookup, neonTick, forceNeonOn])

  // Frustum-cull neon: only mount NeonBand for buildings the camera can actually see.
  // Checks every 30 frames (~0.5s) to avoid per-frame churn.
  const _neonFrustum = useRef(new THREE.Frustum())
  const _neonMatrix = useRef(new THREE.Matrix4())
  const _neonPt = useRef(new THREE.Vector3())
  const [visibleNeonIds, setVisibleNeonIds] = useState(() => new Set())
  const _frameCount = useRef(0)
  const _bldgPosMap = useMemo(() => {
    const m = {}
    _allBuildings.forEach(b => { m[b.id] = b })
    return m
  }, [])

  useFrame(({ camera }) => {
    if (++_frameCount.current % 30 !== 0) return
    const eligible = Object.keys(neonLookup)
    if (eligible.length === 0) { if (visibleNeonIds.size > 0) setVisibleNeonIds(new Set()); return }

    _neonMatrix.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    _neonFrustum.current.setFromProjectionMatrix(_neonMatrix.current)

    const next = new Set()
    for (const bid of eligible) {
      const b = _bldgPosMap[bid]
      if (!b) continue
      _neonPt.current.set(b.position[0], b.size[1] / 2, b.position[2])
      if (_neonFrustum.current.containsPoint(_neonPt.current)) next.add(bid)
    }

    // Only trigger re-render if the set actually changed
    if (next.size !== visibleNeonIds.size || [...next].some(id => !visibleNeonIds.has(id))) {
      setVisibleNeonIds(next)
    }
  })

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape') deselect() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deselect])

  // Street labels — shared with Cartograph's MapLayers via
  // src/lib/streetLabels.js so Designer / Preview / LS never drift.
  // Doctrine [[project_preview_equals_ls_literally]] — same data,
  // same renderer (SceneLabel below). Retired with this consolidation:
  // LS-local getStreetLabelPlacements, SAME_NAME_MIN_DIST /
  // ANY_LABEL_MIN_DIST collision skip, and the EAST_OF_TRUMAN_ALLOWED
  // whitelist (labelBoundary in the shared module supersedes it).
  const streetLabels = getStreetLabels()

  return (
    <group>
      <ClickCatcher />

      <Foundations materialPhysics={materialPhysics} materialColors={materialColors} />

      {/* Buildings — per-id mount; neon is one merged mesh below. */}
      {_allBuildings.map(b => (
        <Building key={b.id} building={b} neonInfo={visibleNeonIds.has(b.id) ? neonLookup[b.id] : undefined} palette={palette} materialPhysics={materialPhysics} />
      ))}

      {/* Neon — single Path B mesh over all currently-open places, with
          scene.json.neon driving the uCore/uTube/uBleed uniforms. */}
      {openPlaces.length > 0 && <NeonBands places={openPlaces} lookId={INSTANCE.lookId} neonTubeOverride={neonTubeOverride} />}

      {/* Street labels — SceneLabel renderer, panel-driven style; widthM
          carries the chain's pavement width so labels scale with the
          street. */}
      {labelsReady && streetLabels.map((lbl, i) => (
        <SceneLabel
          key={`label-${i}`}
          text={lbl.name}
          tier="street"
          widthM={lbl.widthM}
          position={[lbl.x, 0.08, lbl.z]}
          rotation={[-Math.PI / 2, 0, -lbl.angle]}
        />
      ))}

      {/* Landmark markers */}
      {markersReady && <LandmarkMarkers />}
    </group>
  )
}

export default LafayetteScene
export { Building, Foundations, loadBuildingTextures }
