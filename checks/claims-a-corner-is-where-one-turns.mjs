#!/usr/bin/env node
// ⭐⭐⭐ A CORNER IS A VERTEX WHERE ① TURNS *AND* THE OWNER CHANGES — the shape answers WHETHER,
// the label answers WHOSE. ▶ node checks/claims-a-corner-is-where-one-turns.mjs [scene ...]
//
// ⛔ THE DEFECT THIS EXISTS FOR. `iaCorner` asked ONLY "did the owner change", and an owner is
// `protoOwners[].skelId` with the chain ordinal stripped — a CHAIN identity. `RIBBONS §1`: "① HAS
// NO NODES… ①'s contour runs straight through them and the only thing that changes is the LABEL."
// Jacob, 2026-09-07: "the protopolygon doesn't have a node/corner there in the first place."
// Where ① does not turn, a corner was minted anyway, no fillet rounded it (nothing turns, so
// nothing was rounded), and the pad fell back to "the one edge the owners meet across" — which on
// ①'s sparse contour is an entire block side.
//
// ⛔ MEASURED ON ①'s OWN SHARP RING, NEVER ON ②. ② eases a 90° corner into ~12 vertices of 7.5°,
// so a turn test on ② finds no corners at all on a rectangle. This reads ① directly.
// ⛔ NO THRESHOLD IS INVENTED HERE: FILLET_TURN_TOL is read OUT OF THE SOURCE, so it cannot go
// stale if the ruled constant ever moves.
import fs from 'fs'
import { feed, buildProto } from '../scratch/_proto-feed.mjs'

const src = fs.readFileSync(new URL('../src/lib/tileGround.js', import.meta.url), 'utf8')
const m = src.match(/const FILLET_TURN_TOL\s*=\s*([0-9.]+)\s*\*\s*Math\.PI\s*\/\s*180/)
if (!m) { console.log('⛔ cannot read FILLET_TURN_TOL out of tileGround.js — this check will not guess one'); process.exit(1) }
const TOL_DEG = Number(m[1]), TOL = TOL_DEG * Math.PI / 180

const scenes = process.argv.slice(2).filter(a => !a.startsWith('--'))
if (!scenes.length) scenes.push('lafayette-square', 'hipointe-demun')
const road = (id) => String(id ?? '').replace(/-\d+$/, '')
const SA = (rg) => { let a = 0; for (let i = 0; i < rg.length; i++) { const j = (i + 1) % rg.length; a += rg[i][0] * rg[j][1] - rg[j][0] * rg[i][1] } return a / 2 }

let failures = 0
for (const scene of scenes) {
  const f = feed(scene); if (!f) { failures++; continue }
  const r = buildProto(f, {})
  const owners = r.protoOwners || []
  let chg = 0, turns = 0, straight = 0
  const bad = []
  for (let k = 0; k < (r.proto || []).length; k++) {
    const rg = r.proto[k], L = (r.protoLabels || [])[k]
    if (!(rg?.length >= 3) || !L) continue
    if (SA(rg) >= 0) continue                        // ⛔ blocks are the HOLES of ①
    const n = rg.length
    const key = (q) => { const o = owners[L[q]]; return o ? `${road(o.skelId)}|${o.side}` : null }
    for (let q = 0; q < n; q++) {
      const a = key((q - 1 + n) % n), b = key(q)
      if (a == null || b == null || a === b) continue
      chg++
      const P = rg[(q - 1 + n) % n], V = rg[q], N = rg[(q + 1) % n]
      const d1 = [V[0] - P[0], V[1] - P[1]], d2 = [N[0] - V[0], N[1] - V[1]]
      const L1 = Math.hypot(d1[0], d1[1]) || 1, L2 = Math.hypot(d2[0], d2[1]) || 1
      const cr = (d1[0] * d2[1] - d1[1] * d2[0]) / (L1 * L2), dt = (d1[0] * d2[0] + d1[1] * d2[1]) / (L1 * L2)
      const th = Math.atan2(Math.abs(cr), dt)
      if (th >= TOL) turns++
      else { straight++; bad.push({ V, deg: th * 180 / Math.PI, edge: Math.max(L1, L2), a, b }) }
    }
  }
  bad.sort((x, y) => y.edge - x.edge)
  console.log(`\n══ ${scene} · ①'s sharp ring · owner change vs whether ① TURNS (tol ${TOL_DEG}°, read from source) ══`)
  console.log(`  owner-label changes on block contours   ${chg}`)
  console.log(`  ✅ ① TURNS — a real corner              ${turns}  (${(100 * turns / Math.max(1, chg)).toFixed(1)}%)`)
  console.log(`  ⛔ ① DOES NOT TURN — no node there      ${straight}  (${(100 * straight / Math.max(1, chg)).toFixed(1)}%)`)
  if (bad.length) {
    console.log(`  the longest frontage each one would have claimed as pad, had the label decided alone:`)
    for (const b of bad.slice(0, 5)) console.log(`     ${b.edge.toFixed(0).padStart(4)} m  at (${b.V[0].toFixed(1)},${b.V[1].toFixed(1)})  turn ${b.deg.toFixed(1)}°  ${b.a} → ${b.b}`)
  }
  // ⛔ THIS IS A POPULATION, NOT A PASS/FAIL. A label changing where ① runs straight is a REAL
  // state (a road's chunks meet on a straight face; the back of a T). What must never happen is
  // that state being treated as a corner — and THAT is gated by the pad-extent check, not here.
  console.log(`  ⇒ reported, not failed: these are legitimate label changes. The gate is that none`)
  console.log(`    of them draws a corner — ▶ node checks/claims-the-pad-is-the-size-of-the-corner.mjs ${scene}`)
}
process.exit(failures ? 1 : 0)
