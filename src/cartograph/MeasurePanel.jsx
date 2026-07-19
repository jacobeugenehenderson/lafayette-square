import { useState, useEffect } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import { CURB_WIDTH, BAND_COLORS } from './streetProfiles.js'
import { chainMeasure, findFeForSide } from './measureModel.js'
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
  const writeBlockEdgeCustoms = useCartographStore(s => s.writeBlockEdgeCustoms)
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

  const measure = effectiveMeasure(st, ordinal, v2FrontageEdges, blockCustoms)
  const { feL, feR } = measure
  const hasCustom = !!(
    readFeCustom(blockCustoms, feL) || readFeCustom(blockCustoms, feR)
  )

  // Persist a side's new measure — per-fe (data-wall doctrine), ONE side, never
  // chain.measure. SECTION is inherently per-side (mode + mirror excised
  // 2026-07-18), so a side edits exactly its own block-edge at this segment.
  // writeBlockEdgeCustoms fans it across that fe's owned segOrds.
  function updateSide(sideKey, newSide) {
    const fe = sideKey === 'left' ? feL : feR
    if (!fe) return
    writeBlockEdgeCustoms([{ fe, measure: { ...newSide } }])
  }

  function resetToDefault() {
    // Per-block reset: drop the custom at THIS segment's two fes (one per side),
    // across all their fanned segOrds, leaving the chain READ default visible.
    const all = { ...(blockCustoms || {}) }
    let changed = false
    for (const fe of [feL, feR]) {
      const k = feCustomKey(fe)
      if (!k) continue
      const [skel, side] = k
      if (!all[skel]?.[side]) continue
      const segs = (fe.segOrds && fe.segOrds.length) ? fe.segOrds : [k[2]]
      all[skel] = { ...all[skel] }
      all[skel][side] = { ...all[skel][side] }
      for (const seg of segs) delete all[skel][side][seg]
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

      {/* SECTION is per-fe, per-side. The whole-chain + symmetric-mirror modes
          were excised (2026-07-18): the ribbon is inherently per-side, so those
          modes fought the model and dragged in the wrong segments. The "whole
          street" head-start comes from the automatic survey best-guess (real
          sidewalk data), not a manual batch mode; per-fe override handles the
          rest. Both sides edit independently. */}
      <SideBlock sideKey="left" side={measure.left}
        onChange={s => updateSide('left', s)} />
      <SideBlock sideKey="right" side={measure.right}
        onChange={s => updateSide('right', s)} />

      <div className="carto-meta">
        {st.type || 'residential'} · {st.points.length} nodes · {hasCustom ? 'custom block' : 'inherits chain'}
      </div>

      {hasCustom && (
        <div className="carto-actions">
          <button className="carto-btn-sm" onClick={resetToDefault}>
            Reset block to chain default
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

