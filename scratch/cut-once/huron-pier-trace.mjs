// Zob's five-part trace of the Huron pier's refusal (2026-10-29). node scratch/cut-once/huron-pier-trace.mjs
//  1 the source ring 0 (P, the inputs' union): every edge, endpoints, length, the input it lies on
//  2 the ERODED ring holding the cut: its full cyclic tag sequence, each F edge, the class of each change
//  3 whether edge 10 or 14 recurs in it, and where
//  4 the definition's erode (clipper, 1000× finer): ring count and areas against ours
//  5 the integer path (base 464dfa5f) on the same input
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Paths, Clipper, ClipperOffset, JoinType, EndType } = clipperLib
const C3 = await import('./cand3.mjs'), G = await import('./gate.mjs')
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/huron-pier-deck-inputs.json', import.meta.url), 'utf8')), step = d.fineM, h = step / 2 * 1000
const names = ['the area 1353092362', 'the strip of line 1353092363', 'the strip of line 1353092364']
const inputs = d.inputs.map(pp => pp.map(p => p.map(([X, Y]) => new IntPoint(X, Y)))), paths = inputs.flat()
let refusal = null; try { C3.openCloseProvenance(paths, step, 'pier') } catch (e) { refusal = String(e.message).slice(0, 160) }
console.log('refusal:', refusal)
// 1
const P = C3.arrange([paths.map(p => p.map(q => ({ X: q.X, Y: q.Y })))], w => w[0] !== 0, 'pier union', false, null, false).rings
const segD = (p, a, b) => { const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.X - a.X) * dx + (p.Y - a.Y) * dy) / L2)) : 0; return Math.hypot(p.X - a.X - t * dx, p.Y - a.Y - t * dy) }
const onInput = (a, b) => inputs.map((pp, k) => pp.some(r => r.some((q, i) => { const w = r[(i + 1) % r.length]; return segD(a, q, w) <= 1 && segD(b, q, w) <= 1 })) ? k : -1).filter(k => k >= 0)
console.log(`\n1. P: ${P.length} ring(s); ring 0, ${P[0].length} edges (area ${(C3.area(P[0]) / 1e6).toFixed(2)} m²):`)
P[0].forEach((a, i) => { const b = P[0][(i + 1) % P[0].length]; console.log(`  e${i} (${a.X},${a.Y})→(${b.X},${b.Y}) ${(Math.hypot(b.X - a.X, b.Y - a.Y) / 1000).toFixed(3)} m · on ${onInput(a, b).map(k => names[k]).join(' + ') || 'no input (a union crossing)'}`) })
// 2, 3
const E = C3.STAGES.erode || [], T = C3.STAGES.erodeTags || []
const tagI = (tg) => (tg == null ? [] : Array.isArray(tg) ? tg : [tg]).filter(x => x && x.ring === 0).map(x => x.i)
const hold = E.findIndex((r, k) => T[k].some(tg => tagI(tg).includes(14)) && T[k].some(tg => tagI(tg).includes(10)))
console.log(`\n2. the erode: ${E.length} ring(s) (areas ${E.map(r => (C3.area(r) / 1e6).toFixed(3)).join(', ')} m²); the ring holding the cut: #${hold}`)
if (hold >= 0) { const r = E[hold], tg = T[hold], n = P[0].length
  const lab = (t) => { if (t == null) return 'null'; const ts = Array.isArray(t) ? t : [t]; return ts.map(x => x.ring != null ? `${x.ring}:${x.i}` : x.born ? 'born' : x.near ? 'near' : '?').join('+') }
  const cls = (a, b) => { const A = tagI(a), B = tagI(b); if (!A.length || !B.length) return 'to/from a non-region tag'; const x = A[A.length - 1], y = B[0]
    if (x === y) return 'same'; if (y === (x + 1) % n) return 'adjacent'; const fw = (y - x + n) % n; return fw < n / 2 ? `forward skip ${fw - 1}` : `BACKWARD by ${n - fw}` }
  r.forEach((q, i) => { const w = r[(i + 1) % r.length], nx = tg[(i + 1) % r.length]
    console.log(`  f${i} (${q.X},${q.Y})→(${w.X},${w.Y}) ${(Math.hypot(w.X - q.X, w.Y - q.Y) / 1000).toFixed(3)} m · tag ${lab(tg[i])}${lab(tg[i]) !== lab(nx) ? `  → ${cls(tg[i], nx)}` : ''}`) })
  for (const e of [10, 14]) console.log(`3. edge ${e} appears at f${tg.map((t, i) => tagI(t).includes(e) ? i : -1).filter(i => i >= 0).join(', f')}`) }
// 4
const F = 1000, up = (pp) => pp.map(r => r.map(q => new IntPoint(q.X * F, q.Y * F))), co = new ClipperOffset(2), o = new Paths()
co.AddPaths(up(P), JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, -h * F)
console.log(`\n4. the definition's erode: ${o.length} ring(s), areas ${o.map(q => (Clipper.Area(q) / F / F / 1e6).toFixed(3)).join(', ')} m²`)
// 5
const B = await import('../../../plumb-base/cartograph/structures.mjs')
try { const r = B.openCloseAtStep(paths, step, 'pier (base, integer)'); console.log(`\n5. the integer path at base: ${r.paths.length} path(s), areas ${r.paths.map(q => (Clipper.Area(q) / 1e6).toFixed(3)).join(', ')} m² · opened ${JSON.stringify(r.opened)} · closed ${JSON.stringify(r.closed)} · belowResolution ${r.belowResolution.length}`) }
catch (e) { console.log('\n5. the integer path at base REFUSES:', String(e.message).slice(0, 200)) }
