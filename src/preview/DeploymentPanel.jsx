/**
 * DeploymentPanel — Preview's DEPLOYMENT layer: what the selected surface ships, authored here, autosaved to the
 * town's `cartograph/data/<map>/deployment.json` (src/lib/deployment.js), frozen into `manifest.deployment` and shipped by
 * the next Publish (it is ACCEPTED at Publish: Jacob, 2026-10-04). "When I click Phone hi, I can adjust the relevant controls, and where I leave them is where they bake" (Jacob,
 * 2026-10-04). No try, no commit: where the controls are left is the policy.
 *
 * ⛔⛔ NOT AN INSPECTION TOGGLE. Preview's mute/solo (the Scene / Post-FX rows, `preview.layers.v3`) is temporary and
 * never reaches this file; this panel never reads or writes that store. The two look plainly different: this one is
 * framed in the warning colour and says "ships". ▶ node checks/claims-deployment-has-one-authority.mjs
 *
 * Levers: only those that exist at runtime. v1 is which post-effects a surface runs (renderPipeline.jsx#POSTFX_PIPELINE).
 * A pass that is a resource for others (`dependsOn`, the pyramid) is not a switch: it ships while anything it serves ships.
 */
import { useEffect, useRef, useState } from 'react'
import { POSTFX_PIPELINE } from '../components/renderPipeline.jsx'
import { SURFACES, RUNTIME_PHONE_SURFACE } from '../lib/deployment.js'

const SAVE_DEBOUNCE_MS = 600
const api = (map) => `/api/cartograph/maps/${encodeURIComponent(map)}/deployment`

// The switches: passes that are not a resource for others. A resource follows the passes it serves.
const SWITCHES = POSTFX_PIPELINE.filter((e) => !e.dependsOn).map((e) => e.id)
const RESOURCES = POSTFX_PIPELINE.filter((e) => e.dependsOn)
function withResources(off) {
  const next = off.filter((id) => SWITCHES.includes(id))
  for (const r of RESOURCES) if (r.dependsOn.every((d) => next.includes(d))) next.push(r.id)
  return next
}

/** Loads the town's deployment, and keeps the caller's live copy (what Preview renders through) in step with edits. */
export function useDeployment(map) {
  // `shipped`: does staging's manifest carry this file (true · false · null = could not be read)? Read on load; an edit makes it false.
  const [state, setState] = useState({ file: undefined, shipped: undefined, error: null, saving: false })
  useEffect(() => {
    let live = true
    fetch(api(map)).then(async (r) => {
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      if (live) setState({ file: j.file, shipped: j.shipped, error: null, saving: false })
    }).catch((e) => { if (live) setState((s) => ({ ...s, error: `could not read the deployment: ${e.message}` })) })
    return () => { live = false }
  }, [map])
  return [state, setState]
}

/** The deployment Preview renders through: the file as edited, `{ authored: false }` when the town has none. */
export function liveDeployment(state) {
  if (state.file === undefined) return undefined
  return state.file ? { authored: true, surfaces: state.file.surfaces } : { authored: false }
}

export default function DeploymentPanel({ map, surface, state, setState, labels }) {
  const timer = useRef(null)
  const [open, setOpen] = useState(true)
  if (state.error) return <div className="profiler-panel" style={{ borderColor: 'var(--error)' }}>⛔ {state.error}</div>
  if (state.file === undefined) return null
  const surfaces = state.file?.surfaces || {}
  const off = surfaces[surface]?.postFxOff ?? []

  const save = (file) => {
    setState((s) => ({ ...s, file, shipped: false, saving: true }))
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(api(map), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(file) })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        setState((s) => ({ ...s, saving: false, error: null }))
      } catch (e) { setState((s) => ({ ...s, saving: false, error: `the deployment did not save: ${e.message}` })) }
    }, SAVE_DEBOUNCE_MS)
  }
  const setShips = (id, ships) => {
    const nextOff = withResources(ships ? off.filter((x) => x !== id) : [...off, id])
    const nextSurfaces = { ...Object.fromEntries(SURFACES.map((s) => [s, surfaces[s] || { postFxOff: [] }])), [surface]: { postFxOff: nextOff } }
    save({ surfaces: nextSurfaces })
  }

  return (
    <div className="profiler-panel" style={{ borderColor: 'var(--warning, #f5a623)' }}>
      <button onClick={() => setOpen(!open)} className="section-heading" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left', color: 'var(--warning, #f5a623)' }}>
        {open ? '▾' : '▸'} deployment · {surface} · ships to visitors
      </button>
      {open && <>
        <div className="profiler-note" style={{ margin: '4px 0 6px' }}>
          Where you leave these is what {surface} ships: autosaved to deployment.json, accepted at the next Publish.
          {' '}{state.saving ? 'saving…' : state.shipped === true ? 'on staging.' : state.shipped === null ? 'saved · staging could not be read.' : 'saved · ships at the next Publish.'}
          {surface !== RUNTIME_PHONE_SURFACE && surface !== 'desktop' ? ` ⚠️ Every phone runs ${RUNTIME_PHONE_SURFACE} until phones can be told apart: this is stored, not yet shipped.` : ''}
          {!state.file ? ' This town has no deployment.json: every surface ships everything until you change one.' : ''}
        </div>
        {SWITCHES.map((id) => (
          <label key={id} className="profiler-row" style={{ gap: 8, cursor: 'pointer', alignItems: 'center' }}>
            <input type="checkbox" checked={!off.includes(id)} onChange={(e) => setShips(id, e.target.checked)} />
            <span style={{ flex: 1 }}>{labels[id] || id}</span>
            <span className="profiler-sub">{off.includes(id) ? 'not shipped' : 'ships'}</span>
          </label>
        ))}
        <div className="profiler-note" style={{ marginTop: 4 }}>
          {RESOURCES.map((r) => `${r.id} ships while ${r.dependsOn.join(' or ')} does`).join(' · ')}
        </div>
      </>}
    </div>
  )
}
