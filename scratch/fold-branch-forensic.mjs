#!/usr/bin/env node
/**
 * DOES THE DOCUMENTED CURE FIT THE DOCUMENTED MECHANISM?
 *
 * POLYGON-FIRST §3 (D6a, 2026-06-14, "NOT yet robust") diagnoses the minting fold:
 *
 *   "the through-node/curve path (the averaged-normal offset) has no miter clamp —
 *    the clamp guards only corner vertices — so on a bend tighter than the offset
 *    depth the inner edge overshoots and unionRings leaves the needle."
 *
 * The prescribed action is to give the averaged-normal branch the sibling branch's
 * limit, `lim = 2.5 * max(A.d, B.d, 0.5) + 1`. This probe asks whether that limit
 * can fire there AT ALL, and if not, what the fold's actual signature is — so the
 * guard that gets built tests the thing that is wrong.
 *
 * ⛔ MEASUREMENT ONLY. Live source untouched (instrumented COPY via declared edits,
 *    each asserted to match exactly once). Nothing re-poured, nothing re-baked.
 *
 * THE THREE QUESTIONS:
 *   1. On the averaged-normal branch, what is max(dist / lim)? The branch emits a
 *      point at distance exactly (A.d+B.d)/2 from ring[i], and lim = 2.5·M + 1 with
 *      M = max(A.d,B.d,0.5) ≥ (A.d+B.d)/2 — so ALGEBRAICALLY dist/lim < 0.4 always
 *      and the test is dead code there. Measured, not asserted.
 *   2. Which branch actually produced the vertices at each self-intersection? If the
 *      crossings sit on CORNER vertices, the site diagnosis is wrong too.
 *   3. REVERSAL — does the offset segment W[i]→W[i+1] run opposite to its source
 *      ring edge? That is the signature of an offset folded through itself, and it
 *      is a SIGN test: topological, constant-free, and what RIBBONS §6.9.5's
 *      "topological capacity guard, not a doctrine clamp" actually describes.
 *
 * Usage:  node scratch/fold-branch-forensic.mjs [--only <scene>]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRCDIR = path.join(ROOT, 'src/lib')
const TG = path.join(SRCDIR, 'tileGround.js')
const TMP = path.join(ROOT, 'scratch/.fold-probe')
const argv = process.argv.slice(2)
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null

const EDITS = [{
  why: 'tag every emitted point with the branch that produced it',
  find: /  const push = \(p, i\) => \{ W\.push\(p\); WL\.push\(i\) \}\n/,
  to: `  const WBR = []; let curBranch = '?'
  const push = (p, i) => { W.push(p); WL.push(i); WBR.push(curBranch) }
`,
}, {
  why: 'tag the dead-end cap branch',
  find: /      if \(capT === 'blunt'\) \{ push\(PL, i\); push\(PR, i\) \}\n/,
  to: `      curBranch = 'cap'
      if (capT === 'blunt') { push(PL, i); push(PR, i) }
`,
}, {
  why: 'tag the AVERAGED-NORMAL branch and record its dist vs the sibling lim',
  find: /      push\(\[ring\[i\]\[0\] \+ mx \* \(\(A\.d \+ B\.d\) \/ 2\), ring\[i\]\[1\] \+ my \* \(\(A\.d \+ B\.d\) \/ 2\)\], i\); continue\n/,
  to: `      curBranch = 'avgnorm'
      if (globalThis.__avgStat) { const _d = (A.d + B.d) / 2, _lim = 2.5 * Math.max(A.d, B.d, 0.5) + 1; globalThis.__avgStat.push([_d, _lim]) }
      push([ring[i][0] + mx * ((A.d + B.d) / 2), ring[i][1] + my * ((A.d + B.d) / 2)], i); continue
`,
}, {
  why: 'tag the bevel / miter branches',
  find: /      push\(\[A\.P\[0\] \+ A\.dir\[0\] \* pA, A\.P\[1\] \+ A\.dir\[1\] \* pA\], i\)\n      push\(\[B\.P\[0\] \+ B\.dir\[0\] \* pB, B\.P\[1\] \+ B\.dir\[1\] \* pB\], i\)\n    \} else push\(X, i\)\n/,
  to: `      curBranch = 'bevel'
      push([A.P[0] + A.dir[0] * pA, A.P[1] + A.dir[1] * pA], i)
      push([B.P[0] + B.dir[0] * pB, B.P[1] + B.dir[1] * pB], i)
    } else { curBranch = 'miter'; push(X, i) }
`,
}, {
  why: 'dump the minting tiles with their branch tags',
  find: /      if \(rl\.refused\) stamp\.refused = rl\.refused\n/,
  to: `      if (rl.refused) stamp.refused = rl.refused
      if (rl.refused && globalThis.__foldDump) globalThis.__foldDump.push({ reason: rl.refused, ring, W, WL, WBR, seg: seg.map(s => s.d) })
`,
}, {
  why: 'dump the minting tiles on the clean path too',
  find: /  if \(stamp && rl\.refused\) stamp\.refused = rl\.refused\n/,
  to: `  if (stamp && rl.refused) stamp.refused = rl.refused
  if (stamp && rl.refused && globalThis.__foldDump) globalThis.__foldDump.push({ reason: rl.refused, ring, W: W0, WL: L0, WBR: t0.src.map(k => WBR[k]), seg: seg.map(s => s.d) })
`,
}]

const load = async () => {
  const src = fs.readFileSync(TG, 'utf8')
  let out = src
  for (const e of EDITS) {
    const hits = out.match(new RegExp(e.find.source, 'g')) || []
    if (hits.length !== 1) {
      console.error(`⛔ INSTRUMENT ANCHOR DRIFTED — matched ${hits.length}×, expected 1:\n   ${e.why}\n   ${e.find}`)
      console.error('   The edit would be silently unapplied and every number below would be a FALSE GREEN.')
      process.exit(2)
    }
    out = out.replace(e.find, e.to)
  }
  out = out.replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, s, z) => a + path.resolve(SRCDIR, s) + z)
  fs.mkdirSync(TMP, { recursive: true })
  const p = path.join(TMP, 'tileGround.branch.mjs')
  fs.writeFileSync(p, out)
  return await import(p)
}

const segInt = (p1, p2, p3, p4) => {
  const ax = p2[0] - p1[0], ay = p2[1] - p1[1], bx = p4[0] - p3[0], by = p4[1] - p3[1]
  const den = ax * by - ay * bx
  if (Math.abs(den) < 1e-12) return false
  const t = ((p3[0] - p1[0]) * by - (p3[1] - p1[1]) * bx) / den
  const u = ((p3[0] - p1[0]) * ay - (p3[1] - p1[1]) * ax) / den
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9
}

const OPTS = { stencil: null, curbWidth: 0.15, smooth: 0, blockLandUse: null, cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null, emitArtifact: true }
const states = [{ id: 'lafayette-square', p: 'src/data/ribbons.json' }, { id: 'toy', p: 'src/data/toy/toy-ribbons.json' }]
for (const d of fs.readdirSync(path.join(ROOT, 'cartograph/data')).sort()) {
  if (['toy', 'lafayette-square', 'clean', 'raw'].includes(d)) continue
  const p = `cartograph/data/${d}/clean/ribbons.json`
  if (fs.existsSync(path.join(ROOT, p))) states.push({ id: d, p })
}
const sel = states.filter(s => (!ONLY || s.id.includes(ONLY)) && fs.existsSync(path.join(ROOT, s.p)))

const { buildTileGround } = await load()
const quiet = (f) => { const w = console.log; console.log = () => {}; try { return f() } finally { console.log = w } }

console.log('\n⭐ DOES THE DOCUMENTED CURE FIT THE DOCUMENTED MECHANISM?')
console.log('   POLYGON-FIRST §3: "the averaged-normal offset has no miter clamp … the inner edge overshoots".')
console.log('   ⛔ Measurement only. Live source untouched, nothing re-baked.\n')

globalThis.__avgStat = []
const tiles = []
for (const s of sel) {
  globalThis.__foldDump = []
  try { quiet(() => buildTileGround(JSON.parse(fs.readFileSync(path.join(ROOT, s.p))), { ...OPTS, blockCustoms: null })) }
  catch (e) { console.log(`  ⛔ ${s.id} NOT MEASURED — ${e.message.slice(0, 60)}`); continue }
  for (const d of globalThis.__foldDump) if (d.reason === 'clipper-minted-vertex') tiles.push({ scene: s.id, ...d })
}

// ── 1. can the sibling limit fire on the averaged-normal branch? ────────────
let maxRatio = 0, over = 0
for (const [d, lim] of globalThis.__avgStat) { const r = d / lim; if (r > maxRatio) maxRatio = r; if (d > lim) over++ }
console.log('── 1. CAN `lim = 2.5·max(A.d,B.d,0.5) + 1` EVER FIRE ON THE AVERAGED-NORMAL BRANCH? ──')
console.log(`   averaged-normal vertices emitted, all scenes : ${globalThis.__avgStat.length}`)
console.log(`   of those with dist > lim (the clamp firing)  : ${over}`)
console.log(`   max observed dist / lim                      : ${maxRatio.toFixed(4)}`)
console.log(`   ${over === 0 ? '⛔ THE TEST IS DEAD CODE IN THAT BRANCH — and it is dead ALGEBRAICALLY, not by luck:' : '   '}`)
if (over === 0) {
  console.log('      the branch emits at distance exactly (A.d+B.d)/2 from ring[i], and')
  console.log('      (A.d+B.d)/2 ≤ max(A.d,B.d) ≤ M, while lim = 2.5·M + 1 > M for all M ≥ 0.')
  console.log('      ⇒ dist < lim ALWAYS. Copying the sibling clamp here changes nothing, on any town, ever.')
}

// ── 2. which branch produced the crossing vertices? ─────────────────────────
// ── 3. reversal: does an offset segment run against its source ring edge? ───
const bTally = new Map(); let revTiles = 0, revSegs = 0, totalCross = 0
for (const t of tiles) {
  const W = t.W, n = W.length
  let crossed = false
  for (let i = 0; i < n && !crossed; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (!segInt(W[i], W[(i + 1) % n], W[j], W[(j + 1) % n])) continue
      totalCross++
      for (const k of [i, (i + 1) % n, j, (j + 1) % n]) bTally.set(t.WBR[k], (bTally.get(t.WBR[k]) || 0) + 1)
    }
  }
  // reversal test — sign only, no constant anywhere
  let rev = 0
  for (let i = 0; i < n; i++) {
    const a = t.WL[i], b = t.WL[(i + 1) % n]
    if (a === b) continue                                   // intra-vertex (bevel/cap) segment
    const e = [t.ring[(a + 1) % t.ring.length][0] - t.ring[a][0], t.ring[(a + 1) % t.ring.length][1] - t.ring[a][1]]
    const o = [W[(i + 1) % n][0] - W[i][0], W[(i + 1) % n][1] - W[i][1]]
    if (e[0] * o[0] + e[1] * o[1] < 0) rev++
  }
  if (rev) { revTiles++; revSegs += rev }
}
console.log('\n── 2. WHICH BRANCH PRODUCED THE VERTICES AT EACH SELF-INTERSECTION? ──')
const tot = [...bTally.values()].reduce((a, b) => a + b, 0) || 1
for (const [b, c] of [...bTally].sort((x, y) => y[1] - x[1])) console.log(`   ${String(b).padEnd(9)} ${String(c).padStart(6)}  ${(100 * c / tot).toFixed(1)}% of crossing endpoints`)
console.log(`   (${totalCross} crossings over ${tiles.length} minting tiles)`)

console.log('\n── 3. REVERSAL — an offset segment running AGAINST its source ring edge ──')
console.log(`   minting tiles carrying ≥1 reversed segment : ${revTiles}/${tiles.length}  (${(100 * revTiles / (tiles.length || 1)).toFixed(0)}%)`)
console.log(`   reversed segments in total                 : ${revSegs}`)
console.log('   ⭐ This is a SIGN test — no constant, no epsilon, no tuned distance. It is what')
console.log('      RIBBONS §6.9.5\'s "topological capacity guard, not a doctrine clamp" describes.')
console.log('   ⛔ NOT BUILT HERE. Naming the guard is a finding; choosing it is a decision.')
