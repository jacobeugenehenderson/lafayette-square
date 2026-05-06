import useCartographStore from './stores/useCartographStore.js'

const SHOTS = ['browse', 'hero', 'street']
const DEFAULT_LOOK_ID = 'lafayette-square'

function cap(s) { return s[0].toUpperCase() + s.slice(1) }

export default function Toolbar() {
  const tool = useCartographStore(s => s.tool)
  const shot = useCartographStore(s => s.shot)
  const scene = useCartographStore(s => s.scene)
  const setTool = useCartographStore(s => s.setTool)
  const setShot = useCartographStore(s => s.setShot)
  const setScene = useCartographStore(s => s.setScene)
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
          <ToolGroup
            items={[
              { id: 'surveyor', label: 'Survey' },
              { id: 'measure', label: 'Measure' },
            ]}
            active={tool}
            onSelect={setTool}
          />

          {/* Aerial toggle. Off = SVG (curated cartograph) shows
              behind the ribbons; on = georeferenced aerial photo.
              Tools (Survey/Measure) and pure Design both render on
              top of whichever background is selected. */}
          <ToggleButton label="Aerial"
            active={aerialVisible}
            onClick={() => setAerialVisible(!aerialVisible)} />

          {/* Toy fixture toggle in Designer too — exposes the corner-case
              test grid in src/data/toy/toy-ribbons.json so the plug system
              can be debugged against a known fixture. CartographApp already
              swaps `ribbons` + skips boundary clipping when scene==='toy';
              this just makes the toggle reachable from Designer. */}
          <ToggleButton label="Toy"
            active={scene === 'toy'}
            onClick={() => setScene(scene === 'toy' ? 'neighborhood' : 'toy')} />
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
              runBake({ force: e.altKey, navigateTo: 'browse' })
            }}
            title={bakeRunning
              ? 'Baking…'
              : 'Bake + enter Stage at Browse (overhead, matches Designer). ⌥-click forces full rebuild. Use Stage\'s ↻ to re-bake without navigating.'}>
            {bakeRunning ? 'Baking…' : 'Stage →'}
          </button>
        </div>
      ) : (
        <>
          <ToolGroup
            items={SHOTS.map(id => ({ id, label: cap(id) }))}
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
          <ToggleButton label="Toy"
            active={scene === 'toy'}
            onClick={() => setScene(scene === 'toy' ? 'neighborhood' : 'toy')} />
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

  const onChange = (e) => {
    const v = e.target.value
    if (v === '__new__') {
      // Fork the current working draft into a new named Look. This is the
      // deliberate save-as action — the Stage transition itself silently
      // re-bakes the active Look from autosaved state, so the only thing
      // the user is asked to *name* is the new fork.
      const name = window.prompt('Name this Look (e.g. "Valentines", "Cardinals Win")')
      if (name && name.trim()) createLook(name.trim())
    } else if (v === '__delete__') {
      if (window.confirm('Delete this Look? The default cannot be deleted.')) {
        deleteActiveLook()
      }
    } else if (v && v !== activeLookId) {
      setActiveLook(v)
    }
  }

  return (
    <div className="carto-toolgroup">
      <select
        className="carto-looks-select"
        value={activeLookId || DEFAULT_LOOK_ID}
        onChange={onChange}
        title="Active Look — switch, save as new, or delete"
      >
        {(looks || []).map(l => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
        <option disabled>──────────</option>
        <option value="__new__">＋ Save as new Look…</option>
        {activeLookId && activeLookId !== DEFAULT_LOOK_ID && (
          <option value="__delete__">🗑 Delete this Look</option>
        )}
      </select>
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
          onClick={() => onSelect(item.id)}
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
