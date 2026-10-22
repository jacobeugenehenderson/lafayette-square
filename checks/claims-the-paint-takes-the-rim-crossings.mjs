// claims-the-paint-takes-the-rim-crossings.mjs — EVERY CROSSING THE PAINT MAKES ON THE RIM IS A VERTEX OF EVERY PAINTED RING
// THAT RUNS THROUGH IT, SO THE PLANE THE BAKE MESHES HAS NO T-VERTEX ON THE RIM.
//
// ⭐ WHY (Boz, 2026-10-21; Zob's A/B the same evening): tileGround#nodeRimWithPaint inserts the rim crossings the paint mints
//   into the tile ring, the block AND every painted ring (`nodePaint`). Its only guard was the deformer's ray rows, which left
//   with the deformer, so it read as dead. MEASURED (LS, stack level, live vs nodePaint removed): the plane's noding
//   (bake-ground#nodeThePlane, insert-only within NODE_BOUND, 0.707 mm) cannot close a crossing placed farther off than that;
//   tileGround counts those ("2 rim crossing(s) … farthest 0.931 mm, in 2 tile(s): 42, 145"). Without nodePaint, tile 42 kept
//   7 T-vertices at (803.22, 340.07), 1.31 mm off (treelawn:recreation / face:underived / face:recreation against
//   treelawn:underived); with it, 0. So nodePaint's READER is the plane, and this check reads it there.
// THE PREDICATE, on the plane the bake meshes (bakeGround stackOnly → flattenPaintStack → nodeThePlane, the bake's own
//   functions, imported): a vertex of one group lying ON THE RIM (within two lattice steps of the town's stencil, the
//   boolean's own containment) and within two lattice steps of another group's edge interior without being a vertex of it
//   is a T-vertex. RED where true.
//   ⚠️ nodeThePlane is run without the block and rim participants (stackOnly does not return them); the T-vertices it
//   measures are paint against paint, which is nodePaint's subject.
// ⭐ MUTATION TEST (`--selftest`): the same town measured twice, each in its own child process — live, and with tileGround's
//   `nodePaint` call removed (a copy in the OS temp dir, swapped in by a module-resolve hook, never an edit of the source).
//   The mutant must show MORE rim T-vertices than live. LS shows it (tile 42); a town with no far crossing cannot, and says so.
// HEAVY: one stack-level pour per run (LS ~30 s, a few GB), twice under --selftest. Ask for the machine.
//   node checks/claims-the-paint-takes-the-rim-crossings.mjs --scene=<town> [--selftest]
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { ROOT, eachTown, refuseUnknownFlags } from './_scenes.mjs'

refuseUnknownFlags(['selftest'])
const TOWN = eachTown('cartograph/data/<scene>/neighborhood_boundary.json')   // named = that town; none = every town, one child each
const TGF = join(ROOT, 'src/lib/tileGround.js')
const CALL = '  nodePaint((r) => insertOnEdges(r, null, minted, () => true).ring)\n'

// ── the child: measure one town's rim T-vertices on the plane, print one JSON line ──
if (process.env.__PAINT_RIM_CHILD) {
  const { bakeGround, flattenPaintStack, nodeThePlane } = await import('../cartograph/bake-ground.js')
  const { lookFor } = await import('../scratch/_proto-feed.mjs')
  const { loadSceneStencil } = await import('../cartograph/sceneStencil.js')
  const { CLIP_SCALE } = await import('../src/lib/lattice.js')
  const look = lookFor(TOWN); if (!look) { console.log(JSON.stringify({ err: `no look names ${TOWN}` })); process.exit(2) }
  const log = console.log; console.log = () => {}
  let st, flat
  try { st = await bakeGround({ look, scene: TOWN, shorePending: true, stackOnly: true })
    flat = flattenPaintStack(st.stackEntries, { keepOwnSlot: st.keepOwnSlot, doesNotCut: st.doesNotCut }); nodeThePlane(flat, {}) } finally { console.log = log }
  const disc = loadSceneStencil(ROOT, TOWN).clipPolygon
  if (!disc) { console.log(JSON.stringify({ err: `${TOWN} has no stencil: no rim to read` })); process.exit(2) }
  const TOL = 2 / CLIP_SCALE, G = 8
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0; return Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz) }
  const onRim = (p) => disc.some((a, i) => segD(p[0], p[1], a, disc[(i + 1) % disc.length]) <= TOL)
  const ringsOf = (it) => Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]
  const groups = [...flat.keys()].map(k => ({ k, rs: flat.get(k).flatMap(ringsOf).filter(r => r?.length >= 3) }))
  const grid = new Map(), verts = new Map()
  groups.forEach((g, gi) => { for (const r of g.rs) for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]
    const key = p[0] + ',' + p[1]; (verts.get(key) || verts.set(key, new Set()).get(key)).add(gi)
    for (let x = Math.floor((Math.min(p[0], q[0]) - TOL) / G); x <= Math.floor((Math.max(p[0], q[0]) + TOL) / G); x++)
      for (let z = Math.floor((Math.min(p[1], q[1]) - TOL) / G); z <= Math.floor((Math.max(p[1], q[1]) + TOL) / G); z++) { const c = x + ',' + z; (grid.get(c) || grid.set(c, []).get(c)).push({ gi, p, q }) } } })
  const T = []
  groups.forEach((g, gi) => { for (const r of g.rs) for (const v of r) { if (!onRim(v)) continue
    for (const e of grid.get(Math.floor(v[0] / G) + ',' + Math.floor(v[1] / G)) || []) { if (e.gi === gi) continue
      if ((v[0] === e.p[0] && v[1] === e.p[1]) || (v[0] === e.q[0] && v[1] === e.q[1])) continue
      const dx = e.q[0] - e.p[0], dz = e.q[1] - e.p[1], L2 = dx * dx + dz * dz; if (!L2) continue
      const u = ((v[0] - e.p[0]) * dx + (v[1] - e.p[1]) * dz) / L2; if (u <= 0 || u >= 1) continue
      const d = Math.abs((v[0] - e.p[0]) * dz - (v[1] - e.p[1]) * dx) / Math.sqrt(L2); if (d > TOL) continue
      T.push({ at: v, mm: +(d * 1000).toFixed(4), v: g.k, edge: groups[e.gi].k }); break } } })
  console.log(JSON.stringify({ n: T.length, first: T.sort((a, b) => b.mm - a.mm).slice(0, 12) }))
  process.exit(0)
}

// ── the parent: run the child (live, and under --selftest the mutant too) ──
const run = (env, extra = []) => { const r = spawnSync(process.execPath, [...extra, fileURLToPath(import.meta.url), `--scene=${TOWN}`], { env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 1 << 26 })
  const line = (r.stdout || '').trim().split('\n').reverse().find(l => l.startsWith('{'))
  if (!line) { console.error(`⛔ NOT MEASURED — the child produced no result (exit ${r.status}):\n${(r.stderr || '').slice(-800)}`); process.exit(2) }
  const o = JSON.parse(line); if (o.err) { console.error(`⛔ NOT MEASURED — ${o.err}`); process.exit(2) } return o }
const say = (o) => o.first.slice(0, 4).map(t => `(${t.at.join(', ')}) ${t.v} on ${t.edge} ${t.mm} mm`).join(' · ')

const live = run({ __PAINT_RIM_CHILD: '1' })
console.log(`${live.n ? '⛔' : '✅'} ${TOWN}: ${live.n} T-vertex(es) on the rim of the plane the bake meshes${live.n ? ` — ${say(live)}` : ''}`)
if (process.argv.includes('--selftest')) {
  const src = readFileSync(TGF, 'utf8')
  if (src.split(CALL).length !== 2) { console.log('  ⛔ mutant: tileGround.js no longer carries the nodePaint call this mutant removes — re-aim it'); process.exit(1) }
  const lib = pathToFileURL(join(ROOT, 'src/lib')).href + '/', dir = mkdtempSync(join(tmpdir(), 'paint-rim-'))
  const copy = join(dir, 'tileGround.js')
  writeFileSync(copy, src.replace(CALL, '').replace(/from '\.\/([^']+)'/g, (_, m) => `from '${lib}${m}'`)
    .replace(/from '\.\.\/([^']+)'/g, (_, m) => `from '${pathToFileURL(join(ROOT, 'src', m)).href}'`)
    .replace(/from 'clipper-lib'/g, `from '${pathToFileURL(createRequire(import.meta.url).resolve('clipper-lib')).href}'`))
  // a resolve hook that hands the mutant copy to whoever imports src/lib/tileGround.js
  const hooks = join(dir, 'hooks.mjs'), reg = join(dir, 'register.mjs'), real = pathToFileURL(TGF).href
  writeFileSync(hooks, `export async function resolve(spec, ctx, next) { const r = await next(spec, ctx); return r.url === ${JSON.stringify(real)} ? { ...r, url: ${JSON.stringify(pathToFileURL(copy).href)} } : r }\n`)
  writeFileSync(reg, `import { register } from 'node:module'\nregister(${JSON.stringify(pathToFileURL(hooks).href)})\n`)
  const mut = run({ __PAINT_RIM_CHILD: '1' }, ['--import', pathToFileURL(reg).href])
  const red = mut.n > live.n
  console.log(`  ${red ? '✅' : '⛔'} mutant (tileGround without nodePaint): ${mut.n} rim T-vertex(es) against live ${live.n}${red ? ` — RED, as it must be: ${say(mut)}` : ' — the check cannot see nodePaint on this town (no rim crossing past the plane\'s bound here?)'}`)
  process.exit(red ? 0 : 1)
}
process.exit(live.n ? 1 : 0)
