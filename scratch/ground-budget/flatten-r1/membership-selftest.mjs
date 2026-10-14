// membership-selftest.mjs — mutation test of bake-ground.js `itemsByMembership`'s hole rule (Boz, 2026-10-14), run on the
// function as it is in the source (sliced out, not copied):
//   ① a parentless hole with a CLEAR probe must THROW · ② a sub-lattice hole no outer meets must be DROPPED and COUNTED
//   (subLattice[group].orphanHoles) · ③ a sub-lattice hole an outer TOUCHES but does not hold must THROW · ④ HPDM's ring
//   (diag-underived.json) beside its far outer must be dropped · ⑤ the toy stack still paints 300 / 610 / 8790 m² ·
//   ⑥ HPDM's twisted sliver (diag-recreation.json) must find a point inside, on some edge if not the last ·
//   ⑦ HPDM's highway ring (hw-dump.json) must hold its hole, whose edge runs within PROBE_IN of its own (a probe clear of
//   the ring's own edges but not of its hole's stood in the hole).
//   node scratch/ground-budget/flatten-r1/membership-selftest.mjs [--src=<a mutated bake-ground.js>]   (exit 1 on any miss)
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { CLIP_SCALE, LATTICE_M } from '../../../src/lib/lattice.js'
const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const clipperLib = (await import('clipper-lib')).default
const src = readFileSync(process.argv.find(a => a.startsWith('--src='))?.slice(6) ?? here('../../../cartograph/bake-ground.js'), 'utf8')
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error(`selftest: anchor gone: ${i < 0 ? a : b}`); return src.slice(i, j) }
const code = cut('const { Clipper: _Clipper', '\n/**\n * The shore median') + cut('function layerRegion', '// Normalise a group')
  + '\nreturn { itemsByMembership, flattenPaintStack }'
const { itemsByMembership, flattenPaintStack } = new Function('clipperLib', 'CLIP_SCALE', 'LATTICE_M', code)(clipperLib, CLIP_SCALE, LATTICE_M)
const P = (pts) => pts.map(([X, Y]) => ({ X, Y }))
const sq = (x, y, w, h, cw) => { const r = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; return P(cw ? r.reverse() : r) }
const wind = (q, x, y) => { let w = 0; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const a = q[j], b = q[i], c = (b.X - a.X) * (y - a.Y) - (x - a.X) * (b.Y - a.Y)
  if (a.Y <= y) { if (b.Y > y && c > 0) w++ } else if (b.Y <= y && c < 0) w-- } return w }
let miss = 0
const expect = (name, f, check) => { let r, err
  try { r = f() } catch (e) { err = e }
  const ok = check(r, err); if (!ok) miss++
  console.log(`${ok ? '  ok  ' : '⛔ MISS'} ${name}${err ? ` — threw: ${err.message}` : ''}`) }
const outer = sq(0, 0, 10000, 10000)                     // 10 m square, painted inside
const painted = (x, y) => wind(outer, x, y) !== 0
const sliverFar = P([[30602, 5790], [30597, 5811], [30598, 5807]])            // HPDM's shape, 20 m off
const sliverTouch = P([[10000, 5000], [10021, 5005], [10020, 5004]])          // a vertex ON the outer's edge, body outside
// ①
expect('① a parentless hole with a clear probe throws', () => itemsByMembership([outer, sq(20000, 0, 5000, 5000, true)], painted, 'mut:clear', {}),
  (r, e) => /clear probe\) that no painted ring holds/.test(e?.message))
// ②
{ const sl = {}
  expect('② a sub-lattice orphan is dropped and counted', () => itemsByMembership([outer, sliverFar], painted, 'mut:orphan', sl),
    (r, e) => !e && r.length === 1 && r[0].holes.length === 0 && sl['mut:orphan']?.orphanHoles?.length === 1 && sl['mut:orphan'].orphanHoles[0].m2 > 0)
  console.log('       stamp:', JSON.stringify(sl['mut:orphan'])) }
// ③
expect('③ a sub-lattice hole an outer touches throws', () => itemsByMembership([outer, sliverTouch], painted, 'mut:touch', {}),
  (r, e) => /below the lattice .* meets it/.test(e?.message))
// ④
{ const d = JSON.parse(readFileSync(here('./diag-underived.json'), 'utf8')), sl = {}
  const rings = d.near.filter(r => r.role === 'outer' && r.q.length === r.n).map(r => r.q)
  const inAny = (x, y) => rings.some(q => wind(q, x, y) !== 0)
  expect(`④ HPDM's ring beside its ${rings.length} near outer(s) is dropped`, () => itemsByMembership([...rings, d.hole.q], inAny, 'mat:treelawn:underived', sl),
    (r, e) => !e && sl['mat:treelawn:underived']?.orphanHoles?.length === 1) }
// ⑤
{ const sqm = (x, y, w, h, cw) => { const r = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; return cw ? r.reverse() : r }
  const area = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; s += p[0] * q[1] - q[0] * p[1] } return Math.abs(s / 2) }
  const out = flattenPaintStack([
    { groupKey: 'face:x', items: [{ outer: sqm(0, 0, 100, 100), holes: [sqm(40, 40, 20, 20)] }, sqm(45, 45, 10, 10, true)] },
    { groupKey: 'mat:wood', items: [sqm(10, 10, 20, 20), sqm(20, 20, 20, 20, true)] },
    { groupKey: 'mat:asphalt', items: [sqm(0, 25, 100, 3)] }])
  const m2 = (k) => out.get(k).reduce((t, it) => t + area(it.outer) - it.holes.reduce((u, h) => u + area(h), 0), 0)
  expect('⑤ the toy stack paints asphalt 300 · wood 610 · face 8790 m²', () => [m2('mat:asphalt'), m2('mat:wood'), m2('face:x')].map(v => +v.toFixed(3)),
    (r) => r && r.join() === '300,610,8790') }
// ⑥
{ const twisted = P([[636275, 1104200], [652014, 1106116], [656605, 1106675], [656603, 1106676], [636259, 1104198]]), sl = {}
  expect('⑥ HPDM\'s twisted sliver (treelawn:recreation) finds a point inside and stays an outer', () => itemsByMembership([twisted], () => false, 'mat:treelawn:recreation', sl),
    (r, e) => !e && r.length === 1 && sl['mat:treelawn:recreation']?.rings === 1) }
// ⑦
{ const d = JSON.parse(readFileSync(here('./hw-dump.json'), 'utf8')), sl = {}
  const ring = (i) => P(d.out.find(o => o.i === i).r), mine = P(d.mine.find(o => o.i === 6).r), acc = [1418, 1416].map(i => P(d.acc.find(o => o.i === i).r))
  const painted = (x, y) => wind(mine, x, y) !== 0 && acc.every(a => wind(a, x, y) === 0)
  expect('⑦ HPDM\'s highway ring (#9) holds its 54.7 m² hole (#10), whose edge crowds its own within PROBE_IN', () => itemsByMembership([ring(9), ring(10)], painted, 'mat:highway', sl),
    (r, e) => !e && r.length === 1 && r[0].holes.length === 1) }
console.log(miss ? `⛔ ${miss} miss(es)` : 'all seven held'); process.exit(miss ? 1 : 0)
