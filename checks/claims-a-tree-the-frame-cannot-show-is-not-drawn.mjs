#!/usr/bin/env node
// claims-a-tree-the-frame-cannot-show-is-not-drawn.mjs — ARE THE HERO TREE CARDS CULLED TO THE FRAME, AS A VISUAL NO-OP?
//
// ⭐ THE CLAIM (Sigil, 2026-11-02; Boz's go, Zob's co-sign; BRIEF-a-frame-budget-for-every-shot §5, Jacob: "nothing is drawn
// that the rendered frame can't show"). The hero impostor cards are drawn only for the cells whose bound can reach the
// frustum (src/lib/treeCells.js), and a draw's buffers are rewritten only when its visible set changes. Four judges:
//   1 · THE CELLS, RUN: the edge is derived (2R / N^¼, never under twice the largest reach); a cell in the frustum is kept,
//       one well outside is dropped, one just outside but within the wind's reach or the pixel floor's is KEPT.
//   2 · THE BOUND IS THE SHADER'S, READ: the factors in treeCells.js match what the card shader can move a vertex by —
//       hula (≤ amp) + lean (0.7·amp) = 1.7 × the crown lean (CARD_WIND_RIGID), |windDetail| ≤ √2 (a vec2 in [−1,1]²,
//       CARD_FLUTTER_VERTEX), and treeWindCrown's formula; and the felt wind carries the sheet spring's own overshoot.
//   3 · THE WIRING, READ: HeroImpostorTrees tests the cells in a frame callback, rewrites only on a changed set, draws
//       `count` of them, and its off switch restores every instance.
//   4 · THE ASSUMPTION, READ: the main camera is the only view that draws trees — castShadow={false} on every tree mount, no
//       reflection camera in src/components. Whoever adds either meets the cull's premise in this failure.
// ⭐ MUTANTS (--mutants), each must go RED: (a) a constant cell edge → 1 · (b) no wind margin → 1 · (c) no pixel margin → 1 ·
// (d) the shader's lean changed, the factor not → 2 · (e) a rewrite every frame → 3 · (f) a tree mount casting shadows → 4 ·
// (g) the spring overshoot dropped → 2.
//   node checks/claims-a-tree-the-frame-cannot-show-is-not-drawn.mjs [--mutants]
// Read-only. Exits 1 on any failing judge or any mutant left GREEN.
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importSource } from './_importSource.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const code = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
const SRC = { cells: read('src/lib/treeCells.js'), hero: read('src/components/HeroImpostorTrees.jsx'), atlas: read('src/components/treeAtlasMaterial.js'),
  sheet: read('src/lib/windSheet.js'), inst: read('src/components/InstancedTrees.jsx'), over: read('src/components/OverheadTrees.jsx') }
const load = (src) => importSource('src/lib/treeCells.js', { transform: () => src })

// ── 1 · the cells, run ───────────────────────────────────────────────────────
async function judgeCells(src) {
  const why = [], M = await load(src)
  const inst = Array.from({ length: 10000 }, (_, i) => ({ x: (i % 100) * 20 - 1000, z: Math.floor(i / 100) * 20 - 1000, reach: 6 }))
  const { edge, cells } = M.buildCells(inst, 1000), want = Math.max(12, 2000 / Math.pow(10000, 0.25))
  if (Math.abs(edge - want) > 1e-6) why.push(`the cell edge is ${edge}, not 2R/N^¼ = ${want.toFixed(1)} for N 10000, R 1000`)
  if (cells.reduce((a, c) => a + c.idx.length, 0) !== inst.length) why.push('the cells do not hold every instance exactly once')
  // a camera at the origin looking down −z with a 60° vertical, 1.5 aspect frustum (column-major projection·view by hand)
  const f = 1 / Math.tan(Math.PI / 6), a = 1.5, n = 1, far = 5000
  const P = [f / a, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + n) / (n - far), -1, 0, 0, (2 * far * n) / (n - far), 0]   // view = identity
  const planes = M.planesOf(P), opts = { yLo: -5, yHi: 5, camPos: [0, 0, 0], metresPerPx: (d) => d * (2 * Math.tan(Math.PI / 6)) / 1000 }
  const cell = (cx, cz, r = 10) => [{ cx, cz, r, idx: [0] }]
  const vis = (c, o) => M.visibleCells(c, planes, { windM: 0, pxMargin: 0, ...opts, ...o })[0]
  if (vis(cell(0, -500)) !== 1) why.push('a cell straight ahead in the frustum is dropped')
  if (vis(cell(0, 500)) !== 0) why.push('a cell behind the camera is kept')
  const edgeX = 500 * Math.tan(Math.PI / 6) * a   // the right edge at 500 m depth
  // 25 m beyond the edge horizontally is ~19 m from the slanted side plane; the bound (10 m, ±5 m tall) is ~11 m
  if (vis(cell(edgeX + 25, -500)) !== 0) why.push('a cell ~19 m beyond the side plane (bound ~11 m) is kept with no margins: the test is too loose to judge margins')
  if (vis(cell(edgeX + 25, -500), { windM: 10 }) !== 1) why.push('a cell within the wind\'s reach of the frame edge is dropped: a swaying card would pop')
  if (vis(cell(edgeX + 25, -500), { pxMargin: 20 }) !== 1) why.push('a cell within the pixel floor\'s reach of the frame edge is dropped (20 px at 500 m)')
  return why
}

// ── 2 · the bound is the shader's ────────────────────────────────────────────
function judgeBound(S) {
  const why = [], c = code(S.cells), at = code(S.atlas), sh = code(S.sheet), he = code(S.hero)
  const lean = +(c.match(/LEAN_FACTOR = ([\d.]+)/) || [])[1], fl = c.match(/FLUTTER_FACTOR = ([^\s/]+)/)?.[1]
  const leanShare = +(at.match(/transformed\.xz \+= hula \+ ovDir \* \(amp \* ([\d.]+)\)/) || [])[1]
  if (!/vec2\s+hula\s+=\s+vec2\(cos\(drift\), sin\(drift\)\) \* \(amp \* sin\(/.test(at)) why.push('the card\'s hula is no longer amp × a unit vector × a sine: the 1 in LEAN_FACTOR is unproven')
  if (!(Math.abs(lean - (1 + leanShare)) < 1e-9)) why.push(`LEAN_FACTOR is ${lean}, the shader's hula + lean is ${1 + leanShare} × the crown lean (CARD_WIND_RIGID)`)
  if (fl !== 'Math.SQRT2' || !/\* 2\.0 - 1\.0;/.test(sh) || !/transformed\.xz \+= windDetail\(ovWorldXZ \+ position\.xz\) \* ovFlutAmp/.test(at)) why.push('FLUTTER_FACTOR is not √2 for a windDetail in [−1,1]² scaled by the crown flutter (CARD_FLUTTER_VERTEX)')
  if (!/vec2 endemic = vec2\(uTreeWindLeanRefM, uTreeWindFlutRefM\);/.test(at) || !/vec2 weather = vec2\(uTreeWindLeanPerMps, uTreeWindFlutPerMps\) \* felt;/.test(at)) why.push('treeWindCrown is no longer endemic + per-m/s × felt: windReachM does not follow it')
  if (!/Math\.exp\(-z \* Math\.PI \/ Math\.sqrt\(1 - z \* z\)\)/.test(he) || !/WIND_SPRING\.DAMPING/.test(he)) why.push('the strongest felt wind omits the sheet spring\'s own overshoot (WIND_SPRING.DAMPING)')
  return why
}

// ── 3 · the wiring ───────────────────────────────────────────────────────────
function judgeWiring(S) {
  const why = [], he = code(S.hero)
  if (!/useTownFrame\(\(\{ camera, gl \}\) => \{[\s\S]*visibleCells\(d\.cells, planes,[\s\S]*\}, undefined, 'hero impostor cull'\)/.test(he)) why.push('HeroImpostorTrees does not test its cells in a frame callback')
  if (!/if \(sameSet\(vis, d\.vis\)\) continue/.test(he)) why.push('the buffers are rewritten without checking the visible set changed (a rewrite every frame of a flight)')
  if (!/im\.count = n/.test(he)) why.push('the draw is not limited to the visible instances (im.count)')
  if (!/if \(!treeCull\.on \|\| treeDbg\('noCull'\)\)/.test(he) || !/im\.count = d\.full\.n/.test(he)) why.push('the off switch does not restore every instance')
  return why
}

// ── 4 · the assumption ───────────────────────────────────────────────────────
function judgeAssumption(S, comps) {
  const why = []
  for (const [k, t] of [['HeroImpostorTrees', S.hero], ['InstancedTrees', S.inst], ['OverheadTrees', S.over]]) {
    const c = code(t), on = (c.match(/castShadow=\{true\}|castShadow\b(?!=\{false\})(?=[\s>/])/g) || []).length, off = (c.match(/castShadow=\{false\}/g) || []).length
    if (on || !off) why.push(`${k}: a tree mount casts a shadow (or declares none): the cull assumes the main camera is the only view drawing trees`)
  }
  for (const [f, t] of comps) if (/\b(Reflector|CubeCamera)\b/.test(code(t))) why.push(`${f} renders a reflection camera: a tree off the main frame could be seen in it`)
  return why
}
const comps = readdirSync(join(ROOT, 'src/components')).filter((f) => /\.(jsx?)$/.test(f)).map((f) => [f, read(`src/components/${f}`)])

const res = { 1: await judgeCells(SRC.cells), 2: judgeBound(SRC), 3: judgeWiring(SRC), 4: judgeAssumption(SRC, comps) }
let bad = 0
console.log('\nA tree the frame cannot show is not drawn')
for (const [k, name] of [[1, 'the cells, run'], [2, 'the bound is the shader\'s'], [3, 'the wiring'], [4, 'the only view is the main camera']]) {
  if (res[k].length) { bad++; console.log(`  ⛔ ${k} · ${name}`); for (const w of res[k]) console.log(`       ${w}`) }
  else console.log(`  ✅ ${k} · ${name}`)
}
if (process.argv.includes('--mutants')) {
  const sub = (s, a, b) => { if (!s.includes(a)) throw new Error(`mutant anchor missing: ${a.slice(0, 60)}`); return s.replace(a, b) }
  const MUTANTS = [
    ['a · a constant cell edge', 1, () => judgeCells(sub(SRC.cells, '(2 * discRadius) / Math.pow(inst.length, 0.25)', '100'))],
    ['b · no wind margin', 1, () => judgeCells(sub(SRC.cells, 'Math.hypot(c.r + windM, yh)', 'Math.hypot(c.r, yh)'))],
    ['c · no pixel margin', 1, () => judgeCells(sub(SRC.cells, ' + pxMargin * metresPerPx(dist)', ''))],
    ['d · the shader\'s lean changed, the factor not', 2, () => judgeBound({ ...SRC, atlas: sub(SRC.atlas, 'transformed.xz += hula + ovDir * (amp * 0.7);', 'transformed.xz += hula + ovDir * (amp * 1.2);') })],
    ['e · a rewrite every frame', 3, () => judgeWiring({ ...SRC, hero: sub(SRC.hero, 'if (sameSet(vis, d.vis)) continue', '') })],
    ['f · a tree mount casting shadows', 4, () => judgeAssumption({ ...SRC, hero: sub(SRC.hero, 'castShadow={false}', 'castShadow={true}') }, comps)],
    ['g · the spring overshoot dropped', 2, () => judgeBound({ ...SRC, hero: sub(SRC.hero, ' * (1 + Math.exp(-z * Math.PI / Math.sqrt(1 - z * z)))', '') })],
  ]
  console.log('\n  mutants:')
  for (const [name, judge, run] of MUTANTS) {
    const r = await run()
    if (r.length) console.log(`    ✅ RED   ${name} → ${judge}: ${r[0].slice(0, 110)}`)
    else { bad++; console.log(`    ⛔ GREEN ${name} → ${judge} did not catch it`) }
  }
}
process.exit(bad ? 1 : 0)
