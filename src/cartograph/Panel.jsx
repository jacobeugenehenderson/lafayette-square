/**
 * Designer Panel — the tool surface.
 *
 * Per the three-tool architecture (ARCHITECTURE §2.1): the Designer panel is
 * just the tool selector + the active tool's controls. Survey authors the
 * hardscape SHAPE; Measure (→ Section) authors the ped profile; "Design" is the
 * no-tool resting state.
 *
 * The old layer-visibility + styling sections (Streets / Blocks / Paths / Land
 * Cover / Furniture / Labels) were "design/look" concerns — visibility, colors,
 * materials, labels — which belong to **Stage**, not the geometry Designer. They
 * were removed from this panel (2026-06-02). `layerVis` still exists in the store
 * (defaults to all-visible) and is authored from Stage.
 *
 * NOTE: the curb-width + alley-cap shape controls lived inside those sections and
 * came out with them. Curb width returns as a Section cosmetic material lip
 * (per the Survey/Section split); until then it holds at its stored default.
 */
import useCartographStore from './stores/useCartographStore.js'
import SurveyorPanel from './SurveyorPanel.jsx'
import MeasurePanel from './MeasurePanel.jsx'

// Tool pill at the top of the panel — Survey | Measure | Design. The pill IS
// the tool selector. "Design" = no tool active = resting state.
function ToolPill() {
  const tool = useCartographStore(s => s.tool)
  const setTool = useCartographStore(s => s.setTool)
  const items = [
    { id: 'surveyor', label: 'Survey' },
    { id: 'measure',  label: 'Measure' },
    { id: 'design',   label: 'Design' },
  ]
  const activeId = tool === 'surveyor' ? 'surveyor'
                 : tool === 'measure'  ? 'measure'
                 : 'design'
  const onPick = (id) => {
    const target = id === 'design' ? null : id
    if (tool === target) return  // pill is no-op when clicking the active option
    setTool(target)
  }
  return (
    <div className="carto-toolgroup carto-panel-toolpill">
      {items.map(item => (
        <button
          key={item.id}
          className={activeId === item.id ? 'is-active' : ''}
          onClick={() => onPick(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export default function Panel() {
  const tool = useCartographStore(s => s.tool)
  return (
    <div className="carto-panel">
      <ToolPill />
      {tool === 'surveyor' && <SurveyorPanel />}
      {tool === 'measure' && <MeasurePanel />}
    </div>
  )
}
