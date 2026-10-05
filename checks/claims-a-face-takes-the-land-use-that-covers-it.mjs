// claims-a-face-takes-the-land-use-that-covers-it.mjs
//
// ⭐⭐ THREE INVARIANTS — ① and ② ruled by Jacob 2026-09-25, ③ 2026-10-04:
//   ① A face takes the land use of what COVERS it, by area share — not the one whose
//      CENTROID happens to land inside it.
//   ② A compound feature votes as OUTER MINUS ITS HOLES. A hole does not inherit its
//      enclosing class; if nothing else classifies it, it surfaces as `underived`.
//   ③ ONE TAG IS ONE CLAIM: features sharing a tag are UNIONED, never summed, so ground a
//      town maps twice under one tag is not counted twice.
//
// ⛔⛔ WHY ①. The centroid vote was backwards for every feature bigger than a block, which is
// most of the ones that matter. A polygon voted for exactly ONE face however many it covered.
// MEASURED: Provincetown's median block face is 6,148 m²; its largest `natural=sand` is
// 4,130,249 m² — **672× the median face** — and `leisure=nature_reserve` runs to 29,047×.
// 391 of 1,406 LU features are larger than the median face. A dune town's beach classified
// one block and left the hundreds it lay across to fall through to `underived`.
//
// ⛔⛔ WHY ②. `unreadableFace` refused every holed feature, so the tag was never even looked
// up — Provincetown's 34 compound features carried 13,171,887 m², including the whole beach,
// while the kit had mapped `natural:sand → beach` all along. Refusing was right only in that
// voting the OUTER ring alone would FILL the hole; the repair is to subtract, not to drop.
//
// ⛔⛔ WHY ③. Huron's two `landuse=greenhouse_horticulture` polygons (Mucci Farms) are
// nested — 33.1 ha wholly inside 47.1 ha. Summed, they voted 80.2 ha, beat farmland's 56.2 ha,
// and painted a 156 ha block `greenhouse`. The union is 47.1 ha.
//
// ⭐ MUTATION TEST — each must turn this RED:
//   1. clip fill `pftEvenOdd` → `pftNonZero`  (a hole painted as its outer)   → ②
//   2. replace the coverage test with a centroid test (`pointInRing(cx,cz,…)`) → ①
//   3. drop the `for (const h of o.holes)` AddPath loop                        → ②
//   4. sum each feature's overlap per tag instead of unioning                 → ③
//   5. union with `pftEvenOdd` (a nested pair XORs: 47 − 33, the ring between)  → ③
//
//   node checks/claims-a-face-takes-the-land-use-that-covers-it.mjs
// Read-only, hermetic — no town needed, so it cannot pass vacuously in a worktree.
import { luCoverageForFace } from '../cartograph/derive.js'

// ⭐ `luCoverageForFace` returns { [sourceTag]: { lu, area } } — keyed by TAG, because the
// precedence rule (`luWinnerFromCoverage`) must know whether a claim is a ground cover or a
// jurisdiction, and the LU class cannot carry that. These two helpers roll it back up to
// "which class, and how much", which is what THIS check is about.
const byLu = (cov) => { const o = {}; for (const v of Object.values(cov)) o[v.lu] = (o[v.lu] || 0) + v.area; return o }

let failed = false
const say = (ok, msg) => { if (!ok) failed = true; console.log(`  ${ok ? '✅' : '⛔'} ${msg}`) }
const box = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]
const bbOf = (r) => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity
  for (const p of r) { if (p.x < a) a = p.x; if (p.x > b) b = p.x; if (p.z < c) c = p.z; if (p.z > d) d = p.z }
  return [a, b, c, d] }
let _t = 0
const poly = (lu, ring, holes = []) => ({ lu, tag: `test:${lu}${_t++}`, ring, holes, bb: bbOf(ring) })
const best = (o) => { let k = null, v = 0; for (const [a, b] of Object.entries(o)) if (b > v) { v = b; k = a } return k }

// ── ① COVERAGE, NOT CENTROID ──────────────────────────────────────────────────
{
  // a 2 km sand sheet whose centroid is far from this 100 m face
  const sand = poly('beach', box(-1000, -1000, 1000, 1000))
  const face = box(800, 800, 900, 900)          // inside the sheet, nowhere near its centroid
  const got = byLu(luCoverageForFace(face, [sand]))
  say(best(got) === 'beach', `a face COVERED by a 2 km sheet takes its class though the centroid is 1.1 km away — got ${best(got) ?? 'nothing'}`)
  say(Math.abs((got.beach ?? 0) - 10000) < 50, `and the vote is the OVERLAP area, 10,000 m² — got ${Math.round(got.beach ?? 0).toLocaleString()}`)
}
{
  // ⛔ the converse: a centroid landing inside must not outvote real coverage
  const big  = poly('beach', box(-500, -500, 500, 500))       // covers the face entirely
  const tiny = poly('parking', box(0, 0, 10, 10))             // centroid inside, 100 m²
  const face = box(-50, -50, 50, 50)
  const got = byLu(luCoverageForFace(face, [big, tiny]))
  say(best(got) === 'beach', `10,000 m² of coverage beats a 100 m² feature whose centroid sits inside — got ${best(got)}`)
}

// ── ② A HOLE IS NOT ITS OUTER ─────────────────────────────────────────────────
{
  // a wood with a pond punched out of it; the face sits INSIDE the pond
  const wood = poly('park', box(-500, -500, 500, 500), [box(-200, -200, 200, 200)])
  const face = box(-50, -50, 50, 50)            // wholly within the pond
  const got = byLu(luCoverageForFace(face, [wood]))
  say(!best(got), `a face inside the POND takes nothing from the wood around it — got ${best(got) ?? 'nothing'} (⇒ underived downstream)`)
}
{
  // the same wood, a face OUTSIDE the pond but inside the wood
  const wood = poly('park', box(-500, -500, 500, 500), [box(-200, -200, 200, 200)])
  const face = box(300, 300, 400, 400)
  const got = byLu(luCoverageForFace(face, [wood]))
  say(best(got) === 'park', `a face in the wood BESIDE the pond still takes the wood — got ${best(got) ?? 'nothing'}`)
}
{
  // ⭐ and the net area is outer MINUS hole, not the outer
  const wood = poly('park', box(-100, -100, 100, 100), [box(-50, -50, 50, 50)])
  const face = box(-100, -100, 100, 100)        // the whole feature
  const got = byLu(luCoverageForFace(face, [wood]))
  const want = 200 * 200 - 100 * 100            // 40,000 − 10,000
  say(Math.abs((got.park ?? 0) - want) < 50, `the vote is outer MINUS hole = ${want.toLocaleString()} m² — got ${Math.round(got.park ?? 0).toLocaleString()}`)
}
{
  // ⛔ a hole that ANOTHER feature covers takes that other class, not the enclosing one
  const wood  = poly('park',  box(-500, -500, 500, 500), [box(-200, -200, 200, 200)])
  const water = poly('water', box(-200, -200, 200, 200))
  const face  = box(-50, -50, 50, 50)
  const got = byLu(luCoverageForFace(face, [wood, water]))
  say(best(got) === 'water', `the pond's own feature classifies it, the wood does not — got ${best(got) ?? 'nothing'}`)
}

// ── ③ ONE TAG IS ONE CLAIM ───────────────────────────────────────────────────
const tagged = (tag, lu, ring, holes = []) => ({ lu, tag, ring, holes, bb: bbOf(ring) })
{
  // the Mucci Farms shape: one glasshouse polygon wholly inside another, same tag
  const outer = tagged('landuse:greenhouse_horticulture', 'greenhouse', box(0, 0, 200, 200))
  const inner = tagged('landuse:greenhouse_horticulture', 'greenhouse', box(50, 50, 150, 150))
  const farm  = tagged('landuse:farmland', 'agricultural', box(200, 0, 450, 200))
  const face  = box(0, 0, 450, 200)
  const got = byLu(luCoverageForFace(face, [outer, inner, farm]))
  say(Math.abs((got.greenhouse ?? 0) - 40000) < 50, `a polygon NESTED in another of its own tag counts once — union 40,000 m², got ${Math.round(got.greenhouse ?? 0).toLocaleString()}`)
  say(best(got) === 'agricultural', `so 50,000 m² of farmland beats 40,000 m² of glasshouse mapped twice — got ${best(got)}`)
}
{
  // two same-tag features that half-overlap: union, not sum
  const a = tagged('landuse:farmland', 'agricultural', box(0, 0, 100, 100))
  const b = tagged('landuse:farmland', 'agricultural', box(50, 0, 150, 100))
  const got = byLu(luCoverageForFace(box(0, 0, 150, 100), [a, b]))
  say(Math.abs((got.agricultural ?? 0) - 15000) < 50, `two half-overlapping features of one tag vote their union, 15,000 m² — got ${Math.round(got.agricultural ?? 0).toLocaleString()}`)
}
{
  // ⛔ a hole in one feature, covered by ANOTHER feature of the same tag, is covered once
  const holed = tagged('natural:wood', 'recreation', box(-100, -100, 100, 100), [box(-50, -50, 50, 50)])
  const plug  = tagged('natural:wood', 'recreation', box(-50, -50, 50, 50))
  const got = byLu(luCoverageForFace(box(-100, -100, 100, 100), [holed, plug]))
  say(Math.abs((got.recreation ?? 0) - 40000) < 50, `a hole plugged by a same-tag feature counts once — 40,000 m², got ${Math.round(got.recreation ?? 0).toLocaleString()}`)
}
{
  // and the union is PER TAG: two tags over the same ground each keep their full claim
  const wood  = tagged('natural:wood', 'recreation', box(0, 0, 100, 100))
  const grass = tagged('landuse:grass', 'recreation', box(0, 0, 100, 100))
  const cov = luCoverageForFace(box(0, 0, 100, 100), [wood, grass])
  say(Math.abs((cov['natural:wood']?.area ?? 0) - 10000) < 50 && Math.abs((cov['landuse:grass']?.area ?? 0) - 10000) < 50,
    `different tags are NOT merged — each keeps 10,000 m² (the cover/jurisdiction rule needs every tag) — got ${Math.round(cov['natural:wood']?.area ?? 0)} / ${Math.round(cov['landuse:grass']?.area ?? 0)}`)
}

console.log(`\n${failed ? '⛔ RED' : '✅ GREEN — a face takes what covers it, a hole is not its outer, and one tag is one claim.'}`)
process.exit(failed ? 1 : 0)
