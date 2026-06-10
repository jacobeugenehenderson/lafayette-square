import { useState, useEffect } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import { CURB_WIDTH, BAND_COLORS } from './streetProfiles.js'
import { chainMeasure, findFeForSide, feesForChainSide } from './measureModel.js'
import { readFeCustom, feCustomKey } from '../lib/feCustomKey.js'
import { resolvePedDepths } from '../lib/tileGround.js'

const FT_PER_M = 3.28084
const M_PER_FT = 0.3048
const fmtFt = (m) => (m * FT_PER_M).toFixed(1)

// Effective per-side measure for a segment. Block-edge customs are keyed by
// the fe's chain-anchored identity (skelId, side, segOrd) via feCustomKey;
// each side resolves through its own fe and wins over the chain READ default.
function effectiveMeasure(st, segOrd, v2FrontageEdges, blockCustoms) {
  const chain = chainMeasure(st)
  const feL = findFeForSide(v2FrontageEdges, st, segOrd, 'left')
  const feR = findFeForSide(v2FrontageEdges, st, segOrd, 'right')
  const customL = readFeCustom(blockCustoms, feL)
  const customR = readFeCustom(blockCustoms, feR)
  // ⭐ One depth truth (SECTION.md §5): the panel SHOWS the same per-edge
  // resolution the FILL strokes — blockCustoms override else best-effort
  // (gleaned-Y × ADA) — merged over the chain reference fields. The raw chain
  // depths are the surveyed inputs the best-effort gleans from, not what
  // renders; a commit writes the displayed (resolved) depths as intent.
  const resolve = (custom, sideKey) => {
    const ped = resolvePedDepths(chain, sideKey, custom)
    return { ...(chain[sideKey] || {}), ...(custom || {}), treelawn: ped.tl, sidewalk: ped.sw }
  }
  return {
    left:  resolve(customL, 'left'),
    right: resolve(customR, 'right'),
    feL, feR,
  }
}

// Infer terminal from numeric values so the operator never has to set it.
//   treelawn > 0 → 'sidewalk' (asphalt + curb + treelawn + sidewalk band)
//   only sidewalk → 'lawn'    (asphalt + curb + sidewalk band, no treelawn)
//   nothing → 'none'          (asphalt + curb, no ped zone)
// Does ANY fe belonging to this chain have a custom written? Used by the
// "Wipe per-block customs" button gate in whole-chain mode.
function hasAnyChainCustom(v2FrontageEdges, st, blockCustoms) {
  if (!st || !v2FrontageEdges?.length || !blockCustoms) return false
  const idKey = st.skelId || st.id || null
  const nameKey = st.name || null
  for (const fe of v2FrontageEdges) {
    const idMatches = idKey && fe.chainSkelId === idKey
    const nameMatches = !idKey && nameKey && fe.chainName === nameKey
    if (!idMatches && !nameMatches) continue
    if (readFeCustom(blockCustoms, fe)) return true
  }
  return false
}

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
      {/* Asphalt width is authored in Survey (the asphalt-edge handle), not here
          — Measure (→ Section) owns the ped profile. pavementHW stays in the
          measure as the reference the ped bands position off; just no editor. */}
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
  const v2FrontageEdges    = useCartographStore(s => s._v2FrontageEdges)
  const measureMode        = useCartographStore(s => s.measureMode)
  const editSidesSeparately = useCartographStore(s => s.editSidesSeparately)
  const setEditSidesSeparately = useCartographStore(s => s.setEditSidesSeparately)
  const writeBlockEdgeCustoms = useCartographStore(s => s.writeBlockEdgeCustoms)
  const clearCustomsForChain = useCartographStore(s => s.clearBlockEdgeCustomsForChain)
  const setStreetDisabled  = useCartographStore(s => s.setStreetDisabled)
  const revertSectionToDefault = useCartographStore(s => s.revertSectionToDefault)
  const sectionOverrideCount = useCartographStore(s => s.sectionOverrideCount)

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

  const measure = effectiveMeasure(st, ordinal, v2FrontageEdges, blockCustoms)
  // "Symmetric" is the transient mirror toggle, not stored chain data.
  const symmetric = !editSidesSeparately
  const { feL, feR } = measure
  const hasCustom = !!(
    readFeCustom(blockCustoms, feL) || readFeCustom(blockCustoms, feR)
  )

  // Persist a side's new measure — always per-fe (data-wall doctrine), never
  // chain.measure. Whole-chain mode SELECTS every fe of the chain on the
  // touched side(s) and fans the write; per-block mode writes the one fe at
  // this segment. When not editing sides separately, the write mirrors to
  // the opposite side. One batched store write → one V2 rebuild.
  function updateSide(sideKey, newSide) {
    const otherSide = sideKey === 'left' ? 'right' : 'left'
    const sides = editSidesSeparately ? [sideKey] : [sideKey, otherSide]
    const entries = []
    if (isWholeChain) {
      for (const s of sides) {
        for (const fe of feesForChainSide(v2FrontageEdges, st, s)) {
          entries.push({ fe, measure: { ...newSide } })
        }
      }
    } else {
      const feBySide = { left: feL, right: feR }
      for (const s of sides) {
        const fe = feBySide[s]
        if (fe) entries.push({ fe, measure: { ...newSide } })
      }
    }
    writeBlockEdgeCustoms(entries)
  }

  function toggleAsymmetric() {
    // Mirror-edit is a property of the current selection, not the chain.
    setEditSidesSeparately(!editSidesSeparately)
  }

  function resetToDefault() {
    // Per-block reset: drop the customs at THIS segment's resolved fes
    // (one per side), leaving the chain READ default as the visible value.
    // Whole-chain reset wipes every per-block custom on the chain (the
    // explicit "Wipe per-block customs" button — the only wipe now that
    // mode-switching no longer destroys customs).
    if (isWholeChain) {
      clearCustomsForChain(selectedStreet)
      return
    }
    const all = { ...(blockCustoms || {}) }
    let changed = false
    for (const fe of [feL, feR]) {
      const k = feCustomKey(fe)
      if (!k) continue
      const [skel, side, seg] = k
      if (!all[skel]?.[side] || !(seg in all[skel][side])) continue
      all[skel] = { ...all[skel] }
      all[skel][side] = { ...all[skel][side] }
      delete all[skel][side][seg]
      if (Object.keys(all[skel][side]).length === 0) delete all[skel][side]
      if (Object.keys(all[skel]).length === 0) delete all[skel]
      changed = true
    }
    if (!changed) return
    useCartographStore.setState({ blockCustoms: all })
    useCartographStore.getState()._saveDesignDebounced?.()
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

      {((!isWholeChain && hasCustom) || (isWholeChain && hasAnyChainCustom(v2FrontageEdges, st, blockCustoms))) && (
        <div className="carto-actions">
          <button className="carto-btn-sm" onClick={resetToDefault}>
            {isWholeChain ? 'Wipe per-block customs' : 'Reset block to chain default'}
          </button>
        </div>
      )}
      {/* SECTION · Revert to Default — clears the ped overrides so the calculation
          re-seeds (gleaned treelawn + ADA). Survey widths + corners untouched.
          ⌃-click a ped handle reverts just that edge. */}
      <div className="carto-actions carto-section-revert">
        <button className="carto-btn-sm"
          disabled={(sectionOverrideCount?.() || 0) === 0}
          onClick={() => {
            if (confirm('Revert ALL Section ped (treelawn/sidewalk depths + materials) to Default? The calculation re-seeds (gleaned treelawn + ADA). Survey widths + corners are kept.')) revertSectionToDefault()
          }}
          title="Clear every authored Section ped depth + material → the calculated default (gleaned treelawn + ADA). Survey widths + corners are kept.">
          ↺ Revert to Default
        </button>
      </div>
    </div>
  )
}

// Measure-mode toggle — whole-chain (default) vs per-block. Both modes
// author PER-FE; the mode only sets the SELECTION the edit fans across:
// whole-chain → every fe of the chain; per-block → the one fe at the click
// anchor. Switching modes is non-destructive (a pure selection-scope change)
// — it no longer wipes customs. To clear per-block customs, use the explicit
// "Wipe per-block customs" button.
function ModeToggle() {
  const mode = useCartographStore(s => s.measureMode)
  const setMode = useCartographStore(s => s.setMeasureMode)
  const isWholeChain = mode?.type === 'global'
  const click = () => setMode({ type: isWholeChain ? 'block' : 'global' })
  return (
    <div className="carto-row">
      <button
        className={`carto-btn-sm carto-btn--grow${isWholeChain ? ' is-active' : ''}`}
        onClick={click}
        title={isWholeChain
          ? 'Whole-chain mode (default): an edit fans to every block-edge of the chain. Click to switch to per-block authoring.'
          : 'Per-block mode: an edit writes only the block-edge at the click anchor. Click to switch back to whole-chain.'}>
        {isWholeChain ? '● Edit whole chain' : '○ Edit whole chain'}
      </button>
    </div>
  )
}
