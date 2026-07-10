/**
 * ShelvesWorkstage — THE silhouette-classification gauntlet + the browse-all
 * library, one surface.
 *
 * The unlock for the Species Builder (HANDOFF-chassis-tagging-gauntlet.md). Two
 * things were both false: you couldn't SEE all 241 chassis anywhere, and 0/241
 * were sorted into a silhouette group. This surface fixes both at once — a grid
 * of every chassis, grouped into the 9 SILHOUETTE SHELVES, each plate assigned
 * its crown form (1-of-9), persisted to _chassis-curation.json. Untagged chassis
 * land in an "Unclassified" shelf at top; as you classify, the shelves fill.
 *
 * A chassis is pure woody STRUCTURE, so its one meaningful classification is its
 * silhouette. Leaf-shape and bark-type are SEPARATE part libraries, not chassis
 * attributes — deliberately NOT tagged here.
 *
 * Doctrine (settled, do not re-litigate): CATEGORIZE, DON'T RECOMMEND — no
 * matcher, no ranking, no score. The silhouette is a FACT assigned once. The set
 * is closed, finite, complete (9 crown forms, rubric.json chassis.habit). The
 * grouping is meant to be SCIENTIFIC — the classification key below defines each
 * form so the sort is reproducible, not vibes.
 *
 * Perf: 241 plates cannot each hold a live WebGL Canvas (browser ~16-context
 * cap), so each silhouette bakes ONCE to a PNG via the shared offscreen renderer
 * (chassisThumbnails.js), lazily on scroll-into-view.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import useArboristStore from './stores/useArboristStore.js'
import { chassisThumb } from './chassisThumbnails.js'

// The 9 crown-form silhouettes — the closed set (rubric.json chassis.habit),
// each with the botanical definition that makes the sort scientific. `id` is the
// persisted token (matches rubric + the serve.js validator).
const FORMS = [
  { id: 'columnar',   name: 'Columnar',   def: 'Tall and narrow, near-parallel sides — height much greater than width (Lombardy poplar, fastigiate oak).' },
  { id: 'pyramidal',  name: 'Pyramidal',  def: 'Broad base tapering to a single point — conical, one dominant leader (spruce, sweetgum, young pin oak).' },
  { id: 'oval',       name: 'Oval',       def: 'Egg-shaped — rounded top, slightly taller than wide. The default upright street tree (linden, red maple).' },
  { id: 'rounded',    name: 'Rounded',    def: 'Roughly circular crown, height ≈ width — a compact ball of canopy (many maples, callery pear).' },
  { id: 'vase',       name: 'Vase',       def: 'Narrow at the base, branches ascend then arch out wide toward the top (American elm, zelkova).' },
  { id: 'spreading',  name: 'Spreading',  def: 'Wider than tall — a broad, horizontal canopy on a low frame (mature white oak, honey locust).' },
  { id: 'weeping',    name: 'Weeping',    def: 'Branches cascade downward from an arched crown (weeping willow, weeping cherry).' },
  { id: 'multi-stem', name: 'Multi-stem', def: 'Several trunks diverging from the base — no single leader (river birch clump, serviceberry).' },
  { id: 'irregular',  name: 'Irregular',  def: 'Asymmetric, picturesque — no regular geometry (old pine, wind-shaped or open-grown specimen).' },
]
const FORM_IDS = FORMS.map(f => f.id)
const FORM_BY_ID = Object.fromEntries(FORMS.map(f => [f.id, f]))

// A one-click suggestion for the silhouette, seeded from the coarse `morphology`
// the chassis meta already carries — so classifying is a CONFIRM, not a blank
// pick, where morphology maps cleanly. Only the unambiguous maps.
const MORPH_TO_FORM = { weeping: 'weeping', columnar: 'columnar', conifer: 'pyramidal' }
function suggestForm(morphology) { return MORPH_TO_FORM[morphology] || null }

const curationKey = (c) => `${c.name}.glb`

// ── Schematic crown-form icons for the classification key + shelf headers ──
// Simple, consistent silhouettes drawn on a trunk — a visual reference of each
// form, not a render. 40×52 viewBox, trunk baseline at y=50.
function FormIcon({ form, size = 40 }) {
  const s = '#aeb8c2'
  const crown = {
    columnar:   <ellipse cx="20" cy="24" rx="7" ry="22" fill={s} />,
    pyramidal:  <polygon points="20,4 33,46 7,46" fill={s} />,
    oval:       <ellipse cx="20" cy="24" rx="13" ry="20" fill={s} />,
    rounded:    <circle cx="20" cy="24" r="15" fill={s} />,
    vase:       <path d="M20 46 C 8 30 6 6 6 6 C 14 18 26 18 34 6 C 34 6 32 30 20 46 Z" fill={s} />,
    spreading:  <ellipse cx="20" cy="26" rx="18" ry="12" fill={s} />,
    weeping:    <path d="M4 20 C 4 8 36 8 36 20 C 34 22 33 40 31 44 M31 20 C 31 34 29 42 28 46 M20 22 C 20 36 20 44 20 50 M9 20 C 9 34 11 42 12 46 M12 20 C 12 32 10 40 9 44" fill="none" stroke={s} strokeWidth="2" />,
    'multi-stem': <g fill={s}><circle cx="12" cy="20" r="9" /><circle cx="27" cy="17" r="9" /><circle cx="20" cy="27" r="9" /></g>,
    irregular:  <path d="M10 30 C 2 22 8 10 16 12 C 16 4 30 4 30 13 C 40 12 38 26 30 28 C 34 36 22 40 18 34 C 12 40 6 36 10 30 Z" fill={s} />,
  }[form]
  return (
    <svg width={size} height={size * 52 / 40} viewBox="0 0 40 52" style={{ display: 'block', flex: 'none' }}>
      <rect x="18.5" y="42" width="3" height="10" fill="#6b7280" />
      {crown}
    </svg>
  )
}

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
  const [keyOpen, setKeyOpen] = useState(true)

  // Group the catalog into shelves by the committed silhouette (Unclassified
  // first, then the 9 forms in the classification-key order).
  const { shelves, classified } = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const byForm = new Map([['_none', []], ...FORM_IDS.map(f => [f, []])])
    let classified = 0
    for (const c of catalog) {
      const cur = curation[curationKey(c)] || {}
      if (cur.habit) classified++
      if (ql && !c.name.toLowerCase().includes(ql)) continue
      if (unclassifiedOnly && cur.habit) continue
      const shelf = cur.habit && byForm.has(cur.habit) ? cur.habit : '_none'
      byForm.get(shelf).push(c)
    }
    return { shelves: byForm, classified }
  }, [catalog, curation, q, unclassifiedOnly])

  const shelfOrder = ['_none', ...FORM_IDS]
  const total = catalog.length
  const pct = total ? Math.round((classified / total) * 100) : 0

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
          classify every chassis into its crown-form silhouette
        </span>

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span title={`${classified} of ${total} chassis sorted into a silhouette group`} style={{
            display: 'inline-flex', alignItems: 'baseline', gap: 6, fontSize: 12,
            padding: '4px 10px', borderRadius: 4, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <b style={{ color: '#bce0a0', fontVariantNumeric: 'tabular-nums' }}>{classified}/{total}</b>
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
            borderRadius: 4, color: '#ddd', padding: '5px 9px', fontSize: 12, minWidth: 200,
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

      {/* The classification key — the 9 crown forms defined, so the sort is scientific */}
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
      </div>
    </div>
  )
}

function Shelf({ form, items, curation, setCuration }) {
  const none = form === '_none'
  const def = FORM_BY_ID[form]
  return (
    <section style={{ marginTop: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0,
        background: '#111', zIndex: 1,
      }}>
        {!none && <FormIcon form={form} size={26} />}
        <h3 style={{
          margin: 0, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: none ? '#e0b070' : '#cdd6df', fontWeight: 600,
        }}>{none ? 'Unclassified' : def.name}</h3>
        <span style={{ fontSize: 11, color: '#778' }}>{items.length}</span>
        {none
          ? <span style={{ fontSize: 10, color: '#8a6a3a' }}>← assign a silhouette to shelve these</span>
          : <span style={{ fontSize: 10, color: '#66707a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.def}</span>}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 10, padding: '10px 0',
      }}>
        {items.map(c => (
          <ShelfPlate key={c.name} chassis={c}
            entry={curation[curationKey(c)] || null}
            onSet={(habit) => setCuration(curationKey(c), { habit })} />
        ))}
      </div>
    </section>
  )
}

// A lazy silhouette: bakes its PNG (shared renderer) only once scrolled into view.
function LazySilhouette({ name, isForest }) {
  const url = `/trees/_chassis/${name}.glb`
  const ref = useRef(null)
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let done = false
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting) && !done) {
        done = true; io.disconnect()
        chassisThumb(url).then(d => { d ? setSrc(d) : setFailed(true) })
      }
    }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [url])
  return (
    <div ref={ref} style={{
      width: '100%', aspectRatio: '1 / 1', borderRadius: 3, overflow: 'hidden',
      background: 'rgba(255,255,255,0.04)', position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {src ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span style={{ fontSize: 10, color: failed ? '#a55' : '#556' }}>{failed ? 'no render' : '…'}</span>}
      {isForest && (
        <span title="Merged-mesh forest (group shot) — one mesh, many trunks. Classify it, but it's usable only once split (Brief 23a)."
          style={{
            position: 'absolute', top: 3, left: 3, fontSize: 8, letterSpacing: '0.04em',
            padding: '1px 4px', borderRadius: 3, background: 'rgba(200,140,60,0.25)',
            border: '1px solid rgba(200,140,60,0.5)', color: '#e0b070', textTransform: 'uppercase',
          }}>⚠ forest</span>
      )}
    </div>
  )
}

function ShelfPlate({ chassis, entry, onSet }) {
  const form = entry?.habit || ''
  const suggested = !form ? suggestForm(chassis.morphology) : null
  const height = chassis.heightRange ? ` · ${chassis.heightRange[1].toFixed(0)}m` : ''
  return (
    <div style={{
      borderRadius: 6, padding: 6, display: 'flex', flexDirection: 'column', gap: 5,
      background: form ? 'rgba(120,160,110,0.07)' : 'rgba(255,255,255,0.025)',
      border: '1px solid ' + (form ? 'rgba(120,160,110,0.28)' : 'rgba(255,255,255,0.08)'),
    }}>
      <LazySilhouette name={chassis.name} isForest={chassis.isForest} />
      <span title={chassis.name} style={{
        fontSize: 9, color: '#99a', textAlign: 'center', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{chassis.name}<span style={{ color: '#667' }}>{height}</span></span>

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
      {suggested && (
        <button onClick={() => onSet(suggested)} style={suggestBtn}
          title={`Its meta reads "${chassis.morphology}" → suggest ${suggested}`}>
          ↩ {FORM_BY_ID[suggested].name}?
        </button>
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
  color: '#e0c890', padding: '2px 5px', borderRadius: 3, fontFamily: 'inherit', fontSize: 9,
  cursor: 'pointer', alignSelf: 'flex-start',
}
