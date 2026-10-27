#!/usr/bin/env node
/**
 * fetch-history.mjs — acquire a town's declared HISTORY wells that a tool must read (cartograph/sources.js
 * #readHistorySources) into data/<scene>/raw/.
 *
 *   CARTOGRAPH_SCENE=provincetown node cartograph/fetch-history.mjs --gdb=<MHC_Inventory_GDB.zip>            (write)
 *   CARTOGRAPH_SCENE=provincetown node cartograph/fetch-history.mjs --gdb=<MHC_Inventory_GDB.zip> --dry-run  (count, no write)
 *
 * ⭐ ONE READER TODAY, `mhc-gdb`: a state inventory shipped as an Esri file geodatabase (Massachusetts' MHC inventory,
 * cartograph/states/ma.mjs `history`). GDAL's `ogr2ogr` reads it inside its zip (`/vsizip/`), filters it to the town by the
 * well's `where`, and reprojects to WGS84; each record is written with its fields, lon/lat and local x/z.
 * ⛔ GDAL IS A SYSTEM TOOL, AND ITS ABSENCE FAILS THE FETCH LOUDLY — never a skipped well that reads as a town with no
 *    history. So does a missing geodatabase, a layer that is not there, and a town that selects zero records.
 * ⭐ The zip is LOCAL (references rule 3: copies stay out of git): `--gdb=<path>`, else the registry row's `localCopy`
 *    when it is on this machine. Neither → refused, naming where to download it.
 * Readers whose file is authored by hand (`nr-inventory`, `nomination-extract`) are not fetched; they are listed.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, mkdtempSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import { mapRawDir, SCENE, wgs84ToLocal } from './config.js'
import { requireExplicitMap } from './scene.js'
import { readHistorySources } from './sources.js'

requireExplicitMap('fetch-history')
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')
const arg = (k) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null }
const r2 = (v) => Math.round(v * 100) / 100, r7 = (v) => Math.round(v * 1e7) / 1e7
const blank = (v) => v == null || String(v).trim() === ''
const clean = (v) => (blank(v) ? null : String(v).trim())

/** GDAL must be on this machine. ⛔ Absent → throw, naming the install. */
export function requireOgr2ogr() {
  try { return execFileSync('ogr2ogr', ['--version'], { encoding: 'utf8' }).trim() }
  catch { throw new Error('ogr2ogr (GDAL) is not on this machine — the MHC well cannot be read. Install GDAL (macOS: `brew install gdal`) and re-run. ⛔ The well is not skipped.') }
}

function localGdb(well) {
  const given = arg('gdb')
  if (given) { if (!existsSync(given)) throw new Error(`[${well.id}] --gdb=${given} is not on disk`); return given }
  const reg = JSON.parse(readFileSync(join(ROOT, 'references/registry.json'), 'utf8')).sources.find(s => s.id === well.registry)
  const lc = typeof reg?.localCopy === 'string' ? reg.localCopy.split(' ')[0] : null
  if (lc && existsSync(lc)) return lc
  throw new Error(`[${well.id}] no local copy of ${well.gdb.zip}: pass --gdb=<path>. Download: ${well.gdb.download} (registry row ${well.registry})`)
}

function readMhcGdb(well) {
  const gdal = requireOgr2ogr()
  const zip = localGdb(well)
  if (!well.where) throw new Error(`[${well.id}] has no \`where\` — a statewide inventory must be selected to the town`)
  const tmp = mkdtempSync(join(tmpdir(), 'mhc-'))
  const out = join(tmp, 'out.geojson')
  try {
    execFileSync('ogr2ogr', ['-f', 'GeoJSON', '-t_srs', 'EPSG:4326', '-where', well.where, out,
      `/vsizip/${zip}/${well.gdb.dataset}`, well.gdb.layer], { stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (e) { rmSync(tmp, { recursive: true, force: true }); throw new Error(`[${well.id}] ogr2ogr failed on ${zip} ${well.gdb.layer}: ${String(e.stderr || e.message).trim()}`) }
  const fc = JSON.parse(readFileSync(out, 'utf8'))
  rmSync(tmp, { recursive: true, force: true })
  const records = []
  let noPoint = 0
  for (const f of fc.features || []) {
    const p = f.properties || {}
    const c = f.geometry?.type === 'Point' ? f.geometry.coordinates : null
    if (!c) { noPoint++; continue }
    const [x, z] = wgs84ToLocal(c[0], c[1])
    records.push({
      id: clean(p.MHCN), demolished: clean(p.DEMOLISHED) === 'y', type: clean(p.TYPE),
      designation: clean(p.DESIGNATIO), designation_dates: clean(p.D_DATE), legend: clean(p.LEGEND),
      historic_name: clean(p.HISTORIC_N), common_name: clean(p.COMMON_NAM), address: clean(p.ADDRESS),
      constructed: clean(p.CONSTRUCTI), style: clean(p.ARCHITECTU), maker: clean(p.MAKER),
      use_type: clean(p.USE_TYPE), significance: clean(p.SIGNIFICAN),
      lon: r7(c[0]), lat: r7(c[1]), x: r2(x), z: r2(z),
    })
  }
  if (!records.length) throw new Error(`[${well.id}] ${well.gdb.layer} WHERE ${well.where} selected 0 records — the town's selector does not match the data (check its spelling in sources.json \`select\`)`)
  const missingId = records.filter(r => !r.id).length
  if (missingId) throw new Error(`[${well.id}] ${missingId} record(s) have no MHCN — refusing a well whose records cannot be cited or withheld`)
  return { meta: { well: well.id, registry: well.registry, fromState: well.fromState ?? null, source: `${well.gdb.zip}/${well.gdb.dataset} ${well.gdb.layer}`,
    where: well.where, gdal, fetched: new Date().toLocaleDateString('en-CA'), count: records.length, no_point: noPoint }, records }
}

const READERS = { 'mhc-gdb': readMhcGdb }

const s = readHistorySources(SCENE)
if (s.state !== 'declared') { console.log(`[fetch-history] ${SCENE}: history ${s.state}${s.absentReason ? ` (${s.absentReason})` : ''} — nothing to fetch`); process.exit(0) }
for (const w of s.wells) {
  const read = READERS[w.reader]
  if (!read) { console.log(`  [${w.id}] reader ${w.reader}: authored by hand, not fetched (${w.path})`); continue }
  const art = read(w)
  const byType = art.records.reduce((m, r) => (m[r.type] = (m[r.type] || 0) + 1, m), {})
  console.log(`  [${w.id}] ${art.meta.count} records (${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(' · ')}) · ${art.records.filter(r => r.demolished).length} demolished${art.meta.no_point ? ` · ${art.meta.no_point} with no point (not written)` : ''}`)
  if (dryRun) { console.log(`    e.g. ${JSON.stringify(art.records[0])}`); continue }
  mkdirSync(mapRawDir(SCENE), { recursive: true })
  writeFileSync(join(mapRawDir(SCENE), w.file), JSON.stringify(art, null, 1) + '\n')
  console.log(`    wrote raw/${w.file}`)
}
