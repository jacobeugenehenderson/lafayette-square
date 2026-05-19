/**
 * WhenCard — the rule's payload predicates.
 *
 * Range fields: dual-thumb [min, max] for inclusive [lo, hi] match.
 *   "Off" (the slider in the disengaged state) means "no constraint on this
 *   axis" — schema-side wildcard. The Engage button promotes wildcard →
 *   `[fieldMin, fieldMax]` so the operator can then narrow it.
 * Chip fields: multi-select. Empty array == absent field (wildcard).
 *   `null` is a valid option for precipKind (= "no precipitation").
 *
 * Two trailing scalars don't live in `when` itself but are top-level rule
 * fields adjacent in the schema — softness (boundary smoothing) and
 * transitionMs (lerp time into this directive). They render here because
 * they're cognitively part of "when this fires + how it eases in," not
 * part of "what the atmosphere looks like."
 */
import { useState, useRef, useEffect } from 'react'
import useMeteorologistStore from './stores/useMeteorologistStore.js'
import { WHEN_FIELDS } from './conditionFields.js'

export default function WhenCard({ rule }) {
  const setRuleField = useMeteorologistStore(s => s.setRuleField)
  const set = (path, value) => setRuleField(rule.id, path, value)

  return (
    <div className="glass-panel rounded-xl p-3">
      <div className="section-heading mb-2">When</div>

      {WHEN_FIELDS.map(f => {
        const value = rule.when?.[f.key]
        if (f.kind === 'range') {
          return (
            <RangeRow
              key={f.key} field={f} value={value}
              onChange={(v) => set(`when.${f.key}`, v)}
            />
          )
        }
        // chips
        return (
          <ChipRow
            key={f.key} field={f} value={value || []}
            onChange={(v) => set(`when.${f.key}`, v.length ? v : undefined)}
          />
        )
      })}

      <ScalarRow
        label="Softness" min={0} max={1} step={0.01}
        value={rule.softness ?? 0.05}
        onChange={(v) => set('softness', v)}
      />
      <NumberInputRow
        label="Transition (ms)" min={0} max={600000} step={1000}
        value={rule.transitionMs ?? 60000}
        onChange={(v) => set('transitionMs', v)}
      />
    </div>
  )
}

// ── Range row (dual-thumb [min, max]) ────────────────────────────────────
//
// HTML has no native dual-range slider; we stack two <input type=range>s
// and constrain them on commit (pointerup). Local draft state avoids
// firing the autosave on every pointermove (feedback_heavy_render_sliders_need_draft).
function RangeRow({ field, value, onChange }) {
  const engaged = Array.isArray(value) && value.length === 2
  const [draft, setDraft] = useState(engaged ? value : [field.min, field.max])
  const lastCommitted = useRef(value)

  useEffect(() => {
    // Pull external changes (revert, condition-switch) into draft.
    if (engaged && value !== lastCommitted.current) {
      setDraft(value)
      lastCommitted.current = value
    }
  }, [value, engaged])

  const commit = (next) => {
    lastCommitted.current = next
    onChange(next)
  }

  return (
    <div style={{ padding: '4px 0', borderTop: '1px solid var(--outline-variant)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--on-surface-variant)', fontSize: 'var(--type-caption)' }}>
          {field.label}
        </span>
        {engaged
          ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'monospace', color: 'var(--on-surface-medium)', fontSize: 'var(--type-caption)' }}>
                [{fmt(draft[0], field.step)}, {fmt(draft[1], field.step)}]
              </span>
              <button onClick={() => commit(undefined)}
                title="Clear constraint (wildcard this axis)"
                style={btnSm}>off</button>
            </span>
          )
          : (
            <button onClick={() => commit([field.min, field.max])} style={btnSm}>
              engage
            </button>
          )}
      </div>
      {engaged && (
        <div style={{ display: 'flex', gap: 6, paddingTop: 2 }}>
          <input type="range"
            min={field.min} max={field.max} step={field.step}
            value={draft[0]}
            onChange={(e) => {
              const lo = Math.min(parseFloat(e.target.value), draft[1])
              setDraft([lo, draft[1]])
            }}
            onPointerUp={() => commit([draft[0], draft[1]])}
            onKeyUp={() => commit([draft[0], draft[1]])}
            style={{ accentColor: 'var(--vic-gold)', flex: 1 }}
          />
          <input type="range"
            min={field.min} max={field.max} step={field.step}
            value={draft[1]}
            onChange={(e) => {
              const hi = Math.max(parseFloat(e.target.value), draft[0])
              setDraft([draft[0], hi])
            }}
            onPointerUp={() => commit([draft[0], draft[1]])}
            onKeyUp={() => commit([draft[0], draft[1]])}
            style={{ accentColor: 'var(--vic-gold)', flex: 1 }}
          />
        </div>
      )}
    </div>
  )
}

function ChipRow({ field, value, onChange }) {
  const isSelected = (opt) => value.some(v => v === opt || (v == null && opt == null))
  const toggle = (opt) => {
    if (isSelected(opt)) onChange(value.filter(v => !(v === opt || (v == null && opt == null))))
    else onChange([...value, opt])
  }
  return (
    <div style={{ padding: '4px 0', borderTop: '1px solid var(--outline-variant)' }}>
      <div style={{ color: 'var(--on-surface-variant)', fontSize: 'var(--type-caption)', paddingBottom: 2 }}>
        {field.label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {field.options.map((opt, i) => {
          const label = opt == null ? (field.nullLabel || 'null') : opt
          const on = isSelected(opt)
          return (
            <button key={opt == null ? `null-${i}` : opt}
              onClick={() => toggle(opt)}
              style={{
                height: 20, padding: '0 8px', borderRadius: 4,
                fontSize: 'var(--type-caption)',
                fontFamily: 'inherit',
                background: on
                  ? 'color-mix(in srgb, var(--vic-gold) 22%, transparent)'
                  : 'transparent',
                border: on
                  ? '1px solid var(--vic-gold)'
                  : '1px dashed var(--outline-variant)',
                color: on ? 'var(--vic-gold)' : 'var(--on-surface-subtle)',
                cursor: 'pointer',
              }}>
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ScalarRow({ label, min, max, step, value, onChange }) {
  return (
    <div style={{ padding: '4px 0', borderTop: '1px solid var(--outline-variant)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--on-surface-variant)', fontSize: 'var(--type-caption)' }}>{label}</span>
        <span style={{ fontFamily: 'monospace', color: 'var(--on-surface-medium)', fontSize: 'var(--type-caption)' }}>
          {fmt(value, step)}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--vic-gold)' }} />
    </div>
  )
}

function NumberInputRow({ label, min, max, step, value, onChange }) {
  return (
    <div style={{ padding: '4px 0', borderTop: '1px solid var(--outline-variant)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--on-surface-variant)', fontSize: 'var(--type-caption)' }}>{label}</span>
        <input type="number" min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            width: 84, fontSize: 'var(--type-caption)', padding: '2px 4px',
            background: 'var(--surface-container-highest)',
            color: 'var(--on-surface)',
            border: '1px solid var(--outline-variant)',
            borderRadius: 4, textAlign: 'right', fontFamily: 'inherit',
          }} />
      </div>
    </div>
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

