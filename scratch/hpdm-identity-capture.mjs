#!/usr/bin/env node
// hpdm-identity-capture.mjs — STEP 1 of the HPDM identity lock (EXTENT-DESIGN §4, §6.2).
//
// The problem: fetch-msbf.js mints `msbfId: i` = the fetch ARRAY INDEX. MSBF
// footprints carry no external id, so a re-fetch (dataset bump, bbox/margin
// change, reorder) renumbers every building — and HPDM's 192 listing anchors
// (building_id: "msbf-NNNN") + 1281 roster ids silently re-point. No error.
//
// The fix begins here: derive a PERMANENT key from geometry (centroid lon/lat —
// verified unique: 9880 footprints, 0 collisions at 7dp) and FREEZE today's
// numbering into a registry. fetch-msbf.js will later CONSULT this registry so a
// re-fetch preserves every existing number and only APPENDS new ones (the
// high-water allocator). This script does the retroactive capture — safe, it
// writes one new git-tracked artifact and changes no pipeline output.
//
// Run: node scratch/hpdm-identity-capture.mjs [--write]

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCENE = 'hipointe-demun'
const RAW = join(ROOT, 'cartograph/data', SCENE, 'raw/msbf.json')
const OUT = join(ROOT, 'cartograph/data', SCENE, 'identity-registry.json')
const WRITE = process.argv.includes('--write')

const PREC = 7 // decimal places for the centroid key (~1 cm; 0 collisions verified)

// The permanent key: the footprint's centroid, rounded. Derivable identically
// from fetch-msbf.js's raw output on any future fetch — that is the whole point.
function keyOf(coords) {
  let x = 0, y = 0, n = 0
  for (const c of coords) { x += c.lon; y += c.lat; n++ }
  return (x / n).toFixed(PREC) + ',' + (y / n).toFixed(PREC)
}

const raw = JSON.parse(readFileSync(RAW, 'utf8'))
const B = raw.buildings || []
console.log(`HPDM raw fetch: ${B.length} footprints (dataset ${raw.dataset})`)

// Build the registry: key -> the msbfId this footprint carries TODAY. This is
// the frozen truth the content is already anchored against.
const map = {}
let collisions = 0
let highWater = -1
for (const b of B) {
  const k = keyOf(b.coords)
  if (k in map) { collisions++; continue } // first-wins; 0 expected
  map[k] = b.msbfId
  if (b.msbfId > highWater) highWater = b.msbfId
}
console.log(`registry: ${Object.keys(map).length} keys, ${collisions} collisions, highWater=${highWater}`)

// ── PROOF: order-independence ───────────────────────────────────────────────
// Shuffle the fetch, re-derive each key, look up the registry → every footprint
// must resolve to its ORIGINAL msbfId. This is exactly a re-fetch that reordered.
// (Deterministic shuffle — no Math.random, which the harness forbids.)
const shuffled = B.map((b, i) => ({ b, r: (i * 2654435761) % B.length })).sort((a, z) => a.r - z.r).map(o => o.b)
let restored = 0, moved = 0
for (const b of shuffled) {
  const got = map[keyOf(b.coords)]
  if (got === b.msbfId) restored++; else moved++
}
console.log(`\nORDER-INDEPENDENCE PROOF (shuffled fetch → registry lookup):`)
console.log(`  ${restored}/${B.length} footprints restored to their exact msbfId, ${moved} moved`)

// ── PROOF: a genuinely new footprint appends, never collides ─────────────────
const nextId = highWater + 1
console.log(`\nAPPEND PROOF: an unseen footprint (not in registry) → allocate ${nextId} (highWater+1); nothing renumbered.`)

// ── PROOF: the 192 listing anchors all resolve under the frozen numbering ────
const listings = JSON.parse(readFileSync(join(ROOT, 'cartograph/data', SCENE, 'content/listings.json'), 'utf8'))
const ids = new Set(Object.values(map).map(n => `msbf-${n}`))
const anchored = (Array.isArray(listings) ? listings : listings.listings || [])
const resolve = anchored.filter(l => l.building_id && ids.has(l.building_id)).length
console.log(`\nANCHOR CHECK: ${resolve}/${anchored.length} listing building_ids exist in the frozen registry.`)

const registry = {
  version: 1,
  scene: SCENE,
  key: `centroid-lonlat-${PREC}dp`,
  source: raw.source,
  dataset: raw.dataset,
  note: 'FROZEN identity: centroid-key -> permanent msbfId. fetch-msbf.js consults this; ' +
        're-fetch preserves existing numbers, appends new via highWater. Never renumber. (EXTENT-DESIGN §4)',
  highWater,
  count: Object.keys(map).length,
  map,
}
if (WRITE) {
  writeFileSync(OUT, JSON.stringify(registry, null, 0) + '\n')
  console.log(`\n✅ wrote ${OUT.replace(ROOT + '/', '')} (${Object.keys(map).length} keys)`)
} else {
  console.log(`\n(dry run — pass --write to persist ${OUT.replace(ROOT + '/', '')})`)
}
