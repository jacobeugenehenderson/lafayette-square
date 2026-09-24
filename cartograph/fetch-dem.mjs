#!/usr/bin/env node
/**
 * fetch-dem.mjs — ACQUIRE THE TOWN'S DEM RASTER, like any other input.
 *
 * ⛔⛔ NOT `cartograph/elevation.js`, AND THE DIFFERENCE IS THE WHOLE POINT — a coordinator
 * already misread one for the other, which is why the name changed. Two jobs, two
 * resolutions, both needed:
 *   · elevation.js — the USGS EPQS POINT QUERY service on a ~55 m grid (GRID_STEP 0.0005°),
 *     interpolated per vertex. Gives every BUILDING its `b.elev`. ⛔ It cannot make a dune:
 *     there is no dune inside a 55 m sample.
 *   · THIS FILE — the 1 m lidar DEM raster. Finds which COG tiles cover the town and writes
 *     the list `bake-terrain.js` range-reads to build the heightfield. This is what relief
 *     comes from.
 *
 * ⭐⭐ RULED BY JACOB, 2026-09-23: "Terrain and lidar needs to be added to the fetch pour."
 *
 * ⛔⛔ WHY THIS DID NOT EXIST AND WHAT IT COST. Elevation was an ELECTIVE intake row with
 * NO acquisition step anywhere in the kit. huron has relief because a human once ran a
 * `curl` against the National Map products API by hand and pasted the result into
 * `raw/elevation-sources.txt` — the command survives only as a comment in that file's own
 * header. Provincetown has no relief because nobody did, and the pour said nothing: it
 * ran `pipeline.js --skip-elevation`, `bake-terrain` found no input, and the Bake listed
 * "terrain (no elevation.tif — flat)" in its skipped array. ⇒ A DUNE TOWN BAKED FLAT AND
 * THE ONLY RECORD WAS A LINE IN A SKIP LIST. That is the plausible-looking success Layer 0
 * forbids: the operator sees a poured town, not a missing input.
 *
 * ⭐ NOTHING IS DOWNLOADED. The list this writes is read by HTTP RANGE REQUEST in
 * `bake-terrain.js`, which pulls only the window it needs at the overview level matching
 * the grid. huron's four 1 m tiles are ~940 MB of source and cost a few MB to bake.
 *
 * ⛔ AND IT MUST FAIL LOUDLY WHEN THERE IS NO COVERAGE. 1 m lidar does not cover the whole
 * country, so "no DEM" is a real outcome, not an error case to paper over. It exits
 * non-zero and names every dataset it tried.
 *
 * ⭐⭐ AND "WE LOOKED AND THERE IS NONE" IS THE KIT'S OWN STATE, NOT A FLAG OF MINE. A first
 * cut invented `--accept-flat`. `intake-rows.mjs` already has the vocabulary — THREE states,
 * not two (`BRIEF §2.2d`): filled · empty (never looked) · VERIFIED_ABSENT (searched,
 * nothing exists). So a refusal writes the town's own `intake.json` mark,
 * `rows.elevation.verifiedAbsent`, which the Extent panel renders like every other verified
 * absence. ⛔ A fourth concept would have buried that fact in a comment only I would read.
 *
 *   node cartograph/fetch-dem.mjs --scene=<id> [--dry]
 * Writes cartograph/data/<scene>/raw/elevation-sources.txt. Reads raw/osm.json for the bbox.
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeIfChanged } from './io.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://tnmaccess.nationalmap.gov/api/v1/products'

/**
 * ⭐ THE LADDER, BEST FIRST. Each entry is a National Map dataset name, verbatim as the
 * API expects it. ⛔ Resolution is not a preference here — a dune is a metre-scale
 * feature, so 1 m lidar is the only thing that renders one honestly, and everything below
 * it is a documented compromise rather than an equal choice.
 */
export const DEM_LADDER = [
  { name: 'Digital Elevation Model (DEM) 1 meter', gsd: '1 m', note: 'USGS 3DEP 1 m lidar-derived DEM — what a dune needs' },
  { name: 'National Elevation Dataset (NED) 1/9 arc-second', gsd: '~3 m', note: 'coarser; hills yes, dunes no' },
  { name: 'National Elevation Dataset (NED) 1/3 arc-second', gsd: '~10 m', note: 'regional relief only' },
]

const arg = (k, d = null) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : (process.argv.includes(`--${k}`) ? true : d)
}

/** Query one dataset. Returns the items whose own bbox intersects the town's. */
export async function tnmProducts(datasetName, bbox, { max = 100, fetcher = fetch } = {}) {
  const url = `${API}?datasets=${encodeURIComponent(datasetName)}` +
              `&bbox=${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}&max=${max}`
  const r = await fetcher(url)
  if (!r.ok) throw new Error(`TNM ${datasetName}: HTTP ${r.status}`)
  const j = await r.json()
  const items = (j.items || []).filter(it => {
    const b = it.boundingBox
    // ⛔ The API is generous at the edges; keep only what actually overlaps, or a town
    // inherits tiles from the next county and the bake reads a window of nothing.
    return !b || !(b.maxX < bbox.minLon || b.minX > bbox.maxLon || b.maxY < bbox.minLat || b.minY > bbox.maxLat)
  })
  return { total: j.total ?? items.length, items, url }
}

/**
 * ⭐⭐ ONE SURVEY, NOT A MOSAIC OF VINTAGES — and Provincetown is why this exists.
 * Its 15 one-metre tiles come from THREE different projects: MA_CentralEastern_2021_B21,
 * MA_NE_CMGP_Sandy_Z19_2013 and MA_NE_CMGP_Sandy_Z19_A3_2015. ⛔ Mosaicking those would
 * butt a 2013 survey against a 2021 one along a tile edge, and on a DUNE COAST the sand
 * has genuinely moved between them — so the seam is not a registration error to smooth
 * away, it is two different true shorelines. It would read as a cliff across the beach.
 * huron never exposed this: its four tiles are all one project.
 * ⇒ Group by project, take the one that covers the most of the town, break ties by the
 * newest publication. ⛔ The rejected projects are REPORTED, not silently dropped — a
 * town whose best survey covers 60% of it is a fact the operator should see.
 */
export function bestProject(items, bbox) {
  const byProject = new Map()
  for (const it of items) {
    const m = /\/Projects\/([^/]+)\//.exec(it.downloadURL || '')
    const key = m ? m[1] : (it.sourceName || 'unknown')
    if (!byProject.has(key)) byProject.set(key, [])
    byProject.get(key).push(it)
  }
  const townArea = Math.max(1e-12, (bbox.maxLon - bbox.minLon) * (bbox.maxLat - bbox.minLat))
  const scored = [...byProject.entries()].map(([project, tiles]) => {
    // Coverage by union of tile bboxes, sampled on a coarse grid — exact polygon union is
    // not worth it to choose between two surveys, and a grid cannot silently overcount.
    const N = 40
    let hit = 0
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const lon = bbox.minLon + ((i + 0.5) / N) * (bbox.maxLon - bbox.minLon)
      const lat = bbox.minLat + ((j + 0.5) / N) * (bbox.maxLat - bbox.minLat)
      if (tiles.some(t => t.boundingBox && lon >= t.boundingBox.minX && lon <= t.boundingBox.maxX
                       && lat >= t.boundingBox.minY && lat <= t.boundingBox.maxY)) hit++
    }
    const newest = tiles.map(t => t.publicationDate || '').sort().at(-1) || ''
    return { project, tiles, coverage: hit / (N * N), newest }
  })
  scored.sort((a, b) => (b.coverage - a.coverage) || (a.newest < b.newest ? 1 : -1))
  return scored
}

/** The whole ladder, stopping at the first dataset with coverage. */
export async function findDem(bbox, opts = {}) {
  const tried = []
  for (const rung of DEM_LADDER) {
    let res
    try { res = await tnmProducts(rung.name, bbox, opts) }
    catch (e) { tried.push({ ...rung, error: e.message, n: 0 }); continue }
    tried.push({ ...rung, n: res.items.length, url: res.url })
    if (res.items.length) {
      const scored = bestProject(res.items, bbox)
      return { rung, items: scored[0].tiles, projects: scored, tried, queryUrl: res.url }
    }
  }
  return { rung: null, items: [], tried }
}

function render({ scene, bbox, rung, items, tried, projects = [] }) {
  const L = []
  if (rung) {
    L.push(`# ${scene} — ${rung.note}`)
    const best = projects[0]
    L.push(`# dataset: ${rung.name} (${rung.gsd}) · ${items.length} tile(s), ONE survey: ${best?.project ?? '?'}`)
    if (best) L.push(`# covers ${(100 * best.coverage).toFixed(0)}% of the town's bbox · newest tile ${best.newest || '?'}`)
    if (projects.length > 1) {
      L.push(`# ⛔ ${projects.length - 1} other survey(s) overlap this town and were NOT mixed in — butting`)
      L.push(`#    two vintages together seams where the ground genuinely changed between them:`)
      for (const p of projects.slice(1)) L.push(`#      ${p.project} — ${p.tiles.length} tile(s), ${(100 * p.coverage).toFixed(0)}% coverage, ${p.newest || '?'}`)
    }
    L.push(`# Acquired by cartograph/fetch-dem.mjs. Read by HTTP RANGE REQUEST in`)
    L.push(`# bake-terrain.js: nothing is downloaded, only the window the grid needs.`)
    L.push(`# ⛔ Re-derive rather than trusting this list — the count here has been wrong before:`)
    L.push(`#   node cartograph/fetch-dem.mjs --scene=${scene}`)
    for (const it of items) L.push(it.downloadURL)
  } else {
    // ⛔ A FILE THAT SAYS WHY IT IS EMPTY. An absent file is indistinguishable from a
    // town nobody has poured; a file recording the refusal is evidence.
    L.push(`# ${scene} — NO DEM COVERAGE FOUND. This town has no terrain.`)
    L.push(`# bbox ${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`)
    for (const t of tried) L.push(`#   tried ${t.name} (${t.gsd}) → ${t.error ? 'ERROR ' + t.error : t.n + ' tiles'}`)
    L.push(`# ⭐ Recorded as verified-absent in this town's intake.json — searched, nothing`)
    L.push(`# exists. That is the kit's THIRD state and it is INFORMATION: without it the next`)
    L.push(`# operator re-spends the hours rediscovering that this town has no DEM.`)
  }
  return L.join('\n') + '\n'
}

const mapDirOf = (scene) => join(ROOT, 'cartograph', 'data', scene)

/**
 * ⭐ MERGE into the town's overlay, never replace it. `intake.json` holds EVERY row's
 * provenance; writing ours wholesale would silently drop the rest. ⛔ A malformed existing
 * file is reported and left alone rather than clobbered — losing another row's recorded
 * provenance to fix ours is a bad trade.
 */
function markVerifiedAbsent(scene, tried) {
  const p = join(mapDirOf(scene), 'intake.json')
  let doc = { rows: {} }
  if (existsSync(p)) {
    try { doc = JSON.parse(readFileSync(p, 'utf8')) || { rows: {} } }
    catch { console.error(`  ⚠️ ${p} is malformed — NOT overwriting it. Record the absence by hand.`); return }
  }
  doc.rows = doc.rows || {}
  doc.rows.elevation = {
    ...(doc.rows.elevation || {}),
    verifiedAbsent: true,
    verifiedOn: new Date().toISOString().slice(0, 10),
    verifiedBy: 'cartograph/fetch-dem.mjs',
    note: `no coverage on the National Map: ${tried.map(t => `${t.name} → ${t.error ? 'ERROR' : t.n + ' tiles'}`).join(' · ')}`,
  }
  mkdirSync(mapDirOf(scene), { recursive: true })
  writeIfChanged(p, JSON.stringify(doc, null, 2) + '\n')
}

async function main() {
  const scene = arg('scene')
  if (!scene) { console.error('fetch-dem: --scene=<id> is required'); process.exit(2) }
  const rawDir = join(ROOT, 'cartograph', 'data', scene, 'raw')
  const osmPath = join(rawDir, 'osm.json')
  if (!existsSync(osmPath)) { console.error(`fetch-dem: ${scene} has no raw/osm.json — fetch the town first`); process.exit(2) }
  // ⭐ The bbox comes from the fetch's own output, so the DEM covers exactly what was
  // acquired. Deriving it a second way is how two frames disagree.
  const bbox = JSON.parse(readFileSync(osmPath, 'utf8')).bbox
  if (!bbox) { console.error(`fetch-dem: ${scene}'s raw/osm.json has no bbox`); process.exit(2) }

  console.log(`[fetch-dem] ${scene}  bbox ${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`)
  const { rung, items, tried, projects } = await findDem(bbox)
  for (const t of tried) console.log(`    ${t.n ? '✅' : '⛔'} ${t.name} (${t.gsd}) → ${t.error ? 'ERROR ' + t.error : t.n + ' tile(s)'}`)

  const body = render({ scene, bbox, rung, items, tried, projects })
  const outPath = join(rawDir, 'elevation-sources.txt')
  if (arg('dry')) { console.log('\n--dry, would write:\n' + body); return }
  mkdirSync(rawDir, { recursive: true })
  writeIfChanged(outPath, body)

  if (!rung) {
    // ⭐ Record the search in the town's own overlay, so "we looked and there is none" is a
    // STATE the panel shows rather than a sentence in a file nobody opens.
    markVerifiedAbsent(scene, tried)
    console.error(`\n⛔ NO DEM COVERAGE for ${scene}. Every dataset on the ladder came back empty.`)
    console.error(`   Recorded verified-absent in ${join(mapDirOf(scene), 'intake.json')} — the kit's`)
    console.error(`   third state: searched, nothing exists, do not search again.`)
    console.error(`   ⛔ This town bakes FLAT, and a flat town that looks poured is worse than one`)
    console.error(`      that refuses to pour. The pour must treat this as a decision, not a default.`)
    process.exit(1)
  }
  for (const p of (projects || [])) console.log(`    ${p === projects[0] ? '→ CHOSEN' : '  skipped'}  ${p.project}  ${p.tiles.length} tile(s)  ${(100 * p.coverage).toFixed(0)}% coverage  ${p.newest || '?'}`)
  console.log(`\n✅ ${items.length} tile(s), ${rung.name} (${rung.gsd}), one survey → ${outPath}`)
  console.log(`   Nothing downloaded; bake-terrain range-reads them.`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1) })
