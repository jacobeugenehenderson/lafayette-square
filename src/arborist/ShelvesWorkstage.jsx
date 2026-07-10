/**
 * ShelvesWorkstage — THE tagging gauntlet + the browse-all library, one surface.
 *
 * The unlock for the Species Builder (HANDOFF-chassis-tagging-gauntlet.md). Two
 * things were both false: you couldn't SEE all 241 chassis anywhere, and 0/241
 * carried a habit tag. This surface fixes both at once — a grid of every chassis,
 * grouped into HABIT SHELVES, each plate assignable to habit (1-of-9) · leaf-shape
 * (1-of-10) · bark-type (1-of-8), persisted to _chassis-curation.json. Untagged
 * chassis land in an "Untagged" shelf at top; as you tag, the habit shelves fill.
 *
 * Doctrine (settled, do not re-litigate): CATEGORIZE, DON'T RECOMMEND — no matcher,
 * no ranking, no score. A tag is a FACT assigned once. The sets are closed, finite,
 * complete. The Species Builder then lands on a species' declared-habit shelf and
 * browses the others freely.
 *
 * Perf: 241 plates cannot each hold a live WebGL Canvas (browser ~16-context cap).
 * Each silhouette is baked ONCE to a PNG via the shared offscreen renderer
 * (chassisThumbnails.js), lazily, when the plate scrolls into view.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import useArboristStore from './stores/useArboristStore.js'
import { chassisThumb } from './chassisThumbnails.js'

// The closed sets — mirror rubric.json (chassis.habit / leaf.silhouette /
// bark.type) + the serve.js validator. Keep all three in lockstep.
const HABITS = ['vase', 'columnar', 'oval', 'spreading', 'weeping', 'multi-stem', 'pyramidal', 'rounded', 'irregular']
const LEAF_SHAPES = ['palmate', 'lobed', 'heart', 'ovate', 'lanceolate', 'compound', 'fan', 'star', 'needle', 'scale']
const BARK_TYPES = ['smooth', 'furrowed', 'plated', 'scaly', 'ridged', 'exfoliating', 'fibrous', 'mottled']

// A one-click suggestion for the habit, seeded from the coarse `morphology` the
// chassis meta already carries — so tagging is a CONFIRM, not a blank pick, where
// morphology maps cleanly. Only the unambiguous maps; broadleaf/ornamental read
// as several habits, so they get no suggestion (the operator's eye decides).
const MORPH_TO_HABIT = {
  weeping: 'weeping',
  columnar: 'columnar',
  conifer: 'pyramidal',   // most conifers read pyramidal (spruce/fir); operator overrides
}
function suggestHabit(morphology) { return MORPH_TO_HABIT[morphology] || null }

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

  // Filters: text search + "untagged only" (the working queue).
  const [q, setQ] = useState('')
  const [untaggedOnly, setUntaggedOnly] = useState(false)

  // Group the catalog into shelves by the COMMITTED habit tag (Untagged first,
  // then the 9 habits in canonical order). A chassis is "tagged" ⇔ it carries a
  // habit — leaf/bark are additional facts that don't gate shelf membership.
  const { shelves, tallies } = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const byHabit = new Map([['_untagged', []], ...HABITS.map(h => [h, []])])
    let habitTagged = 0, leafTagged = 0, barkTagged = 0
    for (const c of catalog) {
      const cur = curation[curationKey(c)] || {}
      if (cur.habit) habitTagged++
      if (cur.leafShape) leafTagged++
      if (cur.barkType) barkTagged++
      if (ql && !c.name.toLowerCase().includes(ql)) continue
      if (untaggedOnly && cur.habit) continue
      const shelf = cur.habit && byHabit.has(cur.habit) ? cur.habit : '_untagged'
      byHabit.get(shelf).push(c)
    }
    return {
      shelves: byHabit,
      tallies: { total: catalog.length, habitTagged, leafTagged, barkTagged },
    }
  }, [catalog, curation, q, untaggedOnly])

  const shelfOrder = ['_untagged', ...HABITS]

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
          the tagging gauntlet — assign every chassis a habit · leaf · bark
        </span>

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Progress: the whole point — watch it climb toward 241/241. */}
          <ProgressChip label="habit" n={tallies.habitTagged} total={tallies.total} accent="#bce0a0" />
          <ProgressChip label="leaf"  n={tallies.leafTagged}  total={tallies.total} accent="#a0c8e0" />
          <ProgressChip label="bark"  n={tallies.barkTagged}  total={tallies.total} accent="#e0c8a0" />
          <button onClick={() => setGroveOpen(true)} style={groveBtn}>Grove →</button>
        </span>
      </header>

      {/* Controls */}
      <div style={{
        padding: '8px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 12, fontSize: 12,
      }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter by name…"
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4, color: '#ddd', padding: '5px 9px', fontSize: 12, minWidth: 200,
          }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#aab' }}>
          <input type="checkbox" checked={untaggedOnly} onChange={(e) => setUntaggedOnly(e.target.checked)} />
          untagged only
        </label>
        {error && <span style={{ color: '#e87878', fontSize: 11 }}>⚠ {error}</span>}
      </div>

      {/* Shelves */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 18px 60px' }}>
        {catalog.length === 0 && (
          <div style={{ color: '#889', padding: '40px 0', textAlign: 'center' }}>
            Loading the chassis library… (if this stays empty, the backend has no{' '}
            <code>public/trees/_chassis</code> — run <code>node arborist/survey-deleaf.js</code>)
          </div>
        )}
        {shelfOrder.map(h => {
          const items = shelves.get(h) || []
          if (items.length === 0) return null
          return <Shelf key={h} habit={h} items={items} curation={curation} setCuration={setCuration} />
        })}
      </div>
    </div>
  )
}

function ProgressChip({ label, n, total, accent }) {
  const pct = total ? Math.round((n / total) * 100) : 0
  return (
    <span title={`${n} of ${total} chassis tagged with a ${label}`} style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 5, fontSize: 11,
      padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <b style={{ color: accent, fontVariantNumeric: 'tabular-nums' }}>{n}/{total}</b>
      <span style={{ color: '#889', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 9 }}>{label}</span>
      <span style={{ color: '#667', fontSize: 9 }}>{pct}%</span>
    </span>
  )
}

function Shelf({ habit, items, curation, setCuration }) {
  const isUntagged = habit === '_untagged'
  const title = isUntagged ? 'Untagged' : habit
  return (
    <section style={{ marginTop: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10, padding: '4px 2px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0,
        background: '#111', zIndex: 1,
      }}>
        <h3 style={{
          margin: 0, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: isUntagged ? '#e0b070' : '#cdd6df', fontWeight: 600,
        }}>{title}</h3>
        <span style={{ fontSize: 11, color: '#778' }}>{items.length}</span>
        {isUntagged && <span style={{ fontSize: 10, color: '#8a6a3a' }}>← assign a habit to shelve these</span>}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
        gap: 10, padding: '10px 0',
      }}>
        {items.map(c => (
          <ShelfPlate key={c.name} chassis={c}
            entry={curation[curationKey(c)] || null}
            onTag={(patch) => setCuration(curationKey(c), patch)} />
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
        <span title="Merged-mesh forest (group shot) — one mesh, many trunks. Tag it, but it's usable only once split (Brief 23a)."
          style={{
            position: 'absolute', top: 3, left: 3, fontSize: 8, letterSpacing: '0.04em',
            padding: '1px 4px', borderRadius: 3, background: 'rgba(200,140,60,0.25)',
            border: '1px solid rgba(200,140,60,0.5)', color: '#e0b070', textTransform: 'uppercase',
          }}>⚠ forest</span>
      )}
    </div>
  )
}

function ShelfPlate({ chassis, entry, onTag }) {
  const habit = entry?.habit || ''
  const leafShape = entry?.leafShape || ''
  const barkType = entry?.barkType || ''
  const suggested = !habit ? suggestHabit(chassis.morphology) : null
  const height = chassis.heightRange ? ` · ${chassis.heightRange[1].toFixed(0)}m` : ''
  return (
    <div style={{
      borderRadius: 6, padding: 6, display: 'flex', flexDirection: 'column', gap: 5,
      background: habit ? 'rgba(120,160,110,0.07)' : 'rgba(255,255,255,0.025)',
      border: '1px solid ' + (habit ? 'rgba(120,160,110,0.28)' : 'rgba(255,255,255,0.08)'),
    }}>
      <LazySilhouette name={chassis.name} isForest={chassis.isForest} />
      <span title={chassis.name} style={{
        fontSize: 9, color: '#99a', textAlign: 'center', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{chassis.name}<span style={{ color: '#667' }}>{height}</span></span>

      {/* The three assignment pickers — habit · leaf · bark. */}
      <TagRow label="habit" value={habit} options={HABITS}
        onChange={(v) => onTag({ habit: v || null })} strong />
      {suggested && (
        <button onClick={() => onTag({ habit: suggested })} style={suggestBtn}
          title={`Its meta reads "${chassis.morphology}" → suggest ${suggested}`}>
          ↩ {suggested}?
        </button>
      )}
      <TagRow label="leaf" value={leafShape} options={LEAF_SHAPES}
        onChange={(v) => onTag({ leafShape: v || null })} />
      <TagRow label="bark" value={barkType} options={BARK_TYPES}
        onChange={(v) => onTag({ barkType: v || null })} />
    </div>
  )
}

function TagRow({ label, value, options, onChange, strong }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
      <span style={{
        width: 30, color: value ? (strong ? '#bce0a0' : '#9ab') : '#667',
        textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 8,
      }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1, minWidth: 0, background: value ? 'rgba(120,160,110,0.12)' : 'rgba(255,255,255,0.05)',
          border: '1px solid ' + (value ? 'rgba(120,160,110,0.4)' : 'rgba(255,255,255,0.12)'),
          borderRadius: 3, color: value ? '#dbe6cf' : '#99a', padding: '3px 4px', fontSize: 10,
          fontFamily: 'inherit', cursor: 'pointer',
        }}>
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
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
