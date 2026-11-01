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
import { Refusal, Transient } from '../lib/refusal.js'
import { useSceneJson, sceneReadFailure } from '../lib/useSceneJson.js'

export const PLUGINS = {
  'light-show': { label: 'Light Show', attaches: ['setPiece'], Renderer: lazy(() => import('./lightShow/LightShow.jsx')) },
}

/**
 * `calendar` is the town's PUBLISHED calendar, from the app (src/hooks/useTownCalendar.js, through <Town calendar> and
 * <SetPiece>): null not read yet (off) · rows · { absent } · { error }. ⛔ REQUIRED: an app that passes none (undefined), a
 * town that publishes none while a display names a season, and a calendar that could not be read are each REFUSED by
 * name, inside the display's boundary, so a display that could never go live cannot ship silently.
 * Each display is lit by its Look's own channel (./showChannel.js), as the scene bake carried it (scene.json#displays):
 * nothing mounts until the scene is read; a scene that could not be read (useSceneJson.js#sceneReadFailure) is refused by
 * name, keeping its kind (a Transient for the network), and so is a scene that carries no channel for a display (re-bake).
 */
export default function Displays({ town, lookId, attach, extent, dim, calendar, drawerSource }) {
  const scene = useSceneJson(lookId), failed = scene ? null : sceneReadFailure(lookId)
  const list = (town?.displays || []).filter(d => d.attach === attach)
  if (!list.length || (!scene && !failed)) return null
  return list.map(d => {
    const P = PLUGINS[d.kind]
    const where = `"${lookId}" display "${d.id}"`
    // Refusals are raised from a child INSIDE the display's boundary, so even these are contained and named.
    const refusal = !P ? `${where} is of kind "${d.kind}", and no plugin exists for it (have: ${Object.keys(PLUGINS).join(', ')})`
      : !P.attaches.includes(attach) ? `${where}: a ${P.label} cannot attach to a ${attach} (it attaches to: ${P.attaches.join(', ')})`
      : calendar === undefined ? `${where}: the app passes no calendar to <Town>, so the display's season can never be read`
      : calendar?.error ? `${where}: the town's calendar could not be read: ${calendar.error}`
      : calendar?.absent && d.season ? `${where}: the town publishes no calendar (content/events.json), so its season "${d.season}" can never start`
      : drawerSource !== 'authoring' && drawerSource !== 'published' ? `${where}: the app names no drawer source to <Town> (displaySource: 'authoring' in Stage, 'published' in Preview and the player)`
      : failed ? failed
      : !scene.displays?.[d.id] ? `${where}: the Look's scene.json carries no channel for it (baked before displays had one): re-bake the Look's scene`
      : null
    return (
      <DisplayBoundary key={d.id} lookId={lookId} id={d.id}>
        {refusal ? <Refuse reason={refusal} /> : <Suspense fallback={null}><P.Renderer display={d} channel={scene.displays[d.id]} extent={extent} calendar={Array.isArray(calendar) ? calendar : null} contentRoot={town.contentRoot} lookId={lookId} drawerSource={drawerSource} dim={dim} where={where} /></Suspense>}
      </DisplayBoundary>
    )
  })
}

function Refuse({ reason }) {
  if (reason instanceof Transient) throw new Transient(`[Displays] ⛔ the Look's scene.json: ${reason.message}`)
  if (reason instanceof Refusal) throw new Refusal(`[Displays] ⛔ the Look's scene.json: ${reason.message}`)
  throw new Refusal(`[Displays] ⛔ ${reason}`)
}
