#!/usr/bin/env node
// fetch-kerbs.mjs — THE TOWN'S KERB NODES, AS THEIR OWN RAW FILE (`BRIEF-corner-ramps-and-kerb §3` step 2).
//
// ⭐ WHERE THE KERB DROPS IS RECORDED IN OSM ON A NODE: `barrier=kerb` + `kerb=lowered|flush|raised|…`, usually the
// end vertex of a `footway=crossing` way. fetch.js asks for `node["highway"]` and the heavy tag set, so a kerb node
// that carries no highway tag was never acquired (`ROADMAP A09`'s remainder) — measured 2026-10-06 over HPDM's frozen
// bbox: 1,286 kerb nodes, none in its osm.json.
// ⭐ ADDITIVE, NEVER A RE-FETCH. The query runs over the bbox `raw/osm.json` was fetched with, and writes
// `raw/osm_kerbs.json` beside it; osm.json and everything derived from it stay byte-identical. A kerb node binds to
// a crossing way in osm.json by the shared OSM node's exact lon/lat (rounded the same way, 1e-7°) — identity, not
// distance (`cartograph/curb-cut-evidence.mjs`).
// ⛔ A town without this file is NOT a town without kerbs: the pour prints "kerb evidence: not fetched".
//
//   node fetch-kerbs.mjs --scene=<id>
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { RAW_DIR, SCENE, wgs84ToLocal, overpassBbox } from './config.js'
import { requireExplicitMap } from './scene.js'
import { overpassQuery } from './overpass.mjs'

requireExplicitMap('fetch-kerbs.mjs')
const osmPath = join(RAW_DIR, 'osm.json')
if (!existsSync(osmPath)) throw new Error(`${SCENE}: no ${osmPath} — kerbs are fetched over the bbox the town's OSM was fetched with, so fetch that first`)
const bbox = JSON.parse(readFileSync(osmPath, 'utf8')).bbox
if (!bbox || ![bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon].every(Number.isFinite))
  throw new Error(`${osmPath} carries no bbox — refusing to guess the envelope the kerbs belong to`)

const B = overpassBbox(bbox)
const query = `(\n  node["kerb"](${B});\n  node["barrier"="kerb"](${B});\n);\nout body;`
console.log(`fetch-kerbs.mjs — ${SCENE}: kerb nodes over osm.json's bbox ${B}`)
const data = overpassQuery(query, RAW_DIR)
const nodes = (data.elements || []).filter(e => e.type === 'node').map(e => {
  const [x, z] = wgs84ToLocal(e.lon, e.lat)
  return { osmId: e.id, tags: e.tags || {},
           lon: Math.round(e.lon * 1e7) / 1e7, lat: Math.round(e.lat * 1e7) / 1e7,
           x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 }
})
const byKind = {}; for (const n of nodes) { const k = n.tags.kerb ?? '(no kerb tag)'; byKind[k] = (byKind[k] || 0) + 1 }
const out = join(RAW_DIR, 'osm_kerbs.json')
writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), source: 'overpass', query, bbox, nodes }, null, 1))
console.log(`  ${nodes.length} kerb node(s): ${Object.entries(byKind).map(([k, v]) => `${v} ${k}`).join(' · ') || 'none'}`)
console.log(`  wrote ${out}`)
