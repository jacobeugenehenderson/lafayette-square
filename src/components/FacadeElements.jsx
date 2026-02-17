import { useRef, useState, useMemo, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import buildingsData from '../data/buildings.json'
import facadeElementsData from '../data/facadeElements.json'

const BASE = import.meta.env.BASE_URL
const LOAD_DISTANCE = 60
const UNLOAD_DISTANCE = 80

// ── Building lookup ──
const _buildingMap = {}
buildingsData.buildings.forEach(b => { _buildingMap[b.id] = b })

// ── Model loading (supports GLB/glTF and FBX) ──
const _gltfLoader = new GLTFLoader()
const _fbxLoader = new FBXLoader()
const _modelCache = new Map() // url → { scene, bbox, error }
const _loadingSet = new Set()

function getModel(url) {
  return _modelCache.get(url) || null
}

function loadModel(url) {
  if (_modelCache.has(url) || _loadingSet.has(url)) return
  _loadingSet.add(url)

  const isFBX = /\.fbx$/i.test(url)
  const loader = isFBX ? _fbxLoader : _gltfLoader

  loader.load(
    url,
    (result) => {
      const scene = isFBX ? result : result.scene
      // Measure bounding box for auto-scaling
      const bbox = new THREE.Box3().setFromObject(scene)
      const size = new THREE.Vector3()
      bbox.getSize(size)
      const name = url.split('/').pop()
      // Log bbox and all material names for tuning
      const matNames = []
      scene.traverse(child => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach(m => { if (m.name && !matNames.includes(m.name)) matNames.push(m.name) })
        }
      })
      console.log(`[Facade] Loaded ${name}: bbox ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}, materials: [${matNames.join(', ')}]`)
      _modelCache.set(url, { scene, bbox, error: false })
      _loadingSet.delete(url)
    },
    undefined,
    (err) => {
      console.warn(`[Facade] Failed to load ${url.split('/').pop()}:`, err)
      _modelCache.set(url, { scene: null, bbox: null, error: true })
      _loadingSet.delete(url)
    }
  )
}

// ── Geometry helpers ──

function getFoundationHeight(building) {
  const year = building.year_built
  if (!year) return 0
  if (year < 1900) return 1.2
  if (year < 1920) return 0.8
  return 0
}

// Compute outward normal for a footprint edge
function edgeNormal(footprint, edgeIdx) {
  const n = footprint.length
  const v0 = footprint[edgeIdx % n]
  const v1 = footprint[(edgeIdx + 1) % n]
  const dx = v1[0] - v0[0]
  const dz = v1[1] - v0[1]
  const len = Math.sqrt(dx * dx + dz * dz) || 1

  // Signed area to determine winding
  let area = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += footprint[i][0] * footprint[j][1] - footprint[j][0] * footprint[i][1]
  }

  // area < 0 = CCW from above → outward normal = (-dz, dx)/len
  // area > 0 = CW from above → outward normal = (dz, -dx)/len
  let nx, nz
  if (area < 0) {
    nx = -dz / len; nz = dx / len
  } else {
    nx = dz / len; nz = -dx / len
  }
  return { nx, nz, rotY: Math.atan2(nx, nz) }
}

// Compute world position for an element placement on a building
function computePlacement(building, element, catalogEntry) {
  const fp = building.footprint
  if (!fp || fp.length < 3) return null

  const edgeIdx = element.edge || 0
  const t = element.t != null ? element.t : 0.5
  const n = fp.length
  const v0 = fp[edgeIdx % n]
  const v1 = fp[(edgeIdx + 1) % n]

  // Position along edge
  const x = v0[0] + (v1[0] - v0[0]) * t
  const z = v0[1] + (v1[1] - v0[1]) * t

  const { nx, nz, rotY: edgeRotY } = edgeNormal(fp, edgeIdx)

  // Offset from wall surface (half the element depth + small gap)
  const depth = catalogEntry ? catalogEntry.size[2] : 0.15
  const offset = depth * 0.5 + 0.01
  const wx = x + nx * offset
  const wz = z + nz * offset

  // Y position
  const foundY = getFoundationHeight(building)
  const wy = foundY + (element.y != null ? element.y : 0)

  // Rotation: face outward from wall + model rotation offset
  const modelRotY = catalogEntry ? (catalogEntry.rotateY || 0) : 0
  const rotY = edgeRotY + modelRotY

  return { x: wx, y: wy, z: wz, rotY }
}

// ── Pre-compute all placements with world positions for distance checks ──
const _allPlacements = []
const _buildingsWithElements = new Set()

for (const [bid, elements] of Object.entries(facadeElementsData.buildings)) {
  const bldg = _buildingMap[bid]
  if (!bldg) continue
  _buildingsWithElements.add(bid)

  const entries = elements.map(el => {
    const catEntry = facadeElementsData.catalog[el.model]
    const pos = computePlacement(bldg, el, catEntry)
    if (!pos) return null
    return { ...el, bid, pos, catEntry }
  }).filter(Boolean)

  if (entries.length > 0) {
    _allPlacements.push({
      bid,
      cx: bldg.position[0],
      cz: bldg.position[2],
      entries,
    })
  }
}

// Collect unique model URLs needed
const _neededModels = new Set()
for (const group of _allPlacements) {
  for (const entry of group.entries) {
    if (entry.catEntry?.file) {
      _neededModels.add(`${BASE}${entry.catEntry.file}`)
    }
  }
}

// ── Material overrides ──
const _frameMat = new THREE.MeshStandardMaterial({
  color: '#c8c4bc',
  roughness: 0.7,
  metalness: 0.0,
})

const _foundationMat = new THREE.MeshStandardMaterial({
  color: '#9a8d7a',
  roughness: 0.85,
  metalness: 0.0,
})

const _windowFrameMat = new THREE.MeshStandardMaterial({
  color: '#f0ede8',
  roughness: 0.5,
  metalness: 0.0,
})

const _glassMat = new THREE.MeshPhysicalMaterial({
  color: '#1a2a3a',
  roughness: 0.05,
  metalness: 0.1,
  transmission: 0.6,
  transparent: true,
  opacity: 0.7,
})

const _matTypes = { foundation: _foundationMat, frame: _frameMat, windowFrame: _windowFrameMat, glass: _glassMat }

function applyMaterialOverrides(scene, matMap) {
  // Only override if there's an explicit materialMap from the catalog
  if (!matMap) return
  scene.traverse(child => {
    if (!child.isMesh || !child.material) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    const newMats = mats.map((m, i) => {
      if (matMap[String(i)]) {
        return _matTypes[matMap[String(i)]] || m
      }
      return m
    })
    child.material = newMats.length === 1 ? newMats[0] : newMats
  })
}

// ── Fallback box geometry (used when model not loaded or missing) ──
const _fallbackGeoCache = new Map()
function getFallbackGeo(size) {
  const key = size.join(',')
  if (!_fallbackGeoCache.has(key)) {
    _fallbackGeoCache.set(key, new THREE.BoxGeometry(size[0], size[1], size[2]))
  }
  return _fallbackGeoCache.get(key)
}

const _fallbackMat = new THREE.MeshStandardMaterial({
  color: '#2a3040',
  roughness: 0.4,
  metalness: 0.1,
  transparent: true,
  opacity: 0.85,
})

// ── Single facade element ──
function FacadeElement({ entry, modelsReady }) {
  const groupRef = useRef()
  const { pos, catEntry } = entry

  // Try to use real model, fall back to box
  const modelUrl = catEntry?.file ? `${BASE}${catEntry.file}` : null
  const cached = modelUrl ? getModel(modelUrl) : null
  const hasModel = cached && cached.scene && !cached.error

  // Clone model, non-uniform scale to match catalog size, center on bbox
  const { sceneClone, offset } = useMemo(() => {
    if (!hasModel || !cached.bbox) return { sceneClone: null, offset: [0, 0, 0] }
    const clone = cached.scene.clone(true)
    applyMaterialOverrides(clone, catEntry?.materialMap)

    const rawSize = new THREE.Vector3()
    cached.bbox.getSize(rawSize)
    const rawCenter = new THREE.Vector3()
    cached.bbox.getCenter(rawCenter)

    const tw = catEntry.size[0], th = catEntry.size[1], td = catEntry.size[2]
    const sx = rawSize.x > 0.001 ? tw / rawSize.x : 1
    const sy = rawSize.y > 0.001 ? th / rawSize.y : 1
    const sz = rawSize.z > 0.001 ? td / rawSize.z : 1
    const mul = catEntry.scale || 1
    clone.scale.set(sx * mul, sy * mul, sz * mul)

    console.log(`[Facade] ${entry.model}: raw ${rawSize.x.toFixed(1)}x${rawSize.y.toFixed(1)}x${rawSize.z.toFixed(1)} → ${tw}x${th}x${td}m (sx=${sx.toFixed(4)} sy=${sy.toFixed(4)} sz=${sz.toFixed(4)})`)

    // Center horizontally, bottom at y=0
    const oX = -rawCenter.x * sx * mul
    const oY = -cached.bbox.min.y * sy * mul
    const oZ = -rawCenter.z * sz * mul

    return { sceneClone: clone, offset: [oX, oY, oZ] }
  }, [hasModel, cached?.scene, cached?.bbox, catEntry?.scale, catEntry?.size])

  const fallbackSize = catEntry?.size || [1, 1, 0.15]

  return (
    <group
      ref={groupRef}
      position={[pos.x, pos.y, pos.z]}
      rotation={[0, pos.rotY, 0]}
    >
      {sceneClone ? (
        <group position={offset}>
          <primitive object={sceneClone} />
        </group>
      ) : (
        <mesh
          geometry={getFallbackGeo(fallbackSize)}
          material={catEntry?.material ? (_matTypes[catEntry.material] || _fallbackMat) : _fallbackMat}
        />
      )}
    </group>
  )
}

// ── Elements for one building ──
function BuildingElements({ group, modelsReady }) {
  return (
    <group>
      {group.entries.map((entry, i) => (
        <FacadeElement key={i} entry={entry} modelsReady={modelsReady} />
      ))}
    </group>
  )
}

// ── Main component ──
export default function FacadeElements() {
  const { camera } = useThree()
  const [visibleBids, setVisibleBids] = useState(new Set())
  const [modelsReady, setModelsReady] = useState(0)
  const frameCount = useRef(0)

  useFrame(() => {
    frameCount.current++
    if (frameCount.current % 15 !== 0) return

    const cx = camera.position.x
    const cz = camera.position.z

    // Check model loading status
    let ready = 0
    for (const url of _neededModels) {
      if (_modelCache.has(url)) ready++
      else loadModel(url)
    }
    if (ready !== modelsReady) setModelsReady(ready)

    // Find nearby buildings with placements
    const newVisible = new Set()
    for (const group of _allPlacements) {
      const dx = group.cx - cx
      const dz = group.cz - cz
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < LOAD_DISTANCE) {
        newVisible.add(group.bid)
      }
    }

    // Only update state if changed
    setVisibleBids(prev => {
      if (prev.size !== newVisible.size) return newVisible
      for (const id of newVisible) {
        if (!prev.has(id)) return newVisible
      }
      return prev
    })
  })

  const groupLookup = useMemo(() => {
    const map = {}
    _allPlacements.forEach(g => { map[g.bid] = g })
    return map
  }, [])

  if (_allPlacements.length === 0) return null

  return (
    <group>
      {[...visibleBids].map(bid => {
        const g = groupLookup[bid]
        return g ? (
          <BuildingElements key={bid} group={g} modelsReady={modelsReady} />
        ) : null
      })}
    </group>
  )
}

// Export for use by other components
export { _buildingsWithElements as buildingsWithFacadeElements }
