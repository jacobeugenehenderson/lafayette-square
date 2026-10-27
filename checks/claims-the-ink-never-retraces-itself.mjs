#!/usr/bin/env node
// CLAIM — THE INK NEVER RETRACES ITSELF (Boz's ruling, 2026-10-27, on Zob's read of PTown v3's r215). An island's coast is a
// CLOSED arc (bake-coast writes its ring with the first point repeated). ① walked it as an OPEN chain, so its two butts lay on
// top of each other at the seam, on different normals, and absorbInk refused the face as "both ink and not ink" — only when the
// seam fell where the butts crossed (r215 at hole[0]; the other seats minted), a lottery. The fix: a coast chain whose two ends
// are one point is its own partner in the cut-join walk, so it is stroked CLOSED, its seam a bend like every other vertex
// (tileGround.js#mintProtopolygon). Two guards ride with it:
//   (b) AT THE CAUSE: an OPEN stroke whose two ends are one point, meeting nothing else there, refuses by owner (a closed path
//       stroked open). A loop whose ends meet another stroke at a real node is outlined by that node (HPDM grandview-place-2).
//   (a) THE FAMILY CHECK, at ①'s exit: no INK ring and no FACE ring (outer or hole) runs back over one of its own edges, exact on
//       the lattice (`ringRetraces`), refused by owner. ⛔ (a) does NOT catch a NEAR-retrace that only becomes exact once absorbInk
//       nodes the ink against the centrelines — r215's open butts were 1 mm off collinear at ①'s exit. absorbInk is the backstop
//       for that, and it refuses loudly. That gap is on the record, not hidden. (a)'s face side is exercised by
//       checks/claims-a-pinched-face-is-two-faces.mjs (its split-removed mutant refuses by (a)'s name).
//   ROWS: (1) r215 (PTown v3's island ring 215, translated) mints · (2) with its seam at EVERY one of its vertices, it mints.
//   MUTANTS (always run): the open stroking restored → RED at (b), at ①, not at absorb · and (b) removed → the refusal goes back
//   to absorbInk (the near-retrace, caught one stage late, which is why (b) exists).
//   node checks/claims-the-ink-never-retraces-itself.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const sa = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
// PTown v3 (ptown-failed5) water[0] ring 215, less (−3550, −1615) and lifted 60 m into a water band z > 0; its seam at index 0
const R215 = [[-0.466,56.011],[-5.025,58.569],[-5.857,61.079],[-4.571,64.068],[-5.256,66.031],[0.022,67.806],[2.707,61.071],[0.521,58.098],[0.342,55.728]]
const B = 200, water = [[-B, 0], [B, 0], [B, B], [-B, B]]
const side = { pavementHW: 5, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk', parking: 2.4 }
const st = (id, pts) => ({ skelId: id, roadId: id, throughId: id, name: id, points: pts, highway: 'residential', class: 'local', lanes: 2, oneway: false,
  measure: { left: { ...side }, right: { ...side }, symmetric: true, source: 'seed' }, seed: { cornerR: 4.5, pavementHW: 5 },
  marks: { centre: { kind: 'none' }, edges: { kind: null } }, caps: { start: { cap: null, degree: 2 }, end: { cap: null, degree: 2 } } })
const sq = [[60, -100], [140, -100], [140, -160], [60, -160]], streets = sq.map((a, i) => st('s' + i, [a, sq[(i + 1) % 4]]))
const disc = Array.from({ length: 64 }, (_, i) => [180 * Math.cos(i / 32 * Math.PI), 180 * Math.sin(i / 32 * Math.PI)])
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
// the island as a hole of the water (wound negative), its arc the ring closed on its own first point, as bake-coast writes it
const mint = (tg, seat = 0) => { let hole = [...R215.slice(seat), ...R215.slice(0, seat)]; if (sa(hole) > 0) hole.reverse()
  try { quiet(() => tg.mintProtopolygon({ streets, bb: { x0: -B, x1: B, z0: -B, z1: B }, boundary: disc, coast: [water, hole], coastArcs: [[[B, 0], [-B, 0]], [...hole, hole[0]]] })); return null }
  catch (e) { return String(e.message) } }

const tg = await import('../src/lib/tileGround.js')
{ const why = mint(tg); row(!why, `(1) PTown v3's island r215, its seam where the coast put it: ${why ? `REFUSED (${why.slice(0, 160)})` : 'mints'}`) }
{ const refused = R215.map((_, k) => ({ k, why: mint(tg, k) })).filter(x => x.why)
  row(!refused.length, `(2) its seam at every one of its ${R215.length} vertices: ${refused.length ? `${refused.length} REFUSE (seat ${refused[0].k}: ${refused[0].why.slice(0, 120)})` : 'every seat mints — no seam lottery'}`) }

function mutant(edits) {
  let src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
  for (const [a, b] of edits) { if (src.split(a).length !== 2) return { err: `the anchor is not in tileGround.js once — re-aim it: ${a.slice(0, 70)}` }; src = src.replace(a, b) }
  const dir = mkdtempSync(join(tmpdir(), 'retrace-')), LIB = join(ROOT, 'src/lib')
  src = src.replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(LIB, r)).href}"`).replace(/from 'clipper-lib'/g, `from "${import.meta.resolve('clipper-lib')}"`)
  writeFileSync(join(dir, 'tileGround.js'), src); return { dir }
}
const OPEN = ["live.forEach((c, n) => { if (c.isCoast && c.lastI >= 3 && qk4(c.P[0]) === qk4(c.P[c.lastI])) {", "live.forEach((c, n) => { if (false) {"]
const NO_B = ["if (!s.closed && n >= 3 && qk4(s.V[0].p) === qk4(s.V[n - 1].p) && strokesAt.get(qk4(s.V[0].p)).size === 1) {", "if (false) {"]
for (const [name, edits, judge, want] of [
  ['the open stroking restored', [OPEN], (w) => /an OPEN stroke whose two ends are one point/.test(w || ''), 'RED at (b), at ①, not at absorb'],
  ['and (b) removed', [OPEN, NO_B], (w) => /\[①\]\[absorb\]/.test(w || ''), 'the refusal goes back to absorbInk, one stage late']]) {
  const m = mutant(edits)
  if (m.err) { row(false, `mutant (${name}): ${m.err}`); continue }
  try { const M = await import(pathToFileURL(join(m.dir, 'tileGround.js')).href), why = mint(M), ok = judge(why)
    row(ok, `mutant: ${name} → ${why ? (ok ? `${want}, RED as it must be` : `refused, but not as wanted (${why.slice(0, 140)})`) : 'MINTED — the row proves nothing'}`) }
  finally { rmSync(m.dir, { recursive: true, force: true }) } }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the ink never retraces itself')
process.exit(red ? 1 : 0)
