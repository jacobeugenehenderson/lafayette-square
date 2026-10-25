// Splice: FIND (never hand-claim) a small input on which the stamp's round-then-retest loop (stampCrossings) does not
// settle: two rings on the 1 mm lattice whose long edges cross at a shallow angle, seeded, kept only if the old loop
// throws "did not settle". Writes the first hit as a fixture.   node scratch/splice/find-cycle.mjs <out.json> [tries]
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'; import { tmpdir } from 'node:os'; import { pathToFileURL } from 'node:url'
const [outP, triesS] = process.argv.slice(2), tries = +(triesS || 20000)
const D = join(new URL('../../', import.meta.url).pathname, 'src/lib')
let src = readFileSync(join(D, 'tileGround.js'), 'utf8').replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from '${pathToFileURL(join(D, r)).href}'`)
  .replace(/from 'clipper-lib'/g, `from '${import.meta.resolve('clipper-lib')}'`) + '\nexport { stampCrossings as __sc }\n'
const p = join(mkdtempSync(join(tmpdir(), 'splice-cyc-')), 'tileGround.js'); writeFileSync(p, src)
const { __sc } = await import(pathToFileURL(p).href)
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const L = (x) => Math.round(x * 1000) / 1000                            // onto the 1 mm lattice
for (let t = 0; t < tries; t++) {
  // the PTown shape: two TILE contours (iaFull, iA: one contour and a near copy of it) and two EVIDENCE rings crossing both
  // at shallow angles; pairs of one kind are skipped, as stampTile skips them
  const len = 10 + rnd() * 40, w = 0.004 + rnd() * 0.03, d = rnd() * 0.004, a1 = 0.003 + rnd() * 0.06, a2 = a1 + (rnd() - 0.5) * 0.02
  const quad = (ox, oy, ang, wd) => { const c = Math.cos(ang), s = Math.sin(ang); return [[0, 0], [len, 0], [len, wd], [0, wd]].map(([x, y]) => [L(ox + x * c - y * s), L(oy + x * s + y * c)]) }
  const T1 = quad(0, 0, 0, w), T2 = quad(0, d, 0, w), E1 = quad(rnd() * len * 0.3, -len * 0.2 * Math.sin(a1), a1, w * 1.3), E2 = quad(rnd() * len * 0.3, -len * 0.2 * Math.sin(a2) + (rnd() - 0.5) * 0.003, a2, w * 0.8)
  const rings = [T1, T2, E1, E2], kind = ['tile', 'tile', 'ev', 'ev']
  if (rings.some(r => new Set(r.map(q => q.join(','))).size < 4)) continue
  try { __sc(rings, (i, j) => (kind[i] === 'ev') === (kind[j] === 'ev')) } catch (e) {
    if (!/did not settle/.test(e.message)) continue
    writeFileSync(outP, JSON.stringify({ note: 'four lattice rings (two tile contours, two evidence) whose shallow crossings make stampCrossings (round-then-retest, 8 rounds) refuse; same-kind pairs skipped as stampTile does; found by scratch/splice/find-cycle.mjs (seed 12345)', try: t, kind, rings }))
    console.log(`found at try ${t}: angles ${(a1 * 180 / Math.PI).toFixed(3)}° / ${(a2 * 180 / Math.PI).toFixed(3)}°, length ${len.toFixed(1)} m, tile offset ${(d * 1000).toFixed(1)} mm → ${outP}`); process.exit(0) }
}
console.log(`⛔ no cycling input in ${tries} tries — the old loop settled on every one (nothing claimed)`); process.exit(1)
