// claims-no-edge-is-drawn-twice.mjs — DOES EVERY LINE TWO PRODUCERS SHARE COME OUT AS ONE LINE?
//
// ⭐ THE CLASS (2026-10-14, HPDM, three measured pairs): one edge, two constructions. Two polygons that should meet on a
// line instead draw it twice, less than one lattice step apart and not equal — treelawn vs sidewalk (two offset runs of
// one depth line), asphalt vs highway (0.014–0.371 units), a band vs the evidence region that cut it (`rekeyByPiece`).
// The paint stack then takes differences and unions of the two and leaves slivers narrower than the lattice can hold:
// the flatten has to rule on rings no input decides, and the painter has drawn two lines where it meant one.
// ⇒ This reads the stack exactly as the flatten receives it — `bakeGround({ stackOnly: true })` returns it before any
//   geometry is built, so nothing here restates the bake — and reports every pair of edges, from two DIFFERENT items,
//   that run alongside each other within one lattice step without being the same line on the lattice.
//
// DEFINITION (a NEAR-MISS). Vertices rounded to the bake's integer lattice (`CLIP_SCALE`, src/lib/lattice.js), as the
// flatten sees them. Edges e (item A) and f (item B), A ≠ B, are a near-miss where
//   · f projected onto e overlaps e by more than zero, and
//   · both ends of that overlap lie within ONE lattice step of f (distance to a segment is convex, so the whole overlap
//     does), and
//   · e and f are NOT on one integer line (exact cross products) — an edge shared exactly is the goal, never counted.
// No angle constant: both ends within a step already bound the angle by 2·step / overlap.
// ⭐ SHAPE, per pair (the two classes need different fixes, so the instrument tells them apart):
//   one-side-vertex — an end vertex V of one edge lies within a step of the OTHER edge's interior, and the ring carries
//                     straight on through V along that other edge: a vertex one polygon has and its neighbour lacks
//                     (an intersection inserted on one side only, rounded up to ½ step off the shared line)
//   two-lines       — otherwise: two constructions of one line, whose vertices differ (different joins, or a parallel
//                     offset), so the line itself is drawn twice
// Pairs of DIFFERENT groups are the producer pairs; pairs within ONE group (two items the stack will union) are reported
// separately — their union makes slivers as well (Boz, 2026-10-14). Layers that do not cut (water) are not partition.
//
// ⛔ WHAT IT DOES NOT SEE, AND WHAT DOES. A gap WIDER than one step is not this class, and on the stack it is not even a
// gap: the stack overlaps by design and the layers beneath fill what the ones above leave. A gap in the GROUND exists
// only in the slab, where checks/claims-the-ground-tiles-without-a-gap.mjs finds it at ANY width — it asks the topology
// (an edge used once inside the disc), not a distance — and checks/claims-the-ground-is-painted-once.mjs sizes it.
// ⛔ WHAT IT DOES NOT SAY: why a painter drew a line twice. The construction classes are measured by the scratch hook
// (scratch/ground-budget/flatten-r1/slv.mjs, make-slv.mjs) and are OPEN: step-at-run-end · equal-step-farther ·
// off-every-offset · one-construction; rekeyByPiece's evidence cut (results-2026-10-14.txt).
//
// ⭐ SEEN RED: `--expect=x,z;…` names points (metres) that must lie on a reported near-miss, else the check fails as an
// instrument — HEAD's HPDM, 2026-10-14: asphalt#13 / highway#1 at (-879.641,-1074.934); treelawn:recreation#24 /
// sidewalk#32 at (633.872,1103.907). ⭐ MUTATION TEST: `--selftest` builds two items sharing an edge exactly (must NOT
// report), moves one by half a step (MUST report), then by two steps (must NOT report: a gap, not this class).
//
//   node checks/claims-no-edge-is-drawn-twice.mjs [town …] [--expect=x,z;x,z] [--show=n] [--out=<dir>] [--selftest]
// The screen shows the top --show pairs; the FULL per-pair table (every producer pair and every within-group pair, with
// edge pairs, metres alongside and max gap) is written to <dir>/claims-no-edge-is-drawn-twice-<town>.json — the system
// temp directory unless --out names one — and its path printed. A pair missing from the screen is not a pair at zero.
// Builds each town's stack (the bake up to the flatten; nothing is written). The town's shore median is read as the
// Bake's first ground pass reads it (`shorePending`). Exits 1 on any near-miss or a missed --expect.
import { CLIP_SCALE, LATTICE_M } from '../src/lib/lattice.js'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const STEP = CLIP_SCALE * LATTICE_M          // one lattice step, in the integer units the flatten works in
const argv = process.argv.slice(2)
const arg = (k) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const SHOW = +(arg('show') || 12)

// ── the detector: entries [{ groupKey, items }] → near-miss pairs ─────────────────────────────────────────────────
export function nearMisses(entries) {
  // the edges, in typed arrays (a town's stack is ~10⁶ edges): integer lattice ends, and which entry/item/ring drew each
  let n = 0
  const ringsOf = (it) => Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]
  for (const e of entries) for (const it of e.items) for (const r of ringsOf(it)) if (r && r.length >= 2) n += r.length
  const AX = new Int32Array(n), AY = new Int32Array(n), BX = new Int32Array(n), BY = new Int32Array(n), G = new Int32Array(n), I = new Int32Array(n), R = new Int32Array(n)
  const NXT = new Int32Array(n), PRV = new Int32Array(n)            // the ring's next / previous edge (skipping degenerate ones)
  let m = 0
  entries.forEach((e, gi) => e.items.forEach((it, ii) => ringsOf(it).forEach((r, ri) => { if (!r || r.length < 2) return
    const first = m
    for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length]
      const ax = Math.round(a[0] * CLIP_SCALE), ay = Math.round(a[1] * CLIP_SCALE), bx = Math.round(b[0] * CLIP_SCALE), by = Math.round(b[1] * CLIP_SCALE)
      if (ax === bx && ay === by) continue
      AX[m] = ax; AY[m] = ay; BX[m] = bx; BY[m] = by; G[m] = gi; I[m] = ii; R[m] = ri; m++ }
    for (let k = first; k < m; k++) { NXT[k] = k + 1 < m ? k + 1 : first; PRV[k] = k > first ? k - 1 : m - 1 } })))
  // a grid sized to the edges themselves (their median length); each edge listed in every cell its box, widened a step,
  // meets — a compressed index (counts, then offsets), keyed by an integer per cell
  const lens = new Float64Array(m); for (let k = 0; k < m; k++) lens[k] = Math.hypot(BX[k] - AX[k], BY[k] - AY[k])
  const C = Math.max(STEP, Float64Array.from(lens).sort()[m >> 1] || STEP)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let k = 0; k < m; k++) { x0 = Math.min(x0, AX[k], BX[k]); x1 = Math.max(x1, AX[k], BX[k]); y0 = Math.min(y0, AY[k], BY[k]); y1 = Math.max(y1, AY[k], BY[k]) }
  const NX = Math.floor((x1 - x0 + 2 * STEP) / C) + 1
  const cellsOf = (k, f) => { for (let gx = Math.floor((Math.min(AX[k], BX[k]) - STEP - x0 + STEP) / C), gx1 = Math.floor((Math.max(AX[k], BX[k]) + STEP - x0 + STEP) / C); gx <= gx1; gx++)
    for (let gy = Math.floor((Math.min(AY[k], BY[k]) - STEP - y0 + STEP) / C), gy1 = Math.floor((Math.max(AY[k], BY[k]) + STEP - y0 + STEP) / C); gy <= gy1; gy++) f(gy * NX + gx) }
  const slot = new Map(); let cnt = []
  for (let k = 0; k < m; k++) cellsOf(k, (c) => { let s = slot.get(c); if (s === undefined) { slot.set(c, s = cnt.length); cnt.push(0) } cnt[s]++ })
  const start = new Int32Array(cnt.length + 1); for (let s = 0; s < cnt.length; s++) start[s + 1] = start[s] + cnt[s]
  const fill = start.slice(0, cnt.length), list = new Int32Array(start[cnt.length]); cnt = null
  for (let k = 0; k < m; k++) cellsOf(k, (c) => { list[fill[slot.get(c)]++] = k })
  const segD = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0
    return Math.hypot(px - ax - t * dx, py - ay - t * dy) }
  const out = [], seen = new Set()
  for (let s = 0; s < start.length - 1; s++) for (let i = start[s]; i < start[s + 1]; i++) for (let j = i + 1; j < start[s + 1]; j++) {
    const p = list[i], q = list[j]
    if (G[p] === G[q] && I[p] === I[q]) continue                                   // one item: not two producers
    const ex = BX[p] - AX[p], ey = BY[p] - AY[p]
    const c1 = ex * (AY[q] - AY[p]) - ey * (AX[q] - AX[p]), c2 = ex * (BY[q] - AY[p]) - ey * (BX[q] - AX[p])
    if (c1 === 0 && c2 === 0) continue                                             // one integer line: shared, the goal
    const L = lens[p], t = (x, y) => ((x - AX[p]) * ex + (y - AY[p]) * ey) / L
    const lo = Math.max(0, Math.min(t(AX[q], AY[q]), t(BX[q], BY[q]))), hi = Math.min(L, Math.max(t(AX[q], AY[q]), t(BX[q], BY[q])))
    if (!(hi > lo)) continue
    const xa = AX[p] + ex / L * lo, ya = AY[p] + ey / L * lo, xb = AX[p] + ex / L * hi, yb = AY[p] + ey / L * hi
    const d0 = segD(xa, ya, AX[q], AY[q], BX[q], BY[q]); if (d0 > STEP) continue
    const d1 = segD(xb, yb, AX[q], AY[q], BX[q], BY[q]); if (d1 > STEP) continue
    const key = p < q ? p * m + q : q * m + p; if (seen.has(key)) continue; seen.add(key)
    const A = entries[G[p]].groupKey, B = entries[G[q]].groupKey
    // the shape: does an end vertex of one edge sit on the other's interior with its ring running on along that edge?
    const onInterior = (vx, vy, k) => { const dx = BX[k] - AX[k], dy = BY[k] - AY[k], L2 = dx * dx + dy * dy, t = ((vx - AX[k]) * dx + (vy - AY[k]) * dy) / L2
      return t * Math.sqrt(L2) > STEP && (1 - t) * Math.sqrt(L2) > STEP && segD(vx, vy, AX[k], AY[k], BX[k], BY[k]) <= STEP }
    const runsOn = (x, k) => { // edge x's two ring neighbours: does the one through a vertex on k's interior continue along k?
      if (onInterior(BX[x], BY[x], k)) { const nx = NXT[x]; if (segD(BX[nx], BY[nx], AX[k], AY[k], BX[k], BY[k]) <= STEP) return true }
      if (onInterior(AX[x], AY[x], k)) { const px = PRV[x]; if (segD(AX[px], AY[px], AX[k], AY[k], BX[k], BY[k]) <= STEP) return true }
      return false }
    const shape = runsOn(p, q) || runsOn(q, p) ? 'one-side-vertex' : 'two-lines'
    out.push({ a: `${A}#${I[p]}.${R[p]}`, b: `${B}#${I[q]}.${R[q]}`, ga: A, gb: B, same: A === B, shape, m: (hi - lo) / CLIP_SCALE,
      gap: Math.max(d0, d1), at: [(xa + xb) / 2 / CLIP_SCALE, (ya + yb) / 2 / CLIP_SCALE], seg: [[xa / CLIP_SCALE, ya / CLIP_SCALE], [xb / CLIP_SCALE, yb / CLIP_SCALE]] })
  }
  return out
}

function report(town, pairs, expect) {
  const by = new Map()
  for (const p of pairs) { const k = [p.ga, p.gb].sort().join(' / '); let r = by.get(k); if (!r) by.set(k, r = { k, same: p.same, n: 0, m: 0, gap: 0, shapes: {}, xs: [] }); r.n++; r.m += p.m; r.gap = Math.max(r.gap, p.gap)
    const sh = (r.shapes[p.shape] ||= { n: 0, m: 0 }); sh.n++; sh.m += p.m; r.xs.push(p) }
  const rows = [...by.values()].sort((a, b) => b.m - a.m)
  const file = join(arg('out') || tmpdir(), `claims-no-edge-is-drawn-twice-${town}.json`)
  writeFileSync(file, JSON.stringify({ town, pairs: pairs.length, m: +pairs.reduce((t, p) => t + p.m, 0).toFixed(3),
    rows: rows.map(r => ({ pair: r.k, sameGroup: r.same, edgePairs: r.n, m: +r.m.toFixed(3), maxGapSteps: +r.gap.toFixed(3),
      byShape: Object.fromEntries(Object.entries(r.shapes).map(([k, v]) => [k, { edgePairs: v.n, m: +v.m.toFixed(3) }])) })) }, null, 1))
  const line = (r) => `${String(r.n).padStart(7)} edge pair(s) · ${r.m.toFixed(2).padStart(9)} m alongside · max gap ${r.gap.toFixed(3)} step(s) · ${r.k} · ${Object.entries(r.shapes).map(([k, v]) => `${k} ${v.m.toFixed(0)} m`).join(', ')}`
  console.log(`\n${town}: ${pairs.length} near-miss edge pair(s), ${pairs.reduce((t, p) => t + p.m, 0).toFixed(1)} m of line drawn twice · full table (${rows.length} pair(s)): ${file}`)
  const shapeM = (s) => pairs.filter(p => p.shape === s).reduce((t, p) => t + p.m, 0).toFixed(1)
  console.log(`  by shape: two-lines ${shapeM('two-lines')} m · one-side-vertex ${shapeM('one-side-vertex')} m`)
  console.log(`  BETWEEN PRODUCERS (two groups):`); for (const r of rows.filter(r => !r.same).slice(0, SHOW)) console.log('   ' + line(r))
  console.log(`  WITHIN ONE GROUP (two items the stack unions):`); for (const r of rows.filter(r => r.same).slice(0, SHOW)) console.log('   ' + line(r))
  console.log(`  longest:`); for (const p of [...pairs].sort((a, b) => b.m - a.m).slice(0, SHOW)) console.log(`     ${p.m.toFixed(3)} m at (${p.at.map(v => v.toFixed(3)).join(', ')}) · ${p.a}  vs  ${p.b} · gap ${p.gap.toFixed(3)}`)
  let missed = 0
  for (const [x, z] of expect) {
    const hit = pairs.find(p => { const [[ax, az], [bx, bz]] = p.seg, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0
      return Math.hypot(x - ax - t * dx, z - az - t * dz) <= 2 * LATTICE_M })
    if (hit) console.log(`  ✅ expected (${x}, ${z}): ${hit.a} vs ${hit.b}`)
    else { missed++; console.error(`  ⛔ expected (${x}, ${z}): NOT reported — the instrument misses a measured near-miss`) }
  }
  return { bad: pairs.length > 0, missed }
}

function selftest() {
  const sq = (x0, z0, w, h) => [[x0, z0], [x0 + w, z0], [x0 + w, z0 + h], [x0, z0 + h]]
  const run = (shift) => nearMisses([{ groupKey: 'mut:a', items: [sq(0, 0, 10, 10)] }, { groupKey: 'mut:b', items: [sq(10 + shift, 0, 10, 10)] }])
  const cases = [['an edge shared exactly', 0, false], ['moved half a step', LATTICE_M / 2, true], ['moved two steps', 2 * LATTICE_M, false]]
  let bad = 0
  for (const [name, shift, want] of cases) { const got = run(shift).length > 0; if (got !== want) bad++
    console.log(`  ${got === want ? '✅' : '⛔'} ${name}: ${got ? 'reported' : 'not reported'} (must ${want ? '' : 'NOT '}report)`) }
  // the two shapes: a vertex on one side only (A's right edge carries an extra vertex half a step off x = 10, B's does not)
  // and two lines (B's left edge moved half a step, no vertex in the other's interior)
  const h = LATTICE_M / 2
  const shapes = [
    ['a vertex on one side only', [[0, 0], [10, 0], [10 + h, 5], [10, 10], [0, 10]], sq(10, 0, 10, 10), 'one-side-vertex'],
    ['two lines', sq(0, 0, 10, 10), sq(10 + h, 0, 10, 10), 'two-lines'],
    // the measured 108 m shape: B's line ENDS on A's interior and its ring turns away — two lines, not an inserted vertex
    ['two lines whose ends differ', sq(0, 0, 10, 10), [[10 + h, 0], [20, 0], [20, 10], [12, 10], [10 + h, 6]], 'two-lines'],
  ]
  for (const [name, a, b, want] of shapes) { const got = nearMisses([{ groupKey: 'mut:a', items: [a] }, { groupKey: 'mut:b', items: [b] }])
    const ok = got.length > 0 && got.every(p => p.shape === want); if (!ok) bad++
    console.log(`  ${ok ? '✅' : '⛔'} ${name}: ${[...new Set(got.map(p => p.shape))].join(', ') || 'not reported'} (must be ${want})`) }
  return bad
}

if (argv.includes('--selftest')) { const bad = selftest(); process.exit(bad ? 1 : 0) }
const { bakeGround } = await import('../cartograph/bake-ground.js')
const { lookFor } = await import('../scratch/_proto-feed.mjs')
const { ribbonScenes } = await import('./_scenes.mjs')
const expect = (arg('expect') || '').split(';').filter(Boolean).map(s => s.split(',').map(Number))
let fail = 0, miss = 0
for (const town of ribbonScenes(argv.filter(a => !a.startsWith('--')))) {
  const look = lookFor(town)
  if (!look) { console.error(`⛔ ${town}: no look names this scene (public/looks/index.json) — NOT CHECKED`); fail++; continue }
  const log = console.log; console.log = () => {}
  let st
  try { st = await bakeGround({ look, scene: town, shorePending: true, stackOnly: true }) } finally { console.log = log }
  const entries = st.stackEntries.filter(e => !st.doesNotCut.has(e.groupKey))
  const r = report(town, nearMisses(entries), expect)
  if (r.bad) fail++; miss += r.missed
}
console.log(`\n${fail || miss ? '⛔ FAIL' : '✅ PASS'}${miss ? ` — ${miss} expected near-miss(es) not reported (instrument)` : ''}`)
process.exit(miss ? 2 : fail ? 1 : 0)
