/**
 * Arborist — species-asset library producer.
 *
 * Two surfaces:
 *   - Library: list of declared species. Click a row → workstage.
 *   - Workstage: specimen browser + 3D viewport + pick-to-promote.
 *
 * Mode is implicit: activeSpeciesId in the store decides which view
 * renders. No router needed for two views.
 */
import { useEffect } from 'react'
import useArboristStore from './stores/useArboristStore.js'
import Workstage from './Workstage.jsx'

export default function ArboristApp() {
  const species         = useArboristStore(s => s.species)
  const speciesError    = useArboristStore(s => s.speciesError)
  const activeSpeciesId = useArboristStore(s => s.activeSpeciesId)
  const loadSpecies     = useArboristStore(s => s.loadSpecies)
  const setActiveSpecies = useArboristStore(s => s.setActiveSpecies)

  useEffect(() => { loadSpecies() }, [loadSpecies])

  if (activeSpeciesId) return <Workstage />

  // ── Library view ────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, color: '#ddd',
      fontFamily: '-apple-system, sans-serif', fontSize: 13,
      display: 'flex', flexDirection: 'column',
      background: '#111',
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
          {species.length} species
        </span>
      </header>

      <main style={{ flex: 1, padding: 18, overflow: 'auto' }}>
        {speciesError && (
          <div style={{ color: '#f88', marginBottom: 12 }}>
            Backend unreachable: {speciesError}
            <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
              Make sure <code>arborist/serve.js</code> is running on port 3334.
            </div>
          </div>
        )}

        {!speciesError && species.length === 0 && (
          <div style={{ color: '#888' }}>
            No species declared yet. Edit <code>arborist/species-map.json</code> to add one.
          </div>
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          {species.map(s => (
            <button key={s.id}
              onClick={() => setActiveSpecies(s.id)}
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
              <strong style={{ minWidth: 140 }}>{s.label}</strong>
              <em style={{ color: '#888', minWidth: 160 }}>{s.scientific}</em>
              <span style={{ color: '#666', fontSize: 11 }}>
                {s.tier} · {s.leafMorph} leaves
              </span>
              <span style={{ marginLeft: 'auto', color: '#888', fontSize: 12 }}>
                {s.seedlingsPicked} seedlings · {s.bakedAt ? `${s.variants} variants baked` : 'not baked'}
              </span>
            </button>
          ))}
        </div>
      </main>

      <footer style={{
        padding: '10px 18px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        color: '#666', fontSize: 11,
      }}>
        Click a species to enter the workstage. Tune panel + bake action coming next.
      </footer>
    </div>
  )
}
