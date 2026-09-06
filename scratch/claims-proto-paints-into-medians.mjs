#!/usr/bin/env node
// ⛔⛔ DOES ③ PAINT A SIDEWALK INSIDE A MEDIAN / LOOP INTERIOR? — the band ①②③ cannot zero.
//
// WHY. Jacob's eye, 2026-09-06, on Benton Place and the split carriageways. `LOOP-STREETS.md §2`
// rules the body role: sidewalk on the OUTER edge, and on the inner (median-facing) edge
// "curb + treelawn only — NO sidewalk; the treelawn flows into the median." `RIBBONS §3.5` says
// the same for a divided median. The legacy producer carries that knowledge as `isMedianTile`,
// which is WHY those tiles are carved rather than offset — the bake prints it:
// `[A07] 46 carve (13 small · 31 median-divided · 2 median-loop)`.
// ⛔ The ①②③ block contains NO median or loop handling at all (grep: zero references outside
// comments), and its own log says "ped ribbon off the CURB, MONO-WIDTH PER BLOCK". Mono-width has
// no per-side concept, so it cannot zero an inner side.
// ⇒ If ③ paints sidewalk into the medians, then ① as producer is a REGRESSION on exactly the
// tiles the carve path existed for — and it is invisible in an aggregate, because it is 33 of
// 211 tiles.
//
// ⭐ MEASURED BY CONTAINMENT, NEVER BY AREA. Every area-based reading this week has lied: an
// annulus's gross |area| summed 127× high, outer-minus-holes across a pooled band invented 237
// solids. A point either is or is not inside a ring; that has no sign convention to get wrong.
// ⛔ Authored state only, through `_proto-feed` (Layer 0 q3).
// ▶ node scratch/claims-proto-paints-into-medians.mjs [scene ...]
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'

const scenes = process.argv.slice(2)
if (!scenes.length) scenes.push('lafayette-square')

// even-odd containment: a point is inside a compound path if it is inside an odd number of rings
const inRing = (p, r) => {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j]
    if ((a[1] > p[1]) !== (b[1] > p[1]) &&
        p[0] < (b[0]-a[0]) * (p[1]-a[1]) / ((b[1]-a[1]) || 1e-12) + a[0]) inside = !inside
  }
  return inside
}
const inAny = (p, rings) => { let n = 0; for (const r of rings || []) if (r?.length >= 3 && inRing(p, r)) n++; return n % 2 === 1 }

let failed = false
for (const scene of scenes) {
  const f = feed(scene); if (!f) { failed = true; continue }
  const medians = f.ribbons.medians || []
  if (!medians.length) { console.log(`⛔ ${scene}: ribbons carry NO medians — the question cannot be asked here. NOT "clean".`); failed = true; continue }

  const r = buildProto(f, { emitArtifact: true })
  const bands = r.protoBands || {}
  const sw = bands.sidewalk || [], tl = bands.treelawn || []
  if (!sw.length) { console.log(`⛔ ${scene}: ③ built no sidewalk rings — NOT measured`); failed = true; continue }

  // sample the interior of each median ring; ask whether ③'s sidewalk covers those points
  let medWithSw = 0, medWithTl = 0, ptsIn = 0, ptsTot = 0
  const offenders = []
  for (const m of medians) {
    const ring = m.ring || m.points || m
    if (!Array.isArray(ring) || ring.length < 3) continue
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const p of ring) { x0=Math.min(x0,p[0]); x1=Math.max(x1,p[0]); z0=Math.min(z0,p[1]); z1=Math.max(z1,p[1]) }
    const N = 12, hits = []
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      const p = [x0 + (x1-x0)*i/N, z0 + (z1-z0)*j/N]
      if (!inRing(p, ring)) continue
      hits.push(p)
    }
    if (!hits.length) continue
    let nSw = 0, nTl = 0
    for (const p of hits) { ptsTot++; if (inAny(p, sw)) { nSw++; ptsIn++ } if (inAny(p, tl)) nTl++ }
    if (nSw) { medWithSw++; offenders.push({ name: m.name || m.skelId || '(unnamed)', frac: nSw/hits.length, n: hits.length }) }
    if (nTl) medWithTl++
  }

  console.log(`\n${'='.repeat(74)}\n${scene} — ${medians.length} median/loop-interior ring(s) in the artifact`)
  console.log(`   interior sample points tested: ${ptsTot}`)
  console.log(`   ⛔ medians with ③ SIDEWALK painted inside: ${medWithSw}`)
  console.log(`      (treelawn inside, which §2 ALLOWS — it flows into the median): ${medWithTl}`)
  if (medWithSw) {
    console.log(`   ${ptsIn} of ${ptsTot} interior points (${(100*ptsIn/ptsTot).toFixed(1)}%) fall inside a sidewalk ring.`)
    for (const o of offenders.sort((a,b) => b.frac-a.frac).slice(0, 12))
      console.log(`      ${String(o.name).padEnd(28)} ${(o.frac*100).toFixed(0)}% of ${o.n} interior points`)
    console.log(`   ⛔ VERDICT: ③ paints a sidewalk where LOOP-STREETS §2 / RIBBONS §3.5 require NONE.`)
    console.log(`      ①②③ carries no median or loop concept; the legacy CARVE path did, which is why`)
    console.log(`      those tiles are carved. Cause beyond that NOT established here.`)
    failed = true
  } else console.log(`   ✅ no median interior carries a ③ sidewalk.`)
}
console.log(`\n${failed ? '⛔ FAIL' : '✅ PASS'} — re-run this; do not quote its digits.`)
process.exit(failed ? 1 : 0)
