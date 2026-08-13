// Companion to a TEMPORARY src/ instrumentation of tileGround.js's END COUPLER
// (:2307-2380). ⛔ THE INSTRUMENTATION IS REVERTED — this script prints nothing
// on its own. To re-run it, re-add a `globalThis.__COUPLER_TRACE.push({...})` at
// the three `continue`s and after the last guard; the patch is in the commit
// message of this file's commit.
//
// What it measured, 2026-08-12 (shape.json sha 05666e18, authoring loaded):
//   78 shoulder evaluations over 39 caps
//   72 SKIP — all one reason: ':2352-2355 compares walk parity and ped totals,
//             never the asphalt half-width'
//    6 FIRE — only where a capFlip makes parity differ; offset error 0.0000 m in
//             all six, because the picked leg's aBase happened to equal cap hw
//   11 of 39 caps resolve BOTH shoulders to the SAME leg (bodyOf returns the
//      same node for both legs of a pendant — they share one centerline)
import fs from 'node:fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
const sh = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
const dg = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8'))
const bc = dg.blockCustoms || null, CW = dg.curbWidth ?? 0.381
const only = process.argv[2] || null
for (const [ti, st] of sh.tiles.entries()) {
  const tips = (st.roundTips || [])
  if (!tips.length) continue
  if (only && !tips.some(t => t.skelId === only)) continue
  globalThis.__COUPLER_TRACE = []
  try { sectionPassTile(st, CW, { outer: 'LU', inner: 'SW' }, bc) } catch (e) { console.log(`tile ${ti} THREW ${e.message}`); continue }
  for (const r of globalThis.__COUPLER_TRACE) {
    const t = tips.find(x => Math.hypot(x.p[0] - r.tip[0], x.p[1] - r.tip[1]) < 1)
    if (only && t?.skelId !== only) continue
    console.log(`tile ${String(ti).padStart(3)} ${String(t?.skelId).padEnd(24)} ${String(t?.capEnd).padEnd(5)} shoulder ${r.sign > 0 ? '+' : '-'} leg=${r.leg.padEnd(5)} aBase=${String(r.legABase).padEnd(7)} capHW=${String(r.capHW).padEnd(7)} flip=${r.flipped ? 'Y' : 'n'} parity leg/cap=${r.legWalkOuter ? 'out' : 'in'}/${r.capWalkOuter ? 'out' : 'in'} total ${r.legTotal}/${r.capTotal}  → ${r.verdict}`)
    console.log(`        ${r.why}`)
  }
}
