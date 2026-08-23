/**
 * Arborist — species-asset library producer.
 *
 * Brief 18A (Mullion, 2026-05-23): the flat Library list retires. Salon is
 * now the default surface; ArboristApp's job collapses to (a) initialize
 * legacy-URL dev fallback on mount, (b) render exactly one workstage from
 * the mode-flag ladder, (c) hold no chrome of its own. Procedural / LiDAR /
 * legacy single-species Workstage remain reachable via `?legacy=…` URL
 * params during the 18A→18B transition; no UI hints them. Source-picker
 * merge into Salon's slot card is 18B.
 *
 *   - Salon: default. Compose chassis · bark · leaves; LookPicker + Grove
 *     → in its header strip.
 *   - Grove: destination — every rated variant across the library on one
 *     ground plane. Reached via Salon's Grove → button (or ?legacy=grove).
 *   - Procedural / LiDAR / Workstage: legacy authoring surfaces, reached
 *     via ?legacy= URL params only.
 *   - Full monte: `?view=fullmonte` — ONE specimen, at source resolution,
 *     wearing the Look's real atlas, swaying in the Look's real wind, lit by
 *     the Look's real sky. ⭐ It is the first view anywhere in the product that
 *     shows a FINISHED tree, which is exactly how a publish contract that
 *     paints leaves with bark shipped without anyone noticing
 *     (`arborist/BACKLOG.md`, 2026-08-22). The Salon's cyclorama answers "is
 *     this composition right"; this answers "is the thing we ship good".
 *     ⛔ It is the SAME component the marketing embed mounts
 *     (`components/TreeDiorama.jsx`) — one method, two mounts. A second
 *     implementation here would be a copy that drifts, and the drift would be
 *     invisible precisely because both look plausible.
 */
import { useEffect } from 'react'
import useArboristStore from './stores/useArboristStore.js'
import Workstage from './Workstage.jsx'
import Grove from './Grove.jsx'
import ProceduralWorkstage from './ProceduralWorkstage.jsx'
import LidarWorkstage from './LidarWorkstage.jsx'
import SalonWorkstage from './SalonWorkstage.jsx'
import ShelvesWorkstage from './ShelvesWorkstage.jsx'
import TreeDiorama from '../components/TreeDiorama.jsx'

export default function ArboristApp() {
  const activeSpeciesId = useArboristStore(s => s.activeSpeciesId)
  const groveOpen       = useArboristStore(s => s.groveOpen)
  const setGroveOpen    = useArboristStore(s => s.setGroveOpen)
  const proceduralOpen     = useArboristStore(s => s.proceduralOpen)
  const setProceduralOpen  = useArboristStore(s => s.setProceduralOpen)
  const lidarOpen          = useArboristStore(s => s.lidarOpen)
  const setLidarOpen       = useArboristStore(s => s.setLidarOpen)
  const shelvesOpen        = useArboristStore(s => s.shelvesOpen)
  const setShelvesOpen     = useArboristStore(s => s.setShelvesOpen)
  const loadSpecies     = useArboristStore(s => s.loadSpecies)
  const setActiveSpecies = useArboristStore(s => s.setActiveSpecies)
  const loadLooks       = useArboristStore(s => s.loadLooks)

  useEffect(() => { loadSpecies() }, [loadSpecies])
  useEffect(() => { loadLooks() }, [loadLooks])
  // When the Arborist window regains focus, refresh Looks so a Look
  // created in Cartograph in another tab shows up without a manual reload.
  useEffect(() => {
    const onFocus = () => loadLooks()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadLooks])

  // Brief 18A: dev-fallback URL params route to legacy workstages on mount.
  // No UI hints these; they exist so the operator doesn't lose access to
  // Procedural / LiDAR authoring during the 18A→18B transition.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const legacy = params.get('legacy')
    if (legacy === 'procedural') setProceduralOpen(true)
    else if (legacy === 'lidar') setLidarOpen(true)
    else if (legacy === 'grove') setGroveOpen(true)
    else if (legacy === 'shelves') setShelvesOpen(true)
    else if (legacy === 'workstage') {
      const sp = params.get('species')
      if (sp) setActiveSpecies(sp)
    }
  }, [setProceduralOpen, setLidarOpen, setGroveOpen, setShelvesOpen, setActiveSpecies])

  // `?view=fullmonte` — read from the URL directly rather than through a store
  // flag, because unlike the *Open flags this is not a mode the operator toggles
  // INTO and can get stranded in: it is a destination you link to. No stale
  // localStorage to wake up inside.
  let fullMonte = false
  try { fullMonte = new URLSearchParams(window.location.search).get('view') === 'fullmonte' } catch { fullMonte = false }
  if (fullMonte) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
        <TreeDiorama />
      </div>
    )
  }

  // Mode-route ladder. Salon is the default (always-true salonOpen flag)
  // and sits at the bottom; a legacy URL or stale localStorage *Open flag
  // wins precedence above it.
  if (lidarOpen) return <LidarWorkstage />
  if (proceduralOpen) return <ProceduralWorkstage />
  if (shelvesOpen) return <ShelvesWorkstage />
  if (groveOpen) return <Grove />
  if (activeSpeciesId) return <Workstage />
  return <SalonWorkstage />
}
