/**
 * Arborist — species-asset library producer.
 *
 * Authors per-species seedlings (picked specimens + tune params) and bakes
 * them into runtime variants. Mirrors Cartograph's helper-app pattern; see
 * arborist/SPEC.md for the full contract.
 *
 * v1 surface:
 *   - One workstage. Pickers at top (species / specimen / variant slot),
 *     3D viewport center, tune panel side.
 *   - Tune controls disabled until a specimen is promoted to a seedling.
 *   - Bake gates on a saved seedling library for the species.
 */
import { useEffect, useState } from 'react'

export default function ArboristApp() {
  const [species, setSpecies] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/arborist/species')
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(data => setSpecies(data.species || []))
      .catch(err => setError(String(err)))
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, color: '#ddd',
      fontFamily: '-apple-system, sans-serif', fontSize: 13,
      display: 'flex', flexDirection: 'column',
    }}>
      <header style={{
        padding: '14px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <strong style={{
          letterSpacing: '0.15em', textTransform: 'uppercase',
          fontSize: 12, color: '#fff',
        }}>Arborist</strong>
        <span style={{ color: '#888' }}>species library producer</span>
        <span style={{ marginLeft: 'auto', color: '#888' }}>
          {species.length} species in library
        </span>
      </header>

      <main style={{ flex: 1, padding: 18, overflow: 'auto' }}>
        {error && (
          <div style={{ color: '#f88', marginBottom: 12 }}>
            Backend unreachable: {error}
            <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
              Make sure <code>arborist/serve.js</code> is running on port 3334.
              <br />Try: <code>npm run dev</code> (launches everything) or <code>npm run dev:arborist</code> alone.
            </div>
          </div>
        )}
        {!error && species.length === 0 && (
          <div style={{ color: '#888' }}>
            No species mapped yet. The workstage will surface every species
            from <code>arborist/species-map.json</code> once that ships.
          </div>
        )}
        {species.map(s => (
          <div key={s.id} style={{
            padding: 12,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <strong>{s.label}</strong>
            <span style={{ color: '#888', marginLeft: 8 }}>
              <em>{s.scientific}</em> · {s.tier} · {s.variants ?? 0} variants
              {s.bakedAt ? ' · baked' : ' · not baked'}
            </span>
          </div>
        ))}
      </main>

      <footer style={{
        padding: '10px 18px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        color: '#666', fontSize: 11,
      }}>
        Scaffold. Specimen Browser, Tune panel, Inspector all coming next.
        See <code>arborist/SPEC.md</code> for the full plan.
      </footer>
    </div>
  )
}
