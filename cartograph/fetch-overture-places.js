#!/usr/bin/env node
/**
 * Cartograph — ACQUIRE an external listings base: Overture Maps PLACES.
 *
 * ⭐ WHY THIS FILE EXISTS. `bake-content.js`'s external-base guard has been
 * generic since it was written — it reads `meta.baseSource` out of the DATA, so
 * the next town with a non-OSM base is protected from the destructive re-bake
 * without anyone editing that file. But the REMEDY never generalized: the only
 * merge tool that ever existed was hardcoded to one scene and was deleted with
 * that scene (2026-09-19). A town was protected and then had nowhere to go.
 * That was an unbuilt thing filed as done (`CLAUDE.md` — ASPIRATION, the
 * conformance job's own failure mode). This file and the second base producer
 * in `bake-content.js` are the build.
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────────
 * The OSM POI base is excellent where OSM is richly mapped and thin where it is
 * not, and a town does not tell you which it is until you have poured it. This
 * is the base for the town whose assessor does not exist and whose OSM is thin.
 *
 * ── THE STANDING CONSTRAINT (`INTAKE-CATALOGUE` header) ─────────────────────
 * Every input is a LOCAL FILE; a pour must be reproducible with the network
 * unplugged. ⛔ This script ACQUIRES ONCE to `data/<scene>/raw/`. The pipeline
 * never reads the network, and nothing here runs at pour time.
 *
 * ── WHY PURE-JS PARQUET AND NOT duckdb / a service (`INTAKE-CATALOGUE §4.2`) ─
 * The one-button rule: "where a source has a programmatic endpoint, the row's
 * acquisition is ONE BUTTON — not an instruction." ⛔ Shelling to a duckdb
 * binary makes the button work on the author's machine and fail on an
 * operator's, which is the entire failure that rule exists to prevent; a bbox
 * extraction service adds a third party we do not control and puts a network
 * hop between the operator and their own town. `hyparquet` is zero-native-dep
 * and lives in devDependencies — the ACQUISITION layer, never the player's
 * bundle.
 *
 * ── AND IT DOES NOT PULL THE WORLD ──────────────────────────────────────────
 * Overture's places theme is ~11 GB across 16 files. Three prunes, each reading
 * only what the previous one left:
 *   1. STAC item bboxes            → the files that intersect the town
 *   2. parquet row-group statistics → the row groups that intersect it
 *   3. per-row bbox                → the rows
 * Measured on huron 2026-09-20 (re-derive, never quote — the probe is
 * `scratch/overture-range-probe.mjs`): 1 of 16 files, 2 of its 256 row groups,
 * ~10 MB in ~78 HTTP range requests, ~8 s. ⚠️ "It works" and "it works without
 * pulling the world" are different tests and only the second one is a button.
 *
 * ── ⛔ THE LICENCE IS NOT KIT-GLOBAL, AND THAT IS NOT A DEFECT ───────────────
 * Read at the source 2026-09-20, from the distribution's own bytes:
 *   the STAC collection declares  "license": "other"
 *     https://stac.overturemaps.org/<release>/places/place/collection.json
 *   and its `rel:license` link, https://docs.overturemaps.org/attribution/,
 *   gives Buildings / Divisions / Transportation a "License for theme:" line
 *   and gives PLACES NONE — it is a per-contributor list instead:
 *     CDLA Permissive 2.0 — Meta, Microsoft, PinMeTo, Krick, RenderSEO, DAC,
 *                           BrightQuery
 *     Apache 2.0          — Foursquare (with a NOTICE.txt)
 *     CC0 1.0             — AllThePlaces
 * ⇒ WHAT A TOWN OWES DEPENDS ON WHICH RECORDS IT ACTUALLY GOT. So every record
 * keeps its `sources[].dataset`, and the credit is DERIVED from the town's own
 * artifact rather than stated as a constant here. That is `intake-rows.mjs`
 * :180-189 working exactly as written ("a row whose well is chosen per town has
 * no kit-global licence and MUST NOT get a guessed one"), not a deviation from
 * it — the well here is chosen per RECORD rather than per town, which is the
 * same problem one notch finer.
 * ⛔ And the two obligations are DIFFERENT ACTS (`intake-rows.mjs:190-197`):
 * ODbL/Apache want a CREDIT, CDLA Permissive 2.0 §2.1 wants THE TERMS SHIPPED.
 * An aggregated source carries both kinds at once, so `requires` is preserved
 * per dataset downstream and never flattened to one "© X" line.
 *
 * Usage:   node cartograph/fetch-overture-places.js --scene=<scene>
 *          node cartograph/fetch-overture-places.js --scene=<scene> --release=2026-08-19.0
 * Output:  data/<scene>/raw/overture-places.json
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects, byteLengthFromUrl } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { BBOX, SCENE, mapRawDir, wgs84ToLocal } from './config.js'
import { requireExplicitMap } from './scene.js'

// ⛔ This WRITES into data/<scene>/raw/. Refuse an unnamed scene — the same
// reasoning as fetch.js: a wrong scene here does not show a wrong map, it
// overwrites a right one.
requireExplicitMap('fetch-overture-places')

const STAC_ROOT = 'https://stac.overturemaps.org/catalog.json'

const argv = process.argv.slice(2)
const arg = (k) => { const a = argv.find(s => s.startsWith(`--${k}=`)); return a ? a.split('=')[1] : null }

const getJson = async (url) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`)
  return r.json()
}

/**
 * Release discovery through the STAC catalogue.
 *
 * ⚠️ NOT from a remembered URL shape. Overture's own data README (read
 * 2026-09-20) says: "Use the Overture STAC catalog for authoritative release
 * discovery", and marks `releases.json` / `registry-manifest.json` DEPRECATED
 * and frozen, with `overture_releases.yaml` removed outright. Building against
 * the remembered API shape would have picked a frozen file.
 */
async function resolveCollection(pin) {
  const root = await getJson(STAC_ROOT)
  const children = root.links.filter(l => l.rel === 'child')
  const link = pin
    ? children.find(l => l.href.includes(`/${pin}/`))
    : children.find(l => /latest/i.test(l.title || '')) || children[0]
  if (!link) throw new Error(`no STAC release matching '${pin}' — available: ${children.map(c => c.title).join(', ')}`)
  const release = link.href.split('/').slice(-2)[0]
  const relCat = await getJson(link.href)
  const placesLink = relCat.links.find(l => l.rel === 'child' && l.title === 'places')
  if (!placesLink) throw new Error(`release ${release} has no 'places' theme`)
  const placesCat = await getJson(placesLink.href)
  const collLink = placesCat.links.find(l => l.rel === 'child')
  if (!collLink) throw new Error(`release ${release} places theme has no collection`)
  return { release, collection: await getJson(collLink.href) }
}

/** Prune 1 — the STAC item bboxes. Which parquet files can contain this town? */
async function filesIntersecting(collection, bbox) {
  const items = collection.links.filter(l => l.rel === 'item')
  const hits = []
  for (const l of items) {
    const it = await getJson(l.href)
    const [x0, y0, x1, y1] = it.bbox
    if (x1 >= bbox.minLon && x0 <= bbox.maxLon && y1 >= bbox.minLat && y0 <= bbox.maxLat)
      hits.push({ id: it.id, url: it.assets.aws.href, rows: Number(it.properties.num_rows) })
  }
  return { hits, total: items.length }
}

/** Prune 2 — parquet row-group statistics on the bbox struct Overture ships for exactly this. */
function groupsIntersecting(meta, bbox) {
  const picked = []
  let start = 0
  for (const rg of meta.row_groups) {
    const n = Number(rg.num_rows)
    const stat = (leaf) => rg.columns.find(c => (c.meta_data?.path_in_schema || []).join('.') === `bbox.${leaf}`)?.meta_data?.statistics
    const xmin = stat('xmin'), ymin = stat('ymin'), xmax = stat('xmax'), ymax = stat('ymax')
    // ⛔ No statistics is not "no overlap" — an absent stat means UNKNOWN, and
    // pruning on unknown would silently drop real places. Unknown reads the group.
    if (!xmin || !ymin || !xmax || !ymax) picked.push([start, start + n])
    else if (Number(xmax.max) >= bbox.minLon && Number(xmin.min) <= bbox.maxLon &&
             Number(ymax.max) >= bbox.minLat && Number(ymin.min) <= bbox.maxLat) picked.push([start, start + n])
    start += n
  }
  return picked
}

const first = (a) => (Array.isArray(a) && a.length ? a[0] : null)

/** The artifact record. Flat, local-framed, and carrying its own provenance. */
function toRecord(r) {
  const [x, z] = wgs84ToLocal(r.bbox.xmin, r.bbox.ymax) // point geometry: bbox is degenerate
  const addr = first(r.addresses)
  return {
    id: r.id,                                  // GERS id — stable across releases
    name: r.names?.primary || null,
    category: r.categories?.primary || null,
    alternate: r.categories?.alternate || [],
    // ⭐⭐ THE ROOT-TO-LEAF PATH, AND IT IS WHAT MAKES THE CLASSIFIER A KIT
    // METHOD RATHER THAN A LOOKUP TABLE. Overture has ~2000 leaf categories; an
    // enumerated leaf table would be correct on the town it was built for and
    // silently thin everywhere else. The HIERARCHY's root set is closed and
    // small (14, measured over a whole release), so `bake-content.js`'s
    // OVERTURE_ROOTS maps a closed vocabulary and a town nobody has looked at
    // classifies on the same table.
    // ⛔ Without this field every record classifies as NO CATEGORY — which is a
    // plausible-looking success, so `buildBaseListingsFromOverture` refuses an
    // artifact where no record carries one rather than reporting a thin town.
    hierarchy: r.taxonomy?.hierarchy || [],
    confidence: r.confidence ?? null,
    operating_status: r.operating_status || null,
    lon: r.bbox.xmin, lat: r.bbox.ymax,
    x, z,
    address: addr?.freeform || null,
    locality: addr?.locality || null,
    postcode: addr?.postcode || null,
    website: first(r.websites),
    phone: first(r.phones),
    socials: r.socials || [],
    // ⭐ THE LICENCE EVIDENCE. Per record, because the obligation is per record.
    sources: (r.sources || []).map(s => s.dataset).filter(Boolean),
  }
}

async function main() {
  const pin = arg('release')
  console.log(`[overture-places] scene=${SCENE}`)
  console.log(`  bbox: ${BBOX.minLon},${BBOX.minLat} → ${BBOX.maxLon},${BBOX.maxLat}`)

  const { release, collection } = await resolveCollection(pin)
  console.log(`  release: ${release}${pin ? ' (pinned)' : ' (latest)'}`)

  const { hits, total } = await filesIntersecting(collection, BBOX)
  console.log(`  prune 1 — STAC item bboxes: ${hits.length}/${total} files intersect`)
  // ⛔ LOUD. Zero files is not an empty town, it is a broken assumption — a bbox
  // in the wrong units, a frame that never got written, a theme that moved.
  if (!hits.length) throw new Error(
    `no Overture places file intersects this bbox. That is a BROKEN ASSUMPTION, not an empty town —\n` +
    `   check data/${SCENE}/geography.json's bbox is in WGS84 degrees and covers the town.`)

  let bytes = 0, requests = 0, scanned = 0
  const places = []
  for (const h of hits) {
    const byteLength = await byteLengthFromUrl(h.url)
    const raw = await asyncBufferFromUrl({ url: h.url, byteLength })
    const file = { byteLength, async slice(s, e) { requests++; const b = await raw.slice(s, e); bytes += b.byteLength; return b } }
    const meta = await parquetMetadataAsync(file)
    const groups = groupsIntersecting(meta, BBOX)
    console.log(`  prune 2 — ${h.id}: ${groups.length}/${meta.row_groups.length} row groups intersect`)
    for (const [rowStart, rowEnd] of groups) {
      const rows = await parquetReadObjects({ file, compressors, rowStart, rowEnd,
        columns: ['id', 'names', 'categories', 'taxonomy', 'confidence', 'addresses', 'websites', 'phones', 'socials', 'sources', 'bbox', 'operating_status'] })
      scanned += rows.length
      for (const r of rows) {
        const b = r.bbox
        if (b.xmax >= BBOX.minLon && b.xmin <= BBOX.maxLon && b.ymax >= BBOX.minLat && b.ymin <= BBOX.maxLat)
          if (r.names?.primary) places.push(toRecord(r))
      }
    }
  }
  console.log(`  prune 3 — per-row bbox: ${places.length} named places from ${scanned.toLocaleString()} rows scanned`)
  console.log(`  network: ${(bytes / 1e6).toFixed(1)} MB in ${requests} range requests`)

  // ⛔ LOUD, and for the same reason. A town with genuinely no places is
  // possible; a town whose fetch silently produced nothing is far likelier, and
  // writing an empty artifact would declare an external base that has no data
  // behind it — the guard downstream would then protect nothing, loudly.
  if (!places.length) throw new Error(
    `0 places in this bbox. Refusing to write an empty external base — an empty artifact would declare\n` +
    `   a base that has no data behind it. If this town genuinely has no Overture coverage, use the OSM base.`)

  // The dataset mix, said out loud at acquisition — this is what the town owes.
  const mix = new Map()
  for (const p of places) for (const d of p.sources) mix.set(d, (mix.get(d) || 0) + 1)
  const mixSorted = [...mix.entries()].sort((a, b) => b[1] - a[1])
  console.log(`  sources: ${mixSorted.map(([d, n]) => `${d} ${n}`).join(' · ')}`)

  const out = {
    meta: {
      scene: SCENE,
      source: 'overture-places',
      release,
      theme: 'places', type: 'place',
      bbox: { ...BBOX },
      fetched: new Date().toISOString().slice(0, 10),
      generator: 'fetch-overture-places.js',
      count: places.length,
      // ⛔ NOT a licence string. The licence is per dataset and is resolved from
      // these names by `overture-licence.mjs`; a dataset it does not know fails
      // loudly rather than defaulting. See this file's header.
      source_datasets: Object.fromEntries(mixSorted),
      licence_note: 'Overture PLACES has no theme-level licence. Obligations are per contributing dataset; the credit is derived from source_datasets. https://docs.overturemaps.org/attribution/',
    },
    places,
  }
  const dir = mapRawDir(SCENE)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'overture-places.json')
  writeFileSync(path, JSON.stringify(out, null, 1) + '\n')
  console.log(`  ✓ wrote ${path} (${places.length} places)`)
  console.log(`\n  ▶ next: declare the base in data/${SCENE}/content/listings.overrides.json —`)
  console.log(`      { "meta": { "baseSource": "overture" } }`)
  console.log(`    then: node cartograph/bake-content.js --scene=${SCENE}`)
}

main().catch(e => { console.error(`\n⛔ [overture-places] ${e.message}\n`); process.exit(1) })
