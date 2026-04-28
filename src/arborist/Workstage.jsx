/**
 * Workstage — single-canvas authoring surface for one species.
 *
 * Three-column layout: specimen list (left) · 3D viewport (center) · tools
 * (right). Two independent curation flags per specimen:
 *
 *   ★ Star   — free operator note. Autosaves. No system action.
 *   ☑ Check  — published-for-bake. Autosaves. Bake processes only the
 *              checked set; runtime ships baked variants.
 *
 * No Save button — both flags + tune-param edits autosave debounced.
 * "Bake checked" is the explicit finisher action.
 */
import { useState } from 'react'
import useArboristStore from './stores/useArboristStore.js'
import SpecimenViewport from './SpecimenViewport.jsx'

const formatBytes = (n) => {
  if (!n) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' MB'
  if (n >= 1000) return Math.round(n / 1000) + ' KB'
  return n + ' B'
}

export default function Workstage() {
  const species          = useArboristStore(s => s.species)
  const activeSpeciesId  = useArboristStore(s => s.activeSpeciesId)
  const setActiveSpecies = useArboristStore(s => s.setActiveSpecies)
  const specimens        = useArboristStore(s => s.specimens)
  const specimensError   = useArboristStore(s => s.specimensError)
  const starredTreeIds   = useArboristStore(s => s.starredTreeIds)
  const pickedTreeIds    = useArboristStore(s => s.pickedTreeIds)
  const tuneParamsByTreeId = useArboristStore(s => s.tuneParamsByTreeId)
  const selectedTreeId   = useArboristStore(s => s.selectedTreeId)
  const selectSpecimen   = useArboristStore(s => s.selectSpecimen)
  const toggleStar       = useArboristStore(s => s.toggleStar)
  const togglePick       = useArboristStore(s => s.togglePick)
  const setTuneParam     = useArboristStore(s => s.setTuneParam)
  const pickAllRecommended = useArboristStore(s => s.pickAllRecommended)
  const clearPicks       = useArboristStore(s => s.clearPicks)
  const bakeRunning      = useArboristStore(s => s.bakeRunning)
  const bakeError        = useArboristStore(s => s.bakeError)
  const bakeMs           = useArboristStore(s => s.bakeMs)
  const runBake          = useArboristStore(s => s.runBake)
  const manifest         = useArboristStore(s => s.manifest)
  const viewMode         = useArboristStore(s => s.viewMode)
  const setViewMode      = useArboristStore(s => s.setViewMode)

  const sp = species.find(s => s.id === activeSpeciesId)

  const [sortBy, setSortBy] = useState('treeH')   // 'treeH' | 'fileSize' | 'treeId'
  const [sortDir, setSortDir] = useState('asc')   // 'asc' | 'desc'
  const [filterStarred, setFilterStarred] = useState(false)
  const [filterPicked, setFilterPicked] = useState(false)

  const sortedSpecimens = (() => {
    let rows = [...specimens]
    if (filterStarred) rows = rows.filter(r => starredTreeIds.has(r.treeId))
    if (filterPicked)  rows = rows.filter(r => pickedTreeIds.has(r.treeId))
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

  const bakedTreeIds = new Set((manifest?.variants || []).map(v => String(v.treeId)))
  const bakedCount = bakedTreeIds.size
  const selectedIsPicked = selectedTreeId && pickedTreeIds.has(selectedTreeId)
  const selectedTune = selectedTreeId ? (tuneParamsByTreeId[selectedTreeId] || {}) : {}

  return (
    <div style={{
      position: 'fixed', inset: 0, color: '#ddd',
      fontFamily: '-apple-system, sans-serif', fontSize: 12,
      display: 'flex', flexDirection: 'column',
      background: '#111',
    }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <header style={{
        padding: '10px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 14,
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
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, color: '#888' }}>
          <span>★ {starredTreeIds.size}</span>
          <span>☑ {pickedTreeIds.size}</span>
          <span>baked {bakedCount}</span>
        </span>
      </header>

      {/* ── Bake status strip ──────────────────────────────────── */}
      {(bakeMs || bakeError) && !bakeRunning && (
        <div style={{
          padding: '5px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: bakeError ? 'rgba(248,80,80,0.08)' : 'rgba(80,200,140,0.08)',
          color: bakeError ? '#f88' : '#8c8',
          fontSize: 11,
        }}>
          {bakeError
            ? <>✗ bake failed: {bakeError}</>
            : <>✓ baked in {(bakeMs / 1000).toFixed(1)}s — {bakedCount} variants in <code>public/trees/{sp.id}/</code></>}
        </div>
      )}

      {/* ── Body — list / viewport / tools ─────────────────────── */}
      <main style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '320px 1fr 280px',
        minHeight: 0,
      }}>
        {/* ── Specimen list ─────────────────────────────────── */}
        <div style={{
          borderRight: '1px solid rgba(255,255,255,0.08)',
          overflow: 'auto',
        }}>
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center',
            padding: '8px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            position: 'sticky', top: 0, background: '#111', zIndex: 1,
          }}>
            <label style={{ cursor: 'pointer', userSelect: 'none', fontSize: 11 }}>
              <input type="checkbox" style={{ marginRight: 4 }}
                checked={filterStarred} onChange={e => setFilterStarred(e.target.checked)} />
              ★
            </label>
            <label style={{ cursor: 'pointer', userSelect: 'none', fontSize: 11 }}>
              <input type="checkbox" style={{ marginRight: 4 }}
                checked={filterPicked} onChange={e => setFilterPicked(e.target.checked)} />
              ☑
            </label>
            <span style={{ marginLeft: 'auto', color: '#666', fontSize: 11 }}>
              {sortedSpecimens.length} of {specimens.length}
            </span>
          </div>

          {specimensError && (
            <div style={{ padding: 12, color: '#f88' }}>{specimensError}</div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#888', fontSize: 11, textAlign: 'left' }}>
                <th style={thStyle({ align: 'center', width: 28 })} title="star (free note)">★</th>
                <th style={thStyle({ align: 'center', width: 28 })} title="check (publish for bake)">☑</th>
                <Th label="id"      col="treeId"   sortBy={sortBy} dir={sortDir} onClick={() => toggleSort('treeId')} />
                <Th label="height"  col="treeH"    sortBy={sortBy} dir={sortDir} onClick={() => toggleSort('treeH')} align="right" />
                <Th label="density" col="fileSize" sortBy={sortBy} dir={sortDir} onClick={() => toggleSort('fileSize')} align="right" />
              </tr>
            </thead>
            <tbody>
              {sortedSpecimens.map(s => {
                const starred = starredTreeIds.has(s.treeId)
                const picked  = pickedTreeIds.has(s.treeId)
                const baked   = bakedTreeIds.has(String(s.treeId))
                const selected = selectedTreeId === s.treeId
                return (
                  <tr key={s.treeId}
                    onClick={() => selectSpecimen(s.treeId)}
                    style={{
                      cursor: 'pointer',
                      background: selected ? 'rgba(232,184,96,0.10)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                    <td style={tdStyle({ align: 'center' })} onClick={e => { e.stopPropagation(); toggleStar(s.treeId) }}>
                      <span style={{ color: starred ? '#e8b860' : '#444', fontSize: 14, userSelect: 'none' }}>
                        {starred ? '★' : '☆'}
                      </span>
                    </td>
                    <td style={tdStyle({ align: 'center' })} onClick={e => { e.stopPropagation(); togglePick(s.treeId) }}>
                      <span style={{ color: picked ? '#8c8' : '#444', fontSize: 13, userSelect: 'none' }}>
                        {picked ? (baked ? '☑' : '☑') : '☐'}
                      </span>
                    </td>
                    <td style={tdStyle()}>
                      {s.treeId}
                      {s.recommended && (
                        <span style={{ color: '#666', fontSize: 9, marginLeft: 4, letterSpacing: 0.5 }}>rec</span>
                      )}
                      {baked && (
                        <span style={{ color: '#6a8', fontSize: 9, marginLeft: 4, letterSpacing: 0.5 }}>baked</span>
                      )}
                    </td>
                    <td style={tdStyle({ align: 'right' })}>{s.treeH?.toFixed(1)}m</td>
                    <td style={tdStyle({ align: 'right', color: '#888' })}>{formatBytes(s.fileSize)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── 3D viewport ──────────────────────────────────── */}
        <div style={{ position: 'relative', minHeight: 0 }}>
          {(() => {
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

          {selectedTreeId && (
            <div style={{
              position: 'absolute', bottom: 12, left: 12,
              padding: '6px 10px', borderRadius: 4,
              background: 'rgba(255,255,255,0.7)', color: '#222', fontSize: 11,
            }}>
              specimen {selectedTreeId}
              <span style={{ color: '#666', marginLeft: 6 }}>· drag · scroll to zoom</span>
            </div>
          )}
        </div>

        {/* ── Tools panel ──────────────────────────────────── */}
        <aside style={{
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          overflow: 'auto',
          padding: '14px 14px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* View mode toggle */}
          <section>
            <Section label="View" />
            <div style={{
              display: 'flex',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
              overflow: 'hidden',
            }}>
              <button onClick={() => setViewMode('cloud')}
                style={modeBtnStyle(viewMode === 'cloud')}>Cloud</button>
              <button onClick={() => setViewMode('skeleton')}
                disabled={!manifest}
                title={!manifest ? 'Bake the species first' : 'Show baked skeleton'}
                style={modeBtnStyle(viewMode === 'skeleton')}>Skeleton</button>
            </div>
          </section>

          {/* Tune panel (only meaningful when the selected specimen is checked) */}
          <section>
            <Section label="Tune" />
            {!selectedTreeId && (
              <div style={hintStyle}>Select a specimen.</div>
            )}
            {selectedTreeId && !selectedIsPicked && (
              <div style={hintStyle}>
                Check ☑ this specimen to tune its bake parameters.
              </div>
            )}
            {selectedTreeId && selectedIsPicked && (
              <div style={{ display: 'grid', gap: 10 }}>
                <Slider
                  label="voxel size"
                  unit="m"
                  hint="Coarser → faster bake, simpler skeleton"
                  min={0.01} max={0.10} step={0.005}
                  value={selectedTune.voxelSize ?? 0.03}
                  onChange={v => setTuneParam(selectedTreeId, 'voxelSize', v)} />
                <Slider
                  label="min radius"
                  unit="m"
                  hint="Smaller → more twigs survive"
                  min={0.001} max={0.05} step={0.001}
                  value={selectedTune.minRadius ?? 0.005}
                  onChange={v => setTuneParam(selectedTreeId, 'minRadius', v)} />
                <Slider
                  label="tip radius"
                  unit="m"
                  hint="Larger → more leaf-tip points"
                  min={0.005} max={0.10} step={0.005}
                  value={selectedTune.tipRadius ?? 0.02}
                  onChange={v => setTuneParam(selectedTreeId, 'tipRadius', v)} />
                <div style={hintStyle}>
                  Edits autosave; click <strong>Bake checked</strong> to re-render.
                </div>
              </div>
            )}
          </section>

          {/* Quick actions */}
          <section>
            <Section label="Actions" />
            <div style={{ display: 'grid', gap: 6 }}>
              <button onClick={pickAllRecommended} style={btnStyle({ block: true })}>
                Check all recommended
              </button>
              <button onClick={clearPicks} style={btnStyle({ block: true })}
                disabled={pickedTreeIds.size === 0}>
                Uncheck all
              </button>
            </div>
          </section>

          {/* Bake — primary action */}
          <section style={{ marginTop: 'auto' }}>
            <button
              onClick={runBake}
              disabled={bakeRunning || pickedTreeIds.size === 0}
              title={
                pickedTreeIds.size === 0
                  ? 'Check at least one specimen'
                  : `Bake ${pickedTreeIds.size} checked specimen${pickedTreeIds.size === 1 ? '' : 's'}`
              }
              style={btnStyle({ primary: pickedTreeIds.size > 0 && !bakeRunning, block: true, big: true })}>
              {bakeRunning
                ? 'Baking…'
                : `Bake ${pickedTreeIds.size} checked`}
            </button>
          </section>
        </aside>
      </main>
    </div>
  )
}

// ── tiny styling helpers ──────────────────────────────────────────────
const hintStyle = { color: '#888', fontSize: 11, lineHeight: 1.5 }

function Section({ label }) {
  return <div style={{
    fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.15 + 'em',
    color: '#888', marginBottom: 8,
  }}>{label}</div>
}

function Slider({ label, unit, hint, min, max, step, value, onChange }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 11, color: '#bbb', marginBottom: 2,
      }}>
        <span>{label}</span>
        <span style={{ color: '#e8b860', fontVariantNumeric: 'tabular-nums' }}>
          {value.toFixed(3)}{unit}
        </span>
      </div>
      <input type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: '#e8b860' }} />
      {hint && <div style={{ ...hintStyle, marginTop: 2 }}>{hint}</div>}
    </label>
  )
}

function btnStyle({ primary = false, block = false, big = false } = {}) {
  return {
    background: primary ? '#3a5a8a' : 'rgba(255,255,255,0.05)',
    border: '1px solid ' + (primary ? '#4a6a9a' : 'rgba(255,255,255,0.1)'),
    color: primary ? '#fff' : '#ccc',
    padding: big ? '10px 14px' : '5px 10px',
    borderRadius: 4,
    fontFamily: 'inherit',
    fontSize: big ? 13 : 12,
    fontWeight: big ? 500 : 400,
    cursor: 'pointer',
    width: block ? '100%' : undefined,
    textAlign: block ? 'center' : undefined,
  }
}
function thStyle({ align = 'left', width } = {}) {
  return {
    padding: '6px 8px', textAlign: align, fontWeight: 500,
    color: '#888', fontSize: 11, userSelect: 'none', cursor: 'pointer',
    width,
  }
}
function tdStyle({ align = 'left', color } = {}) {
  return { padding: '5px 8px', textAlign: align, color: color || '#ddd', fontSize: 12 }
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
