/**
 * Workstage — single-canvas authoring surface for one species.
 *
 * Layout: header row across top (species + counters + actions),
 * specimen table on the left, 3D viewport on the right, save bar
 * across the bottom. Tune panel drops in here later (Pass C-ish).
 *
 * Per the SPEC: pickers + viewport + tune panel + save action all
 * live in this single workstage; mode switching is implicit (controls
 * gate on whether the loaded specimen is a promoted seedling).
 */
import { useEffect, useState } from 'react'
import useArboristStore from './stores/useArboristStore.js'
import SpecimenViewport from './SpecimenViewport.jsx'

const formatBytes = (n) => {
  if (!n) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' MB'
  if (n >= 1000) return Math.round(n / 1000) + ' KB'
  return n + ' B'
}

export default function Workstage() {
  const species         = useArboristStore(s => s.species)
  const activeSpeciesId = useArboristStore(s => s.activeSpeciesId)
  const setActiveSpecies= useArboristStore(s => s.setActiveSpecies)
  const specimens       = useArboristStore(s => s.specimens)
  const specimensError  = useArboristStore(s => s.specimensError)
  const recommendCount  = useArboristStore(s => s.recommendCount)
  const pickedTreeIds   = useArboristStore(s => s.pickedTreeIds)
  const pickedDirty     = useArboristStore(s => s.pickedDirty)
  const selectedTreeId  = useArboristStore(s => s.selectedTreeId)
  const saving          = useArboristStore(s => s.saving)
  const selectSpecimen  = useArboristStore(s => s.selectSpecimen)
  const togglePick      = useArboristStore(s => s.togglePick)
  const pickAllRecommended = useArboristStore(s => s.pickAllRecommended)
  const clearPicks      = useArboristStore(s => s.clearPicks)
  const saveSeedlings   = useArboristStore(s => s.saveSeedlings)
  const bakeRunning     = useArboristStore(s => s.bakeRunning)
  const bakeError       = useArboristStore(s => s.bakeError)
  const bakeMs          = useArboristStore(s => s.bakeMs)
  const runBake         = useArboristStore(s => s.runBake)
  const manifest        = useArboristStore(s => s.manifest)
  const viewMode        = useArboristStore(s => s.viewMode)
  const setViewMode     = useArboristStore(s => s.setViewMode)

  const sp = species.find(s => s.id === activeSpeciesId)

  const [sortBy, setSortBy] = useState('treeH')   // 'treeH' | 'fileSize' | 'treeId'
  const [sortDir, setSortDir] = useState('asc')   // 'asc' | 'desc'
  const [filterRecOnly, setFilterRecOnly] = useState(false)

  const sortedSpecimens = (() => {
    let rows = [...specimens]
    if (filterRecOnly) rows = rows.filter(r => r.recommended)
    rows.sort((a, b) => {
      const av = a[sortBy], bv = b[sortBy]
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  })()

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(col === 'fileSize' ? 'desc' : 'asc') }
  }

  if (!sp) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, color: '#ddd',
      fontFamily: '-apple-system, sans-serif', fontSize: 12,
      display: 'flex', flexDirection: 'column',
      background: '#111',
    }}>
      {/* Header */}
      <header style={{
        padding: '12px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <button onClick={() => setActiveSpecies(null)} style={btnStyle()}>
          ← Library
        </button>
        <strong style={{
          letterSpacing: '0.1em', textTransform: 'uppercase',
          fontSize: 12, color: '#fff',
        }}>{sp.label}</strong>
        <span style={{ color: '#888' }}>
          <em>{sp.scientific}</em> · {sp.tier} · {sp.leafMorph} leaves · {sp.barkMorph || 'default'} bark
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: '#888' }}>
            {pickedTreeIds.size} / {recommendCount} picked
            {pickedDirty && <span style={{ color: '#e8b860' }}>  · unsaved</span>}
          </span>
          <button onClick={pickAllRecommended} style={btnStyle()}>Pick recommended</button>
          <button onClick={clearPicks} style={btnStyle()} disabled={pickedTreeIds.size === 0}>Clear</button>
          <button
            onClick={saveSeedlings}
            disabled={!pickedDirty || saving}
            style={btnStyle({ primary: pickedDirty })}>
            {saving ? 'Saving…' : 'Save seedlings'}
          </button>
          <button
            onClick={runBake}
            disabled={bakeRunning || pickedDirty || pickedTreeIds.size === 0}
            title={
              pickedDirty ? 'Save seedlings before baking' :
              pickedTreeIds.size === 0 ? 'Pick at least one specimen first' :
              sp.bakedAt ? 'Re-bake this species' : 'Bake this species'
            }
            style={btnStyle({ primary: !pickedDirty && pickedTreeIds.size > 0 })}>
            {bakeRunning ? 'Baking…' : sp.bakedAt ? 'Re-bake' : 'Bake'}
          </button>
        </span>
      </header>

      {/* Bake status strip — shown after a bake completes or fails. Cleared
          when the next bake starts. */}
      {(bakeMs || bakeError) && !bakeRunning && (
        <div style={{
          padding: '6px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: bakeError ? 'rgba(248,80,80,0.08)' : 'rgba(80,200,140,0.08)',
          color: bakeError ? '#f88' : '#8c8',
          fontSize: 11, display: 'flex', gap: 12,
        }}>
          {bakeError
            ? <>✗ bake failed: {bakeError}</>
            : <>✓ baked in {(bakeMs / 1000).toFixed(1)}s — {sp.variants} variants in <code>public/trees/{sp.id}/</code></>}
        </div>
      )}

      {/* Body — table left, viewport right */}
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '440px 1fr', minHeight: 0 }}>
        {/* Specimen table */}
        <div style={{
          borderRight: '1px solid rgba(255,255,255,0.08)',
          overflow: 'auto',
        }}>
          <div style={{
            display: 'flex', gap: 12, alignItems: 'center',
            padding: '8px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            position: 'sticky', top: 0, background: '#111', zIndex: 1,
          }}>
            <label style={{ cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" style={{ marginRight: 6 }}
                checked={filterRecOnly} onChange={e => setFilterRecOnly(e.target.checked)} />
              recommended only
            </label>
            <span style={{ marginLeft: 'auto', color: '#666' }}>
              {sortedSpecimens.length} of {specimens.length}
            </span>
          </div>

          {specimensError && (
            <div style={{ padding: 12, color: '#f88' }}>{specimensError}</div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#888', fontSize: 11, textAlign: 'left' }}>
                <Th label="treeId"  col="treeId"   sortBy={sortBy} dir={sortDir} onClick={() => toggleSort('treeId')} />
                <Th label="height"  col="treeH"    sortBy={sortBy} dir={sortDir} onClick={() => toggleSort('treeH')} align="right" />
                <Th label="density" col="fileSize" sortBy={sortBy} dir={sortDir} onClick={() => toggleSort('fileSize')} align="right" />
                <th style={thStyle({ align: 'center', width: 40 })}>★</th>
                <th style={thStyle({ align: 'center', width: 50 })}>pick</th>
              </tr>
            </thead>
            <tbody>
              {sortedSpecimens.map(s => {
                const picked = pickedTreeIds.has(s.treeId)
                const selected = selectedTreeId === s.treeId
                return (
                  <tr key={s.treeId}
                    onClick={() => selectSpecimen(s.treeId)}
                    style={{
                      cursor: 'pointer',
                      background: selected ? 'rgba(232,184,96,0.10)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                    <td style={tdStyle()}>{s.treeId}</td>
                    <td style={tdStyle({ align: 'right' })}>{s.treeH?.toFixed(1)}m</td>
                    <td style={tdStyle({ align: 'right', color: '#888' })}>{formatBytes(s.fileSize)}</td>
                    <td style={tdStyle({ align: 'center' })}>
                      {s.recommended && <span style={{ color: '#e8b860' }}>★</span>}
                    </td>
                    <td style={tdStyle({ align: 'center' })} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={picked} onChange={() => togglePick(s.treeId)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 3D viewport */}
        <div style={{ position: 'relative', minHeight: 0 }}>
          {(() => {
            // Pick the right URL pair based on the active viewMode + the
            // currently-selected specimen. In skeleton mode, look up the
            // manifest variant whose treeId matches; cache-bust the GLB
            // URL with the manifest's bakedAt so re-bakes replace the
            // cached gl-tf instance.
            const v = manifest?.variants?.find(x => String(x.treeId) === String(selectedTreeId))
            const cloudUrl = selectedTreeId ? `/api/arborist/specimens/${selectedTreeId}/preview.ply` : null
            const glbUrl   = v ? `/trees/${activeSpeciesId}/${v.skeleton}?v=${manifest.bakedAt}` : null
            const viewKey  = `${viewMode}:${selectedTreeId || 'none'}:${manifest?.bakedAt || 0}`
            return (
              <SpecimenViewport
                mode={viewMode}
                cloudUrl={cloudUrl}
                glbUrl={glbUrl}
                viewKey={viewKey}
              />
            )
          })()}

          {/* Mode toggle (top-right) */}
          <div style={{
            position: 'absolute', top: 12, right: 12,
            display: 'flex', gap: 0,
            background: 'rgba(0,0,0,0.4)', borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.1)',
            overflow: 'hidden',
          }}>
            <button
              onClick={() => setViewMode('cloud')}
              style={modeBtnStyle(viewMode === 'cloud')}>
              Cloud
            </button>
            <button
              onClick={() => setViewMode('skeleton')}
              disabled={!manifest}
              title={!manifest ? 'Bake the species first' : 'Show baked skeleton'}
              style={modeBtnStyle(viewMode === 'skeleton')}>
              Skeleton
            </button>
          </div>

          {selectedTreeId && (
            <div style={{
              position: 'absolute', bottom: 12, left: 12,
              padding: '6px 10px', borderRadius: 4,
              background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11,
            }}>
              specimen {selectedTreeId}
              {viewMode === 'skeleton' && manifest?.variants?.find(v => String(v.treeId) === String(selectedTreeId)) && (
                <span style={{ color: '#9c9', marginLeft: 8 }}>
                  · variant {manifest.variants.find(v => String(v.treeId) === String(selectedTreeId)).id}
                </span>
              )}
              <span style={{ color: '#888', marginLeft: 8 }}>· drag to orbit, scroll to zoom</span>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// ── Tiny styling helpers (no CSS file for v1; one isolated workstage) ──
function btnStyle({ primary = false } = {}) {
  return {
    background: primary ? '#3a5a8a' : 'rgba(255,255,255,0.05)',
    border: '1px solid ' + (primary ? '#4a6a9a' : 'rgba(255,255,255,0.1)'),
    color: primary ? '#fff' : '#ccc',
    padding: '5px 10px', borderRadius: 4,
    fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
  }
}
function thStyle({ align = 'left', width } = {}) {
  return {
    padding: '6px 10px', textAlign: align, fontWeight: 500,
    color: '#888', fontSize: 11, userSelect: 'none', cursor: 'pointer',
    width,
  }
}
function tdStyle({ align = 'left', color } = {}) {
  return { padding: '5px 10px', textAlign: align, color: color || '#ddd', fontSize: 12 }
}
function Th({ label, col, sortBy, dir, onClick, align = 'left' }) {
  const active = sortBy === col
  return (
    <th style={thStyle({ align })} onClick={onClick}>
      {label}
      {active && <span style={{ marginLeft: 4, color: '#e8b860' }}>{dir === 'asc' ? '▴' : '▾'}</span>}
    </th>
  )
}
function modeBtnStyle(active) {
  return {
    background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
    color: active ? '#fff' : '#aaa',
    border: 'none',
    padding: '5px 12px',
    fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
  }
}
