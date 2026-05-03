import { useMemo } from 'react'
import * as THREE from 'three'
import terrainData from '../data/terrain.json'
import { terrainExag, patchTerrain } from '../utils/terrainShader'

function Terrain() {
  const geometry = useMemo(() => {
    const { width, height, bounds, data } = terrainData
    const spanX = bounds.maxX - bounds.minX
    const spanZ = bounds.maxZ - bounds.minZ

    const geo = new THREE.PlaneGeometry(spanX, spanZ, width - 1, height - 1)
    geo.rotateX(-Math.PI / 2)

    const positions = geo.attributes.position.array

    for (let i = 0; i < positions.length / 3; i++) {
      const row = Math.floor(i / width)
      const col = i % width
      const dataIndex = row * width + col
      if (dataIndex < data.length) {
        positions[i * 3 + 1] = data[dataIndex]
      }
    }

    geo.computeVertexNormals()
    return geo
  }, [])

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#2a2a26',
      roughness: 0.95,
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uExag = terrainExag

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nuniform float uExag;'
      )
      // Geometry already has raw elevation baked into Y — scale it
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.y *= uExag;`
      )
      // Scale normals to match Y exaggeration:
      // if surface y = k*h(x,z), normal ∝ (k*nx, ny, k*nz)
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        objectNormal = normalize(vec3(
          objectNormal.x * max(uExag, 0.01),
          objectNormal.y,
          objectNormal.z * max(uExag, 0.01)
        ));`
      )
    }
    mat.customProgramCacheKey = () => 'terrain-exag'
    return mat
  }, [])

  // Center mesh on data bounds (PlaneGeometry is centered at origin,
  // but terrain data covers an asymmetric region)
  const center = useMemo(() => {
    const { bounds } = terrainData
    return [(bounds.minX + bounds.maxX) / 2, -0.1, (bounds.minZ + bounds.maxZ) / 2]
  }, [])

  return (
    <mesh geometry={geometry} position={center} receiveShadow material={material} />
  )
}

export default Terrain
