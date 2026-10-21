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
//   (4) a vertex off the lattice — the noding refuses it, never rounds it.
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
  const { bakeGround, flattenPaintStack } = await import('../cartograph/bake-ground.js')
  const { lookFor } = await import('../scratch/_proto-feed.mjs')
  const log = console.log, lines = []
  console.log = (...a) => lines.push(a.join(' '))
  let r
  try {
    const st = await bakeGround({ look: lookFor(town), scene: town, shorePending: arg('shore') === 'pending', stackOnly: true })
    const entries = argv.includes('--unnoded') ? st.unnoded : st.stackEntries
    try {
      const out = flattenPaintStack(entries, { keepOwnSlot: st.keepOwnSlot, doesNotCut: st.doesNotCut })
      const drops = Object.entries(out.subLattice).flatMap(([g, v]) => [...(v.bowTies || []).map(() => 'bowTie ' + g), ...(v.orphanHoles || []).map(() => 'orphan ' + g)])
      r = { town, refused: null, inserted: st.stackEntries.inserted, pairs: st.stackEntries.pairs, drops }
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

// ── synthetic rows (milliseconds) ────────────────────────────────────────────────────────────────────────────────────
async function synthetic() {
  const { nodeAcrossGroups, NODE_BOUND } = await import('../cartograph/bake-ground.js')
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
  if (r.refused) bad++
  if (argv.includes('--mutants')) { const m = one(town, true)
    console.log(`     (1) mutant, noding off: ${m.notChecked ? `NOT CHECKED — ${m.notChecked}` : m.refused ? `REFUSED — ${m.refused}` : 'flattens'}`)
    if (m.refused) mutantRefused++ }
}
if (argv.includes('--mutants') && !mutantRefused) { bad++; console.log('  ⛔ (1) mutant, noding off: no town refused — the check cannot see the class it guards') }
console.log(`\n${bad ? '⛔ FAIL' : unchecked ? '⚠️ PARTIAL' : '✅ PASS'}${unchecked ? ` — ${unchecked} town(s) NOT CHECKED` : ''}`)
process.exit(bad ? 1 : unchecked ? 2 : 0)
