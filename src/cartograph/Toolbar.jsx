import { useEffect, useRef, useState } from 'react'
import useCartographStore from './stores/useCartographStore.js'

const SHOTS = ['browse', 'hero', 'street']

// Navigation graph mirroring LS production gestures: Hero ↔ Browse,
// Browse ↔ Street. There is no Hero ↔ Street edge — the end user can't
// reach Street directly from Hero (or vice versa) via any gesture, so
// the Stage shot-picker disables the non-adjacent button to keep
// authoring intent-faithful to production.
const SHOT_ADJACENCY = {
  hero:   new Set(['browse']),
  browse: new Set(['hero', 'street']),
  street: new Set(['browse']),
  // Designer is always reachable as a mode swap (handled elsewhere).
}
function shotEnabled(currentShot, candidateShot) {
  if (currentShot === candidateShot) return true
  const adj = SHOT_ADJACENCY[currentShot]
  return !adj || adj.has(candidateShot)
}
const DEFAULT_LOOK_ID = 'lafayette-square'

function cap(s) { return s[0].toUpperCase() + s.slice(1) }

export default function Toolbar() {
  const shot = useCartographStore(s => s.shot)
  const setShot = useCartographStore(s => s.setShot)
  const aerialVisible = useCartographStore(s => s.aerialVisible)
  const setAerialVisible = useCartographStore(s => s.setAerialVisible)
  const bakeRunning = useCartographStore(s => s.bakeRunning)
  const bakeStale = useCartographStore(s => s.bakeStale)
  const runBake = useCartographStore(s => s.runBake)
  const lastStageShot = useCartographStore(s => s.lastStageShot)

  const inDesigner = shot === 'designer'

  return (
    <div className="carto-toolbar carto-glass">
      {inDesigner ? (
        <>
          {/* Toolbar = views only. Authoring tool selection (Survey /
              Measure / Design) lives in the panel as a 3-part pill. */}
          {/* Aerial toggle. Off = SVG (curated cartograph) shows
              behind the ribbons; on = georeferenced aerial photo. */}
          <ToggleButton label="Aerial"
            active={aerialVisible}
            onClick={() => setAerialVisible(!aerialVisible)} />

          {/* Looks pulldown also surfaces the Toy scene as an option, so
              one consolidated context switcher replaces the old separate
              Toy button. */}
          <LooksMenu />
        </>
      ) : (
        <>
          <div className="carto-toolgroup">
            <button onClick={() => setShot('designer')}>← Designer</button>
          </div>
          <LooksMenu />
          <div className="carto-toolgroup">
            <button onClick={() => window.open('/preview', '_blank')}>Preview</button>
          </div>
        </>
      )}

      {/* Designer's "Stage" button is pure navigation — the operator
          enters Stage to do look-authoring work. Bake is a Stage-level
          action, not a Designer-level action. See FEATURES.md
          "Bake button belongs in Stage's toolbar." */}
      {inDesigner ? (
        <div className="carto-toolgroup">
          <button
            className="carto-stage-btn"
            disabled={bakeRunning}
            onClick={(e) => {
              // Navigation is tied to the bake's success path inside
              // runBake itself (navigateTo param), not chained via .then —
              // .then closures got stranded across HMR re-renders, which
              // left the operator in Designer after long bakes.
              //
              // Return to whichever Stage shot the operator was last in
              // (lastStageShot, persisted in localStorage). Workflow:
              // jumping back and forth between Designer and Stage to
              // examine a slab should land on the same shot each time,
              // not snap to a fixed default.
              runBake({ force: e.altKey, navigateTo: lastStageShot })
            }}
            title={bakeRunning
              ? 'Baking…'
              : `Bake + enter Stage at ${cap(lastStageShot)} (your last Stage shot). ⌥-click forces full rebuild. Use Stage's ↻ to re-bake without navigating.`}>
            {bakeRunning ? 'Baking…' : 'Stage →'}
          </button>
        </div>
      ) : (
        <>
          <ToolGroup
            items={SHOTS.map(id => ({
              id,
              label: cap(id),
              disabled: !shotEnabled(shot, id),
            }))}
            active={shot}
            onSelect={setShot}
          />
          {/* Stage's Bake button — always runs the incremental bake chain
              on click. No gating: clicking is always a legitimate "pour
              me a fresh slab now." ⌥/Alt-click forces a full rebuild
              (bypasses the dirty-check; the cache-bust escape hatch).
              The stale indicator ("●") lights when authoring edits exist
              but never disables the action. */}
          <div className="carto-toolgroup">
            <button
              className={`carto-bake-btn${bakeStale ? ' stale' : ''}${bakeRunning ? ' running' : ''}`}
              disabled={bakeRunning}
              onClick={(e) => runBake({ force: e.altKey })}
              title={bakeRunning
                ? 'Baking…'
                : (bakeStale
                  ? 'Re-bake — pour a fresh slab. Authoring edits exist since last bake. ⌥-click forces full rebuild.'
                  : 'Re-bake — pour a fresh slab. ⌥-click forces full rebuild.')}
              aria-label={bakeRunning ? 'Baking' : 'Re-bake'}>
              {/* Circle-arrow icon. Spins via CSS when bakeRunning. The
                  stale dot is a CSS pseudo-element — see .carto-bake-btn.stale. */}
              <span className="carto-bake-icon" aria-hidden="true">↻</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Looks pulldown — switch active Look and create new ones from the current
 * working draft. The default Look (lafayette-square) is the project's 0-state
 * and can't be deleted.
 */
function LooksMenu() {
  const looks = useCartographStore(s => s.looks)
  const activeLookId = useCartographStore(s => s.activeLookId)
  const setActiveLook = useCartographStore(s => s.setActiveLook)
  const createLook = useCartographStore(s => s.createLook)
  const deleteActiveLook = useCartographStore(s => s.deleteActiveLook)

  // Custom dropdown — a <button> + absolute-positioned popup, NOT a native
  // <select>. The native control's macOS UA stylesheet renders taller than
  // its <button> peers in the toolgroup; piecemeal CSS overrides (font
  // sub-properties, explicit height, padding-block) didn't fully neutralize
  // it. Using the same <button> chrome as every other toolbar item keeps
  // sizing identical by construction.
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const activeEntry = (looks || []).find(l => l.id === activeLookId)
  const label = activeEntry?.name || 'Lafayette Square'

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (id) => { setOpen(false); if (id !== activeLookId) setActiveLook(id) }
  const onNew = () => {
    setOpen(false)
    // Fork the current working draft into a new named Look. The Stage
    // transition silently re-bakes the active Look from autosaved state,
    // so the only thing we ask the user to *name* is the new fork.
    const name = window.prompt('Name this Look (e.g. "Valentines", "Cardinals Win")')
    if (name && name.trim()) createLook(name.trim())
  }
  const onDelete = () => {
    setOpen(false)
    if (window.confirm('Delete this Look? The default cannot be deleted.')) {
      deleteActiveLook()
    }
  }

  return (
    <div className="carto-toolgroup carto-looks-menu" ref={wrapRef}>
      <button
        type="button"
        className={`carto-looks-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Active Look — switch, save as new, or delete"
        onClick={() => setOpen(o => !o)}
      >
        <span className="carto-looks-label">{label}</span>
        <span className="carto-looks-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="carto-looks-popup carto-glass" role="listbox">
          {(looks || []).map(l => (
            <button
              key={l.id}
              type="button"
              role="option"
              aria-selected={l.id === activeLookId}
              className={`carto-looks-option${l.id === activeLookId ? ' is-active' : ''}`}
              onClick={() => pick(l.id)}
            >
              {l.name}
            </button>
          ))}
          <div className="carto-looks-sep" />
          <button type="button" className="carto-looks-option" onClick={onNew}>
            ＋ Save as new Look…
          </button>
          {activeLookId && activeLookId !== DEFAULT_LOOK_ID && (
            <button type="button" className="carto-looks-option carto-looks-danger" onClick={onDelete}>
              🗑 Delete this Look
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Segmented-control group (multiple choice / radio-style).
 *   items=[{id,label}], active=<id>, onSelect=(id)=>...
 */
function ToolGroup({ items, active, onSelect }) {
  return (
    <div className="carto-toolgroup">
      {items.map(item => (
        <button
          key={item.id}
          className={active === item.id ? 'is-active' : ''}
          disabled={!!item.disabled}
          onClick={() => onSelect(item.id)}
          title={item.disabled ? 'Not reachable from the current shot in production' : undefined}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Single-button binary toggle. Pill is "pressed" when active. Same visual
 * treatment as a one-item ToolGroup — uniform with the rest of the toolbar.
 */
function ToggleButton({ label, active, onClick }) {
  return (
    <div className="carto-toolgroup">
      <button className={active ? 'is-active' : ''} onClick={onClick}>{label}</button>
    </div>
  )
}
