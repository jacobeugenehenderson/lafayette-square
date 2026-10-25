#!/usr/bin/env node
/**
 * fetch-bathymetry.mjs — ACQUIRE THE FLOOR UNDER THE TOWN'S WATER, like the DEM.
 *
 * ⭐ RULED BY JACOB, 2026-09-26/27: *"Where there is depth data, we only use it out to stair's edge. Where we
 * don't have it, we gently slope it."* The gentle slope is `bake-terrain.js` writeBed's profile; this finds the
 * depth data. `docs/briefs/BRIEF-bathymetry.md`.
 *
 * ⛔ WHY IT MATTERS: with the profile alone the bed is a function of distance to the shore, so the depth where
 * the bottom stops showing lies the same distance off every shore — the visible edge is the shoreline, offset
 * and feathered (Jacob, 2026-09-27: "not the sentiment we were going for"). A real floor has bars, channels
 * and flats, and the edge follows them.
 *
 * THE LADDER, finest first, by COORDINATES — never by town name:
 *   1. NOAA OCS BlueTopo — the national bathymetric compilation, 2–16 m COG tiles, NAD83 UTM + NAVD88.
 *      Found through its own tile scheme (a GeoPackage on the public bucket), whose rows carry each tile's
 *      extent and download link. A tile in the scheme with NO link is not yet delivered: SAID, not counted.
 *   2. USACE NCMP topobathy lidar (1 m, the Great Lakes and open coasts; built 2026-10-25 for the band a lidar flown
 *      at high water could not see: BRIEF-the-shore-is-one-line). Found on NOAA Digital Coast's public bucket by
 *      COORDINATES: every USACE collection's STAC extent is met against the bbox. ⛔ A survey is read only when its
 *      Digital Coast id has a PERMITTED row in references/registry.json (`digitalCoastId`; README rule 1): one with
 *      none is NAMED, never read. ⭐ ONE SURVEY (the kit's rule for the DEM too): the newest permitted survey that
 *      meets the bbox; the others are listed, not mixed. A collection with no STAC record is named, not asked.
 *   3. NOAA NCEI CUDEM — ⛔ NOT BUILT YET.
 * ⛔ So a town the built rungs cannot cover is NOT verified-absent: rung 3 was never asked. The file says
 * which rungs ran and which did not, and the town keeps the profile, said, until they are built.
 *
 * ⭐ NOTHING IS DOWNLOADED but the tile scheme (a few MB, read once): the list this writes is range-read by
 * `bake-terrain.js`, which pulls only the window its grid needs, like `raw/elevation-sources.txt`.
 *
 *   node cartograph/fetch-bathymetry.mjs --scene=<id> [--dry]
 * Writes cartograph/data/<scene>/raw/bathymetry-sources.txt. Reads raw/osm.json for the bbox.
 * Exit 0 = tiles found · 1 = no tiles from the built rungs (the file says why) · other = error.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { requireExplicitMap } from './scene.js'
import { writeIfChanged } from './io.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUCKET = 'https://noaa-ocs-nationalbathymetry-pds.s3.amazonaws.com'
const DC_BUCKET = 'https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com'   // NOAA Digital Coast's public lidar/DEM bucket

export const BATHY_LADDER = [
  { id: 'bluetopo', name: 'NOAA OCS BlueTopo', built: true },
  { id: 'ncmp', name: 'USACE NCMP topobathy lidar', built: true },
  { id: 'cudem', name: 'NOAA NCEI CUDEM', built: false },
]

const arg = (k, d = null) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : (process.argv.includes(`--${k}`) ? true : d)
}

/** The current BlueTopo tile scheme's key — the bucket holds exactly one, dated. */
async function tileSchemeKey(fetcher) {
  const r = await fetcher(`${BUCKET}/?list-type=2&prefix=BlueTopo/_BlueTopo_Tile_Scheme/`)
  if (!r.ok) throw new Error(`BlueTopo tile scheme listing: HTTP ${r.status}`)
  const keys = [...(await r.text()).matchAll(/<Key>([^<]+\.gpkg)<\/Key>/g)].map(m => m[1]).sort()
  if (!keys.length) throw new Error('BlueTopo tile scheme listing names no .gpkg')
  return keys.at(-1)
}

/** A GeoPackage geometry blob's envelope [minX, maxX, minY, maxY], or null if it carries none. */
function gpkgEnvelope(blob) {
  const g = Buffer.from(blob)
  if (g[0] !== 0x47 || g[1] !== 0x50) throw new Error('not a GeoPackage geometry (no GP magic)')
  const flags = g[3], le = flags & 1, env = (flags >> 1) & 7
  if (env < 1) return null
  const rd = o => le ? g.readDoubleLE(o) : g.readDoubleBE(o)
  return [rd(8), rd(16), rd(24), rd(32)]
}

/** BlueTopo tiles whose extent meets the bbox: { delivered: [...], undelivered: [...], scheme }. */
export async function findBlueTopo(bbox, { fetcher = fetch } = {}) {
  const { DatabaseSync } = await import('node:sqlite')
  const key = await tileSchemeKey(fetcher)
  const r = await fetcher(`${BUCKET}/${key}`)
  if (!r.ok) throw new Error(`BlueTopo tile scheme ${key}: HTTP ${r.status}`)
  const dir = mkdtempSync(join(tmpdir(), 'bluetopo-'))
  const path = join(dir, 'scheme.gpkg')
  writeFileSync(path, Buffer.from(await r.arrayBuffer()))
  try {
    const db = new DatabaseSync(path, { readOnly: true })
    const { table_name: table, srs_id } = db.prepare(
      `select c.table_name, g.srs_id from gpkg_contents c join gpkg_geometry_columns g using (table_name) where c.data_type = 'features'`).get()
    // ⛔ The envelope is compared as lon/lat; any other CRS would place every tile wrongly and nothing would say so.
    if (srs_id !== 4326) throw new Error(`BlueTopo tile scheme is in SRS ${srs_id}, not 4326 — refusing to compare its extents as lon/lat`)
    const delivered = [], undelivered = []
    for (const row of db.prepare(`select tile, GeoTIFF_Link, Resolution, UTM, geom from "${table}"`).all()) {
      const e = gpkgEnvelope(row.geom)
      if (!e || e[1] < bbox.minLon || e[0] > bbox.maxLon || e[3] < bbox.minLat || e[2] > bbox.maxLat) continue
      const t = { tile: row.tile, url: row.GeoTIFF_Link, resolution: row.Resolution, utm: row.UTM }
      ;(row.GeoTIFF_Link ? delivered : undelivered).push(t)
    }
    db.close()
    return { scheme: key, delivered, undelivered }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

const meets = (b, bbox) => !(b[2] < bbox.minLon || b[0] > bbox.maxLon || b[3] < bbox.minLat || b[1] > bbox.maxLat)

/** The Digital Coast ids with a PERMITTED registry row (references/registry.json `digitalCoastId`), → the row's id. */
export function permittedDigitalCoast(registry = JSON.parse(readFileSync(join(ROOT, 'references', 'registry.json'), 'utf8'))) {
  const out = new Map()
  for (const s of registry.sources || []) if (s.digitalCoastId != null && s.terms?.aiUse === 'permitted') out.set(String(s.digitalCoastId), s.id)
  return out
}

/** Every `dem/USACE_*` collection on the Digital Coast bucket (the listing is paged). */
async function usaceCollections(fetcher) {
  const out = []
  let token = null
  do {
    const r = await fetcher(`${DC_BUCKET}/?list-type=2&prefix=dem/USACE_&delimiter=/&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`)
    if (!r.ok) throw new Error(`Digital Coast listing: HTTP ${r.status}`)
    const x = await r.text()
    for (const m of x.matchAll(/<Prefix>(dem\/USACE_[^<]+\/)<\/Prefix>/g)) out.push(m[1])
    token = x.match(/<NextContinuationToken>([^<]+)</)?.[1] || null
  } while (token)
  return out
}

/**
 * USACE NCMP topobathy surveys that meet the bbox: { delivered: [{ tile, url, resolution, survey }], survey, others,
 * unpermitted, noStac }. ⭐ ONE survey: the newest (STAC temporal end) of those PERMITTED that meet the bbox.
 */
export async function findNcmp(bbox, { fetcher = fetch, permitted = permittedDigitalCoast() } = {}) {
  const meet = [], noStac = []
  for (const prefix of await usaceCollections(fetcher)) {
    const r = await fetcher(`${DC_BUCKET}/${prefix}stac/collection.json`)
    if (r.status === 404) { noStac.push(prefix); continue }
    if (!r.ok) throw new Error(`Digital Coast ${prefix}stac/collection.json: HTTP ${r.status}`)
    const c = await r.json()
    if (!/topobathy|bathymetr/i.test(c.description || '')) continue                 // a USACE topo-only DEM is no floor
    const b = c.extent?.spatial?.bbox?.[0], t = c.extent?.temporal?.interval?.[0] || []
    if (!b || !meets(b, bbox)) continue
    const id = prefix.match(/_(\d+)\/$/)?.[1]
    if (!id) throw new Error(`Digital Coast ${prefix}: no trailing dataset id — the registry cannot be asked`)
    meet.push({ prefix, id, start: t[0] || null, end: t[1] || t[0] || null, registry: permitted.get(id) || null })
  }
  const unpermitted = meet.filter(m => !m.registry)
  const ok = meet.filter(m => m.registry).sort((a, b) => String(b.end).localeCompare(String(a.end)))
  for (const m of ok) {
    const r = await fetcher(`${DC_BUCKET}/${m.prefix}stac/noaa_item_collection_m${m.id}.json`)
    if (!r.ok) throw new Error(`Digital Coast ${m.prefix} item collection: HTTP ${r.status}`)
    const items = (await r.json()).features || []
    const delivered = []
    for (const f of items) {
      if (!f.bbox || !meets(f.bbox, bbox)) continue
      const a = Object.values(f.assets || {}).find(x => /geotiff/i.test(x.type || '') && /\.tif$/i.test(x.href || ''))
      if (a) delivered.push({ tile: f.id, url: a.href, resolution: /_1mGrid/i.test(f.id) ? '1m' : 'see tile', survey: m.id })
    }
    if (delivered.length) return { delivered, survey: m, others: ok.filter(o => o !== m), unpermitted, noStac }
  }
  return { delivered: [], survey: null, others: ok, unpermitted, noStac }
}

function render({ scene, bbox, found, tried }) {
  const L = [`# ${scene} — the floor under the water (cartograph/fetch-bathymetry.mjs). Read by HTTP RANGE REQUEST`,
    `# in bake-terrain.js, only where the bed is shallower than the town's visibility depth.`,
    `# bbox ${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`]
  for (const t of tried) L.push(`#   ${t.built ? (t.n ? '✅' : '⛔') : '⏸'} ${t.name} → ${t.note}`)
  if (!found) {
    L.push(`# ⛔ NO TILES from the built rungs. NOT verified-absent: the rungs marked ⏸ were never asked.`,
      `# The bed stays the profile for this town, and bake-terrain says so.`)
  } else {
    L.push(`# rung: ${found.name} · ${found.tiles.length} tile(s) · resolutions ${[...new Set(found.tiles.map(t => t.resolution))].join(', ')}`)
    L.push(`# ⛔ Re-derive rather than trusting this list:  node cartograph/fetch-bathymetry.mjs --scene=${scene}`)
    for (const t of found.tiles) L.push(t.url)
  }
  return L.join('\n') + '\n'
}

async function main() {
  const scene = requireExplicitMap('fetch-bathymetry.mjs (writes raw/bathymetry-sources.txt)')
  const rawDir = join(ROOT, 'cartograph', 'data', scene, 'raw')
  const osmPath = join(rawDir, 'osm.json')
  if (!existsSync(osmPath)) { console.error(`fetch-bathymetry: ${scene} has no raw/osm.json — fetch the town first`); process.exit(2) }
  const bbox = JSON.parse(readFileSync(osmPath, 'utf8')).bbox
  if (!bbox) { console.error(`fetch-bathymetry: ${scene}'s raw/osm.json has no bbox`); process.exit(2) }

  console.log(`[fetch-bathymetry] ${scene}  bbox ${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`)
  const tried = []
  let found = null
  for (const rung of BATHY_LADDER) {
    if (!rung.built) { tried.push({ ...rung, n: 0, note: 'rung not built yet — not asked' }); continue }
    if (found) { tried.push({ ...rung, n: 0, note: 'not needed' }); continue }
    if (rung.id === 'bluetopo') {
      const bt = await findBlueTopo(bbox)
      const note = `${bt.delivered.length} delivered tile(s)` + (bt.undelivered.length ? `, ${bt.undelivered.length} in the scheme NOT YET DELIVERED` : '') + ` (${bt.scheme.split('/').pop()})`
      tried.push({ ...rung, n: bt.delivered.length, note })
      if (bt.delivered.length) found = { name: rung.name, tiles: bt.delivered }
    } else if (rung.id === 'ncmp') {
      const nc = await findNcmp(bbox)
      const S = nc.survey
      const note = (S ? `${nc.delivered.length} tile(s) of ${S.prefix.slice(4, -1)} (registry ${S.registry}), flown ${S.start?.slice(0, 10)}…${S.end?.slice(0, 10)}` : 'no permitted survey with tiles over the bbox')
        + (nc.others.length ? ` · also permitted, NOT mixed: ${nc.others.map(o => o.prefix.slice(4, -1)).join(', ')}` : '')
        + (nc.unpermitted.length ? ` · ⛔ meets the bbox but has NO permitted registry row (not read): ${nc.unpermitted.map(o => `${o.prefix.slice(4, -1)} (Digital Coast ${o.id})`).join(', ')}` : '')
        + (nc.noStac.length ? ` · ${nc.noStac.length} USACE collection(s) publish no STAC record, not asked` : '')
      tried.push({ ...rung, n: nc.delivered.length, note })
      if (nc.delivered.length) found = { name: rung.name, tiles: nc.delivered }
    } else throw new Error(`fetch-bathymetry: rung '${rung.id}' is marked built and has no reader`)
  }
  for (const t of tried) console.log(`    ${t.built ? (t.n ? '✅' : '⛔') : '⏸'} ${t.name} → ${t.note}`)

  const body = render({ scene, bbox, found, tried })
  if (arg('dry')) { console.log('\n--dry, would write:\n' + body); process.exit(found ? 0 : 1) }
  mkdirSync(rawDir, { recursive: true })
  const outPath = join(rawDir, 'bathymetry-sources.txt')
  writeIfChanged(outPath, body)
  if (!found) {
    console.error(`\n⛔ No bathymetry tiles for ${scene} from the built rungs — the bed stays the profile. Written: ${outPath}`)
    process.exit(1)
  }
  console.log(`\n✅ ${found.tiles.length} tile(s), ${found.name} → ${outPath}  (nothing downloaded; bake-terrain range-reads them)`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(3) })
