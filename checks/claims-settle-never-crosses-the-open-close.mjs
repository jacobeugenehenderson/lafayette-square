#!/usr/bin/env node
// CLAIM — SETTLE NEVER CROSSES WHAT THE OPEN/CLOSE RULED (Boz's ruling, 2026-10-27: "one water, not two"). bake-coast opens and
// closes the traced water at the trace step (structures.mjs#openCloseAtStep) — the kit's word on what the water is — and then
// settles each vertex on the lidar (bake-coast.mjs#settleOnSource), which still holds the channel or neck the open/close removed.
// Settle's bracket is ±step and every such feature is narrower than a cell, so it walked banks back ACROSS the feature, to inside
// the ink: PTown v3 at five places, each refused by the coast verifier's clearance (claims-a-coast-ring-keeps-the-ink-clear). Now
// each feature is a WALL (bake-coast.mjs#wallsOf): a vertex's bracket is cut where its normal first meets a feature's edge, a
// bound like the ring's own clearances.
//   ROWS: PTown's coast baked in memory (the town's own lidar and inputs, written to a temp dir, nothing to the town): the
//   verifier passes, and at each of the five places the coast keeps the ink clear (no two rings, or parts of one, within
//   2·INK_EPS within 3 m of it).
//   MUTANT (always run): the wall removed (it never bounds) → bake-coast refuses by the verifier's 'near', RED.
//   Heavy (two coast bakes of PTown, the lidar read twice). ⛔ A town without its inputs is RED by name, never skipped.
//   node checks/claims-settle-never-crosses-the-open-close.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const SCENE = 'provincetown', PLACES = [['the island', [-3516.648, -1868.516]], ['two islands from one', [-382.906, 2906.144]], ['two islands off the mainland', [-1963.203, 1677.305]], ['ring 166', [-3790.882, -767.661]], ['ring 109', [-1514.051, 1480.343]]]
const { INK_EPS } = await import('../src/lib/tileGround.js'), W = 2 * INK_EPS
const quietly = async (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await f() } finally { console.log = l; console.warn = w } }
const segd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
// the least clearance near P: any vertex within 3 m of P to any edge of the coast that is not its own or its neighbours'
const clearAt = (rings, P) => { let m = Infinity
  rings.forEach((r, ri) => r.forEach((p, k) => { if (Math.hypot(p[0] - P[0], p[1] - P[1]) > 3) return
    rings.forEach((s, si) => s.forEach((a, j) => { if (si === ri && (j === k || j === (k - 1 + r.length) % r.length)) return
      const b = s[(j + 1) % s.length]; if (Math.min(Math.hypot(a[0] - P[0], a[1] - P[1]), Math.hypot(b[0] - P[0], b[1] - P[1])) > 6) return; m = Math.min(m, segd(p, a, b)) })) }))
  return m }
const bake = async (mod) => { const dir = mkdtempSync(join(tmpdir(), 'settle-'))
  try { await quietly(() => mod.bakeCoast({ scene: SCENE, outDir: dir, write: true })); return { doc: JSON.parse(readFileSync(join(dir, 'coast.json'), 'utf8')) } }
  catch (e) { return { why: String(e.message) } } finally { rmSync(dir, { recursive: true, force: true }) } }

if (!existsSync(join(ROOT, 'cartograph/data', SCENE, 'raw/osm.json'))) row(false, `${SCENE}: no inputs in this tree — NOT checked`)
else {
  const live = await bake(await import('../cartograph/bake-coast.mjs'))
  row(!live.why, `PTown's coast baked with the wall: ${live.why ? `REFUSED (${live.why.slice(0, 200)})` : 'the verifier (with the ink clearance) passes'}`)
  if (live.doc) { const rings = live.doc.water.flatMap(b => [b.outer, ...b.holes])
    for (const [name, P] of PLACES) { const c = clearAt(rings, P); row(c >= W, `  ${name} (${P.join(', ')}): least clearance ${Number.isFinite(c) ? (c * 1000).toFixed(2) + ' mm' : '—'} (the ink is ${W * 1000} mm)`) } }
  // MUTANT: the wall that never bounds
  const src = readFileSync(join(ROOT, 'cartograph/bake-coast.mjs'), 'utf8'), ANCHOR = 'wallsOf([...oc.openedPieces.features, ...oc.closedPieces.features])'
  if (src.split(ANCHOR).length !== 2) row(false, 'mutant: the wall is not handed to settle once — re-aim the anchor')
  else { const dir = mkdtempSync(join(tmpdir(), 'nowall-')), base = join(ROOT, 'cartograph')
    try { writeFileSync(join(dir, 'bake-coast.mjs'), src.replace(ANCHOR, '(() => Infinity)')
        .replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(base, r)).href}"`).replace(/from 'clipper-lib'/g, `from "${import.meta.resolve('clipper-lib')}"`))
      const m = await bake(await import(pathToFileURL(join(dir, 'bake-coast.mjs')).href)), ok = /near/.test(m.why || '')
      row(ok, `mutant: the wall removed → ${m.why ? (ok ? `bake-coast refuses by the clearance ('near'), RED as it must be` : `refused, not by the clearance (${m.why.slice(0, 140)})`) : 'the coast PASSES — the rows prove nothing'}`)
    } finally { rmSync(dir, { recursive: true, force: true }) } } }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ settle never crosses what the open/close ruled')
process.exit(red ? 1 : 0)
