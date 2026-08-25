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
import { useCanaryTree } from '../lib/canaryTree.js'
import { FORM_IDS, FORM_BY_ID, FormIcon, LazyChassisThumb } from './chassisForms.jsx'

// Fallback for a species' declared habit when it has no dossier: the coarse
// morphology maps cleanly only for these; everything else lands on Unclassified /
// browses all shelves. (The real declared habit is the dossier's chassis.habit.)
const MORPH_TO_HABIT_FALLBACK = { weeping: 'weeping', columnar: 'columnar', conifer: 'pyramidal' }

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

// §9 — the dossier's reference plates beside the live tree ("so we know what
// we're going for"). The cloud-Tuner's ground truth as a UI element, not an
// agent. Reads the active species' dossier; null (hidden) when there is none.
// referenceImages are external source URLs (Wikimedia / MoBot / arboretum) —
// the captions are the ground truth; clicking opens the plate. (In-repo
// thumbnails are the Stage-1 ingest download step; manifests carry the URLs.)
// One plate. Three kinds, and the difference matters:
//   citationOnly — a non-Commons source (MoBot, Chicago Botanic). ⛔ Licence forbids us
//                  embedding their photographs, so this renders as a credited LINK and
//                  never as an <img>.
//   confirmed    — a human chose this exact photo and wrote its caption.
//   proposed     — machine-picked from a category. Badged, because an unreviewed plate
//                  presented as ground truth is worse than no plate.
//
// ⛔⛔ 2026-08-24: this used to be `onError={hide the element}`. Every URL in the repo was
// a wiki PAGE serving text/html, so ALL 28 plates failed and vanished, and the pane read
// as "no references for this species" instead of "these URLs are wrong." The panel whose
// entire job is ground truth was silently showing nothing. A broken plate is now LOUD.
function ReferencePlate({ p }) {
  const [failed, setFailed] = useState(false)
  const label = (
    <span style={{ fontSize: 9, color: '#8a93a0' }}>
      <b style={{ textTransform: 'uppercase', color: '#c8a83a' }}>{p.state}</b>{' '}
      {p.confirmed === false && (
        <b style={{ color: '#d08a3a' }} title="machine-picked from a category — not yet reviewed">UNREVIEWED </b>
      )}
      {p.caption}
      {p.credit && <i style={{ color: '#67707c' }}> · {p.credit}</i>}
    </span>
  )

  if (p.citationOnly || !p.url) {
    return (
      <a href={p.sourceUrl} target="_blank" rel="noreferrer"
        style={{ display: 'block', textDecoration: 'none', padding: '3px 0' }}
        title={p.reason || 'cited source'}>
        <span style={{ fontSize: 9, color: '#8a93a0' }}>🔗 </span>{label}
      </a>
    )
  }

  return (
    <a href={p.sourceUrl || p.url} target="_blank" rel="noreferrer"
      style={{ display: 'block', textDecoration: 'none' }}
      title={`${p.state} — ${p.caption}\n${p.credit || ''}`}>
      {failed ? (
        <div style={{
          padding: '6px 8px', borderRadius: 4, fontSize: 10, lineHeight: 1.35,
          background: 'rgba(200,60,60,0.10)', border: '1px solid rgba(200,60,60,0.35)', color: '#e0a0a0',
        }}>
          ⛔ plate failed to load — the stored URL is not an image. Re-run{' '}
          <code>node arborist/fetch-reference-images.mjs</code>
        </div>
      ) : (
        <img src={p.url} alt={p.caption} loading="lazy"
          style={{ width: '100%', borderRadius: 4, display: 'block', border: '1px solid rgba(255,255,255,0.08)' }}
          onError={() => setFailed(true)} />
      )}
      {label}
    </a>
  )
}

// ⭐⭐ THE DISAGREEMENT, PUBLISHED — and the control that ends it.
//
// Jacob, 2026-08-25: "if there's disagreement perhaps we publish the disagreement and the
// operator settles." Botanical sources disagree constantly (NCSU's Habit/Form is
// multi-select and returns five habits for one tree), and every automatic rule lies in a
// different way: most-frequent invents a consensus, source-priority asserts an authority
// we never established, and writing nothing leaves a cell that looks exactly like one
// nobody has scraped yet. So hydrate writes every candidate WITH its sources and marks
// the cell `contested`; this is where a human ends it.
//
// ⛔ Settling is AUTHORING. The pick drops `sourced`, so hydrate will never re-derive that
// cell again, and what was overruled is kept in `settledOver`.
function ContestedAxes({ dossier, speciesId }) {
  const [busy, setBusy] = useState(null)
  const [done, setDone] = useState({})
  const rows = Object.entries(dossier.required || {}).filter(([, c]) => c && c.contested)
  if (!rows.length) return null

  const settle = async (axis, value) => {
    setBusy(axis)
    try {
      const r = await fetch(`/api/arborist/salon/${encodeURIComponent(speciesId)}/settle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ axis, value }),
      })
      const j = await r.json()
      setDone(p => ({ ...p, [axis]: j.ok ? (value === null ? 'none of these' : String(value)) : `⛔ ${j.error}` }))
    } catch (e) {
      setDone(p => ({ ...p, [axis]: `⛔ ${e.message}` }))
    } finally { setBusy(null) }
  }

  return (
    <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#d08a3a', marginBottom: 5 }}>
        ⚖️ {rows.length} axis/axes where the sources disagree — your call
      </div>
      {rows.map(([axis, c]) => (
        <div key={axis} style={{ marginBottom: 7 }}>
          <div style={{ fontSize: 10, color: '#cdd6df' }}>
            <b>{axis}</b>
            {c.target == null
              ? <span style={{ color: '#d08a3a' }}> · tied, no value chosen</span>
              : <span style={{ color: '#8a93a0' }}> · showing {String(c.target)}</span>}
          </div>
          {(() => {
            // ⭐ Sources often are not disagreeing — they are answering different questions.
            // USDA's `Height, Mature` is the maximum a species reaches in the wild; NCSU and
            // SelecTree publish typical landscape size. Say so where the fields differ, so the
            // operator is choosing between QUESTIONS rather than between numbers.
            const fields = new Set((c.candidates || []).flatMap(x => (x.askedAs || []).map(a => a.split(': ')[1])))
            return fields.size > 1 ? (
              <div style={{ fontSize: 9, color: '#8a93a0', marginTop: 1 }}>
                sources answered different fields: {[...fields].join(' · ')} — hover a value
              </div>
            ) : null
          })()}
          {done[axis] ? (
            <div style={{ fontSize: 10, color: '#7fb069', marginTop: 2 }}>✅ settled: {done[axis]}</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
              {(c.candidates || []).map((cand, i) => (
                <button key={i} disabled={busy === axis} onClick={() => settle(axis, cand.value)}
                  title={(cand.askedAs || []).length
                    ? `asked as —\n${cand.askedAs.join('\n')}`
                    : `claimed by: ${(cand.sources || []).join(', ')}`}
                  style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                    background: String(cand.value) === String(c.target) ? 'rgba(200,168,58,0.18)' : 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.14)', color: '#e6e9ee',
                  }}>
                  {String(cand.value)}
                  <i style={{ color: '#8a93a0', fontStyle: 'normal' }}> · {(cand.sources || []).join('+')}</i>
                </button>
              ))}
              <button disabled={busy === axis} onClick={() => settle(axis, null)}
                title="none of the sources is right — leave it empty for authoring"
                style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                  background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', color: '#8a93a0',
                }}>none of these</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

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
              <ReferencePlate key={i} p={p} />
            ))}
          </div>
          <ContestedAxes dossier={d} speciesId={d.canonicalId} />
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
              position: 'relative', cursor: 'pointer', padding: 3, borderRadius: 5,
              background: sel ? 'rgba(120,160,220,0.18)' : 'rgba(255,255,255,0.03)',
              border: '1px solid ' + (sel ? 'rgba(120,160,220,0.75)' : 'rgba(255,255,255,0.08)'),
              opacity: it.missing ? 0.6 : 1,
              display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch',
            }}>
            {it.badge && (
              <span style={{
                position: 'absolute', top: 4, left: 4, zIndex: 1, fontSize: 8, letterSpacing: '0.04em',
                textTransform: 'uppercase', padding: '1px 4px', borderRadius: 3,
                background: 'rgba(120,160,110,0.3)', border: '1px solid rgba(120,160,110,0.55)', color: '#bce0a0',
              }}>{it.badge}</span>
            )}
            <div style={CELL_IMG}>
              {it.icon ? it.icon
                : it.missing ? (
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
  const groveThreshold      = useArboristStore(s => s.groveThreshold)
  const setGroveTopN        = useArboristStore(s => s.setGroveTopN)
  const toggleGrovePin      = useArboristStore(s => s.toggleGrovePin)
  const setRosterRouting    = useArboristStore(s => s.setRosterRouting)
  // Brief 1.5b (Quill): chassis curation surface.
  const chassisCuration     = useArboristStore(s => s.salonChassisCuration)
  const loadChassisCuration = useArboristStore(s => s.loadSalonChassisCuration)
  const setChassisCuration  = useArboristStore(s => s.setSalonChassisCuration)
  // Brief 8 (Linnet): canary writer + active-canary indicator.
  const setSalonCanary      = useArboristStore(s => s.setSalonCanary)
  const canaryPref          = useCanaryTree()

  // Mount-time fetch: when Salon was restored open via localStorage, setSalonOpen
  // never fires this session, so the store's load actions wouldn't otherwise run.
  // Re-fetch on every mount; cheap (small JSON) and idempotent.
  useEffect(() => {
    loadSalonSpecies()
    loadSalonLibraries()
    loadChassisCuration()
  }, [loadSalonSpecies, loadSalonLibraries, loadChassisCuration])

  // Roster is scoped to the active neighbourhood (Look) — reload it on mount AND
  // whenever the operator switches Looks, so the roster always lists the selected
  // neighbourhood's species, not a stale one. (activeLookId is set by mount.)
  useEffect(() => {
    loadRosterCoverage()
  }, [activeLookId, loadRosterCoverage])

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
            Specimens →
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
          groveThreshold={groveThreshold}
          onSetTopN={setGroveTopN}
          onTogglePin={toggleGrovePin}
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

  // Persist the authored transform to composition.transform (→ setSlotParams →
  // autosaved to compositions.json; marks the slot dirty). Fires on every Tilt /
  // Ground change to match the existing param-edit pattern (immediate store
  // write). transform is absent from the preview `paramsKey`, so this does NOT
  // trigger a preview-atlas regen — the gizmo applies it live.
  const persistTransform = (over) => {
    onParams({ transform: {
      posOffset: over.posOffset ?? posOffset,
      rotation: [
        over.tiltX ?? tiltX,
        // rotateY is INSPECTION-ONLY: the amber ring is a preview turntable, not
        // an authored parameter (SALON-INTERFACE §7 "inspection rotation is
        // view-only") — and per-instance rotY randomizes every placement anyway,
        // so a constant authored Y-rotation washes out in mesh AND impostor. Always
        // persist 0 so an inspection spin can never contaminate shipped geometry.
        0,
        over.tiltZ ?? tiltZ,
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


// ── Phase 4: the silhouette-shelf chassis picker ────────────────────────
// Categorize, don't recommend. Land on the species' declared-habit shelf; the
// other shelves collapse below, browsable. Plates render via the shared lazy
// thumbnailer, so a full shelf costs one WebGL context, not one-per-plate.

function ChassisShelfPicker({ shelves, declaredHabit, selected, chassisCuration, onPick, onApprove, onAdd }) {
  const hasDeclared = declaredHabit && FORM_IDS.includes(declaredHabit)
  const declaredItems = hasDeclared ? (shelves.get(declaredHabit) || []) : []
  // "Other" = every chassis NOT on the declared shelf, flat (the other 8 habits
  // are visual buzz for this species — one browse group, not nine chips).
  const otherItems = []
  for (const f of [...FORM_IDS, '_none']) {
    if (f === declaredHabit) continue
    otherItems.push(...(shelves.get(f) || []))
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 0 6px' }}>
      {hasDeclared && (
        <ChassisShelf label={FORM_BY_ID[declaredHabit].name} form={declaredHabit} isDeclared
          items={declaredItems} defaultOpen selected={selected} chassisCuration={chassisCuration}
          onPick={onPick} onApprove={onApprove} />
      )}
      <ChassisShelf label={hasDeclared ? 'Other' : 'All chassis'} form={null}
        items={otherItems} defaultOpen={!hasDeclared} selected={selected} chassisCuration={chassisCuration}
        onPick={onPick} onApprove={onApprove} />
      <button type="button" onClick={onAdd} title="Add a new chassis (procure / author) — behavior TBD"
        style={{ ...btnStyle({ block: true }), width: '100%', marginTop: 2, fontSize: 11, color: '#8a93a0' }}>+ Add chassis</button>
    </div>
  )
}

function ChassisShelf({ label, form, items, isDeclared, defaultOpen, selected, chassisCuration, onPick, onApprove }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      border: '1px solid ' + (isDeclared ? 'rgba(120,160,110,0.4)' : 'rgba(255,255,255,0.08)'),
      borderRadius: 5, background: isDeclared ? 'rgba(120,160,110,0.06)' : 'transparent',
    }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '5px 8px',
        background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
      }}>
        {form && <FormIcon form={form} size={18} />}
        <span style={{ fontWeight: isDeclared ? 600 : 500, textTransform: 'capitalize',
          color: isDeclared ? '#bce0a0' : '#cdd6df' }}>{label}</span>
        {isDeclared && <span style={{ fontSize: 8, color: '#8fb87f', textTransform: 'uppercase', letterSpacing: '0.06em' }}>this species</span>}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#778' }}>{items.length}</span>
        <span style={{ color: '#667', fontSize: 10 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (items.length === 0
        ? <div style={{ fontSize: 10, color: '#889', padding: '0 8px 8px', lineHeight: 1.4 }}>
            No chassis tagged <b style={{ color: '#9ab' }}>{(label || '').toLowerCase()}</b> yet — classify some in <b style={{ color: '#9ab' }}>Specimens</b>, or open <b style={{ color: '#9ab' }}>Other</b>.
          </div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6, padding: '2px 6px 8px' }}>
            {items.map(c => (
              <SalonShelfPlate key={c.name} chassis={c} cur={chassisCuration[`${c.name}.glb`] || null}
                selected={c.name === selected} onPick={onPick} onApprove={onApprove} />
            ))}
          </div>
      )}
    </div>
  )
}

function SalonShelfPlate({ chassis, cur, selected, onPick, onApprove }) {
  const approved = cur?.approved === true
  const label = cur?.displayName || chassis.name
  return (
    <div onClick={() => onPick(chassis.name)} title={label} style={{
      position: 'relative', borderRadius: 5, padding: 3, cursor: 'pointer',
      background: selected ? 'rgba(120,160,220,0.18)' : 'rgba(255,255,255,0.03)',
      border: '1px solid ' + (selected ? 'rgba(120,160,220,0.75)' : 'rgba(255,255,255,0.08)'),
    }}>
      <LazyChassisThumb name={chassis.name} overlay={
        <button type="button" onClick={(e) => { e.stopPropagation(); onApprove(chassis.name) }}
          title={approved ? 'Approved — ships to the Grove (click to unset)' : 'Approve this chassis'}
          style={{
            position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: 4, padding: 0,
            cursor: 'pointer', fontSize: 10, lineHeight: 1,
            border: '1px solid ' + (approved ? 'rgba(80,200,140,0.7)' : 'rgba(255,255,255,0.2)'),
            background: approved ? 'rgba(80,200,140,0.28)' : 'rgba(0,0,0,0.45)',
            color: approved ? '#9ed8b0' : '#999',
          }}>{approved ? '★' : '·'}</button>
      } />
      <span style={{
        fontSize: 9, color: selected ? '#cdd6df' : '#99a', textAlign: 'center', display: 'block', marginTop: 2,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</span>
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
  // Phase 4 — CATEGORIZE, DON'T RECOMMEND. The chassis picker is the silhouette
  // SHELVES (from the gauntlet's curation tags), landing on the species' declared
  // habit. No matcher, no ranking, no base-dedup — you land on the right shelf and
  // browse the rest freely. (Supersedes the B2 matcher-ranked plate list.)
  const dossier = useArboristStore(s => s.salonDossier)
  const declaredHabit = dossier?.required?.['chassis.habit']?.target
    || MORPH_TO_HABIT_FALLBACK[speciesMorphology] || null
  // The species' NATIVE leaf — its declared leaf shape (rubric leaf.silhouette),
  // which doubles as a pack id (palmate/ovate/…). Tagged + first in the leaf
  // picker as the revert anchor. Null when the species has no dossier leaf.
  const nativePack = dossier?.required?.['leaf.silhouette']?.target || null
  // The species' native leaf ARRANGEMENT (rubric leaf.ways) — tagged in the Ways
  // selector like the native pack, so the operator knows which respray pattern is
  // botanically correct (Sugar Maple = opposite). Null when undossiered.
  const nativeWays = dossier?.required?.['leaf.ways']?.target || null
  const curationKey = (c) => `${c.name}.glb`
  const [orientOpen, setOrientOpen] = useState(false)  // "Fix orientation" advanced drawer (tilt/Y-up), collapsed by default
  // Group the catalog into silhouette shelves by curation habit; set-aside chassis
  // are excluded (the gauntlet's "don't use this" tag). Untagged → "Unclassified".
  const shelves = useMemo(() => {
    const byForm = new Map([...FORM_IDS.map(f => [f, []]), ['_none', []]])
    for (const c of chassisCatalog) {
      const cur = chassisCuration[curationKey(c)] || {}
      if (cur.setAside) continue
      const shelf = cur.habit && byForm.has(cur.habit) ? cur.habit : '_none'
      byForm.get(shelf).push(c)
    }
    return byForm
  }, [chassisCatalog, chassisCuration])
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

  return (
    <div style={{
      padding: '10px 12px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(255,255,255,0.015)',
      display: 'flex', flexDirection: 'column', gap: 8,
      fontSize: 11, color: '#aaa',
    }}>
      <CollapsibleSection title="Chassis" defaultOpen={false} subtitle={chassis || 'none'}>
      {/* Phase 4: the chassis picker is the silhouette SHELVES (categorize, don't
          recommend). You land on this species' declared-habit shelf; the other
          shelves are browsable below. Chassis are tagged in the Shelves gauntlet;
          set-aside ones don't appear here. */}
      <ChassisShelfPicker
        shelves={shelves} declaredHabit={declaredHabit}
        selected={chassis} chassisCuration={chassisCuration}
        onPick={(name) => onParams({ chassis: name })}
        onApprove={(name) => {
          const cur = chassisCuration[`${name}.glb`]?.approved ?? null
          onChassisCuration(`${name}.glb`, { approved: cur === true ? null : true })
        }}
        onAdd={() => salonAddStub('chassis')} />
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
      <CollapsibleSection title="Bark" subtitle={bark?.ref} open={barkOpen} onToggle={onBarkOpenChange}>
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
      <CollapsibleSection title="Leaves" defaultOpen={false} subtitle={leaves?.pack || (leaves?.mode === 'bare' ? 'bare' : 'native')}>
      {/* One picker for the leaf source (2026-07-11): Bare · ✦Native · the packs.
          The 3-way authored/synthesized dropdown is gone — mode is AUTOMATIC:
          picking a leaf keeps the model's own cards when it has them (reskin) and
          sprays kit cards when it doesn't. The "Respray" toggle below is the
          escape hatch to force fresh cards over bad vendor leaves. Native = the
          species' declared leaf, the revert anchor. */}
      <PlatePicker
        items={[
          { id: '__bare__', label: 'Bare', note: 'No leaves (an authored, leafless state)', icon: <span style={{ fontSize: 20, color: '#8a93a0', lineHeight: 1 }}>∅</span> },
          ...(nativePack && leafPacks.some(p => p.packId === nativePack) ? [{ id: nativePack, label: nativePack, badge: 'native', note: `${nativePack} — this species' own leaf` }] : []),
          ...leafPacks.filter(p => p.packId !== nativePack).map(p => ({ id: p.packId, label: p.packId, missing: p.kind === 'flat' })),
        ]}
        current={leaves?.mode === 'bare' ? '__bare__' : (leaves?.pack || null)}
        onPick={(id) => id === '__bare__'
          ? onParams({ leaves: { mode: 'bare' } })
          : onParams({ leaves: { pack: id, mode: leaves?.mode === 'synthesized' ? 'synthesized' : 'authored' } })}
        onAdd={() => salonAddStub('leaf')}
        thumb={(id) => `/textures/leaves/shapes/${id}/shape.png`}
        fit="contain" />
      {leaves?.mode !== 'bare' && (
        <>
          {/* Ways = arrangement AND geometry source in one control. "As modeled"
              keeps the model's own leaf cards (authored); any real arrangement
              resprays fresh kit cards in that pattern (synthesized). No separate
              mode toggle — picking how the leaves sit IS the choice. */}
          <Row label="Ways">
            <select value={leaves?.mode === 'synthesized' ? (leaves?.ways ?? 'alternate') : '__asmodeled__'}
              onChange={(e) => {
                const v = e.target.value
                if (v === '__asmodeled__') onParams({ leaves: { mode: 'authored' } })
                else onParams({ leaves: { mode: 'synthesized', ways: v } })
              }}
              style={selectStyle}
              title="How the leaves attach + orient. 'As modeled' keeps the model's own placement; the others respray fresh kit cards in that arrangement (needed for chassis whose vendor leaves are bad, or which have none). '· native' marks this species' botanically-correct arrangement.">
              <option value="__asmodeled__">As modeled (the model's own)</option>
              {[
                ['alternate', 'Alternate (scatter)'],
                ['opposite', 'Opposite (maple / ash)'],
                ['all-one-direction', 'Drooping (willow)'],
                ['sprays', 'Sprays (compound)'],
                ['clusters', 'Clusters (ginkgo)'],
              ].map(([v, label]) => (
                <option key={v} value={v}>{label}{v === nativeWays ? ' · native' : ''}</option>
              ))}
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
            <input type="color" value={leaves?.tintFront || '#3a7530'}
              onChange={(e) => onParams({ leaves: { tintFront: e.target.value } })} style={colorStyle} />
          </Row>
          <Row label="Tint back">
            <input type="color" value={leaves?.tintBack || '#a8b89a'}
              onChange={(e) => onParams({ leaves: { tintBack: e.target.value } })} style={colorStyle} />
          </Row>
        </>
      )}
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
function CollapsibleSection({ title, subtitle, open: openProp, defaultOpen = true, onToggle, emphasis = false, children }) {
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
        {/* Collapsed-header summary: the sections default closed (the rail was too
            dense), so show the current pick inline when closed — the folded rail
            reads as a summary of the tree at a glance. */}
        {subtitle && !open && (
          <span style={{
            marginLeft: 4, textTransform: 'none', letterSpacing: 0,
            fontWeight: 400, fontSize: 9.5, color: '#6f7883',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
          }}>· {subtitle}</span>
        )}
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
      <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Neighborhood</span>
      <select
        value={activeLookId || ''}
        onChange={onChange}
        title={active ? `Authoring: ${active.name}` : 'Pick a neighborhood to author'}
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
// shows placement count + a readiness LIGHT. Clicking drives salonActiveSpecies
// onto the row's canonical id (a slug — the settled keying spine), where the
// existing composition machinery authors under it.
const STATE_META = {
  composed:        { label: 'composed',      color: '#9ed8b0' },
  'not-available': { label: 'not-available', color: '#c89a3a' },
  unauthored:      { label: 'unauthored',    color: '#777' },
}

// Roster light = AUTHORING readiness first, botanical coverage second. Green
// means "an authored tree actually ships," NOT merely "the library could cover
// this species" — the old dot keyed on botanical `coverage`, so a coverable-
// but-unbuilt species lit green then opened BLANK (Tuliptree: 18 placements,
// green, nothing inside — the bug). Now:
//   🟢 composed      — an authored composition exists → ships
//   🟡 buildable     — unauthored, but the library can cover it → one click to start
//   🔴 gap           — unauthored AND no library coverage → a real hole
//   ➖ not-available — deliberately marked no-tree
const ROSTER_DOT = {
  composed:        { dot: '🟢', title: 'composed — an authored tree ships' },
  buildable:       { dot: '🟡', title: 'unauthored, but the library can cover it — ready to build' },
  gap:             { dot: '🔴', title: 'gap — no library coverage yet' },
  'not-available': { dot: '➖', title: 'marked not-available — routes to no tree' },
}
function rosterDot(s) {
  if (s.authoringState === 'composed') return ROSTER_DOT.composed
  if (s.authoringState === 'not-available') return ROSTER_DOT['not-available']
  return s.coverage === 'gap' ? ROSTER_DOT.gap : ROSTER_DOT.buildable
}

// The roster nav doubles as the Grove build-eligibility lever. Species are
// count-sorted; a draggable BAR sets how many (top-N by appearances) build as
// their own asset — everything below substitutes to a same-category built
// neighbour at runtime (the perf lever). A PIN keeps a species IN below the bar
// (the once-appearing special tree). A tally shows in / substitute counts.
function RosterNavigator({ species, loading, activeRosterName, onSelect, groveThreshold, onSetTopN, onTogglePin }) {
  const [q, setQ] = useState('')
  const filtering = q.trim().length > 0
  const rows = species.filter(s => !filtering || s.species.toLowerCase().includes(q.toLowerCase()))

  const pinned = new Set(groveThreshold?.pinned || [])
  const persistedTopN = groveThreshold?.topN
  const rankOf = useMemo(() => {
    const m = new Map(); species.forEach((s, i) => m.set(s.species, i)); return m
  }, [species])
  const isIn = (s) => pinned.has(s.species) || persistedTopN == null || (rankOf.get(s.species) ?? 0) < persistedTopN
  const inCount = species.reduce((n, s) => n + (isIn(s) ? 1 : 0), 0)
  const outCount = species.length - inCount

  // Drag the bar: live position in dragTopN, persisted on release only (so a
  // drag doesn't spam the store/endpoint). rowH measured off a real row.
  const listRef = useRef(null)
  const rowHRef = useRef(44)
  const [dragTopN, setDragTopN] = useState(null)
  const barDragging = dragTopN != null
  const effTopN = barDragging ? dragTopN : (persistedTopN ?? species.length)

  useEffect(() => {
    if (!barDragging) return
    const idxFrom = (clientY) => {
      const el = listRef.current; if (!el) return effTopN
      const rect = el.getBoundingClientRect()
      const y = clientY - rect.top + el.scrollTop
      return Math.max(0, Math.min(species.length, Math.round(y / (rowHRef.current || 44))))
    }
    const move = (e) => setDragTopN(idxFrom(e.clientY))
    const up = () => setDragTopN(v => { if (v != null) onSetTopN(v); return null })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barDragging, species.length])

  const Bar = (
    <div onPointerDown={(e) => { e.preventDefault(); setDragTopN(effTopN) }}
      title="Drag to set how many species build in the Grove — the rest substitute to a same-category neighbour"
      style={{
        display: 'flex', alignItems: 'center', gap: 6, cursor: 'ns-resize',
        padding: '3px 8px', background: 'rgba(232,184,96,0.16)',
        borderTop: '2px solid #e8b860', borderBottom: '2px solid #e8b860', userSelect: 'none',
      }}>
      <span style={{ fontSize: 9, color: '#e8c878', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        ▲ build {effTopN} · substitute ▼
      </span>
      <span style={{ marginLeft: 'auto', fontSize: 12, color: '#e8b860' }}>⇳</span>
    </div>
  )

  const renderRow = (s) => {
    const active = s.species === activeRosterName
    const d = rosterDot(s)
    const inGrove = isIn(s)
    const isPinned = pinned.has(s.species)
    return (
      <div key={s.species} ref={(el) => { if (el) rowHRef.current = el.offsetHeight }}
        style={{
          display: 'flex', alignItems: 'stretch', opacity: inGrove ? 1 : 0.45,
          background: active ? 'rgba(232,184,96,0.14)' : 'transparent',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
        <button onClick={() => onSelect(s)} title={`canonical: ${s.canonicalId} · coverage: ${s.coverage}`}
          style={{
            flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent',
            cursor: 'pointer', padding: '7px 2px 7px 10px', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
          <span style={{ width: 18, textAlign: 'center' }} title={d.title}>{d.dot}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: active ? '#e8c878' : '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.species}</div>
            <div style={{ fontSize: 10, color: '#7d848d' }}>
              {s.count} placements{!inGrove ? ' · substitutes' : (isPinned ? ' · pinned' : '')}
            </div>
          </span>
        </button>
        <button onClick={() => onTogglePin(s.species)}
          title={isPinned ? 'Pinned into the Grove (kept even below the bar) — click to unpin' : 'Pin into the Grove (keep even if below the bar)'}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 8px', fontSize: 12, opacity: isPinned ? 1 : 0.28 }}>
          📌
        </button>
      </div>
    )
  }

  return (
    <div style={{
      width: 300, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column', minHeight: 0, background: 'rgba(255,255,255,0.015)',
    }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Roster · {species.length} species
        </div>
        {/* Tally: how many species build in the Grove vs substitute. */}
        <div style={{ fontSize: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ color: '#9ed8b0' }} title="Build as their own asset">🌳 {inCount} in Grove</span>
          <span style={{ color: '#7d848d' }} title="Substitute to a same-category built neighbour">↔ {outCount} substitute</span>
          {persistedTopN != null && (
            <button onClick={() => onSetTopN(null)} title="Clear the bar — every species builds"
              style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: '#8a93a0', cursor: 'pointer', fontSize: 10, textDecoration: 'underline', padding: 0 }}>
              clear
            </button>
          )}
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="filter species…" style={{ ...selectStyle, padding: '4px 6px' }} />
      </div>
      <div ref={listRef} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loading && <div style={{ padding: 12, color: '#888', fontSize: 11 }}>Loading roster…</div>}
        {!loading && rows.length === 0 && <div style={{ padding: 12, color: '#888', fontSize: 11 }}>No matching species.</div>}
        {filtering ? (
          rows.map(renderRow)
        ) : (
          <>
            {rows.slice(0, effTopN).map(renderRow)}
            {rows.length > 0 && Bar}
            {rows.slice(effTopN).map(renderRow)}
          </>
        )}
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
      <span style={{ fontSize: 13, color: '#fff' }} title={rosterDot(row).title}>{rosterDot(row).dot} {row.species}</span>
      <span style={{ fontSize: 11, color: '#888' }}>
        {row.count} placements
      </span>
    </div>
  )
}
