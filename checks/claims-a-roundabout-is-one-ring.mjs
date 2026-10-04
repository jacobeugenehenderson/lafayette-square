#!/usr/bin/env node
// CLAIM — EVERY ROUNDABOUT OSM DECLARES ARRIVES AS ONE CLOSED CHAIN (cartograph/_archive/BRIEF-roundabout-is-one-ring-DELIVERED-2026-10-03.md).
//
// OSM cuts a roundabout into a way at every entry; each unnamed piece used to become its own chain,
// so the ring drew as arcs and its island never closed as a block. `skeleton.js` `weldRoundabouts`
// joins them. This check reads THE DECLARATION (`raw/osm.json`: ways tagged
// `junction=roundabout|circular`, grouped into rings by chaining TAIL→HEAD) against THE RESULT
// (`clean/skeleton.json`, by OSM way id — never by geometry), every scene:
//   ONE RING   — one street holds exactly this ring's ways, and it is closed.            ✅
//   PATH       — the ring's class is not a street class (a `service` ring) — in paths[].  ·
//   SPLIT      — the ring's ways are spread over more than one street.                    ⛔
//   OPEN       — one street, but not closed, or it carries non-ring ways too.             ⛔
//   ABSENT     — a ring way is in neither streets[] nor paths[].                          ⛔
//   STALE      — a street-class ring way sits in paths[]: the skeleton predates A19's
//                promotion. NOT CHECKED — re-skeleton; a stale frame proves nothing.
// A ring OSM itself does not close (pieces that do not chain back to the start) is printed by name
// as DECLARED OPEN — the skeleton keeps its pieces; that is OSM's state, not a weld failure.
//
// Reads the street classes out of `skeleton.js` (STREET_CLASSES) rather than restating them.
//
//   node checks/claims-a-roundabout-is-one-ring.mjs [scene…]
//   node checks/claims-a-roundabout-is-one-ring.mjs hipointe-demun --skeleton=/tmp/skel.json
//
// MUTATION (must go red): `weldRoundabouts(streets)` commented out in skeleton.js, run it to a temp
// --out, pass that file as --skeleton ⇒ HPDM reports its 5 split rings by street id.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const skelOverride = process.argv.find(a => a.startsWith('--skeleton='))?.slice('--skeleton='.length)

const sc = readFileSync(join(ROOT, 'cartograph/skeleton.js'), 'utf8').match(/const STREET_CLASSES = new Set\(\[([^\]]+)\]\)/)
if (!sc) { console.error('⛔ NOT CHECKED — STREET_CLASSES not found in cartograph/skeleton.js'); process.exit(2) }
const STREET = new Set([...sc[1].matchAll(/'([^']+)'/g)].map(m => m[1]))
const isStreetClass = (hw) => !!hw && STREET.has(hw.replace(/_link$/, ''))
const RING = new Set(['roundabout', 'circular'])
const key = (p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`

let red = 0, notChecked = 0
for (const scene of scenes('cartograph/data/<scene>/raw/osm.json')) {
  const osm = readJson(join(ROOT, `cartograph/data/${scene}/raw/osm.json`))
  const ways = (osm.ground?.highway || []).filter(f => RING.has(f.tags?.junction))
  const skelPath = skelOverride || join(ROOT, `cartograph/data/${scene}/clean/skeleton.json`)
  if (!ways.length) { console.log(`\n${scene}: 0 roundabout ways declared`); continue }
  if (!existsSync(skelPath)) { console.log(`\n${scene}: ⛔ NOT CHECKED — no skeleton.json`); notChecked++; continue }
  const skel = readJson(skelPath)

  // The declaration: rings = cycles of TAIL→HEAD; anything else is a declared-open run.
  const byHead = new Map()
  for (const w of ways) { const k = key(w.coords[0]); byHead.set(k, [...(byHead.get(k) || []), w]) }
  const rings = [], declaredOpen = [], used = new Set()
  for (const w of ways) {
    if (used.has(w)) continue
    const run = [w], seen = new Set([w])
    let c = w
    for (;;) {
      const nx = byHead.get(key(c.coords[c.coords.length - 1])) || []
      if (nx.length !== 1) { c = null; break }
      c = nx[0]
      if (seen.has(c)) break
      run.push(c); seen.add(c)
    }
    if (c === w) { rings.push(run); run.forEach(m => used.add(m)) }
  }
  for (const w of ways) if (!used.has(w)) declaredOpen.push(w)

  const streetOf = new Map(), pathOf = new Map()
  for (const s of skel.streets || []) for (const id of s.osmIds || s.sources || []) streetOf.set(id, s)
  for (const p of skel.paths || []) pathOf.set(p.osmId, p)
  const tally = { one: 0, path: 0, split: [], open: [], absent: [], stale: [] }
  for (const ring of rings) {
    const ids = ring.map(w => w.osmId), label = `[${ids.join(' ')}]${ring[0].tags?.name ? ` "${ring[0].tags.name}"` : ''} (${[...new Set(ring.map(w => w.tags.highway))].join('/')})`
    if (ring.every(w => pathOf.has(w.osmId) && !isStreetClass(w.tags.highway))) { tally.path++; continue }
    if (ring.some(w => pathOf.has(w.osmId) && isStreetClass(w.tags.highway))) { tally.stale.push(label); continue }
    if (ring.some(w => !streetOf.has(w.osmId) && !pathOf.has(w.osmId))) { tally.absent.push(label); continue }
    const holders = [...new Set(ring.map(w => streetOf.get(w.osmId)).filter(Boolean))]
    if (holders.length !== 1 || ring.some(w => !streetOf.has(w.osmId))) { tally.split.push(`${label} → ${holders.map(s => s.id).join(', ')}`); continue }
    const s = holders[0], pts = s.points
    const closed = pts.length >= 4 && Math.hypot(pts[0].x - pts.at(-1).x, pts[0].z - pts.at(-1).z) < 1e-6
    const foreign = (s.osmIds || s.sources || []).filter(id => !ids.includes(id))
    if (!closed || foreign.length) { tally.open.push(`${label} → ${s.id}${closed ? '' : ' not closed'}${foreign.length ? ` +${foreign.length} non-ring way(s)` : ''}`); continue }
    tally.one++
  }
  const bad = tally.split.length + tally.open.length + tally.absent.length
  console.log(`\n${scene}: ${ways.length} roundabout way(s) → ${rings.length} declared ring(s) · ${tally.one} ONE RING${tally.path ? ` · ${tally.path} PATH (not a street class)` : ''}${bad ? ` · ⛔ ${bad} NOT ONE RING` : ''}${tally.stale.length ? ` · ⛔ ${tally.stale.length} STALE` : ''}`)
  for (const l of tally.split) console.log(`  ⛔ SPLIT  ${l}`)
  for (const l of tally.open) console.log(`  ⛔ OPEN   ${l}`)
  for (const l of tally.absent) console.log(`  ⛔ ABSENT ${l}`)
  for (const l of tally.stale) console.log(`  ⛔ STALE  ${l} — street-class ring way(s) in paths[]: skeleton predates A19, re-run skeleton.js. NOT CHECKED.`)
  for (const w of declaredOpen) console.log(`  ⚠️ DECLARED OPEN  ${w.osmId} (${w.tags.highway}) — OSM's ring pieces do not chain back to the start; the skeleton keeps them as pieces`)
  red += bad
  if (tally.stale.length) notChecked++
}
console.log(red ? `\n⛔ ${red} declared ring(s) did not arrive as one closed chain.` : notChecked ? `\n⛔ NOT CHECKED on ${notChecked} scene(s) — stale or missing skeleton. Not a pass.` : `\n✅ every declared roundabout arrives as one closed chain (or is a path by class).`)
process.exit(red ? 1 : notChecked ? 2 : 0)
