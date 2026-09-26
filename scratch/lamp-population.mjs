#!/usr/bin/env node
// lamp-population.mjs — BRIEF-street-lamps-derived step 2: measure the surveyed
// street-lamp population across EVERY scene on disk, so the derived spacing /
// street selection / side / offset come from the data and not from one street.
//
// Wells read (both OSM, lon/lat): raw/osm.json#pois (highway=street_lamp) and
// raw/osm_street_lamps.json (Overpass export). Ways: raw/osm.json#ground.highway.
// Everything reprojected through the scene's CURRENT geography.json.
//
//   node scratch/lamp-population.mjs            # all scenes
//   node scratch/lamp-population.mjs huron      # one
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// --sample: also read the scratch/lamp-sample/ towns (fetched by scratch/lamp-sample/fetch.mjs)
const ROOTS = [join(ROOT, 'cartograph', 'data')]
if (process.argv.includes('--sample')) ROOTS.push(join(ROOT, 'scratch', 'lamp-sample'))
const read = p => JSON.parse(readFileSync(p, 'utf-8'))
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const f = v => Number.isFinite(v) ? v.toFixed(1) : '—'
const ASSIGN_MAX_M = 30   // a lamp further than this from every way is reported, not assigned
// --roads: assign each lamp to the nearest CARRIAGEWAY only. OSM sidewalks are separate
// footways in some towns (St. Louis), so nearest-any-way files a street's sidewalk lamp
// under 'footway'. A lamp with no carriageway within ROAD_MAX_M is OFF-STREET (park/path).
const ROADS = process.argv.includes('--roads')
const ROAD_MAX_M = 25
const CARRIAGE = new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','living_street','service'])

const argScene = process.argv.slice(2).find(a => !a.startsWith('--'))
const scenes = ROOTS.flatMap(R => readdirSync(R).filter(s => existsSync(join(R, s, 'geography.json'))).map(s => join(R, s)))
  .filter(d => !argScene || d.endsWith('/' + argScene))
const pooled = {}
// Per-town summary over ordinary streets (not service/motorway/trunk): one vote per town, so a heavily mapped town can't set the answer.
const STREETS = new Set(['residential','unclassified','living_street','tertiary','secondary','primary'])
const townRows = []   // class → { spacingSame:[], spacingAny:[], offset:[], lamps, lenLit, len, litYes, litNo, litLen }

for (const dir of scenes) {
  const scene = dir.split('/').at(-1)
  const g = read(join(dir, 'geography.json'))
  const P = (lon, lat) => [(lon - g.lon) * g.lonToMeters, (g.lat - lat) * g.latToMeters]
  const osmP = join(dir, 'raw', 'osm.json')
  if (!existsSync(osmP)) continue
  const osm = read(osmP)
  const lampsLL = []
  for (const p of osm.pois || []) if (p?.tags?.highway === 'street_lamp') lampsLL.push({ lon: p.lon ?? p.coords?.[0]?.lon, lat: p.lat ?? p.coords?.[0]?.lat, well: 'pois', tags: p.tags })
  const mP = join(dir, 'raw', 'osm_street_lamps.json')
  if (existsSync(mP)) { const r = read(mP); for (const e of (r.elements || r)) if (e?.tags?.highway === 'street_lamp') lampsLL.push({ lon: e.lon, lat: e.lat, well: 'osm_street_lamps', tags: e.tags }) }
  const lamps = lampsLL.filter(l => typeof l.lon === 'number').map(l => { const [x, z] = P(l.lon, l.lat); return { ...l, x, z } })

  const ways = (osm.ground?.highway || []).filter(w => w.tags?.highway && w.coords?.length > 1).map(w => {
    const pts = w.coords.map(c => P(c.lon, c.lat)); const cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    return { id: w.osmId, cls: w.tags.highway, lit: w.tags.lit, name: w.tags.name, pts, cum, len: cum.at(-1), hits: [] }
  })

  // Census footprint: bbox of the lamps, grown 50 m. Lit-share is only meaningful where someone mapped lamps.
  let bb = null
  if (lamps.length) { const xs = lamps.map(l => l.x), zs = lamps.map(l => l.z); bb = [Math.min(...xs) - 50, Math.min(...zs) - 50, Math.max(...xs) + 50, Math.max(...zs) + 50] }

  let unassigned = 0
  const maxD = ROADS ? ROAD_MAX_M : ASSIGN_MAX_M
  for (const l of lamps) {
    let best = null
    for (const w of ways) if (!ROADS || CARRIAGE.has(w.cls)) for (let i = 1; i < w.pts.length; i++) {
      const [ax, az] = w.pts[i - 1], [bx, bz] = w.pts[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
      if (!L2) continue
      const t = Math.max(0, Math.min(1, ((l.x - ax) * dx + (l.z - az) * dz) / L2))
      const px = ax + t * dx, pz = az + t * dz, d = Math.hypot(l.x - px, l.z - pz)
      if (!best || d < best.d) best = { w, d, s: w.cum[i - 1] + t * Math.sqrt(L2), side: Math.sign(dx * (l.z - az) - dz * (l.x - ax)) }
    }
    if (!best || best.d > maxD) { unassigned++; continue }
    best.w.hits.push({ s: best.s, side: best.side, d: best.d })
    l.cls = best.w.cls; l.d = best.d
  }

  const byCls = {}
  const C = c => (byCls[c] ||= { spacingSame: [], spacingAny: [], offset: [], lamps: 0, len: 0, lenLit: 0, litYes: 0, litNo: 0, litLenYes: 0, ways: 0, waysLit: 0, oneSided: 0, twoSided: 0 })
  for (const w of ways) {
    const c = C(w.cls)
    if (w.lit === 'yes') { c.litYes++; c.litLenYes += w.len } else if (w.lit === 'no') c.litNo++
    const inFoot = bb && w.pts.some(([x, z]) => x >= bb[0] && x <= bb[2] && z >= bb[1] && z <= bb[3])
    if (!inFoot) continue
    c.ways++; c.len += w.len
    if (!w.hits.length) continue
    c.waysLit++; c.lamps += w.hits.length
    for (const h of w.hits) c.offset.push(h.d)
    const hs = [...w.hits].sort((a, b) => a.s - b.s)
    for (let i = 1; i < hs.length; i++) c.spacingAny.push(hs[i].s - hs[i - 1].s)
    for (const side of [-1, 1]) { const ss = hs.filter(h => h.side === side); for (let i = 1; i < ss.length; i++) c.spacingSame.push(ss[i].s - ss[i - 1].s) }
    // lit length: the span between first and last lamp, plus half a gap each end
    c.lenLit += Math.min(w.len, hs.at(-1).s - hs[0].s + 30)
    if (hs.length >= 4) { const left = hs.filter(h => h.side < 0).length / hs.length; (left < 0.15 || left > 0.85) ? c.oneSided++ : c.twoSided++ }
  }

  console.log(`\n=== ${scene}  lamps=${lamps.length} (${[...new Set(lamps.map(l => l.well))].join('+') || 'none'})  ${ROADS ? 'off-street' : 'unassigned'}(>${maxD}m)=${unassigned}  ways=${ways.length}`)
  const rows = Object.entries(byCls).sort((a, b) => b[1].lamps - a[1].lamps || b[1].litYes - a[1].litYes)
  console.log('class'.padEnd(15), 'lamps  waysLit/ways  lenLit/len(m)   same-side spacing p25/p50/p75   any-side p50   offset p50   1-sided/2-sided   lit=yes/no (whole scene)')
  for (const [cls, c] of rows) {
    if (!c.lamps && !c.litYes && !c.litNo) continue
    console.log(cls.padEnd(15), String(c.lamps).padEnd(6), `${c.waysLit}/${c.ways}`.padEnd(13), `${c.lenLit.toFixed(0)}/${c.len.toFixed(0)}`.padEnd(15),
      `${f(q(c.spacingSame, .25))}/${f(q(c.spacingSame, .5))}/${f(q(c.spacingSame, .75))} (n=${c.spacingSame.length})`.padEnd(32),
      f(q(c.spacingAny, .5)).padEnd(14), f(q(c.offset, .5)).padEnd(12), `${c.oneSided}/${c.twoSided}`.padEnd(17), `${c.litYes}/${c.litNo}`)
    const pc = (pooled[cls] ||= { spacingSame: [], offset: [], lamps: 0, scenes: new Set() })
    pc.spacingSame.push(...c.spacingSame); pc.offset.push(...c.offset); pc.lamps += c.lamps; if (c.lamps) pc.scenes.add(scene)
  }
  { const sp = [], off = []; let n = 0; for (const [cls, c] of Object.entries(byCls)) if (STREETS.has(cls)) { sp.push(...c.spacingSame); off.push(...c.offset); n += c.lamps }
    if (sp.length >= 10) townRows.push({ scene, n, p25: q(sp, .25), p50: q(sp, .5), p75: q(sp, .75), off: q(off, .5), ns: sp.length }) }
  // pole tags where present (HiPointe carries them)
  const tagCount = k => { const t = {}; for (const l of lamps) if (l.tags?.[k]) t[l.tags[k]] = (t[l.tags[k]] || 0) + 1; return t }
  for (const k of ['support', 'lamp_mount', 'lamp_type']) { const t = tagCount(k); if (Object.keys(t).length) console.log(`  tag ${k}:`, JSON.stringify(t)) }
}

console.log('\n=== POOLED (every scene; ⚠️ LS and LS-staging overlap — the staging extent contains LS)')
for (const [cls, c] of Object.entries(pooled).sort((a, b) => b[1].lamps - a[1].lamps))
  console.log(cls.padEnd(15), `lamps=${c.lamps}`.padEnd(11), `same-side p25/p50/p75 ${f(q(c.spacingSame, .25))}/${f(q(c.spacingSame, .5))}/${f(q(c.spacingSame, .75))} (n=${c.spacingSame.length})`.padEnd(44), `offset p50 ${f(q(c.offset, .5))}`, [...c.scenes].join(','))

if (townRows.length) {
  console.log('\n=== PER TOWN, ordinary streets (residential·unclassified·living·tertiary·secondary·primary), towns with ≥10 same-side gaps')
  for (const r of townRows) console.log(r.scene.padEnd(26), `lamps=${r.n}`.padEnd(11), `same-side p25/p50/p75 ${f(r.p25)}/${f(r.p50)}/${f(r.p75)} (n=${r.ns})`.padEnd(44), `offset p50 ${f(r.off)}`)
  const indep = townRows.filter(r => r.scene !== 'lafayette-square-staging')   // contains LS: one vote, not two
  console.log(`median of town medians (${indep.length} towns, LS-staging excluded as a duplicate of LS): ${f(q(indep.map(r => r.p50), .5))} m  · range ${f(Math.min(...indep.map(r => r.p50)))}–${f(Math.max(...indep.map(r => r.p50)))} m`)
}
