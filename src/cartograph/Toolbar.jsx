import useCartographStore from './stores/useCartographStore.js'

const SHOTS = ['browse', 'hero', 'street']

function cap(s) { return s[0].toUpperCase() + s.slice(1) }

export default function Toolbar() {
  const tool = useCartographStore(s => s.tool)
  const shot = useCartographStore(s => s.shot)
  const scene = useCartographStore(s => s.scene)
  const setTool = useCartographStore(s => s.setTool)
  const setShot = useCartographStore(s => s.setShot)
  const setScene = useCartographStore(s => s.setScene)
  const fillsVisible = useCartographStore(s => s.fillsVisible)
  const toggleFills = useCartographStore(s => s.toggleFills)

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

          <ToggleButton label="Fills" active={fillsVisible} onClick={toggleFills} />
        </>
      ) : (
        <>
          <div className="carto-toolgroup">
            <button onClick={() => setShot('designer')}>← Designer</button>
          </div>
          <div className="carto-toolgroup">
            <button onClick={() => console.log('[publish] not wired yet')}>Publish</button>
          </div>
        </>
      )}

      <ToolGroup
        items={SHOTS.map(id => ({ id, label: cap(id) }))}
        active={inDesigner ? null : shot}
        onSelect={setShot}
      />

      <ToggleButton label="Toy"
        active={scene === 'toy'}
        onClick={() => setScene(scene === 'toy' ? 'neighborhood' : 'toy')} />
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
