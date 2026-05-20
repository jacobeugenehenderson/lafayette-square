/**
 * Teapot library — flat list of 52 cloud presets.
 * Click → setActivePreset (Phase 1 just console.logs; Phase 2 routes to Teacup).
 */
import useMeteorologistStore from './stores/useMeteorologistStore.js'
import CloudPhoto from './CloudPhoto.jsx'

export default function TeapotLibrary() {
  const presets         = useMeteorologistStore(s => s.presets)
  const presetsError    = useMeteorologistStore(s => s.presetsError)
  const setActivePreset = useMeteorologistStore(s => s.setActivePreset)

  return (
    <main style={{ flex: 1, padding: 18, overflow: 'auto' }}>
      {presetsError && (
        <div style={{ color: '#f88', marginBottom: 12 }}>
          Backend unreachable: {presetsError}
          <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
            Make sure <code>meteorologist/serve.js</code> is running on port 3335.
          </div>
        </div>
      )}

      {!presetsError && presets.length === 0 && (
        <div style={{ color: '#888' }}>No presets loaded.</div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {presets.map(p => (
          <button key={p.id}
            onClick={() => setActivePreset(p.id)}
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
            <CloudPhoto
              presetId={p.id}
              alt={p.label || p.id}
              style={{ width: 80, height: 40, borderRadius: 4, flexShrink: 0 }}
            />
            <strong style={{ minWidth: 200 }}>{p.label || p.id}</strong>
            <span style={{ color: '#888' }}>·</span>
            <em style={{ color: '#888' }}>{p.wmo || (p.tags && p.tags[0]) || ''}</em>
          </button>
        ))}
      </div>
    </main>
  )
}
