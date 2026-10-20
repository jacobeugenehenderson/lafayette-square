#!/usr/bin/env node
// Classifier, "keep what we take in": (1) per town, how many chains carry each lane-breakdown tag on a source way;
// (2) which raw way tag keys the chain record dropped BEFORE `carryWays` (only the derived fields reached a named
// chain), by key and way count; (3) which raw ways reach no chain and no path at all (Tally, 2026-10-20).
// ▶ node scratch/style-guide/classifier-tag-census.mjs <town> <skeleton.json>
import { readFileSync } from 'node:fs'
const [town, skelP] = process.argv.slice(2)
const sk = JSON.parse(readFileSync(skelP, 'utf8'))
const raw = JSON.parse(readFileSync(`cartograph/data/${town}/raw/osm.json`, 'utf8')).ground.highway
const tagsOf = new Map(raw.map(f => [f.osmId, f.tags || {}]))
const LANE = [['lanes:forward', /^lanes:forward$/], ['lanes:backward', /^lanes:backward$/], ['lanes:both_ways', /^lanes:both_ways$/],
  ['turn:lanes*', /^turn:lanes/], ['centre_turn_lane', /^centre_turn_lane$/], ['width:lanes*', /^width:lanes/]]
const lane = Object.fromEntries(LANE.map(([k]) => [k, 0]))
for (const s of sk.streets) for (const [k, re] of LANE) if (s.sources.some(id => Object.keys(tagsOf.get(id) || {}).some(x => re.test(x)))) lane[k]++
// What a named chain carried before carryWays: these fields, derived from its ways' tags.
const CARRIED = new Set(['highway', 'name', 'oneway', 'lanes', 'surface', 'maxspeed', 'ref', 'layer', 'bridge', 'tunnel', 'junction', 'expressway'])
const dropped = new Map()
for (const s of sk.streets) {
  if (s.synthetic) continue                      // synthetic chains always carried `tags`
  for (const id of s.sources) for (const k of Object.keys(tagsOf.get(id) || {})) if (!CARRIED.has(k)) dropped.set(k, (dropped.get(k) || 0) + 1)
}
const inRecord = new Set([...sk.streets.flatMap(s => s.sources), ...sk.paths.map(p => p.osmId)])
const lost = new Map()
for (const f of raw) if (!inRecord.has(f.osmId)) { const k = `highway=${f.tags?.highway}${f.tags?.name ? ` "${f.tags.name}"` : ''}`; lost.set(k, (lost.get(k) || 0) + 1) }
const carriedNow = sk.streets.every(s => s.ways && s.sources.every(id => JSON.stringify(s.ways[id]) === JSON.stringify(tagsOf.get(id))))
console.log(`${town}: chains ${sk.streets.length} · lane-breakdown chains: ${Object.entries(lane).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
console.log(`   dropped from named chains BEFORE the carry: ${dropped.size} keys over ${[...dropped.values()].reduce((a, b) => a + b, 0)} way-tags; top: ${[...dropped].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
console.log(`   every chain now carries its ways' full tags verbatim: ${carriedNow ? 'YES' : '⛔ NO'}`)
console.log(`   raw ways in NO chain and NO path: ${[...lost.values()].reduce((a, b) => a + b, 0)} — ${[...lost].map(([k, n]) => `${k} ×${n}`).join(' · ') || 'none'}`)
