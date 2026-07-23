#!/usr/bin/env node
// ls-content-crosswalk.mjs — STEP 3 of the LS conform (EXTENT-DESIGN §6 step 3).
//
// LS's 87 place cards (src/data/landmarks.json) are anchored to bldg- ids. The new
// LS (the staging pour) uses msbf- ids. This builds the one-time geometry crosswalk
// bldg- -> msbf- (nearest centroid, lon/lat) and reports how many of the 87 cards
// re-anchor cleanly vs. land far/missing — the GATE that proves the swap won't kill
// content (R2: losing soft contents outranks losing geometry). Safe: reads only.
//
// Run: node scratch/ls-content-crosswalk.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const R = (...p) => join(ROOT, ...p)
const J = (p) => JSON.parse(readFileSync(p, 'utf8'))

// ── OLD LS: bldg- + footprint (x/z in LS's frame) → unproject to lon/lat ──────
const geo = J(R('cartograph/data/lafayette-square/geography.json'))
const lonToM = geo.lonToMeters, latToM = geo.latToMeters || 111000
const unproj = (x, z) => [geo.lon + x / lonToM, geo.lat - z / latToM] // +z = south → lat decreases
const oldRaw = J(R('src/data/buildings.json'))
const oldB = Array.isArray(oldRaw) ? oldRaw : (oldRaw.buildings || oldRaw.features || Object.values(oldRaw))
const oldCentroids = new Map() // bldg-id -> [lon, lat]
for (const b of oldB) {
  const fp = b.footprint
  if (!Array.isArray(fp) || !fp.length) continue
  let x = 0, z = 0
  for (const p of fp) { x += p[0]; z += p[1] }
  oldCentroids.set(b.id, unproj(x / fp.length, z / fp.length))
}

// ── NEW LS (staging pour): msbf- + coords (lon/lat) ──────────────────────────
const newB = J(R('cartograph/data/lafayette-square-staging/raw/msbf.json')).buildings
const newPts = newB.map(b => {
  let lon = 0, lat = 0
  for (const c of b.coords) { lon += c.lon; lat += c.lat }
  return { id: `msbf-${b.msbfId}`, lon: lon / b.coords.length, lat: lat / b.coords.length }
})

// meters between two lon/lat (local flat, plenty accurate at hood scale)
const mLat = 111000, mLon = 111320 * Math.cos((geo.lat * Math.PI) / 180)
const distM = (lon1, lat1, lon2, lat2) => Math.hypot((lon1 - lon2) * mLon, (lat1 - lat2) * mLat)

// nearest new building to an old centroid
function nearest(lon, lat) {
  let best = null, bd = Infinity
  for (const p of newPts) {
    const d = distM(lon, lat, p.lon, p.lat)
    if (d < bd) { bd = d; best = p }
  }
  return { id: best?.id, dist: bd }
}

// ── The 87 place cards ───────────────────────────────────────────────────────
const cardsRaw = J(R('src/data/landmarks.json'))
const cards = Array.isArray(cardsRaw) ? cardsRaw : (cardsRaw.landmarks || cardsRaw.listings || Object.values(cardsRaw))
const CLEAN = 8, OK = 20 // metres

const buckets = { clean: [], ok: [], far: [], noBldg: [] }
for (const c of cards) {
  const bid = c.building_id || c.buildingId
  const oc = oldCentroids.get(bid)
  if (!oc) { buckets.noBldg.push({ card: c.name || c.id, bid }); continue }
  const m = nearest(oc[0], oc[1])
  const row = { card: c.name || c.id, bid, newId: m.id, dist: Math.round(m.dist) }
  if (m.dist <= CLEAN) buckets.clean.push(row)
  else if (m.dist <= OK) buckets.ok.push(row)
  else buckets.far.push(row)
}

console.log(`\n═══ LS CONTENT CROSSWALK — 87 place cards, bldg- → msbf- ═══\n`)
console.log(`old LS buildings with geometry: ${oldCentroids.size} · new (staging) buildings: ${newPts.length}\n`)
console.log(`  ✅ clean  (≤${CLEAN} m): ${buckets.clean.length}`)
console.log(`  ⚠️ ok     (≤${OK} m): ${buckets.ok.length}   — re-anchors, worth a glance`)
console.log(`  ❌ far    (>${OK} m): ${buckets.far.length}   — suspect: building split/merged/missing in MSBF`)
console.log(`  ⛔ no such bldg-:      ${buckets.noBldg.length}   — card anchored to an id not in src/data/buildings`)
console.log(`\n  → ${buckets.clean.length + buckets.ok.length}/${cards.length} re-anchor automatically; ${buckets.far.length + buckets.noBldg.length} need a hand.\n`)

if (buckets.far.length) {
  console.log('FAR (needs review):')
  for (const r of buckets.far.sort((a, z) => z.dist - a.dist)) console.log(`  ${r.dist} m  "${r.card}"  ${r.bid} → ${r.newId}`)
}
if (buckets.noBldg.length) {
  console.log('\nNO SUCH BLDG (card anchor not found):')
  for (const r of buckets.noBldg) console.log(`  "${r.card}"  ${r.bid}`)
}
