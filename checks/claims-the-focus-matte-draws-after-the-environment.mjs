#!/usr/bin/env node
// claims-the-focus-matte-draws-after-the-environment.mjs — DOES EVERYTHING HUNG ON A HERO DRAW AFTER ITS TOWN'S ENVIRONMENT?
//
// ⭐ THE CLAIM (Sigil, 2026-11-01; Boz's go, Zob's co-sign). Jacob: "the matte is fixed last"; "the lights are supposed to be
// part of the monument, especially in terms of the focus matte". Measured in Stage PTown: the Light Show's glass and light
// write no depth, so the landcover, the water's absorption and the water, drawn after them and lying behind them, painted
// over the bulbs wherever the background changed; the matte drawn after the water restored every bulb.
// Five judges, each reading the source of truth:
//   1 · THE ORDER, RUN (src/lib/drawOrder.js): not-yet before a town's ground loads; max+1 after; it follows a re-bake that
//       adds groups; an empty or malformed ground is REFUSED; two towns never share an order (keyed by lookId); a ground that
//       reaches the neon's order is REFUSED (the known limit, named in drawOrder.js).
//   2 · EVERY TOWN, RUN: each baked ground in public/baked/<town>/ground.json derives an order of max+1, below the neon.
//       (public/baked is not in git: a tree without it cannot judge this, and says so with exit 2.)
//   3 · THE ENFORCER, RUN: every mesh under the node takes the order; a mesh mounted later takes it on the next pass; a
//       settled tree changes nothing.
//   4 · THE WIRING, READ: SetPiece mounts <FocusMatteOrder> on the same `focus:<id>` the renderer is named with; the enforcer
//       runs in a frame callback (every frame, so late displays are covered), reports a refusal to the failure sink
//       (layer `focus-matte`) and clears it; BakedGround records its town's ground orders; the neon reads
//       NEON_RENDER_ORDER (no literal of its own); the weather draws after the neon; one site enforces the matte.
// ⭐ MUTANTS (--mutants), each must go RED: (a) the enforcer unmounted → 4 · (b) a constant matte order → 2 · (c) the neon
// ceiling removed → 1 · (d) a literal neon order below the matte → 4 · (e) a second site enforcing the matte → 4 ·
// (f) no failure report → 4 · (g) the orders not keyed by town → 1 · (h) the enforcer run once, at mount → 4.
//   node checks/claims-the-focus-matte-draws-after-the-environment.mjs [--mutants]
// Read-only. Exits 1 on a failing judge or a GREEN mutant; 2 if only judge 2 could not run (no baked grounds here).
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importSource } from './_importSource.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const code = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l)).join('\n')
const SRC = {
  order: read('src/lib/drawOrder.js'), enforcer: read('src/components/FocusMatteOrder.jsx'), setPiece: read('src/components/SetPiece.jsx'),
  ground: read('src/components/BakedGround.jsx'), neon: read('src/components/NeonBands.jsx'),
  rain: read('src/components/weather/RainParticles.jsx'), snow: read('src/components/weather/SnowParticles.jsx'),
}
// drawOrder.js run through the one sanctioned loader; a mutant is its text, transformed. A module's state is fresh per text.
const load = (orderSrc) => importSource('src/lib/drawOrder.js', { transform: () => orderSrc })

// ── 1 · the order, run ───────────────────────────────────────────────────────
async function judgeOrder(orderSrc) {
  const why = [], M = await load(orderSrc), g = (n, start = 0) => Array.from({ length: n }, (_, i) => ({ id: `g${i}`, renderOrder: start + i }))
  if (M.matteOrderFor('a').state !== 'not-yet') why.push('a town whose ground has not loaded is not "not-yet"')
  M.setGroundOrders('a', g(43)); let r = M.matteOrderFor('a')
  if (r.state !== 'ok' || r.order !== 43) why.push(`a ground of max 42 gives ${JSON.stringify(r)}, not order 43`)
  M.setGroundOrders('a', g(53)); r = M.matteOrderFor('a')
  if (r.order !== 53) why.push(`a re-bake to max 52 gives ${JSON.stringify(r)}, not order 53`)
  M.setGroundOrders('b', g(20)); if (M.matteOrderFor('a').order !== 53 || M.matteOrderFor('b').order !== 20) why.push(`two towns share an order: a ${JSON.stringify(M.matteOrderFor('a'))}, b ${JSON.stringify(M.matteOrderFor('b'))}`)
  M.setGroundOrders('c', []); if (M.matteOrderFor('c').state !== 'refused') why.push('an empty ground is not refused')
  M.setGroundOrders('d', [{ id: 'x' }]); if (M.matteOrderFor('d').state !== 'refused') why.push('a ground group with no renderOrder is not refused')
  M.setGroundOrders('e', g(1, M.NEON_RENDER_ORDER - 1)); if (M.matteOrderFor('e').state !== 'refused') why.push(`a ground reaching renderOrder ${M.NEON_RENDER_ORDER - 1} is not refused (the matte would meet the neon)`)
  return why
}

// ── 2 · every town, run ──────────────────────────────────────────────────────
async function judgeTowns(orderSrc) {
  const why = [], M = await load(orderSrc), baked = join(ROOT, 'public/baked')
  const towns = existsSync(baked) ? readdirSync(baked).filter((t) => existsSync(join(baked, t, 'ground.json'))) : []
  if (!towns.length) return { why: ['no public/baked/<town>/ground.json in this tree (slabs are not in git)'], unjudged: true }
  for (const t of towns) {
    const groups = JSON.parse(readFileSync(join(baked, t, 'ground.json'), 'utf8')).groups || []
    M.setGroundOrders(t, groups); const r = M.matteOrderFor(t), max = Math.max(...groups.map((x) => x.renderOrder))
    if (r.state !== 'ok' || r.order !== max + 1 || r.order >= M.NEON_RENDER_ORDER) why.push(`${t}: ground max ${max} gives ${JSON.stringify(r)}, not ${max + 1} below the neon (${M.NEON_RENDER_ORDER})`)
  }
  return { why, towns }
}

// ── 3 · the enforcer, run ────────────────────────────────────────────────────
async function judgeEnforcer(orderSrc) {
  const why = [], M = await load(orderSrc)
  const node = (kids = []) => ({ isMesh: false, renderOrder: 0, children: kids, traverse(f) { f(this); for (const k of this.children) k.traverse(f) } })
  const mesh = (ro = 0) => ({ ...node(), isMesh: true, renderOrder: ro })
  const root = node([mesh(), mesh(16), node([mesh()])])
  M.enforceMatteOrder(root, 52); const all = []; root.traverse((o) => { if (o.isMesh) all.push(o.renderOrder) })
  if (all.some((v) => v !== 52)) why.push(`after one pass the meshes are at ${all.join(', ')}, not all 52`)
  if (M.enforceMatteOrder(root, 52) !== 0) why.push('a settled tree is written again (it must write only on a change)')
  const late = mesh(); root.children[2].children.push(late)
  M.enforceMatteOrder(root, 52); if (late.renderOrder !== 52) why.push(`a mesh mounted after the node is at ${late.renderOrder} after the next pass, not 52`)
  return why
}

// ── 4 · the wiring, read ─────────────────────────────────────────────────────
function judgeWiring(S, otherSites) {
  const why = [], sp = code(S.setPiece), en = code(S.enforcer), gr = code(S.ground), ne = code(S.neon)
  if (!/<FocusMatteOrder lookId=\{lookId\} name=\{`focus:\$\{id\}`\} \/>/.test(sp) || !/focusName=\{`focus:\$\{id\}`\}/.test(sp)) why.push('SetPiece does not mount <FocusMatteOrder> on the same focus:<id> the renderer is named with')
  if (!/useTownFrame\(\(state\) => \{[\s\S]*enforceMatteOrder\(node\.current, r\.order\)[\s\S]*\}, undefined, 'focus matte order'\)/.test(en)) why.push('FocusMatteOrder does not enforce the order in a frame callback (every frame: late-mounted displays are missed)')
  if (/useEffect\([\s\S]*enforceMatteOrder/.test(en)) why.push('FocusMatteOrder enforces in an effect (once): a display that mounts later stays drawn under the environment')
  if (!/report\(\{ lookId, layer: MATTE_LAYER, kind: 'refusal', reason: r\.reason \}\)/.test(en) || !/clear\(lookId, MATTE_LAYER\)/.test(en) || !/MATTE_LAYER = 'focus-matte'/.test(en)) why.push('FocusMatteOrder does not report its refusal to the failure sink (layer focus-matte) and clear it')
  if (!/setGroundOrders\(look, manifest\.groups\)/.test(gr)) why.push('BakedGround does not record its town\'s ground orders (setGroundOrders(look, manifest.groups))')
  if (!/renderOrder=\{NEON_RENDER_ORDER\}/.test(ne) || !/renderOrder=\{NEON_RENDER_ORDER \+ 1\}/.test(ne) || /renderOrder=\{\d/.test(ne)) why.push('NeonBands does not draw at NEON_RENDER_ORDER (a literal order of its own can fall under the matte)')
  const w = (t) => +(code(t).match(/renderOrder=\{(\d+)\}/) || [])[1]
  for (const [k, t] of [['rain', S.rain], ['snow', S.snow]]) if (!(w(t) > 101)) why.push(`${k} draws at ${w(t)}, not after the neon`)
  for (const f of otherSites) why.push(`${f} also enforces or derives the matte order — one site (FocusMatteOrder)`)
  return why
}
const sitesOf = (files) => Object.entries(files).filter(([f, t]) => f !== 'src/components/FocusMatteOrder.jsx' && f !== 'src/lib/drawOrder.js' && /\b(enforceMatteOrder|matteOrderFor)\b/.test(code(t))).map(([f]) => f)
function srcFiles() { const out = {}; const walk = (d) => { for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(e.name)) out[p] = read(p) } }; walk('src'); return out }

const files = srcFiles()
const res = { 1: await judgeOrder(SRC.order), 2: await judgeTowns(SRC.order), 3: await judgeEnforcer(SRC.order), 4: judgeWiring(SRC, sitesOf(files)) }
let bad = 0, unjudged = false
console.log('\nThe focus matte draws after its town\'s environment')
for (const [k, name] of [[1, 'the order, run'], [2, 'every town, run'], [3, 'the enforcer, run'], [4, 'the wiring, read']]) {
  const r = res[k], why = Array.isArray(r) ? r : r.why
  if (r.unjudged) { unjudged = true; console.log(`  ⚠ ${k} · ${name}: NOT JUDGED — ${why[0]}`); continue }
  if (why.length) { bad++; console.log(`  ⛔ ${k} · ${name}`); for (const w of why) console.log(`       ${w}`) }
  else console.log(`  ✅ ${k} · ${name}${r.towns ? ` (${r.towns.join(', ')})` : ''}`)
}

if (process.argv.includes('--mutants')) {
  const sub = (s, a, b) => { if (!s.includes(a)) throw new Error(`mutant anchor missing: ${a.slice(0, 60)}`); return s.replace(a, b) }
  const MUTANTS = [
    ['a · the enforcer unmounted', 4, async () => judgeWiring({ ...SRC, setPiece: sub(SRC.setPiece, '<FocusMatteOrder lookId={lookId} name={`focus:${id}`} />', '') }, [])],
    ['b · a constant matte order', 2, async () => (await judgeTowns(sub(SRC.order, 'const order = g.max + 1', 'const order = 60'))).why],
    ['c · the neon ceiling removed', 1, async () => judgeOrder(sub(SRC.order, 'if (order >= NEON_RENDER_ORDER) return', 'if (false) return'))],
    ['d · a literal neon order below the matte', 4, async () => judgeWiring({ ...SRC, neon: sub(SRC.neon, 'renderOrder={NEON_RENDER_ORDER} frustumCulled', 'renderOrder={40} frustumCulled') }, [])],
    ['e · a second site enforcing the matte', 4, async () => judgeWiring(SRC, sitesOf({ ...files, 'src/displays/lightShow/LightShow.jsx': files['src/displays/lightShow/LightShow.jsx'] + '\nenforceMatteOrder(root, 52)\n' }))],
    ['f · no failure report', 4, async () => judgeWiring({ ...SRC, enforcer: sub(SRC.enforcer, "useFailures.getState().report({ lookId, layer: MATTE_LAYER, kind: 'refusal', reason: r.reason })", 'console.error(r.reason)') }, [])],
    ['g · the orders not keyed by town', 1, async () => judgeOrder(sub(sub(SRC.order, "grounds.set(lookId, { max:", "grounds.set('*', { max:"), 'const g = grounds.get(lookId)', "const g = grounds.get('*') ?? grounds.get(lookId)"))],
    ['h · the enforcer run once, at mount', 4, async () => judgeWiring({ ...SRC, enforcer: sub(SRC.enforcer, '  useTownFrame((state) => {', '  useEffect(() => { enforceMatteOrder(node.current, 0) }, [])\n  useTownFrame((state) => {') }, [])],
  ]
  console.log('\n  mutants:')
  for (const [name, judge, run] of MUTANTS) {
    const r = await run()
    if (r.length) console.log(`    ✅ RED   ${name} → ${judge}: ${r[0].slice(0, 110)}`)
    else { bad++; console.log(`    ⛔ GREEN ${name} → ${judge} did not catch it`) }
  }
}
process.exit(bad ? 1 : unjudged ? 2 : 0)
