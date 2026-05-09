import { useState, useEffect } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import { defaultMeasure, CURB_WIDTH, BAND_COLORS } from './streetProfiles.js'
import ribbonsRaw from '../data/ribbons.json'

const FT_PER_M = 3.28084
const M_PER_FT = 0.3048
const fmtFt = (m) => (m * FT_PER_M).toFixed(1)

const PIPELINE_MEASURE = (() => {
  const m = new Map()
  for (const st of (ribbonsRaw.streets || [])) {
    if (st.name && st.measure) m.set(st.name, st.measure)
  }
  return m
})()

function chainMeasure(st) {
  if (st.measure) return st.measure
  const fromPipeline = PIPELINE_MEASURE.get(st.name)
  if (fromPipeline) {
    return {
      left: { ...fromPipeline.left },
      right: { ...fromPipeline.right },
      symmetric: fromPipeline.left.terminal === fromPipeline.right.terminal
        && Math.abs(fromPipeline.left.treelawn - fromPipeline.right.treelawn) < 0.01
        && Math.abs(fromPipeline.left.sidewalk - fromPipeline.right.sidewalk) < 0.01,
    }
  }
  return defaultMeasure(st.type || 'residential')
}

// Effective per-side measure for a segment in the V2 model:
// blockCustoms[chainIdx][segOrd][side] wins over chain.measure[side].
// Symmetric flag rides on chain.measure (per-side blockCustoms inherit it).
function effectiveMeasure(st, chainIdx, segOrd, blockCustoms) {
  const chain = chainMeasure(st)
  const customs = blockCustoms?.[chainIdx]?.[segOrd]
  return {
    left:  customs?.left  || chain.left,
    right: customs?.right || chain.right,
    symmetric: chain.symmetric !== false,
  }
}

// Infer terminal from numeric values so the operator never has to set it.
//   treelawn > 0 → 'sidewalk' (asphalt + curb + treelawn + sidewalk band)
//   only sidewalk → 'lawn'    (asphalt + curb + sidewalk band, no treelawn)
//   nothing → 'none'          (asphalt + curb, no ped zone)
function inferTerminal(side) {
  const tl = side.treelawn || 0
  const sw = side.sidewalk || 0
  if (tl > 0.01) return 'sidewalk'
  if (sw > 0.01) return 'lawn'
  return 'none'
}

// One editable numeric row. Local state for typing; commit on blur or Enter.
// Empty/non-numeric reverts to the previous value.
function NumberRow({ label, swatch, valueM, onCommit, readOnly }) {
  const [text, setText] = useState(fmtFt(valueM))
  // Re-sync external changes (e.g. a drag handle moves) into the input.
  useEffect(() => { setText(fmtFt(valueM)) }, [valueM])

  const commit = () => {
    const parsed = parseFloat(text)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setText(fmtFt(valueM)); return
    }
    const meters = parsed * M_PER_FT
    if (Math.abs(meters - valueM) < 0.001) {
      setText(fmtFt(valueM)); return
    }
    onCommit(meters)
  }

  return (
    <div className="carto-row carto-band-row">
      <span className="carto-band-swatch"
        style={{ '--swatch': swatch || '#888' }} />
      <label className="carto-label">{label}</label>
      {readOnly ? (
        <span className="carto-band-width">{text}</span>
      ) : (
        <input
          type="text"
          className="carto-band-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
        />
      )}
      <span className="carto-band-unit">ft</span>
    </div>
  )
}

function SideBlock({ sideKey, side, onChange, single }) {
  const cw = Number.isFinite(side.curb) ? side.curb : CURB_WIDTH
  const set = (patch) => {
    const next = { ...side, ...patch }
    next.terminal = inferTerminal(next)
    onChange(next)
  }

  return (
    <div className="carto-side-block">
      {!single && (
        <div className="carto-side-label">
          {sideKey === 'left' ? 'Left' : 'Right'}
        </div>
      )}
      <NumberRow label="Asphalt" swatch={BAND_COLORS.asphalt}
        valueM={side.pavementHW || 0}
        onCommit={v => set({ pavementHW: v })} />
      <NumberRow label="Curb" swatch={BAND_COLORS.curb}
        valueM={cw}
        onCommit={v => set({ curb: v })} />
      <NumberRow label="Treelawn" swatch={BAND_COLORS.treelawn}
        valueM={side.treelawn || 0}
        onCommit={v => set({ treelawn: v })} />
      <NumberRow label="Sidewalk" swatch={BAND_COLORS.sidewalk}
        valueM={side.sidewalk || 0}
        onCommit={v => set({ sidewalk: v })} />
    </div>
  )
}

export default function MeasurePanel() {
  const selectedStreet     = useCartographStore(s => s.selectedStreet)
  const selectedOrdinal    = useCartographStore(s => s.selectedSegmentOrdinal)
  const centerlineData     = useCartographStore(s => s.centerlineData)
  const blockCustoms       = useCartographStore(s => s.blockCustoms)
  const measureMode        = useCartographStore(s => s.measureMode)
  const setStreetMeasure   = useCartographStore(s => s.setStreetMeasure)
  const setBlockCustom     = useCartographStore(s => s.setBlockCustomMeasure)
  const clearCustomsForChain = useCartographStore(s => s.clearBlockCustomsForChain)
  const setStreetDisabled  = useCartographStore(s => s.setStreetDisabled)

  if (selectedStreet === null) {
    return (
      <div className="carto-section">
        <h2>Cross-Section</h2>
      </div>
    )
  }

  const st = centerlineData.streets[selectedStreet]
  if (!st) return null

  const ordinal = Number.isFinite(selectedOrdinal) && selectedOrdinal >= 0 ? selectedOrdinal : 0
  const isWholeChain = measureMode?.type === 'global'

  const measure = effectiveMeasure(st, selectedStreet, ordinal, blockCustoms)
  const symmetric = measure.symmetric !== false
  const hasCustom = !!(blockCustoms?.[selectedStreet]?.[ordinal])

  // Persist a side's new measure. Whole-chain mode targets chain.measure
  // (every segment without a custom inherits it). Per-block mode writes
  // blockCustoms[chainIdx][segOrd][side] so only this segment shifts.
  // Symmetric mirrors the value to the other side in the same write.
  function updateSide(sideKey, newSide) {
    if (isWholeChain) {
      setStreetMeasure(selectedStreet, m => {
        m[sideKey] = newSide
        if (symmetric) {
          const other = sideKey === 'left' ? 'right' : 'left'
          m[other] = { ...newSide }
        }
      }, chainMeasure(st))
    } else {
      setBlockCustom(selectedStreet, ordinal, sideKey, newSide)
      if (symmetric) {
        const other = sideKey === 'left' ? 'right' : 'left'
        setBlockCustom(selectedStreet, ordinal, other, { ...newSide })
      }
    }
  }

  function toggleAsymmetric() {
    // Symmetric flag is a chain-level property; always write to chain.measure.
    setStreetMeasure(selectedStreet, m => { m.symmetric = !symmetric }, chainMeasure(st))
  }

  function resetToDefault() {
    // Per-block reset: drop the custom for THIS (chain, segment), leaving
    // chain.measure as the visible value. Whole-chain reset wipes every
    // custom on the chain (matches the "Edit whole chain" toggle's wipe).
    if (isWholeChain) {
      clearCustomsForChain(selectedStreet)
    } else {
      const cur = blockCustoms?.[selectedStreet]
      if (!cur) return
      const next = { ...cur }
      delete next[ordinal]
      const all = { ...(blockCustoms || {}) }
      if (Object.keys(next).length === 0) delete all[selectedStreet]
      else all[selectedStreet] = next
      useCartographStore.setState({ blockCustoms: all })
      useCartographStore.getState()._saveDesignDebounced?.()
    }
  }

  return (
    <div className="carto-section">
      <h2 className="carto-measure-header">
        <span>{st.name || 'Unnamed'}</span>
        <button
          className={`carto-eye${st.disabled ? ' off' : ''}`}
          title={st.disabled ? 'Show this chain' : 'Hide this chain'}
          onClick={() => setStreetDisabled(selectedStreet, !st.disabled)}>
          {st.disabled ? '◌' : '●'}
        </button>
      </h2>

      <div className="carto-row">
        <input type="checkbox" className="carto-checkbox"
          checked={!symmetric}
          onChange={toggleAsymmetric} />
        <label className="carto-label">Asymmetric (edit sides separately)</label>
      </div>

      <ModeToggle />

      {symmetric ? (
        <SideBlock sideKey="left" side={measure.left} single
          onChange={s => updateSide('left', s)} />
      ) : (
        <>
          <SideBlock sideKey="left" side={measure.left}
            onChange={s => updateSide('left', s)} />
          <SideBlock sideKey="right" side={measure.right}
            onChange={s => updateSide('right', s)} />
        </>
      )}

      <div className="carto-meta">
        {st.type || 'residential'} · {st.points.length} nodes · {isWholeChain ? 'whole-chain' : (hasCustom ? 'custom block' : 'inherits chain')}
      </div>

      {((!isWholeChain && hasCustom) || (isWholeChain && blockCustoms?.[selectedStreet])) && (
        <div className="carto-actions">
          <button className="carto-btn-sm" onClick={resetToDefault}>
            {isWholeChain ? 'Wipe per-block customs' : 'Reset block to chain default'}
          </button>
        </div>
      )}
    </div>
  )
}

// Measure-mode toggle — block (per-segment) vs whole-chain.
// "Edit whole chain" toggles the universal authoring mode. Pressing it
// ON IMMEDIATELY wipes the chain's existing per-block customs — going
// global is the commit to "this is the universal width" and the
// per-block deviations don't survive that. Pressing OFF returns to
// per-block authoring with no side effect (chain.measure stays).
// Default is OFF: most authoring time is per-block; operators set the
// universal once at survey time and spend the rest refining blocks.
function ModeToggle() {
  const mode = useCartographStore(s => s.measureMode)
  const setMode = useCartographStore(s => s.setMeasureMode)
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const clearCustomsForChain = useCartographStore(s => s.clearBlockCustomsForChain)
  const isWholeChain = mode?.type === 'global'
  const click = () => {
    if (isWholeChain) {
      setMode({ type: 'block' })
    } else {
      // Toggling INTO whole-chain wipes the chain's per-block customs.
      if (selectedStreet != null) clearCustomsForChain(selectedStreet)
      setMode({ type: 'global' })
    }
  }
  return (
    <div className="carto-row">
      <button
        className={`carto-btn-sm carto-btn--grow${isWholeChain ? ' is-active' : ''}`}
        onClick={click}
        title={isWholeChain
          ? 'Whole-chain mode: drag edits the chain default for every block. Click to return to per-block authoring.'
          : 'Per-block mode (default): drag edits the block at the click anchor. Click to switch to whole-chain — that wipes any per-block customs on this chain.'}>
        {isWholeChain ? '● Edit whole chain' : '○ Edit whole chain'}
      </button>
    </div>
  )
}
