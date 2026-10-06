#!/usr/bin/env node
/**
 * fetch-buildings.mjs — acquire a town's DECLARED footprint well (cartograph/footprint-well.mjs) into data/<scene>/raw/.
 *
 *   CARTOGRAPH_SCENE=jacksonheights node cartograph/fetch-buildings.mjs            (fetch + write)
 *   CARTOGRAPH_SCENE=jacksonheights node cartograph/fetch-buildings.mjs --dry-run  (count + one row, no write)
 *
 * The sibling of fetch-msbf.js for a town whose state publishes its own footprints (NYC first, BRIEF-nyc-adapter §3.2a).
 * Writes the SAME record shape the pour reads from msbf.json ({ tags, isClosed, coords:[{lon,lat,x,z}] }), plus who
 * the building is:
 *   { well, keyKind, permanentId?, wellN?, keyWhy } — minted into an id by membership.mjs#buildingIdOf:
 *   ⭐ `bin-4029691` where the well carries a PERMANENT id (the city keeps it; no registry needed) ·
 *   `<well>-<n>` from the centroid registry (identity-registry.<well>.json) where it does not: a PLACEHOLDER id (NYC's
 *   borough "million BINs") or an unparseable one — each COUNTED and printed, never silently given an id.
 * ⛔ A permanent id on TWO footprints in the envelope throws, naming it: the lock would collapse them into one building.
 * ⛔ A footprint in several parts throws, naming it: the kit's footprint is one ring, and silently keeping one part
 *    loses the others.
 * ⛔ HOLES (courtyards — Jackson Heights' garden apartments) are NOT SUPPORTED downstream: the pour carries one ring
 *    and bake-buildings triangulates with no holes. They are KEPT on the record (`holes`, `holesUnsupported`) — the
 *    city's measurement is never thrown away — and every one is counted and printed as unsupported. Never "filled".
 * Attribute wells (`buildingAttributes`, e.g. NYC's BES) join by the permanent id only — no geometry; placeholder,
 * unparseable and repeated ids never join, and every one is counted.
 * Units: a field declared `unit: 'ft'` is converted to the kit's metres; anything else is kept as served.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { BBOX, RAW_DIR, SCENE, wgs84ToLocal } from './config.js'
import { requireExplicitMap } from './scene.js'
import { footprintWell } from './footprint-well.mjs'
import { readBuildingSources } from './sources.js'
import { socrataFetchAll, socrataSample } from './socrata-fetch.mjs'
import { registryPath, loadRegistry, saveRegistry, assignIds } from './msbf-identity.js'
import { normaliseId } from './permanent-id.mjs'

const FT = 0.3048   // the international foot, exactly

export { normaliseId }

/**
 * Who each footprint is. `ids` = the raw id per record (as served). Returns per record
 * { keyKind, permanentId?, keyWhy } and the counts; THROWS on a permanent id held by two footprints.
 */
export function classifyIdentity(ids, spec) {
  const placeholder = spec.placeholder ? new RegExp(spec.placeholder) : null
  const norm = ids.map(normaliseId)
  const seen = new Map()
  norm.forEach((id, i) => { if (id && !(placeholder && placeholder.test(id))) seen.set(id, [...(seen.get(id) || []), i]) })
  const repeated = [...seen].filter(([, is]) => is.length > 1)
  if (repeated.length) {
    throw new Error(`${repeated.length} ${spec.kind} value(s) are held by more than one footprint in the envelope — the identity lock would ` +
      `collapse them into one building: ${repeated.slice(0, 10).map(([id, is]) => `${id} ×${is.length}`).join(', ')}`)
  }
  const counts = { [spec.kind]: 0, placeholder: 0, unparseable: 0 }
  const out = norm.map((id, i) => {
    if (id == null) { counts.unparseable++; return { keyKind: 'centroid', keyWhy: `${spec.kind} ${JSON.stringify(ids[i] ?? null)} is not an id` } }
    if (placeholder && placeholder.test(id)) { counts.placeholder++; return { keyKind: 'centroid', keyWhy: `placeholder ${spec.kind} ${id}` } }
    counts[spec.kind]++
    return { keyKind: spec.kind, permanentId: id, keyWhy: `${spec.kind} (permanent, kept by the source)` }
  })
  return { out, counts }
}

/** A row's declared fields → tags. `unit: 'ft'` → metres (2 dp); an unknown unit THROWS. Absent values are omitted. */
export function fieldsToTags(row, fields = {}) {
  const tags = {}
  for (const [key, f] of Object.entries(fields)) {
    const v = row[f.from]
    if (v == null || v === '') continue
    if (!f.unit) { tags[key] = v; continue }
    if (f.unit !== 'ft') throw new Error(`field ${key}: unit "${f.unit}" is not one the kit converts (ft)`)
    const n = Number(v)
    if (Number.isFinite(n)) tags[key] = Math.round(n * FT * 100) / 100
  }
  return tags
}

/** Join attribute rows onto buildings by permanent id. Returns { joined, counts }; never joins a placeholder/repeat. */
export function joinAttributes(buildings, rows, att, spec) {
  const placeholder = spec.placeholder ? new RegExp(spec.placeholder) : null
  const by = new Map(), counts = { rows: rows.length, joined: 0, unparseable: 0, placeholder: 0, repeated: 0, noBuilding: 0 }
  for (const r of rows) {
    const id = normaliseId(r[att.joinOn])
    if (id == null) { counts.unparseable++; continue }
    if (placeholder && placeholder.test(id)) { counts.placeholder++; continue }
    by.set(id, by.has(id) ? null : r)          // null = repeated: ambiguous, joins nothing
  }
  for (const [, r] of by) if (r === null) counts.repeated++
  const have = new Set()
  for (const b of buildings) {
    if (b.keyKind === 'centroid') continue
    have.add(b.permanentId)
    const r = by.get(b.permanentId)
    if (!r) continue
    Object.assign(b.tags, fieldsToTags(r, att.fields))
    counts.joined++
  }
  for (const [id, r] of by) if (r && !have.has(id)) counts.noBuilding++
  return counts
}

const r7 = (v) => Math.round(v * 1e7) / 1e7, r2 = (v) => Math.round(v * 100) / 100

async function main() {
  requireExplicitMap('fetch-buildings')
  const dryRun = process.argv.includes('--dry-run')
  const fw = footprintWell(SCENE)
  console.log(`cartograph/fetch-buildings.mjs — scene=${SCENE}${dryRun ? ' (dry-run)' : ''}`)
  if (!fw.declared) {
    console.error(`⛔ "${SCENE}" declares no buildings well — its footprints are ${fw.label}: node cartograph/fetch-msbf.js`)
    process.exit(2)
  }
  const well = fw.well, { attributes } = readBuildingSources(SCENE)
  if (well.protocol !== 'socrata') throw new Error(`[${well.id}] is a ${well.protocol} well — fetch-buildings.mjs reads socrata`)
  if (!well.permanentId?.field || !well.permanentId?.kind) throw new Error(`[${well.id}] declares no permanentId { field, kind } — say "none" by writing a centroid-only well, not by omission`)
  const tmp = join(RAW_DIR, '._buildings_page.json')
  mkdirSync(RAW_DIR, { recursive: true })
  const q = { resource: well.endpoint, geomField: well.geomField, where: well.where, columns: well.columns, bbox: BBOX, tmpPath: tmp }
  if (dryRun) {
    const { count, row } = socrataSample(q)
    console.log(`  [${well.id}] ${count} footprint(s) in the envelope — ${well.attribution}`)
    if (row) console.log(`    sample: ${JSON.stringify({ ...row, [well.geomField]: row[well.geomField]?.type })}`)
    return
  }
  const { rows, count } = socrataFetchAll({ ...q, log: (n) => console.log(`  [${well.id}] ${n} footprint(s) in the envelope — ${well.attribution}`) })

  // Geometry: one outer ring per footprint, in the msbf.json shape.
  const multi = [], built = []
  const holed = []
  for (const r of rows) {
    const g = r[well.geomField]
    const polys = g?.type === 'MultiPolygon' ? g.coordinates : g?.type === 'Polygon' ? [g.coordinates] : []
    if (polys.length !== 1) { multi.push(`${r[well.permanentId.field] ?? '?'} (${polys.length} parts)`); continue }
    const ring = (pts) => pts.map(([lon, lat]) => { const [x, z] = wgs84ToLocal(lon, lat); return { lon: r7(lon), lat: r7(lat), x: r2(x), z: r2(z) } })
    const holes = polys[0].slice(1).map(ring)
    if (holes.length) holed.push(`${r[well.permanentId.field] ?? '?'} (${holes.length})`)
    built.push({ row: r, coords: ring(polys[0][0]), holes })
  }
  if (multi.length) throw new Error(`[${well.id}] ${multi.length} footprint(s) are not ONE polygon — the kit's footprint is one ring: ${multi.slice(0, 10).join(', ')}`)

  // Identity.
  const { out: idents, counts } = classifyIdentity(built.map(b => b.row[well.permanentId.field]), well.permanentId)
  const centroidIdx = idents.map((d, i) => d.keyKind === 'centroid' ? i : -1).filter(i => i >= 0)
  const regPath = registryPath(RAW_DIR, well.id)
  let regLine = 'no centroid-keyed footprints — no registry needed'
  if (centroidIdx.length) {
    const existing = loadRegistry(regPath)
    const { ids, registry, minting, appended, collisions } = assignIds(centroidIdx.map(i => built[i].coords), existing,
      { scene: SCENE, source: well.attribution, dataset: well.endpoint })
    if (collisions) console.warn(`  ⚠ ${collisions} coincident-centroid collisions among centroid-keyed footprints — identity ambiguous for those`)
    centroidIdx.forEach((i, k) => { idents[i].wellN = ids[k] })
    saveRegistry(regPath, registry)
    regLine = minting ? `MINTED ${registry.count} centroid keys → ${regPath}` : `consulted (${existing.count} known, ${appended} appended) → ${regPath}`
  }
  const buildings = built.map((b, i) => ({
    well: well.id, ...idents[i],
    tags: { building: 'yes', source: well.id, ...fieldsToTags(b.row, well.fields) },
    isClosed: true,
    coords: b.coords,
    ...(b.holes.length ? { holes: b.holes, holesUnsupported: b.holes.length } : {}),
  }))

  // Attribute wells, joined by the permanent id.
  const attLines = []
  for (const att of attributes) {
    const { rows: arows } = socrataFetchAll({ resource: att.endpoint, geomField: att.geomField, where: att.where, columns: att.columns, bbox: BBOX, tmpPath: tmp })
    const c = joinAttributes(buildings, arows, att, well.permanentId)
    attLines.push(`${att.id}: ${c.joined} joined of ${counts[well.permanentId.kind]} ${well.permanentId.kind}-keyed · ${c.rows} rows` +
      (c.unparseable ? ` · ⛔ ${c.unparseable} unparseable ${att.joinOn}` : '') + (c.placeholder ? ` · ${c.placeholder} placeholder (not joined)` : '') +
      (c.repeated ? ` · ⛔ ${c.repeated} repeated ${att.joinOn} (ambiguous, not joined)` : '') + (c.noBuilding ? ` · ${c.noBuilding} with no footprint here` : ''))
  }

  const path = join(RAW_DIR, well.file)
  writeFileSync(path, JSON.stringify({
    source: well.attribution, well: well.id, endpoint: well.endpoint, fromState: well.fromState ?? null,
    date: new Date().toISOString().split('T')[0], bbox: { ...BBOX }, count: buildings.length,
    identity: counts, holesUnsupported: holed.length, attributes: attributes.map(a => a.id), buildings,
  }))
  const pk = well.permanentId.kind
  console.log(`  identity: ${counts[pk]} ${pk}-keyed · ${counts.placeholder} placeholder ${pk} → centroid · ` +
    `${counts.unparseable ? '⛔ ' : ''}${counts.unparseable} unparseable ${pk} → centroid · registry ${regLine}`)
  if (holed.length) console.log(`  ⛔ HOLED FOOTPRINT UNSUPPORTED: ${holed.length} footprint(s) have courtyard holes the kit cannot draw (one-ring ` +
    `footprint; bake-buildings triangulates with none) — they ship as the outer ring, holes kept on the record: ${holed.slice(0, 20).join(', ')}`)
  for (const l of attLines) console.log(`  ${l}`)
  console.log(`  wrote ${path} (${buildings.length} footprints from ${well.id})`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(err => { console.error(err.message || err); process.exit(1) })
