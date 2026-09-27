/**
 * SliderRow — THE slider every Stage control uses (keyframed channels in TodChannel, and the camera / Horizon rows
 * in StageApp). A range plus a typed value field (Jacob, 2026-09-27): type a number and press Enter, or step it
 * with the arrow keys — by the field's own step, ×10 with Shift — clamped to the slider's range.
 * Replaces two raw <input type=range> copies (TodChannel#ChannelSlider, StageApp#SliderRow).
 * `scale` (e.g. "body") is read by checks/claims-stage-controls-are-live.mjs ④ and ignored here.
 */
import { useEffect, useState } from 'react'

const decimalsFor = (step) => (step > 0 && step < 1 ? Math.min(4, Math.ceil(-Math.log10(step) - 1e-9)) : 0)

export default function SliderRow({ label, value, onChange, min = 0, max = 1, step = 1, suffix = '', disabled = false, title = '' }) {
  const v = Number(value) || 0
  const dec = decimalsFor(step)
  const clamp = (x) => Math.min(max, Math.max(min, x))
  const snap = (x) => +(Math.round(x / step) * step).toFixed(dec)
  const [draft, setDraft] = useState(null)          // text while typing; null = show the value
  useEffect(() => { setDraft(null) }, [value])

  const commit = (text) => {
    const x = parseFloat(text)
    setDraft(null)
    if (Number.isFinite(x)) onChange(clamp(snap(x)))
  }
  const onKey = (e) => {
    if (e.key === 'Enter') { commit(e.currentTarget.value); e.currentTarget.blur(); return }
    if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); return }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const base = draft != null && Number.isFinite(parseFloat(draft)) ? parseFloat(draft) : v
      onChange(clamp(snap(base + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1))))
    }
  }

  return (
    <div className="space-y-0.5" title={title}>
      <div className="flex items-center justify-between">
        <span className="text-caption" style={{ color: 'var(--on-surface-variant)', fontSize: 'var(--type-caption)' }}>{label}</span>
        <span className="flex items-center" style={{ gap: 2 }}>
          <input
            type="text" inputMode="decimal" disabled={disabled}
            value={draft ?? v.toFixed(dec)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => draft != null && commit(e.target.value)}
            onKeyDown={onKey}
            aria-label={`${label} value`}
            className="font-mono"
            style={{
              width: `${Math.max(4, v.toFixed(dec).length + 1)}ch`, textAlign: 'right', padding: '0 3px',
              fontSize: 'var(--type-caption)', color: 'var(--on-surface-medium)',
              background: 'transparent', border: '1px solid transparent', borderRadius: 3,
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--outline-variant)'; e.target.select() }}
            onBlurCapture={(e) => { e.target.style.borderColor = 'transparent' }}
          />
          {suffix && <span className="text-caption font-mono" style={{ color: 'var(--on-surface-medium)' }}>{suffix}</span>}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v} disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
        style={{ accentColor: 'var(--vic-gold)', opacity: disabled ? 0.4 : 1 }} />
    </div>
  )
}
