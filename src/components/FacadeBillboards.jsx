import { useRef, useState, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import facadeData from '../data/facade_mapping.json'
import buildingsData from '../data/buildings.json'

const BASE = import.meta.env.BASE_URL
const LOAD_DISTANCE = 100    // meters — load textures within this range
const UNLOAD_DISTANCE = 140  // meters — unload textures beyond this
const OFFSET = 0.15          // meters — offset from wall surface
const MAX_LOADED = 40        // max simultaneous textures

// Pre-compute facade entries with world positions for distance checks
const facades = []
const buildingLookup = {}
buildingsData.buildings.forEach(b => { buildingLookup[b.id] = b })

for (const [bid, data] of Object.entries(facadeData)) {
  const bldg = buildingLookup[bid]
  if (!bldg) continue
  const edge = data.front_edge
  if (!edge) continue

  // Foundation height (same logic as LafayetteScene)
  const year = bldg.year_built
  let foundationY = 0
  if (year && year < 1900) foundationY = 1.2
  else if (year && year < 1920) foundationY = 0.8

  // Facade plane position: front edge midpoint, offset outward
  const px = edge.mid_x + edge.nx * OFFSET
  const pz = edge.mid_z + edge.nz * OFFSET
  const py = foundationY + data.wall_height / 2

  // Rotation: plane faces along normal direction
  // PlaneGeometry faces +Z by default, so we rotate to face the normal direction
  const rotY = edge.angle

  // Image path — strip leading /public/ since Vite serves public/ at root
  const imagePath = `${BASE}${data.image.replace(/^\/public\//, '').replace(/^\//, '')}`

  // Cap facade width — photos are of individual buildings (~5-15m wide)
  // Stretching across 40m+ industrial buildings would look wrong
  const facadeWidth = Math.min(edge.width, 18)

  facades.push({
    id: bid,
    px, py, pz,
    rotY,
    width: facadeWidth,
    height: data.wall_height,
    imagePath,
    confidence: data.confidence,
  })
}

// Texture cache
const textureLoader = new THREE.TextureLoader()
const textureCache = new Map()
const loadingSet = new Set()

function loadTexture(path) {
  if (textureCache.has(path)) return textureCache.get(path)
  if (loadingSet.has(path)) return null

  loadingSet.add(path)
  textureLoader.load(
    path,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.generateMipmaps = true
      textureCache.set(path, tex)
      loadingSet.delete(path)
    },
    undefined,
    () => {
      loadingSet.delete(path)
    }
  )
  return null
}

function unloadTexture(path) {
  const tex = textureCache.get(path)
  if (tex) {
    tex.dispose()
    textureCache.delete(path)
  }
}


function FacadePlane({ facade }) {
  const [texture, setTexture] = useState(null)

  useFrame(() => {
    const cached = textureCache.get(facade.imagePath)
    if (cached && cached !== texture) {
      setTexture(cached)
    }
  })

  // Apply center-crop UV once when texture arrives
  const material = useMemo(() => {
    if (!texture) return null

    // Photo aspect ratio (mostly 4:3 landscape, ~1.33)
    const imgAspect = texture.image ? texture.image.width / texture.image.height : 1.33
    const bldgAspect = facade.width / facade.height

    // Clone texture so UV transforms don't leak to other users
    const tex = texture.clone()
    tex.needsUpdate = true

    // Center-crop: cover the plane without distortion
    const repeatX = bldgAspect < imgAspect ? bldgAspect / imgAspect : 1
    const repeatY = bldgAspect > imgAspect ? imgAspect / bldgAspect : 1
    tex.repeat.set(repeatX, repeatY)
    tex.offset.set((1 - repeatX) / 2, (1 - repeatY) / 2)

    return new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
  }, [texture, facade.width, facade.height])

  if (!material) return null

  return (
    <mesh
      position={[facade.px, facade.py, facade.pz]}
      rotation={[0, facade.rotY, 0]}
      material={material}
    >
      <planeGeometry args={[facade.width, facade.height]} />
    </mesh>
  )
}


export default function FacadeBillboards() {
  const { camera } = useThree()
  const [visibleIds, setVisibleIds] = useState(new Set())
  const frameCount = useRef(0)

  useFrame(() => {
    frameCount.current++
    // Check every 10 frames for performance
    if (frameCount.current % 10 !== 0) return

    const camX = camera.position.x
    const camZ = camera.position.z
    const newVisible = new Set()

    // Sort facades by distance, keep nearest MAX_LOADED
    const withDist = facades.map(f => {
      const dx = f.px - camX
      const dz = f.pz - camZ
      return { f, dist: Math.sqrt(dx * dx + dz * dz) }
    })
    withDist.sort((a, b) => a.dist - b.dist)

    let loaded = 0
    for (const { f, dist } of withDist) {
      if (dist < LOAD_DISTANCE && loaded < MAX_LOADED) {
        newVisible.add(f.id)
        loadTexture(f.imagePath)
        loaded++
      } else if (dist > UNLOAD_DISTANCE) {
        unloadTexture(f.imagePath)
      }
    }

    // Only update state if the set actually changed
    setVisibleIds(prev => {
      if (prev.size !== newVisible.size) return newVisible
      for (const id of newVisible) {
        if (!prev.has(id)) return newVisible
      }
      return prev
    })
  })

  const facadeLookup = useMemo(() => {
    const map = {}
    facades.forEach(f => { map[f.id] = f })
    return map
  }, [])

  return (
    <group>
      {[...visibleIds].map(id => {
        const f = facadeLookup[id]
        return f ? <FacadePlane key={id} facade={f} /> : null
      })}
    </group>
  )
}
