/**
 * unknown-face-forensic.mjs — why is a face typed `unknown`, and what would it
 * have been if it weren't?
 *
 * The question Jacob asked on the HPDM eye-gate: the verdant greenbelt is still
 * grey. `unknown` is the largest non-park class in the slab and lu-policy.mjs
 * ratifies it HARD, so the tempting read is "flip unknown to soft." This harness
 * exists to test that read before anyone acts on it.
 *
 * THE MECHANISM (cartograph/classify.js):
 *
 *   :57  every OSM overlay polygon starts `let type = 'unknown'`
 *   :60  four branches can rename it: park / parking / water / block
 *   :86  a face whose CENTROID lands in an overlay inherits that overlay's type
 *        — and `break`s on the FIRST match, with no preference for the smallest
 *        or largest containing polygon
 *   :94  ONLY a face matching NO overlay reaches the size fallback, where
 *        absArea > 500 makes it a `block`
 *
 * ⭐ THE CONSEQUENCE, and it is the whole finding: an OSM polygon carrying a tag
 * the kit does not recognize is STRICTLY WORSE THAN NO POLYGON AT ALL. With no
 * overlay the face falls through to `block` and the land-use ladder runs on it
 * (OSM vote → parcel majority). With an unreadable overlay the face is typed
 * `unknown`, the ladder is SKIPPED entirely (`derive.js`: `if (face.type ===
 * 'block')`), and it paints hardscape. The richer the OSM data, the worse the
 * map — which is the inverse of what the pipeline promises.
 *
 * So `unknown` is not "we looked and found nothing." It is "we found something
 * and could not read it," wearing the same label. This harness separates those.
 *
 * For each `unknown` face it reports:
 *   - the overlay that hijacked it, with the tags that made it unreadable
 *   - what the land-use ladder WOULD have said had the face been typed `block`
 *     (the same OSM vote → parcel majority derive.js runs, both jurisdictions)
 *
 * Read-only. Pours nothing.
 *
 * Usage:  node --max-old-space-size=8192 scratch/unknown-face-forensic.mjs [scene]
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyParcelLandUse, loadCountyCodeTable, UNDERIVED } from '../cartograph/parcel-landuse.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scene = process.argv[2] || 'hipointe-demun'

const ribbonsPath = scene === 'lafayette-square'
  ? join(ROOT, 'src', 'data', 'ribbons.json')
  : join(ROOT, 'cartograph', 'data', scene, 'clean', 'ribbons.json')
const rawDir = join(ROOT, 'cartograph', 'data', scene, 'raw')

function pir(px, pz, ring) {
  let ins = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0] ?? ring[i].x, zi = ring[i][1] ?? ring[i].z
    const xj = ring[j][0] ?? ring[j].x, zj = ring[j][1] ?? ring[j].z
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) ins = !ins
  }
  return ins
}
function ar(c) {
  let a = 0
  for (let i = 0; i < c.length; i++) { const p = c[i], q = c[(i + 1) % c.length]; a += (p.x ?? p[0]) * (q.z ?? q[1]) - (q.x ?? q[0]) * (p.z ?? p[1]) }
  return Math.abs(a / 2)
}
const centroid = (ring) => {
  let x = 0, z = 0
  for (const p of ring) { x += (p[0] ?? p.x); z += (p[1] ?? p.z) }
  return [x / ring.length, z / ring.length]
}

// verbatim from derive.js
const OSM_TO_LU = {
  'landuse:retail': 'commercial', 'landuse:commercial': 'commercial',
  'landuse:residential': 'residential', 'landuse:industrial': 'industrial',
  'landuse:religious': 'institutional',
  'landuse:grass': 'recreation', 'landuse:recreation_ground': 'recreation',
  'landuse:allotments': 'recreation', 'landuse:construction': 'vacant',
  'leisure:garden': 'recreation', 'leisure:playground': 'recreation',
  'leisure:swimming_pool': 'recreation', 'leisure:pitch': 'recreation',
  'leisure:sports_centre': 'recreation',
  'natural:wood': 'recreation', 'natural:scrub': 'recreation', 'natural:tree_row': 'recreation',
  'amenity:school': 'institutional', 'amenity:place_of_worship': 'institutional',
  'amenity:library': 'institutional', 'amenity:university': 'institutional',
  'amenity:fire_station': 'institutional', 'amenity:crematorium': 'institutional',
  'amenity:fuel': 'commercial', 'amenity:cafe': 'commercial',
  'amenity:bar': 'commercial', 'amenity:restaurant': 'commercial',
  'amenity:fast_food': 'commercial', 'amenity:veterinary': 'commercial',
  'amenity:charging_station': 'commercial', 'amenity:parking': 'parking',
  'amenity:waste_disposal': 'industrial',
}
// verbatim from classify.js:60-69 — the four branches that can rename an overlay
function overlayType(tags) {
  if (tags.leisure === 'park' || tags.leisure === 'garden' ||
      tags.landuse === 'grass' || tags.landuse === 'recreation_ground') return 'park'
  if (tags.amenity === 'parking' || tags.landuse === 'parking') return 'parking'
  if (tags.natural === 'water' || tags.waterway) return 'water'
  if (['residential', 'commercial', 'retail', 'industrial', 'religious'].includes(tags.landuse)) return 'block'
  return 'unknown'
}

const ribbons = JSON.parse(readFileSync(ribbonsPath, 'utf8'))
const osm = JSON.parse(readFileSync(join(rawDir, 'osm.json'), 'utf8'))
const countyTable = loadCountyCodeTable(scene)

// every overlay classify.js would have built, in the same category order
const overlays = []
for (const cat of ['landuse', 'leisure', 'natural', 'amenity']) {
  for (const f of (osm.ground?.[cat] || [])) {
    if (!f.isClosed || !f.coords || f.coords.length < 4) continue
    overlays.push({ cat, tags: f.tags || {}, ring: f.coords, area: ar(f.coords), type: overlayType(f.tags || {}) })
  }
}
// the LU-vote polygons derive.js would use (only those OSM_TO_LU maps)
const luPolys = []
for (const [cat, key] of [['landuse', 'landuse'], ['leisure', 'leisure'], ['natural', 'natural'], ['amenity', 'amenity']]) {
  for (const f of (osm.ground?.[cat] || [])) {
    const sub = f.tags?.[key]; if (!sub) continue
    const lu = OSM_TO_LU[`${cat}:${sub}`]; if (!lu) continue
    if (!f.coords || f.coords.length < 3) continue
    const [cx, cz] = centroid(f.coords)
    luPolys.push({ lu, cx, cz, area: ar(f.coords) })
  }
}
// both parcel files, jurisdiction-tagged, as derive.js now loads them
const parcels = []
for (const [file, jur] of [['stl_parcels.json', 'city'], ['stlco_parcels.json', 'county']]) {
  const p = join(rawDir, file); if (!existsSync(p)) continue
  for (const par of Object.values(JSON.parse(readFileSync(p, 'utf8')).parcels || {})) parcels.push({ ...par, jurisdiction: jur })
}

/** derive.js's ladder, run as if this face had been typed `block`. */
function ladder(ring) {
  const osmAreas = {}
  for (const o of luPolys) { if (!pir(o.cx, o.cz, ring)) continue; osmAreas[o.lu] = (osmAreas[o.lu] || 0) + o.area }
  let best = null, bestA = 0
  for (const [u, a] of Object.entries(osmAreas)) if (a > bestA) { bestA = a; best = u }
  if (best) return { use: best, via: 'OSM vote' }
  const counts = {}
  let hits = 0
  for (const p of parcels) {
    let inside = false
    if (p.centroid && pir(p.centroid[0], p.centroid[1], ring)) inside = true
    else if (p.rings?.[0]) { for (const pt of p.rings[0]) if (pir(pt[0], pt[1], ring)) { inside = true; break } }
    if (!inside) continue
    hits++
    const u = classifyParcelLandUse(p.land_use_code, p.jurisdiction, countyTable) || UNDERIVED
    counts[u] = (counts[u] || 0) + 1
  }
  let bu = null, bc = 0
  for (const [u, c] of Object.entries(counts)) if (c > bc) { bc = c; bu = u }
  if (bu) return { use: bu, via: `parcel majority (${hits} parcels)` }
  return { use: UNDERIVED, via: 'no evidence' }
}

const faces = (ribbons.faces || []).filter(f => f?.ring?.length >= 3)
const unknowns = faces.map((f, i) => ({ i, f, a: ar(f.ring) })).filter(x => x.f.use === 'unknown').sort((a, b) => b.a - a.a)

console.log(`\n  UNKNOWN-FACE FORENSIC — ${scene}\n`)
console.log(`  ${unknowns.length} of ${faces.length} faces are typed 'unknown'  ·  ${Math.round(unknowns.reduce((s, x) => s + x.a, 0)).toLocaleString()} m²\n`)

let hijacked = 0, wouldDerive = 0
const wouldBe = {}
for (const { i, f, a } of unknowns) {
  const c = centroid(f.ring)
  let hit = null
  for (const ov of overlays) { if (pir(c[0], c[1], ov.ring)) { hit = ov; break } }   // FIRST match, as classify.js does
  const sim = ladder(f.ring)
  wouldBe[sim.use] = (wouldBe[sim.use] || 0) + a
  if (hit) hijacked++
  if (sim.use !== UNDERIVED) wouldDerive++
  const tagStr = hit ? Object.entries(hit.tags).filter(([k]) => !k.startsWith('tiger:') && !k.startsWith('addr:')).map(([k, v]) => `${k}=${v}`).join(' ').slice(0, 88) : '—'
  console.log(`  #${String(i).padStart(3)}  ${String(Math.round(a)).padStart(7)} m²`)
  console.log(`        hijacked by: ${hit ? `${hit.cat} (${Math.round(hit.area).toLocaleString()} m²)  ${tagStr}` : 'NOTHING — reached the size fallback'}`)
  console.log(`        ladder would say: ${sim.use}  (${sim.via})`)
}

console.log(`\n  ── summary ──`)
console.log(`  hijacked by an unreadable overlay : ${hijacked}/${unknowns.length}`)
console.log(`  would classify if typed 'block'   : ${wouldDerive}/${unknowns.length}`)
console.log(`\n  area by class the ladder WOULD have produced:`)
for (const [u, a] of Object.entries(wouldBe).sort((x, y) => y[1] - x[1])) {
  console.log(`     ${u.padEnd(15)} ${Math.round(a).toLocaleString().padStart(10)} m²`)
}
console.log('')
