import { useEffect } from 'react'
import { Building, Foundations, loadBuildingTextures } from '../components/LafayetteScene'
import toyBuildings from '../data/toy/toy-buildings.json'

/**
 * Toy scene buildings + foundations — thin wrapper around the real
 * Building / Foundations components.  Mounts the shared tileable textures
 * (idempotent) so toy houses render with brick/stone/wood the same way
 * neighborhood buildings do, then loops over the hand-authored fixture.
 *
 * Foundations are merged into one mesh, with year_built driving pedestal
 * height (1.2m pre-1900, 0.8m pre-1920, 0 otherwise).
 */
export default function ToyBuildings() {
  useEffect(() => { loadBuildingTextures() }, [])
  return (
    <group>
      <Foundations buildings={toyBuildings.buildings} />
      {toyBuildings.buildings.map(b => (
        <Building key={b.id} building={b} />
      ))}
    </group>
  )
}
