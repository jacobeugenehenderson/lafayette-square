#!/usr/bin/env node
// ⭐⭐⭐ CAN ONE FRONTAGE OWN THREE SIDES OF A BLOCK? On some blocks it does, and that is the
// operator's "when I swap one treelawn/sidewalk pair, it swaps all 4 sides."
// ▶ node checks/claims-frontage-covers-the-block.mjs [scene] [--tile N]
//
// ⛔ IT IS NOT THE LEG UNIT. On the block this was found on (LS tile 107, the 62-vertex block the
// painter's own comment names) the leg cut is CORRECT: 14 legs, all four corners found, every
// fillet tangent on the ring. What is wrong is OWNERSHIP — the tile carries frontage runs for only
// a fraction of its own contour, so the few it has are stamped across the rest of the ring.
//
// ⭐ THE SHAPE OF IT, and why it is invisible to a point count: each straight side of the block is
// ONE ring edge, tens of metres long, whose only vertex is a fillet TANGENT — a corner vertex. So
// the side inherits its owner from the corner, and whichever frontage happens to own the arc ends
// takes the side. Corners are ~5% of a contour by LENGTH and ~50% by POINTS; the ownership of the
// long straight edges is decided by the short curved ones.
//
// ⛔ DO NOT FILL-PATCH THIS. `SECTION §7`: clamp, wrap, re-key and snap were each built and
// reverted — each treats the OUTPUT of a wrong ownership decision. The cure is upstream, where the
// runs are built (`tileGround.js` ~:6890, the ① label carry) — the polygon must ask the stamp.
// ▶ the sibling gate on the same invariant: node checks/claims-ring-partition.mjs
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
const plen = p => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0]-p[i-1][0], p[i][1]-p[i-1][1]); return L }
const periOf = t => { let L = 0
  for (const ring of t.iaFull || []) for (let q = 0; q < ring.length; q++) {
    const a = ring[q], b = ring[(q+1) % ring.length]; L += Math.hypot(b[0]-a[0], b[1]-a[1]) }
  return L }
const argv = process.argv.slice(2)
const ONE = (() => { const i = argv.indexOf('--tile'); return i >= 0 ? +argv[i+1] : null })()
const scenes = argv.filter(a => !a.startsWith('--') && !/^\d+$/.test(a))
let bad = 0
for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) { bad++; continue }
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
  const rows = []
  for (const [ti, t] of T.entries()) {
    if (ONE != null && ti !== ONE) continue
    const peri = periOf(t); if (peri < 1) continue
    const runL = (t.runs || []).reduce((s, r) => s + plen(r.poly), 0)
    // how much contour each run is STAMPED onto, vs how long that run actually is
    const owned = new Map()
    for (const [ri, ring] of (t.iaFull || []).entries()) { const stp = t.iaStamp[ri] || [], n = ring.length
      for (let q = 0; q < n; q++) { const r = stp[q]; if (r == null) continue
        const a = ring[q], b = ring[(q+1) % n]
        owned.set(r, (owned.get(r) || 0) + Math.hypot(b[0]-a[0], b[1]-a[1])) } }
    const stamped = [...owned.values()].reduce((s, x) => s + x, 0)
    const top = [...owned].sort((a, b) => b[1] - a[1])[0]
    rows.push({ ti, peri, cov: runL / peri, unstamped: (peri - stamped) / peri,
                topShare: top ? top[1] / peri : 0, topRun: top ? t.runs[top[0]] : null, runs: (t.runs||[]).length })
  }
  // ⛔ THE ACCEPTANCE IS COVERAGE, AND ONLY COVERAGE: a block's own frontage runs must cover the
  // block's own contour. A run stamped onto ground it has no polyline for is owning by default.
  // ⚠️ `biggest owner` is CONTEXT, NOT A FAILURE — a block really can front one street for most of
  // its ring (a loop, an island, a wedge). ⛔ Layer 0 q3: a difference between blocks is the
  // product. Only the coverage line is evidence.
  const thin = rows.filter(r => r.cov < 0.5)
  const hog  = rows.filter(r => r.topShare > 0.5 && r.runs > 1)
  console.log(`\n══ ${scene} · ${rows.length} block(s) ══`)
  console.log(`  ⛔ frontage runs cover <50% of the block's own contour: ${thin.length}   ← the gate`)
  console.log(`  ·  one frontage stamped onto >50% of the contour:      ${hog.length}   (context, not a failure)`)
  const show = [...new Set([...hog, ...thin])].sort((a, b) => b.topShare - a.topShare).slice(0, 8)
  for (const r of show) console.log(`     tile ${String(r.ti).padStart(4)} · ${r.peri.toFixed(0).padStart(5)} m · ${r.runs} run(s) covering ${(100*r.cov).toFixed(0)}% · unstamped ${(100*r.unstamped).toFixed(0)}% · biggest owner ${(100*r.topShare).toFixed(0)}%  ${r.topRun ? r.topRun.skelId+'|'+r.topRun.side+'|'+r.topRun.segOrd : ''}`)
  if (thin.length) bad++
}
console.log(bad ? `\n⛔ FAIL — a frontage owns ground it has no polyline for. Swapping it swaps the block.`
                : `\n✅ PASS — every block's contour is covered by its own frontages.`)
process.exit(bad ? 1 : 0)
