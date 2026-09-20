#!/usr/bin/env node
/**
 * scratch/water-disc-coverage.mjs — HOW MUCH OF A SCENE'S DISC IS WATER?
 *
 *   node scratch/water-disc-coverage.mjs --scene=huron
 *
 * Built 2026-09-19 (Strand) as the fixture for `ROADMAP H-2`/`H-4`. It reads the
 * POURED SCENE ON DISK — `raw/osm.json` + `neighborhood_boundary.json` — and makes no
 * network call, so it can be re-run against a scene as it actually is.
 *
 * ⭐ WHY IT EXISTS: H-2 says a waterfront town means "half our map reads like a
 * mistake." That is an aesthetic complaint until it has a number. This is the number.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ⛔⛔ THE BOUND. READ IT BEFORE TRUSTING AN ANSWER — THIS PROBE IS NOT VALID EVERYWHERE.
 *
 * Water is decided by NORTHWARD RAY PARITY against the water body's fetched boundary:
 * a point is water iff a ray to -z crosses that boundary an even number of times.
 * ⛔ That is only sound where the boundary spans the ray's whole column. A big lake's
 * ring is CLIPPED at the fetch envelope (`fetch.js` scopes relation members to the
 * bbox, deliberately — Erie has 1,223 members and only 17 are local), so OUTSIDE the
 * clipped span the parity flips on nothing and the answer is garbage.
 *
 * Measured instances of exactly that, on Huron: Cleveland Road East (52 verts),
 * Darrow Road (50) and Hull Road (48) all report WATER. All three lie beyond the
 * clipped lon span. They are instrument artifacts, NOT findings.
 *
 * ⇒ The probe therefore reports ONLY INSIDE THE DISC, and refuses if the disc is not
 *   contained in the clipped span. Do not lift the ray test out of here without
 *   carrying that refusal with it.
 *
 * ⭐ WHY THE IN-DISC ANSWER IS TRUSTWORTHY — two independent cross-validations that
 * must both come out ZERO, and are asserted below rather than described:
 *   · 0 of 4,933 skeleton vertices inside the disc fall over water
 *   · 0 of 4,307 building footprints inside the disc fall over water (OSM + MSBF)
 * Land reads as land. If either becomes non-zero the probe is lying — believe them,
 * not the percentage.
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * Baseline, Huron, 2026-09-19: 35.5% of the disc is Lake Erie — 13.96 of 39.35 km² —
 * and 41 of the municipal ring's 82 vertices are offshore.
 * ⛔ Do not quote that number; re-run. It moves with the disc and with the fetch.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const scene = (process.argv.find(a => a.startsWith('--scene=')) || '').split('=')[1]
if (!scene) { console.error('⛔ --scene=<name> is required.'); process.exit(2) }
const dir = join('cartograph', 'data', scene)
const rd = (f) => JSON.parse(readFileSync(join(dir, f), 'utf-8'))

const osm = rd('raw/osm.json')
const nb = rd('neighborhood_boundary.json')
const [cx, cz] = nb.center, R = nb.radius

// ── the water bodies: every fetched feature that is a water surface ──────────────
// ⛔ Tag-based, and on PURPOSE it includes relations: a lake is a multipolygon whose
// member ways are untagged, so a ways-only view of the scene has no lake in it at all.
const isWaterFeat = (f) => {
  const t = f.tags || {}
  return t.natural === 'water' || t.natural === 'coastline' || t.water ||
         t.waterway === 'riverbank' || t.landuse === 'reservoir'
}
const bodies = []
let sawRelation = false
for (const k of Object.keys(osm.ground || {})) for (const f of osm.ground[k]) {
  if (f.osmType === 'relation') sawRelation = true
  if (isWaterFeat(f)) bodies.push(f)
}

// ⛔⛔ THE VINTAGE GATE, AND IT IS THE MOST IMPORTANT LINE IN THIS FILE.
// A lake is a multipolygon RELATION with untagged members. A scene fetched before
// `fetch.js` acquired relations therefore contains no lake AT ANY TAG — so this probe
// would sail through it and print a confident "LANDLOCKED" for a town on Lake Erie.
// ⭐ That is Layer 0's second question committed by the instrument: a silent
// substitution that looks EXACTLY like a clean pass, and it is worst on precisely the
// towns this probe was built for. Refuse instead of answering.
if (!sawRelation) {
  console.error(`\n⛔ REFUSED — ${scene}'s raw/osm.json contains NO relation-sourced feature.`)
  console.error(`   This fetch predates relation acquisition (2026-09-19), so any lake, bay or`)
  console.error(`   large river is absent from it at every tag — a "landlocked" verdict here would`)
  console.error(`   be the instrument's blindness, not the town's geography.`)
  console.error(`   ▶ re-run: node cartograph/fetch.js --scene=${scene}\n`)
  process.exit(5)
}
if (!bodies.length) { console.log(`\n  ${scene}: no water features at all in raw/osm.json, and the fetch DOES carry relations — genuinely dry.\n`); process.exit(0) }

// Rays are cast against the LARGEST body only; a pond does not bound a neighborhood
// and including small closed rings would add parity flips the disc test cannot use.
bodies.sort((a, b) => b.coords.length - a.coords.length)
const body = bodies[0]
const segs = []
const push = (ring) => { for (let i = 0; i + 1 < ring.length; i++) segs.push([ring[i], ring[i + 1]]) }
push(body.coords)
for (const h of (body.holes || [])) push(h)   // an island is land: its edge flips parity too

// ── the bound, enforced ─────────────────────────────────────────────────────────
const xs = body.coords.map(p => p.x)
const spanLo = Math.min(...xs), spanHi = Math.max(...xs)
if (cx - R < spanLo || cx + R > spanHi) {
  // ⭐ TWO DIFFERENT ANSWERS WEAR THE SAME SYMPTOM, and `isClosed` separates them exactly —
  // no heuristic, no size threshold. A body we fetched WHOLE that still does not span the
  // disc cannot bound it: it is a pond, and the town is landlocked. A body that arrived
  // CLIPPED may well bound the disc — we simply did not fetch enough of it to tell, and
  // reporting a percentage off it would be inventing one.
  const label = `   disc x [${(cx - R).toFixed(0)}, ${(cx + R).toFixed(0)}] vs largest water body [${spanLo.toFixed(0)}, ${spanHi.toFixed(0)}]`
  if (body.isClosed) {
    console.log(`\n  ${scene}: LANDLOCKED for this disc.`)
    console.log(`  The largest fetched water body (${body.tags?.name || body.tags?.natural || '(unnamed)'}, ${body.osmType === 'relation' ? 'r' : 'w'}${body.osmId}) is CLOSED — fetched whole — and does not span the disc, so nothing bounds it with water.`)
    console.log(label + `\n`)
    process.exit(0)
  }
  console.error(`\n⛔ REFUSED — the largest water body is CLIPPED and does not span the disc, so we cannot tell whether it bounds the town.`)
  console.error(label)
  console.error(`   Ray parity is unsound outside the fetched span; the answer would be garbage. Widen the fetch envelope and re-run.\n`)
  process.exit(3)
}

const isWater = (px, pz) => {
  let n = 0
  for (const [a, b] of segs) {
    if ((a.x > px) === (b.x > px)) continue
    const t = (px - a.x) / (b.x - a.x)
    if (a.z + t * (b.z - a.z) < pz) n++
  }
  return n % 2 === 0
}

// ── the measurement ─────────────────────────────────────────────────────────────
const N = 400
let inDisc = 0, wet = 0
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  const px = cx - R + 2 * R * (i + 0.5) / N, pz = cz - R + 2 * R * (j + 0.5) / N
  if ((px - cx) ** 2 + (pz - cz) ** 2 > R * R) continue
  inDisc++; if (isWater(px, pz)) wet++
}
const discKm2 = Math.PI * R * R / 1e6
console.log(`\n  ${scene} — water body: ${body.tags?.name || body.tags?.natural || '(unnamed)'} (${body.osmType === 'relation' ? 'r' : 'w'}${body.osmId}, ${body.coords.length} verts, ${body.isClosed ? 'closed' : '⛔ OPEN/clipped'})`)
console.log(`  DISC IS ${(100 * wet / inDisc).toFixed(1)}% WATER — ${(discKm2 * wet / inDisc).toFixed(2)} of ${discKm2.toFixed(2)} km²`)

// ── the cross-validations. These are the reason to believe the line above. ──────
let sv = 0, sw = 0
try {
  for (const s of rd('clean/street-index.json').streets) for (const p of (s.points || [])) {
    if ((p.x - cx) ** 2 + (p.z - cz) ** 2 > R * R) continue
    sv++; if (isWater(p.x, p.z)) sw++
  }
} catch { /* no skeleton yet — the pour has not reached it */ }
let bv = 0, bw = 0
for (const f of (osm.buildings || [])) {
  const p = f.coords[0]; if ((p.x - cx) ** 2 + (p.z - cz) ** 2 > R * R) continue
  bv++; if (isWater(p.x, p.z)) bw++
}
console.log(`  cross-check · skeleton verts over water: ${sw}/${sv} · buildings over water: ${bw}/${bv}`)
if (sw || bw) {
  console.log(`  ⛔ NON-ZERO. Streets and buildings are on land by construction, so the ray test is WRONG here.`)
  console.log(`     Do not report the percentage above. Suspect the water ring's coverage of the disc's column.`)
  process.exit(4)
}
console.log(`  ✅ both zero — land reads as land, so the percentage stands.\n`)
