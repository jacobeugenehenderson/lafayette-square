import { useEffect } from 'react'
import { Building, Foundations, loadBuildingTextures } from '../components/LafayetteScene'
import NeonBands from '../components/NeonBands.jsx'
import toyBuildings from '../data/toy/toy-buildings.json'

/**
 * Toy scene buildings + foundations + neon bands — thin wrapper around the
 * real Building / Foundations components plus the new NeonBands runtime
 * overlay (HANDOFF-neon.md Path B). Buildings render without the legacy
 * per-Building NeonBand mount; the new shared-instanced NeonBands mesh
 * runs on top.
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
      <NeonBands places={toyBuildings.buildings} forceOn />
    </group>
  )
}
