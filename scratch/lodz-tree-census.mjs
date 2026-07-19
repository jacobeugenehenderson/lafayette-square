/**
 * lodz-tree-census.mjs — build Księży Młyn's tree placements from the City of
 * Łódź LiDAR canopy layer (Drzewa_LIDAR), the "real info we can find".
 *
 * REAL: position (projected to the scene frame), height (wysokosc), crown
 *   (szerokosc), and conifer/deciduous (KATEGORIA) — all ground-truth LiDAR.
 * GENERALIZABLE: the layer has NO species, so we assign one from a Łódź palette
 *   distribution, SPLIT by the conifer/deciduous flag (conifers never get an oak).
 *
 * Writes cartograph/data/ksi-y-m-yn/clean/park_trees.json — the per-hood census
 * layer treeBakeInputsForScene() reads. Species NAMES here are the keys the
 * scene's tree-species-map.json (the roster) routes to authored compositions.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const SCENE = 'ksi-y-m-yn'
const ROOT = process.cwd()
const BBOX = { minLon: 19.462, minLat: 51.746, maxLon: 19.492, maxLat: 51.760 }
const LAYER = 'https://services7.arcgis.com/j0TpvH0UvUCHgETm/ArcGIS/rest/services/Drzewa_LIDAR/FeatureServer/0/query'

// Łódź palette distributions (generalizable; lipa/klon/dąb dominate the avenues).
// Weights are relative. Names are the species-map keys (the roster routes them).
const DECIDUOUS = [
  ['Linden, Littleleaf', 30],   // lipa/Tilia cordata — the signature Łódź avenue tree
  ['Maple, Norway',      20],   // klon/Acer platanoides
  ['Oak, English',       15],   // dąb/Quercus robur
  ['Plane, London',       8],   // platan/Platanus
  ['Birch',               7],   // brzoza/Betula
  ['Horse Chestnut',      7],   // kasztanowiec/Aesculus — NEW roster entry
  ['Hornbeam',            5],   // grab/Carpinus
  ['Black Locust',        4],   // robinia/Robinia pseudoacacia — NEW roster entry
  ['Ash',                 2],   // jesion/Fraxinus
  ['Hawthorn',            2],   // głóg/Crataegus (ornamental)
]
const CONIFER = [
  ['Spruce, Norway', 60],       // świerk/Picea abies
  ['Thuja',          25],       // żywotnik/Thuja occidentalis
  ['Larch',          15],       // modrzew/Larix decidua
]

// Deterministic PRNG (no Math.random — reproducible census). Mulberry32 seeded
// per-tree by rounded position, so a re-run assigns the same species to the same tree.
function rng(seed) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6D2B79F5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
function pick(dist, r) {
  const total = dist.reduce((s, [, w]) => s + w, 0)
  let x = r * total
  for (const [name, w] of dist) { if ((x -= w) <= 0) return name }
  return dist[0][0]
}

async function fetchPage(offset) {
  const p = new URLSearchParams({
    where: '1=1',
    geometry: `${BBOX.minLon},${BBOX.minLat},${BBOX.maxLon},${BBOX.maxLat}`,
    geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'wysokosc,szerokosc,KATEGORIA',
    f: 'geojson', resultRecordCount: '2000', resultOffset: String(offset),
  })
  const res = await fetch(`${LAYER}?${p}`)
  if (!res.ok) throw new Error(`ArcGIS ${res.status}`)
  return res.json()
}

async function main() {
  const g = JSON.parse(readFileSync(join(ROOT, 'cartograph', 'data', SCENE, 'geography.json'), 'utf-8'))
  const toLocal = (lon, lat) => [
    Math.round((lon - g.lon) * g.lonToMeters * 10) / 10,
    Math.round((g.lat - lat) * g.latToMeters * 10) / 10,
  ]

  const feats = []
  for (let off = 0; off < 20000; off += 2000) {
    const j = await fetchPage(off)
    const f = j.features || []
    feats.push(...f)
    process.stdout.write(`  fetched ${feats.length} (page @${off}, +${f.length})\n`)
    if (f.length < 2000) break
  }

  let conifers = 0
  const trees = []
  for (const ft of feats) {
    const c = ft.geometry?.coordinates
    if (!c || c.length < 2) continue
    const [lon, lat] = c
    const a = ft.properties || {}
    const isConifer = /iglast/i.test(a.KATEGORIA || '')   // "drzewo iglaste"
    if (isConifer) conifers++
    const [x, z] = toLocal(lon, lat)
    const r = rng(Math.round((x + 5000) * 7 + (z + 5000) * 131))
    const species = isConifer ? pick(CONIFER, r()) : pick(DECIDUOUS, r())
    const h = Number(a.wysokosc) || 0
    const crown = Number(a.szerokosc) || 0
    // dbh proxy from LiDAR height (real trunk dia. unmeasured): ~height/22 in m → cm-ish,
    // floored so saplings still read. LS park_trees dbh values are small integers.
    const dbh = Math.max(1, Math.round(h / 1.2))
    trees.push({
      x, z, species,
      shape: isConifer ? 'conifer' : 'broad',
      dbh,
      height: Math.round(h * 10) / 10,
      crown: Math.round(crown * 10) / 10,
      condition: 'Fair',
      source: 'lodz_lidar',
    })
  }

  const out = join(ROOT, 'cartograph', 'data', SCENE, 'clean', 'park_trees.json')
  // ⚠️ bake-trees reads `layer.trees` — the census MUST be {meta,trees:[...]},
  // NOT a bare array (a bare array loads as 0 placements, silently).
  writeFileSync(out, JSON.stringify({ meta: { source: 'lodz_drzewa_lidar', scene: SCENE }, trees }))
  console.log(`\n  → ${out}`)
  console.log(`  ${trees.length} trees  (${conifers} conifer / ${trees.length - conifers} deciduous)`)
  // species tally
  const tally = {}
  for (const t of trees) tally[t.species] = (tally[t.species] || 0) + 1
  console.log('  species:', Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', '))
}
main().catch(e => { console.error(e); process.exit(1) })
