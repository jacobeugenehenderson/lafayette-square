/**
 * a08-membership-equivalence.mjs — PROOF that unifying the three membership
 * filters onto cartograph/membership.mjs changes no answer on any real scene.
 *
 * Read-only. No pour, no bake. Replays the THREE historical predicates (verbatim,
 * as they stood at 8cc68d93) and the new shared one over every scene's committed
 * artifacts, and reports any building where they disagree.
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { createMembershipFilter, buildingIdOf } from '../cartograph/membership.mjs'

// ── the three OLD predicates, copied verbatim from git history ──────────────
function oldPIP(px, pz, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z
    if (((zi > pz) !== (zj > pz)) && (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)) inside = !inside
  }
  return inside
}
const ctx = (nb) => ({
  poly: Array.isArray(nb.polygon) && nb.polygon.length >= 3 ? nb.polygon : null,
  excl: Array.isArray(nb.exclusions) ? nb.exclusions.filter(e => Array.isArray(e) && e.length >= 3) : [],
  cx: nb.center?.[0] ?? 0, cz: nb.center?.[1] ?? 0, R2: (nb.radius ?? Infinity) ** 2,
})

function oldPreClip(b, { poly, excl, cx, cz, R2 }, activate, hide) {
  const pts = b.coords || b.ring || (b.rings && b.rings[0]) || []
  if (pts.length < 3) return true
  const id = b.msbfId != null ? `msbf-${b.msbfId}` : (b.osmId != null ? `osm-${b.osmId}` : null)
  if (id && hide.has(id)) return false
  let sx = 0, sz = 0
  for (const p of pts) { sx += (p.x ?? p[0]); sz += (p.z ?? p[1]) }
  const bx = sx / pts.length, bz = sz / pts.length
  if (id && activate.has(id)) return true
  for (const e of excl) if (oldPIP(bx, bz, e)) return false
  return poly ? oldPIP(bx, bz, poly) : (bx - cx) ** 2 + (bz - cz) ** 2 <= R2
}

function oldPostDerive(b, { poly, excl, cx, cz, R2 }, activate, hide) {
  const pts = b.ring || []
  if (!pts.length) return true
  const id = b.msbfId != null ? `msbf-${b.msbfId}` : (b.osmId != null ? `osm-${b.osmId}` : null)
  if (id && hide.has(id)) return false
  let sx = 0, sz = 0
  for (const p of pts) { sx += Array.isArray(p) ? p[0] : p.x; sz += Array.isArray(p) ? p[1] : p.z }
  const bx = sx / pts.length, bz = sz / pts.length
  if (id && activate.has(id)) return true
  for (const e of excl) if (oldPIP(bx, bz, e)) return false
  return poly ? oldPIP(bx, bz, poly) : (bx - cx) ** 2 + (bz - cz) ** 2 <= R2
}

function oldBake(b, { poly, excl, cx, cz, R2 }, activate, hide) {
  const fp = b.footprint || []
  if (fp.length < 3 || hide.has(b.id)) return false
  if (activate.has(b.id)) return true
  let sx = 0, sz = 0
  for (const [x, z] of fp) { sx += x; sz += z }
  const cxx = sx / fp.length, czz = sz / fp.length
  for (const e of excl) if (oldPIP(cxx, czz, e)) return false
  return poly ? oldPIP(cxx, czz, poly) : (cxx - cx) ** 2 + (czz - cz) ** 2 <= R2
}

// ── replay ──────────────────────────────────────────────────────────────────
const BASE = 'cartograph/data'
let totalChecked = 0, totalDiff = 0, scenesWithPoly = 0
const diffs = []

for (const scene of readdirSync(BASE)) {
  const nbP = join(BASE, scene, 'neighborhood_boundary.json')
  if (!existsSync(nbP)) continue
  const nb = JSON.parse(readFileSync(nbP, 'utf8'))
  const c = ctx(nb)
  if (c.poly) scenesWithPoly++
  const ovP = join(BASE, scene, 'building-overrides.json')
  let activate = new Set(), hide = new Set()
  if (existsSync(ovP)) {
    const ov = JSON.parse(readFileSync(ovP, 'utf8'))
    activate = new Set(ov.activate || []); hide = new Set(ov.hide || [])
  }

  const cases = []
  const mapP = join(BASE, scene, 'clean', 'map.json')
  if (existsSync(mapP)) cases.push(['map.json/post-derive', JSON.parse(readFileSync(mapP, 'utf8')).buildings || [], oldPostDerive, b => b.ring || null])
  const ledP = join(BASE, scene, 'buildings.json')
  if (existsSync(ledP)) {
    const d = JSON.parse(readFileSync(ledP, 'utf8'))
    cases.push(['ledger/bake', Array.isArray(d) ? d : (d.buildings || []), oldBake, b => b.footprint || null])
  }
  const rawP = join(BASE, scene, 'raw', 'msbf.json')
  if (existsSync(rawP)) {
    const d = JSON.parse(readFileSync(rawP, 'utf8'))
    const arr = Array.isArray(d) ? d : (d.buildings || [])
    cases.push(['raw/pre-clip', arr, oldPreClip, b => b.coords || b.ring || (b.rings && b.rings[0]) || null])
  }

  for (const [label, arr, oldFn, ringOf] of cases) {
    const m = createMembershipFilter({ nb, activate, hide, label: 'new' })
    let n = 0, d = 0
    for (const b of arr) {
      const oldAns = oldFn(b, c, activate, hide)
      const newAns = m.decide(buildingIdOf(b), ringOf(b))
      n++
      if (oldAns !== newAns) { d++; if (diffs.length < 10) diffs.push(`${scene}/${label} ${buildingIdOf(b)}: old=${oldAns} new=${newAns}`) }
    }
    totalChecked += n; totalDiff += d
    console.log(`${scene.padEnd(26)} ${label.padEnd(22)} n=${String(n).padStart(6)}  disagreements=${d}` +
                (m.stats.undecidable ? `  (undecidable ${m.stats.undecidable})` : ''))
  }
}

// ── the case A08 is ABOUT: a degenerate footprint. Old = 3 answers, new = 1. ──
console.log('\n' + '-'.repeat(70))
console.log('DEGENERATE FOOTPRINT (<3 vertices) — the divergence A08 fixes:')
{
  const nb = { center: [0, 0], radius: 1000 }
  const c = ctx(nb), A = new Set(), H = new Set()
  const two = [{ x: 1, z: 1 }, { x: 2, z: 2 }]
  const twoArr = [[1, 1], [2, 2]]
  const oldAnswers = {
    'pipeline/pre-clip': oldPreClip({ msbfId: 7, coords: two }, c, A, H),
    'pipeline/map.json': oldPostDerive({ msbfId: 7, ring: two }, c, A, H),
    'bake-buildings':    oldBake({ id: 'msbf-7', footprint: twoArr }, c, A, H),
  }
  const m = createMembershipFilter({ nb, activate: A, hide: H, label: 'new' })
  const newAnswer = m.decide('msbf-7', two)
  for (const [k, v] of Object.entries(oldAnswers)) console.log(`  OLD ${k.padEnd(20)} → ${v}`)
  const distinct = new Set(Object.values(oldAnswers))
  console.log(`  OLD: ${distinct.size} distinct answers for ONE building  ${distinct.size > 1 ? '❌ divergent — the bake drops what the 2D keeps' : ''}`)
  console.log(`  NEW  (all three call one function) → ${newAnswer}, undecidable=${m.stats.undecidable}  ✅ one answer`)

  // Case 2 separates the OTHER pair. Three RULES can only yield two booleans, so
  // one case cannot expose all three; this one puts the same degenerate footprint
  // OUTSIDE the disc, where pre-clip (keeps unconditionally) parts company with
  // post-derive (centroid-tests it). Together the two cases show all three rules
  // are pairwise distinct — which is what "three sites, three behaviours" means.
  const far = [{ x: 9e5, z: 9e5 }, { x: 9e5 + 1, z: 9e5 }]
  const farArr = [[9e5, 9e5], [9e5 + 1, 9e5]]
  const old2 = {
    'pipeline/pre-clip': oldPreClip({ msbfId: 8, coords: far }, c, A, H),
    'pipeline/map.json': oldPostDerive({ msbfId: 8, ring: far }, c, A, H),
    'bake-buildings':    oldBake({ id: 'msbf-8', footprint: farArr }, c, A, H),
  }
  const m4 = createMembershipFilter({ nb, activate: A, hide: H, label: 'new' })
  const new2 = m4.decide('msbf-8', far)
  console.log('\n  same degenerate footprint, OUTSIDE the disc:')
  for (const [k, v] of Object.entries(old2)) console.log(`  OLD ${k.padEnd(20)} → ${v}`)
  console.log(`  OLD: ${new Set(Object.values(old2)).size} distinct  ❌ pre-clip keeps what map.json drops`)
  console.log(`  NEW → ${new2}, undecidable=${m4.stats.undecidable}  ✅ one answer`)
  const allThreeDistinguished = (oldAnswers['bake-buildings'] !== oldAnswers['pipeline/map.json']) &&
                                (old2['pipeline/pre-clip'] !== old2['pipeline/map.json'])
  console.log(`\n  ⇒ all three old rules pairwise distinguished: ${allThreeDistinguished ? '✅ yes' : '❌ no'}`)
  if (!allThreeDistinguished) process.exit(1)

  // and the precedence itself: activate must beat an exclusion loop
  const nb2 = { center: [0, 0], radius: 1000, exclusions: [[{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 }]] }
  const m2 = createMembershipFilter({ nb: nb2, activate: new Set(['msbf-9']), hide: new Set(), label: 'new' })
  const inLoop = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }]
  const kept = m2.decide('msbf-9', inLoop)
  const m3 = createMembershipFilter({ nb: nb2, activate: new Set(), hide: new Set(), label: 'new' })
  const dropped = m3.decide('msbf-8', inLoop)
  console.log(`\nPRECEDENCE — a building inside an exclusion loop:`)
  console.log(`  without activate → ${dropped}  (expect false)`)
  console.log(`  with    activate → ${kept}  (expect true — the finest gesture wins)`)
  if (!(kept === true && dropped === false)) { console.log('❌ PRECEDENCE BROKEN'); process.exit(1) }
}

console.log('\n' + '='.repeat(70))
console.log(`checked ${totalChecked} building decisions across scenes (${scenesWithPoly} with a polygon)`)
console.log(totalDiff === 0
  ? '✅ ZERO disagreements — the unification is a no-op on every committed artifact.'
  : `❌ ${totalDiff} DISAGREEMENTS:\n  ` + diffs.join('\n  '))
process.exit(totalDiff === 0 ? 0 : 1)
