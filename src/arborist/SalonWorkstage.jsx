/**
 * SalonWorkstage — chassis + bark + leaves composition surface (Brief 1,
 * baby Sequoia, 2026-05-21). Fork of `ProceduralWorkstage.jsx` with the
 * per-slot controls rail and data wiring swapped. ~70% lifted intact:
 *
 * LIFTED INTACT (do not re-implement — see brief constraints):
 *   - Header strip pattern (active-species dropdown, etc.) — Brief 18A
 *     (Mullion) replaced the ← Library button with LookPicker + Grove →
 *     and renamed the brand to `Arborist / Salon` (Salon is now default)
 *   - Slot tabs strip + dirty-dot indicator
 *   - SlotCard (viewport + right rail + footer pattern)
 *   - SpecimenViewport mount with rotator ring + obelisk + height indicator
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
 *   - The wind / perf gauge floating-overlay pattern is now duplicated
 *     across Procedural + Salon. Future consolidation candidate; flagged.
 *     (LoD selector retired from Salon per Brief 13 refinement 2026-05-23 —
 *     Salon authors at raw chassis fidelity; geometry LoD is a downstream
 *     deploy concern handled by Brief 6's adaptive bake.)
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

// Brief 8 (Linnet): subscribe to the Meteorologist canary localStorage key
// for the active-canary indicator. Returns the parsed payload or null.
// Cross-tab via browser's 'storage' event; same-tab via the synthetic
// StorageEvent fired by setSalonCanary in the store (browsers don't fire
// 'storage' in the writer's own tab).
function readCanaryPref() {
  try { return JSON.parse(localStorage.getItem('meteorologist-canary-tree') ?? 'null') }
  catch { return null }
}
function useCanaryPref() {
  const [pref, setPref] = useState(() => readCanaryPref())
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== 'meteorologist-canary-tree') return
      setPref(readCanaryPref())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return pref
}

// §9 — the dossier's reference plates beside the live tree ("so we know what
// we're going for"). The cloud-Tuner's ground truth as a UI element, not an
// agent. Reads the active species' dossier; null (hidden) when there is none.
// referenceImages are external source URLs (Wikimedia / MoBot / arboretum) —
// the captions are the ground truth; clicking opens the plate. (In-repo
// thumbnails are the Stage-1 ingest download step; manifests carry the URLs.)
function ReferencePanel() {
  const d = useArboristStore(s => s.salonDossier)
  const [open, setOpen] = useState(true)
  if (!d) return null
  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, maxWidth: 300, zIndex: 5,
      background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 6, padding: '9px 11px', fontSize: 11, color: '#cdd6df', pointerEvents: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', cursor: 'pointer', gap: 8 }}
        onClick={() => setOpen(o => !o)}>
        <span style={{ fontWeight: 600, color: '#e6e9ee' }}>📖 {d.key} <i style={{ color: '#8aa3bb', fontWeight: 400 }}>{d.scientific}</i></span>
        <span style={{ color: '#778' }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <>
          {d.descriptor && <div style={{ marginTop: 5, color: '#aeb8c2', lineHeight: 1.4 }}>{d.descriptor}</div>}
          {d.identityNotes && <div style={{ marginTop: 5, color: '#8a93a0', fontStyle: 'italic', lineHeight: 1.35 }}>{d.identityNotes}</div>}
          <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(d.referenceImages || []).map((p, i) => (
              <a key={i} href={p.url} target="_blank" rel="noreferrer"
                style={{ color: '#9fc0e8', textDecoration: 'none', lineHeight: 1.35 }} title={`${p.caption}\n— ${p.credit}`}>
                <b style={{ textTransform: 'uppercase', fontSize: 9, color: '#c8a83a' }}>{p.state}</b> — {p.caption}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// §7/§9 — the matcher's ranked WORKABLE options for one part-type, shown above
// the raw dropdown: a verdict dot (🟢 workable / 🟡 stretch), the closeness score,
// and per-axis badges (habit✓ size✓ …) so the operator sees HOW close + WHICH
// axes are hard vs nice-to-have, and can pick from options instead of dialing
// from zero. `~` = the match rests on an unratified (provisional) tag. Hidden
// when the species has no dossier (the raw dropdown remains).
function MatchOptions({ result, current, onPick, limit = 8 }) {
  if (!result || !result.options || result.options.length === 0) return null
  const VDOT = { workable: '#3fb950', stretch: '#d8a019' }
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#778', marginBottom: 4 }}>
        Matcher · {result.totalWorkable} workable{result.preselect ? ' · 1 obvious' : ''}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 168, overflowY: 'auto' }}>
        {result.options.slice(0, limit).map(o => {
          const sel = o.partId === current
          return (
            <button key={o.partId} onClick={() => onPick(o.partId)}
              title={o.perAxis.map(a => `${a.axis}: need ${a.required} / got ${a.actual} ${a.withinTol ? '✓' : '✗'}${a.provisional ? ' (provisional)' : ''}`).join('\n')}
              style={{
                textAlign: 'left', cursor: 'pointer', borderRadius: 4, padding: '4px 7px',
                background: sel ? 'rgba(120,160,220,0.18)' : 'rgba(255,255,255,0.03)',
                border: '1px solid ' + (sel ? 'rgba(120,160,220,0.5)' : 'rgba(255,255,255,0.07)'),
                color: '#cdd6df', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: VDOT[o.verdict] || '#777' }} />
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.partId}</span>
              {o.provisional && <span title="rests on an unratified tag" style={{ color: '#c8a83a' }}>~</span>}
              <span style={{ color: '#889', fontVariantNumeric: 'tabular-nums' }}>{Math.round(o.score * 100)}</span>
              <span style={{ display: 'flex', gap: 4 }}>
                {o.perAxis.map(a => (
                  <span key={a.axis} style={{ fontSize: 9, color: a.withinTol ? '#6a9a4a' : '#b06a5a' }}>
                    {a.axis.split('.')[1]}{a.withinTol ? '✓' : '✗'}
                  </span>
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function SalonWorkstage() {
  const setGroveOpen        = useArboristStore(s => s.setGroveOpen)
  const speciesList         = useArboristStore(s => s.salonSpeciesList)
  const activeSpecies       = useArboristStore(s => s.salonActiveSpecies)
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
  // Brief 26 (Cadastre): roster-driven navigation. The top nav is the
  // canonicalized park roster (from GET /coverage); selecting a roster species
  // drives salonActiveSpecies onto its canonical id, and the existing
  // composition machinery authors under it.
  const rosterCoverage      = useArboristStore(s => s.rosterCoverage)
  const rosterLoading       = useArboristStore(s => s.rosterLoading)
  const loadRosterCoverage  = useArboristStore(s => s.loadRosterCoverage)
  const activeRosterName    = useArboristStore(s => s.activeRosterName)
  const selectRosterSpecies = useArboristStore(s => s.selectRosterSpecies)
  const setRosterRouting    = useArboristStore(s => s.setRosterRouting)
  // Brief 1.5b (Quill): chassis curation surface.
  const chassisCuration     = useArboristStore(s => s.salonChassisCuration)
  const loadChassisCuration = useArboristStore(s => s.loadSalonChassisCuration)
  const setChassisCuration  = useArboristStore(s => s.setSalonChassisCuration)
  // Brief 8 (Linnet): canary writer + active-canary indicator.
  const setSalonCanary      = useArboristStore(s => s.setSalonCanary)
  const canaryPref          = useCanaryPref()

  // Mount-time fetch: when Salon was restored open via localStorage, setSalonOpen
  // never fires this session, so the store's load actions wouldn't otherwise run.
  // Re-fetch on every mount; cheap (small JSON) and idempotent.
  useEffect(() => {
    loadSalonSpecies()
    loadSalonLibraries()
    loadChassisCuration()
    loadRosterCoverage()
  }, [loadSalonSpecies, loadSalonLibraries, loadChassisCuration, loadRosterCoverage])

  // "Approved only" filter — default ON. Persists for the session only;
  // the filter is a viewing preference, not authored chassis state.
  const [approvedOnly, setApprovedOnly] = useState(true)
  // Brief 26: candidate scope for the chassis picker — 'recommended' (chassis
  // fitting THIS roster species, from the coverage join) vs 'all' (full library).
  const [candidateScope, setCandidateScope] = useState('recommended')

  // The selected roster row + its recommended-chassis names (computed by the
  // coverage join). The navigator drives salonActiveSpecies = row.canonicalId.
  const rosterSpecies   = rosterCoverage?.species || []
  const activeRosterRow = rosterSpecies.find(s => s.species === activeRosterName) || null
  const recommendedNames = activeRosterRow?.recommendedChassis || []

  // Brief 8 (Linnet): published-variant set for the active species, used to
  // gate the canary button. A composition slot is "canary-ready" iff its
  // variant id exists in the published manifest (i.e. operator has run
  // Re-publish since the slot was added). Re-fetched on species change and
  // after a republish completes; cache-busted so a fresh publish is seen
  // immediately. Per ARCH.md §canary — kept in component state, not store.
  const [publishedVariants, setPublishedVariants] = useState(new Set())
  useEffect(() => {
    if (!activeSpecies) { setPublishedVariants(new Set()); return }
    if (publishing) return  // refetch once the republish settles
    let cancelled = false
    fetch(`/api/arborist/species/${encodeURIComponent(activeSpecies)}?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then(m => {
        if (cancelled) return
        const ids = new Set((m?.variants || []).map(v => Number(v.id)))
        setPublishedVariants(ids)
      })
      .catch(() => { if (!cancelled) setPublishedVariants(new Set()) })
    return () => { cancelled = true }
  }, [activeSpecies, publishing])

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
        <strong style={{
          letterSpacing: '0.15em', textTransform: 'uppercase',
          fontSize: 12, color: '#fff',
        }}>Arborist <span style={{ color: '#666', margin: '0 4px' }}>/</span> Salon</strong>

        {/* Brief 26: the SPECIES dropdown is gone — navigation is the roster
            list in the left column. Show the selected roster species here. */}
        <span style={{ marginLeft: 16, color: activeRosterName ? '#e8c878' : '#666', fontSize: 12, letterSpacing: '0.04em' }}>
          {activeRosterName || 'Select a roster species →'}
        </span>

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ color: '#888', fontSize: 11 }}>
            {anyDirty
              ? <span style={{ color: '#e8b860' }}>{Object.keys(dirty).length} unadopted</span>
              : 'all adopted'}
          </span>
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

      {/* Main: roster navigator (left) + inside authoring view (right) */}
      <main style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <RosterNavigator
          species={rosterSpecies}
          loading={rosterLoading}
          activeRosterName={activeRosterName}
          onSelect={selectRosterSpecies}
        />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!activeRosterName && (
            <div style={{ color: '#888', padding: 24, margin: 'auto', textAlign: 'center', maxWidth: 440, lineHeight: 1.6 }}>
              Pick a roster species on the left to author it — choose a chassis
              (<em>recommended</em> or <em>show all</em>) + bark + leaves + height,
              or mark it <em>not-available</em> (renders no tree).
            </div>
          )}

          {activeRosterName && (
            <>
              <InsideHeader
                row={activeRosterRow}
                candidateScope={candidateScope}
                onCandidateScope={setCandidateScope}
                recommendedCount={recommendedNames.length}
                onNotAvailable={() => {
                  if (window.confirm(`Mark "${activeRosterName}" not-available? Its placements route to no tree (deliberate gap). You can re-compose it later.`)) {
                    setRosterRouting(activeRosterName, null)
                  }
                }}
              />

              {/* Slot tabs + Add-slot button */}
              <div style={{
                padding: '8px 18px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                background: 'rgba(255,255,255,0.015)',
              }}>
                {compositions.map(v => {
                  const isActive = v.slot === activeSlot
                  const isDirty  = !!dirty[v.slot]
                  const isCanary = canaryPref
                    && canaryPref.species === activeSpecies
                    && Number(canaryPref.variantId) === Number(v.slot)
                  return (
                    <button key={v.slot} onClick={() => setActiveSlot(v.slot)}
                      title={isCanary ? 'Currently set as Meteorologist canary' : undefined}
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
                      {isCanary && (
                        <span style={{
                          fontSize: 9, letterSpacing: '0.1em',
                          padding: '1px 5px', borderRadius: 2,
                          background: 'rgba(200,192,224,0.18)',
                          border: '1px solid rgba(200,192,224,0.4)',
                          color: '#c8c0e0',
                        }}>CANARY</span>
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

              {/* Inside authoring view */}
              <div style={{
                flex: 1, padding: 18, overflow: 'hidden',
                display: 'flex', minHeight: 0,
              }}>
                {compositions.length === 0 && !chassisLibEmpty && (
                  <div style={{ color: '#888', padding: 12 }}>
                    No composition yet for <b>{activeRosterName}</b> (authored under <code style={{ color: '#aaa' }}>{activeSpecies}</code>).
                    Click <b>+ Add slot</b> to start, or mark it not-available above.
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
                    deformer={activeComposition.effective?.deformer || {}}
                    transform={activeComposition.effective?.transform || activeComposition.transform || {}}
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
                    onParams={(patch) => setSlotParams(activeSpecies, activeComposition.slot, patch)}
                    onNameChange={(name) => setSlotName(activeSpecies, activeComposition.slot, name)}
                    onReset={() => resetSlot(activeSpecies, activeComposition.slot)}
                    onAdopt={() => adoptSlot(activeSpecies, activeComposition.slot)}
                    onSetCanary={() => setSalonCanary(activeSpecies, activeComposition.slot, activeLookId)}
                    canaryDisabledReason={
                      !activeLookId ? 'No active Look — open a Look in the cartograph first'
                      : (dirty[activeComposition.slot] ? 'Adopt the composition first'
                      : (!publishedVariants.has(Number(activeComposition.slot)) ? 'Re-publish species first'
                      : null))
                    }
                    isCanary={
                      canaryPref
                      && canaryPref.species === activeSpecies
                      && Number(canaryPref.variantId) === Number(activeComposition.slot)
                    }
                    chassisCuration={chassisCuration}
                    onChassisCuration={setChassisCuration}
                    approvedOnly={approvedOnly}
                    onApprovedOnlyChange={setApprovedOnly}
                    candidateScope={candidateScope}
                    recommendedNames={recommendedNames}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '12px 18px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 14,
        color: '#888', fontSize: 11,
      }}>
        <button
          onClick={async () => {
            // Compose = publish the composition under the canonical id, THEN
            // claim the routing (park_species_map[rosterName] = [canonicalId])
            // so bake-trees#pickVariant sends this roster species' placements
            // to it. Brief 26 routing write.
            await republishSpecies(activeSpecies)
            if (activeRosterName) await setRosterRouting(activeRosterName, activeSpecies)
          }}
          disabled={publishing || anyDirty || !activeSpecies || compositions.length === 0 || anyMissingChassis}
          title={
            anyDirty ? 'Adopt all dirty slots before republishing'
            : anyMissingChassis ? 'Every slot needs a chassis picked before publish'
            : compositions.length === 0 ? 'Add a composition first'
            : 'Publish this composition under the roster species canonical id + route its placements to it. Bake the slab from Grove to ship to LS.'
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
          Stages to the species library — bake the slab from <strong style={{ color: '#bbb' }}>Grove</strong> to update LS.
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
  species, slot, slotName, chassis, bark, leaves, deformer, transform,
  chassisCatalog, speciesMorphology, barkRefs, leafPacks,
  dirty, targetCategory,
  windEnabled, windStrength, onWindEnabledChange, onWindStrengthChange,
  onParams, onNameChange, onReset, onAdopt,
  onSetCanary, canaryDisabledReason, isCanary,
  chassisCuration, onChassisCuration, approvedOnly, onApprovedOnlyChange,
  candidateScope, recommendedNames,
}) {
  // Brief 7 (Cambium): replaced the /salon/generate blob-URL flow with the
  // preview-atlas pipeline. The endpoint builds a per-composition atlas +
  // UV-rewritten chassis GLB server-side; the workstage fetches static URLs
  // and SpecimenViewport mounts the SAME treeAtlasMaterial the LS runtime
  // uses. One shader implementation across both surfaces — Birch's interim
  // chunk-replication in SpecimenViewport retires with this commit.
  const [previewUrls, setPreviewUrls] = useState(null)  // { glbUrl, atlasUrl, normalUrl, manifestUrl }
  const [loading, setLoading] = useState(true)
  const [previewError, setPreviewError] = useState(null)
  const [perfSample, setPerfSample] = useState(null)
  // Brief 3A (Cant): preview re-roll seed. The single preview tree samples ONE
  // point of the authored range (its instance anchor hashes to one signature);
  // re-rolling perturbs the hash anchor so the operator can cycle through the
  // spread. Non-zero default so the first paint already shows a representative
  // (not the range's low end). Multi-instance preview deferred — see brief.
  const [deformSeed, setDeformSeed] = useState([12.9898, 78.233])
  const cameraStateRef = useRef({ distance: 22, height: 8 })
  const paramsKey = useMemo(
    () => JSON.stringify({ chassis, bark, leaves }),
    [chassis, bark, leaves],
  )

  useEffect(() => {
    if (!chassis) {
      setPreviewUrls(null); setLoading(false); setPreviewError('Pick a chassis to preview')
      return
    }
    let cancelled = false
    setLoading(true)
    setPreviewError(null)
    // Debounce: HTML `<input type="color">` fires onChange continuously
    // during drag (~30 Hz); each fires a full preview-atlas POST cascade
    // (manifest + atlas PNGs + GLB regen) that overwhelms the server queue
    // AND the browser's WebGL texture cache. 150 ms is the sweet spot —
    // operator drag feels live, but a held-and-dragged color picker
    // collapses to one trailing POST per stable frame.
    const timer = setTimeout(() => {
      fetch(`/api/arborist/salon/${encodeURIComponent(species)}/${slot}/preview-atlas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chassis, bark, leaves }),
      })
        .then(r => {
          if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.error || `HTTP ${r.status}`)))
          return r.json()
        })
        .then(data => {
          if (cancelled) return
          // Cache-bust on every successful build so useGLTF / TextureLoader
          // see a fresh URL when underlying bytes change. `path: 'noop'`
          // reuses bytes; bumping the version is still cheap and avoids
          // stale browser caches between sessions.
          const v = Date.now()
          setPreviewUrls({
            glbUrl:      `${data.glbUrl}?v=${v}`,
            atlasUrl:    `${data.atlasUrl}?v=${v}`,
            normalUrl:   `${data.normalUrl}?v=${v}`,
            manifestUrl: `${data.manifestUrl}?v=${v}`,
            buildPath:   data.path,
            buildMs:     data.ms,
          })
          setLoading(false)
        })
        .catch(err => {
          if (cancelled) return
          setPreviewError(String(err))
          setLoading(false)
        })
    }, 150)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [species, slot, chassis, paramsKey])

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

  // Brief 19 (Quartz): the authored gizmo transform (lean/tilt X-Z, rotateY,
  // posOffset, scale) — straightens/centers/scales mis-oriented vendor
  // chassis. Persisted to composition.transform and baked into the published
  // geometry (was inspection-only + thrown away on every slot/chassis switch).
  const [rotationY, setRotationY] = useState(0)
  const [posOffset, setPosOffset] = useState([0, 0, 0])
  const [scaleOverride, setScaleOverride] = useState(1)
  const [tiltX, setTiltX] = useState(0)
  const [tiltZ, setTiltZ] = useState(0)
  // HYDRATE from the persisted transform on slot/chassis switch (was: reset
  // to identity — which left persistence write-only). Identity when absent.
  // `transform` is intentionally NOT in the deps: re-hydrating on every
  // persistence write would fight the live gizmo drag (each drag writes
  // transform → would snap the gizmo back). Slot switch remounts the card
  // (key=slot); chassis switch re-reads the slot's stored transform.
  useEffect(() => {
    const t = transform || {}
    const po  = Array.isArray(t.posOffset) ? t.posOffset : [0, 0, 0]
    const rot = Array.isArray(t.rotation)  ? t.rotation  : [0, 0, 0]
    setPosOffset([po[0] || 0, po[1] || 0, po[2] || 0])
    setRotationY(rot[1] || 0)
    setTiltX(rot[0] || 0)
    setTiltZ(rot[2] || 0)
    setScaleOverride(typeof t.scale === 'number' ? t.scale : 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species, slot, chassis])

  // Persist the authored transform to composition.transform (→ setSlotParams
  // → compositions.json on Adopt; marks the slot dirty). Fires on every gizmo
  // change to match the existing param-edit pattern (immediate store write,
  // adopt persists). transform is absent from the preview `paramsKey`, so
  // this does NOT trigger a preview-atlas regen — the gizmo applies it live.
  const persistTransform = (over) => {
    onParams({ transform: {
      posOffset: over.posOffset ?? posOffset,
      rotation: [
        over.tiltX     ?? tiltX,
        over.rotationY ?? rotationY,
        over.tiltZ     ?? tiltZ,
      ],
      scale: over.scaleOverride ?? scaleOverride,
    } })
  }

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
        {previewUrls && !previewError && (
          <SpecimenViewport
            mode="skeleton"
            glbUrl={previewUrls.glbUrl}
            atlasUrl={previewUrls.atlasUrl}
            atlasNormalUrl={previewUrls.normalUrl}
            atlasManifestUrl={previewUrls.manifestUrl}
            viewKey={viewKey}
            forestryRotation={false}
            targetCategory={targetCategory}
            effectiveScale={scaleOverride}
            positionOffset={posOffset}
            rotationOffset={[tiltX, rotationY, tiltZ]}
            onRotationChange={(_rx, ry, _rz) => { setRotationY(ry); persistTransform({ rotationY: ry }) }}
            onPositionChange={(x, y, z) => { setPosOffset([x, y, z]); persistTransform({ posOffset: [x, y, z] }) }}
            onScaleChange={(s) => { setScaleOverride(s); persistTransform({ scaleOverride: s }) }}
            cameraStateRef={cameraStateRef}
            windStrength={windEnabled ? windStrength : 0}
            deformerRange={deformer?.range || null}
            deformerSeed={deformSeed}
            onPerfSample={setPerfSample}
          />
        )}
        {/* LoD selector retired Brief 13 refinement (2026-05-23 Vantage):
            Salon authors at raw chassis fidelity — geometry LoD is a
            deploy concern handled downstream by Brief 6's adaptive bake
            pipeline. One chassis at a time exerts no GPU budget pressure
            in the workstage; the perf gauge below still reports actual
            loaded counts. */}
        <PerfGauge sample={perfSample} />
        <ReferencePanel />

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
          deformer={deformer}
          chassisCatalog={chassisCatalog}
          speciesMorphology={speciesMorphology}
          barkRefs={barkRefs}
          leafPacks={leafPacks}
          onParams={onParams}
          onReroll={() => setDeformSeed([Math.random() * 200 - 100, Math.random() * 200 - 100])}
          tiltX={tiltX}
          tiltZ={tiltZ}
          onTiltXChange={(v) => { setTiltX(v); persistTransform({ tiltX: v }) }}
          onTiltZChange={(v) => { setTiltZ(v); persistTransform({ tiltZ: v }) }}
          chassisCuration={chassisCuration}
          onChassisCuration={onChassisCuration}
          approvedOnly={approvedOnly}
          onApprovedOnlyChange={onApprovedOnlyChange}
          candidateScope={candidateScope}
          recommendedNames={recommendedNames}
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
          {/* Brief 8 (Linnet): set this composition as the Meteorologist
              canary. Same payload Grove writes — see ARCHITECTURE.md
              §canary contract. Disabled until composition is adopted +
              re-published in the active Look. */}
          <button
            onClick={onSetCanary}
            disabled={!!canaryDisabledReason}
            title={canaryDisabledReason
              || (isCanary
                  ? 'Already the Meteorologist canary — click to re-fire (refreshes lookId)'
                  : 'Set this composition as Meteorologist canary')}
            style={{
              ...btnStyle(),
              background: isCanary ? 'rgba(200,192,224,0.18)' : 'rgba(255,255,255,0.04)',
              border: '1px solid ' + (isCanary ? 'rgba(200,192,224,0.5)' : 'rgba(255,255,255,0.1)'),
              color: canaryDisabledReason ? '#666' : (isCanary ? '#c8c0e0' : '#bbb'),
              cursor: canaryDisabledReason ? 'not-allowed' : 'pointer',
              opacity: canaryDisabledReason ? 0.5 : 1,
            }}>
            → Set canary
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
function BarkGradientEditor({ stops, tintBase, hashAmp, onCommit, onCommitHashAmp }) {
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
      {/* Brief 2.1 (Birch): cross-tree variation rides on top of the
          per-pixel luminance base. 0 = adjacent same-species trees
          pixel-identical; >0 = sub-amplitude hash offset along the ramp. */}
      <Row label="Cross-tree">
        <DraftSlider min={0} max={0.3} step={0.01}
          value={typeof hashAmp === 'number' ? hashAmp : 0}
          onCommit={(v) => onCommitHashAmp(v)}
          format={(v) => v.toFixed(2)} />
      </Row>
      <div style={{ fontSize: 10, color: '#888', fontStyle: 'italic', marginTop: 2 }}>
        Gradient replaces bark color via per-pixel luminance lookup
      </div>
    </>
  )
}

// ── Salon controls panel (the Brief 1 replacement for SCAPanel) ─────────

function SalonControlsPanel({
  chassis, bark, leaves, deformer,
  chassisCatalog, speciesMorphology,
  barkRefs, leafPacks,
  onParams, onReroll,
  tiltX, tiltZ, onTiltXChange, onTiltZChange,
  chassisCuration, onChassisCuration, approvedOnly, onApprovedOnlyChange,
  candidateScope, recommendedNames,
}) {
  const matchOptions = useArboristStore(s => s.salonOptions)   // §9 matcher ranked options (null if no dossier)
  // Chassis picker filtered by morphology suggestion: matching-morphology
  // first, then everything else. Brief 1.5b layers curation on top:
  //   - if `approvedOnly` is ON, drop entries whose `approved !== true`
  //   - within the surviving set, the morphology ordering still applies
  //   - displayName (when set) overrides the filename for sort + label
  // Empty-state is handled by the parent (whole workstage shows the
  // regenerate instruction when catalog is empty).
  const curationKey = (c) => `${c.name}.glb`
  // Brief 26: candidate scope. 'recommended' = chassis fitting THIS roster
  // species (names from the coverage join), intersected with the catalog (so
  // procedural/forest chassis the catalog already excludes never appear).
  // 'all' = the full catalog, with the Brief 1.5b approved-only sub-filter.
  const ranked = useMemo(() => {
    if (chassisCatalog.length === 0) return []
    let pool = chassisCatalog
    if (candidateScope === 'recommended') {
      const set = new Set(recommendedNames || [])
      pool = pool.filter(c => set.has(c.name))
    } else if (approvedOnly) {
      pool = pool.filter(c => (chassisCuration[curationKey(c)] || {}).approved === true)
    }
    const matches = pool.filter(c => c.morphology === speciesMorphology)
    const others  = pool.filter(c => c.morphology !== speciesMorphology)
    return [...matches, ...others]
  }, [chassisCatalog, speciesMorphology, approvedOnly, chassisCuration, candidateScope, recommendedNames])
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
      <MatchOptions result={matchOptions?.chassis} current={chassis} onPick={(id) => onParams({ chassis: id })} />
      {/* Brief 26: candidate scope is driven by the inside-view toggle. In
          'recommended' scope the picker shows the roster species' fits and the
          approved-only sub-filter is bypassed; in 'all' scope the Brief 1.5b
          approved-only toggle applies over the full catalog. */}
      {candidateScope === 'recommended' ? (
        <Row label="">
          <span style={{ fontSize: 10, color: '#888', lineHeight: 1.4 }}>
            Showing <b style={{ color: '#bbb' }}>{ranked.length}</b> recommended chassis for this roster species. Switch to <i>Show all</i> above for the full library.
          </span>
        </Row>
      ) : (
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
      )}
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
      <MatchOptions result={matchOptions?.bark} current={bark?.ref} onPick={(id) => onParams({ bark: { ref: id } })} />
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
        hashAmp={bark?.gradientHashAmp}
        onCommit={(next) => onParams({ bark: { gradientStops: next } })}
        onCommitHashAmp={(v) => onParams({ bark: { gradientHashAmp: v } })} />

      <SectionLabel>Leaves</SectionLabel>
      <MatchOptions result={matchOptions?.leaf} current={leaves?.pack} onPick={(id) => onParams({ leaves: { pack: id } })} />
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
      <Row label="Leaf source">
        <select
          value={leaves?.mode ?? 'authored'}
          onChange={(e) => onParams({ leaves: { mode: e.target.value } })}
          style={selectStyle}
          title="Authored = the model's own leaves, retextured to the pack, resized in place by Leaf size (Ways does NOT apply — the cards keep their authored placement + stems). Synthesized = kit-generated spray from the pack + Ways + leaf size.">
          <option value="authored">Authored (model's own leaves)</option>
          <option value="synthesized">Synthesized (kit spray: pack · Ways · size)</option>
        </select>
      </Row>
      {leaves?.mode !== 'synthesized' && (
        <div style={{ fontSize: 10, color: '#c8a83a', margin: '-3px 0 3px', lineHeight: 1.3 }}>
          ↳ Authored keeps the model's own leaves on their stems. <b>Leaf size</b> resizes them in place; <b>Ways</b> applies to Synthesized only.
        </div>
      )}
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
      <Row label="Ways">
        <select
          value={leaves?.ways ?? 'alternate'}
          onChange={(e) => onParams({ leaves: { ways: e.target.value } })}
          disabled={leaves?.mode !== 'synthesized'}
          style={{ ...selectStyle, opacity: leaves?.mode === 'synthesized' ? 1 : 0.5 }}
          title="Leaf arrangement (§5) — how cards attach + orient on the canopy. Synthesized leaves only.">
          <option value="alternate">Alternate (scatter)</option>
          <option value="opposite">Opposite (maple / ash)</option>
          <option value="all-one-direction">Drooping (willow)</option>
          <option value="sprays">Sprays (compound)</option>
          <option value="clusters">Clusters (ginkgo)</option>
        </select>
      </Row>
      <Row label="Occupancy">
        <DraftSlider min={0} max={1} step={0.01}
          value={leaves?.occupancy ?? 0.7}
          onCommit={(v) => onParams({ leaves: { occupancy: v } })}
          format={(v) => `${Math.round(v * 100)}%`} />
      </Row>
      <Row label="Leaf size">
        <DraftSlider min={0.4} max={2.5} step={0.05}
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

      <DeformerPanel deformer={deformer} onParams={onParams} onReroll={onReroll} />
    </div>
  )
}

// Brief 3A (Cant) — per-instance deformer ranges. Three ops, each authored as
// a [lo,hi] band the runtime samples per-instance by a world-XZ hash: lean +
// twist grow from base→top (canopy tilts/spins, base stays planted), wander
// drifts the centerline sideways along height. Lean/twist authored in DEGREES
// (operator-friendly, like the chassis Tilt knobs) and stored in RADIANS;
// wander in metres. The store deep-merges `deformer` one level, so every commit
// resends the FULL range object (else sibling ops get wiped). Re-roll perturbs
// the single-tree preview's hash so the operator can cycle the spread.
const R2D = 180 / Math.PI
const D2R = Math.PI / 180
function DeformerPanel({ deformer, onParams, onReroll }) {
  const range  = deformer?.range || {}
  const lean   = Array.isArray(range.lean)   ? range.lean   : [0, 0]
  const twist  = Array.isArray(range.twist)  ? range.twist  : [0, 0]
  const wander = Array.isArray(range.wander) ? range.wander : [0, 0]
  const commit = (next) => onParams({ deformer: { range: { lean, twist, wander, ...next } } })
  return (
    <>
      <SectionLabel>Deformer</SectionLabel>
      <Row label="">
        <span style={{ fontSize: 10, color: '#777', lineHeight: 1.4 }}>
          Per-instance lean / twist / wander. One chassis → many distinct reads.
        </span>
      </Row>
      <Row label="Lean lo">
        <DraftSlider min={0} max={35} step={1}
          value={lean[0] * R2D}
          onCommit={(v) => commit({ lean: [v * D2R, lean[1]] })}
          format={(v) => `${v.toFixed(0)}°`} />
      </Row>
      <Row label="Lean hi">
        <DraftSlider min={0} max={35} step={1}
          value={lean[1] * R2D}
          onCommit={(v) => commit({ lean: [lean[0], v * D2R] })}
          format={(v) => `${v.toFixed(0)}°`} />
      </Row>
      <Row label="Twist lo">
        <DraftSlider min={-25} max={25} step={1}
          value={twist[0] * R2D}
          onCommit={(v) => commit({ twist: [v * D2R, twist[1]] })}
          format={(v) => `${v.toFixed(0)}°`} />
      </Row>
      <Row label="Twist hi">
        <DraftSlider min={-25} max={25} step={1}
          value={twist[1] * R2D}
          onCommit={(v) => commit({ twist: [twist[0], v * D2R] })}
          format={(v) => `${v.toFixed(0)}°`} />
      </Row>
      <Row label="Wander lo">
        <DraftSlider min={0} max={1.2} step={0.05}
          value={wander[0]}
          onCommit={(v) => commit({ wander: [v, wander[1]] })}
          format={(v) => `${v.toFixed(2)}m`} />
      </Row>
      <Row label="Wander hi">
        <DraftSlider min={0} max={1.2} step={0.05}
          value={wander[1]}
          onCommit={(v) => commit({ wander: [wander[0], v] })}
          format={(v) => `${v.toFixed(2)}m`} />
      </Row>
      <Row label="">
        <button onClick={onReroll} style={{ ...btnStyle({ block: true }), fontSize: 11 }}>
          Re-roll preview sample
        </button>
      </Row>
    </>
  )
}

// ── Lifted helpers (identical to ProceduralWorkstage) ──────────────────

function PerfGauge({ sample }) {
  const fmtN = (n) => n == null ? '—' : n.toLocaleString()
  const tris = sample?.tris
  // LoD selector removed (Brief 13 refinement). Salon authors at raw
  // fidelity, so tri bands no longer scale by LoD — green < 20k, yellow
  // 20–40k, red > 40k applies to the unsimplified chassis.
  const greenLim  = 20000
  const yellowLim = 40000
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

// ── Look picker ───────────────────────────────────────────────────────
// Lifted from ArboristApp.jsx in Brief 18A (Mullion). Lists every Look
// from Cartograph + a "+ New Look" row. The active Look is the curation
// target — Grove's roster writes to the active Look's design.json.
// Grove keeps its own LookPicker copy (per brief constraint — no shared
// hook refactor in 18A).
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

// ── Roster navigator (Brief 26, Cadastre 2026-05-25) ──────────────────────
// The Salon's top nav: the canonicalized park roster (GET /coverage). Each row
// shows placement count + coverage badge (🟢 literal / 🟡 composite / 🔴 gap)
// + authoring state (composed / not-available / unauthored). Clicking drives
// salonActiveSpecies onto the row's canonical id (a slug — the settled keying
// spine), where the existing composition machinery authors under it.
const COVERAGE_DOT = { literal: '🟢', composite: '🟡', gap: '🔴' }
const STATE_META = {
  composed:        { label: 'composed',      color: '#9ed8b0' },
  'not-available': { label: 'not-available', color: '#c89a3a' },
  unauthored:      { label: 'unauthored',    color: '#777' },
}

function RosterNavigator({ species, loading, activeRosterName, onSelect }) {
  const [q, setQ] = useState('')
  const [stateFilter, setStateFilter] = useState('all')
  const rows = species.filter(s => {
    if (q && !s.species.toLowerCase().includes(q.toLowerCase())) return false
    if (stateFilter !== 'all' && s.authoringState !== stateFilter) return false
    return true
  })
  return (
    <div style={{
      width: 300, flexShrink: 0,
      borderRight: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column', minHeight: 0,
      background: 'rgba(255,255,255,0.015)',
    }}>
      <div style={{
        padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Roster · {species.length} species
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="filter species…"
          style={{ ...selectStyle, padding: '4px 6px' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {[['all', 'All'], ['unauthored', 'Todo'], ['composed', 'Done'], ['not-available', 'N/A']].map(([v, l]) => (
            <button key={v} onClick={() => setStateFilter(v)}
              style={{
                flex: 1, ...btnStyle(), fontSize: 10, padding: '3px 4px',
                background: stateFilter === v ? 'rgba(232,184,96,0.18)' : 'rgba(255,255,255,0.04)',
                color: stateFilter === v ? '#e8c878' : '#aaa',
              }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loading && <div style={{ padding: 12, color: '#888', fontSize: 11 }}>Loading roster…</div>}
        {!loading && rows.length === 0 && <div style={{ padding: 12, color: '#888', fontSize: 11 }}>No matching species.</div>}
        {rows.map(s => {
          const active = s.species === activeRosterName
          const sm = STATE_META[s.authoringState] || STATE_META.unauthored
          return (
            <button key={s.species} onClick={() => onSelect(s)}
              title={`canonical: ${s.canonicalId} · coverage: ${s.coverage}`}
              style={{
                width: '100%', textAlign: 'left', border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: active ? 'rgba(232,184,96,0.14)' : 'transparent',
                cursor: 'pointer', padding: '7px 10px', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
              <span style={{ width: 18, textAlign: 'center' }}>{COVERAGE_DOT[s.coverage] || ''}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, color: active ? '#e8c878' : '#ddd',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{s.species}</div>
                <div style={{ fontSize: 10, color: sm.color }}>{s.count} placements · {sm.label}</div>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Inside-view header strip: roster species identity + coverage badge +
// authoring state, the recommended ↔ show-all candidate toggle, and the
// mark-not-available action.
function InsideHeader({ row, candidateScope, onCandidateScope, recommendedCount, onNotAvailable }) {
  if (!row) return null
  return (
    <div style={{
      padding: '8px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 13, color: '#fff' }}>{COVERAGE_DOT[row.coverage]} {row.species}</span>
      <span style={{ fontSize: 11, color: '#888' }}>
        {row.count} placements · canonical <code style={{ color: '#aaa' }}>{row.canonicalId}</code>
        {row.authoringState === 'not-available' && <span style={{ color: '#c89a3a' }}> · NOT-AVAILABLE</span>}
        {row.authoringState === 'composed' && <span style={{ color: '#9ed8b0' }}> · composed</span>}
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
          {[['recommended', `Recommended (${recommendedCount})`], ['all', 'Show all']].map(([v, l]) => (
            <button key={v} onClick={() => onCandidateScope(v)}
              style={{
                border: 'none', padding: '5px 10px', fontSize: 11,
                background: candidateScope === v ? 'rgba(255,255,255,0.14)' : 'transparent',
                color: candidateScope === v ? '#fff' : '#aaa',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{l}</button>
          ))}
        </div>
        <button onClick={onNotAvailable}
          title="Mark this roster species as a deliberate gap (routes to no tree)"
          style={{ ...btnStyle(), color: '#c89a3a', border: '1px solid rgba(200,154,58,0.4)' }}>
          Mark not-available
        </button>
      </span>
    </div>
  )
}
