/**
 * Displays: THE one mount for a town's displays (Jacob, 2026-10-30: a Stage section "Displays", its contents varying by
 * town; each display a PLUGIN, like an effect in After Effects; every town may add any). A town declares its displays
 * (`displays: [{ id, kind, attach, … }]` in its instance module, for now); this mounts each one's plugin where it
 * attaches. Mounted by the slot it attaches to: <SetPiece> mounts the set-piece's, in its base frame.
 * A town with no displays renders nothing and loads no plugin code (each plugin is a lazy chunk).
 * ⛔ A display of a kind with no plugin THROWS by name; so does an attach the mount does not serve.
 *
 * Where future plugins plug in: Fireworks attaches to a `point` (an authored launch point, mounted by <Town>);
 * Street Arches to a `streetSpan` (a place across a street, its width read from the street's authored width).
 */
import { lazy, Suspense } from 'react'

export const PLUGINS = {
  'light-show': { label: 'Light Show', attaches: ['setPiece'], Renderer: lazy(() => import('./lightShow/LightShow.jsx')) },
}

export default function Displays({ town, lookId, attach, extent, calendar = null }) {
  const list = (town?.displays || []).filter(d => d.attach === attach)
  if (!list.length) return null
  return list.map(d => {
    const P = PLUGINS[d.kind]
    const where = `"${lookId}" display "${d.id}"`
    if (!P) throw new Error(`[Displays] ⛔ ${where} is of kind "${d.kind}", and no plugin exists for it (have: ${Object.keys(PLUGINS).join(', ')})`)
    if (!P.attaches.includes(attach)) throw new Error(`[Displays] ⛔ ${where}: a ${P.label} cannot attach to a ${attach} (it attaches to: ${P.attaches.join(', ')})`)
    return <Suspense key={d.id} fallback={null}><P.Renderer display={d} extent={extent} calendar={calendar} where={where} /></Suspense>
  })
}
