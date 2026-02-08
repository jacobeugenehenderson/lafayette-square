import { useMemo } from 'react'
import * as THREE from 'three'
import terrainData from '../data/terrain.json'

function Terrain() {
  const geometry = useMemo(() => {
    const { width, height, bounds, data } = terrainData
    const spanX = bounds.maxX - bounds.minX
    const spanZ = bounds.maxZ - bounds.minZ

    const geo = new THREE.PlaneGeometry(spanX, spanZ, width - 1, height - 1)
    geo.rotateX(-Math.PI / 2)

    // Center the geometry at origin
    const positions = geo.attributes.position.array

    // Apply vertex displacement from terrain data
    for (let i = 0; i < positions.length / 3; i++) {
      const row = Math.floor(i / width)
      const col = i % width
      const dataIndex = row * width + col
      if (dataIndex < data.length) {
        // Y is at index 1 (after rotateX, the plane's Y becomes the up axis)
        positions[i * 3 + 1] = data[dataIndex]
      }
    }

    geo.computeVertexNormals()
    return geo
  }, [])

  return (
    <mesh geometry={geometry} position={[0, -0.1, 0]} receiveShadow>
      <meshStandardMaterial
        color="#1a1a22"
        roughness={0.95}
        transparent
        opacity={0.6}
      />
    </mesh>
  )
}

export default Terrain
