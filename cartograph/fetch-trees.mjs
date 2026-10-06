#!/usr/bin/env node
/**
 * fetch-trees.mjs — acquire a town's DECLARED tree-census wells (sources.json `trees`; cartograph/sources.js
 * readTreeSources) into data/<scene>/clean/, where both tree entry points read them (cartograph/tree-bake-inputs.mjs,
 * arborist/bake-trees.js) and union them with the town's other wells.
 *
 *   CARTOGRAPH_SCENE=jacksonheights node cartograph/fetch-trees.mjs            (fetch + write)
 *   CARTOGRAPH_SCENE=jacksonheights node cartograph/fetch-trees.mjs --dry-run  (counts only, no write)
 *
 * BRIEF-nyc-adapter §3.2a ("trees become a well kind"). Each well READS its rows into one shape (the state record's
 * `read`, e.g. states/ny.mjs): { lon, lat, species, common, dbh, condition, standing, recordId }.
 * ⭐ A census is the UNION of its wells (BAKE §4.5) — the bake dedups trunks across them (readCensus, DEDUP_M).
 * ⭐ `standing: false` is a record that a tree is GONE (removed, stump, shaft): it is never planted, and is counted.
 * ⭐ `dead: true` on a standing tree: KEPT on record (`deadStanding`), tagged, NOT planted — the library has no dead or
 *    bare tree (Jacob, 2026-10-06) — and counted.
 * ⭐ SUPERSESSION — a well may declare `supersedes: [<older well>]`: it is a later survey of the same trees, and ITS
 *    removal records act on the older well — an older tree within DEDUP_M of a later "gone" record is not written,
 *    COUNTED and NAMED (record ids) in the pour line (Jacob, 2026-10-06: "we want to be most up to date"). Only explicit
 *    removal records act; the absence of a tree in the later survey proves nothing.
 * ⛔ Every well's file says what it was, how many, and what it did not plant (meta), so a thin town is never silent.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { BBOX, CLEAN_DIR, RAW_DIR, SCENE, wgs84ToLocal } from './config.js'
import { requireExplicitMap } from './scene.js'
import { readTreeSources } from './sources.js'
import { socrataFetchAll } from './socrata-fetch.mjs'
import { DEDUP_M } from '../arborist/census-dedup.mjs'

const r2 = (v) => Math.round(v * 100) / 100, r7 = (v) => Math.round(v * 1e7) / 1e7

/**
 * Pure: per well, its read rows → { trees (standing, located), removals (gone, located), unlocated } and the
 * supersession applied. `wells` = [{ id, supersedes?, rows:[read shape with x,z] }]. Returns per-well results.
 */
export function assembleTreeWells(wells) {
  const out = new Map()
  for (const w of wells) {
    const located = w.rows.filter((t) => Number.isFinite(t.x) && Number.isFinite(t.z))
    out.set(w.id, { id: w.id, trees: located.filter((t) => t.standing && !t.dead), dead: located.filter((t) => t.standing && t.dead),
                    removals: located.filter((t) => !t.standing), unlocated: w.rows.length - located.length, supersededBy: {}, supersededIds: {} })
  }
  for (const w of wells) {
    for (const older of w.supersedes || []) {
      const o = out.get(older)
      if (!o) throw new Error(`tree well "${w.id}" supersedes "${older}", which this town does not declare`)
      const gone = out.get(w.id).removals, cell = DEDUP_M, grid = new Map()
      for (const g of gone) { const k = `${Math.floor(g.x / cell)},${Math.floor(g.z / cell)}`; (grid.get(k) || grid.set(k, []).get(k)).push(g) }
      const isGone = (t) => { const gx = Math.floor(t.x / cell), gz = Math.floor(t.z / cell)
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
          for (const g of grid.get(`${gx + dx},${gz + dz}`) || []) if ((g.x - t.x) ** 2 + (g.z - t.z) ** 2 < DEDUP_M * DEDUP_M) return true
        return false }
      const dropped = o.trees.filter(isGone)
      o.trees = o.trees.filter((t) => !isGone(t))
      o.supersededBy[w.id] = dropped.length
      o.supersededIds[w.id] = dropped.map((t) => t.recordId ?? `${t.x},${t.z}`)
    }
  }
  return out
}

async function main() {
  requireExplicitMap('fetch-trees')
  const dryRun = process.argv.includes('--dry-run')
  console.log(`cartograph/fetch-trees.mjs — scene=${SCENE}${dryRun ? ' (dry-run)' : ''}`)
  const d = readTreeSources(SCENE)
  if (d.state === 'undeclared') { console.error(`⛔ "${SCENE}" declares no tree wells (no \`trees\` in sources.json) — its census is its canonical files.`); process.exit(2) }
  if (d.state === 'none') { console.log(`  DECLARED-NONE: ${d.absentReason}\n  Nothing to fetch — an honest zero.`); return }
  const tmp = join(RAW_DIR, '._trees_page.json')
  mkdirSync(RAW_DIR, { recursive: true }); mkdirSync(CLEAN_DIR, { recursive: true })
  const fetched = []
  for (const w of d.wells) {
    if (w.protocol !== 'socrata') throw new Error(`[${w.id}] is a ${w.protocol} tree well — fetch-trees.mjs reads socrata`)
    if (typeof w.read !== 'function') throw new Error(`[${w.id}] declares no \`read\` — a tree well must say how its rows read`)
    const { rows, count } = socrataFetchAll({ resource: w.endpoint, geomField: w.geomField, where: w.where, columns: w.columns, bbox: BBOX, tmpPath: tmp,
      log: (n) => console.log(`  [${w.id}] ${n} record(s) in the envelope — ${w.attribution}`) })
    const read = rows.map((r) => { const t = w.read(r); if (!Number.isFinite(t.lon) || !Number.isFinite(t.lat)) return { ...t, x: NaN, z: NaN }
      const [x, z] = wgs84ToLocal(t.lon, t.lat); return { ...t, x: r2(x), z: r2(z) } })
    fetched.push({ well: w, count, rows: read })
  }
  const res = assembleTreeWells(fetched.map(({ well, rows }) => ({ id: well.id, supersedes: well.supersedes, rows })))
  for (const { well, count } of fetched) {
    const r = res.get(well.id)
    const sup = Object.entries(r.supersededBy).map(([by, n]) => n).reduce((a, b) => a + b, 0)
    const superseded = Object.entries(r.supersededBy).filter(([, n]) => n)
    console.log(`  [${well.id}] plants ${r.trees.length} standing · ${r.removals.length} records of a tree GONE (removed/stump) not planted` +
      (r.dead.length ? ` · ${r.dead.length} standing DEAD kept on record, not planted` : '') +
      (superseded.length ? ` · ⛔ ${superseded.map(([by, n]) => `${n} superseded by a later "gone" record in ${by}`).join(' · ')}` : '') +
      (r.unlocated ? ` · ⛔ ${r.unlocated} with no position` : ''))
    for (const [by, ids] of Object.entries(r.supersededIds)) if (ids.length)
      console.log(`    superseded by ${by} (record ids): ${ids.slice(0, 40).join(', ')}${ids.length > 40 ? ` … +${ids.length - 40}` : ''}`)
    if (dryRun) continue
    const path = join(CLEAN_DIR, well.file)
    writeFileSync(path, JSON.stringify({
      meta: { source: well.attribution, url: well.endpoint, scene: SCENE, well: 'city-inventory', wellId: well.id, kind: 'census',
              fromState: well.fromState ?? null, fetched_bbox: { ...BBOX }, dbh_unit: 'in', records: count, total: r.trees.length,
              notPlanted: { gone: r.removals.length, deadStanding: r.dead.length, unlocated: r.unlocated, supersededBy: r.supersededBy,
                            supersededIds: r.supersededIds }, fetchedAt: new Date().toISOString() },
      // ⭐ On record, never planted (bake-trees reads `trees` only).
      deadStanding: r.dead.map((t) => ({ x: t.x, z: t.z, lon: r7(t.lon), lat: r7(t.lat), species: t.species, condition: t.condition, well: well.id, recordId: t.recordId })),
      trees: r.trees.map((t) => ({ x: t.x, z: t.z, lon: r7(t.lon), lat: r7(t.lat), species: t.species, common: t.common,
        ...(Number.isFinite(t.dbh) ? { dbh: t.dbh } : {}), condition: t.condition, well: well.id, recordId: t.recordId })),
    }))
    console.log(`    wrote ${path} (${r.trees.length} trees${sup ? `; ${sup} superseded` : ''})`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((err) => { console.error(err.message || err); process.exit(1) })
