// claims-the-paint-stack-flattens.mjs — DOES EVERY TOWN'S PAINT STACK PRESS DOWN WITHOUT A REFUSAL?
//
// ⭐ THE CLASS (2026-10-20, LS and HPDM, BRIEF-the-stamp-lands-on-the-lattice §3b): two groups' rings meet on the lattice
// without sharing their vertices. One carries a lattice vertex within the rounding of the other's straight edge, which does
// not carry it (a T-JUNCTION), and `layer − above` emits a hole below the lattice that a painted ring meets. The flatten
// rightly refuses it (bake-ground.js `itemsByMembership`). The cure is upstream of the refusal: `nodeAcrossGroups` inserts
// each such vertex into the other group's edge before the flatten, within the rounding's own bound, √2/2 of a step.
// ⇒ This runs the flatten itself, per town, on the stack exactly as the bake gives it (`bakeGround({ stackOnly: true })`),
//   and reports the first refusal, the vertices the noding inserted (per group pair), and the rings the flatten dropped
//   below the lattice (bow-ties, orphan holes) — the two drops are downstream tolerances whose counts should be zero.
// Each town runs in its own process (a stack is up to a few GB), writing nothing.
//
// ⭐ MUTATION TEST, `--mutants`: every row must go RED on its mutant.
//   (1) noding off — the same towns' UN-noded stacks (`stackOnly` returns both) must refuse somewhere;
//   (2) a vertex past the bound (0.8 step) is never inserted, so it still refuses;
//   (3) the bound written as a literal at its definition or at the call site (a Class D constant) — a source-reading row;
//   (4) a vertex off the lattice — the noding refuses it, never rounds it;
//   (5) a ring pinching below the lattice (a needle) reaches planGroup unsplit — read on the plane (`nodeThePlane`), and
//       the cut removed from its source, or the plane noded before the ease split, in bake-ground.js's source.
//   node checks/claims-the-paint-stack-flattens.mjs [town…] [--shore=pending] [--mutants] [--selftest]
// Exits 1 on any refusal (or a mutant that stays green), 2 when a town could not be checked.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ROOT, ribbonScenes } from './_scenes.mjs'
import { CLIP_SCALE, LATTICE_M } from '../src/lib/lattice.js'

const SRC = join(ROOT, 'cartograph/bake-ground.js')
const argv = process.argv.slice(2), arg = (k) => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)

// ── one town, in this process: its flatten on the noded (or, `--unnoded`, the raw) stack → one JSON line ────────────
if (arg('one')) {
  const town = arg('one')
  const { bakeGround, flattenPaintStack, nodeThePlane } = await import('../cartograph/bake-ground.js')
  const { lookFor } = await import('../scratch/_proto-feed.mjs')
  const log = console.log, lines = []
  console.log = (...a) => lines.push(a.join(' '))
  let r
  try {
    const st = await bakeGround({ look: lookFor(town), scene: town, shorePending: arg('shore') === 'pending', stackOnly: true })
    const entries = argv.includes('--unnoded') ? st.unnoded : st.stackEntries
    try {
      // the plane as planGroup reads it, less the ease split (the deformer's, not run here)
      const out = flattenPaintStack(entries, { keepOwnSlot: st.keepOwnSlot, doesNotCut: st.doesNotCut })
      nodeThePlane(out)
      const drops = Object.entries(out.subLattice).flatMap(([g, v]) => [...(v.bowTies || []).map(() => 'bowTie ' + g), ...(v.orphanHoles || []).map(() => 'orphan ' + g)])
      const pinches = Object.values(out.subLattice).flatMap(v => v.pinches || [])
      r = { town, refused: null, inserted: st.stackEntries.inserted, pairs: st.stackEntries.pairs, drops, output: out.noded,
            pinches: { loops: pinches.length, m2: +pinches.reduce((t, p) => t + p.m2, 0).toFixed(6), widestMm: Math.max(0, ...pinches.map(p => p.widthMm)) },
            unsplit: [...out.values()].reduce((t, items) => t + pinchesIn(items), 0) }
    } catch (e) { r = { town, refused: String(e.message).split('\n')[0], inserted: st.stackEntries.inserted, pairs: st.stackEntries.pairs } }
  } catch (e) { r = { town, notChecked: String(e.message).split('\n')[0] } }
  console.log = log
  console.log('RESULT ' + JSON.stringify(r))
  process.exit(0)
}

// ── the source-reading row: the bound is derived from lattice.js, and the call site passes none ──────────────────────
export function boundIsDerived(src) {
  const def = src.match(/^export const NODE_BOUND = (.+)$/m)
  if (!def) return 'no `export const NODE_BOUND = …` in bake-ground.js'
  if (/\d*\.\d+|\b\d+e[-+]?\d+/.test(def[1].replace(/\/\/.*$/, ''))) return `NODE_BOUND is written as a literal (${def[1].trim()})`
  if (!/LATTICE_STEP/.test(def[1]) || !/SQRT1_2|Math\.sqrt\(2\)\s*\/\s*2/.test(def[1])) return `NODE_BOUND is not √2/2 · LATTICE_STEP (${def[1].trim()})`
  const calls = [...src.matchAll(/nodeAcrossGroups\(([^)]*)\)/g)].map(m => m[1]).filter(a => !/^entries,/.test(a))
  if (!calls.length) return 'nothing calls nodeAcrossGroups'
  const lit = calls.find(a => /bound\s*:/.test(a)); if (lit) return `a call site passes its own bound (${lit})`
  return null
}

// ── the source-reading row: the kerb's plan and cells read the block rings `nodeThePlane` returns, below it ───────────
export function kerbReadsTheNodedRings(src) {
  const at = src.indexOf('const { blockRings: nodedBlockRings } = nodeThePlane(')
  if (at < 0) return 'bakeGround does not take its block rings from nodeThePlane'
  const plan = src.indexOf('kerbPlan({ blockRings: nodedBlockRings,'), cells = src.indexOf('kerbCells(kerbRegs, nodedBlockRings)')
  if (plan < 0) return 'kerbPlan does not read the noded block rings'
  if (cells < 0) return 'kerbCells does not read the noded block rings'
  return plan > at && cells > at ? null : 'the kerb reads the block rings before nodeThePlane'
}
// ── the source-reading row: `nodeThePlane` nodes, then cuts at the pinches (an inserted vertex can be the pinch), and
// bakeGround calls it once, after the plane's last re-clip (the ease split) and before planGroup reads it ─────────────
export function planeNodedLast(src) {
  const at = src.indexOf('export function nodeThePlane('), end = src.indexOf('\n}\n', at)
  if (at < 0 || end < 0) return 'no `export function nodeThePlane(` in bake-ground.js'
  const body = src.slice(at, end), n = body.indexOf('nodeAcrossGroups('), c = body.indexOf('splitAtPinches(noded[g].items, k, flattened.subLattice)')
  if (n < 0) return 'nodeThePlane never nodes'
  if (c < 0) return 'nodeThePlane never cuts the paint at its pinches'
  if (c < n) return 'nodeThePlane cuts before it nodes'
  const calls = [...src.matchAll(/nodeThePlane\(/g)].map(m => m.index).filter(i => i !== at + 'export function '.length)
  if (calls.length !== 1) return `bakeGround calls nodeThePlane ${calls.length} time(s), not once`
  const ease = src.indexOf('flattened.set(k, [...outside, ...inside])'), plan = src.indexOf('const planGroup = (kind, key)')
  if (ease < 0 || plan < 0) return 'the ease split or planGroup moved — this row cannot read the order'
  return calls[0] > ease && calls[0] < plan ? null : 'nodeThePlane is not called between the ease split and planGroup'
}
// an independent reader of the class: in each ring, a vertex within √2/2 step of another of its own edges (not touching
// it), projecting strictly inside — on the integer lattice
export function pinchesIn(items) {
  let n = 0, b2 = (Math.SQRT1_2 * CLIP_SCALE * LATTICE_M) ** 2
  for (const it of items) for (const r of (Array.isArray(it) ? [it] : [it?.outer, ...(it?.holes || [])]).filter(r => r?.length >= 3)) {
    const k = r.map(([x, z]) => [Math.round(x * CLIP_SCALE), Math.round(z * CLIP_SCALE)])
    k.forEach((P, j) => k.forEach((a, i) => { const b = k[(i + 1) % k.length]
      if ((a[0] === P[0] && a[1] === P[1]) || (b[0] === P[0] && b[1] === P[1])) return
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, dot = (P[0] - a[0]) * dx + (P[1] - a[1]) * dy, cr = (P[0] - a[0]) * dy - (P[1] - a[1]) * dx
      if (L2 && dot > 0 && dot < L2 && cr * cr <= b2 * L2) n++ })) }
  return n
}

// ── synthetic rows (milliseconds) ────────────────────────────────────────────────────────────────────────────────────
async function synthetic() {
  const { nodeAcrossGroups, NODE_BOUND, flattenPaintStack, nodeThePlane } = await import('../cartograph/bake-ground.js')
  const log = console.log; console.log = () => {}
  const mm = (pts) => pts.map(([x, z]) => [x * LATTICE_M, z * LATTICE_M])
  // an edge (0,0)→(8000,6000) of group a; a vertex of group b at 0.6 step (inserted) or 0.8 step (past √2/2: untouched)
  const run = (v) => nodeAcrossGroups([{ groupKey: 'a', items: [mm([[0, 0], [8000, 6000], [0, 6000]])] }, { groupKey: 'b', items: [mm([[0, -1000], [9000, -1000], [9000, 6000], v])] }])
  const rows = []
  { const n = run([3999, 3000]), a = n[0].items[0]
    rows.push(['a vertex 0.6 step off another group\'s edge is inserted, as its own coordinates', n.inserted === 1 && a.some(([x, z]) => x === 3999 * LATTICE_M && z === 3000 * LATTICE_M)]) }
  rows.push(['(2) a vertex 0.8 step off (past √2/2) is never inserted', run([4000, 3001]).inserted === 0])
  rows.push(['two rings of ONE group are never noded', nodeAcrossGroups([{ groupKey: 'a', items: [mm([[0, 0], [8000, 6000], [0, 6000]]), mm([[0, -1000], [9000, -1000], [9000, 6000], [3999, 3000]])] }]).inserted === 0])
  let off = null; try { run([3999.5, 3000]) } catch (e) { off = e.message }
  rows.push(['(4) a vertex off the lattice is refused, never rounded', /off the lattice/.test(off || '')])
  rows.push(['the bound is √2/2 of lattice.js\'s step', NODE_BOUND === Math.SQRT1_2 * CLIP_SCALE * LATTICE_M])
  const src = readFileSync(SRC, 'utf8'), why = boundIsDerived(src)
  rows.push([`(3) the bound is derived, not written${why ? ` — ${why}` : ''}`, !why])
  rows.push(['(3) mutant: NODE_BOUND = 0.7071 is RED', !!boundIsDerived(src.replace(/^export const NODE_BOUND = .+$/m, 'export const NODE_BOUND = 0.7071'))])
  rows.push(['(3) mutant: a literal bound at the call site is RED', !!boundIsDerived(src.replace('nodeAcrossGroups(stackEntries)', 'nodeAcrossGroups(stackEntries, { bound: 0.71 })'))])
  // (5) a needle narrower than the bound: a's vertex (11000, 5000) is 0.1 step off its own edge (10000,5000)→(20000,4999),
  // and b runs the same needle from the other side. The plane (flattened, then `nodeThePlane`) must pinch nowhere, and
  // record the dropped loops
  const A = mm([[0, 0], [10000, 0], [10000, 5000], [20000, 4999], [11000, 5000], [10000, 6000], [10000, 10000], [0, 10000]])
  const Bn = mm([[10000, 0], [30000, 0], [30000, 10000], [10000, 10000], [10000, 6000], [11000, 5000], [20000, 4999], [10000, 5000]])
  const stack = [{ groupKey: 'b', items: [{ outer: Bn, holes: [] }] }, { groupKey: 'a', items: [{ outer: A, holes: [] }] }]
  // and a third group, keeping its own slot, whose items are bare rings (a ribbon band's), goes through with them
  const flat = flattenPaintStack([...stack, { groupKey: 'c', items: [mm([[40000, 0], [41000, 0], [41000, 1000]])] }], { keepOwnSlot: new Set(['c']) })
  nodeThePlane(flat)
  const live = [...flat.values()].reduce((t, items) => t + pinchesIn(items), 0)
  rows.push([`(5) the plane pinches nowhere below the lattice${live ? ` — ${live} pinch(es)` : ''}`, live === 0])
  rows.push(['(5) the cut needle is recorded (ground.json#flatten.subLattice[group].pinches)', !!(flat.subLattice.a?.pinches?.length && flat.subLattice.b?.pinches?.length)])
  rows.push(['(5) ground.json states it: every layer, insert-only, and the paint removed below the lattice by the bow-tie rule',
    flat.noded?.insertOnly === true && ['a', 'b', 'c'].every(k => flat.noded.layers.includes(k)) && flat.noded.removedBelowLattice?.rule === 'bow-tie' && flat.noded.removedBelowLattice.loops === 2])
  // the mutant: the same plane noded but never cut (`nodeThePlane` without `splitAtPinches`) must read as pinching
  const unsplit = nodeAcrossGroups(stack.map(e => ({ ...e, items: e.items.map(it => ({ outer: it.outer, holes: [] })) })))
  rows.push(['(5) mutant: a ring with a sub-lattice needle reaches the noder unsplit → RED', unsplit.reduce((t, e) => t + pinchesIn(e.items), 0) > 0])
  // (6) the block and rim rings take part, and what comes back IS the bake's block and rim rings for every reader after:
  // a block ring through a paint vertex takes it (its edges are then exactly the paint's); a block ring pinching below the
  // lattice is CUT (the loop recorded, not paint); a rim ring pinching is REFUSED at its stretch (its owners do not follow a
  // cut) and counted; the frozen rings are never touched; a rim ring's inserted vertex takes its edge's owner
  const key = (a, b) => [a, b].map(v => v.map(c => Math.round(c / LATTICE_M)).join(',')).sort().join('|')
  { const fl = new Map([['g', [{ outer: mm([[0, 0], [5000, 0], [10000, 0], [10000, 5000], [0, 5000]]), holes: [] }]]]); fl.subLattice = {}
    const { blockRings: [blk] } = nodeThePlane(fl, { blockRings: [mm([[0, 0], [10000, 0], [10000, -5000], [0, -5000]])] }), paintE = new Set()
    for (const it of fl.get('g')) it.outer.forEach((a, i) => paintE.add(key(a, it.outer[(i + 1) % it.outer.length])))
    rows.push(['(6) a block ring takes the paint\'s vertex within the bound; its edges are then exactly the paint\'s',
      blk.length === 5 && paintE.has(key(blk[0], blk[1])) && paintE.has(key(blk[1], blk[2]))]) }
  const frozenB = mm([[0, 0], [10000, 0], [10000, 5000], [2000, 0], [0, 5000]]), beforeB = JSON.stringify(frozenB)
  const owners = [{ kind: 'rim' }, { kind: 'street' }, { kind: 'street' }, { kind: 'street' }, { kind: 'street' }]
  const frozenR = mm([[20000, 0], [30000, 0], [30000, 5000], [22000, 0], [20000, 5000]])
  const fl6 = new Map([['g', [{ outer: mm([[0, 6000], [9000, 6000], [9000, 9000], [0, 9000]]), holes: [] }]]]); fl6.subLattice = {}
  const N6 = nodeThePlane(fl6, { blockRings: [frozenB], rimRings: [{ ring: frozenR, owners }] })
  const cutOk = (n) => pinchesIn(n.blockRings.map(r => ({ outer: r }))) === 0
  rows.push([`(6) a block ring touching itself below the lattice is CUT there, into its ${N6.blockRings.length} loops (none in the paint's subLattice)`,
    cutOk(N6) && N6.blockRings.length === 2 && !fl6.subLattice['participant:block']])
  rows.push(['(6) mutant: the block ring returned uncut is RED', !cutOk({ blockRings: [frozenB] })])
  const rimAgrees = (n, refused) => pinchesIn(n.rimRings.filter(Boolean).map(r => ({ outer: r.ring }))) === refused.filter(r => r.who === 'rim').length
  rows.push([`(6) a rim ring pinching is REFUSED at its stretch and counted (${N6.refused.length}, ground.json ${fl6.noded.refused})`, rimAgrees(N6, N6.refused) && N6.refused.length === 1 && fl6.noded.refused === 1])
  rows.push(['(6) mutant: the rim refusal silently dropped is RED', !rimAgrees(N6, [])])
  rows.push(['(6) the frozen block and rim rings are never touched', JSON.stringify(frozenB) === beforeB && N6.rimRings[0].ring !== frozenR])
  { const fl = new Map([['g', [{ outer: mm([[0, 0], [5000, 0], [10000, 0], [10000, 5000], [0, 5000]]), holes: [] }]]]); fl.subLattice = {}
    const R = nodeThePlane(fl, { rimRings: [null, { ring: mm([[0, 0], [10000, 0], [10000, -5000], [0, -5000]]), owners: owners.slice(0, 4) }] }).rimRings[1]
    rows.push(['(6) a rim ring\'s inserted vertex takes its edge\'s owner, at its own tile', R.ring.length === 5 && R.owners.map(o => o.kind).join() === 'rim,rim,street,street,street']) }
  const why6 = kerbReadsTheNodedRings(src)
  rows.push([`(6) the kerb's finder and cells read the noded block rings, after nodeThePlane${why6 ? ` — ${why6}` : ''}`, !why6])
  rows.push(['(6) mutant: kerbPlan reading the frozen block rings is RED', !!kerbReadsTheNodedRings(src.replace('kerbPlan({ blockRings: nodedBlockRings,', 'kerbPlan({ blockRings,'))])
  const why5 = planeNodedLast(src)
  rows.push([`(5) the plane is noded, then cut at its pinches, after its last re-clip and before planGroup${why5 ? ` — ${why5}` : ''}`, !why5])
  rows.push(['(5) mutant: the cut removed is RED', !!planeNodedLast(src.replace(/splitAtPinches\(noded\[g\]\.items, k, flattened\.subLattice\)/, 'noded[g].items'))])
  rows.push(['(5) mutant: the plane noded before the ease split is RED', !!planeNodedLast(src.replace(/nodeThePlane\(flattened, \{ blockRings, rimRings \}\)/, '({ blockRings })').replace('const flattened = flattenPaintStack(nodedEntries, { keepOwnSlot: KEEP_OWN_SLOT, doesNotCut: DOES_NOT_CUT })', 'const flattened = nodeThePlane(flattenPaintStack(nodedEntries, { keepOwnSlot: KEEP_OWN_SLOT, doesNotCut: DOES_NOT_CUT }))'))])
  console.log = log
  for (const [m, ok] of rows) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
  return rows.filter(r => !r[1]).length
}

let bad = await synthetic()
if (argv.includes('--selftest')) process.exit(bad ? 1 : 0)
const one = (town, raw) => {
  const p = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--one=${town}`, ...(raw ? ['--unnoded'] : []), ...(arg('shore') ? [`--shore=${arg('shore')}`] : [])],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=12288' } })
  const line = (p.stdout || '').split('\n').find(l => l.startsWith('RESULT '))
  return line ? JSON.parse(line.slice(7)) : { town, notChecked: `the run died (${p.signal || p.status}): ${(p.stderr || '').trim().split('\n').pop()}` }
}
let unchecked = 0, mutantRefused = 0
for (const town of ribbonScenes(argv.filter(a => !a.startsWith('--')))) {
  const r = one(town, false)
  if (r.notChecked) { unchecked++; console.log(`  ⛔ ${town}: NOT CHECKED — ${r.notChecked}`); continue }
  const pairs = Object.entries(r.pairs || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) => `${k} ${c}`).join(' · ') + (Object.keys(r.pairs || {}).length > 6 ? ' · …' : '')
  console.log(`  ${r.refused ? '⛔' : '✅'} ${town}: ${r.refused ? `REFUSED — ${r.refused}` : 'flattens'} · noded ${r.inserted} vertex(es)${pairs ? ` (${pairs})` : ''}`
    + (r.drops ? ` · dropped below the lattice: ${r.drops.length}${r.drops.length ? ` (${r.drops.join(', ')})` : ''}` : ''))
  if (r.output) console.log(`     the plane: noded ${r.output.inserted} · cut at ${r.pinches.loops} pinch loop(s), ${r.pinches.m2} m², widest ${r.pinches.widestMm} mm`
    + ` · ${r.unsplit ? `⛔ ${r.unsplit} pinch(es) left` : 'pinches nowhere'} · past the bound, within two roundings: ${r.output.pastBound.vertices} vertex(es), worst ${r.output.pastBound.worstMm} mm (not joined; rim brief (A))`)
  if (r.refused || r.unsplit) bad++
  if (argv.includes('--mutants')) { const m = one(town, true)
    console.log(`     (1) mutant, noding off: ${m.notChecked ? `NOT CHECKED — ${m.notChecked}` : m.refused ? `REFUSED — ${m.refused}` : 'flattens'}`)
    if (m.refused) mutantRefused++ }
}
if (argv.includes('--mutants') && !mutantRefused) { bad++; console.log('  ⛔ (1) mutant, noding off: no town refused — the check cannot see the class it guards') }
console.log(`\n${bad ? '⛔ FAIL' : unchecked ? '⚠️ PARTIAL' : '✅ PASS'}${unchecked ? ` — ${unchecked} town(s) NOT CHECKED` : ''}`)
process.exit(bad ? 1 : unchecked ? 2 : 0)
