/**
 * Conditions library — flat list of 16 weather rules.
 * Click → setActiveCondition (Phase 1 just console.logs; Phase 3 routes to editor).
 */
import useMeteorologistStore from './stores/useMeteorologistStore.js'

export default function ConditionsLibrary() {
  const conditions         = useMeteorologistStore(s => s.conditions)
  const conditionsError    = useMeteorologistStore(s => s.conditionsError)
  const setActiveCondition = useMeteorologistStore(s => s.setActiveCondition)

  return (
    <main style={{ flex: 1, padding: 18, overflow: 'auto' }}>
      {conditionsError && (
        <div style={{ color: '#f88', marginBottom: 12 }}>
          Backend unreachable: {conditionsError}
          <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
            Make sure <code>meteorologist/serve.js</code> is running on port 3335.
          </div>
        </div>
      )}

      {!conditionsError && conditions.length === 0 && (
        <div style={{ color: '#888' }}>No conditions loaded.</div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {conditions.map(c => {
          const todHint = c.tod || c.todHint || ''
          return (
            <button key={c.id}
              onClick={() => setActiveCondition(c.id)}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                padding: '12px 14px',
                textAlign: 'left',
                cursor: 'pointer',
                color: '#ddd',
                fontFamily: 'inherit', fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
              <strong style={{ minWidth: 220 }}>{c.label || c.id}</strong>
              {todHint && <>
                <span style={{ color: '#888' }}>·</span>
                <em style={{ color: '#888' }}>{todHint}</em>
              </>}
            </button>
          )
        })}
      </div>
    </main>
  )
}
