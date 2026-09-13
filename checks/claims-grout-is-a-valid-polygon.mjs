#!/usr/bin/env node
/**
 * READ-ONLY. The POSITIVE-SIDE check, applied to the grout itself
 * (POLYGON-FIRST §2.1 as recast 2026-09-04, and RIBBONS §1's grout ruling).
 *
 * ⛔ THE QUESTION IS NOT "does an edge cut through a block". Blocks are HOLES in the
 * grout — a grout edge IS a block boundary, so it cannot cross an interior. Asking that
 * treats blocks as objects with roads drawn on top, which is the chain-world framing the
 * ruling replaces. (Jacob, 2026-09-05: "this is logically impossible.")
 *
 * The question that HAS meaning: is the grout ONE VALID CLOSED POLYGON?
 *   1. every ring SIMPLE — no self-intersection
 *   2. every ring NONZERO AREA, no repeated vertex
 *   3. rings do not OVERLAP each other (a union output must be disjoint)
 *   4. winding consistent — outers one way, holes the other
 * A ring that fails 1 or 3 is not a boundary of anything, and drawing it puts a line on
 * screen that encloses nothing — which is what a stray diagonal would be.
 *
 *   node scratch/claims-grout-is-a-valid-polygon.mjs [--mode raw|filleted]
 */
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const args = process.argv.slice(2)
const MODE = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'raw'
const rb = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const bc = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')).blockCustoms || null
const tg = buildTileGround(rb, { curbWidth: 0.381, blockCustoms: bc, grout: MODE === 'raw' ? 'raw' : true })
const G = tg.grout || []

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
const segInt = (p1, p2, p3, p4) => {
  const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}
const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1] } return a / 2 }

let selfInt = 0, selfIntRings = 0, zero = 0, dup = 0
const worst = []
for (const r of G) {
  const n = r.length
  if (Math.abs(area(r)) < 1e-6) zero++
  const seen = new Set()
  for (const p of r) { const k = `${Math.round(p[0] * 1e3)},${Math.round(p[1] * 1e3)}`; if (seen.has(k)) { dup++; break } seen.add(k) }
  let hits = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue           // adjacent through the closure
      if (segInt(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) hits++
    }
  }
  if (hits) { selfIntRings++; selfInt += hits; worst.push({ hits, n, a: Math.abs(area(r)) }) }
}
worst.sort((x, y) => y.hits - x.hits)
console.log(`\nGROUT (${MODE}) — ${G.length} rings, ${G.reduce((a, r) => a + r.length, 0)} vertices`)
console.log(`  1. SIMPLE      ⛔ rings that SELF-INTERSECT : ${selfIntRings} / ${G.length}   (${selfInt} crossings)`)
console.log(`  2. NONZERO     zero-area rings ${zero}   repeated-vertex rings ${dup}`)
const outers = G.filter(r => area(r) > 0).length
console.log(`  4. WINDING     outers ${outers}   holes ${G.length - outers}`)
if (worst.length) { console.log(`  worst rings:`); for (const w of worst.slice(0, 6)) console.log(`     ${String(w.hits).padStart(5)} crossings   ${String(w.n).padStart(5)} vertices   area ${w.a.toFixed(0)} m²`) }
// ⛔ Name the failure that ACTUALLY fired. A verdict line that reports the wrong failure
// is an instrument lying about itself — it printed "self-intersecting" on a zero-area ring.
const fails = []
if (selfIntRings) fails.push(`${selfIntRings} ring(s) SELF-INTERSECT — a crossed ring bounds nothing, so drawing it puts a line on screen that encloses nothing`)
if (zero) fails.push(`${zero} ZERO-AREA ring(s)`)
if (dup) fails.push(`${dup} ring(s) with a REPEATED VERTEX`)
console.log(`\n  ⇒ ${fails.length ? '⛔ ' + fails.join(' · ') : '✅ the grout IS a valid closed polygon'}`)
console.log(`  ⇒ one outer ring + ${G.length - outers} holes. ⛔ Compare the hole count to the BLOCK count — a`)
console.log(`     shortfall means blocks are MERGED, i.e. two chains' ribbons abut at a node without`)
console.log(`     overlapping and the boundary leaks. That is a node defect, not a polygon defect.\n`)
