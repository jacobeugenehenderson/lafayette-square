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

      {/* ── Variant grid ─────────────────────────────────────────── */}
      <main style={{
        flex: 1, padding: 18, overflow: 'auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 16, alignContent: 'start',
      }}>
        {seedlings.length === 0 && (
          <div style={{ color: '#888', padding: 12 }}>
            {speciesMeta ? 'No variant slots — check seedlings.json.' : 'Loading seedlings…'}
          </div>
        )}
        {seedlings.map(v => (
          <SlotCard
            key={v.slot}
            species={activeSpecies}
            slot={v.slot}
            seed={v.seed}
            params={v.params}
            dirty={!!dirty[v.slot]}
            targetCategory={targetCategory}
            onDice={() => diceSlot(activeSpecies, v.slot)}
            onSeedEdit={(seed) => setSlotSeed(activeSpecies, v.slot, seed)}
            onAdopt={() => adoptSlot(activeSpecies, v.slot)}
          />
        ))}
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
function SlotCard({ species, slot, seed, params, dirty, targetCategory, onDice, onSeedEdit, onAdopt }) {
  const [glbUrl, setGlbUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [previewError, setPreviewError] = useState(null)
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
      body: JSON.stringify({ species, slot, seed, params: params || {} }),
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
  }, [species, slot, seed, paramsKey])

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

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid ' + (dirty ? 'rgba(232,184,96,0.55)' : 'rgba(255,255,255,0.08)'),
      borderRadius: 6,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 12px',
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
      <div style={{ height: 280, position: 'relative', background: '#0d0d10' }}>
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
            effectiveScale={1}
            positionOffset={[0, 0, 0]}
            rotationOffset={[0, 0, 0]}
            cameraStateRef={cameraStateRef}
          />
        )}
      </div>
      <div style={{
        padding: '10px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
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
              width: 90,
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
