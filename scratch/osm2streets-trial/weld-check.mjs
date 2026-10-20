#!/usr/bin/env node
// T1 step 2 (Boz, 2026-10-19): can raw/osm.json's ways be welded back into OSM nodes with no refetch? raw/osm.json keeps no
// node ids — each way's coords are {lon, lat, x, z}. The weld is "one node = one exact lon/lat", so measure, per town, over the
// highway ways (ground.highway — what osm2streets reads):
//   (a) lon/lat keys whose projected x,z differ between occurrences (the same key projected two ways) — must be 0;
//   (b) keys shared by ≥2 ways (the welded junctions) and by ≥2 places in one way (a loop closing / a self-touch);
//   (c) the two welds disagreeing: distinct lon/lat keys that our skeleton's own weld (`vKey`, x,z to 1 cm, skeleton.js) folds
//       into one point, on different ways — a node osm2streets would see split where our pipeline sees it shared;
//   (d) our skeleton's junctions (clean/skeleton.json) whose x,z equal an OSM highway coord exactly (to the cm both carry) —
//       the share joinable by welded node identity, never by proximity.
// Light: one JSON read per town, writes nothing.   node scratch/osm2streets-trial/weld-check.mjs [town…]
import fs from 'fs'
const towns = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync('cartograph/data').filter(t => fs.existsSync(`cartograph/data/${t}/raw/osm.json`))
const vKey = (p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`
for (const town of towns) {
  const o = JSON.parse(fs.readFileSync(`cartograph/data/${town}/raw/osm.json`, 'utf8')), ways = o.ground?.highway || []
  // MUTANT=1: nudge one shared node's lon by 1e-7 in ONE of its ways (x,z untouched) — (c) must go to ≥1
  if (process.env.MUTANT) { const seen = new Map(); outer: for (const w of ways) for (const c of w.coords || []) { const k = `${c.lon},${c.lat}`
    if (seen.has(k) && seen.get(k) !== w.osmId) { c.lon += 1e-7; console.log(`   MUTANT: ${k} on way ${w.osmId} → lon ${c.lon}`); break outer } seen.set(k, w.osmId) } }
  const byKey = new Map()             // lon,lat → { xz:Set, ways:Set, n }
  let coords = 0
  for (const w of ways) for (const c of w.coords || []) { coords++
    const k = `${c.lon},${c.lat}`; let e = byKey.get(k); if (!e) byKey.set(k, e = { xz: new Set(), ways: new Set(), n: 0, w2: new Map() })
    e.xz.add(vKey(c)); e.ways.add(w.osmId); e.n++; e.w2.set(w.osmId, (e.w2.get(w.osmId) || 0) + 1) }
  const a = [...byKey.values()].filter(e => e.xz.size > 1).length
  const shared = [...byKey.values()].filter(e => e.ways.size > 1).length
  const selfTouch = [...byKey.values()].filter(e => [...e.w2.values()].some(n => n > 1)).length
  const byV = new Map(); for (const [k, e] of byKey) for (const v of e.xz) { let s = byV.get(v); if (!s) byV.set(v, s = []); s.push([k, e]) }
  const split = [...byV].filter(([, ks]) => ks.length > 1 && new Set(ks.flatMap(([, e]) => [...e.ways])).size > 1)
  const sk = fs.existsSync(`cartograph/data/${town}/clean/skeleton.json`) ? JSON.parse(fs.readFileSync(`cartograph/data/${town}/clean/skeleton.json`, 'utf8')) : null
  const J = sk?.junctions || [], jHit = J.filter(j => byV.has(vKey(j))).length
  const jShared = J.filter(j => (byV.get(vKey(j)) || []).some(([, e]) => e.ways.size > 1)).length
  console.log(`── ${town}: ${ways.length} highway ways · ${coords} coords · ${byKey.size} distinct lon/lat`)
  console.log(`   (a) one lon/lat, two projections: ${a}`)
  console.log(`   (b) lon/lat shared by ≥2 ways: ${shared} · repeated within one way: ${selfTouch}`)
  console.log(`   (c) distinct lon/lat our 1 cm weld folds together, across ways: ${split.length}${split.length ? '  e.g. ' + split.slice(0, 4).map(([v, ks]) => `(${v}) ${ks.map(([k]) => k).join(' | ')}`).join(' ; ') : ''}`)
  console.log(`   (d) skeleton junctions: ${J.length} · at an OSM highway coord exactly: ${jHit} · of which that coord is shared by ≥2 ways: ${jShared}`)
}
