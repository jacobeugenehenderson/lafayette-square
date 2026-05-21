/**
 * Modulators library — flat list of the 5–8 starter modulators.
 *
 * Each row shows the label, a one-line description, the active enabled
 * toggle, and a live strength badge driven by useAtmosphere.activeStrengths
 * (the per-modulator 0..1 value the runtime evaluator computed against
 * today's actual weather). Click → setActiveModulator → ModulatorEditor.
 *
 * Halo 2026-05-20, Phase 6.
 */
import useMeteorologistStore from './stores/useMeteorologistStore.js'
import useAtmosphere from '../hooks/useAtmosphere.js'

export default function ModulatorsLibrary() {
  const modulators         = useMeteorologistStore(s => s.modulators)
  const modulatorsError    = useMeteorologistStore(s => s.modulatorsError)
  const setActiveModulator = useMeteorologistStore(s => s.setActiveModulator)
  const setModulatorField  = useMeteorologistStore(s => s.setModulatorField)
  const strengths          = useAtmosphere(s => s.activeStrengths) || {}

  return (
    <main style={{ flex: 1, padding: 18, overflow: 'auto' }}>
      {modulatorsError && (
        <div style={{ color: '#f88', marginBottom: 12 }}>
          Backend unreachable: {modulatorsError}
          <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
            Make sure <code>meteorologist/serve.js</code> is running on port 3335.
          </div>
        </div>
      )}

      {!modulatorsError && modulators.length === 0 && (
        <div style={{ color: '#888' }}>No modulators loaded.</div>
      )}

      <div style={{ color: '#888', fontSize: 11, marginBottom: 12, lineHeight: 1.45 }}>
        Modulators ride on top of the Almanac's base directive: each one is
        bound to a weather signal that produces a continuous 0..1 strength,
        then applies its bundle of deltas to the directive. The strength
        badge shows what's firing against today's actual weather right now.
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {modulators.map(m => {
          const strength = strengths[m.id] ?? 0
          const firing = strength > 0.01
          return (
            <div key={m.id}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                padding: '10px 14px',
                color: '#ddd',
                fontFamily: 'inherit', fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
              <input type="checkbox" checked={m.enabled !== false}
                onChange={(e) => setModulatorField(m.id, 'enabled', e.target.checked)}
                title="Enable / disable this modulator"
                style={{ accentColor: '#cfa84a', cursor: 'pointer' }} />
              <button onClick={() => setActiveModulator(m.id)}
                style={{
                  background: 'transparent', border: 'none', color: '#ddd',
                  padding: 0, textAlign: 'left', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 13,
                  flex: 1, display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                <strong style={{ color: m.enabled === false ? '#666' : '#fff' }}>
                  {m.label || m.id}
                </strong>
                {m.description && (
                  <span style={{ color: '#888', fontSize: 11, lineHeight: 1.35 }}>
                    {m.description}
                  </span>
                )}
              </button>
              <StrengthBadge strength={strength} firing={firing} />
            </div>
          )
        })}
      </div>
    </main>
  )
}

function StrengthBadge({ strength, firing }) {
  const pct = Math.round(strength * 100)
  return (
    <span title={`Live strength: ${strength.toFixed(3)}`}
      style={{
        minWidth: 72, textAlign: 'center',
        padding: '4px 8px', borderRadius: 4,
        background: firing ? 'rgba(207,168,74,0.18)' : 'rgba(255,255,255,0.04)',
        border: '1px solid ' + (firing ? 'rgba(207,168,74,0.55)' : 'rgba(255,255,255,0.08)'),
        color: firing ? '#cfa84a' : '#666',
        fontFamily: 'monospace', fontSize: 11,
        letterSpacing: '0.05em',
      }}>
      {firing ? `${pct}%` : 'idle'}
    </span>
  )
}
