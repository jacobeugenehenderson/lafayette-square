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
import { useState, useEffect, useRef } from 'react'
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
  const selectedVariantId = useArboristStore(s => s.selectedVariantId)
  const selectVariant    = useArboristStore(s => s.selectVariant)
  const activeLod        = useArboristStore(s => s.activeLod)
  const setActiveLod     = useArboristStore(s => s.setActiveLod)

  const sp = species.find(s => s.id === activeSpeciesId)
  const isGlb = sp?.source === 'glb'

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

  // GLB-source species use a much simpler layout: variants are pre-baked,
  // the operator just previews each + picks an LOD to inspect.
  if (isGlb) {
    return (
      <WorkstageGlb
        sp={sp}
        manifest={manifest}
        selectedVariantId={selectedVariantId}
        selectVariant={selectVariant}
        activeLod={activeLod}
        setActiveLod={setActiveLod}
        setActiveSpecies={setActiveSpecies}
      />
    )
  }

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

// ── Rate panel — operator overrides for a GLB variant ────────────────
// Each control writes to `variant.<field>Override`; the picker reads
// override-or-base. Quality 1 = "trash, never use"; runtime excludes.
// `excluded` is a hard kill switch independent of quality.
function RateVariant({ variant, eff, onSet }) {
  const [notes, setNotes] = useState(variant.operatorNotes ?? '')
  useEffect(() => { setNotes(variant.operatorNotes ?? '') }, [variant.id])

  // Look roster membership for this variant. A variant can belong to
  // many Looks; render a checkbox per Look so the operator curates
  // each independently. Default Look gets a star marker.
  const activeSpeciesId = useArboristStore(s => s.activeSpeciesId)
  const looks           = useArboristStore(s => s.looks)
  const defaultLookId   = useArboristStore(s => s.defaultLookId)
  const looksRosters    = useArboristStore(s => s.looksRosters)
  const toggleInLook    = useArboristStore(s => s.toggleInLook)
  const isInLook = (lookId) => (looksRosters[lookId] || []).some(
    t => t.species === activeSpeciesId && Number(t.variantId) === Number(variant.id),
  )

  const baseQuality = variant.quality ?? 4
  const baseStyles = variant.styles ?? ['realistic']
  const baseScale = variant.normalizeScale ?? 1

  const setQuality = (q) => onSet('qualityOverride', q === baseQuality ? null : q)
  const toggleStyle = (s) => {
    const cur = new Set(eff.styles)
    if (cur.has(s)) cur.delete(s); else cur.add(s)
    const next = STYLE_TAGS.filter(t => cur.has(t))
    const same = next.length === baseStyles.length && next.every((t, i) => t === baseStyles[i])
    onSet('stylesOverride', same ? null : next)
  }
  const setScale = (n) => onSet('scaleOverride', Math.abs(n - baseScale) < 1e-4 ? null : n)
  const toggleExcluded = () => onSet('excluded', eff.excluded ? null : true)
  const saveNotes = () => onSet('operatorNotes', notes.trim() ? notes : null)
  const setPos = (axis, val) => {
    const next = { x: eff.position[0], y: eff.position[1], z: eff.position[2] }
    next[axis] = val
    const allZero = next.x === 0 && next.y === 0 && next.z === 0
    onSet('positionOverride', allZero ? null : next)
  }
  const resetPos = () => onSet('positionOverride', null)

  const hasOverrides = (
    variant.qualityOverride != null ||
    variant.stylesOverride != null ||
    variant.scaleOverride != null ||
    variant.positionOverride != null ||
    variant.rotationOverride != null ||
    variant.excluded === true ||
    (variant.operatorNotes != null && variant.operatorNotes !== '')
  )
  const revertAll = () => {
    if (!confirm('Discard all operator edits on this variant?')) return
    for (const k of ['qualityOverride', 'stylesOverride', 'scaleOverride', 'positionOverride', 'rotationOverride', 'excluded', 'operatorNotes']) {
      onSet(k, null)
    }
  }

  return (
    <section>
      {/* Look rosters — primary curation gate. A variant can belong to
          many Looks; one toggle per Look here. Quality / styles / scale
          below describe what the variant IS. Exclude (further down) is
          a separate kill switch that overrides Look membership. */}
      <div style={{ marginBottom: 12 }}>
        <Section label="Looks" />
        {looks.length === 0 ? (
          <div style={hintStyle}>Looks unreachable. Is Cartograph running?</div>
        ) : (
          <div style={{ display: 'grid', gap: 4 }}>
            {looks.map(l => {
              const on = isInLook(l.id)
              const isDefault = l.id === defaultLookId
              return (
                <button key={l.id}
                  onClick={() => toggleInLook(l.id, activeSpeciesId, variant.id)}
                  title={`${on ? 'Remove from' : 'Add to'} ${l.name}`}
                  style={{
                    ...btnStyle({ block: true }),
                    background: on ? '#3a6a3a' : 'rgba(255,255,255,0.05)',
                    border: '1px solid ' + (on ? '#5a8a5a' : 'rgba(255,255,255,0.1)'),
                    color: on ? '#fff' : '#ccc',
                    textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 10px',
                  }}>
                  <span style={{
                    width: 16, textAlign: 'center', fontSize: 12,
                    color: on ? '#fff' : '#666',
                  }}>
                    {on ? '✓' : ''}
                  </span>
                  <span style={{ flex: 1 }}>{l.name}</span>
                  {isDefault && (
                    <span style={{ color: on ? '#dceec8' : '#888', fontSize: 10 }}>★</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Section label="Rate" />
        {hasOverrides && (
          <button onClick={revertAll}
            title="Discard all operator edits on this variant"
            style={{ ...btnStyle(), padding: '2px 8px', fontSize: 10, color: '#e8a060' }}>
            Revert
          </button>
        )}
      </div>

      {/* Fitness-for-purpose ladder.
           0 = Untouched (sentinel — runtime ignores until rated)
           1 = Trash (rejected, never use)
           2 = Fill (background only)
           3 = Mid (foreground/middle distance)
           4 = Hero (close-up showcase) */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#bbb', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span>rating</span>
          {variant.qualityOverride != null && (
            <span style={{ color: '#e8b860' }}>override</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { n: 0, label: 'Untouched', tip: 'Unrated — excluded from runtime', dark: '#444', light: '#666' },
            { n: 1, label: 'Trash',     tip: 'Rejected — runtime excludes',    dark: '#7a3a3a', light: '#9a4a4a' },
            { n: 2, label: 'Fill',      tip: 'Background distance only',       dark: '#3a5a8a', light: '#4a6a9a' },
            { n: 3, label: 'Mid',       tip: 'Foreground / midground',         dark: '#3a5a8a', light: '#4a6a9a' },
            { n: 4, label: 'Hero',      tip: 'Close-up showcase',              dark: '#5a8a3a', light: '#6a9a4a' },
          ].map(({ n, label, tip, dark, light }) => {
            const active = eff.quality === n
            return (
              <button key={n} onClick={() => setQuality(n)} title={tip}
                style={{
                  flex: 1, padding: '6px 2px', borderRadius: 3, fontSize: 10,
                  background: active ? dark : 'rgba(255,255,255,0.05)',
                  color: active ? '#fff' : '#888',
                  border: '1px solid ' + (active ? light : 'rgba(255,255,255,0.1)'),
                  cursor: 'pointer',
                }}>
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Styles */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#bbb', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span>styles</span>
          {variant.stylesOverride != null && (
            <span style={{ color: '#e8b860' }}>override</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {STYLE_TAGS.map(s => {
            const on = eff.styles.includes(s)
            return (
              <button key={s} onClick={() => toggleStyle(s)}
                style={{
                  padding: '4px 8px', borderRadius: 3, fontSize: 11,
                  background: on ? '#3a5a8a' : 'rgba(255,255,255,0.05)',
                  color: on ? '#fff' : '#888',
                  border: '1px solid ' + (on ? '#4a6a9a' : 'rgba(255,255,255,0.1)'),
                  cursor: 'pointer',
                }}>
                {s}
              </button>
            )
          })}
        </div>
      </div>

      {/* Transform readout — manipulation happens in the viewport via
          drag. Numbers here for verification + a single reset action. */}
      <div style={{ marginBottom: 10, display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '2px 8px', alignItems: 'center', fontSize: 11 }}>
        <span style={{ color: '#bbb' }}>scale</span>
        <span style={{ color: variant.scaleOverride != null ? '#e8b860' : '#888', fontVariantNumeric: 'tabular-nums' }}>
          ×{eff.scale.toFixed(2)} <span style={{ color: '#666' }}>(auto ×{baseScale.toFixed(2)})</span>
        </span>
        {variant.scaleOverride != null
          ? <button onClick={() => onSet('scaleOverride', null)} style={{ ...btnStyle(), padding: '1px 6px', fontSize: 10 }}>reset</button>
          : <span />}
        <span style={{ color: '#bbb' }}>pos</span>
        <span style={{ color: variant.positionOverride ? '#e8b860' : '#888', fontVariantNumeric: 'tabular-nums' }}>
          {eff.position[0].toFixed(2)}, {eff.position[1].toFixed(2)}, {eff.position[2].toFixed(2)}
        </span>
        {variant.positionOverride
          ? <button onClick={resetPos} style={{ ...btnStyle(), padding: '1px 6px', fontSize: 10 }}>reset</button>
          : <span />}
        <span style={{ color: '#bbb' }}>rot</span>
        <span style={{ color: variant.rotationOverride ? '#e8b860' : '#888', fontVariantNumeric: 'tabular-nums' }}>
          {(eff.rotation[0] * 180 / Math.PI).toFixed(0)}°, {(eff.rotation[1] * 180 / Math.PI).toFixed(0)}°, {(eff.rotation[2] * 180 / Math.PI).toFixed(0)}°
        </span>
        {variant.rotationOverride
          ? <button onClick={() => onSet('rotationOverride', null)} style={{ ...btnStyle(), padding: '1px 6px', fontSize: 10 }}>reset</button>
          : <span />}
      </div>

      {/* Tilt — X/Z fine-tune. Y rotation is the bullseye drag. */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#bbb', marginBottom: 4 }}>tilt (degrees)</div>
        {[['x', 0, 'X'], ['z', 2, 'Z']].map(([axis, i, label]) => (
          <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ width: 10, fontSize: 11, color: '#888' }}>{label}</span>
            <input type="range"
              min={-30} max={30} step={1}
              value={eff.rotation[i] * 180 / Math.PI}
              onChange={e => {
                const r = [...eff.rotation]
                r[i] = parseFloat(e.target.value) * Math.PI / 180
                const allZero = r.every(x => Math.abs(x) < 1e-4)
                onSet('rotationOverride', allZero ? null : { x: r[0], y: r[1], z: r[2] })
              }}
              style={{ flex: 1, accentColor: '#e8b860' }} />
            <span style={{ width: 32, textAlign: 'right', fontSize: 10, color: '#aaa', fontVariantNumeric: 'tabular-nums' }}>
              {(eff.rotation[i] * 180 / Math.PI).toFixed(0)}°
            </span>
          </div>
        ))}
        <button
          onClick={() => {
            // Y-up flip: toggle a -90° X tilt (root-cause for Z-up packs)
            const cur = eff.rotation[0]
            const next = Math.abs(cur + Math.PI / 2) < 0.01 ? 0 : -Math.PI / 2
            const r = [next, eff.rotation[1], eff.rotation[2]]
            const allZero = r.every(x => Math.abs(x) < 1e-4)
            onSet('rotationOverride', allZero ? null : { x: r[0], y: r[1], z: r[2] })
          }}
          style={{ ...btnStyle({ block: true }), marginTop: 4, fontSize: 11 }}>
          {Math.abs(eff.rotation[0] + Math.PI / 2) < 0.01 ? 'Z-up applied — clear' : 'Y-up trunk (90° X)'}
        </button>
      </div>

      {/* Exclude toggle */}
      <div style={{ marginBottom: 10 }}>
        <button onClick={toggleExcluded}
          style={{
            ...btnStyle({ block: true }),
            background: eff.excluded ? '#7a3a3a' : 'rgba(255,255,255,0.05)',
            color: eff.excluded ? '#fff' : '#ccc',
            border: '1px solid ' + (eff.excluded ? '#9a4a4a' : 'rgba(255,255,255,0.1)'),
          }}>
          {eff.excluded ? 'Excluded from runtime — click to allow' : 'Exclude from runtime'}
        </button>
      </div>

      {/* Notes */}
      <div>
        <div style={{ fontSize: 11, color: '#bbb', marginBottom: 4 }}>notes</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="vendor quirk, manual fixes…"
          style={{
            width: '100%', minHeight: 50, resize: 'vertical',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#ddd', borderRadius: 3, padding: '6px 8px',
            fontFamily: 'inherit', fontSize: 11,
          }} />
      </div>
    </section>
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
function modeBtnStyle(active) {
  return {
    flex: 1,
    background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
    color: active ? '#fff' : '#aaa',
    border: 'none',
    padding: '6px 12px',
    fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
  }
}

// ── GLB-source Workstage ──────────────────────────────────────────────
// Variants come pre-baked from publish-glb.js. No specimen browse, no
// star/check, no tune sliders. Operator picks a variant and an LOD to
// inspect; that's it.
// Style tags currently in use across the library. Operator-overridable
// per variant. Order is the picker's filter precedence (realistic first
// since most Looks default to it).
const STYLE_TAGS = ['realistic', 'stylized', 'lowpoly', 'winter', 'pointcloud']

// Tags most operators won't need but should be settable for completeness.
function effective(variant) {
  if (!variant) return {}
  const pos = variant.positionOverride ?? { x: 0, y: 0, z: 0 }
  const rot = variant.rotationOverride ?? { x: 0, y: 0, z: 0 }
  return {
    quality: variant.qualityOverride ?? variant.quality ?? 4,
    styles: variant.stylesOverride ?? variant.styles ?? ['realistic'],
    scale: variant.scaleOverride ?? variant.normalizeScale ?? 1,
    excluded: variant.excluded === true,
    position: [pos.x ?? 0, pos.y ?? 0, pos.z ?? 0],
    rotation: [rot.x ?? 0, rot.y ?? 0, rot.z ?? 0],
  }
}

function WorkstageGlb({
  sp, manifest,
  selectedVariantId, selectVariant,
  activeLod, setActiveLod,
  setActiveSpecies,
}) {
  const setVariantOverride = useArboristStore(s => s.setVariantOverride)
  const setSpeciesOverride = useArboristStore(s => s.setSpeciesOverride)
  const allSpecies = useArboristStore(s => s.species)
  // Persist camera state across Canvas remounts (variant / LOD / species swap).
  const cameraStateRef = useRef({ distance: 22, height: 8 })
  const variants = manifest?.variants || []
  const usableVariants = variants.filter(v => v.excluded !== true)
  const variant = usableVariants.find(v => v.id === selectedVariantId) || usableVariants[0]
  const eff = effective(variant)
  const displayName = manifest?.displayName ?? manifest?.label ?? sp.label
  const [editingName, setEditingName] = useState(false)
  const [pendingName, setPendingName] = useState(displayName)
  useEffect(() => { setPendingName(displayName) }, [displayName, manifest?.species])

  // Arrow-key navigation: walk the library variant-by-variant. Right
  // arrow = next variant in this species, or first variant of next
  // species. Left = reverse.
  const advance = (delta) => {
    const variantsHere = (manifest?.variants || []).filter(v => v.excluded !== true)
    const curIdx = variantsHere.findIndex(v => v.id === (variant?.id))
    const nextIdx = curIdx + delta
    if (nextIdx >= 0 && nextIdx < variantsHere.length) {
      selectVariant(variantsHere[nextIdx].id)
      return
    }
    // Cross species boundary.
    const speciesList = (allSpecies || []).filter(s => s.source === 'glb' && s.variants > 0)
    const speciesSorted = [...speciesList].sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id))
    const spIdx = speciesSorted.findIndex(s => s.id === sp.id)
    if (spIdx === -1) return
    const targetIdx = spIdx + delta
    if (targetIdx < 0 || targetIdx >= speciesSorted.length) return
    setActiveSpecies(speciesSorted[targetIdx].id)
  }
  useEffect(() => {
    const onKey = (e) => {
      // Don't hijack typing in inputs (e.g. rename).
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowRight') { e.preventDefault(); advance(+1) }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); advance(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const lodUrl = variant?.skeletons?.[activeLod]
  const glbUrl = lodUrl ? `/trees/${sp.id}/${lodUrl}?v=${manifest.bakedAt}` : null
  const viewKey = `${sp.id}:${variant?.id || 'none'}:${activeLod}:${manifest?.bakedAt || 0}`

  return (
    <div style={{
      position: 'fixed', inset: 0, color: '#ddd',
      fontFamily: '-apple-system, sans-serif', fontSize: 12,
      display: 'flex', flexDirection: 'column',
      background: '#111',
    }}>
      <header style={{
        padding: '10px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button onClick={() => setActiveSpecies(null)} style={btnStyle()}>
          ← Library
        </button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => advance(-1)} title="Previous variant (←)" style={btnStyle()}>‹</button>
          <button onClick={() => advance(+1)} title="Next variant (→)" style={btnStyle()}>›</button>
        </div>
        {editingName ? (
          <input
            autoFocus
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            onBlur={() => {
              setEditingName(false)
              const trimmed = pendingName.trim()
              const wasOverridden = manifest?.displayName != null
              if (!trimmed || trimmed === (manifest?.label ?? sp.label)) {
                if (wasOverridden) setSpeciesOverride('displayName', null)
              } else if (trimmed !== displayName) {
                setSpeciesOverride('displayName', trimmed)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur()
              if (e.key === 'Escape') { setPendingName(displayName); setEditingName(false) }
            }}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(232,184,96,0.4)',
              color: '#fff',
              padding: '3px 8px',
              borderRadius: 3,
              fontSize: 13,
              fontFamily: 'inherit',
              letterSpacing: '0.05em',
              minWidth: 200,
            }}
          />
        ) : (
          <strong
            onClick={() => setEditingName(true)}
            title="Click to rename"
            style={{
              letterSpacing: '0.1em', textTransform: 'uppercase',
              fontSize: 12, color: '#fff', cursor: 'text',
              padding: '2px 4px', borderRadius: 3,
            }}
          >
            {displayName}
          </strong>
        )}
        <span style={{ color: '#888' }}>
          <em>{sp.scientific}</em> · {sp.tier} · {sp.leafMorph} leaves
          <span style={{ color: '#666', marginLeft: 8 }}>· glb source</span>
        </span>
        <span style={{ marginLeft: 'auto', color: '#888' }}>
          {usableVariants.length} variant{usableVariants.length === 1 ? '' : 's'} × 3 LODs
        </span>
      </header>

      <main style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '320px 1fr 280px',
        minHeight: 0,
      }}>
        {/* Variant list */}
        <div style={{
          borderRight: '1px solid rgba(255,255,255,0.08)',
          overflow: 'auto',
        }}>
          {usableVariants.length === 0 && (
            <div style={{ padding: 16, color: '#888', fontSize: 11, lineHeight: 1.5 }}>
              No variants yet. Run<br />
              <code style={{ color: '#bbb' }}>node arborist/publish-glb.js</code><br />
              with a source pack.
            </div>
          )}
          {usableVariants.map(v => {
            const selected = v.id === (variant?.id)
            return (
              <div key={v.id}
                onClick={() => selectVariant(v.id)}
                style={{
                  cursor: 'pointer',
                  padding: '10px 14px',
                  background: selected ? 'rgba(232,184,96,0.10)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                <div style={{ fontSize: 13, color: '#fff' }}>
                  Variant {v.id}
                  {v.sourceName && (
                    <span style={{ color: '#666', fontSize: 11, marginLeft: 6 }}>
                      {v.sourceName}
                    </span>
                  )}
                </div>
                {v.sourceFile && (
                  <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>
                    {v.sourceFile.split('/').slice(-2).join('/')}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Viewport */}
        <div style={{ position: 'relative', minHeight: 0 }}>
          <SpecimenViewport
            mode="skeleton"
            cloudUrl={null}
            glbUrl={glbUrl}
            viewKey={viewKey}
            forestryRotation={false}
            targetCategory={variant?.category || manifest?.category || 'broadleaf'}
            effectiveScale={eff.scale}
            positionOffset={eff.position}
            rotationOffset={eff.rotation}
            onPositionChange={(x, y, z) => {
              if (!variant) return
              const allZero = Math.abs(x) < 1e-4 && Math.abs(y) < 1e-4 && Math.abs(z) < 1e-4
              setVariantOverride(variant.id, 'positionOverride', allZero ? null : { x, y, z })
            }}
            onRotationChange={(x, y, z) => {
              if (!variant) return
              const allZero = Math.abs(x) < 1e-4 && Math.abs(y) < 1e-4 && Math.abs(z) < 1e-4
              setVariantOverride(variant.id, 'rotationOverride', allZero ? null : { x, y, z })
            }}
            onScaleChange={(s) => {
              if (!variant) return
              const base = variant.normalizeScale ?? 1
              setVariantOverride(variant.id, 'scaleOverride', Math.abs(s - base) < 1e-4 ? null : s)
            }}
            cameraStateRef={cameraStateRef}
          />
          {variant && (
            <div style={{
              position: 'absolute', bottom: 12, left: 12,
              padding: '6px 10px', borderRadius: 4,
              background: 'rgba(255,255,255,0.7)', color: '#222', fontSize: 11,
            }}>
              variant {variant.id} · {activeLod}
              <span style={{ color: '#666', marginLeft: 6 }}>· drag · scroll to zoom</span>
            </div>
          )}
        </div>

        {/* Tools — rating UI for the selected variant + LOD picker */}
        <aside style={{
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          overflow: 'auto',
          padding: '14px 14px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {variant && (
            <RateVariant
              variant={variant}
              eff={eff}
              onSet={(k, v) => setVariantOverride(variant.id, k, v)}
            />
          )}

          <section>
            <Section label="LOD" />
            <div style={{
              display: 'flex',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
              overflow: 'hidden',
            }}>
              {['lod0', 'lod1', 'lod2'].map(l => (
                <button key={l}
                  onClick={() => setActiveLod(l)}
                  style={modeBtnStyle(activeLod === l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ ...hintStyle, marginTop: 6 }}>
              LOD0 hero · LOD1 mid · LOD2 distant
            </div>
          </section>

          <section>
            <Section label="Source" />
            <div style={{ ...hintStyle }}>
              {manifest?.bakedAt && (
                <>
                  Published {new Date(manifest.bakedAt).toLocaleString()}<br />
                  from <code style={{ color: '#bbb' }}>{variant?.sourceFile?.split('/').slice(-2).join('/')}</code><br />
                  approx height <code style={{ color: '#bbb' }}>{variant?.approxHeightM ?? '—'}m</code>
                </>
              )}
            </div>
          </section>
        </aside>
      </main>
    </div>
  )
}
