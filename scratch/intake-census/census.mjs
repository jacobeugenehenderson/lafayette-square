// READ-ONLY census (Lath, 2026-10-20, for Boz / Jacob: "keep as much as we take in"). Per town, what each stage of
// fetch → raw/osm.json → clean/skeleton.json → clean/{map,ribbons}.json → public/baked/<town>/ CARRIES of what the stage
// before it held. Nothing is poured or baked; it reads the frozen records as they stand (each as of its town's last pour).
//   node scratch/intake-census/census.mjs [town …]      (default: the five towns)
// ⛔ "carried" is measured, never restated: a way's tag is CARRIED onto a chain iff the chain record holds that key with
// that value (`chain[k]` or `chain.tags[k]`); a feature is CARRIED iff its OSM id appears in the next record.
import fs from 'node:fs'
const TOWNS = process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square', 'hipointedemun', 'huron', 'jacksonheights', 'provincetown']
const J = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; return o }
const top = (o, n = 12) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0)

for (const town of TOWNS) {
  const D = `cartograph/data/${town}`, B = `public/baked/${town}`
  const osm = J(`${D}/raw/osm.json`)
  if (!osm) { console.log(`\n══ ${town}: no raw/osm.json`); continue }
  console.log(`\n══ ${town}`)

  // ── S1 · raw/osm.json, the record fetch.js writes ─────────────────────────────────────────────
  const ground = Object.entries(osm.ground || {})
  const feats = ground.flatMap(([b, fs]) => fs.map(f => ({ ...f, bucket: b })))
  let verts = 0
  for (const f of [...feats, ...(osm.buildings || [])]) verts += (f.coords?.length || 0) + (f.holes || []).reduce((a, h) => a + h.length, 0)
  const coordIdKeys = new Set(); for (const f of feats.slice(0, 500)) for (const c of f.coords || []) for (const k of Object.keys(c)) coordIdKeys.add(k)
  const rel = feats.filter(f => f.osmType === 'relation')
  console.log(`S1 osm.json: ${feats.length} ground feature(s) [${ground.map(([b, fs]) => `${b} ${fs.length}`).join(' · ')}] · ${(osm.pois || []).length} poi(s) · ${(osm.buildings || []).length} building(s) · nodeCount ${osm.nodeCount ?? '—'}${osm.heavyBbox ? ' · a heavy pass merged in (heavyBbox)' : ' · ONE pass (no heavyBbox: not a light+heavy pair)'}`)
  console.log(`   node ids: 0 carried — a vertex is {${[...coordIdKeys].join(',')}}; ${verts} vertex reference(s) carry no node id`)
  // What keeping more would COST, measured on this file's own shape (fetch writes `JSON.stringify(output, null, 2)`):
  // a sample's bytes with and without a per-vertex node id, and with and without Overpass `out meta` per element.
  // ⚠ ESTIMATES (a fake 11-digit id and a typical meta block), not a re-fetch. Geometry-node TAGS cannot be costed
  // from here: `out skel` returns none, so how many vertices carry tags is unmeasured without a count query.
  {
    const size = fs.statSync(`${D}/raw/osm.json`).size
    const sample = [...feats, ...(osm.buildings || [])].filter((_, i) => i % 25 === 0)
    const b0 = JSON.stringify(sample, null, 2).length
    const bId = JSON.stringify(sample.map(f => ({ ...f, coords: (f.coords || []).map(c => ({ ...c, id: 12345678901 })) })), null, 2).length
    const meta = { version: 7, timestamp: '2021-03-04T12:34:56Z', changeset: 123456789, user: 'a_mapper_name', uid: 1234567 }
    const bMeta = JSON.stringify(sample.map(f => ({ ...f, meta })), null, 2).length
    const k = size / b0, mb = (x) => (x / 1e6).toFixed(1)
    const elems = feats.length + (osm.buildings || []).length + (osm.pois || []).length
    console.log(`   cost of keeping more (est.): file ${mb(size)} MB · node id per vertex +${mb((bId - b0) * k)} MB (+${(100 * (bId - b0) / b0).toFixed(0)}%) · out meta per element (${elems}) +${mb(elems * (bMeta - b0) / Math.max(1, sample.length))} MB`)
  }
  console.log(`   relation features: ${rel.length} (${top(rel.reduce((o, f) => inc(o, f.bucket), {}))}); with holes ${rel.filter(f => f.holes?.length).length}; clipped ${rel.filter(f => f.clipped).length}`)

  // ── S2 · clean/skeleton.json ──────────────────────────────────────────────────────────────────
  const sk = J(`${D}/clean/skeleton.json`)
  if (!sk) { console.log('S2 skeleton.json: absent'); continue }
  const hwWays = (osm.ground?.highway || []).filter(f => f.osmType !== 'relation')
  const hwRel = (osm.ground?.highway || []).filter(f => f.osmType === 'relation')
  const inChain = new Map(); for (const s of sk.streets) for (const id of s.sources || []) inChain.set(id, s)
  const inPath = new Set((sk.paths || []).map(p => p.osmId))
  const fate = {}, lostWays = {}
  for (const f of hwWays) {
    const k = inChain.has(f.osmId) ? 'chain' : inPath.has(f.osmId) ? 'path' : 'neither'
    inc(fate, k)
    if (k === 'neither') inc(lostWays, `highway=${f.tags?.highway}${f.coords?.length < 2 ? ' (<2 coords)' : ''}`)
  }
  console.log(`S2 skeleton.json: ${hwWays.length} highway way(s) → chain ${fate.chain || 0} · path ${fate.path || 0} · NEITHER ${fate.neither || 0}${fate.neither ? ` [${top(lostWays)}]` : ''}`)
  if (hwRel.length) console.log(`   highway RELATIONS (areas, e.g. pedestrian multipolygons): ${hwRel.length} — in skeleton: ${hwRel.filter(f => inPath.has(f.osmId) || inChain.has(f.osmId)).length}`)
  // tag carriage onto chains, (way, key) pairs
  const byId = new Map(hwWays.map(f => [f.osmId, f]))
  const lostKey = {}, keptKey = {}, lostKeyNamed = {}
  let pairs = 0, lostPairs = 0
  for (const s of sk.streets) for (const id of s.sources || []) {
    const w = byId.get(id); if (!w) continue
    for (const [k, v] of Object.entries(w.tags || {})) {
      pairs++
      const kept = String(s[k]) === String(v) || String(s.tags?.[k]) === String(v) || (k === 'oneway' && (s.oneway === (v === 'yes')))
      if (kept) inc(keptKey, k)
      else { lostPairs++; inc(lostKey, k); if (!s.synthetic) inc(lostKeyNamed, k) }
    }
  }
  console.log(`   tags onto chains: ${pairs} (way,key) pair(s), ${lostPairs} NOT carried (${(100 * lostPairs / Math.max(1, pairs)).toFixed(0)}%) · ${Object.keys(lostKey).length} key(s) lost somewhere`)
  console.log(`     lost, top keys: ${top(lostKey, 16)}`)
  console.log(`     carried, top keys: ${top(keptKey, 10)}`)
  const chainsWithTags = sk.streets.filter(s => s.tags).length
  console.log(`     chains carrying a full \`tags\`: ${chainsWithTags} of ${sk.streets.length} (synthetic ${sk.streets.filter(s => s.synthetic).length})`)
  const pathTagged = (sk.paths || []).filter(p => p.tags && p.osmId != null).length
  console.log(`   paths: ${(sk.paths || []).length}, carrying osmId + full tags ${pathTagged}`)
  console.log(`   junctions: ${(sk.junctions || []).length}, keys {${Object.keys(sk.junctions?.[0] || {}).join(',')}} — no OSM node id`)
  // pois by highway value, and their readers
  const poiHw = (osm.pois || []).reduce((o, p) => p.tags?.highway ? inc(o, p.tags.highway) : o, {})
  console.log(`   highway pois: ${sum(poiHw)} [${top(poiHw, 10)}]`)

  // ── S3 · clean/map.json + clean/ribbons.json (derive) ─────────────────────────────────────────
  const map = J(`${D}/clean/map.json`), rib = J(`${D}/clean/ribbons.json`)
  if (map) {
    const L = map.layers || {}
    const lay = Object.entries(L).filter(([, v]) => Array.isArray(v) && v.length)
    const idLayers = lay.filter(([, v]) => v.some(x => x.osmId != null || x.osmIds || x.parcelId != null)).map(([k]) => k)
    console.log(`S3 map.json: ${lay.length} non-empty layer(s); layers carrying ANY source id: ${idLayers.join(', ') || 'none'}`)
    console.log(`   record keys: ${lay.map(([k, v]) => `${k}{${Object.keys(v[0]).filter(x => !['ring', 'coords', 'holes'].includes(x)).join(',') || '∅'}}`).join(' ')}`)
    const nonHw = feats.filter(f => f.bucket !== 'highway')
    const keysIn = nonHw.reduce((o, f) => { for (const k of Object.keys(f.tags || {})) inc(o, k); return o }, {})
    console.log(`   non-highway ground features in: ${nonHw.length}, ${Object.keys(keysIn).length} distinct tag key(s) — the layers above keep at most use/surface/access/name/subtype/kind`)
    // buildings
    const ob = osm.buildings || []
    const reached = new Set()
    for (const b of map.buildings || []) { if (b.osmId != null) reached.add(b.osmId); for (const id of b.twinOsmIds || []) reached.add(id) }
    const bKeys = ob.reduce((o, b) => { for (const k of Object.keys(b.tags || {})) inc(o, k); return o }, {})
    console.log(`   buildings: osm ${ob.length} → map.buildings ${(map.buildings || []).length}; osm building ids present (osmId ∪ twinOsmIds): ${reached.size}${reached.size ? '' : ' (this town\'s map.buildings carry no OSM id — `projectId` only)'} · tag keys on osm buildings ${Object.keys(bKeys).length}`)
  } else console.log('S3 map.json: absent')
  if (rib) {
    const sp = sk.paths || [], rp = rib.paths || []
    // ⚠ ribbons.paths carry no osmId, so a path is matched by an ENDPOINT within 1 m (either end): a proxy, said as one
    const xy = (q) => Array.isArray(q) ? q : [q?.x, q?.z]
    const cell = (q) => { const [x, z] = xy(q); return `${Math.round(x)},${Math.round(z)}` }
    const ends = new Set(); for (const p of [...rp, ...(rib.alleys || [])]) { const pts = p.points || []; if (pts.length) { ends.add(cell(pts[0])); ends.add(cell(pts[pts.length - 1])) } }
    const near = (q) => { const [x, z] = xy(q); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (ends.has(`${Math.round(x) + dx},${Math.round(z) + dz}`)) return true; return false }
    const pFate = {}
    for (const p of sp) { const c = p.coords || []; if (!c.length || !(near(c[0]) || near(c[c.length - 1]))) inc(pFate, `${p.highway}${p.tags?.footway ? `/${p.tags.footway}` : ''}${p.tags?.service ? `/service=${p.tags.service}` : ''}`) }
    console.log(`   ribbons.paths: ${rp.length} + alleys ${(rib.alleys || []).length} of skeleton's ${sp.length} paths (keys {${Object.keys(rp[0] || {}).join(',')}} — no osmId, no tags); by endpoint (proxy), absent: ${sum(pFate)} [${top(pFate, 12)}]`)
    console.log(`   ribbons.streets keys: {${Object.keys(rib.streets?.[0] || {}).join(',')}}`)
  }

  // ── S4 · public/baked/<town> (the served bake) ────────────────────────────────────────────────
  const sb = J(`${B}/buildings.json`), li = J(`${B}/content/listings.json`)
  if (sb) {
    const pre = sb.buildings.reduce((o, x) => inc(o, String(x.id).replace(/-?\d+$/, '')), {})
    console.log(`S4 served buildings.json: ${sb.buildings.length} (ids ${top(pre)}) · record keys {${Object.keys(sb.buildings[0] || {}).join(',')}} — no \`tags\``)
  } else console.log('S4 served buildings.json: absent')
  if (li) {
    const fromOsm = new Set(li.listings.filter(x => /^osm-/.test(x.source_key || '')).map(x => +String(x.source_key).replace(/^osm-[nwr]?/, '')))
    const cat = {}, miss = {}
    for (const p of osm.pois || []) { const c = p.category; inc(cat, c); if (!fromOsm.has(+p.osmId)) inc(miss, c) }
    console.log(`   listings: ${li.listings.length} (${fromOsm.size} from OSM ids) · pois NOT reaching a listing, by bucket: ${top(miss, 10)}`)
  }
  // parcels: raw fields vs carried
  const pf = fs.readdirSync(`${D}/raw`).filter(f => /parcels\.json$/.test(f))
  for (const f of pf) {
    const P = J(`${D}/raw/${f}`); const arr = P?.parcels || P?.features || []
    const filled = {}
    for (const p of arr) for (const [k, v] of Object.entries(p.properties || p)) if (v != null && v !== '' && !['rings', 'centroid', 'centroid_ll', 'geometry'].includes(k)) inc(filled, k)
    const mp = (map?.layers?.parcel || [])
    console.log(`   parcels ${f}: ${arr.length} · fields with values: ${top(filled, 20)} · map.parcel keys {${Object.keys(mp[0] || {}).join(',')}} (${mp.length})`)
  }
}
