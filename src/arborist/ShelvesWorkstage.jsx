/**
 * ShelvesWorkstage — THE silhouette-classification gauntlet + the browse-all
 * library, one surface.
 *
 * The unlock for the Species Builder (HANDOFF-chassis-tagging-gauntlet.md). Two
 * things were both false: you couldn't SEE all 241 chassis anywhere, and 0/241
 * were sorted into a silhouette group. This surface fixes both — a grid of every
 * chassis, grouped into the 9 SILHOUETTE SHELVES, each plate assigned its crown
 * form (1-of-9), persisted to _chassis-curation.json.
 *
 * A chassis is pure woody STRUCTURE, so its one meaningful classification is its
 * silhouette. Leaf-shape and bark-type are separate part libraries, not chassis
 * attributes — not tagged here.
 *
 * THE JUNK PROBLEM (operator, 2026-07-10): the library is full of non-real assets
 * — procedural fakes, bark-only extractions, merged-mesh forests, low-poly and
 * burnt art junk. They're "tags" that should let a chassis be left OUT of the
 * sorts. So each chassis carries AUTO-FLAGS (procedural / bark / low-poly /
 * forest / burnt, derived from its name + isForest), hidden by default behind a
 * filter bar; and a manual SET-ASIDE (persisted, reversible) drops real-named
 * stragglers out of the classification shelves. What's left is the working set
 * worth classifying.
 *
 * Doctrine (settled): CATEGORIZE, DON'T RECOMMEND — no matcher, no ranking. The
 * silhouette is a FACT assigned once. The set is closed + complete (9 crown
 * forms, rubric.json chassis.habit). The classification key defines each form so
 * the sort is reproducible.
 *
 * Perf: 241 plates can't each hold a live WebGL Canvas (~16-context cap), so each
 * silhouette bakes ONCE to a PNG via the shared offscreen renderer
 * (chassisThumbnails.js), lazily on scroll-into-view.
 */
import { useEffect, useMemo, useState } from 'react'
import useArboristStore from './stores/useArboristStore.js'
import { FORMS, FORM_IDS, FORM_BY_ID, FormIcon, LazyChassisThumb } from './chassisForms.jsx'

// Auto-flags — non-real asset classes derived from the chassis name + isForest.
// A chassis carrying any of these is hidden from the working set by default (the
// filter bar reveals a class on demand). These are the "left out of sorts" tags.
const STUB_WOOD_FLOOR = 0.65   // wood spans < 65% of tree height → leaves-first stub proxy
const FLAGS = [
  { id: 'procedural', label: 'Procedural', test: (c) => /procedural/i.test(c.name) },
  { id: 'bark',       label: 'Bark-only',  test: (c) => /bark/i.test(c.name) },
  { id: 'lowpoly',    label: 'Low-poly',   test: (c) => /low[_-]?poly/i.test(c.name) },
  { id: 'forest',     label: 'Forest',     test: (c) => c.isForest || /forest/i.test(c.name) },
  { id: 'burnt',      label: 'Burnt/dead', test: (c) => /burnt|snag/i.test(c.name) },
  // Measured, not name-based: wood-height coverage from meta.woodCoverage. Catches
  // the "loose branches" — vendor variants whose wood is a stub under a leaf blob
  // (black_gum f/g/h/i). Thin conifers pass (their spire reaches the crown ~0.95).
  { id: 'stubwood',   label: 'Stub-wood',  test: (c) => c.woodCoverage != null && c.woodCoverage < STUB_WOOD_FLOOR },
]
function flagsFor(c) { return FLAGS.filter(f => f.test(c)).map(f => f.id) }

// A one-click suggestion for the silhouette, seeded from the coarse `morphology`
// the chassis meta already carries — a CONFIRM, not a blank pick, where it maps.
const MORPH_TO_FORM = { weeping: 'weeping', columnar: 'columnar', conifer: 'pyramidal' }
function suggestForm(morphology) { return MORPH_TO_FORM[morphology] || null }

const curationKey = (c) => `${c.name}.glb`

export default function ShelvesWorkstage() {
  const setShelvesOpen = useArboristStore(s => s.setShelvesOpen)
  const setGroveOpen   = useArboristStore(s => s.setGroveOpen)
  const catalog        = useArboristStore(s => s.salonChassisCatalogAll)
  const curation       = useArboristStore(s => s.salonChassisCuration)
  const loadCatalog    = useArboristStore(s => s.loadSalonChassisCatalogAll)
  const loadCuration   = useArboristStore(s => s.loadSalonChassisCuration)
  const setCuration    = useArboristStore(s => s.setSalonChassisCuration)
  const error          = useArboristStore(s => s.salonError)

  useEffect(() => { loadCatalog(); loadCuration() }, [loadCatalog, loadCuration])

  const [q, setQ] = useState('')
  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false)
  const [keyOpen, setKeyOpen] = useState(false)
  const [reveal, setReveal] = useState(() => new Set())   // which flag classes are shown
  const [showSetAside, setShowSetAside] = useState(false)

  const toggleReveal = (id) => setReveal(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  // Sort the catalog into: the 9 silhouette shelves (real, working set) + an
  // Unclassified shelf, a Set-aside bucket, and per-flag counts for the bar.
  const { shelves, setAside, counts, realTotal, classified } = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const byForm = new Map([['_none', []], ...FORM_IDS.map(f => [f, []])])
    const setAside = []
    const counts = Object.fromEntries(FLAGS.map(f => [f.id, 0]))
    let realTotal = 0, classified = 0, setAsideCount = 0
    for (const c of catalog) {
      const cur = curation[curationKey(c)] || {}
      const cflags = flagsFor(c)
      const isSetAside = cur.setAside === true
      cflags.forEach(f => { counts[f]++ })
      if (cflags.length === 0 && !isSetAside) { realTotal++; if (cur.habit) classified++ }
      if (isSetAside) setAsideCount++

      if (ql && !c.name.toLowerCase().includes(ql)) continue
      if (isSetAside) { setAside.push(c); continue }
      // Flag gate: a flagged chassis shows only if at least one of its classes
      // is revealed. Real (unflagged) chassis always show.
      if (cflags.length > 0 && !cflags.some(f => reveal.has(f))) continue
      if (unclassifiedOnly && cur.habit) continue
      const shelf = cur.habit && byForm.has(cur.habit) ? cur.habit : '_none'
      byForm.get(shelf).push(c)
    }
    counts._setAside = setAsideCount
    return { shelves: byForm, setAside, counts, realTotal, classified }
  }, [catalog, curation, q, unclassifiedOnly, reveal])

  const shelfOrder = ['_none', ...FORM_IDS]
  const pct = realTotal ? Math.round((classified / realTotal) * 100) : 0

  return (
    <div style={{
      position: 'fixed', inset: 0, color: '#ddd',
      fontFamily: '-apple-system, sans-serif', fontSize: 13,
      display: 'flex', flexDirection: 'column', background: '#111',
    }}>
      {/* Header */}
      <header style={{
        padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <button onClick={() => setShelvesOpen(false)} style={backBtn}>← Salon</button>
        <strong style={{ letterSpacing: '0.15em', textTransform: 'uppercase', fontSize: 12, color: '#fff' }}>
          Arborist <span style={{ color: '#666', margin: '0 4px' }}>/</span> Shelves
        </strong>
        <span style={{ fontSize: 11, color: '#8a93a0' }}>
          classify every real chassis into its crown-form silhouette
        </span>

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span title={`${classified} of ${realTotal} REAL chassis sorted into a silhouette group (junk excluded)`} style={{
            display: 'inline-flex', alignItems: 'baseline', gap: 6, fontSize: 12,
            padding: '4px 10px', borderRadius: 4, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <b style={{ color: '#bce0a0', fontVariantNumeric: 'tabular-nums' }}>{classified}/{realTotal}</b>
            <span style={{ color: '#889', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 9 }}>classified</span>
            <span style={{ color: '#667', fontSize: 10 }}>{pct}%</span>
          </span>
          <button onClick={() => setGroveOpen(true)} style={groveBtn}>Grove →</button>
        </span>
      </header>

      {/* Controls */}
      <div style={{
        padding: '8px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, flexWrap: 'wrap',
      }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter by name…"
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4, color: '#ddd', padding: '5px 9px', fontSize: 12, minWidth: 180,
          }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#aab' }}>
          <input type="checkbox" checked={unclassifiedOnly} onChange={(e) => setUnclassifiedOnly(e.target.checked)} />
          unclassified only
        </label>
        <button onClick={() => setKeyOpen(o => !o)} style={{
          background: 'none', border: 'none', color: '#9ab', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
        }}>{keyOpen ? '▾' : '▸'} classification key</button>
        {error && <span style={{ color: '#e87878', fontSize: 11 }}>⚠ {error}</span>}
      </div>

      {/* Filter bar — the junk lives here, hidden by default. Reveal a class to
          see/classify it; the count tells you how much is set aside. */}
      <div style={{
        padding: '7px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.012)', display: 'flex', alignItems: 'center',
        gap: 8, fontSize: 11, flexWrap: 'wrap',
      }}>
        <span style={{ color: '#66707a', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 9 }}>show non-real:</span>
        {FLAGS.map(f => (
          <FlagToggle key={f.id} label={f.label} n={counts[f.id]} on={reveal.has(f.id)} onClick={() => toggleReveal(f.id)} />
        ))}
        <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
        <FlagToggle label="Set aside" n={counts._setAside} on={showSetAside} onClick={() => setShowSetAside(v => !v)} accent="#e0a0a0" />
      </div>

      {/* The classification key */}
      {keyOpen && (
        <div style={{
          padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.015)',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '10px 16px',
        }}>
          {FORMS.map(f => (
            <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <FormIcon form={f.id} size={34} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#cdd6df', textTransform: 'capitalize' }}>{f.name}</div>
                <div style={{ fontSize: 10, color: '#8a93a0', lineHeight: 1.35 }}>{f.def}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Shelves */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 18px 60px' }}>
        {catalog.length === 0 && (
          <div style={{ color: '#889', padding: '40px 0', textAlign: 'center' }}>
            Loading the chassis library… (if this stays empty, the backend has no{' '}
            <code>public/trees/_chassis</code> — run <code>node arborist/survey-deleaf.js</code>)
          </div>
        )}
        {shelfOrder.map(f => {
          const items = shelves.get(f) || []
          if (items.length === 0) return null
          return <Shelf key={f} form={f} items={items} curation={curation} setCuration={setCuration} />
        })}
        {showSetAside && setAside.length > 0 && (
          <Shelf form="_setaside" items={setAside} curation={curation} setCuration={setCuration} />
        )}
      </div>
    </div>
  )
}

function FlagToggle({ label, n, on, onClick, accent = '#c0ccf0' }) {
  return (
    <button onClick={onClick} title={`${on ? 'Hide' : 'Show'} ${label.toLowerCase()} (${n})`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
      padding: '2px 8px', borderRadius: 999, fontFamily: 'inherit', fontSize: 10,
      background: on ? 'rgba(120,140,200,0.18)' : 'rgba(255,255,255,0.03)',
      border: '1px solid ' + (on ? accent + '88' : 'rgba(255,255,255,0.1)'),
      color: on ? accent : '#889',
    }}>
      {label} <b style={{ fontVariantNumeric: 'tabular-nums', color: on ? accent : '#667' }}>{n}</b>
    </button>
  )
}

function Shelf({ form, items, curation, setCuration }) {
  const none = form === '_none'
  const aside = form === '_setaside'
  const def = FORM_BY_ID[form]
  const title = aside ? 'Set aside' : none ? 'Unclassified' : def.name
  const color = aside ? '#e0a0a0' : none ? '#e0b070' : '#cdd6df'
  return (
    <section style={{ marginTop: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0,
        background: '#111', zIndex: 1,
      }}>
        {!none && !aside && <FormIcon form={form} size={26} />}
        <h3 style={{ margin: 0, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color, fontWeight: 600 }}>{title}</h3>
        <span style={{ fontSize: 11, color: '#778' }}>{items.length}</span>
        {none && <span style={{ fontSize: 10, color: '#8a6a3a' }}>← assign a silhouette to shelve these</span>}
        {aside && <span style={{ fontSize: 10, color: '#8a5a5a' }}>excluded from the sorts — restore any to bring it back</span>}
        {!none && !aside && <span style={{ fontSize: 10, color: '#66707a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.def}</span>}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 10, padding: '10px 0',
      }}>
        {items.map(c => (
          <ShelfPlate key={c.name} chassis={c}
            entry={curation[curationKey(c)] || null}
            onSet={(habit) => setCuration(curationKey(c), { habit })}
            onSetAside={(v) => setCuration(curationKey(c), { setAside: v })} />
        ))}
      </div>
    </section>
  )
}

// A lazy silhouette with the gauntlet's flag badges overlaid.
function LazySilhouette({ name, flags }) {
  return (
    <LazyChassisThumb name={name} overlay={flags.length > 0 ? (
      <span style={{ position: 'absolute', top: 3, left: 3, display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: '90%' }}>
        {flags.map(f => (
          <span key={f} style={{
            fontSize: 8, letterSpacing: '0.03em', padding: '1px 4px', borderRadius: 3,
            background: 'rgba(200,140,60,0.22)', border: '1px solid rgba(200,140,60,0.45)',
            color: '#e0b070', textTransform: 'uppercase',
          }}>{f}</span>
        ))}
      </span>
    ) : null} />
  )
}

function ShelfPlate({ chassis, entry, onSet, onSetAside }) {
  const form = entry?.habit || ''
  const isSetAside = entry?.setAside === true
  const flags = flagsFor(chassis)
  const suggested = !form ? suggestForm(chassis.morphology) : null
  const height = chassis.heightRange ? ` · ${chassis.heightRange[1].toFixed(0)}m` : ''
  return (
    <div style={{
      borderRadius: 6, padding: 6, display: 'flex', flexDirection: 'column', gap: 5, position: 'relative',
      background: isSetAside ? 'rgba(200,120,120,0.05)' : form ? 'rgba(120,160,110,0.07)' : 'rgba(255,255,255,0.025)',
      border: '1px solid ' + (isSetAside ? 'rgba(200,120,120,0.25)' : form ? 'rgba(120,160,110,0.28)' : 'rgba(255,255,255,0.08)'),
      opacity: isSetAside ? 0.6 : 1,
    }}>
      <LazySilhouette name={chassis.name} flags={flags} />
      <span title={chassis.name} style={{
        fontSize: 9, color: '#99a', textAlign: 'center', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{chassis.name}<span style={{ color: '#667' }}>{height}</span></span>

      {isSetAside ? (
        <button onClick={() => onSetAside(false)} style={restoreBtn}>↩ restore</button>
      ) : (
        <>
          {/* The single classification control — assign 1 of the 9 crown forms. */}
          <select value={form} onChange={(e) => onSet(e.target.value || null)}
            style={{
              width: '100%', background: form ? 'rgba(120,160,110,0.14)' : 'rgba(255,255,255,0.05)',
              border: '1px solid ' + (form ? 'rgba(120,160,110,0.45)' : 'rgba(255,255,255,0.14)'),
              borderRadius: 4, color: form ? '#dbe6cf' : '#9aa', padding: '4px 5px', fontSize: 11,
              fontFamily: 'inherit', cursor: 'pointer', textTransform: 'capitalize',
            }}>
            <option value="">— silhouette —</option>
            {FORMS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {suggested && (
              <button onClick={() => onSet(suggested)} style={suggestBtn}
                title={`Its meta reads "${chassis.morphology}" → suggest ${suggested}`}>
                ↩ {FORM_BY_ID[suggested].name}?
              </button>
            )}
            <button onClick={() => onSetAside(true)} style={{ ...asideBtn, marginLeft: 'auto' }}
              title="Set aside — exclude this chassis from the sorts (reversible)">⊘ set aside</button>
          </div>
        </>
      )}
    </div>
  )
}

const backBtn = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
  color: '#ccd', padding: '5px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 12,
  letterSpacing: '0.04em', cursor: 'pointer',
}
const groveBtn = {
  background: 'rgba(106,154,74,0.15)', border: '1px solid rgba(106,154,74,0.4)',
  color: '#bce0a0', padding: '5px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 12,
  letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
}
const suggestBtn = {
  background: 'rgba(200,160,60,0.14)', border: '1px solid rgba(200,160,60,0.4)',
  color: '#e0c890', padding: '2px 5px', borderRadius: 3, fontFamily: 'inherit', fontSize: 9, cursor: 'pointer',
}
const asideBtn = {
  background: 'none', border: '1px solid rgba(200,120,120,0.25)', color: '#b88',
  padding: '2px 5px', borderRadius: 3, fontFamily: 'inherit', fontSize: 9, cursor: 'pointer',
}
const restoreBtn = {
  background: 'rgba(120,140,200,0.14)', border: '1px solid rgba(120,140,200,0.4)',
  color: '#c0ccf0', padding: '4px 5px', borderRadius: 4, fontFamily: 'inherit', fontSize: 10, cursor: 'pointer',
}
