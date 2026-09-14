#!/usr/bin/env node
// ⛔⛔ IS THE MEDIAN A HOLE IN ①, IDENTIFIABLE WITHOUT A `side` LABEL AND WITHOUT `pairId`?
//
// Jacob's ruling, 2026-09-06: "the line segments which make up the split carriageways each get 2
// sides; one side unites with its mate and becomes the median, and the other side emits the 1/2
// width. When there is no median, each side just emits its (authorable) half-width."
//
// ⭐ WHY THE LABEL-FREE FORM MATTERS AND IS NOT PEDANTRY. "Which side faces the median" is an OPEN,
// EYE-AWAITING question (`RIBBONS §3.5`): `innerSideSign` and `inboardKeyGeom` map the same perp to
// OPPOSITE labels, and read off the artifact the ped is zeroed on the side AWAY from the mate on
// 128 of 133 pairs across four towns. ⛔ So any rule keyed on `side` inherits an unresolved
// inversion. Jacob's phrasing routes around it: the median side is the one that UNITES WITH ITS
// MATE — i.e. the one bounding the shared hole. That is face-read, which is what the median ruling
// requires ("a median is a BLOCK"; "the chain apparatus knows NOTHING the polygon does not").
// ⛔ `pairId` is used HERE ONLY AS AN ORACLE to score the geometric test. It is NOT the mechanism —
// `RIBBONS §1`'s retirement list names it as apparatus this arc exists to delete.
// ▶ node checks/claims-proto-median-is-a-hole.mjs [scene ...]
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
const scenes = feedScenes()
// ⛔⛔ THE PRODUCER'S CONVENTION, NOT A COPIED ONE. `tileGround.js:1121` uses the cross-product
// shoelace and decides "hole" with `signedArea(ring) > 0 → skip`. Two probes in `scratch/` carry
// the OPPOSITE-SIGN trapezoid form, and pasting that here inverted the test: it skipped all 155
// holes and kept the 2 outer contours, then reported "no medians". A sign convention copied from a
// sibling probe instead of from the code that decides is a silent inversion.
const signedArea = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 } return a / 2 }
let failed = false
for (const scene of scenes) {
  const f = feed(scene); if (!f) { failed = true; continue }
  const r = buildProto(f)
  const O = r.protoOwners || []
  const pair = new Map(); for (const s of f.ribbons.streets) if (s.pairId) pair.set(s.skelId || s.name, s.pairId)
  let holes = 0, twoOwner = 0, mates = 0, notMates = 0
  const found = []
  for (let k = 0; k < (r.proto || []).length; k++) {
    const rg = r.proto[k], labs = r.protoLabels?.[k]
    if (!(rg?.length >= 3) || signedArea(rg) > 0 || !labs) continue   // holes only — the blocks
    holes++
    const owners = new Set()
    for (const l of labs) { const o = O[l]; if (o?.skelId) owners.add(o.skelId) }
    if (owners.size !== 2) continue
    twoOwner++
    const [a, b] = [...owners]
    if (pair.get(a) === b || pair.get(b) === a) { mates++; found.push(`${a} | ${b}  (${Math.abs(signedArea(rg)).toFixed(0)} m²)`) }
    else notMates++
  }
  console.log(`\n${scene}: ${holes} hole(s) in ① — the blocks`)
  console.log(`   bounded by exactly TWO chains: ${twoOwner}`)
  console.log(`      of which the two are MATES (oracle: pairId) → a MEDIAN: ${mates}`)
  console.log(`      two chains that are NOT mates: ${notMates}`)
  found.slice(0, 8).forEach(s => console.log(`         ${s}`))
  // ⛔ The honest verdict names what the test can and cannot do. "Bounded by exactly two chains" is
  // NOT the median test — an ordinary block between two streets is also two-owner. It is reported
  // so the gap between the geometric signal and the oracle is visible rather than assumed away.
  if (!mates) { console.log('   ⛔ NO median hole found by this test on this scene — do NOT read that as "no medians".'); failed = true }
}
console.log(`\n⛔ re-run this; do not quote its digits.`)
