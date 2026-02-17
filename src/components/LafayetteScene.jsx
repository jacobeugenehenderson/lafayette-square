import { useRef, useState, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Html } from '@react-three/drei'
import * as THREE from 'three'
import buildingsData from '../data/buildings.json'
import streetsData from '../data/streets.json'
import useListings from '../hooks/useListings'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { mergeBufferGeometries } from '../lib/mergeGeometries'

import useBusinessState from '../hooks/useBusinessState'
import useLandmarkFilter from '../hooks/useLandmarkFilter'
import useCamera from '../hooks/useCamera'
import { CATEGORY_HEX } from '../tokens/categories'
// import FacadeBillboards from './FacadeBillboards'  // shelved — future street-level facade rendering
import FacadeElements from './FacadeElements'

// ============ BUILDING TEXTURES ============
// Tileable PBR textures for walls and roofs (CC0, Poly Haven)
const _texLoader = new THREE.TextureLoader()
const _BASE = import.meta.env.BASE_URL
const _buildingTextures = {}

;['brick_red', 'brick_weathered', 'stone', 'slate', 'metal', 'wood_siding', 'stucco'].forEach(name => {
  const tex = _texLoader.load(`${_BASE}textures/buildings/${name}.jpg`)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  _buildingTextures[name] = tex
})

// ── Drag guard: suppress clicks after pointer moves >6px (prevents accidental selection during pan) ──
let _pdx = 0, _pdy = 0
document.addEventListener('pointerdown', (e) => { _pdx = e.clientX; _pdy = e.clientY })
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

function getFoundationHeight(building) {
  const override = getOverride(building.id, 'foundation_height')
  if (override !== undefined) return override

  const year = building.year_built
  if (!year) return 0
  if (year < 1900) return 1.2
  if (year < 1920) return 0.8
  return 0
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

function Foundations() {
  const geometry = useMemo(() => {
    const geos = []

    buildingsData.buildings.forEach(building => {
      const fh = getFoundationHeight(building)
      if (fh <= 0) return

      const footprint = building.footprint
      const depth = fh + 0.05 // slight overlap to prevent seam

      if (!footprint || footprint.length < 3) {
        const [w, , d] = building.size
        const geo = new THREE.BoxGeometry(w, depth, d)
        geo.translate(building.position[0], depth / 2, building.position[2])
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
          geo.translate(building.position[0], 0, building.position[2])
          geos.push(geo)
        } catch (e) {
          // fallback box
          const [w, , d] = building.size
          const geo = new THREE.BoxGeometry(w, depth, d)
          geo.translate(building.position[0], depth / 2, building.position[2])
          geos.push(geo)
        }
      }
    })

    if (geos.length === 0) return null
    const merged = mergeBufferGeometries(geos)
    geos.forEach(g => g.dispose())
    return merged
  }, [])

  const meshRef = useRef()
  const prevDarkRef = useRef(-1)
  const getLightingPhase = useTimeOfDay((state) => state.getLightingPhase)
  const dayColor = useMemo(() => new THREE.Color('#B8A88A'), [])
  const nightColor = useMemo(() => new THREE.Color('#4a4038'), [])

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

  if (!geometry) return null

  return (
    <mesh ref={meshRef} geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial color="#B8A88A" roughness={0.95} />
    </mesh>
  )
}

// ============ NEON BAND ============
// Glows when the business is currently open AND it's dark enough to see.
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

function NeonBand({ building, categoryHex, hours, forceOn = false }) {
  const bandRef = useRef()
  const prevStateRef = useRef({ glowFactor: -1, isOpen: null })
  const getLightingPhase = useTimeOfDay((state) => state.getLightingPhase)
  const baseColor = useMemo(() => new THREE.Color(categoryHex), [categoryHex])
  const foundationY = getFoundationHeight(building)

  const bandGeometry = useMemo(() => {
    const height = building.size[1]
    const bandRadius = 0.075
    const footprint = building.footprint

    let points = []
    if (!footprint || footprint.length < 3) {
      const [w, , d] = building.size
      const hw = w / 2, hd = d / 2
      points = [
        new THREE.Vector3(-hw, height, -hd),
        new THREE.Vector3(hw, height, -hd),
        new THREE.Vector3(hw, height, hd),
        new THREE.Vector3(-hw, height, hd),
        new THREE.Vector3(-hw, height, -hd),
      ]
    } else {
      points = footprint.map(([x, z]) =>
        new THREE.Vector3(x - building.position[0], height, z - building.position[2])
      )
      points.push(points[0].clone())
    }

    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0)
    return new THREE.TubeGeometry(curve, points.length * 8, bandRadius, 8, false)
  }, [building])

  const bandMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: baseColor,
    emissive: baseColor,
    emissiveIntensity: 0,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    opacity: 0,
  }), [baseColor])

  useFrame(() => {
    if (!bandRef.current) return
    const mat = bandRef.current.material
    const { sunAltitude } = getLightingPhase()
    const currentTime = useTimeOfDay.getState().currentTime
    const isOpen = forceOn || _isWithinHours(hours, currentTime)

    // Glow ramps from subtle daytime accent to full neon at dusk
    // sunAltitude ~0.2 = bright day, ~0.05 = dusk, < -0.12 = night
    const rawGlow = Math.min(1, Math.max(0, (0.2 - sunAltitude) / 0.35))
    const glowFactor = Math.round(rawGlow * 20) / 20 // quantize to avoid per-frame thrash

    const prev = prevStateRef.current
    if (prev.isOpen !== isOpen || prev.glowFactor !== glowFactor) {
      prev.isOpen = isOpen
      prev.glowFactor = glowFactor

      if (isOpen) {
        mat.opacity = 1
        mat.emissiveIntensity = 2.5
        mat.color.copy(baseColor)
        mat.emissive.copy(baseColor)
      } else {
        mat.opacity = 0
        mat.emissiveIntensity = 0
      }
    }
  })

  return (
    <mesh
      ref={bandRef}
      position={[building.position[0], foundationY, building.position[2]]}
      geometry={bandGeometry}
      material={bandMaterial}
    />
  )
}

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

function Building({ building, neonInfo }) {
  const meshRef = useRef()
  const prevStateRef = useRef({ darkStep: -1, emissiveHex: 0 })
  const { selectedId, hoveredId, select, setHovered, clearHovered } = useSelectedBuilding()
  const getLightingPhase = useTimeOfDay((state) => state.getLightingPhase)
  const foundationY = getFoundationHeight(building)

  // Neon band: real listings always mount (hours checked inside NeonBand),
  // simulated listings mount only when the business sim slider marks them open
  const isSimOpen = useBusinessState((s) => s.openBuildings.has(building.id))
  const categoryHex = neonInfo?.hex
  const listingHours = neonInfo?.hours
  const showNeon = !!categoryHex || isSimOpen
  const effectiveHex = categoryHex || simColor(building.id)

  const isSelected = selectedId === building.id
  const isHovered = hoveredId === building.id
  const baseColor = useMemo(() => new THREE.Color(building.color), [building.color])

  // Pre-compute night color: keep saturation, darken, cool-shift hue
  const nightColor = useMemo(() => {
    const c = baseColor.clone()
    const hsl = {}
    c.getHSL(hsl)
    const coolHue = hsl.h + 0.03
    c.setHSL(coolHue, hsl.s * 0.65, hsl.l * 0.25)
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

  // Material with tileable texture injection
  const wallTex = _buildingTextures[building.wall_material] || _buildingTextures.brick_red
  const roofMat = building.roof_material
  const roofTex = (roofMat && roofMat !== 'flat') ? (_buildingTextures[roofMat] || null) : null
  const shaderRef = useRef(null)

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

    mat.onBeforeCompile = (shader) => {
      shaderRef.current = shader
      shader.uniforms.uWallTex = { value: wallTex }
      shader.uniforms.uRoofTex = { value: roofTex || wallTex }
      shader.uniforms.uHasRoofTex = { value: roofTex ? 1.0 : 0.0 }
      shader.uniforms.uRoofStartY = { value: roofStartY }
      shader.uniforms.uRoofTint = { value: roofTintColor }
      shader.uniforms.uTexStrength = { value: 0.4 }
      shader.uniforms.uDarkFactor = { value: 0.0 }

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
           bWallUV = vec2(vBldgWorldPos.x, vBldgWorldPos.y) * 0.25;
         }

         // Roof UV: world XZ plane
         vec2 bRoofUV = vBldgWorldPos.xz * 0.2;

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

    return mat
  }, [baseColor, wallTex, roofTex, roofTintColor])

  useFrame(() => {
    if (!meshRef.current) return
    const mat = meshRef.current.material
    const { sunAltitude } = getLightingPhase()

    // Darkness factor: 0 at full day (sun > 0.2), 1 at deep night (sun < -0.15)
    // Matches streetlamp turn-on schedule
    const darkFactor = Math.min(1, Math.max(0, (0.2 - sunAltitude) / 0.35))
    const darkStep = Math.round(darkFactor * 20) / 20 // quantize to avoid per-frame thrash

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

      // Sync roof darkness with day/night cycle
      if (shaderRef.current) {
        shaderRef.current.uniforms.uDarkFactor.value = darkFactor
      }
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
      {showNeon && <NeonBand building={building} categoryHex={effectiveHex} hours={listingHours} forceOn={isSimOpen} />}
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

// ============ STREET LABELS ============
// Computes label placement(s) for a single street segment
function getStreetLabelPlacements(street) {
  if (!street.name) return []
  const points = street.points
  if (points.length < 2) return []

  let totalLen = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0]
    const dz = points[i][1] - points[i - 1][1]
    totalLen += Math.sqrt(dx * dx + dz * dz)
  }

  if (totalLen < 30) return []

  // Place label at the midpoint of this segment
  const targetDist = totalLen * 0.5
  let accumulated = 0
  let labelX = points[0][0], labelZ = points[0][1]
  let angle = 0

  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0]
    const dz = points[i][1] - points[i - 1][1]
    const segLen = Math.sqrt(dx * dx + dz * dz)

    if (accumulated + segLen >= targetDist) {
      const t = (targetDist - accumulated) / segLen
      labelX = points[i - 1][0] + dx * t
      labelZ = points[i - 1][1] + dz * t
      angle = Math.atan2(dz, dx)
      break
    }
    accumulated += segLen
  }

  if (angle > Math.PI / 2) angle -= Math.PI
  if (angle < -Math.PI / 2) angle += Math.PI

  return [{ x: labelX, z: labelZ, angle, len: totalLen, name: street.name, type: street.type }]
}

// Minimum distance between two labels of the same street name
const SAME_NAME_MIN_DIST = 120
// Minimum distance between any two labels (prevents overlap)
const ANY_LABEL_MIN_DIST = 25

function StreetLabel({ label }) {
  const isPrimary = label.type === 'primary' || label.type === 'secondary'
  const fontSize = isPrimary ? 5 : 3.5
  const text = label.name.toUpperCase()

  return (
    <group position={[label.x, 0.3, label.z]} rotation={[-Math.PI / 2, 0, -label.angle]}>
      <Text
        fontSize={fontSize}
        color={isPrimary ? '#c8c8d0' : '#888890'}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.08}
        outlineWidth={fontSize * 0.2}
        outlineColor="#14141c"
      >
        {text}
      </Text>
    </group>
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
      activeTags.has(l.subcategory) || activeTags.has(l.category) || l.id === selectedListingId
    )
  }, [activeTags, listings, selectedListingId])

  const buildingMap = useMemo(() => {
    const map = {}
    buildingsData.buildings.forEach(b => { map[b.id] = b })
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
function LafayetteScene() {
  const deselect = useSelectedBuilding((state) => state.deselect)
  const listings = useListings((s) => s.listings)
  const viewMode = useCamera((s) => s.viewMode)

  // Build a buildingId → { hex, hours } lookup from listings
  const neonLookup = useMemo(() => {
    const map = {}
    listings.forEach(l => {
      const bid = l.building_id || l.id
      const hex = CATEGORY_HEX[l.category]
      if (bid && hex) map[bid] = { hex, hours: l.hours }
    })
    return map
  }, [listings])

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape') deselect() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deselect])

  const streetLabels = useMemo(() => {
    // Collect candidate placements from all named street segments
    const typeOrder = { primary: 0, secondary: 1, tertiary: 2, residential: 3 }
    const candidates = []

    streetsData.streets.forEach(s => {
      getStreetLabelPlacements(s).forEach(p => candidates.push(p))
    })

    // Sort: primary/secondary first, then by segment length (longest first)
    candidates.sort((a, b) => {
      const oa = typeOrder[a.type] ?? 4, ob = typeOrder[b.type] ?? 4
      if (oa !== ob) return oa - ob
      return b.len - a.len
    })

    // Greedily place labels, skipping those too close to already-placed ones
    const placed = []
    // Streets allowed east of Truman (x > 640)
    const EAST_OF_TRUMAN_ALLOWED = /^(Dillon|Park|Rutger|Hickory|Chouteau|Truman)/i
    for (const c of candidates) {
      // Filter: drop labels east of Truman unless whitelisted
      if (c.x > 640 && !EAST_OF_TRUMAN_ALLOWED.test(c.name)) continue

      let tooClose = false
      for (const p of placed) {
        const dx = c.x - p.x, dz = c.z - p.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        const minDist = c.name === p.name ? SAME_NAME_MIN_DIST : ANY_LABEL_MIN_DIST
        if (dist < minDist) { tooClose = true; break }
      }
      if (!tooClose) placed.push(c)
    }

    return placed
  }, [])

  return (
    <group>
      <ClickCatcher />

      <Foundations />

      {/* Buildings */}
      {buildingsData.buildings.map(b => (
        <Building key={b.id} building={b} neonInfo={neonLookup[b.id]} />
      ))}

      {/* Street labels — hidden only in hero mode */}
      {viewMode !== 'hero' && streetLabels.map((label, i) => (
        <StreetLabel key={`label-${i}`} label={label} />
      ))}

      {/* Landmark markers — hidden only in hero mode */}
      {viewMode !== 'hero' && <LandmarkMarkers />}

      {/* 3D facade elements — windows, doors, stoops (has own 60m LOD) */}
      {viewMode !== 'hero' && <FacadeElements />}

      {/* Facade photos — billboard planes on building fronts (shelved for future) */}
      {/* {viewMode !== 'hero' && <FacadeBillboards />} */}
    </group>
  )
}

export default LafayetteScene
