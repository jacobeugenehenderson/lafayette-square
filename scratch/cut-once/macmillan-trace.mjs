// Zob's trace of MacMillan's older take-out crop (checks/fixtures/ptown-macmillan-sliver-2026-10-27.json), as the pier was traced
// (2026-10-29). The open's input is loc, made as structures.mjs#waterWithoutDecks makes it on this tree (clipper, StrictlySimple):
// w0 = water − deck, loc = w0 ∩ grow(deck, 2 cells). node scratch/cut-once/macmillan-trace.mjs
//  1 P (loc's union) round the cut: each edge, its length, and what it lies on (the water, the deck, the 2-cell grow)
//  2 the ERODED ring holding the cut: its full tag sequence (compact), and each F edge round the cut, with change classes
//  3 every tag that recurs in that ring, and where
//  4 the definition's erode (clipper, 1000× finer) against ours: ring count and areas
//  5 the integer open on the same loc (grow(grow(loc, −h), +h) ∩ loc, as at base)
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Path, Paths, Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, JoinType, EndType } = clipperLib
const C3 = await import('./cand3.mjs')
const mx = JSON.parse(fs.readFileSync(new URL('../../checks/fixtures/ptown-macmillan-sliver-2026-10-27.json', import.meta.url), 'utf8')), step = mx.stepM, h = step / 2 * 1000
const signed = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0)
const toPath = (ring) => { const p = new Path(); for (const [x, z] of ring) p.push(new IntPoint(Math.round(x * 1000), Math.round(z * 1000))); return p }
const op = (t, a, b) => { const k = new Clipper(), o = new Paths(); k.StrictlySimple = true; k.AddPaths(a, PolyType.ptSubject, true); if (b) k.AddPaths(b, PolyType.ptClip, true); k.Execute(t, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const grow = (src, d) => { const co = new ClipperOffset(), o = new Paths(); co.AddPaths(src, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, d); return o }
const water = mx.water.map(r => toPath(signed(r) > 0 ? r : [...r].reverse())), D = [toPath(mx.deck)], G2 = grow(D, 2 * step * 1000)
const loc = op(ClipType.ctIntersection, op(ClipType.ctDifference, water, D), G2)
let refusal = null; try { C3.openAt(loc, step, 'macmillan') } catch (e) { refusal = String(e.message).slice(0, 220) }
console.log('refusal:', refusal)
// 1
const P = C3.arrange([loc.map(p => p.map(q => ({ X: q.X, Y: q.Y })))], w => w[0] !== 0, 'macmillan union', false, null, false).rings
const segD = (p, a, b) => { const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.X - a.X) * dx + (p.Y - a.Y) * dy) / L2)) : 0; return Math.hypot(p.X - a.X - t * dx, p.Y - a.Y - t * dy) }
const on = (a, b, pp) => pp.some(r => r.some((q, i) => { const w = r[(i + 1) % r.length]; return segD(a, q, w) <= 1 && segD(b, q, w) <= 1 }))
const src = (a, b) => [on(a, b, water) && 'water', on(a, b, D) && 'deck', on(a, b, G2) && 'the 2-cell grow'].filter(Boolean).join(' + ') || 'none (a crossing)'
const m = /cut joins edge (\d+) to edge (\d+)/.exec(refusal || ''), e1 = m ? +m[1] : 0, e2 = m ? +m[2] : 0, R = P[0], n = R.length
console.log(`\n1. P: ${P.length} ring(s); ring 0, ${n} edges. Round edges ${e1}–${e2}:`)
for (let i = e1 - 6; i <= e2 + 6; i++) { const j = (i + n) % n, a = R[j], b = R[(j + 1) % n]; console.log(`  e${j} (${a.X},${a.Y})→(${b.X},${b.Y}) ${Math.hypot(b.X - a.X, b.Y - a.Y).toFixed(1)} u · ${src(a, b)}`) }
// 2, 3
const E = C3.STAGES.erode || [], T = C3.STAGES.erodeTags || []
const tagI = (tg) => (tg == null ? [] : Array.isArray(tg) ? tg : [tg]).filter(x => x && x.ring === 0).map(x => x.i)
const hold = E.findIndex((r, k) => T[k].some(tg => tagI(tg).includes(e1)) && T[k].some(tg => tagI(tg).includes(e2)))
const lab = (t) => { if (t == null) return 'null'; const ts = Array.isArray(t) ? t : [t]; return ts.map(x => x.ring != null ? `${x.i}` : x.born ? 'born' : x.near ? 'near' : '?').join('+') }
console.log(`\n2. the erode: ${E.length} ring(s), areas ${E.map(r => (C3.area(r) / 1e6).toFixed(3)).join(', ')} m²; the ring holding the cut: #${hold} (${E[hold]?.length} edges)`)
if (hold >= 0) { const r = E[hold], tg = T[hold], seq = []
  tg.forEach(t => { const l = lab(t); if (seq[seq.length - 1] !== l) seq.push(l) }); console.log('  the tag sequence (repeats merged):', seq.join(' '))
  const at = tg.map((t, i) => tagI(t).includes(e1) || tagI(t).includes(e2) ? i : -1).filter(i => i >= 0)
  for (let i = Math.min(...at) - 4; i <= Math.max(...at) + 4; i++) { const j = (i + r.length) % r.length, q = r[j], w = r[(j + 1) % r.length]
    console.log(`  f${j} (${q.X},${q.Y})→(${w.X},${w.Y}) ${Math.hypot(w.X - q.X, w.Y - q.Y).toFixed(1)} u · tag ${lab(tg[j])}`) }
  const where = new Map(); tg.forEach((t, i) => tagI(t).forEach(x => (where.get(x) || where.set(x, []).get(x)).push(i)))
  const rec = [...where].filter(([, is]) => { const runs = is.filter((v, k) => k === 0 || v !== is[k - 1] + 1); return runs.length > 1 })
  console.log(`3. tags recurring in that ring (in two or more separate stretches): ${rec.length ? rec.map(([x, is]) => `${x} at f${is.join(',f')}`).join(' · ') : 'none'}`) }
// 4
const F = 1000, up = (pp) => pp.map(r => r.map(q => new IntPoint(q.X * F, q.Y * F))), co = new ClipperOffset(2), o = new Paths()
co.AddPaths(up(P), JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, -h * F)
console.log(`\n4. the definition's erode: ${o.length} ring(s), areas ${o.map(q => (Clipper.Area(q) / F / F / 1e6).toFixed(3)).join(', ')} m²`)
// 5
const io = op(ClipType.ctIntersection, grow(grow(loc, -h), h), loc)
console.log(`\n5. the integer open of the same loc: ${io.length} ring(s), areas ${io.map(q => (Clipper.Area(q) / 1e6).toFixed(3)).join(', ')} m²`)
