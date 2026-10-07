#!/usr/bin/env node
/**
 * "DOES THE PLAN MAP OPEN ON THE TOWN'S PLACES — THEIR DENSEST CLUSTER, INSIDE THE EXTENT, WITH NOTHING HIDDEN?"
 *
 * WHY (Warden, 2026-09-28): the compass left the ground rim for a screen ring, so the plan map no longer has to show
 * the whole disc; it opens on the places. frameDensest (src/lib/frameDensest.js, exported from Town) frames the
 * densest cluster of a set of places — computed from the places alone, the cluster's size from the data (k = ⌈√n⌉
 * nearest neighbours), never a metre value that suits one town.
 *
 * On every baked town with listings, for the largest category and for every listed place (a cold start), from the
 * REAL slab (buildings.json footprints, ground.json stencil):
 *   · the frame lies inside the Extent disc (|centre − stencil centre| + radius ≤ stencil radius);
 *   · it holds `count` of the framed places, count ≥ 1;
 *   · nothing vanishes: count ≤ placed, and placed + outside + unplaced = of — a listing with no building, or a
 *     building the slab does not have, or a place beyond the rim, is DISCLOSED by name (ids), never dropped;
 *   · the module carries no metre value (no numeric literal but 0, 1 and 2);
 *   · ⭐ A PIN SHOWS WHERE IT IS (2026-10-07): a frame on ONE building holds at least k = ⌈√N⌉ of the town's N buildings
 *     (the floor the frame is sized to), unless the Extent bounds it — never one roof filling the map.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-the-plan-opens-on-its-places.mjs [--self-test] [--table]
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const MOD = join(ROOT, 'src/lib/frameDensest.js')

export function placesOf(town) {
  const m = JSON.parse(readFileSync(join(ROOT, 'public/baked', town, 'buildings.json'), 'utf8'))
  const buf = readFileSync(join(ROOT, 'public/baked', town, m.bin))
  const fp = new Float32Array(buf.buffer, buf.byteOffset + m.footprintByteOffset, m.footprintPointCount * 2)
  const out = new Map()
  for (const e of m.buildings) {
    const [s, n] = e.footprintRange || []
    if (!n) continue
    let x = 0, z = 0
    for (let i = s; i < s + n; i++) { x += fp[i * 2]; z += fp[i * 2 + 1] }
    x /= n; z /= n
    let r = 0
    for (let i = s; i < s + n; i++) r = Math.max(r, Math.hypot(fp[i * 2] - x, fp[i * 2 + 1] - z))
    out.set(e.id, { x, z, radius: r })
  }
  return out
}
export function listingsOf(town) {
  const p = join(ROOT, 'cartograph/data', town, 'content/listings.json')
  if (!existsSync(p)) return null
  const raw = JSON.parse(readFileSync(p, 'utf8'))
  return Array.isArray(raw) ? raw : (raw.landmarks ?? raw.listings ?? [])
}
const stencilOf = (town) => JSON.parse(readFileSync(join(ROOT, 'public/baked', town, 'ground.json'), 'utf8')).stencil

export function cases() {
  const out = []
  for (const town of readdirSync(join(ROOT, 'public/baked'))) {
    if (!existsSync(join(ROOT, 'public/baked', town, 'buildings.json')) || !existsSync(join(ROOT, 'public/baked', town, 'ground.json'))) continue
    const L = listingsOf(town); if (!L?.length) continue
    const counts = {}
    for (const l of L) counts[l.category] = (counts[l.category] || 0) + 1
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    out.push({ town, places: placesOf(town), stencil: stencilOf(town), sets: {
      [`largest: ${top}`]: L.filter(l => l.category === top).map(l => l.building_id ?? null),
      'cold start (all listed)': L.map(l => l.building_id ?? null),
      'one place (a pin)': [L.map(l => l.building_id).find(id => id != null && placesOf(town).has(id))].filter(Boolean),
    } })
  }
  // A fixture no real town has yet: a place beyond the rim, a listing with no building, an id the slab lacks — so the
  // disclosure is exercised on every run, not only when a town happens to carry one.
  const ring = new Map(Array.from({ length: 9 }, (_, i) => [`p${i}`, { x: (i % 3) * 3, z: Math.floor(i / 3) * 3, radius: 1 }]))
  ring.set('beyond', { x: 500, z: 0, radius: 1 })
  out.push({ town: '(fixture)', places: ring, stencil: { center: [0, 0], radius: 100 }, sets: {
    'rim + gaps': [...ring.keys(), null, 'not-in-slab'],
  } })
  return out
}

export function audit(frameDensest, src, all) {
  const f = [], rows = []
  if (/\b(?!0\b|1\b|2\b)\d+(\.\d+)?\b/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))) f.push('src/lib/frameDensest.js carries a numeric literal — a metre value or a per-town constant (only 0, 1 and 2)')
  for (const c of all) for (const [set, ids] of Object.entries(c.sets)) {
    const r = frameDensest(c.places, ids, c.stencil)
    const tag = `${c.town} · ${set}`
    if (!r) { f.push(`${tag}: no frame`); continue }
    const d = Math.hypot(r.x - c.stencil.center[0], r.z - c.stencil.center[1])
    if (d + r.radius > c.stencil.radius * (1 + 1e-9)) f.push(`${tag}: the frame reaches ${(d + r.radius - c.stencil.radius).toFixed(1)} m beyond the Extent`)
    if (!(r.count >= 1) || r.count > r.placed) f.push(`${tag}: frames ${r.count} of ${r.placed} placed`)
    if (r.placed + r.outside.length + r.unplaced.length !== r.of || r.of !== ids.length) f.push(`${tag}: ${r.of} asked, ${r.placed} placed + ${r.outside.length} outside + ${r.unplaced.length} unplaced — something vanished`)
    if (set.startsWith('one place')) {
      const k = Math.ceil(Math.sqrt(c.places.size)), held = [...c.places.values()].filter(p => Math.hypot(p.x - r.x, p.z - r.z) + p.radius <= r.radius * (1 + 1e-9)).length
      const bounded = d + r.radius >= c.stencil.radius * (1 - 1e-9)
      if (held < k && !bounded) f.push(`${tag}: a one-building frame holds ${held} of the town's buildings, under its floor k = ${k} — the map shows the roof, not where it is`)
    }
    rows.push({ town: c.town, set, ...r, R: c.stencil.radius })
  }
  return { f, rows }
}

const IS_MAIN = import.meta.url === `file://${process.argv[1]}`
if (IS_MAIN) {
if (!existsSync(MOD)) { console.log(`⛔ FAIL — ${MOD.replace(ROOT, '')} does not exist: there is no densest-cluster frame`); process.exit(1) }
const { frameDensest } = await import(MOD)
const SRC = readFileSync(MOD, 'utf8')
const ALL = cases()

if (process.argv.includes('--self-test')) {
  const base = audit(frameDensest, SRC, ALL).f.length
  const wrap = (fn) => (...a) => fn(frameDensest(...a))
  const mutations = [
    ['the Extent bound is dropped', wrap(r => r && ({ ...r, radius: r.radius + 1e5 }))],
    ['an unplaced listing vanishes', wrap(r => r && ({ ...r, unplaced: r.unplaced.slice(1), of: r.of }))],
    ['a place outside is dropped silently', (p, ids, st) => { const r = frameDensest(p, ids, st); return r && { ...r, outside: [], placed: r.placed } }],
    ['a pin frames only its own roof (the floor sees no town)', (p, ids, st) => frameDensest(new Map([...ids].filter(id => p.has(id)).map(id => [id, p.get(id)])), ids, st)],
    ['a metre constant creeps in', null],
  ]
  let bad = 0
  for (const [n, fn] of mutations) {
    const caught = fn ? audit(fn, SRC, ALL).f.length > base : audit(frameDensest, SRC + '\nconst CLUSTER_M = 150', ALL).f.length > base
    if (!caught) bad++
    console.log(`${caught ? '✅ caught' : '⛔ MISSED'} — ${n}`)
  }
  process.exit(bad ? 1 : 0)
}

const { f, rows } = audit(frameDensest, SRC, ALL)
if (process.argv.includes('--table')) {
  console.log('town | set | framed / placed (of) | radius m | radius/R | outside | unplaced')
  for (const r of rows) console.log(`${r.town} | ${r.set} | ${r.count} / ${r.placed} (${r.of}) | ${r.radius.toFixed(0)} | ${(r.radius / r.R).toFixed(3)} | ${r.outside.join(' ') || '—'} | ${r.unplaced.map(String).join(' ') || '—'}`)
}
if (f.length) { console.log(`⛔ FAIL — ${f.length}\n   ${f.join('\n   ')}`); process.exit(1) }
console.log(`✅ ${rows.length} frames on ${ALL.length} towns: each inside the Extent, each on its densest cluster, nothing vanished`)
}
