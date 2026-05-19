/**
 * DirectiveCard — the published atmospheric output for one condition.
 *
 * Renders one row per DIRECTIVE_FIELDS entry. Phase 3 ships every field
 * as a flat scalar (slider / color / select) — directive sub-objects
 * (sun, lightDome, wind, precip) are created on first edit and pruned
 * back to absent when their last child is cleared. See INTERFACE.md §5.2
 * for the Phase 3b TodChannel promotion plan.
 *
 * Absent-vs-zero: directive fields are inherited from the TOD base
 * envelope when absent (almanac doctrine), NOT clamped to zero. So this
 * card distinguishes "engaged (overrides base)" from "default (inherit)"
 * via a per-row engage/off toggle, same pattern WhenCard uses for range
 * predicates.
 */
import { useState, useRef, useEffect } from 'react'
import useMeteorologistStore from './stores/useMeteorologistStore.js'
import { DIRECTIVE_FIELDS, getPath } from './conditionFields.js'

export default function DirectiveCard({ rule }) {
  const setRuleField = useMeteorologistStore(s => s.setRuleField)

  return (
    <div className="glass-panel rounded-xl p-3">
      <div className="section-heading mb-2">Directive</div>
      {DIRECTIVE_FIELDS.map(f => {
        const value = getPath(rule.directive, f.path)
        const engaged = value !== undefined
        return (
          <FieldRow
            key={f.path}
            field={f}
            engaged={engaged}
            value={value}
            onEngage={() => setRuleField(rule.id, `directive.${f.path}`, defaultFor(f))}
            onClear={() => setRuleField(rule.id, `directive.${f.path}`, undefined)}
            onChange={(v) => setRuleField(rule.id, `directive.${f.path}`, v)}
          />
        )
      })}
    </div>
  )
}

function defaultFor(f) {
  if (f.kind === 'slider') {
    const mid = (f.min + f.max) / 2
    return Number(mid.toFixed(3))
  }
  if (f.kind === 'color')  return '#888888'
  if (f.kind === 'select') return f.options[0] ?? null
  return undefined
}

function FieldRow({ field, engaged, value, onEngage, onClear, onChange }) {
  return (
    <div style={{ padding: '4px 0', borderTop: '1px solid var(--outline-variant)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ color: 'var(--on-surface-variant)', fontSize: 'var(--type-caption)' }}>
          {field.label}
        </span>
        {!engaged
          ? <button onClick={onEngage} style={btnSm}>engage</button>
          : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FieldEditor field={field} value={value} onChange={onChange} />
              <button onClick={onClear} title="Inherit from TOD base envelope" style={btnSm}>off</button>
            </span>
          )}
      </div>
      {engaged && field.kind === 'slider' && (
        <SliderTrack field={field} value={value} onChange={onChange} />
      )}
    </div>
  )
}

function FieldEditor({ field, value, onChange }) {
  if (field.kind === 'color') {
    const hex = typeof value === 'string' && value[0] === '#' ? value : '#888888'
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', color: 'var(--on-surface-medium)', fontSize: 'var(--type-caption)' }}>
          {hex}
        </span>
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)}
          style={{
            width: 28, height: 18, padding: 0,
            border: '1px solid var(--outline-variant)',
            borderRadius: 3, background: 'transparent', cursor: 'pointer',
          }} />
      </span>
    )
  }
  if (field.kind === 'select') {
    const sentinel = '__null__'
    return (
      <select
        value={value == null ? sentinel : value}
        onChange={(e) => onChange(e.target.value === sentinel ? null : e.target.value)}
        style={{
          background: 'var(--surface-container-highest)',
          border: '1px solid var(--outline-variant)',
          color: 'var(--on-surface)',
          padding: '2px 6px', borderRadius: 4,
          fontFamily: 'inherit', fontSize: 'var(--type-caption)',
        }}>
        {field.options.map((opt, i) => (
          <option key={opt == null ? `null-${i}` : opt} value={opt == null ? sentinel : opt}>
            {opt == null ? (field.nullLabel || 'null') : opt}
          </option>
        ))}
      </select>
    )
  }
  // slider — value display only; the actual <input range> lives below
  return (
    <span style={{ fontFamily: 'monospace', color: 'var(--on-surface-medium)', fontSize: 'var(--type-caption)' }}>
      {fmt(value, field.step)}
    </span>
  )
}

// Local-draft slider that commits on pointerup so a single drag doesn't
// fire a PUT per delta. Same pattern WhenCard uses; matches
// feedback_heavy_render_sliders_need_draft.
function SliderTrack({ field, value, onChange }) {
  const [draft, setDraft] = useState(value)
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) { setDraft(value); last.current = value }
  }, [value])
  const commit = () => {
    if (draft !== last.current) {
      last.current = draft
      onChange(draft)
    }
  }
  return (
    <input type="range"
      min={field.min} max={field.max} step={field.step}
      value={draft}
      onChange={(e) => setDraft(parseFloat(e.target.value))}
      onPointerUp={commit}
      onKeyUp={commit}
      style={{ width: '100%', accentColor: 'var(--vic-gold)' }} />
  )
}

function fmt(n, step) {
  if (n == null || isNaN(n)) return '—'
  if (step >= 1) return Math.round(n).toString()
  if (step >= 0.1) return Number(n).toFixed(1)
  if (step >= 0.01) return Number(n).toFixed(2)
  return Number(n).toFixed(3)
}

const btnSm = {
  height: 18, padding: '0 6px', borderRadius: 4,
  fontSize: 10, lineHeight: 1, letterSpacing: '0.08em',
  textTransform: 'uppercase',
  background: 'transparent',
  border: '1px solid var(--outline-variant)',
  color: 'var(--on-surface-subtle)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
