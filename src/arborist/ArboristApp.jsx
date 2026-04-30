/**
 * Arborist — species-asset library producer.
 *
 * Three surfaces:
 *   - Library: list of declared species. Click a row → workstage.
 *   - Workstage: specimen browser + 3D viewport + pick-to-promote.
 *   - Grove: every rated variant across the library on one ground plane,
 *           for spotting duds and toggling exclude.
 *
 * Mode is implicit: activeSpeciesId + groveOpen in the store decide which
 * view renders. No router needed.
 */
import { useEffect, useState } from 'react'
import useArboristStore from './stores/useArboristStore.js'
import Workstage from './Workstage.jsx'
import Grove from './Grove.jsx'

export default function ArboristApp() {
  const species         = useArboristStore(s => s.species)
  const speciesError    = useArboristStore(s => s.speciesError)
  const activeSpeciesId = useArboristStore(s => s.activeSpeciesId)
  const groveOpen       = useArboristStore(s => s.groveOpen)
  const setGroveOpen    = useArboristStore(s => s.setGroveOpen)
  const loadSpecies     = useArboristStore(s => s.loadSpecies)
  const setActiveSpecies = useArboristStore(s => s.setActiveSpecies)
  const loadLooks       = useArboristStore(s => s.loadLooks)

  useEffect(() => { loadSpecies() }, [loadSpecies])
  useEffect(() => { loadLooks() }, [loadLooks])
  // When the Arborist window regains focus, refresh Looks so a Look
  // created in Cartograph in another tab shows up without a manual reload.
  useEffect(() => {
    const onFocus = () => loadLooks()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadLooks])

  if (groveOpen) return <Grove />
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
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <LookPicker />
          <button onClick={() => setGroveOpen(true)}
            title="See every rated variant on one ground plane"
            style={{
              background: 'rgba(106,154,74,0.15)',
              border: '1px solid rgba(106,154,74,0.4)',
              color: '#bce0a0',
              padding: '5px 12px', borderRadius: 4,
              fontFamily: 'inherit', fontSize: 12,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}>
            Grove →
          </button>
          <span style={{ color: '#888' }}>{species.length} species</span>
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
              <span style={{
                marginLeft: 8,
                fontSize: 10, padding: '2px 6px', borderRadius: 3,
                background: s.source === 'glb' ? 'rgba(96,180,232,0.15)' : 'rgba(232,184,96,0.15)',
                color:      s.source === 'glb' ? '#7fb8e4' : '#e8b860',
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                {s.source || 'lidar'}
              </span>
              <span style={{ marginLeft: 'auto', color: '#888', fontSize: 12 }}>
                {s.bakedAt
                  ? `${s.variants} variant${s.variants === 1 ? '' : 's'} · ${new Date(s.bakedAt).toLocaleDateString()}`
                  : (s.source === 'glb' ? 'no glb published yet' : `${s.seedlingsPicked} seedlings · not baked`)}
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

// ── Look picker ───────────────────────────────────────────────────────
// Lists every Look from Cartograph + a "+ New Look" row at the bottom.
// The active Look is the curation target — Workstage's "Add to Look"
// (pass 2) and Grove's roster will both write to the active Look's
// design.json `trees` field.
function LookPicker() {
  const looks         = useArboristStore(s => s.looks)
  const activeLookId  = useArboristStore(s => s.activeLookId)
  const defaultLookId = useArboristStore(s => s.defaultLookId)
  const looksError    = useArboristStore(s => s.looksError)
  const setActiveLook = useArboristStore(s => s.setActiveLook)
  const createLook    = useArboristStore(s => s.createLook)

  const active = looks.find(l => l.id === activeLookId)

  const onChange = async (e) => {
    const v = e.target.value
    if (v === '__new__') {
      const name = window.prompt('New Look name')
      if (!name) return
      await createLook(name)
      return
    }
    setActiveLook(v)
  }

  if (looksError) {
    return (
      <span style={{ color: '#f88', fontSize: 11 }} title={looksError}>
        Looks unreachable
      </span>
    )
  }

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#888' }}>
      <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Look</span>
      <select
        value={activeLookId || ''}
        onChange={onChange}
        title={active ? `Curating: ${active.name}` : 'Pick a Look to curate'}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#ddd',
          padding: '4px 8px', borderRadius: 4,
          fontFamily: 'inherit', fontSize: 12,
          minWidth: 160,
        }}
      >
        {looks.length === 0 && <option value="">(no looks)</option>}
        {looks.map(l => (
          <option key={l.id} value={l.id}>
            {l.name}{l.id === defaultLookId ? ' ★' : ''}
          </option>
        ))}
        <option disabled>──────────</option>
        <option value="__new__">+ New Look…</option>
      </select>
    </label>
  )
}
