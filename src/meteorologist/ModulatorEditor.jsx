/**
 * ModulatorEditor — per-modulator authoring workstage.
 *
 * Three cards in the right rail:
 *   - Driver — signal picker + driver-shape picker (range+curve | in |
 *     between | min | all-composite). Sub-drivers nest under `all`.
 *   - Deltas — list of {dot-path, delta-type, value} rows. Type picker
 *     swaps between color hex lerp, scalar scale, tint-toward, and
 *     direct scalar range.
 *   - Ramp — rampMinutes slider (author intent for tween cadence).
 *
 * Header carries a live strength badge that reads useAtmosphere
 * .activeStrengths[modulatorId] so the operator can verify the driver
 * curve against today's actual weather in real time.
 *
 * Halo 2026-05-20, Phase 6.
 */
import useMeteorologistStore from './stores/useMeteorologistStore.js'
import useAtmosphere from '../hooks/useAtmosphere.js'
import { getSignalKeys } from '../lib/weather-signals.js'
import { DIRECTIVE_FIELDS } from './conditionFields.js'

const SIGNAL_KEYS = getSignalKeys()
const CURVES = ['smoothstep', 'linear', 'bell', 'threshold']
const DELTA_KINDS = [
  { key: 'colorLerp',   label: 'Color {from, to}' },
  { key: 'scale',       label: 'Scalar {scale: [a, b]}' },
  { key: 'tintToward',  label: 'Tint toward color' },
  { key: 'directRange', label: 'Direct range [lo, hi]' },
]
const DRIVER_SHAPES = [
  { key: 'curve',   label: 'Signal + range + curve' },
  { key: 'in',      label: 'Signal ∈ set' },
  { key: 'between', label: 'Signal ∈ [lo, hi]' },
  { key: 'min',     label: 'Signal ≥ threshold' },
  { key: 'all',     label: 'all: [...] (composite)' },
]

export default function ModulatorEditor() {
  const modulators        = useMeteorologistStore(s => s.modulators)
  const activeId          = useMeteorologistStore(s => s.activeModulatorId)
  const setActiveModulator = useMeteorologistStore(s => s.setActiveModulator)
  const revert            = useMeteorologistStore(s => s.revertModulatorToDefault)
  const setField          = useMeteorologistStore(s => s.setModulatorField)
  const strengths         = useAtmosphere(s => s.activeStrengths) || {}

  const m = modulators.find(x => x.id === activeId) || null
  if (!m) {
    return (
      <div style={shellStyle}>
        <span style={{ color: '#888' }}>Modulator not loaded.</span>
      </div>
    )
  }
  const strength = strengths[m.id] ?? 0

  return (
    <div style={shellStyle}>
      <header style={{
        padding: '12px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button onClick={() => setActiveModulator(null)} style={backBtnStyle}>
          ← Modulators
        </button>
        <strong style={{
          letterSpacing: '0.15em', textTransform: 'uppercase',
          fontSize: 12, color: '#fff',
        }}>Meteorologist</strong>
        <span style={{ color: '#888' }}>modulator</span>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', color: '#888', fontSize: 11 }}>
          <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Modulator</span>
          <select value={m.id}
            onChange={(e) => setActiveModulator(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#ddd',
              padding: '4px 8px', borderRadius: 4,
              fontFamily: 'inherit', fontSize: 12, minWidth: 240,
            }}>
            {modulators.map(x => (
              <option key={x.id} value={x.id}>{x.label || x.id}</option>
            ))}
          </select>
        </label>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <main style={{ flex: 1, minWidth: 0, background: '#0a0a0a', padding: 20, color: '#888', fontSize: 12, lineHeight: 1.55, overflow: 'auto' }}>
          <h2 style={{ color: '#fff', fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px 0' }}>{m.label || m.id}</h2>
          {m.description && <p style={{ maxWidth: 600 }}>{m.description}</p>}
          <p style={{ marginTop: 18 }}>
            Modulator's driver evaluates against the live derived signals.
            When strength is non-zero, the listed deltas apply on top of
            the Almanac's base directive — color overrides win last,
            scalar scales multiply, tint-toward amounts sum-and-clamp,
            direct-range values average.
          </p>
          <p>
            <strong>Live strength:</strong>{' '}
            <span style={{
              fontFamily: 'monospace',
              color: strength > 0.01 ? '#cfa84a' : '#666',
            }}>{strength.toFixed(3)}</span>
            {strength > 0.01
              ? ` — firing at ${Math.round(strength * 100)}% against today's weather.`
              : ' — idle. Trigger conditions are not met right now.'}
          </p>
        </main>

        <aside style={{
          width: 460,
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          background: '#141414',
          overflowY: 'auto',
          padding: 12,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <DriverCard mod={m} />
          <DeltasCard mod={m} />
          <RampCard mod={m} setField={setField} />

          <button
            onClick={() => {
              if (confirm(`Revert "${m.label || m.id}" to ship defaults? Other modulators are untouched.`)) {
                revert(m.id)
              }
            }}
            style={{
              padding: '8px 12px', borderRadius: 4,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#888',
              fontFamily: 'inherit', fontSize: 11,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}>
            ↺ Revert to ship defaults
          </button>
        </aside>
      </div>
    </div>
  )
}

// ── Driver card ─────────────────────────────────────────────────────────

function DriverCard({ mod }) {
  const replaceModulator = useMeteorologistStore(s => s.replaceModulator)
  const driver = mod.driver || {}

  const shapeOf = (d) => {
    if (!d) return 'curve'
    if (d.all) return 'all'
    if (d.in) return 'in'
    if (d.between) return 'between'
    if (d.min != null) return 'min'
    if (d.range && d.curve) return 'curve'
    return 'curve'
  }

  const setDriver = (next) => {
    replaceModulator(mod.id, { ...mod, driver: next })
  }

  return (
    <section style={cardStyle}>
      <header style={cardHeader}>Driver</header>
      <DriverNode driver={driver} shapeOf={shapeOf} onChange={setDriver} />
    </section>
  )
}

function DriverNode({ driver, shapeOf, onChange, isSub = false }) {
  const shape = shapeOf(driver)

  const switchShape = (newShape) => {
    if (newShape === 'curve')   onChange({ signal: driver.signal || 'cloudCover', range: [0, 1], curve: 'smoothstep' })
    if (newShape === 'in')      onChange({ signal: driver.signal || 'weathercode', in: [95, 96, 99] })
    if (newShape === 'between') onChange({ signal: driver.signal || 'hour_of_day', between: [0, 24] })
    if (newShape === 'min')     onChange({ signal: driver.signal || 'precipitation', min: 1 })
    if (newShape === 'all')     onChange({ all: driver.all || [{ signal: 'cloudCover', range: [0, 1], curve: 'smoothstep' }] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: isSub ? 8 : 0, border: isSub ? '1px solid rgba(255,255,255,0.06)' : 'none', borderRadius: isSub ? 4 : 0 }}>
      <Row label="Shape">
        <select value={shape} onChange={(e) => switchShape(e.target.value)} style={selectStyle}>
          {DRIVER_SHAPES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </Row>

      {shape !== 'all' && (
        <Row label="Signal">
          <select value={driver.signal || ''} onChange={(e) => onChange({ ...driver, signal: e.target.value })} style={selectStyle}>
            {SIGNAL_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </Row>
      )}

      {shape === 'curve' && (
        <>
          <Row label="Range">
            <NumPair value={driver.range || [0, 1]} step={0.1}
              onChange={(v) => onChange({ ...driver, range: v })} />
          </Row>
          <Row label="Curve">
            <select value={driver.curve || 'smoothstep'} onChange={(e) => onChange({ ...driver, curve: e.target.value })} style={selectStyle}>
              {CURVES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Row>
        </>
      )}

      {shape === 'in' && (
        <Row label="In">
          <NumArrayInput value={driver.in || []}
            onChange={(v) => onChange({ ...driver, in: v })} />
        </Row>
      )}

      {shape === 'between' && (
        <Row label="Between">
          <NumPair value={driver.between || [0, 1]} step={1}
            onChange={(v) => onChange({ ...driver, between: v })} />
        </Row>
      )}

      {shape === 'min' && (
        <Row label="Min">
          <NumInput value={driver.min ?? 0} step={0.1}
            onChange={(v) => onChange({ ...driver, min: v })} />
        </Row>
      )}

      {shape === 'all' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(driver.all || []).map((sub, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <div style={{ flex: 1 }}>
                <DriverNode driver={sub} shapeOf={shapeOf} isSub
                  onChange={(next) => {
                    const arr = (driver.all || []).slice()
                    arr[i] = next
                    onChange({ all: arr })
                  }} />
              </div>
              <button onClick={() => {
                const arr = (driver.all || []).slice()
                arr.splice(i, 1)
                onChange({ all: arr })
              }} style={btnSm}>×</button>
            </div>
          ))}
          <button onClick={() => {
            const arr = (driver.all || []).slice()
            arr.push({ signal: 'cloudCover', range: [0, 1], curve: 'smoothstep' })
            onChange({ all: arr })
          }} style={btnSm}>+ sub-driver</button>
        </div>
      )}
    </div>
  )
}

// ── Deltas card ─────────────────────────────────────────────────────────

function DeltasCard({ mod }) {
  const replaceModulator = useMeteorologistStore(s => s.replaceModulator)
  const deltas = mod.deltas || {}
  const entries = Object.entries(deltas)

  const setDelta = (path, value) => {
    const next = { ...deltas }
    if (value === undefined) delete next[path]
    else next[path] = value
    replaceModulator(mod.id, { ...mod, deltas: next })
  }
  const renamePath = (oldPath, newPath) => {
    if (oldPath === newPath) return
    if (!newPath || (newPath in deltas)) return
    const next = {}
    for (const [k, v] of Object.entries(deltas)) {
      next[k === oldPath ? newPath : k] = v
    }
    replaceModulator(mod.id, { ...mod, deltas: next })
  }

  const availablePaths = DIRECTIVE_FIELDS
    .filter(f => f.kind !== 'select')   // can't lerp/scale enum precip kinds
    .map(f => f.path)

  return (
    <section style={cardStyle}>
      <header style={cardHeader}>Deltas</header>
      {entries.length === 0 && (
        <div style={{ color: '#666', fontSize: 11 }}>No deltas. Add one below.</div>
      )}
      {entries.map(([path, delta]) => (
        <DeltaRow key={path}
          path={path}
          delta={delta}
          availablePaths={availablePaths}
          onPath={(p) => renamePath(path, p)}
          onChange={(v) => setDelta(path, v)}
          onRemove={() => setDelta(path, undefined)} />
      ))}
      <AddDeltaButton availablePaths={availablePaths} taken={new Set(Object.keys(deltas))}
        onAdd={(p) => setDelta(p, defaultDeltaFor(p))} />
    </section>
  )
}

function deltaKindOf(d) {
  if (Array.isArray(d)) return 'directRange'
  if (d?.from && d?.to) return 'colorLerp'
  if (d?.tintToward) return 'tintToward'
  if (d?.scale) return 'scale'
  return 'scale'
}

function defaultDeltaFor(path) {
  const f = DIRECTIVE_FIELDS.find(x => x.path === path)
  if (f?.kind === 'color') return { from: '#888888', to: '#888888' }
  return { scale: [1.0, 1.0] }
}

function DeltaRow({ path, delta, availablePaths, onPath, onChange, onRemove }) {
  const kind = deltaKindOf(delta)
  const field = DIRECTIVE_FIELDS.find(f => f.path === path)
  const isColor = field?.kind === 'color'

  const switchKind = (k) => {
    if (k === 'colorLerp')   onChange({ from: '#888888', to: '#888888' })
    if (k === 'scale')       onChange({ scale: [1.0, 1.0] })
    if (k === 'tintToward')  onChange({ tintToward: '#888888', amount: [0, 0.4] })
    if (k === 'directRange') onChange([0, 1])
  }

  return (
    <div style={{ padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <select value={path} onChange={(e) => onPath(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
          {availablePaths.includes(path) ? null : <option value={path}>{path}</option>}
          {availablePaths.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={kind} onChange={(e) => switchKind(e.target.value)} style={{ ...selectStyle, width: 140 }}>
          {DELTA_KINDS
            .filter(k => isColor ? k.key !== 'scale' && k.key !== 'directRange' : k.key !== 'colorLerp' && k.key !== 'tintToward' ? true : !isColor ? k.key !== 'colorLerp' && k.key !== 'tintToward' : true)
            .map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
        <button onClick={onRemove} style={btnSm}>×</button>
      </div>
      <DeltaEditor kind={kind} delta={delta} onChange={onChange} />
    </div>
  )
}

function DeltaEditor({ kind, delta, onChange }) {
  if (kind === 'colorLerp') {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Sub label="from"><ColorInput value={delta.from} onChange={(v) => onChange({ ...delta, from: v })} /></Sub>
        <Sub label="to"><ColorInput value={delta.to} onChange={(v) => onChange({ ...delta, to: v })} /></Sub>
      </div>
    )
  }
  if (kind === 'scale') {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Sub label="scale">
          <NumPair value={delta.scale || [1, 1]} step={0.05}
            onChange={(v) => onChange({ scale: v })} />
        </Sub>
      </div>
    )
  }
  if (kind === 'tintToward') {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Sub label="toward"><ColorInput value={delta.tintToward} onChange={(v) => onChange({ ...delta, tintToward: v })} /></Sub>
        <Sub label="amount">
          <NumPair value={delta.amount || [0, 0.4]} step={0.05}
            onChange={(v) => onChange({ ...delta, amount: v })} />
        </Sub>
      </div>
    )
  }
  // directRange
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <Sub label="range">
        <NumPair value={Array.isArray(delta) ? delta : [0, 1]} step={0.05}
          onChange={(v) => onChange(v)} />
      </Sub>
    </div>
  )
}

function AddDeltaButton({ availablePaths, taken, onAdd }) {
  const remaining = availablePaths.filter(p => !taken.has(p))
  if (remaining.length === 0) return null
  return (
    <div style={{ marginTop: 8 }}>
      <select value=""
        onChange={(e) => { if (e.target.value) onAdd(e.target.value) }}
        style={selectStyle}>
        <option value="">+ Add delta…</option>
        {remaining.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  )
}

// ── Ramp card ───────────────────────────────────────────────────────────

function RampCard({ mod, setField }) {
  const ramp = mod.rampMinutes ?? 30
  return (
    <section style={cardStyle}>
      <header style={cardHeader}>Ramp</header>
      <Row label={`${Math.round(ramp)} min`}>
        <input type="range" min={0} max={120} step={1} value={ramp}
          onChange={(e) => setField(mod.id, 'rampMinutes', Number(e.target.value))}
          style={{ width: '100%', accentColor: '#cfa84a' }} />
      </Row>
      <div style={{ color: '#666', fontSize: 10, lineHeight: 1.4, marginTop: 4 }}>
        Author intent for how slowly this phenomenon ramps in/out. The
        runtime tween blends at the directive-driver's cadence; this value
        is surfaced for documentation + future per-modulator override.
      </div>
    </section>
  )
}

// ── Primitives ──────────────────────────────────────────────────────────

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
      <span style={{ minWidth: 70, color: '#888', fontSize: 11 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}
function Sub({ label, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: '#666', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </span>
  )
}

function NumInput({ value, step, onChange }) {
  return (
    <input type="number" step={step} value={value ?? 0}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ...selectStyle, width: 80 }} />
  )
}
function NumPair({ value, step, onChange }) {
  const a = value?.[0] ?? 0
  const b = value?.[1] ?? 0
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <NumInput value={a} step={step} onChange={(v) => onChange([v, b])} />
      <NumInput value={b} step={step} onChange={(v) => onChange([a, v])} />
    </span>
  )
}
function NumArrayInput({ value, onChange }) {
  // Comma-separated numbers; non-finite entries dropped.
  const text = (value || []).join(',')
  return (
    <input type="text" value={text}
      onChange={(e) => {
        const arr = e.target.value.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n))
        onChange(arr)
      }}
      style={{ ...selectStyle, width: '100%' }} />
  )
}
function ColorInput({ value, onChange }) {
  const hex = (typeof value === 'string' && value[0] === '#') ? value : '#888888'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)}
        style={{ width: 24, height: 18, padding: 0, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 3, background: 'transparent', cursor: 'pointer' }} />
      <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#888' }}>{hex}</span>
    </span>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────

const shellStyle = {
  position: 'fixed', inset: 0, color: '#ddd',
  fontFamily: '-apple-system, sans-serif', fontSize: 13,
  display: 'flex', flexDirection: 'column',
  background: '#111',
}
const cardStyle = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6, padding: 10,
  display: 'flex', flexDirection: 'column', gap: 4,
}
const cardHeader = {
  color: '#fff', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
  marginBottom: 4,
}
const selectStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#ddd',
  padding: '3px 6px', borderRadius: 3,
  fontFamily: 'inherit', fontSize: 11,
}
const btnSm = {
  height: 22, padding: '0 8px', borderRadius: 4,
  fontSize: 11, lineHeight: 1, letterSpacing: '0.08em',
  textTransform: 'uppercase',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#888',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const backBtnStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#ddd',
  padding: '4px 10px', borderRadius: 4,
  fontFamily: 'inherit', fontSize: 11,
  letterSpacing: '0.08em', textTransform: 'uppercase',
  cursor: 'pointer',
}
