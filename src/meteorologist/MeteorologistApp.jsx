/**
 * Meteorologist — weather authoring app (Phase 1 scaffold).
 *
 * Top bar: app name, TEAPOT | CONDITIONS mode toggle, Look picker.
 * Body: whichever library matches the active mode. Click a row → console.log.
 * Workstage / Condition editor land in Phases 2–3.
 */
import { useEffect } from 'react'
import useMeteorologistStore from './stores/useMeteorologistStore.js'
import TeapotLibrary from './TeapotLibrary.jsx'
import ConditionsLibrary from './ConditionsLibrary.jsx'
import Teacup from './Teacup.jsx'
import ConditionEditor from './ConditionEditor.jsx'

export default function MeteorologistApp() {
  const mode             = useMeteorologistStore(s => s.mode)
  const setMode          = useMeteorologistStore(s => s.setMode)
  const loadPresets      = useMeteorologistStore(s => s.loadPresets)
  const loadConditions   = useMeteorologistStore(s => s.loadConditions)
  const loadLooks        = useMeteorologistStore(s => s.loadLooks)
  const activePresetId   = useMeteorologistStore(s => s.activePresetId)
  const activeConditionId = useMeteorologistStore(s => s.activeConditionId)

  useEffect(() => { loadPresets() }, [loadPresets])
  useEffect(() => { loadConditions() }, [loadConditions])
  useEffect(() => { loadLooks() }, [loadLooks])
  useEffect(() => {
    const onFocus = () => loadLooks()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadLooks])

  // When a library row is clicked the matching workstage mounts. The top
  // bar is hidden inside the workstage — header context shifts to a ←
  // back button + the named-unit pulldown.
  if (mode === 'teapot' && activePresetId) {
    return <Teacup />
  }
  if (mode === 'conditions' && activeConditionId) {
    return <ConditionEditor />
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, color: '#ddd',
      fontFamily: '-apple-system, sans-serif', fontSize: 13,
      display: 'flex', flexDirection: 'column',
      background: '#111',
    }}>
      <header style={{
        padding: '14px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <strong style={{
          letterSpacing: '0.15em', textTransform: 'uppercase',
          fontSize: 12, color: '#fff',
        }}>Meteorologist</strong>

        <span style={{ marginLeft: 16, display: 'flex', gap: 4 }}>
          <ModePill label="Teapot"     active={mode === 'teapot'}     onClick={() => setMode('teapot')} />
          <ModePill label="Conditions" active={mode === 'conditions'} onClick={() => setMode('conditions')} />
        </span>

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <LookPicker />
        </span>
      </header>

      {mode === 'teapot' ? <TeapotLibrary /> : <ConditionsLibrary />}
    </div>
  )
}

function ModePill({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
        border: '1px solid ' + (active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'),
        color: active ? '#fff' : '#aaa',
        padding: '5px 14px', borderRadius: 4,
        fontFamily: 'inherit', fontSize: 12,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        cursor: 'pointer',
      }}>
      {label}
    </button>
  )
}

// ── Look picker ───────────────────────────────────────────────────────
// Mirrors Arborist's LookPicker verbatim — reads /api/cartograph/looks.
function LookPicker() {
  const looks         = useMeteorologistStore(s => s.looks)
  const activeLookId  = useMeteorologistStore(s => s.activeLookId)
  const defaultLookId = useMeteorologistStore(s => s.defaultLookId)
  const looksError    = useMeteorologistStore(s => s.looksError)
  const setActiveLook = useMeteorologistStore(s => s.setActiveLook)
  const createLook    = useMeteorologistStore(s => s.createLook)

  const active = looks.find(l => l.id === activeLookId)

  const onChange = async (e) => {
    const v = e.target.value
    if (v === '__new__') {
      const name = window.prompt('New Look name')
      if (!name) return
      await createLook(name)
      return
    }
    setActiveLook(v)
  }

  if (looksError) {
    return (
      <span style={{ color: '#f88', fontSize: 11 }} title={looksError}>
        Looks unreachable
      </span>
    )
  }

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#888' }}>
      <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Look</span>
      <select
        value={activeLookId || ''}
        onChange={onChange}
        title={active ? `Backdrop: ${active.name}` : 'Pick a Look for the sky backdrop'}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#ddd',
          padding: '4px 8px', borderRadius: 4,
          fontFamily: 'inherit', fontSize: 12,
          minWidth: 160,
        }}
      >
        {looks.length === 0 && <option value="">(no looks)</option>}
        {looks.map(l => (
          <option key={l.id} value={l.id}>
            {l.name}{l.id === defaultLookId ? ' ★' : ''}
          </option>
        ))}
        <option disabled>──────────</option>
        <option value="__new__">+ New Look…</option>
      </select>
    </label>
  )
}
