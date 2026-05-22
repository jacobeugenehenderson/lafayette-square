/**
 * SalonWorkstage — chassis + bark + leaves composition surface (Brief 1,
 * baby Sequoia, 2026-05-21). Fork of `ProceduralWorkstage.jsx` with the
 * per-slot controls rail and data wiring swapped. ~70% lifted intact:
 *
 * LIFTED INTACT (do not re-implement — see brief constraints):
 *   - Header strip pattern (mode toggle, active-species dropdown, ← Library)
 *   - Slot tabs strip + dirty-dot indicator
 *   - SlotCard (viewport + right rail + footer pattern)
 *   - SpecimenViewport mount with rotator ring + obelisk + height indicator
 *   - LoD selector (top-right overlay)
 *   - Perf gauge (bottom-right overlay)
 *   - Wind toggle (bottom-left overlay)
 *   - DraftSlider commit semantics
 *   - PerfGauge, GaugeRow, SectionLabel, Row, btnStyle, selectStyle, loaderStyle
 *   - Species-level Re-publish in footer + dirty-blocked behavior
 *
 * REPLACED (Salon-specific):
 *   - Per-slot controls rail: Chassis / Bark / Leaves (vs Procedural's
 *     Trunk / Envelope / Canopy / Deformers / Tropism)
 *   - Data model: `compositions` store slice (vs `seedlings`)
 *   - Fetch path: /api/arborist/salon/* (vs /procedural/*)
 *   - Active-species dropdown source: filtered to species with available
 *     chassis OR an existing compositions.json (union per brief surface)
 *   - Empty-state: if `_chassis/` is empty, render the regenerate
 *     instruction (`node arborist/survey-deleaf.js`)
 *   - Per-slot footer: ↺ Reset, ✓ Adopt, manual Name input (no dice button —
 *     compositions are deterministic from chassis + bark + leaves, no seed roll)
 *   - Slot management: "+ Add slot" button (compositions are operator-authored,
 *     not PRESET-derived, so the operator picks how many to author)
 *
 * Surfaced for Brief 2/3/4 (per `feedback_baby_must_surface_scope_drift`):
 *   - The LoD / wind / perf gauge floating-overlay pattern is now duplicated
 *     across Procedural + Salon. Future consolidation candidate; flagged.
 *   - SpecimenViewport's `targetCategory` prop expects a procedural-style
 *     morphology bucket. Salon passes the resolved species morphology;
 *     mismatches fall through to 'broadleaf' default — visually fine.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import useArboristStore from './stores/useArboristStore.js'
import SpecimenViewport from './SpecimenViewport.jsx'

// Same heuristic mapping ProceduralWorkstage uses to drive the yardstick
// band. Salon species can be any binomial; map common Salon morphologies
// to the same target categories so the human-silhouette/target band reads.
const MORPH_TO_TARGET_CATEGORY = {
  broadleaf: 'broadleaf',
  broadleaf_palmate: 'broadleaf',
  conifer: 'conifer',
  columnar: 'columnar',
  weeping: 'weeping',
  ornamental: 'ornamental',
}

export default function SalonWorkstage() {
  const setSalonOpen        = useArboristStore(s => s.setSalonOpen)
  const speciesList         = useArboristStore(s => s.salonSpeciesList)
  const activeSpecies       = useArboristStore(s => s.salonActiveSpecies)
  const setActiveSpecies    = useArboristStore(s => s.setSalonActiveSpecies)
  const compositionsBySpecies = useArboristStore(s => s.salonCompositions)
  const dirtyBySpecies      = useArboristStore(s => s.salonDirtyBySpecies)
  const chassisCatalog      = useArboristStore(s => s.salonChassisCatalog)
  const barkRefs            = useArboristStore(s => s.salonBarkRefs)
  const leafPacks           = useArboristStore(s => s.salonLeafPacks)
  const setSlotParams       = useArboristStore(s => s.setSalonSlotParams)
  const setSlotName         = useArboristStore(s => s.setSalonSlotName)
  const resetSlot           = useArboristStore(s => s.resetSalonSlot)
  const addSlot             = useArboristStore(s => s.addSalonSlot)
  const adoptSlot           = useArboristStore(s => s.adoptSalonSlot)
  const republishSpecies    = useArboristStore(s => s.republishSalonSpecies)
  const publishing          = useArboristStore(s => s.salonPublishing)
  const error               = useArboristStore(s => s.salonError)
  const activeLookId        = useArboristStore(s => s.activeLookId)
  const loadSalonSpecies    = useArboristStore(s => s.loadSalonSpecies)
  const loadSalonLibraries  = useArboristStore(s => s.loadSalonLibraries)
  // Brief 1.5b (Quill): chassis curation surface.
  const chassisCuration     = useArboristStore(s => s.salonChassisCuration)
  const loadChassisCuration = useArboristStore(s => s.loadSalonChassisCuration)
  const setChassisCuration  = useArboristStore(s => s.setSalonChassisCuration)

  // Mount-time fetch: when Salon was restored open via localStorage, setSalonOpen
  // never fires this session, so the store's load actions wouldn't otherwise run.
  // Re-fetch on every mount; cheap (small JSON) and idempotent.
  useEffect(() => {
    loadSalonSpecies()
    loadSalonLibraries()
    loadChassisCuration()
  }, [loadSalonSpecies, loadSalonLibraries, loadChassisCuration])

  // "Approved only" filter — default ON. Persists for the session only;
  // the filter is a viewing preference, not authored chassis state.
  const [approvedOnly, setApprovedOnly] = useState(true)

  const compositions = compositionsBySpecies[activeSpecies] || []
  const dirty        = dirtyBySpecies[activeSpecies] || {}
  const speciesMeta  = speciesList.find(s => s.speciesId === activeSpecies)
  const targetCategory = MORPH_TO_TARGET_CATEGORY[speciesMeta?.morphology] || 'broadleaf'

  const anyDirty = Object.keys(dirty).length > 0
  const anyMissingChassis = compositions.some(c => !c.effective?.chassis && !c.chassis)
  const chassisLibEmpty = chassisCatalog.length === 0

  const [activeSlot, setActiveSlot] = useState(null)
  const [windEnabled, setWindEnabled] = useState(false)
  const [windStrength, setWindStrength] = useState(1.0)
  const [previewLod, setPreviewLod] = useState(0)
  useEffect(() => {
    if (compositions.length === 0) { setActiveSlot(null); return }
    if (activeSlot == null || !compositions.find(v => v.slot === activeSlot)) {
      setActiveSlot(compositions[0].slot)
    }
  }, [compositions, activeSlot])
  const activeComposition = compositions.find(v => v.slot === activeSlot) || null

  return (
    <div style={{
      position: 'fixed', inset: 0, color: '#ddd',
      fontFamily: '-apple-system, sans-serif', fontSize: 13,
      display: 'flex', flexDirection: 'column',
      background: '#111',
    }}>
      {/* Header */}
      <header style={{
        padding: '12px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button onClick={() => setSalonOpen(false)} style={btnStyle()}>
          ← Library
        </button>
        <strong style={{
          letterSpacing: '0.15em', textTransform: 'uppercase',
          fontSize: 12, color: '#fff',
        }}>Salon</strong>
        <span style={{ color: '#888' }}>compose chassis · bark · leaves (Brief 1)</span>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 16, color: '#888', fontSize: 11 }}>
          <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Species</span>
          <select
            value={activeSpecies || ''}
            onChange={(e) => setActiveSpecies(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#ddd',
              padding: '4px 8px', borderRadius: 4,
              fontFamily: 'inherit', fontSize: 12,
              minWidth: 260,
            }}
          >
            {speciesList.length === 0 && <option value="">(loading…)</option>}
            {speciesList.map(s => (
              <option key={s.speciesId} value={s.speciesId}>
                {s.label} · {s.chassisCount} chassis · {s.compositionCount} compositions
              </option>
            ))}
          </select>
        </label>

        <span style={{ marginLeft: 'auto', color: '#888', fontSize: 11 }}>
          {anyDirty
            ? <span style={{ color: '#e8b860' }}>{Object.keys(dirty).length} unadopted</span>
            : 'all adopted'}
        </span>
      </header>

      {/* Error strip */}
      {error && (
        <div style={{
          padding: '6px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(248,80,80,0.08)',
          color: '#f88', fontSize: 11,
        }}>
          {error}
        </div>
      )}

      {/* Empty chassis library — operator-runnable regenerate instruction. */}
      {chassisLibEmpty && (
        <div style={{
          padding: '12px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(126,200,224,0.08)',
          color: '#9cd0e4', fontSize: 12,
        }}>
          Chassis library is empty. Run <code style={{
            background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: 3,
          }}>node arborist/survey-deleaf.js</code> from the repo root to populate
          {' '}<code style={{
            background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: 3,
          }}>public/trees/_chassis/</code>.
        </div>
      )}

      {/* Slot tabs + Add-slot button */}
      <div style={{
        padding: '8px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(255,255,255,0.015)',
      }}>
        {compositions.map(v => {
          const isActive = v.slot === activeSlot
          const isDirty  = !!dirty[v.slot]
          return (
            <button key={v.slot} onClick={() => setActiveSlot(v.slot)}
              style={{
                background: isActive ? 'rgba(232,184,96,0.18)' : 'rgba(255,255,255,0.04)',
                border: '1px solid ' + (isActive
                  ? 'rgba(232,184,96,0.5)'
                  : (isDirty ? 'rgba(232,184,96,0.35)' : 'rgba(255,255,255,0.1)')),
                color: isActive ? '#e8c878' : (isDirty ? '#e8b860' : '#bbb'),
                padding: '5px 12px', borderRadius: 3,
                fontFamily: 'inherit', fontSize: 11,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {v.name || `Slot ${v.slot}`}
              {isDirty && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#e8b860',
                }} />
              )}
            </button>
          )
        })}
        <button onClick={() => activeSpecies && addSlot(activeSpecies)}
          disabled={!activeSpecies}
          style={{
            ...btnStyle(),
            opacity: activeSpecies ? 1 : 0.4,
            cursor: activeSpecies ? 'pointer' : 'not-allowed',
          }}>
          + Add slot
        </button>
      </div>

      {/* Main focus */}
      <main style={{
        flex: 1, padding: 18, overflow: 'hidden',
        display: 'flex', minHeight: 0,
      }}>
        {compositions.length === 0 && !chassisLibEmpty && (
          <div style={{ color: '#888', padding: 12 }}>
            No compositions yet for {speciesMeta?.label || activeSpecies}. Click <b>+ Add slot</b> to start.
          </div>
        )}
        {activeComposition && (
          <SlotCard
            key={activeComposition.slot}
            species={activeSpecies}
            slot={activeComposition.slot}
            slotName={activeComposition.name}
            chassis={activeComposition.effective?.chassis || activeComposition.chassis || null}
            bark={activeComposition.effective?.bark || {}}
            leaves={activeComposition.effective?.leaves || {}}
            chassisCatalog={chassisCatalog}
            speciesMorphology={speciesMeta?.morphology}
            barkRefs={barkRefs}
            leafPacks={leafPacks}
            dirty={!!dirty[activeComposition.slot]}
            targetCategory={targetCategory}
            windEnabled={windEnabled}
            windStrength={windStrength}
            onWindEnabledChange={setWindEnabled}
            onWindStrengthChange={setWindStrength}
            previewLod={previewLod}
            onPreviewLodChange={setPreviewLod}
            onParams={(patch) => setSlotParams(activeSpecies, activeComposition.slot, patch)}
            onNameChange={(name) => setSlotName(activeSpecies, activeComposition.slot, name)}
            onReset={() => resetSlot(activeSpecies, activeComposition.slot)}
            onAdopt={() => adoptSlot(activeSpecies, activeComposition.slot)}
            chassisCuration={chassisCuration}
            onChassisCuration={setChassisCuration}
            approvedOnly={approvedOnly}
            onApprovedOnlyChange={setApprovedOnly}
          />
        )}
      </main>

      {/* Footer */}
      <footer style={{
        padding: '12px 18px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 14,
        color: '#888', fontSize: 11,
      }}>
        <button
          onClick={() => republishSpecies(activeSpecies)}
          disabled={publishing || anyDirty || !activeSpecies || compositions.length === 0 || anyMissingChassis}
          title={
            anyDirty ? 'Adopt all dirty slots before republishing'
            : anyMissingChassis ? 'Every slot needs a chassis picked before publish'
            : compositions.length === 0 ? 'Add a composition first'
            : 'Rebake this species + auto-bake per-Look atlas'
          }
          style={{
            ...btnStyle(),
            opacity: (publishing || anyDirty || !activeSpecies || compositions.length === 0 || anyMissingChassis) ? 0.4 : 1,
            cursor:  (publishing || anyDirty || !activeSpecies || compositions.length === 0 || anyMissingChassis) ? 'not-allowed' : 'pointer',
            background: 'rgba(232,184,96,0.18)',
            border: '1px solid rgba(232,184,96,0.5)',
            color: '#e8c878',
          }}>
          {publishing ? 'Re-publishing…' : 'Re-publish species'}
        </button>
        <span>
          {activeLookId
            ? <>per-Look atlas auto-bakes for <code style={{ color: '#bbb' }}>{activeLookId}</code></>
            : 'no active Look — atlas auto-bake will be skipped'}
        </span>
      </footer>
    </div>
  )
}

// ── Slot card ───────────────────────────────────────────────────────────
//
// Same shape as ProceduralWorkstage's SlotCard: viewport on the left
// (with floating LoD / perf / wind overlays), controls rail on the right,
// footer with manual name + reset + adopt.

function SlotCard({
  species, slot, slotName, chassis, bark, leaves,
  chassisCatalog, speciesMorphology, barkRefs, leafPacks,
  dirty, targetCategory,
  windEnabled, windStrength, onWindEnabledChange, onWindStrengthChange,
  previewLod, onPreviewLodChange,
  onParams, onNameChange, onReset, onAdopt,
  chassisCuration, onChassisCuration, approvedOnly, onApprovedOnlyChange,
}) {
  const [glbUrl, setGlbUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [previewError, setPreviewError] = useState(null)
  const [perfSample, setPerfSample] = useState(null)
  const cameraStateRef = useRef({ distance: 22, height: 8 })
  const paramsKey = useMemo(
    () => JSON.stringify({ chassis, bark, leaves }),
    [chassis, bark, leaves],
  )

  useEffect(() => {
    if (!chassis) {
      setGlbUrl(null); setLoading(false); setPreviewError('Pick a chassis to preview')
      return
    }
    let cancelled = false
    let revokeUrl = null
    setLoading(true)
    setPreviewError(null)
    fetch('/api/arborist/salon/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chassis, bark, leaves, lod: previewLod }),
    })
      .then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.error || `HTTP ${r.status}`)))
        return r.blob()
      })
      .then(blob => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        revokeUrl = url
        setGlbUrl(url)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setPreviewError(String(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
      if (revokeUrl) URL.revokeObjectURL(revokeUrl)
    }
  }, [chassis, paramsKey, previewLod])

  const [nameDraft, setNameDraft] = useState(slotName || `Slot ${slot}`)
  useEffect(() => { setNameDraft(slotName || `Slot ${slot}`) }, [slotName, slot])
  const commitName = () => {
    const next = nameDraft.trim() || `Slot ${slot}`
    if (next !== slotName) onNameChange(next)
  }

  // Include bark.ref + leaves.pack so Canvas remounts on bark/leaf swap;
  // without these, three.js scene persists and reuses old materials despite
  // new GLB load (operator hit this 2026-05-22: pack switches changed the
  // GLB on the wire but not on screen).
  const viewKey = `${species}:${slot}:${chassis || 'none'}:${bark?.ref || ''}:${leaves?.pack || ''}`

  // Inspection-only transforms. Includes lean/tilt (X/Z) lifted from
  // Workstage.jsx for chassis straightening — vendor GLBs come at random tilts.
  // Reset deps include chassis so scale/tilt don't leak across chassis picks
  // within the same slot.
  const [rotationY, setRotationY] = useState(0)
  const [posOffset, setPosOffset] = useState([0, 0, 0])
  const [scaleOverride, setScaleOverride] = useState(1)
  const [tiltX, setTiltX] = useState(0)
  const [tiltZ, setTiltZ] = useState(0)
  useEffect(() => {
    setRotationY(0); setPosOffset([0, 0, 0]); setScaleOverride(1)
    setTiltX(0); setTiltZ(0)
  }, [species, slot, chassis])

  return (
    <div style={{
      flex: 1, minWidth: 0, minHeight: 0,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid ' + (dirty ? 'rgba(232,184,96,0.55)' : 'rgba(255,255,255,0.08)'),
      borderRadius: 6,
      display: 'flex', flexDirection: 'row',
      overflow: 'hidden',
    }}>
      {/* Viewport */}
      <div style={{
        flex: 1, minWidth: 0, position: 'relative', background: '#0d0d10',
      }}>
        {loading && <div style={loaderStyle}>regenerating…</div>}
        {previewError && <div style={{ ...loaderStyle, color: '#f88' }}>{previewError}</div>}
        {glbUrl && !previewError && (
          <SpecimenViewport
            mode="skeleton"
            glbUrl={glbUrl}
            viewKey={viewKey}
            forestryRotation={false}
            targetCategory={targetCategory}
            effectiveScale={scaleOverride}
            positionOffset={posOffset}
            rotationOffset={[tiltX, rotationY, tiltZ]}
            onRotationChange={(_rx, ry, _rz) => setRotationY(ry)}
            onPositionChange={(x, y, z) => setPosOffset([x, y, z])}
            onScaleChange={(s) => setScaleOverride(s)}
            cameraStateRef={cameraStateRef}
            windStrength={windEnabled ? windStrength : 0}
            onPerfSample={setPerfSample}
          />
        )}
        {/* LoD selector (lifted) */}
        <div style={{
          position: 'absolute', top: 12, right: 12,
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 4,
          padding: 4,
          display: 'flex', gap: 3, fontSize: 11,
          pointerEvents: 'auto',
        }}>
          {[0, 1, 2].map((lod) => {
            const active = previewLod === lod
            return (
              <button key={lod}
                disabled={loading}
                onClick={() => onPreviewLodChange(lod)}
                style={{
                  background: active ? 'rgba(232,184,96,0.18)' : 'transparent',
                  border: '1px solid ' + (active ? 'rgba(232,184,96,0.5)' : 'rgba(255,255,255,0.08)'),
                  color: active ? '#e8c878' : '#888',
                  padding: '3px 8px', borderRadius: 3,
                  fontFamily: 'inherit', fontSize: 10,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                }}>
                LOD {lod}
              </button>
            )
          })}
        </div>

        <PerfGauge sample={perfSample} previewLod={previewLod} />

        {/* Wind toggle (lifted) */}
        <div style={{
          position: 'absolute', bottom: 12, left: 12,
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 4,
          padding: '6px 10px',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 11, color: '#bbb',
          pointerEvents: 'auto',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!windEnabled}
              onChange={(e) => onWindEnabledChange(e.target.checked)} style={{ margin: 0 }} />
            <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Wind</span>
          </label>
          {windEnabled && (
            <>
              <input type="range" min={0} max={2} step={0.05}
                value={windStrength}
                onChange={(e) => onWindStrengthChange(parseFloat(e.target.value))}
                style={{ width: 110 }} />
              <span style={{ width: 36, color: '#888', textAlign: 'right' }}>{windStrength.toFixed(2)}</span>
            </>
          )}
        </div>
      </div>

      {/* Controls rail */}
      <div style={{
        width: 320, flexShrink: 0,
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column',
        overflow: 'auto',
      }}>
        <div style={{
          padding: '10px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 11, color: '#bbb',
        }}>
          <strong style={{
            letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ddd',
          }}>{slotName || `Slot ${slot}`}</strong>
          <span style={{
            marginLeft: 'auto',
            color: dirty ? '#e8b860' : '#666',
            fontSize: 11,
          }}>{dirty ? 'unadopted' : 'adopted'}</span>
        </div>

        <SalonControlsPanel
          chassis={chassis}
          bark={bark}
          leaves={leaves}
          chassisCatalog={chassisCatalog}
          speciesMorphology={speciesMorphology}
          barkRefs={barkRefs}
          leafPacks={leafPacks}
          onParams={onParams}
          tiltX={tiltX}
          tiltZ={tiltZ}
          onTiltXChange={setTiltX}
          onTiltZChange={setTiltZ}
          chassisCuration={chassisCuration}
          onChassisCuration={onChassisCuration}
          approvedOnly={approvedOnly}
          onApprovedOnlyChange={onApprovedOnlyChange}
        />

        {/* Footer: name + reset + adopt */}
        <div style={{
          marginTop: 'auto',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#888', width: '100%' }}>
            <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Name</span>
            <input type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitName(); e.currentTarget.blur() } }}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: dirty ? '#e8b860' : '#ddd',
                padding: '4px 6px', borderRadius: 3,
                fontFamily: 'inherit', fontSize: 12,
              }} />
          </label>
          <button
            onClick={() => {
              if (window.confirm('Reset this slot? Operator overlay will be cleared and persisted.')) onReset()
            }}
            title="Drop operator overlay; snap chassis/bark/leaves back to DEFAULTS"
            style={btnStyle()}>
            ↺ Reset
          </button>
          <button
            onClick={onAdopt}
            disabled={!dirty}
            title={dirty ? 'Persist this composition to compositions.json' : 'Already adopted'}
            style={{
              ...btnStyle(),
              background: dirty ? 'rgba(80,200,140,0.18)' : 'rgba(255,255,255,0.04)',
              border: '1px solid ' + (dirty ? 'rgba(80,200,140,0.5)' : 'rgba(255,255,255,0.1)'),
              color: dirty ? '#9ed8b0' : '#666',
              cursor: dirty ? 'pointer' : 'not-allowed',
              opacity: dirty ? 1 : 0.5,
            }}>
            ✓ Adopt
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Brief 2 (Holm): bark gradient stops editor ───────────────────────────
//
// Multi-stop color ramp authored per composition. Runtime samples the LUT
// per-instance via hash so 5 trees of the same variant land at different
// positions along the ramp. Every commit pipes through onCommit (= a
// setSalonSlotParams patch on bark.gradientStops) so the overlay POST +
// adopt+republish chain remains the single source of truth.
function hexToRgb(hex) {
  const s = (hex || '#ffffff').replace(/^#/, '')
  const v = s.length === 3 ? s.split('').map(c => c + c).join('') : s
  return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0]
}
function rgbToHex(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}
function lightenHex(hex, amt) {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt)
}
function rampCss(stops) {
  if (!stops || stops.length === 0) return 'linear-gradient(to right, #888, #888)'
  const sorted = [...stops].sort((a, b) => a.t - b.t)
  const parts = sorted.map(s => `${s.color} ${(s.t * 100).toFixed(1)}%`)
  return `linear-gradient(to right, ${parts.join(', ')})`
}
function insertMidpointStop(stops) {
  const sorted = [...stops].sort((a, b) => a.t - b.t)
  let gapMax = 0, gapI = 0
  for (let i = 0; i < sorted.length - 1; i++) {
    const g = sorted[i + 1].t - sorted[i].t
    if (g > gapMax) { gapMax = g; gapI = i }
  }
  const a = sorted[gapI], b = sorted[gapI + 1]
  const t = (a.t + b.t) / 2
  const ac = hexToRgb(a.color), bc = hexToRgb(b.color)
  const color = rgbToHex((ac[0] + bc[0]) / 2, (ac[1] + bc[1]) / 2, (ac[2] + bc[2]) / 2)
  const next = [...sorted.slice(0, gapI + 1), { t, color }, ...sorted.slice(gapI + 1)]
  return next
}
function BarkGradientEditor({ stops, tintBase, onCommit }) {
  // Stash the last-authored stops in a ref so a toggle-off-then-on round
  // trip preserves the operator's work (brief AC #6). The stash is updated
  // whenever a valid (>=2-stop) array passes through.
  const stashRef = useRef(null)
  if (Array.isArray(stops) && stops.length >= 2) stashRef.current = stops
  const on = Array.isArray(stops) && stops.length >= 2
  const toggle = (e) => {
    if (e.target.checked) {
      const next = stashRef.current && stashRef.current.length >= 2
        ? stashRef.current
        : [
            { t: 0, color: tintBase || '#3a2820' },
            { t: 1, color: lightenHex(tintBase || '#3a2820', 0.5) },
          ]
      onCommit(next)
    } else {
      // Empty array passes through the overlay POST → patchManifestForSalon
      // sees stops.length < 2 → clears variant.bark.gradientStops on disk.
      onCommit([])
    }
  }
  if (!on) {
    return (
      <Row label="Use gradient">
        <input type="checkbox" checked={false} onChange={toggle} />
      </Row>
    )
  }
  const sorted = [...stops].sort((a, b) => a.t - b.t)
  const commit = (next) => onCommit(next.sort((a, b) => a.t - b.t))
  const setStop = (idx, patch) => commit(sorted.map((s, i) => i === idx ? { ...s, ...patch } : s))
  const deleteStop = (idx) => {
    if (sorted.length <= 2) return
    commit(sorted.filter((_, i) => i !== idx))
  }
  const addStop = () => commit(insertMidpointStop(sorted))
  return (
    <>
      <Row label="Use gradient">
        <input type="checkbox" checked={true} onChange={toggle} />
      </Row>
      <div style={{
        height: 32, borderRadius: 4, margin: '6px 0',
        background: rampCss(sorted),
        border: '1px solid #444',
      }} />
      {sorted.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11 }}>
          <span style={{ width: 18, color: '#888', fontFamily: 'monospace' }}>#{i + 1}</span>
          <DraftSlider min={0} max={1} step={0.01} value={s.t}
            onCommit={(v) => setStop(i, { t: v })}
            format={(v) => v.toFixed(2)} />
          <input type="color" value={s.color} style={colorStyle}
            onChange={(e) => setStop(i, { color: e.target.value })} />
          <button onClick={() => deleteStop(i)} disabled={sorted.length <= 2}
            title={sorted.length <= 2 ? 'minimum 2 stops required' : 'delete stop'}
            style={{
              width: 22, height: 22, padding: 0,
              cursor: sorted.length <= 2 ? 'not-allowed' : 'pointer',
              background: 'transparent',
              color: sorted.length <= 2 ? '#444' : '#a55',
              border: '1px solid #333', borderRadius: 3,
            }}>×</button>
        </div>
      ))}
      <Row label="">
        <button onClick={addStop} style={{ ...btnStyle({ block: true }), fontSize: 11, flex: 1 }}>
          + Add stop
        </button>
      </Row>
      <div style={{ fontSize: 10, color: '#888', fontStyle: 'italic', marginTop: 2 }}>
        Gradient overrides tint base + jitter at runtime
      </div>
    </>
  )
}

// ── Salon controls panel (the Brief 1 replacement for SCAPanel) ─────────

function SalonControlsPanel({
  chassis, bark, leaves,
  chassisCatalog, speciesMorphology,
  barkRefs, leafPacks,
  onParams,
  tiltX, tiltZ, onTiltXChange, onTiltZChange,
  chassisCuration, onChassisCuration, approvedOnly, onApprovedOnlyChange,
}) {
  // Chassis picker filtered by morphology suggestion: matching-morphology
  // first, then everything else. Brief 1.5b layers curation on top:
  //   - if `approvedOnly` is ON, drop entries whose `approved !== true`
  //   - within the surviving set, the morphology ordering still applies
  //   - displayName (when set) overrides the filename for sort + label
  // Empty-state is handled by the parent (whole workstage shows the
  // regenerate instruction when catalog is empty).
  const curationKey = (c) => `${c.name}.glb`
  const ranked = useMemo(() => {
    if (chassisCatalog.length === 0) return []
    let pool = chassisCatalog
    if (approvedOnly) {
      pool = pool.filter(c => (chassisCuration[curationKey(c)] || {}).approved === true)
    }
    const matches = pool.filter(c => c.morphology === speciesMorphology)
    const others  = pool.filter(c => c.morphology !== speciesMorphology)
    return [...matches, ...others]
  }, [chassisCatalog, speciesMorphology, approvedOnly, chassisCuration])
  const activeChassis = ranked.find(c => c.name === chassis)
  // Curation entry for the currently-picked chassis (may be undefined if
  // chassis is null OR if the chassis is excluded by the approved filter
  // but still selected on the slot — we read from chassisCatalog directly
  // in that case so the curation row keeps working for in-flight slots).
  const pickedChassisInCatalog = chassis
    ? chassisCatalog.find(c => c.name === chassis)
    : null
  const pickedCurationKey = pickedChassisInCatalog ? curationKey(pickedChassisInCatalog) : null
  const pickedCuration = pickedCurationKey ? (chassisCuration[pickedCurationKey] || null) : null
  const approvalState = pickedCuration?.approved ?? null   // true / false / null
  // Helper: glyph + label for a chassis in the dropdown. Uses the
  // operator's displayName when present (Brief 1.5b); falls back to the
  // chassis filename otherwise.
  const labelFor = (c) => {
    const cur = chassisCuration[curationKey(c)]
    const dn = cur?.displayName
    const main = (dn && dn.length > 0) ? dn : c.name
    const glyph = cur?.approved === true ? '★'
                : cur?.approved === false ? '✗'
                : '·'
    const height = c.heightRange ? ` · ${c.heightRange[1].toFixed(1)}m` : ''
    return `${glyph} ${main} · ${c.morphology}${height}`
  }

  return (
    <div style={{
      padding: '10px 12px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(255,255,255,0.015)',
      display: 'flex', flexDirection: 'column', gap: 8,
      fontSize: 11, color: '#aaa',
    }}>
      <SectionLabel>Chassis</SectionLabel>
      {/* Brief 1.5b: approved-only filter toggle. Default ON; flip OFF to
          reveal unreviewed + rejected chassis when authoring new curation. */}
      <Row label="">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: '#aaa' }}>
          <input type="checkbox" checked={!!approvedOnly}
            onChange={(e) => onApprovedOnlyChange(e.target.checked)}
            style={{ margin: 0 }} />
          <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Approved only {approvedOnly ? `(${ranked.length})` : `(${chassisCatalog.length})`}
          </span>
        </label>
      </Row>
      <Row label="Pick">
        <select
          value={chassis || ''}
          onChange={(e) => onParams({ chassis: e.target.value || null })}
          style={selectStyle}>
          <option value="">(none)</option>
          {ranked.map(c => (
            <option key={c.name} value={c.name}>
              {labelFor(c)}
            </option>
          ))}
        </select>
      </Row>
      {activeChassis && activeChassis.heightRange && (
        <Row label="Height">
          <span style={{ fontFamily: 'monospace', color: '#bbb' }}>
            {activeChassis.heightRange[0].toFixed(2)}–{activeChassis.heightRange[1].toFixed(2)} m
          </span>
        </Row>
      )}
      {/* Brief 1.5b: curation row — appears once a chassis is picked.
          displayName commits on blur (per `feedback_debounced_save_must
          _flush_before_dependent_post`); tri-state approval commits
          immediately; notes textarea collapsed by default. */}
      {pickedCurationKey && (
        <CurationRow
          chassisFilename={pickedCurationKey}
          entry={pickedCuration}
          approvalState={approvalState}
          onCommit={onChassisCuration}
        />
      )}
      <Row label="Tilt X">
        <input type="range" min={-30} max={30} step={1}
          value={(tiltX * 180 / Math.PI).toFixed(0)}
          onChange={(e) => onTiltXChange(parseFloat(e.target.value) * Math.PI / 180)}
          style={{ flex: 1, accentColor: '#e8b860' }} />
        <span style={{ width: 32, textAlign: 'right', fontSize: 10, color: '#aaa', fontVariantNumeric: 'tabular-nums' }}>
          {(tiltX * 180 / Math.PI).toFixed(0)}°
        </span>
      </Row>
      <Row label="Tilt Z">
        <input type="range" min={-30} max={30} step={1}
          value={(tiltZ * 180 / Math.PI).toFixed(0)}
          onChange={(e) => onTiltZChange(parseFloat(e.target.value) * Math.PI / 180)}
          style={{ flex: 1, accentColor: '#e8b860' }} />
        <span style={{ width: 32, textAlign: 'right', fontSize: 10, color: '#aaa', fontVariantNumeric: 'tabular-nums' }}>
          {(tiltZ * 180 / Math.PI).toFixed(0)}°
        </span>
      </Row>
      <Row label="">
        <button
          onClick={() => {
            // Y-up flip: toggle a -90° X tilt (root-cause for Z-up chassis)
            const cur = tiltX
            onTiltXChange(Math.abs(cur + Math.PI / 2) < 0.01 ? 0 : -Math.PI / 2)
          }}
          style={{ ...btnStyle({ block: true }), fontSize: 11 }}>
          {Math.abs(tiltX + Math.PI / 2) < 0.01 ? 'Z-up applied — clear' : 'Y-up trunk (90° X)'}
        </button>
      </Row>

      <SectionLabel>Bark</SectionLabel>
      <Row label="Ref">
        <select
          value={bark?.ref || ''}
          onChange={(e) => onParams({ bark: { ref: e.target.value } })}
          style={selectStyle}>
          {barkRefs.length === 0 && <option value="">(loading…)</option>}
          {barkRefs.map(ref => (
            <option key={ref} value={ref}>{ref}</option>
          ))}
        </select>
      </Row>
      <Row label="UV X">
        <DraftSlider min={0.5} max={6} step={0.1}
          value={bark?.uvScale?.[0] ?? 1.5}
          onCommit={(v) => onParams({ bark: { uvScale: [v, bark?.uvScale?.[1] ?? 4] } })}
          format={(v) => v.toFixed(1)} />
      </Row>
      <Row label="UV Y">
        <DraftSlider min={0.5} max={12} step={0.1}
          value={bark?.uvScale?.[1] ?? 4}
          onCommit={(v) => onParams({ bark: { uvScale: [bark?.uvScale?.[0] ?? 1.5, v] } })}
          format={(v) => v.toFixed(1)} />
      </Row>
      <Row label="Tint base">
        <input type="color"
          value={bark?.tintBase || '#ffffff'}
          onChange={(e) => onParams({ bark: { tintBase: e.target.value } })}
          style={colorStyle} />
      </Row>
      <Row label="Tint jitter">
        <DraftSlider min={0} max={0.3} step={0.01}
          value={typeof bark?.tintJitterRange === 'number' ? bark.tintJitterRange : 0.08}
          onCommit={(v) => onParams({ bark: { tintJitterRange: v } })}
          format={(v) => v.toFixed(2)} />
      </Row>
      <Row label="Roughness">
        <DraftSlider min={0} max={1} step={0.01}
          value={bark?.roughnessOverride ?? 0.85}
          onCommit={(v) => onParams({ bark: { roughnessOverride: v } })}
          format={(v) => v.toFixed(2)} />
      </Row>
      <BarkGradientEditor
        stops={bark?.gradientStops}
        tintBase={bark?.tintBase}
        onCommit={(next) => onParams({ bark: { gradientStops: next } })} />

      <SectionLabel>Leaves</SectionLabel>
      {/* Brief 5: bare-chassis inspection toggle (workstage preview only;
          published artifact always carries leaves). */}
      <Row label="Show">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: '#aaa' }}>
          <input type="checkbox"
            checked={leaves?.show !== false}
            onChange={(e) => onParams({ leaves: { show: e.target.checked } })}
            style={{ margin: 0 }} />
          <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {leaves?.show !== false ? 'Visible' : 'Hidden (preview only)'}
          </span>
        </label>
      </Row>
      <Row label="Pack">
        <select
          value={leaves?.pack || ''}
          onChange={(e) => onParams({ leaves: { pack: e.target.value } })}
          style={selectStyle}>
          {leafPacks.length === 0 && <option value="">(loading…)</option>}
          {leafPacks.map(p => (
            <option key={p.packId} value={p.packId}>
              {p.packId}{p.kind === 'flat' ? ' (flat)' : ''}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Occupancy">
        <DraftSlider min={0} max={1} step={0.01}
          value={leaves?.occupancy ?? 0.7}
          onCommit={(v) => onParams({ leaves: { occupancy: v } })}
          format={(v) => `${Math.round(v * 100)}%`} />
      </Row>
      <Row label="Scale">
        <DraftSlider min={0.5} max={3.0} step={0.05}
          value={leaves?.scale ?? 1.0}
          onCommit={(v) => onParams({ leaves: { scale: v } })}
          format={(v) => `${v.toFixed(2)}×`} />
      </Row>
      <Row label="Tint front">
        <input type="color"
          value={leaves?.tintFront || '#3a7530'}
          onChange={(e) => onParams({ leaves: { tintFront: e.target.value } })}
          style={colorStyle} />
      </Row>
      <Row label="Tint back">
        <input type="color"
          value={leaves?.tintBack || '#a8b89a'}
          onChange={(e) => onParams({ leaves: { tintBack: e.target.value } })}
          style={colorStyle} />
      </Row>
    </div>
  )
}

// ── Lifted helpers (identical to ProceduralWorkstage) ──────────────────

function PerfGauge({ sample, previewLod }) {
  const fmtN = (n) => n == null ? '—' : n.toLocaleString()
  const tris = sample?.tris
  const lodScale = previewLod === 1 ? 0.5 : previewLod === 2 ? 0.2 : 1
  const greenLim  = 20000 * lodScale
  const yellowLim = 40000 * lodScale
  const trisColor = tris == null ? '#888'
    : tris < greenLim  ? '#7ec97e'
    : tris < yellowLim ? '#e8c878'
    : '#e87878'
  const programs = sample?.programs
  const programsColor = programs == null ? '#888' : programs > 5 ? '#e87878' : '#bbb'
  return (
    <div style={{
      position: 'absolute', bottom: 12, right: 12,
      background: 'rgba(0,0,0,0.55)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 4,
      padding: '6px 10px',
      display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 10, rowGap: 2,
      fontSize: 11, color: '#bbb',
      fontFamily: 'monospace',
      pointerEvents: 'none',
      minWidth: 130,
    }}>
      <GaugeRow label="tris"       value={fmtN(tris)}                color={trisColor} />
      <GaugeRow label="leaf cards" value={fmtN(sample?.leafCards)}   color="#bbb" />
      <GaugeRow label="draw calls" value={fmtN(sample?.drawCalls)}   color="#bbb" />
      <GaugeRow label="programs"   value={fmtN(programs)}            color={programsColor} />
    </div>
  )
}

function GaugeRow({ label, value, color }) {
  return (
    <>
      <span style={{ color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 10 }}>{label}</span>
      <span style={{ color, textAlign: 'right' }}>{value}</span>
    </>
  )
}

const loaderStyle = {
  position: 'absolute', inset: 0,
  display: 'grid', placeItems: 'center',
  color: '#888', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
  pointerEvents: 'none',
}

function btnStyle() {
  return {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#ddd',
    padding: '5px 10px', borderRadius: 3,
    fontFamily: 'inherit', fontSize: 11,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    cursor: 'pointer',
  }
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, color: '#888',
      letterSpacing: '0.12em', textTransform: 'uppercase',
      marginTop: 2,
    }}>{children}</div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 80, color: '#888' }}>{label}</span>
      {children}
    </div>
  )
}

const selectStyle = {
  flex: 1,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#ddd',
  padding: '3px 6px', borderRadius: 3,
  fontFamily: 'inherit', fontSize: 11,
}

const colorStyle = {
  flex: 1,
  height: 22,
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 3,
  cursor: 'pointer',
}

// Brief 1.5b: per-chassis curation editor — displayName + tri-state
// approved + notes. Commits each field on its own gesture:
//   - displayName commits on blur (or Enter); empty string clears
//   - approval cycle button commits immediately per click
//   - notes textarea is collapsed by default; expands inline; commits on blur
// `onCommit(chassisFilename, patch)` is the store action; patch follows the
// absent-keys-preserved convention so per-field commits don't clobber siblings.
function CurationRow({ chassisFilename, entry, approvalState, onCommit }) {
  const [nameDraft, setNameDraft] = useState(entry?.displayName || '')
  const [notesDraft, setNotesDraft] = useState(entry?.notes || '')
  const [notesOpen, setNotesOpen] = useState(!!(entry?.notes))
  useEffect(() => { setNameDraft(entry?.displayName || '') }, [chassisFilename, entry?.displayName])
  useEffect(() => { setNotesDraft(entry?.notes || '') }, [chassisFilename, entry?.notes])

  // Bug fix (2026-05-22, Cinder): when the operator types a label and then
  // clicks a different chassis in the picker, the parent's selected-chassis
  // state updates BEFORE the input's onBlur fires (React commits the new
  // prop, then the browser dispatches blur). commitName's closure then
  // reads the post-switch `chassisFilename` and POSTs the typed label to
  // the wrong chassis. Same trap for the unmount cleanup — by the time
  // it fires, props already reflect the new chassis.
  //
  // Fix: snapshot the active chassis when the operator first starts
  // editing (focus or first keystroke), and route all flushes through
  // that snapshot. Cleared after a successful flush so the next edit
  // captures fresh. Status toggle is unaffected — it commits inline on
  // click before any state can race.
  const nameTypingChassisRef = useRef(null)
  const notesTypingChassisRef = useRef(null)
  const captureNameChassis = () => { if (!nameTypingChassisRef.current) nameTypingChassisRef.current = chassisFilename }
  const captureNotesChassis = () => { if (!notesTypingChassisRef.current) notesTypingChassisRef.current = chassisFilename }

  // Flush pending drafts before chassis switch. Unmount cleanup is the
  // belt-and-suspenders path; the active flush via onBlur/Enter usually
  // beats us to it. Use the captured-at-type-time chassis for the POST
  // URL so we never address the post-switch chassis.
  // `feedback_debounced_save_must_flush_before_dependent_post`.
  useEffect(() => {
    return () => {
      const nameChassis = nameTypingChassisRef.current
      if (nameChassis && (entry?.displayName || '') !== nameDraft) {
        onCommit(nameChassis, { displayName: nameDraft || null })
      }
      const notesChassis = notesTypingChassisRef.current
      if (notesChassis && (entry?.notes || '') !== notesDraft) {
        onCommit(notesChassis, { notes: notesDraft || null })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chassisFilename])

  const commitName = () => {
    const target = nameTypingChassisRef.current || chassisFilename
    nameTypingChassisRef.current = null
    if ((entry?.displayName || '') === nameDraft) return
    onCommit(target, { displayName: nameDraft || null })
  }
  const commitNotes = () => {
    const target = notesTypingChassisRef.current || chassisFilename
    notesTypingChassisRef.current = null
    if ((entry?.notes || '') === notesDraft) return
    onCommit(target, { notes: notesDraft || null })
  }
  // Cycle: unreviewed (null) → approved (true) → rejected (false) → null …
  const cycleApproval = () => {
    const next = approvalState == null ? true : approvalState === true ? false : null
    onCommit(chassisFilename, { approved: next })
  }
  const approvalLabel = approvalState === true ? '★ Approved'
                      : approvalState === false ? '✗ Rejected'
                      : '· Unreviewed'
  const approvalColor = approvalState === true ? '#9ed8b0'
                      : approvalState === false ? '#e87878'
                      : '#888'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '8px 10px', marginTop: 4,
      background: 'rgba(232,184,96,0.05)',
      border: '1px solid rgba(232,184,96,0.15)',
      borderRadius: 4,
    }}>
      <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Curate · <span style={{ fontFamily: 'monospace', textTransform: 'none', color: '#aaa', letterSpacing: 0 }}>{chassisFilename}</span>
      </div>
      <Row label="Name">
        <input type="text"
          placeholder="e.g. Maple base — good crotches"
          value={nameDraft}
          onFocus={captureNameChassis}
          onChange={(e) => { captureNameChassis(); setNameDraft(e.target.value) }}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') { commitName(); e.currentTarget.blur() } }}
          style={{ ...selectStyle, padding: '4px 6px' }} />
      </Row>
      <Row label="Status">
        <button onClick={cycleApproval}
          title="Click to cycle: unreviewed → approved → rejected"
          style={{
            ...btnStyle({ block: true }),
            border: `1px solid ${approvalColor}`,
            color: approvalColor,
            textAlign: 'left',
            fontSize: 11,
          }}>
          {approvalLabel}
        </button>
      </Row>
      <Row label="Notes">
        {!notesOpen && !notesDraft && (
          <button onClick={() => setNotesOpen(true)}
            style={{ ...btnStyle({ block: true }), color: '#888', fontSize: 11 }}>
            + Add note
          </button>
        )}
        {(notesOpen || notesDraft) && (
          <textarea
            placeholder="Operator note (visible only here)"
            value={notesDraft}
            onFocus={captureNotesChassis}
            onChange={(e) => { captureNotesChassis(); setNotesDraft(e.target.value) }}
            onBlur={commitNotes}
            rows={2}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#ddd',
              padding: '4px 6px', borderRadius: 3,
              fontFamily: 'inherit', fontSize: 11,
              resize: 'vertical',
            }} />
        )}
      </Row>
    </div>
  )
}

function DraftSlider({ value, onCommit, min, max, step, format }) {
  const [draft, setDraft] = useState(value)
  const idleRef = useRef(null)
  const draggingRef = useRef(false)
  useEffect(() => { if (!draggingRef.current) setDraft(value) }, [value])
  const schedule = (v) => {
    if (idleRef.current != null) clearTimeout(idleRef.current)
    idleRef.current = setTimeout(() => { idleRef.current = null; onCommit(v) }, 150)
  }
  const finalCommit = () => {
    draggingRef.current = false
    if (idleRef.current != null) { clearTimeout(idleRef.current); idleRef.current = null }
    onCommit(draft)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <input type="range" min={min} max={max} step={step}
        value={draft}
        onPointerDown={() => { draggingRef.current = true }}
        onPointerUp={finalCommit}
        onChange={(e) => { const v = parseFloat(e.target.value); setDraft(v); schedule(v) }}
        onKeyUp={finalCommit}
        style={{ flex: 1, accentColor: '#e8b860' }} />
      <span style={{ width: 44, textAlign: 'right', color: '#bbb', fontFamily: 'monospace' }}>
        {format ? format(draft) : draft}
      </span>
    </div>
  )
}
