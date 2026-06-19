/**
 * CoverageView — roster-anchored "have vs need" table (Brief 24, Cadastre
 * 2026-05-25). The Coverage half of the Grove's Gallery ↔ Coverage toggle.
 *
 * Read-only. Renders the live join computed by `GET /api/arborist/coverage`:
 * one row per CANONICALIZED Lafayette Square park species (src/data/park_trees
 * .json, merged via arborist/roster-name-canon.json), sorted by placement count
 * descending, each tagged 🟢 literal / 🟡 composite / 🔴 gap with the covering
 * library species and the current park_species_map routing. The map column
 * makes this double as the map-refresh worktable — it DISPLAYS routing and
 * flags missing / dangling entries; it never writes the map (curation is by
 * hand). Provenance is derived on the fly by the endpoint, never persisted.
 *
 * The literal/composite call is a name-token heuristic (the endpoint owns it);
 * routing is shown alongside so the operator can verify and hand-correct the
 * map. See ROSTER-COVERAGE.md for the hand-authored spec this reproduces.
 */
import { useEffect, useState } from 'react'

const CLASS_META = {
  literal:   { dot: '🟢', label: 'literal',   color: '#6a9a4a' },
  composite: { dot: '🟡', label: 'composite', color: '#c8a83a' },
  gap:       { dot: '🔴', label: 'gap',       color: '#c8553a' },
}

export default function CoverageView() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [classFilter, setClassFilter] = useState('all')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/arborist/coverage?t=${Date.now()}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { if (alive) { setData(d); setError(null); setLoading(false) } })
      .catch(e => { if (alive) { setError(String(e)); setLoading(false) } })
    return () => { alive = false }
  }, [])

  if (loading) return <div style={msg}>Computing coverage…</div>
  if (error)   return <div style={{ ...msg, color: '#f88' }}>Coverage failed: {error}</div>
  if (!data)   return null

  const { summary, species } = data
  const rows = classFilter === 'all' ? species : species.filter(s => s.coverage === classFilter)

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '14px 18px' }}>
      {/* Summary + class filter */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        marginBottom: 12, paddingBottom: 12,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ color: '#aaa' }}>
          <strong style={{ color: '#fff' }}>{summary.totalPlacements}</strong> placements ·{' '}
          <strong style={{ color: '#fff' }}>{summary.canonicalSpecies}</strong> species
          {' '}(from {summary.rawNames} raw names, {summary.merges} merges applied)
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          {[
            { v: 'all',       label: `All ${species.length}` },
            { v: 'literal',   label: `🟢 ${summary.literal}` },
            { v: 'composite', label: `🟡 ${summary.composite}` },
            { v: 'gap',       label: `🔴 ${summary.gap}` },
          ].map(o => (
            <button key={o.v} onClick={() => setClassFilter(o.v)}
              style={{
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4,
                padding: '4px 9px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                background: classFilter === o.v ? 'rgba(255,255,255,0.14)' : 'transparent',
                color: classFilter === o.v ? '#fff' : '#aaa',
              }}>{o.label}</button>
          ))}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ color: '#888', textAlign: 'left' }}>
            <Th style={{ width: 90 }}>Coverage</Th>
            <Th style={{ width: 48, textAlign: 'right' }}>Cnt</Th>
            <Th>Roster species</Th>
            <Th style={{ width: 104 }}>Kit · C·B·L</Th>
            <Th>Have (covering library species)</Th>
            <Th>Routing (park_species_map)</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(s => <Row key={s.species} s={s} />)}
        </tbody>
      </table>
    </div>
  )
}

function Row({ s }) {
  const meta = CLASS_META[s.coverage] || CLASS_META.gap
  return (
    <tr style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <Td>
        <span style={{ color: meta.color, whiteSpace: 'nowrap' }}>
          {meta.dot} {meta.label}
        </span>
      </Td>
      <Td style={{ textAlign: 'right', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{s.count}</Td>
      <Td>
        <div style={{ color: '#ddd' }}>{s.species}</div>
        {s.mergedFrom.length > 1 && (
          <div style={{ color: '#888', fontSize: 10, marginTop: 2 }}>
            merged: {s.mergedFrom.filter(n => n !== s.species).join(' · ')}
          </div>
        )}
      </Td>
      <Td><KitTriad fb={s.forestBuilder} /></Td>
      <Td>
        {s.covering.length === 0
          ? <span style={{ color: '#c8553a' }}>— no model / cousin (obtain)</span>
          : s.covering.map(c => (
              <div key={c.libId} style={{ color: '#bbb', lineHeight: 1.5 }}>
                <span style={{ color: '#dfe6da' }}>{c.label || c.libId}</span>{' '}
                <span style={{ color: '#777', fontSize: 10 }}>
                  {c.libId}
                  {c.chassisCount > 0 ? ` · ${c.chassisCount} chassis` : ' · no chassis'}
                  {c.compositionCount > 0 && ` · ${c.compositionCount} comp`}
                  {!c.published && ' · UNPUBLISHED'}
                </span>
              </div>
            ))}
      </Td>
      <Td>
        {s.mapMissing
          ? <span style={{ color: '#c89a3a', fontSize: 11 }}>⚠ no map entry</span>
          : s.routing.map(r => (
              <div key={r.libId} style={{ fontSize: 11, lineHeight: 1.5 }}>
                <span style={{ color: r.dangling ? '#c8553a' : '#aaa' }}>{r.libId}</span>
                {r.dangling && <span style={{ color: '#c8553a' }}> ⚠ dangling</span>}
                {!r.dangling && r.chassisCount === 0 && r.compositionCount === 0 &&
                  <span style={{ color: '#c89a3a' }}> · thin (no chassis)</span>}
              </div>
            ))}
      </Td>
    </tr>
  )
}

const cellPad = '7px 10px'
// Forest Builder per-part readiness (§8), folded into Coverage. 🟢 have (vendor-
// quality) / 🟡 stretch (stand-in/placeholder) / 🔴 gap; * = matcher diverges
// from the dossier's declared availability. Only dossier-backed species carry it.
const PART_GLYPH = { have: '🟢', stretch: '🟡', gap: '🔴' }
function KitTriad({ fb }) {
  if (!fb) return <span style={{ color: '#555' }}>—</span>
  const cell = (pt, name) => {
    const c = fb.parts[pt] || {}
    return <span title={`${name}: ${c.status || '?'}${c.diverges ? ' (diverges from declared)' : ''}`} style={{ fontSize: 13 }}>
      {PART_GLYPH[c.status] || '·'}{c.diverges ? <sup style={{ color: '#c8a83a' }}>*</sup> : ''}
    </span>
  }
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {cell('chassis', 'Chassis')} {cell('bark', 'Bark')} {cell('leaf', 'Leaves')}
      {fb.buildableClean
        ? <span style={{ color: '#6a9a4a', fontSize: 9, marginLeft: 6 }}>CLEAN</span>
        : fb.buildableWithStandins ? <span style={{ color: '#c8a83a', fontSize: 9, marginLeft: 6 }}>stand-in</span> : null}
    </span>
  )
}

function Th({ children, style }) {
  return <th style={{ padding: cellPad, fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', ...style }}>{children}</th>
}
function Td({ children, style }) {
  return <td style={{ padding: cellPad, verticalAlign: 'top', ...style }}>{children}</td>
}

const msg = {
  position: 'absolute', top: '40%', left: 0, right: 0,
  textAlign: 'center', color: '#888', fontSize: 13,
}
