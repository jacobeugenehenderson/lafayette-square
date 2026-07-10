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
import ChassisPlate from './ChassisPlate.jsx'

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
      margin: '0 12px 10px', maxWidth: 'none',
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 6, padding: '9px 11px', fontSize: 11, color: '#cdd6df',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', cursor: 'pointer', gap: 8 }}
        onClick={() => setOpen(o => !o)}>
        <span style={{ fontWeight: 600, color: '#e6e9ee' }}>📖 {d.key} <i style={{ color: '#8aa3bb', fontWeight: 400 }}>{d.scientific}</i>{d.required?.['chassis.size']?.target ? <span style={{ color: '#9ab', fontWeight: 400, fontSize: 10 }}> · mature ~{d.required['chassis.size'].target}m</span> : null}</span>
        <span style={{ color: '#778' }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <>
          {d.descriptor && <div style={{ marginTop: 5, color: '#aeb8c2', lineHeight: 1.4 }}>{d.descriptor}</div>}
          {d.identityNotes && <div style={{ marginTop: 5, color: '#8a93a0', fontStyle: 'italic', lineHeight: 1.35 }}>{d.identityNotes}</div>}
          <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* 2026-06-25: the educational card only earns its place with IMAGES
                — show the reference photos inline (click opens the source). An
                image that fails to load (CORS/404) hides itself. */}
            {(d.referenceImages || []).map((p, i) => (
              <a key={i} href={p.url} target="_blank" rel="noreferrer"
                style={{ display: 'block', textDecoration: 'none' }}
                title={`${p.state} — ${p.caption}\n${p.credit}`}>
                <img src={p.url} alt={p.caption} loading="lazy"
                  style={{ width: '100%', borderRadius: 4, display: 'block', border: '1px solid rgba(255,255,255,0.08)' }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }} />
                <span style={{ fontSize: 9, color: '#8a93a0' }}>
                  <b style={{ textTransform: 'uppercase', color: '#c8a83a' }}>{p.state}</b> {p.caption}
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}


// B1 (2026-06-25) — visual plate picker (the "fashion plates"). Replaces the raw
// <select> AND the redundant MatchOptions text row for parts with an image on
// disk: bark swatch = color.jpg, leaf cutout = shape.png. Clickable grid, current
// pick ringed. An item flagged `missing` (a documented gap — e.g. a 'flat' leaf
// pack with no cutout asset) renders dimmed with a "needed" tag, so the grid
// reads as a COVERAGE map, not a list of look-alike options (the screenshot that
// surfaced the empty packs). `onAdd` appends an "Add +" tile (procure/author a
// new part — behavior TBD). SALON-INTERFACE.md §5 (the plate-rack).
// (Add +) handler — behavior TBD (procure / author a new part). Placeholder so
// the affordance exists; wire to the real add/ingest flow once Jacob defines it.
function salonAddStub(kind) {
  console.info('[salon] Add', kind, '— behavior TBD (define the add/procure flow)')
}

// B2: how many top-ranked chassis render as live silhouette plates (each its own
// WebGL context, so keep it small; the full library is behind "Browse all").
const CHASSIS_PLATE_N = 8

const CELL_IMG = {
  width: '100%', aspectRatio: '1 / 1', borderRadius: 3, overflow: 'hidden',
  background: 'repeating-conic-gradient(#2c2c2c 0% 25%, #232323 0% 50%) 50% / 12px 12px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
function PlatePicker({ items, current, onPick, onAdd, thumb, fit = 'cover', empty = '(loading…)', tile = 60 }) {
  if ((!items || items.length === 0) && !onAdd) {
    return <div style={{ fontSize: 11, color: '#777', padding: '2px 0 8px' }}>{empty}</div>
  }
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${tile}px, 1fr))`,
      gap: 6, padding: '2px 0 8px',
    }}>
      {(items || []).map(it => {
        const sel = it.id === current
        return (
          <button key={it.id} type="button" onClick={() => onPick(it.id)} title={it.note || it.label}
            style={{
              cursor: 'pointer', padding: 3, borderRadius: 5,
              background: sel ? 'rgba(120,160,220,0.18)' : 'rgba(255,255,255,0.03)',
              border: '1px solid ' + (sel ? 'rgba(120,160,220,0.75)' : 'rgba(255,255,255,0.08)'),
              opacity: it.missing ? 0.6 : 1,
              display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch',
            }}>
            <div style={CELL_IMG}>
              {it.missing ? (
                <span style={{
                  fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c8a83a',
                  border: '1px solid rgba(200,168,58,0.5)', borderRadius: 3, padding: '2px 4px',
                }}>needed</span>
              ) : (
                <img src={thumb(it.id)} alt={it.label} loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }} />
              )}
            </div>
            <span style={{
              fontSize: 9, color: it.missing ? '#998a55' : (sel ? '#cdd6df' : '#99a'), textAlign: 'center',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{it.label}</span>
          </button>
        )
      })}
      {onAdd && (
        <button type="button" onClick={onAdd} title="Add a new part (procure / author) — behavior TBD"
          style={{
            cursor: 'pointer', padding: 3, borderRadius: 5,
            background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.22)',
            display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch',
          }}>
          <div style={{ ...CELL_IMG, background: 'none' }}>
            <span style={{ fontSize: 22, color: '#7a8aa0', lineHeight: 1 }}>+</span>
          </div>
          <span style={{ fontSize: 9, color: '#99a', textAlign: 'center' }}>Add</span>
        </button>
      )}
    </div>
  )
}

export default function SalonWorkstage() {
  const setGroveOpen        = useArboristStore(s => s.setGroveOpen)
  const setShelvesOpen      = useArboristStore(s => s.setShelvesOpen)
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
  // Re-publish + its publishing-state subscription retired 2026-06-25 (autosave + Grove bake regenerate-from-source).
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
  const [candidateScope, setCandidateScope] = useState('all')

  // The selected roster row + its recommended-chassis names (computed by the
  // coverage join). The navigator drives salonActiveSpecies = row.canonicalId.
  const rosterSpecies   = rosterCoverage?.species || []
  const activeRosterRow = rosterSpecies.find(s => s.species === activeRosterName) || null
  const recommendedNames = activeRosterRow?.recommendedChassis || []

  // Brief 8 (Linnet): published-variant set for the active species, used to
  // (publishedVariants canary-readiness tracking retired with Re-publish, 2026-06-25.)

  const compositions = compositionsBySpecies[activeSpecies] || []
  const dirty        = dirtyBySpecies[activeSpecies] || {}
  const speciesMeta  = speciesList.find(s => s.speciesId === activeSpecies)
  const targetCategory = MORPH_TO_TARGET_CATEGORY[speciesMeta?.morphology] || 'broadleaf'

  const anyDirty = Object.keys(dirty).length > 0
  const anyMissingChassis = compositions.some(c => !c.effective?.chassis && !c.chassis)
  const chassisLibEmpty = chassisCatalog.length === 0
  // Routing claim (was bundled in the retired Re-publish button, 2026-06-25):
  // map this roster species → its canonical id in park_species_map so bake-trees
  // routes its placements here. Idempotent; once per species when it has a
  // composed chassis. (Mark-N/A clears it via setRosterRouting(…, null).)
  const routedRef = useRef(new Set())
  useEffect(() => {
    if (!activeSpecies || !activeRosterName) return
    if (routedRef.current.has(activeSpecies)) return
    if (!compositions.some(c => c.effective?.chassis || c.chassis)) return
    routedRef.current.add(activeSpecies)
    setRosterRouting(activeRosterName, activeSpecies)
  }, [activeSpecies, activeRosterName, compositions, setRosterRouting])

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


        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <LookPicker />
          <button onClick={() => setShelvesOpen(true)}
            title="Browse all 241 chassis + tag each one's habit / leaf / bark (the tagging gauntlet)"
            style={{
              background: 'rgba(120,140,200,0.15)',
              border: '1px solid rgba(120,140,200,0.4)',
              color: '#c0ccf0',
              padding: '5px 12px', borderRadius: 4,
              fontFamily: 'inherit', fontSize: 12,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}>
            Shelves →
          </button>
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
                    onSetCanary={() => setSalonCanary(activeSpecies, activeComposition.slot, activeLookId)}
                    canaryDisabledReason={
                      !activeLookId ? 'No active Look — open a Look in the cartograph first' : null
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
        {/* Re-publish retired 2026-06-25 — autosave persists every edit and the
            Grove "Bake → Slab" regenerates-from-source + ships. Routing
            (park_species_map) is now claimed by the effect above, not here. */}
        <span>
          Edits autosave. Bake the slab from the <strong style={{ color: '#bbb' }}>Grove</strong> to ship to LS.
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
  onParams, onNameChange, onReset,
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
  // A1 (2026-06-25): the preview tree samples ONE point of the deformer range
  // (now MORPHOLOGY-DERIVED; the authoring panel is retired — SALON-INTERFACE §3-B).
  // Fixed non-zero seed so the single preview shows a representative deformed
  // read (not the range's low end); the spread is visible in the Grove / LS where
  // the per-instance hash varies across placements.
  const [deformSeed] = useState([12.9898, 78.233])
  const cameraStateRef = useRef({ distance: 22, height: 8 })
  // Bark-focus (2026-06-25): when the Bark section is open, the preview hides the
  // canopy (leaves `show` is preview-only) so the operator can SEE the bark they're
  // editing — the canopy otherwise occludes the trunk. Doesn't touch the
  // composition (the published tree always carries leaves).
  const [barkOpen, setBarkOpen] = useState(false)
  const previewLeaves = barkOpen ? { ...leaves, show: false } : leaves
  const paramsKey = useMemo(
    () => JSON.stringify({ chassis, bark, leaves: previewLeaves }),
    [chassis, bark, previewLeaves],
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
        body: JSON.stringify({ chassis, bark, leaves: previewLeaves }),
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

  // The overhead impostor is driven by the LEAF section controls (shape) + the
  // Wind toggle (motion, shared weather) — no separate overhead knobs.

  // Botanical height (2026-06-25): the PREVIEW scales the chassis to its species'
  // mature height — dossier `chassis.size.target` (m) ÷ the chassis's native
  // height (`meta.heightRange[1]`) — so species render RELATIVELY CORRECT to one
  // another (a 21m maple towering over an 8m dogwood), no manual scale knob.
  // ⚠️ Preview only for now; wiring the same scale into the BAKE (so LS ships
  // relative-correct sizes) is the eye-gated follow-up.
  const dossier = useArboristStore(s => s.salonDossier)
  const matureHeightM = dossier?.required?.['chassis.size']?.target
  const chassisNativeH = chassisCatalog.find(c => c.name === chassis)?.heightRange?.[1]
  const botanicalScale = (matureHeightM && chassisNativeH) ? matureHeightM / chassisNativeH : 1

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
            effectiveScale={botanicalScale}
            variantHeightSpread
            positionOffset={posOffset}
            rotationOffset={[tiltX, rotationY, tiltZ]}
            onRotationChange={(_rx, ry) => setRotationY(ry)}
            cameraStateRef={cameraStateRef}
            windStrength={windEnabled ? windStrength : 0}
            deformerRange={deformer?.range || null}
            deformerSeed={deformSeed}
            overhead={{
              // The overhead impostor reads the selected chassis's LEAF controls
              // (arrangement, density, size, pack, tints, show) — those ARE its
              // controllers. Motion comes from the shared wind (Wind toggle).
              show: leaves?.show,
              ways: leaves?.ways,
              pack: leaves?.pack,
              occupancy: leaves?.occupancy,
              scale: leaves?.scale,
              tintFront: leaves?.tintFront,
              tintBack: leaves?.tintBack,
            }}
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
        {/* Species intro / reference dossier — the "here's your species" anchor,
            top of the tools stack (moved up 2026-07-08). Collapsible. */}
        <ReferencePanel />

        <SalonControlsPanel
          chassis={chassis}
          bark={bark}
          leaves={leaves}
          barkOpen={barkOpen}
          onBarkOpenChange={setBarkOpen}
          chassisCatalog={chassisCatalog}
          speciesMorphology={speciesMorphology}
          barkRefs={barkRefs}
          leafPacks={leafPacks}
          onParams={onParams}
          tiltX={tiltX}
          tiltZ={tiltZ}
          onTiltXChange={(v) => { setTiltX(v); persistTransform({ tiltX: v }) }}
          onTiltZChange={(v) => { setTiltZ(v); persistTransform({ tiltZ: v }) }}
          groundY={posOffset[1]}
          onGroundYChange={(y) => { const next = [posOffset[0], y, posOffset[2]]; setPosOffset(next); persistTransform({ posOffset: next }) }}
          chassisCuration={chassisCuration}
          onChassisCuration={onChassisCuration}
          approvedOnly={approvedOnly}
          onApprovedOnlyChange={onApprovedOnlyChange}
          candidateScope={candidateScope}
          recommendedNames={recommendedNames}
        />

      </div>
    </div>
  )
}


// ── Salon controls panel (the Brief 1 replacement for SCAPanel) ─────────

function SalonControlsPanel({
  chassis, bark, leaves,
  chassisCatalog, speciesMorphology,
  barkRefs, leafPacks,
  onParams,
  tiltX, tiltZ, onTiltXChange, onTiltZChange,
  groundY, onGroundYChange,
  chassisCuration, onChassisCuration, approvedOnly, onApprovedOnlyChange,
  candidateScope, recommendedNames,
  barkOpen, onBarkOpenChange,
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
  const [orientOpen, setOrientOpen] = useState(false)  // "Fix orientation" advanced drawer (tilt/Y-up), collapsed by default
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
  // B2 fix (2026-06-25): the silhouette plates source the MATCHER's ranked
  // chassis (closeness order), filtered to vendor catalog GLBs so every plate has
  // a real GLB to render (procedural ids the catalog excludes are dropped). Falls
  // back to the catalog when there's no dossier OR the recommended-scope filter
  // emptied `ranked` — without this, 'recommended' scope with 0 fits → an empty
  // grid ("no silhouettes to choose from").
  const chassisPlateList = useMemo(() => {
    const byName = new Map(chassisCatalog.map(c => [c.name, c]))
    let names = (matchOptions?.chassis?.options || []).map(o => o.partId).filter(n => byName.has(n))
    if (names.length === 0) names = (ranked.length ? ranked : chassisCatalog).map(c => c.name)
    // Dedupe by BASE chassis (strip the trailing _<variant-letter>) so the plates
    // are distinct silhouettes, not N variants of one tree (the 8× alaskan_cedar
    // problem). Keeps the highest-ranked variant of each base.
    const seen = new Set(), deduped = []
    for (const n of names) {
      const base = n.replace(/_[a-z]$/, '')
      if (seen.has(base)) continue
      seen.add(base); deduped.push(n)
    }
    return deduped.slice(0, CHASSIS_PLATE_N).map(n => byName.get(n) || { name: n })
  }, [matchOptions, ranked, chassisCatalog])
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
      <CollapsibleSection title="Chassis">
      {/* B2 (2026-06-25): the top-N ranked chassis render as live gray-silhouette
          plates (live-render-top-N, operator-confirmed). Click to pick; the
          per-plate ★ badge is the green-light Approve gate (approved → Grove).
          (Add +) + "Browse all" (the full library via the legacy dropdown) hang
          off the bottom. Replaces the matcher-text + dropdown + CURATE card.
          SALON-INTERFACE.md §5. */}
      <CollapsibleSection title="Chassis library" emphasis>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6, padding: '2px 0 6px' }}>
        {chassisPlateList.map(c => {
          const k = curationKey(c)
          return (
            <ChassisPlate key={c.name} name={c.name}
              label={chassisCuration[k]?.displayName || c.displayName || c.name}
              selected={c.name === chassis}
              approved={chassisCuration[k]?.approved ?? null}
              onPick={(name) => onParams({ chassis: name })}
              onApprove={(name) => {
                const cur = chassisCuration[`${name}.glb`]?.approved ?? null
                onChassisCuration(`${name}.glb`, { approved: cur === true ? null : true })
              }} />
          )
        })}
        <button type="button" onClick={() => salonAddStub('chassis')}
          title="Add a new chassis (procure / author) — behavior TBD"
          style={{
            cursor: 'pointer', padding: 3, borderRadius: 5,
            background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.22)',
            display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch',
          }}>
          <div style={{ width: '100%', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 22, color: '#7a8aa0', lineHeight: 1 }}>+</span>
          </div>
          <span style={{ fontSize: 9, color: '#99a', textAlign: 'center' }}>Add</span>
        </button>
      </div>
      </CollapsibleSection>
      {/* Browse-all / Approved-only / Pick-dropdown cluster removed 2026-06-25 —
          the deduped matcher plates above ARE the workable options. A proper
          full-library browser (lazy / baked thumbnails) is a future feature. */}
      {/* Height row + CURATE card removed 2026-06-25 — height is now BOTANICAL
          (the tree renders scaled to its species' mature height; shown in the
          species description at top). Approve is the per-plate ★ badge; chassis
          rename/notes retired. */}
      {/* Orientation fixers (tilt + Y-up flip) demoted to an advanced drawer
          2026-06-25 — Brief 20 recentering handles position; these only fix the
          rare mis-ORIENTED vendor chassis, so they collapse by default. */}
      <button onClick={() => setOrientOpen(o => !o)}
        style={{ ...btnStyle({ block: true }), width: '100%', margin: '2px 0', textAlign: 'left', fontSize: 10, color: '#8a93a0' }}>
        {orientOpen ? '▾' : '▸'} Fix orientation (advanced)
      </button>
      {orientOpen && (
        <>
          <Row label="Ground">
            <input type="range" min={-4} max={4} step={0.05}
              value={groundY ?? 0}
              onChange={(e) => onGroundYChange(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: '#e8b860' }}
              title="Raise / drop the tree so it sits flat (use the Worm view). For models with underground roots or an off-base trunk that auto-centering can't ground." />
            <span style={{ width: 32, textAlign: 'right', fontSize: 10, color: '#aaa', fontVariantNumeric: 'tabular-nums' }}>
              {(groundY ?? 0).toFixed(2)}
            </span>
          </Row>
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
                const cur = tiltX
                onTiltXChange(Math.abs(cur + Math.PI / 2) < 0.01 ? 0 : -Math.PI / 2)
              }}
              style={{ ...btnStyle({ block: true }), fontSize: 11 }}>
              {Math.abs(tiltX + Math.PI / 2) < 0.01 ? 'Z-up applied — clear' : 'Y-up trunk (90° X)'}
            </button>
          </Row>
        </>
      )}

      </CollapsibleSection>
      <CollapsibleSection title="Bark" open={barkOpen} onToggle={onBarkOpenChange}>
      <CollapsibleSection title="Bark library" defaultOpen={false} emphasis>
        <PlatePicker
          items={barkRefs.map(ref => ({ id: ref, label: ref }))}
          current={bark?.ref}
          onPick={(id) => onParams({ bark: { ref: id } })}
          onAdd={() => salonAddStub('bark')}
          thumb={(id) => `/textures/bark/${id}/color.jpg`}
          fit="cover" />
      </CollapsibleSection>
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

      </CollapsibleSection>
      <CollapsibleSection title="Leaves">
      <Row label="Leaf source">
        <select
          value={leaves?.mode ?? 'authored'}
          onChange={(e) => onParams({ leaves: { mode: e.target.value } })}
          style={selectStyle}>
          <option value="bare">Bare (no leaves)</option>
          <option value="authored">Native (the model's own leaves)</option>
          <option value="synthesized">Synthetic (kit spray)</option>
        </select>
      </Row>
      {leaves?.mode !== 'bare' && (
        <CollapsibleSection title="Leaf library" defaultOpen={false} emphasis>
          <PlatePicker
            items={leafPacks.map(p => ({ id: p.packId, label: p.packId, missing: p.kind === 'flat' }))}
            current={leaves?.pack}
            onPick={(id) => onParams({ leaves: { pack: id } })}
            onAdd={() => salonAddStub('leaf')}
            thumb={(id) => `/textures/leaves/shapes/${id}/shape.png`}
            fit="contain" />
        </CollapsibleSection>
      )}
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
      </CollapsibleSection>
    </div>
  )
}

// A1 (2026-06-25): DeformerPanel RETIRED. Per-instance lean/twist/wander is now
// MORPHOLOGY-DERIVED automatically — arborist/generate-salon.js#DEFORMER_BY_MORPHOLOGY,
// injected at resolveEffective, surfaced via deformerBySpecies → applyDeformerUniforms.
// The runtime engine (treeAtlasMaterial.js) + the preview rendering are UNCHANGED;
// only the per-species authoring surface is gone. Tune magnitudes in the table,
// not here. See SALON-INTERFACE.md §3-B/§4 + arborist/ARCHITECTURE.md (deformer).

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

// Collapsible section (2026-06-25) — the controls rail had too much at once;
// each part section (Chassis / Bark / Leaves) collapses under a clickable header.
function CollapsibleSection({ title, open: openProp, defaultOpen = true, onToggle, emphasis = false, children }) {
  const [openLocal, setOpenLocal] = useState(defaultOpen)
  const open = openProp !== undefined ? openProp : openLocal
  const toggle = () => { if (onToggle) onToggle(!open); else setOpenLocal(o => !o) }
  return (
    <>
      <button type="button" onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          cursor: 'pointer', letterSpacing: '0.12em', textTransform: 'uppercase',
          // `emphasis` calls out the part-LIBRARY headers (Chassis/Bark/Leaf) as
          // distinct chips so they don't blend into the settings rows (2026-07-08).
          background: emphasis ? 'rgba(255,255,255,0.055)' : 'none',
          border: emphasis ? '1px solid rgba(255,255,255,0.12)' : 'none',
          borderRadius: emphasis ? 4 : 0,
          padding: emphasis ? '6px 8px' : '8px 0 2px',
          marginTop: emphasis ? 6 : 2,
          color: emphasis ? '#d6dde4' : '#9aa3ad',
          fontSize: emphasis ? 10.5 : 10,
          fontWeight: emphasis ? 600 : 400,
        }}>
        <span style={{ fontSize: 9, color: emphasis ? '#9aa3ad' : '#778' }}>{open ? '▾' : '▸'}</span>{title}
      </button>
      {open && children}
    </>
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
  const rows = species.filter(s => !q || s.species.toLowerCase().includes(q.toLowerCase()))
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
                <div style={{ fontSize: 10, color: '#7d848d' }}>{s.count} placements</div>
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
        {row.count} placements
      </span>
    </div>
  )
}
