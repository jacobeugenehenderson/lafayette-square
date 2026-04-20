import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Toy scene terrain — a flat 400×400m plane sitting just below the ribbons.
 *
 * Hills were tried and removed: the toy ribbons + buildings + lamps don't
 * follow this mesh's displacement (the global terrainShader uniforms are
 * wired to the neighborhood elevation map and swapping them safely is its
 * own task — see backlog).  Until that integration lands, hills under flat
 * houses just looked wrong, so we render flat ground beyond the ribbon
 * footprint and call it done.
 */
export default function ToyTerrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(400, 400, 1, 1)
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [])

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#5d6748',
    roughness: 0.95,
  }), [])

  return <mesh geometry={geometry} material={material} position={[0, -0.05, 0]} receiveShadow renderOrder={-1} />
}
