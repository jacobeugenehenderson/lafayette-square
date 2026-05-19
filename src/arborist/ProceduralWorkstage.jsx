/**
 * ProceduralWorkstage — dice + adopt + republish surface for the 5
 * procedural species (v1.5 Phase A, shipped 2026-05-15).
 *
 * Operator flow:
 *   1. Pick a species from the toolbar dropdown.
 *   2. Each variant slot renders a SpecimenViewport thumbnail of the
 *      currently-staged seed; click 🎲 to roll a fresh seed (live preview
 *      only, no file write).
 *   3. Click ✓ adopt to persist the slot's seed to
 *      `arborist/state/<species>/seedlings.json`.
 *   4. Click "Re-publish species" to rebake the species through
 *      publish-glb.js + fire per-Look atlas auto-bake.
 *
 * Phase A scope: dice + adopt + republish, full stop. Envelope panels,
 * tropism sliders, bark/leaf pickers land in subsequent phases (D, E, B,
 * F per cartograph/NOTES.md 2026-05-15 maxi-brief). Resist exposing more
 * knobs — premature param surfaces will need re-tooling as the underlying
 * algorithm grows.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import useArboristStore from './stores/useArboristStore.js'
import SpecimenViewport from './SpecimenViewport.jsx'

// Category band the SpecimenViewport yardstick highlights. Maps procedural
// species → the matching display category from CATEGORY_TARGET_HEIGHT in
// SpecimenViewport.jsx so the human-silhouette / target band frames the
// species correctly.
const SPECIES_TARGET_CATEGORY = {
  procedural_broadleaf:  'broadleaf',
  procedural_conifer:    'conifer',
  procedural_ornamental: 'ornamental',
  procedural_columnar:   'columnar',
  procedural_weeping:    'weeping',
}

export default function ProceduralWorkstage() {
  const setProceduralOpen        = useArboristStore(s => s.setProceduralOpen)
  const speciesList              = useArboristStore(s => s.proceduralSpeciesList)
  const activeSpecies            = useArboristStore(s => s.proceduralActiveSpecies)
  const setActiveSpecies         = useArboristStore(s => s.setProceduralActiveSpecies)
  const seedlingsByspecies       = useArboristStore(s => s.proceduralSeedlings)
  const dirtyByspecies           = useArboristStore(s => s.proceduralDirtyBySpecies)
  const diceSlot                 = useArboristStore(s => s.diceProceduralSlot)
  const setSlotSeed              = useArboristStore(s => s.setProceduralSlotSeed)
  const setSlotParams            = useArboristStore(s => s.setProceduralSlotParams)
  const resetSlotParams          = useArboristStore(s => s.resetProceduralSlotParams)
  const adoptSlot                = useArboristStore(s => s.adoptProceduralSlot)
  const republishSpecies         = useArboristStore(s => s.republishProceduralSpecies)
  const publishing               = useArboristStore(s => s.proceduralPublishing)
  const error                    = useArboristStore(s => s.proceduralError)
  const activeLookId             = useArboristStore(s => s.activeLookId)

  const seedlings = seedlingsByspecies[activeSpecies] || []
  const dirty     = dirtyByspecies[activeSpecies] || {}
  const speciesMeta = speciesList.find(s => s.speciesId === activeSpecies)
  const targetCategory = SPECIES_TARGET_CATEGORY[activeSpecies] || 'broadleaf'

  const anyDirty = Object.keys(dirty).length > 0

  // Single-slot focus (2026-05-16 redesign): a tall viewport reads vertically-
  // composed trees far better than a 320×280 grid cell. Slot tabs in the
  // header switch the focused variant; nothing about per-slot functionality
  // changes.
  const [activeSlot, setActiveSlot] = useState(null)
  // Wind + LoD are viewing conditions, not tree properties — survive slot switches.
  const [windEnabled, setWindEnabled] = useState(false)
  const [windStrength, setWindStrength] = useState(1.0)
  const [previewLod, setPreviewLod] = useState(0)
  useEffect(() => {
    if (seedlings.length === 0) { setActiveSlot(null); return }
    if (activeSlot == null || !seedlings.find(v => v.slot === activeSlot)) {
      setActiveSlot(seedlings[0].slot)
    }
  }, [seedlings, activeSlot])
  const activeVariant = seedlings.find(v => v.slot === activeSlot) || null

  return (
    <div style={{
      position: 'fixed', inset: 0, color: '#ddd',
      fontFamily: '-apple-system, sans-serif', fontSize: 13,
      display: 'flex', flexDirection: 'column',
      background: '#111',
    }}>
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <header style={{
        padding: '12px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button onClick={() => setProceduralOpen(false)} style={btnStyle()}>
          ← Library
        </button>
        <strong style={{
          letterSpacing: '0.15em', textTransform: 'uppercase',
          fontSize: 12, color: '#fff',
        }}>Procedural</strong>
        <span style={{ color: '#888' }}>dice + adopt (Phase A)</span>

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
              minWidth: 220,
            }}
          >
            {speciesList.length === 0 && <option value="">(loading…)</option>}
            {speciesList.map(s => (
              <option key={s.speciesId} value={s.speciesId}>
                {s.label} · {s.variantCount} slots
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

      {/* ── Error strip ─────────────────────────────────────────── */}
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

      {/* ── Slot tabs ────────────────────────────────────────────── */}
      {seedlings.length > 0 && (
        <div style={{
          padding: '8px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.015)',
        }}>
          {seedlings.map(v => {
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
                Slot {v.slot}
                {isDirty && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#e8b860',
                  }} />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Focused variant ─────────────────────────────────────── */}
      <main style={{
        flex: 1, padding: 18, overflow: 'hidden',
        display: 'flex', minHeight: 0,
      }}>
        {seedlings.length === 0 && (
          <div style={{ color: '#888', padding: 12 }}>
            {speciesMeta ? 'No variant slots — check seedlings.json.' : 'Loading seedlings…'}
          </div>
        )}
        {activeVariant && (
          <SlotCard
            key={activeVariant.slot}
            species={activeSpecies}
            slot={activeVariant.slot}
            seed={activeVariant.seed}
            params={activeVariant.params}
            effective={activeVariant.effective}
            dirty={!!dirty[activeVariant.slot]}
            targetCategory={targetCategory}
            windEnabled={windEnabled}
            windStrength={windStrength}
            onWindEnabledChange={setWindEnabled}
            onWindStrengthChange={setWindStrength}
            previewLod={previewLod}
            onPreviewLodChange={setPreviewLod}
            onDice={() => diceSlot(activeSpecies, activeVariant.slot)}
            onSeedEdit={(seed) => setSlotSeed(activeSpecies, activeVariant.slot, seed)}
            onParams={(paramsPatch) => setSlotParams(activeSpecies, activeVariant.slot, paramsPatch)}
            onReset={() => resetSlotParams(activeSpecies, activeVariant.slot)}
            onAdopt={() => adoptSlot(activeSpecies, activeVariant.slot)}
          />
        )}
      </main>

      {/* ── Footer / republish ──────────────────────────────────── */}
      <footer style={{
        padding: '12px 18px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 14,
        color: '#888', fontSize: 11,
      }}>
        <button
          onClick={() => republishSpecies(activeSpecies)}
          disabled={publishing || anyDirty || !activeSpecies}
          title={anyDirty ? 'Adopt all dirty slots before republishing' : 'Rebake this species + auto-bake per-Look atlas'}
          style={{
            ...btnStyle(),
            opacity: (publishing || anyDirty || !activeSpecies) ? 0.4 : 1,
            cursor: (publishing || anyDirty || !activeSpecies) ? 'not-allowed' : 'pointer',
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
// Owns its own preview blob URL keyed on (species, slot, seed, params).
// Re-fetches `/api/arborist/procedural/generate` whenever the key changes;
// revokes the previous blob URL on cleanup so we don't leak.
// Phase E will mount its own conifer-specific panel here; until then we
// hide all SCA controls for the conifer species (it routes through the
// v1 free-growth path inside generateTreeMesh).
const SHOW_SCA_PANEL = (species) => species !== 'procedural_conifer'

function SlotCard({ species, slot, seed, params, effective, dirty, targetCategory, windEnabled, windStrength, onWindEnabledChange, onWindStrengthChange, previewLod, onPreviewLodChange, onDice, onSeedEdit, onParams, onReset, onAdopt }) {
  const [glbUrl, setGlbUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [previewError, setPreviewError] = useState(null)
  const [perfSample, setPerfSample] = useState(null)
  const cameraStateRef = useRef({ distance: 22, height: 8 })
  const paramsKey = useMemo(() => JSON.stringify(params || {}), [params])

  useEffect(() => {
    let cancelled = false
    let revokeUrl = null
    setLoading(true)
    setPreviewError(null)
    fetch('/api/arborist/procedural/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ species, slot, seed, params: params || {}, lod: previewLod }),
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
  }, [species, slot, seed, paramsKey, previewLod])

  const [seedDraft, setSeedDraft] = useState(String(seed))
  useEffect(() => { setSeedDraft(String(seed)) }, [seed])

  const commitSeed = () => {
    const n = parseInt(seedDraft, 10)
    if (Number.isFinite(n) && n !== seed) onSeedEdit(n)
    else setSeedDraft(String(seed))
  }

  // viewKey forces Canvas remount on slot change — SpecimenViewport's
  // cameraStateRef seeding logic only fires on a fresh mount, so we want
  // a fresh studio framing per slot.
  const viewKey = `${species}:${slot}:${seed}`

  // Inspection-only transforms: rotation ring + XZ arrows + scale handle
  // wired through so the operator can spin / nudge / scale the specimen
  // for visual inspection. NOT persisted to seedlings (these are local
  // viewing affordances, not parameters of the tree). Reset on slot
  // change so each tab opens from the canonical pose.
  const [rotationY, setRotationY] = useState(0)
  const [posOffset, setPosOffset] = useState([0, 0, 0])
  const [scaleOverride, setScaleOverride] = useState(1)
  useEffect(() => {
    setRotationY(0)
    setPosOffset([0, 0, 0])
    setScaleOverride(1)
  }, [species, slot])

  return (
    <div style={{
      flex: 1, minWidth: 0, minHeight: 0,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid ' + (dirty ? 'rgba(232,184,96,0.55)' : 'rgba(255,255,255,0.08)'),
      borderRadius: 6,
      display: 'flex', flexDirection: 'row',
      overflow: 'hidden',
    }}>
      {/* Viewport — fills the available height so vertically-composed
          trees (columnar / weeping) read at full scale. */}
      <div style={{
        flex: 1, minWidth: 0, position: 'relative', background: '#0d0d10',
      }}>
        {loading && (
          <div style={loaderStyle}>regenerating…</div>
        )}
        {previewError && (
          <div style={{ ...loaderStyle, color: '#f88' }}>{previewError}</div>
        )}
        {glbUrl && !previewError && (
          <SpecimenViewport
            mode="skeleton"
            glbUrl={glbUrl}
            viewKey={viewKey}
            forestryRotation={false}
            targetCategory={targetCategory}
            effectiveScale={scaleOverride}
            positionOffset={posOffset}
            rotationOffset={[0, rotationY, 0]}
            onRotationChange={(_rx, ry, _rz) => setRotationY(ry)}
            onPositionChange={(x, y, z) => setPosOffset([x, y, z])}
            onScaleChange={(s) => setScaleOverride(s)}
            cameraStateRef={cameraStateRef}
            windStrength={windEnabled ? windStrength : 0}
            onPerfSample={setPerfSample}
          />
        )}
        {/* LoD selector — top-right floating overlay. Switches the
            simplification ratio applied server-side; perf gauge zones
            recalibrate per LoD to match publish-glb's tier budgets. */}
        <div style={{
          position: 'absolute', top: 12, right: 12,
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 4,
          padding: '4px',
          display: 'flex', gap: 3,
          fontSize: 11,
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

        {/* Perf gauge — bottom-right floating overlay. Read-only sample
            of renderer.info + scene traversal at ~4 Hz. */}
        <PerfGauge sample={perfSample} previewLod={previewLod} />

        {/* Floating wind controls — viewing condition, not a tree property. */}
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
            <input
              type="checkbox"
              checked={!!windEnabled}
              onChange={(e) => onWindEnabledChange(e.target.checked)}
              style={{ margin: 0 }}
            />
            <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Wind</span>
          </label>
          {windEnabled && (
            <>
              <input
                type="range"
                min={0} max={2} step={0.05}
                value={windStrength}
                onChange={(e) => onWindStrengthChange(parseFloat(e.target.value))}
                style={{ width: 110 }}
              />
              <span style={{ width: 36, color: '#888', textAlign: 'right' }}>{windStrength.toFixed(2)}</span>
            </>
          )}
        </div>
      </div>

      {/* Right rail — header + controls + seed/dice/adopt. */}
      <div style={{
        width: 300, flexShrink: 0,
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
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: '#ddd',
          }}>Slot {slot}</strong>
          <span style={{
            marginLeft: 'auto',
            color: dirty ? '#e8b860' : '#666',
            fontSize: 11,
          }}>{dirty ? 'unadopted' : 'adopted'}</span>
        </div>

        {/* Envelope + Tropism panel (Phase D). Hidden for conifer until
            Phase E lands its monopodial-whorl panel. Slider edits debounce
            via DraftSlider (150ms idle commit + pointer-up final) so
            dragging doesn't thrash the dice endpoint. */}
        {SHOW_SCA_PANEL(species) && effective?.envelope && effective?.sca && (
          <SCAPanel
            species={species}
            dbh={effective.dbh ?? 18}
            envelope={effective.envelope}
            sca={effective.sca}
            deformers={effective.deformers || {}}
            onScalarChange={(patch) => onParams(patch)}
            onEnvelopeChange={(patch) => onParams({ envelope: patch })}
            onSCAChange={(patch) => onParams({ sca: patch })}
            onDeformersChange={(patch) => onParams({ deformers: patch })}
          />
        )}

        <div style={{
          marginTop: 'auto',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#888' }}>
            <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Seed</span>
            <input
              type="number"
              value={seedDraft}
              onChange={(e) => setSeedDraft(e.target.value)}
              onBlur={commitSeed}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitSeed(); e.currentTarget.blur() } }}
              style={{
                width: 80,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: dirty ? '#e8b860' : '#ddd',
                padding: '4px 6px', borderRadius: 3,
                fontFamily: 'inherit', fontSize: 12,
              }}
            />
          </label>
          <button onClick={onDice} title="Roll a fresh random seed (preview only)"
            style={btnStyle()}>
            🎲 Dice
          </button>
          <button
            onClick={() => {
              if (window.confirm('Reset this slot to PRESETS defaults? Operator overlay will be cleared and persisted.')) onReset()
            }}
            title="Drop operator overlay; snap envelope + tropism back to species defaults"
            style={btnStyle()}>
            ↺ Reset
          </button>
          <button
            onClick={onAdopt}
            disabled={!dirty}
            title={dirty ? 'Persist this slot to seedlings.json' : 'Already adopted'}
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

// Perf gauge — four rows (tris, leaf cards, draw calls, programs).
// Tri thresholds mirror publish-glb's LoD ratios (lod0 baseline, lod1
// ×0.5, lod2 ×0.2) so the operator sees zone recalibration on switch.
// Programs row turns red >5 — catches accidental program-cache divergence
// at author time per [[feedback_unique_program_cache_key_before_wrappers]].
function PerfGauge({ sample, previewLod }) {
  const fmtN = (n) => n == null ? '—' : n.toLocaleString()
  const tris = sample?.tris
  const lodScale = previewLod === 1 ? 0.5 : previewLod === 2 ? 0.2 : 1
  const greenLim  = 20000 * lodScale
  const yellowLim = 40000 * lodScale
  const trisColor = tris == null
    ? '#888'
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

// ── SCA panel (Phase D) ─────────────────────────────────────────────────
// Per-slot envelope + tropism editor. Profile is a dropdown of the 5 named
// curves; everything else is a debounced slider. The four envelope/tropism
// fields are the load-bearing knobs — they collectively select the
// silhouette per [[cartograph/NOTES.md "2026-05-15 maxi-brief"]] Design
// pillar #2. A free-form 2D-curve profile editor is a later polish.
const ENVELOPE_PROFILE_OPTIONS = [
  'rounded_oval',
  'umbrella',
  'tight_column',
  'broad_low',
  'asymmetric_oval',
]
function SCAPanel({ species, dbh, envelope, sca, deformers, onScalarChange, onEnvelopeChange, onSCAChange, onDeformersChange }) {
  const tropism = sca.tropism || [0, 0, 0]
  // Drape (envelope.offsetYFrac) hangs the canopy envelope below the trunk
  // top. It's load-bearing for weeping (so the curtain has somewhere to
  // drape) and effectively meaningless for the other SCA morphologies —
  // hide it where it has no semantic purpose.
  const showDrape = species === 'procedural_weeping' || envelope.profile === 'umbrella'
  // Weeping pins scaffolds to the trunk top regardless of operator request —
  // the curtain effect breaks if scaffolds emerge at staggered heights.
  // Hide the spread slider for weeping; the value is still defended in the
  // SCA kernel (isWeeping → scaffoldZoneFrac = 0).
  //
  // Phase G.0 (2026-05-19): strong-leader architecture doesn't use
  // scaffoldZoneFrac either — laterals attach at distributed Ys via the
  // brancingStartFrac..0.9 zone hardcoded in the kernel — so hide Spread
  // and Lift in that mode. The decussate Phyllotaxis dropdown stays
  // because pair-spawn behaviour is orthogonal to architecture.
  const architecture = sca.architecture || 'spreading'
  const isStrongLeader = architecture === 'strong-leader'
  const showScaffoldSpread = !showDrape && !isStrongLeader
  const showLift = !isStrongLeader
  return (
    <div style={{
      padding: '10px 12px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(255,255,255,0.015)',
      display: 'flex', flexDirection: 'column', gap: 8,
      fontSize: 11, color: '#aaa',
    }}>
      <SectionLabel>Trunk</SectionLabel>
      <Row label="DBH">
        <DraftSlider min={5} max={100} step={1}
          value={dbh ?? 18}
          onCommit={(v) => onScalarChange({ dbh: v })}
          format={(v) => `${v.toFixed(0)} cm`} />
      </Row>

      <SectionLabel>Envelope</SectionLabel>
      <Row label="Profile">
        <select
          value={envelope.profile}
          onChange={(e) => onEnvelopeChange({ profile: e.target.value })}
          style={selectStyle}>
          {ENVELOPE_PROFILE_OPTIONS.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </Row>
      <Row label="Width">
        <DraftSlider min={1} max={20} step={0.1}
          value={envelope.width ?? 7}
          onCommit={(v) => onEnvelopeChange({ width: v })}
          format={(v) => `${v.toFixed(1)} m`} />
      </Row>
      <Row label="Height">
        <DraftSlider min={1} max={20} step={0.1}
          value={envelope.height ?? 7}
          onCommit={(v) => onEnvelopeChange({ height: v })}
          format={(v) => `${v.toFixed(1)} m`} />
      </Row>
      <Row label="Asymmetry">
        <DraftSlider min={0} max={1} step={0.01}
          value={envelope.asymmetry ?? 0}
          onCommit={(v) => onEnvelopeChange({ asymmetry: v })}
          format={(v) => v.toFixed(2)} />
      </Row>
      {showDrape && (
        <Row label="Drape">
          <DraftSlider min={-1} max={0} step={0.05}
            value={envelope.offsetYFrac ?? 0}
            onCommit={(v) => onEnvelopeChange({ offsetYFrac: v })}
            format={(v) => v === 0 ? '0' : `${Math.round(v * -100)}% below`} />
        </Row>
      )}

      <SectionLabel>Canopy</SectionLabel>
      <Row label="Start">
        <DraftSlider min={0.1} max={0.9} step={0.05}
          value={sca.branchingStartFrac ?? 0.5}
          onCommit={(v) => onSCAChange({ branchingStartFrac: v })}
          format={(v) => `${Math.round(v * 100)}% up`} />
      </Row>
      <Row label="Scaffolds">
        <DraftSlider min={2} max={9} step={1}
          value={sca.initialChildCount ?? 6}
          onCommit={(v) => onSCAChange({ initialChildCount: v })}
          format={(v) => `${v.toFixed(0)}`} />
      </Row>
      {showScaffoldSpread && (
        <Row label="Spread">
          <DraftSlider min={0} max={1} step={0.05}
            value={sca.scaffoldZoneFrac ?? 0.5}
            onCommit={(v) => onSCAChange({ scaffoldZoneFrac: v })}
            format={(v) => v === 0 ? 'top only' : `${Math.round(v * 100)}%`} />
        </Row>
      )}
      <Row label="Phyllotaxis">
        <select
          value={sca.phyllotaxisMode || 'alternate'}
          onChange={(e) => onSCAChange({ phyllotaxisMode: e.target.value })}
          style={selectStyle}>
          <option value="alternate">alternate</option>
          <option value="opposite">opposite (maple/ash)</option>
        </select>
      </Row>
      <Row label="Architecture">
        <select
          value={architecture}
          onChange={(e) => onSCAChange({ architecture: e.target.value })}
          style={selectStyle}>
          <option value="spreading">spreading (oak/elm)</option>
          <option value="strong-leader">strong-leader (maple/ash)</option>
        </select>
      </Row>
      {isStrongLeader && (
        <Row label="Leader strength">
          <DraftSlider min={0.3} max={1.0} step={0.05}
            value={sca.leaderStrength ?? 1.0}
            onCommit={(v) => onSCAChange({ leaderStrength: v })}
            format={(v) => `${Math.round(v * 100)}%`} />
        </Row>
      )}
      {showLift && (
        <Row label="Lift">
          <DraftSlider min={0} max={1.5} step={0.05}
            value={sca.scaffoldEmergenceBias ?? 0}
            onCommit={(v) => onSCAChange({ scaffoldEmergenceBias: v })}
            format={(v) => v === 0 ? 'none' : v.toFixed(2)} />
        </Row>
      )}
      <Row label="Density">
        <DraftSlider min={100} max={1000} step={50}
          value={sca.attractorCount ?? 500}
          onCommit={(v) => onSCAChange({ attractorCount: v })}
          format={(v) => `${v.toFixed(0)}`} />
      </Row>
      <Row label="Fill">
        <DraftSlider min={0.3} max={2.0} step={0.05}
          value={sca.killRadius ?? 1.0}
          onCommit={(v) => onSCAChange({ killRadius: v })}
          format={(v) => `${v.toFixed(2)} m`} />
      </Row>

      <SectionLabel>Deformers</SectionLabel>
      <Row label="Trunk wander">
        <DraftSlider min={0} max={0.3} step={0.01}
          value={deformers.trunkWander ?? 0}
          onCommit={(v) => onDeformersChange({ trunkWander: v })}
          format={(v) => v === 0 ? 'none' : `${Math.round(v * 100)} cm`} />
      </Row>
      <Row label="Wavelength">
        <DraftSlider min={0.5} max={5} step={0.1}
          value={deformers.trunkWavelength ?? 2.0}
          onCommit={(v) => onDeformersChange({ trunkWavelength: v })}
          format={(v) => `${v.toFixed(1)} m`} />
      </Row>
      <Row label="Branch jitter">
        <DraftSlider min={0} max={0.3} step={0.01}
          value={deformers.branchJitter ?? 0}
          onCommit={(v) => onDeformersChange({ branchJitter: v })}
          format={(v) => v === 0 ? 'none' : `${Math.round(v * 100)}%`} />
      </Row>
      <Row label="Bark relief">
        <DraftSlider min={0} max={0.15} step={0.005}
          value={deformers.barkRelief ?? 0.05}
          onCommit={(v) => onDeformersChange({ barkRelief: v })}
          format={(v) => `${(v * 100).toFixed(1)}%`} />
      </Row>

      <SectionLabel>Tropism</SectionLabel>
      <Row label="X">
        <DraftSlider min={-0.6} max={0.6} step={0.02}
          value={tropism[0]}
          onCommit={(v) => onSCAChange({ tropism: [v, tropism[1], tropism[2]] })}
          format={(v) => v.toFixed(2)} />
      </Row>
      <Row label="Y">
        <DraftSlider min={-0.8} max={0.6} step={0.02}
          value={tropism[1]}
          onCommit={(v) => onSCAChange({ tropism: [tropism[0], v, tropism[2]] })}
          format={(v) => v.toFixed(2)} />
      </Row>
      <Row label="Z">
        <DraftSlider min={-0.6} max={0.6} step={0.02}
          value={tropism[2]}
          onCommit={(v) => onSCAChange({ tropism: [tropism[0], tropism[1], v] })}
          format={(v) => v.toFixed(2)} />
      </Row>
    </div>
  )
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
      <span style={{ width: 70, color: '#888' }}>{label}</span>
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

// Debounced range slider per [[feedback_heavy_render_sliders_need_draft]].
// Local draft state during drag; commits on 150ms idle window OR pointer-up
// (whichever comes first). Generate endpoint is ~50–80ms per call so a
// dragged slider without debouncing would queue dozens of stale fetches.
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
