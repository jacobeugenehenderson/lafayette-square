#!/usr/bin/env node
/**
 * claims-intake-is-lossless.mjs — what a town takes in, it keeps, or a NAMED rule says why not.
 *
 *   node checks/claims-intake-is-lossless.mjs [town …]       (default: every town with raw/osm.json + clean/skeleton.json)
 *
 * Jacob, 2026-10-19: "We need to make sure we are keeping as much as we take in. This is a persistent annoyance."
 * The census behind it: scratch/intake-census/CENSUS.md (`node scratch/intake-census/census.mjs`).
 *
 * TWO SCOPES (Boz, 2026-10-20):
 *  · INTERNAL — raw/osm.json → clean/skeleton.json → clean/map.json + ribbons → the frozen records must carry what they
 *    took in: the value, or an id that names its source. Anything else is RED unless a DROPS row names the rule.
 *  · SERVED — public/baked/<town> is a CURATED set. Carriage is not demanded there; every served drop must be NAMED.
 *    ⛔ Never push a withheld field (a parcel owner) toward the browser to turn this green: the row is the answer.
 *
 * ⛔ The drop rules are READ, never restated: the not-built classes are read from streetClass.js (network 'none'), EXCLUDE_FROM_STREETS is parsed out of skeleton.js; building
 *    membership is `membership.mjs#createMembershipFilter`, called as pipeline.js calls it. Every DROPS row names the
 *    code symbol it stands for and is RED (stale) when that symbol is gone from the source.
 * ⛔ A record that carries NO source id cannot be shown lossless, so it is its own RED class (`no-source-id`), not a pass.
 * ⚠ ribbons.paths carry no osmId today: their per-kind absences are joined by ENDPOINT within 1 m — a PROXY, labelled so.
 * ⭐ The chain shape it accepts for tags: `chain[k]`, `chain.tags[k]`, or a source entry `{osmId, tags}` in
 *    `chain.sources` (the per-segment carriage the classifier branch is adding).
 * ⭐ MUTANTS (each RED, on a fixture that is GREEN first): a chain's source removed · a path's osmId stripped · a building
 *    twin dropped · a tag deleted off a synthetic chain · a source-entry tag deleted · the not-built set read without the value
 *    a dropped way relies on · a DROPS row whose symbol is deleted · a map layer item without its id · the served
 *    privacy row removed · a poi with no frozen record.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMembershipFilter, buildingIdOf } from '../cartograph/membership.mjs'
import { WITHHELD_PARCEL_FIELDS } from '../cartograph/sources.js'
import { CLASSES, RULES } from '../src/cartograph/streetClass.js'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// scene.js prints a default-scene notice on import; this check names every town itself, so the notice is noise here
const { ribbonsPathOf } = await (async () => { const l = console.log; console.log = () => {}; try { return await import('../cartograph/scene.js') } finally { console.log = l } })()
const J = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const SRC = (rel) => readFileSync(join(ROOT, rel), 'utf8')

// ── the named rules ───────────────────────────────────────────────────────────────────────────────────────────────
// Every row names the source that IS the rule; a row whose symbol is gone is RED (`stale-drop-rule`).
const DROPS = [
  { id: 'not-built', scope: 'internal', file: 'src/cartograph/streetClass.js', symbol: /class: 'not-built'/,
    says: 'a way whose class has network \'none\' (proposed, construction, …) leaves the road network' },
  { id: 'exclude-from-streets', scope: 'internal', file: 'cartograph/skeleton.js', symbol: /const EXCLUDE_FROM_STREETS = new Set\(/,
    says: '⚠ a per-NAME list (LS proper nouns); it drops the whole name group, paths included' },
  { id: 'building-membership', scope: 'internal', file: 'cartograph/pipeline.js', symbol: /createMembershipFilter\(\{ nb, activate, hide/,
    says: 'a building outside the boundary, in an authored exclusion loop, or authored hidden' },
  { id: 'curated-buildings', scope: 'internal', file: 'cartograph/pipeline.js', symbol: /const declaredBldg = declaredBuildingsOf\(SCENE\)/,
    says: 'the town draws the curated building set it declares (pour.buildings, e.g. src/data/buildings.json), not OSM footprints' },
  { id: 'served-parcel-privacy', scope: 'served', file: 'cartograph/states/mo.mjs', symbol: /No information may be sold or redistributed/,
    fields: WITHHELD_PARCEL_FIELDS,   // read from its one home, never restated here
    says: 'parcel owner and assessor fields are withheld from the browser: privacy, and St. Louis City\'s no-redistribution terms (the stl-city well\'s terms, cartograph/states/mo.mjs)' },
]

function setFromSource(text, name) {
  const m = text.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`))
  if (!m) return null
  const body = m[1].split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')
  return new Set([...body.matchAll(/'([^']*)'/g)].map(x => x[1]))
}

function readRules(srcOf = SRC) {
  const sk = srcOf('cartograph/skeleton.js')
  // the dropped highway values: every vocabulary row whose class's network is 'none' (skeleton.js drops the 'not-built' class)
  const notBuilt = new Set(RULES.filter(r => CLASSES[r.class]?.network === 'none').flatMap(r => r.highway))
  const exclude = setFromSource(sk, 'EXCLUDE_FROM_STREETS')
  const stale = DROPS.filter(r => { try { return !r.symbol.test(srcOf(r.file)) } catch { return true } }).map(r => `${r.id} (${r.file}: ${r.symbol})`)
  if (!notBuilt.size) stale.push("not-built: no class with network 'none' in streetClass.js")
  if (!exclude) stale.push('exclude-from-streets: EXCLUDE_FROM_STREETS not parseable in skeleton.js')
  return { notBuilt: notBuilt || new Set(), exclude: exclude || new Set(), stale, drops: DROPS }
}

// ── the evaluation (pure over in-memory records) ──────────────────────────────────────────────────────────────────
const sourceIdOf = (s) => (s && typeof s === 'object') ? (s.osmId ?? s.id) : s
const hasId = (x) => x && (x.osmId != null || x.osmIds != null || x.parcelId != null || x.sourceId != null || x.nodeId != null)

export function evaluate(rec, rules) {
  const red = [], add = (cls, scope, items, note = '') => { if (items.length) red.push({ cls, scope, n: items.length, ex: items.slice(0, 3), note }) }
  const { osm, sk, map, rib, served } = rec
  for (const s of rules.stale) red.push({ cls: 'stale-drop-rule', scope: 'rule', n: 1, ex: [s], note: 'a DROPS row whose rule is gone from the source' })

  // A · records that carry no source id
  const noId = []
  for (const [k, v] of Object.entries(map?.layers || {})) if (Array.isArray(v) && v.length && v.some(x => !hasId(x))) noId.push(`map.layers.${k} (${v.filter(x => !hasId(x)).length}/${v.length})`)
  for (const k of ['paths', 'alleys']) { const v = rib?.[k] || []; if (v.some(x => !hasId(x))) noId.push(`ribbons.${k} (${v.filter(x => !hasId(x)).length}/${v.length})`) }
  { const v = sk?.junctions || []; if (v.some(x => !hasId(x))) noId.push(`skeleton.junctions (${v.filter(x => !hasId(x)).length}/${v.length})`) }
  add('no-source-id', 'internal', noId, 'cannot be shown lossless')

  // B · highway ways and areas reaching the skeleton
  const chainOf = new Map(); for (const s of sk?.streets || []) for (const e of s.sources || []) chainOf.set(sourceIdOf(e), { s, e })
  const pathOf = new Map((sk?.paths || []).filter(p => p.osmId != null).map(p => [p.osmId, p]))
  const hw = osm?.ground?.highway || [], lost = []
  for (const f of hw) {
    if (chainOf.has(f.osmId) || pathOf.has(f.osmId)) continue
    if (rules.notBuilt.has(f.tags?.highway) || rules.exclude.has(f.tags?.name)) continue   // not-built · exclude-from-streets
    lost.push(`${f.osmType === 'relation' ? 'r' : 'w'}${f.osmId} highway=${f.tags?.highway}${f.tags?.name ? ` "${f.tags.name}"` : ''}`)
  }
  add('way-not-carried', 'internal', lost)

  // C · a source way's tags carried onto its chain
  const byId = new Map(hw.map(f => [f.osmId, f])), tagLost = {}
  let tagN = 0
  for (const [id, { s, e }] of chainOf) {
    const w = byId.get(id); if (!w) continue
    const et = (e && typeof e === 'object') ? e.tags : null
    for (const [k, v] of Object.entries(w.tags || {})) {
      const kept = String(et?.[k]) === String(v) || String(s.tags?.[k]) === String(v) || String(s[k]) === String(v) || (k === 'oneway' && s.oneway === (v === 'yes'))
      if (!kept) { tagN++; tagLost[k] = (tagLost[k] || 0) + 1 }
    }
  }
  if (tagN) red.push({ cls: 'chain-tag-not-carried', scope: 'internal', n: tagN, ex: Object.entries(tagLost).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ×${n}`), note: `(way, key) pairs; ${Object.keys(tagLost).length} key(s)` })

  // D · a path's tags
  const pathLost = []
  for (const [id, p] of pathOf) { const w = byId.get(id); if (!w) continue; for (const [k, v] of Object.entries(w.tags || {})) if (String(p.tags?.[k]) !== String(v)) pathLost.push(`w${id} ${k}`) }
  add('path-tag-not-carried', 'internal', pathLost)

  // E · skeleton paths reaching ribbons (by id when ribbons carry one; else the endpoint PROXY)
  if (rib) {
    const rp = [...(rib.paths || []), ...(rib.alleys || [])], idd = rp.some(hasId)
    const ids = new Set(rp.map(x => x.osmId).filter(x => x != null))
    const xy = (q) => Array.isArray(q) ? q : [q?.x, q?.z]
    const cell = (q) => { const [x, z] = xy(q); return `${Math.round(x)},${Math.round(z)}` }
    const ends = new Set(); for (const p of rp) { const pts = p.points || []; if (pts.length) { ends.add(cell(pts[0])); ends.add(cell(pts[pts.length - 1])) } }
    const near = (q) => { const [x, z] = xy(q); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (ends.has(`${Math.round(x) + dx},${Math.round(z) + dz}`)) return true; return false }
    const kinds = {}
    for (const p of sk?.paths || []) {
      const c = p.coords || []
      const hit = idd ? ids.has(p.osmId) : (c.length && (near(c[0]) || near(c[c.length - 1])))
      if (!hit) { const k = `${p.highway}${p.tags?.footway ? `/${p.tags.footway}` : ''}${p.tags?.service ? `/service=${p.tags.service}` : ''}`; kinds[k] = (kinds[k] || 0) + 1 }
    }
    const n = Object.values(kinds).reduce((a, b) => a + b, 0)
    if (n) red.push({ cls: 'path-not-in-ribbons', scope: 'internal', n, ex: Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ×${v}`),
      note: `${idd ? 'by osmId' : 'PROXY: by endpoint within 1 m'}; footway=sidewalk/crossing are excluded by derive's inline filter (deliberate, UNNAMED)` })
  } else red.push({ cls: 'record-absent', scope: 'internal', n: 1, ex: ['ribbons'], note: 'no ribbons record at ribbonsPathOf' })

  // F · buildings
  const mb = map?.buildings || [], inMap = new Set()
  for (const b of mb) { if (b.osmId != null) inMap.add(b.osmId); for (const t of b.twinOsmIds || []) inMap.add(t) }
  const curated = mb.length && !inMap.size && mb.every(b => b.projectId != null)   // curated-buildings
  const bLost = []
  if (!curated) for (const b of osm?.buildings || []) { if (inMap.has(b.osmId)) continue; if (rec.member && !rec.member(b)) continue; bLost.push(`w${b.osmId}`) }
  add('building-not-carried', 'internal', bLost)

  // G · a building's OSM tags (its own record, or its twin's) carried internally
  const oById = new Map((osm?.buildings || []).map(b => [b.osmId, b])), bt = {}
  let btN = 0
  for (const b of mb) {
    const own = b.osmId != null ? [b.osmId] : [], twins = b.twinOsmIds || []
    for (const id of [...own, ...twins]) { const o = oById.get(id); if (!o) continue
      for (const [k, v] of Object.entries(o.tags || {})) { const kept = own.includes(id) ? String(b.tags?.[k]) === String(v) : String(b.twinTags?.[id]?.[k]) === String(v); if (!kept) { btN++; bt[k] = (bt[k] || 0) + 1 } } }
  }
  if (btN) red.push({ cls: 'building-tag-not-carried', scope: 'internal', n: btN, ex: Object.entries(bt).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ×${n}`), note: 'own tags, and a twin OSM building\'s tags on the merged footprint' })

  // H · pois: a frozen record carries the poi's id (listings · evidence), or it is lost
  const held = new Set()
  for (const l of served?.listings?.listings || []) { const m = String(l.source_key || '').match(/^osm-[nwr]?(\d+)$/); if (m) held.add(+m[1]) }
  for (const k of ['crosswalkEvidence', 'curbCutEvidence']) for (const r of rib?.[k]?.records || []) if (r.osmId != null) held.add(+r.osmId)
  const poiLost = {}
  for (const p of osm?.pois || []) if (!held.has(+p.osmId)) { const k = `${p.category}${p.tags?.[p.category] ? `=${p.tags[p.category]}` : ''}`; poiLost[k] = (poiLost[k] || 0) + 1 }
  const pn = Object.values(poiLost).reduce((a, b) => a + b, 0)
  if (pn) red.push({ cls: 'poi-not-carried', scope: 'internal', n: pn, ex: Object.entries(poiLost).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ×${v}`), note: 'no frozen record names the poi' })

  // SERVED · building tags reduced (a curated drop must be named)
  if (served?.buildings) {
    const sKeys = new Set(served.buildings.buildings?.flatMap(b => Object.keys(b.tags || {})) || [])
    const mKeys = new Set(mb.flatMap(b => Object.keys(b.tags || {})))
    const dropped = [...mKeys].filter(k => !sKeys.has(k))
    add('served-building-tag-unnamed', 'served', dropped.map(k => k), `${dropped.length} building tag key(s) not served and named by no rule`)
  }
  // SERVED · parcel fields
  if (rec.parcels?.length) {
    const roster = served?.roster?.buildings
    if (!roster) red.push({ cls: 'record-absent', scope: 'served', n: 1, ex: ['content/roster.json'], note: 'parcel fields reach no served record' })
    else {
      const filled = new Set(); for (const p of rec.parcels) for (const [k, v] of Object.entries(p)) if (v != null && v !== '' && !['rings', 'rings_ll', 'centroid', 'centroid_ll'].includes(k)) filled.add(k)
      const shipped = new Set(roster.flatMap(b => Object.keys(b)))
      const named = new Set(rules.drops.filter(r => r.scope === 'served').flatMap(r => r.fields || []))
      add('served-parcel-field-unnamed', 'served', [...filled].filter(k => !shipped.has(k) && !named.has(k)), 'parcel field(s) not served and named by no rule')
    }
  }
  if ((osm?.pois || []).length && !served?.listings) red.push({ cls: 'record-absent', scope: 'served', n: 1, ex: ['content/listings.json'], note: 'pois reach no served record' })
  return red
}

// ── the instrument, proven first: a GREEN fixture, then each mutant RED ──────────────────────────────────────────────
function fixture() {
  const w1 = { osmId: 1, osmType: 'way', tags: { highway: 'residential', name: 'A Street', surface: 'asphalt' }, coords: [{ x: 0, z: 0 }, { x: 10, z: 0 }] }
  const w2 = { osmId: 2, osmType: 'way', tags: { highway: 'footway' }, coords: [{ x: 0, z: 5 }, { x: 10, z: 5 }] }
  const w3 = { osmId: 3, osmType: 'way', tags: { highway: 'proposed', name: 'Not Yet' }, coords: [{ x: 0, z: 9 }, { x: 9, z: 9 }] }
  const w4 = { osmId: 4, osmType: 'way', tags: { highway: 'service' }, coords: [{ x: 0, z: 20 }, { x: 5, z: 20 }] }
  const b5 = { osmId: 5, tags: { building: 'yes', name: 'Hall' }, coords: [] }, b6 = { osmId: 6, tags: { building: 'yes', height: '9' }, coords: [] }
  return {
    osm: { ground: { highway: [w1, w2, w3, w4] }, pois: [{ osmId: 7, category: 'shop', tags: { shop: 'bakery' } }], buildings: [b5, b6] },
    sk: { streets: [{ name: 'A Street', highway: 'residential', surface: 'asphalt', sources: [1] },
                    { name: 'service 1', synthetic: true, highway: 'service', tags: { highway: 'service' }, sources: [4] }],
          paths: [{ osmId: 2, highway: 'footway', tags: { highway: 'footway' }, coords: w2.coords }], junctions: [{ x: 0, z: 0, degree: 1, nodeId: 11 }] },
    map: { layers: { parcel: [{ ring: [], use: 'res', parcelId: 'P1' }] },
           buildings: [{ osmId: 5, tags: b5.tags }, { msbfId: 1, tags: { building: 'yes', height: '9' }, twinOsmIds: [6], twinTags: { 6: b6.tags } }] },
    rib: { paths: [{ osmId: 2, points: [[0, 5], [10, 5]] }], alleys: [] },
    served: { buildings: { buildings: [{ id: 'osm-5', tags: { building: 'yes', name: 'Hall', height: '9' } }] },
              listings: { listings: [{ source_key: 'osm-7' }] }, roster: { buildings: [{ id: 'osm-5', handle: 'P1', address: '1 A St' }] } },
    parcels: [{ handle: 'P1', address: '1 A St', owner: 'A Person' }],
    member: () => true,
  }
}
const clone = (x) => JSON.parse(JSON.stringify(x))
function withFns(r, base) { r.member = base.member; return r }

function proveTheInstrument() {
  const rules = readRules(), fails = []
  const base = fixture(), green = evaluate(base, rules)
  if (green.length) fails.push(`the fixture is not GREEN: ${green.map(g => `${g.cls} ${g.ex.join(', ')}`).join(' · ')}`)
  const M = (name, mutate, ruleMut = null, expect = null) => {
    const r = withFns(clone(base), base); mutate(r)
    const out = evaluate(r, ruleMut ? ruleMut(rules) : rules)
    const hit = expect ? out.some(o => o.cls === expect) : out.length > 0
    if (!hit) fails.push(`MUTANT stayed GREEN: ${name}${expect ? ` (expected ${expect})` : ''}`)
  }
  M('a chain loses a source', r => { r.sk.streets[0].sources = [] }, null, 'way-not-carried')
  M('a path loses its osmId', r => { delete r.sk.paths[0].osmId }, null, 'way-not-carried')
  M('a building twin dropped', r => { r.map.buildings[1].twinOsmIds = [] }, null, 'building-not-carried')
  M('a tag deleted off a synthetic chain', r => { delete r.sk.streets[1].tags.highway; r.sk.streets[1].highway = 'x' }, null, 'chain-tag-not-carried')
  M('a source-entry tag deleted (per-segment shape)', r => { r.sk.streets[0] = { name: 'A Street', sources: [{ osmId: 1, tags: { highway: 'residential', name: 'A Street' } }] } }, null, 'chain-tag-not-carried')
  M('the not-built set read without the value a dropped way relies on', () => {}, (R) => ({ ...R, notBuilt: new Set([...R.notBuilt].filter(v => v !== 'proposed')) }), 'way-not-carried')
  {
    const gone = readRules((rel) => rel === 'cartograph/pipeline.js' ? SRC(rel).replace(/createMembershipFilter\(\{ nb, activate, hide/g, 'removed(') : SRC(rel))
    if (!evaluate(fixture(), gone).some(o => o.cls === 'stale-drop-rule')) fails.push('MUTANT stayed GREEN: a DROPS row whose symbol is deleted')
  }
  M('a map layer item without its id', r => { delete r.map.layers.parcel[0].parcelId }, null, 'no-source-id')
  M('the served privacy row removed', () => {}, (R) => ({ ...R, drops: R.drops.filter(d => d.id !== 'served-parcel-privacy') }), 'served-parcel-field-unnamed')
  M('a poi with no frozen record', r => { r.served.listings.listings = [] }, null, 'poi-not-carried')
  M('a junction without its node id', r => { delete r.sk.junctions[0].nodeId }, null, 'no-source-id')
  M('a building tag reduced at the bake', r => { delete r.served.buildings.buildings[0].tags.name }, null, 'served-building-tag-unnamed')
  return { fails, rules }
}

// ── the towns ─────────────────────────────────────────────────────────────────────────────────────────────────────
function loadTown(town) {
  const D = join(ROOT, 'cartograph', 'data', town), B = join(ROOT, 'public', 'baked', town)
  const osm = J(join(D, 'raw', 'osm.json')), sk = J(join(D, 'clean', 'skeleton.json'))
  if (!osm || !sk) return null
  const nb = J(join(D, 'neighborhood_boundary.json')), ov = J(join(D, 'building-overrides.json')) || {}
  const mem = nb ? createMembershipFilter({ nb, activate: new Set(ov.activate || []), hide: new Set(ov.hide || []), label: 'claims-intake-is-lossless' }) : null
  let ribPath = null; try { ribPath = ribbonsPathOf(town) } catch { ribPath = null }
  const parcels = readdirSync(join(D, 'raw')).filter(f => /parcels\.json$/.test(f)).flatMap(f => { const P = J(join(D, 'raw', f)); return P?.parcels || [] })
  return {
    osm, sk, map: J(join(D, 'clean', 'map.json')), rib: ribPath ? J(ribPath) : null,
    served: { buildings: J(join(B, 'buildings.json')), listings: J(join(B, 'content', 'listings.json')), roster: J(join(B, 'content', 'roster.json')) },
    parcels, member: mem ? (b) => mem.decide(buildingIdOf(b), b.coords) : null,
  }
}

const { fails, rules } = proveTheInstrument()
if (fails.length) {
  console.log('⛔ THE INSTRUMENT IS BROKEN — nothing below could be trusted:')
  for (const f of fails) console.log(`   ✗ ${f}`)
  process.exit(2)
}
console.log('✓ instrument: the lossless fixture is GREEN and all 13 mutants read RED')

const towns = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(join(ROOT, 'cartograph', 'data')).filter(t => existsSync(join(ROOT, 'cartograph', 'data', t, 'raw', 'osm.json')))
// ⭐ ONE TOWN IN MEMORY AT A TIME. A town's records parse to ~0.5–1 GB (Jackson Heights the largest); left to V8, a
// five-town run peaked at 2.4 GB because the previous town was never collected. Collected explicitly between towns.
setFlagsFromString('--expose_gc'); const collect = runInNewContext('gc')
let anyRed = false
for (const town of towns) {
  const rec = loadTown(town)
  if (!rec) { console.log(`\n· ${town}: no raw/osm.json + clean/skeleton.json — not poured, nothing to keep`); continue }
  const _log = console.log; console.log = () => {}
  let red; try { red = evaluate(rec, rules) } finally { console.log = _log }
  console.log(`\n${red.length ? '⛔ RED' : '✓ GREEN'}  ${town}`)
  for (const s of ['rule', 'internal', 'served']) for (const r of red.filter(x => x.scope === s))
    console.log(`   [${r.scope}] ${r.cls}: ${r.n}${r.note ? ` — ${r.note}` : ''}\n        ${r.ex.join(' · ')}`)
  if (red.length) anyRed = true
  collect()
}
console.log(`\nNamed drop rules (${rules.drops.length}): ${rules.drops.map(r => `${r.id} [${r.scope}]`).join(' · ')}`)
process.exit(anyRed ? 1 : 0)
