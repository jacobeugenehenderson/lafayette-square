/**
 * CloudsInConditionCard — the cloud blend a Condition publishes.
 *
 * One row per directive.clouds[] entry: preset dropdown + weight slider +
 * remove button. + Add cloud at the bottom while count < 3 (schema cap).
 *
 * Phase 3 filter: clouds where kind === 'cloud' || kind === 'fog'. Hides
 * rain/snow/lightning stubs. Sorted alphabetically by label so the
 * dropdown matches the Teapot library row order.
 *
 * Phase 3b will add capability-based filtering (only clouds whose
 * `precipKinds` / `electrified` flags satisfy the condition's expression
 * flags), plus per-cloud-in-condition expression flags (weight/rain
 * rate/snow rate/lightning) as their own card. None of that lands in
 * Phase 3 — see INTERFACE.md §5.2.
 */
import { useMemo, useState, useRef, useEffect } from 'react'
import useMeteorologistStore from './stores/useMeteorologistStore.js'

export default function CloudsInConditionCard({ rule }) {
  const presets             = useMeteorologistStore(s => s.presets)
  const addCloud            = useMeteorologistStore(s => s.addCloudToCondition)
  const removeCloud         = useMeteorologistStore(s => s.removeCloudFromCondition)
  const setCloudWeight      = useMeteorologistStore(s => s.setCloudWeight)
  const setCloudPreset      = useMeteorologistStore(s => s.setCloudPreset)

  const eligible = useMemo(() => {
    return presets
      .filter(p => (p.kind === 'cloud' || p.kind === 'fog') && p.enabled !== false)
      .sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id))
  }, [presets])

  const clouds = rule.directive?.clouds || []
  const atCap = clouds.length >= 3

  const handleAdd = () => {
    if (atCap || eligible.length === 0) return
    // Pick the first cloud not already in the blend; fall back to the
    // first eligible if all three are somehow distinct already.
    const usedIds = new Set(clouds.map(c => c.preset))
    const next = eligible.find(p => !usedIds.has(p.id)) || eligible[0]
    addCloud(rule.id, next.id)
  }

  return (
    <div className="glass-panel rounded-xl p-3">
      <div className="section-heading mb-2">Clouds in this condition</div>

      {clouds.length === 0 && (
        <div style={{ color: 'var(--on-surface-subtle)', fontSize: 'var(--type-caption)', padding: '4px 0' }}>
          No cloud blend — condition will inherit the TOD base directive.
        </div>
      )}

      {clouds.map((c, i) => (
        <CloudRow
          key={i}
          row={c}
          idx={i}
          eligible={eligible}
          onPreset={(presetId) => setCloudPreset(rule.id, i, presetId)}
          onWeight={(w) => setCloudWeight(rule.id, i, w)}
          onRemove={() => removeCloud(rule.id, i)}
        />
      ))}

      {!atCap && (
        <button onClick={handleAdd} disabled={eligible.length === 0}
          style={{
            marginTop: 6, width: '100%',
            padding: '6px 8px', borderRadius: 4,
            background: 'transparent',
            border: '1px dashed var(--outline-variant)',
            color: 'var(--on-surface-subtle)',
            fontFamily: 'inherit', fontSize: 'var(--type-caption)',
            cursor: 'pointer',
          }}>
          + Add cloud
        </button>
      )}
      {atCap && (
        <div style={{ marginTop: 6, color: 'var(--on-surface-subtle)', fontSize: 10, textAlign: 'center' }}>
          Max 3 clouds per blend (schema limit).
        </div>
      )}
    </div>
  )
}

function CloudRow({ row, eligible, onPreset, onWeight, onRemove }) {
  // Local-draft weight slider, same pattern as DirectiveCard/WhenCard so a
  // single drag fires one PUT.
  const [draft, setDraft] = useState(row.weight)
  const last = useRef(row.weight)
  useEffect(() => {
    if (row.weight !== last.current) { setDraft(row.weight); last.current = row.weight }
  }, [row.weight])

  // Preset id might reference a now-disabled / removed preset (legacy data).
  // Surface it explicitly so the operator can fix it.
  const knownIds = new Set(eligible.map(p => p.id))
  const orphan = !knownIds.has(row.preset)

  return (
    <div style={{
      padding: '6px 0',
      borderTop: '1px solid var(--outline-variant)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select
          value={row.preset}
          onChange={(e) => onPreset(e.target.value)}
          style={{
            flex: 1,
            background: 'var(--surface-container-highest)',
            border: '1px solid ' + (orphan ? 'rgba(255,128,128,0.5)' : 'var(--outline-variant)'),
            color: orphan ? '#f88' : 'var(--on-surface)',
            padding: '3px 6px', borderRadius: 4,
            fontFamily: 'inherit', fontSize: 'var(--type-caption)',
          }}>
          {orphan && <option value={row.preset}>{row.preset} (missing)</option>}
          {eligible.map(p => (
            <option key={p.id} value={p.id}>
              {p.label}{p.wmo ? ` · ${p.wmo}` : ''}
            </option>
          ))}
        </select>
        <button onClick={onRemove} title="Remove from blend"
          style={{
            height: 22, width: 22, padding: 0, borderRadius: 4,
            background: 'transparent',
            border: '1px solid var(--outline-variant)',
            color: 'var(--on-surface-subtle)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>×</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--on-surface-variant)', fontSize: 10, minWidth: 50 }}>weight</span>
        <input type="range" min={0} max={1} step={0.01}
          value={draft}
          onChange={(e) => setDraft(parseFloat(e.target.value))}
          onPointerUp={() => { if (draft !== last.current) { last.current = draft; onWeight(draft) } }}
          onKeyUp={()    => { if (draft !== last.current) { last.current = draft; onWeight(draft) } }}
          style={{ flex: 1, accentColor: 'var(--vic-gold)' }} />
        <span style={{ fontFamily: 'monospace', color: 'var(--on-surface-medium)', fontSize: 'var(--type-caption)', minWidth: 32, textAlign: 'right' }}>
          {Number(draft).toFixed(2)}
        </span>
      </div>
    </div>
  )
}
