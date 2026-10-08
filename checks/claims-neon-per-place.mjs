#!/usr/bin/env node
/**
 * "DOES EVERY OPEN PLACE GET ITS OWN NEON — OR SAY WHY NOT?" — BRIEF-neon-reads-at-every-distance §3.3.
 *
 * WHY THIS EXISTS (2026-10-06). Neon was one ring per building, keyed by ONE listing per building (last write won), so
 * a closed listing darkened a building where another place was open: on Huron at 21:00, 6 of 22 lit buildings had no
 * neon at all. Neon belongs to its PLACES: a building with any lit place rings its whole roofline (Jacob, 2026-10-08: "the
 * building must be very visible from different angles"), one lit place the whole ring, several in equal arcs, each in its
 * own colour — or the place is counted dark by a named cause.
 *
 * ⭐ READS THE SLAB AND RUNS THE PLAYER'S OWN CODE: public/baked/<town>/buildings.{json,bin} and content/listings.json,
 * through src/lib/neonPlaces.js#placeNeon and src/lib/openNow.js — what the player draws, not a restatement of it.
 *
 * Asserts, per town:
 *   - the slab carries the per-place stretches (a slab baked before them puts every place in the dark);
 *   - across a whole week, hourly, every lit place is placed or counted dark by a named cause (none vanish);
 *   - a lit building's arcs, together, are its WHOLE roofline (their lengths sum to its footprint's perimeter);
 *   - the REGRESSION receipts below: those buildings light at every hour any of their places is open.
 * Prints the census at --at (default: Friday 21:00 in the town's time zone).
 *
 *   node checks/claims-neon-per-place.mjs [--town=huron] [--at=2026-10-10T01:00:00Z]
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const { placeNeon, UNPLACED } = await import(process.env.NEON_PLACES || join(ROOT, 'src/lib/neonPlaces.js'))   // NEON_PLACES: a mutated copy, for the mutation test
const { isOpenAt } = await import(join(ROOT, 'src/lib/openNow.js'))
const { CATEGORY_LABELS } = await import(join(ROOT, 'src/tokens/categories.js'))

// The buildings found dark with a place open on 2026-10-06 (Huron, 21:00) — each must light whenever one is open.
const REGRESSION = { huron: ['msbf-283', 'msbf-326', 'msbf-2133', 'msbf-2695', 'msbf-3847', 'msbf-5139'] }

let failed = 0
const check = (ok, what, detail = '') => { console.log(`  ${ok ? '✅ pass' : '❌ FAIL'}  ${what}${!ok && detail ? `\n           ${detail}` : ''}`); if (!ok) failed++ }

const town = arg('town', 'huron')
const B = join(ROOT, 'public/baked', town)
const man = JSON.parse(readFileSync(join(B, 'buildings.json'), 'utf8'))
const bin = readFileSync(join(B, 'buildings.bin'))
const fp = new Float32Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), man.footprintByteOffset, man.footprintPointCount * 2)
const geo = ['geography.json', 'neighborhood.json'].map((f) => join(ROOT, 'cartograph/data', town, f)).find(existsSync)
const tz = geo && JSON.parse(readFileSync(geo, 'utf8')).timezone
if (!tz) throw new Error(`[neon-per-place] ⛔ ${town} has no timezone in cartograph/data/${town}/geography.json — its hours cannot be read`)
let listings = JSON.parse(readFileSync(join(B, 'content/listings.json'), 'utf8')); listings = Array.isArray(listings) ? listings : listings.listings
// SceneNeon.jsx#useNeonPlaceList, the same filter
const places = listings.filter((l) => l.status !== 'closed' && !l._bare && l.building_id && CATEGORY_LABELS[l.category])
const entries = man.buildings.map((b) => {
  const [s, n] = b.footprintRange
  const footprint = []; for (let i = 0; i < n; i++) footprint.push([fp[(s + i) * 2], fp[(s + i) * 2 + 1]])
  return { id: b.id, footprint, baseY: b.baseY, centroidY: b.centroidY, ranges: b.ranges, neon: b.neon }
})
const perimeter = (pts) => { let L = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]) } return L }
const length = (pts) => { let L = 0; for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return L }
const at = (when) => placeNeon({ entries, places, isLit: (p) => isOpenAt(p.hours || null, when, tz) })

console.log(`${town}: ${places.length} places · ${man.buildings.length} buildings · ${tz}`)
check(man.buildings.some((b) => b.neon), 'the slab carries per-place neon stretches',
  `re-bake buildings: node cartograph/bake-buildings.js --scene=${town} --look=${town}`)

// The census at one moment (what Jacob reads)
const atWhen = new Date(arg('at', '2026-10-10T01:00:00Z'))
const c = at(atWhen).census
const darkN = Object.values(c.dark).reduce((a, b) => a + b, 0)
console.log(`\n  at ${atWhen.toISOString()} (${new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(atWhen)} local): ${c.lit} open places`)
console.log(`    ringed ${c.ringed} · dark ${darkN}`)
for (const [why, n] of Object.entries(c.dark)) console.log(`      dark ${n}: ${why}`)
console.log('')

// A week, hourly, from --at
let roofline = 0, vanished = 0
const miss = new Map()
for (let h = 0; h < 7 * 24; h++) {
  const when = new Date(atWhen.getTime() + h * 3600e3)
  const { stretches, census } = at(when)
  const counted = census.ringed + Object.values(census.dark).reduce((a, b) => a + b, 0)
  if (counted !== census.lit) vanished++
  const byB = new Map(entries.map((e) => [e.id, e]))
  const sum = new Map(); for (const s of stretches) sum.set(s.buildingId, (sum.get(s.buildingId) || 0) + length(s.pts))
  for (const [id, L] of sum) if (Math.abs(L - perimeter(byB.get(id).footprint)) > 1e-3 * Math.max(1, L)) roofline++
  const litB = new Set(stretches.map((s) => s.buildingId))
  for (const id of REGRESSION[town] || []) {
    const open = places.filter((p) => p.building_id === id && isOpenAt(p.hours || null, when, tz))
    if (open.length && !litB.has(id)) miss.set(id, (miss.get(id) || 0) + 1)
  }
}
check(vanished === 0, 'every lit place, every hour of a week, is placed or counted dark by a named cause', `${vanished} hours where the counts don't add up`)
check(roofline === 0, "every lit building's arcs together are its whole roofline", `${roofline} building-hours whose neon is not its whole perimeter`)
for (const id of REGRESSION[town] || []) {
  const any = places.some((p) => p.building_id === id && p.hours)
  check(any && !miss.has(id), `${id} lights at every hour one of its places is open`,
    any ? `dark for ${miss.get(id)} open hour(s) of the week` : 'none of its places has hours')
}
check(Object.keys(UNPLACED).length > 0, 'the dark causes are named (neonPlaces.js#UNPLACED)')

console.log(failed ? `\n❌ ${failed} failed` : '\n✅ all passed')
process.exit(failed ? 1 : 0)
