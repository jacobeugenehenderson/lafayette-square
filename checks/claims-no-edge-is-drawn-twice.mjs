// claims-no-edge-is-drawn-twice.mjs — DOES EVERY LINE TWO PRODUCERS SHARE COME OUT AS ONE LINE?
//
// ⭐ THE CLASS (2026-10-14, HPDM, three measured pairs): one edge, two constructions. Two polygons that should meet on a
// line instead draw it twice, less than one lattice step apart and not equal — treelawn vs sidewalk (two offset runs of
// one depth line), asphalt vs highway (0.014–0.371 units), a band vs the evidence region that cut it (`rekeyByPiece`).
// The paint stack then takes differences and unions of the two and leaves slivers narrower than the lattice can hold:
// the flatten has to rule on rings no input decides, and the painter has drawn two lines where it meant one.
// ⇒ This reads the stack exactly as the flatten receives it — `bakeGround({ stackOnly: true })` returns it before any
//   geometry is built, so nothing here restates the bake — and reports every pair of edges that run alongside each other
//   within one lattice step without being the same line on the lattice. The detector is ./_nearMiss.mjs (one rule, also
//   read by claims-a-land-use-boundary-is-one-line for the land evidence).
//
// DEFINITION (a NEAR-MISS). Vertices rounded to the bake's integer lattice (`CLIP_SCALE`, src/lib/lattice.js), as the
// flatten sees them. Edges e and f — of two items, or two edges of ONE item (a ring folding back along itself, PTown 2026-10-22)
// — are a near-miss where
//   · f projected onto e overlaps e by MORE THAN ONE LATTICE STEP (shorter is two edges meeting near a shared vertex at an
//     angle — a touch, not a line drawn twice; it scored ~0.0002 m "near-misses" at every such corner until 2026-10-14), and
//   · both ends of that overlap lie within ONE lattice step of f (distance to a segment is convex, so the whole overlap
//     does), and
//   · e and f are NOT on one integer line (exact cross products) — an edge shared exactly is the goal, never counted.
// No angle constant: both ends within a step already bound the angle by 2·step / overlap.
// ⭐ SHAPE, per pair — GEOMETRY ONLY, no mechanism in the name (a mechanism is not visible locally):
//   straight-through-vertex — an end vertex V of one edge lies within a step of the OTHER edge's interior, and its ring
//                             carries straight on through V along that other edge
//   ends-or-parallel        — otherwise: one line ends on the other's interior and its ring turns away, or the two run
//                             parallel with no vertex on the other's interior
// ⚠️ ends-or-parallel holds BOTH a crossing put on one side only by a cut ACROSS the band (the piece turns away along the
// cut — HPDM's 327.863 m example, results-2026-10-14.txt) AND two depth lines ending at different joins. Only the stage
// trace (scratch/ground-budget/flatten-r1/trace.mjs) tells those apart.
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
// ⭐ --self — THE ONE-PRODUCER VERDICT (Boz, 2026-10-25, HPDM block 556): the town fails on any pair WITHIN ONE ITEM (a ring
// drawing one line twice — one producer, so no other layer can be blamed), each listed with its site; pairs between items are
// still printed but do not decide. --expect then names points that must lie on a ONE-ITEM pair.
// ⭐ MUTANT (--mutant=legext): the stack is built with tileGround's perpendicular-corner extension restored to its old
// construction (re-derived from the source edge by `legFrame`, overlapping the leg by 0.5 m), swapped in-process; the anchor
// is the live `legExt`, asserted once. With --self it must come back RED, and RED at the site --expect names:
//   node checks/claims-no-edge-is-drawn-twice.mjs hipointedemun --self --mutant=legext --expect=-490.963,113.451
//   node checks/claims-no-edge-is-drawn-twice.mjs [town …] [--self] [--mutant=legext] [--expect=x,z;x,z] [--show=n] [--out=<dir>] [--selftest]
// The screen shows the top --show pairs; the FULL per-pair table (every producer pair and every within-group pair, with
// edge pairs, metres alongside and max gap) is written to <dir>/claims-no-edge-is-drawn-twice-<town>.json — the system
// temp directory unless --out names one — and its path printed. A pair missing from the screen is not a pair at zero.
// Builds each town's stack (the bake up to the flatten; nothing is written). Exits 1 on any near-miss or a missed --expect.
import { LATTICE_M } from '../src/lib/lattice.js'
import { nearMisses } from './_nearMiss.mjs'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const argv = process.argv.slice(2)
const arg = (k) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const SHOW = +(arg('show') || 12)

const SELF = argv.includes('--self')
function report(town, pairs, expect) {
  const by = new Map()
  for (const p of pairs) { const k = p.self ? `${p.ga} (one item)` : [p.ga, p.gb].sort().join(' / '); let r = by.get(k); if (!r) by.set(k, r = { k, same: p.same, self: !!p.self, n: 0, m: 0, gap: 0, shapes: {}, xs: [] }); r.n++; r.m += p.m; r.gap = Math.max(r.gap, p.gap)
    const sh = (r.shapes[p.shape] ||= { n: 0, m: 0 }); sh.n++; sh.m += p.m; r.xs.push(p) }
  const rows = [...by.values()].sort((a, b) => b.m - a.m)
  const file = join(arg('out') || tmpdir(), `claims-no-edge-is-drawn-twice-${town}.json`)
  writeFileSync(file, JSON.stringify({ town, pairs: pairs.length, m: +pairs.reduce((t, p) => t + p.m, 0).toFixed(3),
    rows: rows.map(r => ({ pair: r.k, sameGroup: r.same, oneItem: r.self, edgePairs: r.n, m: +r.m.toFixed(3), maxGapSteps: +r.gap.toFixed(3),
      byShape: Object.fromEntries(Object.entries(r.shapes).map(([k, v]) => [k, { edgePairs: v.n, m: +v.m.toFixed(3) }])) })) }, null, 1))
  const line = (r) => `${String(r.n).padStart(7)} edge pair(s) · ${r.m.toFixed(2).padStart(9)} m alongside · max gap ${r.gap.toFixed(3)} step(s) · ${r.k} · ${Object.entries(r.shapes).map(([k, v]) => `${k} ${v.m.toFixed(0)} m`).join(', ')}`
  console.log(`\n${town}: ${pairs.length} near-miss edge pair(s), ${pairs.reduce((t, p) => t + p.m, 0).toFixed(1)} m of line drawn twice · full table (${rows.length} pair(s)): ${file}`)
  const shapeM = (s) => pairs.filter(p => p.shape === s).reduce((t, p) => t + p.m, 0).toFixed(1)
  console.log(`  by shape: ends-or-parallel ${shapeM('ends-or-parallel')} m · straight-through-vertex ${shapeM('straight-through-vertex')} m`)
  console.log(`  BETWEEN PRODUCERS (two groups):`); for (const r of rows.filter(r => !r.same).slice(0, SHOW)) console.log('   ' + line(r))
  console.log(`  WITHIN ONE GROUP (two items the stack unions):`); for (const r of rows.filter(r => r.same && !r.self).slice(0, SHOW)) console.log('   ' + line(r))
  console.log(`  WITHIN ONE ITEM (a ring folding back along itself, or meeting its own hole):`); for (const r of rows.filter(r => r.self).slice(0, SHOW)) console.log('   ' + line(r))
  console.log(`  longest:`); for (const p of [...pairs].sort((a, b) => b.m - a.m).slice(0, SHOW)) console.log(`     ${p.m.toFixed(3)} m at (${p.at.map(v => v.toFixed(3)).join(', ')}) · ${p.a}  vs  ${p.b} · gap ${p.gap.toFixed(3)}`)
  const selfPairs = pairs.filter(p => p.self)
  if (SELF) { console.log(`  ONE-ITEM PAIRS (the verdict): ${selfPairs.length}`)
    for (const p of selfPairs) console.log(`     ⛔ ${p.a} at (${p.at.map(v => v.toFixed(3)).join(', ')}) · ${p.m.toFixed(3)} m alongside · gap ${p.gap.toFixed(3)} step(s) · ${p.shape}`) }
  let missed = 0
  for (const [x, z] of expect) {
    const hit = (SELF ? selfPairs : pairs).find(p => { const [[ax, az], [bx, bz]] = p.seg, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0
      return Math.hypot(x - ax - t * dx, z - az - t * dz) <= 2 * LATTICE_M })
    if (hit) console.log(`  ✅ expected (${x}, ${z}): ${hit.a} vs ${hit.b}`)
    else { missed++; console.error(`  ⛔ expected (${x}, ${z}): NOT reported — the instrument misses a measured near-miss`) }
  }
  return { bad: (SELF ? selfPairs : pairs).length > 0, missed }
}

function selftest() {
  const sq = (x0, z0, w, h) => [[x0, z0], [x0 + w, z0], [x0 + w, z0 + h], [x0, z0 + h]]
  const run = (shift) => nearMisses([{ groupKey: 'mut:a', items: [sq(0, 0, 10, 10)] }, { groupKey: 'mut:b', items: [sq(10 + shift, 0, 10, 10)] }])
  const cases = [['an edge shared exactly', 0, false], ['moved half a step', LATTICE_M / 2, true], ['moved two steps', 2 * LATTICE_M, false]]
  let bad = 0
  // two edges meeting at a shared vertex at an angle (a touch) must NOT report; a near-miss overlapping just over one
  // step MUST — the length rule's two sides
  { const tri = (pts) => [{ groupKey: 'mut:a', items: [pts[0]] }, { groupKey: 'mut:b', items: [pts[1]] }]
    const touch = nearMisses(tri([[[0, 0], [10, 0], [10, 10]], [[10, 10], [10.0004, 0.0005], [20, 0]]])).length
    const short = nearMisses(tri([[[0, 0], [10, 0], [10, 10]], [[10 + LATTICE_M / 2, 5], [10 + LATTICE_M / 2, 5 + 2.5 * LATTICE_M], [20, 5]]])).length
    for (const [name, got, want] of [['two edges touching at a vertex, at an angle', touch > 0, false], ['a near-miss overlapping 2.5 steps', short > 0, true]]) {
      if (got !== want) bad++; console.log(`  ${got === want ? '✅' : '⛔'} ${name}: ${got ? 'reported' : 'not reported'} (must ${want ? '' : 'NOT '}report)`) } }
  // ⭐ ONE ITEM (PTown, 2026-10-22): a ring that runs out 3 m and back half a step beside itself is one line drawn twice by
  // one producer; a plain square and a sharp-but-real 5° corner are not. And Huron's evidence shape: two pieces of one
  // group leaving a shared vertex 0.9 mm apart at 30 m (a wedge with no vertex within NODE_BOUND of the other).
  { const h2 = LATTICE_M / 2
    const spur = [[0, 0], [10, 0], [10, 5], [13, 5], [10, 5 + h2], [10, 10], [0, 10]]
    const one = (r) => nearMisses([{ groupKey: 'mut:a', items: [r] }])
    const wedge = nearMisses([{ groupKey: 'mut:ag', items: [[[0, 0], [30, 0], [30, -5]], [[0, 0], [-1, 5], [30, 0.0009]]] }])
    for (const [name, got, want] of [
      ['a ring folding back along itself (a spur half a step wide)', one(spur).some(p => p.self), true],
      ['a plain square alone', one(sq(0, 0, 10, 10)).length > 0, false],
      ['a sharp 5° corner of one ring', one([[0, 0], [10, 0], [0, 0.875]]).length > 0, false],
      ["two pieces of one group leaving a shared vertex 0.9 mm apart at 30 m (Huron's wedge)", wedge.length > 0, true]]) {
      if (got !== want) bad++; console.log(`  ${got === want ? '✅' : '⛔'} ${name}: ${got ? 'reported' : 'not reported'} (must ${want ? '' : 'NOT '}report)`) } }
  for (const [name, shift, want] of cases) { const got = run(shift).length > 0; if (got !== want) bad++
    console.log(`  ${got === want ? '✅' : '⛔'} ${name}: ${got ? 'reported' : 'not reported'} (must ${want ? '' : 'NOT '}report)`) }
  // the two shapes: a straight-through vertex (A's right edge carries an extra vertex half a step off x = 10, B's does not)
  // and parallel (B's left edge moved half a step, no vertex in the other's interior)
  const h = LATTICE_M / 2
  const shapes = [
    ['a straight-through vertex', [[0, 0], [10, 0], [10 + h, 5], [10, 10], [0, 10]], sq(10, 0, 10, 10), 'straight-through-vertex'],
    ['parallel', sq(0, 0, 10, 10), sq(10 + h, 0, 10, 10), 'ends-or-parallel'],
    // B's line ENDS on A's interior and its ring turns away (HPDM's 108 m and 327.863 m examples both look like this)
    ['a line that ends on the other and turns', sq(0, 0, 10, 10), [[10 + h, 0], [20, 0], [20, 10], [12, 10], [10 + h, 6]], 'ends-or-parallel'],
  ]
  // the RangeError's shape: one-step squares spread over 5 km (a tiny median edge) inside a 5 km frame (long edges)
  { const tiny = [], W = 5000; for (let i = 0; i < 100; i++) for (let j = 0; j < 100; j++) tiny.push(sq(25 + i * 50, 25 + j * 50, LATTICE_M, LATTICE_M))
    let got, err; try { got = nearMisses([{ groupKey: 'mut:frame', items: [sq(0, 0, W, W)] }, { groupKey: 'mut:dust', items: tiny }]) } catch (e) { err = e }
    const ok = !err && got.length === 0; if (!ok) bad++
    console.log(`  ${ok ? '✅' : '⛔'} long edges over a tiny median: ${err ? `threw ${err.name}: ${err.message}` : `${got.length} reported`} (must run and report none)`) }
  for (const [name, a, b, want] of shapes) { const got = nearMisses([{ groupKey: 'mut:a', items: [a] }, { groupKey: 'mut:b', items: [b] }])
    const ok = got.length > 0 && got.every(p => p.shape === want); if (!ok) bad++
    console.log(`  ${ok ? '✅' : '⛔'} ${name}: ${[...new Set(got.map(p => p.shape))].join(', ') || 'not reported'} (must be ${want})`) }
  return bad
}

if (argv.includes('--selftest')) { const bad = selftest(); process.exit(bad ? 1 : 0) }
// the mutant: the live tileGround with `legExt` put back to the construction it replaced, served in place of the live module
const MUTANT = arg('mutant')
if (MUTANT) {
  if (MUTANT !== 'legext') { console.error(`⛔ NOT CHECKED — no mutant "${MUTANT}" (this check knows: legext)`); process.exit(2) }
  const { readFileSync } = await import('fs'), { register } = await import('node:module'), { pathToFileURL, fileURLToPath } = await import('node:url')
  const tgUrl = new URL('../src/lib/tileGround.js', import.meta.url).href, live = readFileSync(fileURLToPath(tgUrl), 'utf8')
  const ANCHOR = `  const legExt = (p, j, atEnd, lvA, lvB, Lx) => {
    const A = carried(lvA, p, j, atEnd), B = carried(lvB, p, j, atEnd)
    if (!A || !B || !(B.dEnd > A.dEnd)) return null
    const r = [A.at(0), A.at(Lx), B.at(Lx), B.at(0)]                 // at(0) IS the struck end vertex (the same float point)
    return signedArea(r) > 0 ? r : r.reverse()
  }
`
  if (live.split(ANCHOR).length !== 2) { console.error('⛔ NOT CHECKED — the mutant\'s anchor (tileGround.js#legExt) is not found exactly once; re-aim it'); process.exit(2) }
  const OLD = `  const legExt = (p, j, atEnd, lvA, lvB, Lx) => {
    const A = carried(lvA, p, j, atEnd), B = carried(lvB, p, j, atEnd)
    if (!A || !B || !(B.dEnd > A.dEnd)) return null
    const i = p.dsrc[j], F0 = legFrame(p, i, atEnd); if (!F0) return null
    const { T, f, nr } = F0, back = Math.min(0.5, F0.len), X = (s2, d) => [T[0] + f[0] * s2 + nr[0] * d, T[1] + f[1] * s2 + nr[1] * d]
    const r = [X(-back, A.dEnd), X(Lx, A.dEnd), X(Lx, B.dEnd), X(-back, B.dEnd)]
    return signedArea(r) > 0 ? r : r.reverse()
  }
`
  const src = live.replace(ANCHOR, OLD)
  register('data:text/javascript,' + encodeURIComponent(`export async function load(url, ctx, next) {
    if (url === ${JSON.stringify(tgUrl)}) return { format: 'module', source: ${JSON.stringify(src)}, shortCircuit: true }
    return next(url, ctx) }`))
  console.log(`MUTANT legext: tileGround's legExt re-derived from the source edge (legFrame, 0.5 m back), in-process`)
}
const { bakeGround } = await import('../cartograph/bake-ground.js')
const { lookFor } = await import('../scratch/_proto-feed.mjs')
const { ribbonScenes, refuseUnknownFlags } = await import('./_scenes.mjs')
refuseUnknownFlags(['selftest', 'show', 'out', 'expect', 'self', 'mutant'], argv)
const expect = (arg('expect') || '').split(';').filter(Boolean).map(s => s.split(',').map(Number))
let fail = 0, miss = 0
for (const town of ribbonScenes(argv.filter(a => !a.startsWith('--') || a === '--scene' || a.startsWith('--scene=')))) {   // ⛔ --scene= is a town, never dropped (it ran every town, 2026-10-21)
  const look = lookFor(town)
  if (!look) { console.error(`⛔ ${town}: no look names this scene (public/looks/index.json) — NOT CHECKED`); fail++; continue }
  const log = console.log; console.log = () => {}
  let st
  try { st = await bakeGround({ look, scene: town, stackOnly: true }) } finally { console.log = log }
  const entries = st.stackEntries.filter(e => !st.doesNotCut.has(e.groupKey))
  const r = report(town, nearMisses(entries), expect)
  if (r.bad) fail++; miss += r.missed
}
if (MUTANT) { const red = fail > 0 && !miss
  console.log(`\n${red ? '✅ MUTANT RED, as it must be' : '⛔ MUTANT STAYED GREEN (or missed the named site) — the check cannot see the construction it guards'}`)
  process.exit(red ? 0 : 1) }
console.log(`\n${fail || miss ? '⛔ FAIL' : '✅ PASS'}${miss ? ` — ${miss} expected near-miss(es) not reported (instrument)` : ''}`)
process.exit(miss ? 2 : fail ? 1 : 0)
