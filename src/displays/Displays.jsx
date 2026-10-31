/**
 * Displays: THE one mount for a town's displays (Jacob, 2026-10-30: a Stage section "Displays", its contents varying by
 * town; each display a PLUGIN, like an effect in After Effects; every town may add any). A town declares its displays
 * (`displays: [{ id, kind, attach, … }]` in its instance module, for now); this mounts each one's plugin where it
 * attaches. Mounted by the slot it attaches to: <SetPiece> mounts the set-piece's, in its base frame.
 * A town with no displays renders nothing and loads no plugin code (each plugin is a lazy chunk).
 * ⛔ A display of a kind with no plugin THROWS by name; so does an attach the mount does not serve. Each display renders
 * inside its own DisplayBoundary: one that fails at runtime is taken out alone and NAMED, the set-piece left standing.
 *
 * Where future plugins plug in: Fireworks attaches to a `point` (an authored launch point, mounted by <Town>);
 * Street Arches to a `streetSpan` (a place across a street, its width read from the street's authored width).
 */
import { lazy, Suspense } from 'react'
import DisplayBoundary from './DisplayBoundary.js'

export const PLUGINS = {
  'light-show': { label: 'Light Show', attaches: ['setPiece'], Renderer: lazy(() => import('./lightShow/LightShow.jsx')) },
}

export default function Displays({ town, lookId, attach, extent, calendar = null }) {
  const list = (town?.displays || []).filter(d => d.attach === attach)
  if (!list.length) return null
  return list.map(d => {
    const P = PLUGINS[d.kind]
    const where = `"${lookId}" display "${d.id}"`
    // Refusals are raised from a child INSIDE the display's boundary, so even these are contained and named.
    const refusal = !P ? `${where} is of kind "${d.kind}", and no plugin exists for it (have: ${Object.keys(PLUGINS).join(', ')})`
      : !P.attaches.includes(attach) ? `${where}: a ${P.label} cannot attach to a ${attach} (it attaches to: ${P.attaches.join(', ')})` : null
    return (
      <DisplayBoundary key={d.id} lookId={lookId} id={d.id}>
        {refusal ? <Refuse reason={refusal} /> : <Suspense fallback={null}><P.Renderer display={d} extent={extent} calendar={calendar} contentRoot={town.contentRoot} where={where} /></Suspense>}
      </DisplayBoundary>
    )
  })
}

function Refuse({ reason }) { throw new Error(`[Displays] ⛔ ${reason}`) }
