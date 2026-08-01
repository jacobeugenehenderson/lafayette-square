/**
 * lu-provenance-census.mjs — WHERE does each block face's land use come from?
 *
 * BRIEF-land-use-derivation.md §5 step 1, done properly. The brief's harness
 * measured the wrong stage: it assumed `luForRing` tests a tile against PARCEL
 * faces and falls to `pickLuFromHash` when the probe misses. It does not —
 * `faceList` is `ribbons.faces`, which derive.js walks from the SAME centreline
 * graph as `ribbons.tiles`, so face and tile are co-topological and the probe
 * essentially always hits (measured: `scratch/invented-lu-census.mjs`).
 *
 * The invention is one stage UPSTREAM, inside derive.js's `faceFills` loop
 * (derive.js:2952-2999). Its ladder is:
 *
 *     1. OSM landuse/leisure/natural/amenity vote by area   ← DATA
 *     2. parcel majority via classifyLandUse()              ← DATA (city-coded)
 *     3. `use = 'residential'`                              ← INVENTED (a constant)
 *
 * and rung 2 has its own invention inside it: `classifyLandUse` (derive.js:691)
 * ends `return 'residential'` for any code outside the City's 4-digit ranges —
 * which is EVERY St. Louis County 3-digit code.
 *
 * ⭐ KIT: this is a per-scene detector, not an LS report. Point it at a town
 * nobody has looked at and it says what fraction of that town's land use is a
 * constant wearing data's clothes. Rung 3 is exactly the `CLAUDE.md` Layer 0
 * fallback shape — a failure rendered as a plausible success.
 *
 * Read-only. Reconstructs derive.js's ladder from the shipped artifacts + raw
 * inputs; it pours nothing and writes nothing.
 *
 * Usage:  node scratch/lu-provenance-census.mjs [scene ...]
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function pointInRing(px, py, r) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0] ?? r[i].x, yi = r[i][1] ?? r[i].z
    const xj = r[j][0] ?? r[j].x, yj = r[j][1] ?? r[j].z
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
function ringArea(coords) {
  let a = 0
  for (let i = 0; i < coords.length; i++) {
    const p = coords[i], q = coords[(i + 1) % coords.length]
    a += (p.x ?? p[0]) * (q.z ?? q[1]) - (q.x ?? q[0]) * (p.z ?? p[1])
  }
  return Math.abs(a / 2)
}

// ── verbatim from derive.js:691 — the CITY-ONLY mapper ──────────────────────
function classifyLandUse(code) {
  if (!code) return 'unknown'
  const c = Number(code)
  if (c >= 1010 && c <= 1019) return 'vacant'
  if (c >= 1100 && c <= 1199) return 'residential'
  if (c >= 1300 && c <= 1399) return 'institutional'
  if (c === 3000 || c === 3300 || c === 3900) return 'vacant-commercial'
  if (c >= 4000 && c <= 4999) return 'recreation'
  if (c >= 5000 && c <= 5999) return 'commercial'
  if (c >= 6000 && c <= 6999) return 'institutional'
  if (c >= 7000 && c <= 7999) return 'industrial'
  if (c === 1185) return 'parking'
  return 'residential'          // ← the catch-all. Every County 3-digit code lands here.
}
/** Did the code MATCH a rule, or fall through to the catch-all? */
function codeMatched(code) {
  if (!code) return true                       // → 'unknown', an honest bucket
  const c = Number(code)
  return (c >= 1010 && c <= 1019) || (c >= 1100 && c <= 1199) || (c >= 1300 && c <= 1399) ||
         c === 3000 || c === 3300 || c === 3900 || (c >= 4000 && c <= 4999) ||
         (c >= 5000 && c <= 5999) || (c >= 6000 && c <= 6999) || (c >= 7000 && c <= 7999) ||
         c === 1185
}

// ── verbatim from derive.js:2905 ────────────────────────────────────────────
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

const ribbonsPathFor = (s) => s === 'lafayette-square'
  ? join(ROOT, 'src', 'data', 'ribbons.json')
  : join(ROOT, 'cartograph', 'data', s, 'clean', 'ribbons.json')
const rawDir = (s) => join(ROOT, 'cartograph', 'data', s, 'raw')

function loadParcels(scene) {
  // BOTH files, jurisdiction-tagged — the same pair bake-content.js:141 reads.
  // derive.js reads only the first; that asymmetry is the point of the census.
  const out = []
  for (const [file, jur] of [['stl_parcels.json', 'city'], ['stlco_parcels.json', 'county']]) {
    const p = join(rawDir(scene), file)
    if (!existsSync(p)) continue
    const j = JSON.parse(readFileSync(p, 'utf8'))
    for (const par of Object.values(j.parcels || {})) out.push({ ...par, _jur: jur })
  }
  return out
}

function osmLUPolys(scene) {
  const p = join(rawDir(scene), 'osm.json')
  if (!existsSync(p)) return []
  const osmData = JSON.parse(readFileSync(p, 'utf8'))
  const out = []
  for (const [cat, key] of [['landuse', 'landuse'], ['leisure', 'leisure'], ['natural', 'natural'], ['amenity', 'amenity']]) {
    for (const f of (osmData.ground?.[cat] || [])) {
      const subtype = f.tags?.[key]
      if (!subtype) continue
      const lu = OSM_TO_LU[`${cat}:${subtype}`]
      if (!lu) continue
      if (!f.coords || f.coords.length < 3) continue
      let sx = 0, sz = 0
      for (const q of f.coords) { sx += q.x; sz += q.z }
      out.push({ lu, cx: sx / f.coords.length, cz: sz / f.coords.length, area: ringArea(f.coords) })
    }
  }
  return out
}

function census(scene) {
  const rp = ribbonsPathFor(scene)
  if (!existsSync(rp)) return null
  const faces = (JSON.parse(readFileSync(rp, 'utf8')).faces || []).filter(f => f?.ring?.length >= 3 && f.use)

  // POST-FIX artifacts name the gap themselves: derive.js emits `underived` for
  // a face no OSM polygon and no parcel could classify. When the artifact
  // carries that class we report it straight — no reconstruction needed, and
  // the reconstruction below would MISREAD such an artifact anyway (it models
  // the old city-only ladder). A pour with zero `underived` faces is either
  // pre-fix or genuinely fully derived; the reconstruction distinguishes them.
  let underivedN = 0, underivedA = 0, totalA = 0
  for (const f of faces) {
    const a = ringArea(f.ring); totalA += a
    if (f.use === 'underived') { underivedN++; underivedA += a }
  }
  const named = underivedN > 0
  const osmPolys = osmLUPolys(scene)
  const parcels = loadParcels(scene)

  // ── parcel-code health: how many parcels does the CITY-ONLY mapper flunk? ──
  let cityP = 0, countyP = 0, fellThrough = 0, fellThroughCounty = 0
  for (const p of parcels) {
    if (p._jur === 'city') cityP++; else countyP++
    if (!codeMatched(p.land_use_code)) { fellThrough++; if (p._jur === 'county') fellThroughCounty++ }
  }

  // ── face provenance: rebuild derive.js's ladder over each face ─────────────
  // City parcels only — derive.js reads only stl_parcels.json, so a
  // county-only scene half sees zero parcels no matter how many are on disk.
  const derivedParcels = parcels.filter(p => p._jur === 'city')
  let osmN = 0, parcelN = 0, defaultN = 0, otherN = 0
  let osmA = 0, parcelA = 0, defaultA = 0, otherA = 0
  const bigDefaults = []

  for (const face of faces) {
    const ring = face.ring
    const area = ringArea(ring)

    const osmAreas = {}
    for (const o of osmPolys) {
      if (!pointInRing(o.cx, o.cz, ring)) continue
      osmAreas[o.lu] = (osmAreas[o.lu] || 0) + o.area
    }
    let bestLU = null, bestArea = 0
    for (const [u, a] of Object.entries(osmAreas)) if (a > bestArea) { bestArea = a; bestLU = u }

    if (bestLU) { osmN++; osmA += area; continue }

    // parcel majority — a parcel joins a face by centroid OR any ring vertex
    let hits = 0
    for (const p of derivedParcels) {
      let inside = false
      if (p.centroid && pointInRing(p.centroid[0], p.centroid[1], ring)) inside = true
      else if (p.rings?.[0]) { for (const pt of p.rings[0]) if (pointInRing(pt[0], pt[1], ring)) { inside = true; break } }
      if (inside) hits++
    }
    if (hits > 0) { parcelN++; parcelA += area; continue }

    // no OSM polygon, no parcel. derive.js writes 'residential' if this face
    // was type 'block'; a park/island/parking/unknown face keeps its type.
    if (face.use === 'residential') { defaultN++; defaultA += area; bigDefaults.push(area) }
    else { otherN++; otherA += area }
  }

  const reconA = osmA + parcelA + defaultA + otherA
  return {
    scene, faces: faces.length, named,
    underivedN, pctUnderivedFaces: faces.length ? 100 * underivedN / faces.length : 0,
    pctUnderivedArea: totalA ? 100 * underivedA / totalA : 0,
    osmN, parcelN, defaultN, otherN,
    pctDefaultFaces: faces.length ? 100 * defaultN / faces.length : 0,
    pctDefaultArea: reconA ? 100 * defaultA / reconA : 0,
    cityP, countyP, fellThrough, fellThroughCounty,
    bigDefaults: bigDefaults.sort((a, b) => b - a).slice(0, 3),
  }
}

const all = readdirSync(join(ROOT, 'cartograph', 'data'), { withFileTypes: true })
  .filter(d => d.isDirectory() && !['clean', 'raw'].includes(d.name)).map(d => d.name)
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : all

console.log('\n  LAND-USE PROVENANCE — how each block face actually got its class\n')
for (const s of scenes) {
  const r = census(s)
  if (!r) { console.log(`  ${s}: no ribbons.json`); continue }
  console.log(`  ── ${r.scene} ──  ${r.faces} faces`)
  if (r.named) {
    // Post-fix artifact — derive.js labelled the gap, so this is measured, not inferred.
    console.log(`     ✅ POST-FIX artifact — derive.js names its own gaps`)
    console.log(`     🕳  underived              ${String(r.underivedN).padStart(4)}   ${r.pctUnderivedFaces.toFixed(1)}% of faces · ${r.pctUnderivedArea.toFixed(1)}% of area   ← honestly unknown`)
    console.log(`     ·  everything else        ${String(r.faces - r.underivedN).padStart(4)}   derived from OSM or assessor parcels`)
  } else {
    console.log(`     ⚠️  PRE-FIX artifact — no 'underived' class present; reconstructing the old ladder`)
    console.log(`     🛰  OSM polygon vote        ${String(r.osmN).padStart(4)}`)
    console.log(`     📄 parcel majority (city)  ${String(r.parcelN).padStart(4)}`)
    console.log(`     🎲 bare 'residential'      ${String(r.defaultN).padStart(4)}   ${r.pctDefaultFaces.toFixed(1)}% of faces · ${r.pctDefaultArea.toFixed(1)}% of area   ← INVENTED`)
    console.log(`     ·  non-block face types    ${String(r.otherN).padStart(4)}   (park / island / parking / unknown — kept from face.type)`)
    if (r.bigDefaults.length) console.log(`        largest invented faces: ${r.bigDefaults.map(a => Math.round(a).toLocaleString() + ' m²').join(' · ')}`)
  }
  if (r.cityP + r.countyP > 0) {
    console.log(`     parcels on disk: ${r.cityP} city + ${r.countyP} county`)
    // Both numbers describe the RETIRED city-only mapper, and they are the
    // reason it was retired — kept as the standing before-measurement, not as a
    // claim about today's code. derive.js now reads both files jurisdiction-
    // tagged through parcel-landuse.mjs (no catch-all).
    if (r.countyP) console.log(`     ⓘ  historical: the retired city-only reader never opened those ${r.countyP} county parcels`)
    console.log(`     ⓘ  historical: ${r.fellThrough} code(s) (${r.fellThroughCounty} county) would flunk the retired city-only mapper to 'residential'`)
  } else {
    console.log(`     parcels on disk: none (no wired assessor — OSM is the only data rung)`)
  }
  console.log('')
}
