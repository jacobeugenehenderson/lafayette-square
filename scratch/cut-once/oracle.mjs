// ⭐ THE DEFINITION ORACLE (Zob, 2026-10-29): every other gate measures the output against ITSELF (books, copies, accounting,
// sharpness); this measures it against the DEFINITION. The same operation (the cut-once open/close of structures.mjs#openCloseAtStep:
// P − the open's taken FEATURES ∪ the close's filled FEATURES, a feature being a piece that survives an erode by NODE_BOUND; open =
// offset(offset(P, −h), +h) ∩ P, close = offset(offset(open, +h), −h) ∪ open; jtMiter, MiterLimit 2 (square caps past it)) computed
// by an INDEPENDENT integer engine (clipper-lib, a JUDGE here, never a producer; nothing in the kit imports this) on a lattice
// 1000× FINER than ours, then compared region-to-region with the candidate's k. Every difference piece must be the candidate's own
// lattice rounding: it erodes to nothing by NODE_BOUND (in OUR units, ×1000 here). A piece that survives is a disagreement with
// the definition (in the candidate, or in the reference), listed with its place, area and widest interior distance.
// node scratch/cut-once/oracle.mjs [decks breakwater huron | planted]
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { NODE_BOUND } from '../../src/lib/latticeNode.js'
const { IntPoint, Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, PolyTree, Paths, JoinType, EndType } = clipperLib
const G = await import('./gate.mjs'), C3 = await import('./cand3.mjs'), { ROWS, STEP_M } = await import('./planted.mjs')
const F = 1000                                                                        // the reference lattice: 1000× finer
const up = (pp) => pp.map(p => p.map(q => new IntPoint(q.X * F, q.Y * F)))
const off = (pp, dlt) => { const co = new ClipperOffset(2), o = new Paths(); co.AddPaths(pp, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, dlt); return o }
const op = (type, a, b) => { const c = new Clipper(), o = new Paths(); c.AddPaths(a, PolyType.ptSubject, true); if (b) c.AddPaths(b, PolyType.ptClip, true); c.Execute(type, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const pieces = (pp) => { const c = new Clipper(), t = new PolyTree(); c.AddPaths(pp, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, t, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const o = []; const w = (n) => { for (const ch of n.Childs()) { o.push([ch.Contour(), ...ch.Childs().map(x => x.Contour())]); for (const hh of ch.Childs()) w(hh) } }; w(t); return o }
const bound = NODE_BOUND * F                                                           // OUR rounding bound, on the fine lattice
const survives = (pp) => off(pp, -bound).some(q => Clipper.Area(q) > 0)               // a piece wider than the rounding
// the definition, on the fine lattice
function reference(P, stepM) { const h = (stepM / 2) * 1000 * F
  const open = op(ClipType.ctIntersection, off(off(P, -h), h), P), closedK = op(ClipType.ctUnion, [...open, ...off(off(open, h), -h)])
  const tf = pieces(op(ClipType.ctDifference, P, open)).filter(survives), ff = pieces(op(ClipType.ctDifference, closedK, open)).filter(survives)
  let k = tf.length ? op(ClipType.ctDifference, P, tf.flat()) : P; if (ff.length) k = op(ClipType.ctUnion, [...k, ...ff.flat()]); return k }
const area = (pp) => pp.reduce((t, q) => t + Clipper.Area(q), 0)
export function judge(src, stepM, name) {
  const t0 = Date.now(), r = C3.openCloseProvenance(src, stepM, name), P = up(r.P), K = up(r.rings), R = reference(P, stepM), ms = Date.now() - t0
  const diffs = [...pieces(op(ClipType.ctDifference, K, R)).map(pp => ({ pp, side: 'candidate only' })), ...pieces(op(ClipType.ctDifference, R, K)).map(pp => ({ pp, side: 'definition only' }))]
  const wide = diffs.filter(x => survives(x.pp)).map(x => { const o = x.pp[0]; let cx = 0, cy = 0; for (const q of o) { cx += q.X; cy += q.Y }
    return { side: x.side, at: [+(cx / o.length / F / 1000).toFixed(3), +(cy / o.length / F / 1000).toFixed(3)], m2: +(area(x.pp) / F / F / 1e6).toFixed(5), vertices: o.length } })
  const nearTo = (process.env.ORACLE_NEAR || '').split(';').filter(Boolean).map(t => t.split(',').map(Number)).map(([x, y]) => ({ at: [x, y], nearest: wide.map(w => ({ ...w, distM: +Math.hypot(w.at[0] - x, w.at[1] - y).toFixed(3) })).sort((a, b) => a.distM - b.distM).slice(0, 2) }))
  const bySide = wide.reduce((t, w) => ((t[w.side] = (t[w.side] || 0) + 1), t), {})
  return { name, ms, diffPieces: diffs.length, wider: wide.length, bySide, nearTo, widerList: wide.sort((a, b) => b.m2 - a.m2).slice(0, 10), kM2: +(area(K) / F / F / 1e6).toFixed(4), refM2: +(area(R) / F / F / 1e6).toFixed(4) }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
  const FIX = { decks: () => { const d = fx('ptown-deck-inputs'); return [G.ip(d.inputs.flat()), d.fineM] }, breakwater: () => { const d = fx('ptown-embankments'); return [G.ip(d.paths), d.fineM] }, huron: () => { const d = fx('huron-traced'); return [G.ip(d.traced), d.fineM] } }
  const which = process.argv.slice(2)
  for (const k of which.includes('planted') ? Object.keys(ROWS) : which.length ? which : Object.keys(FIX)) {
    try { const [src, step] = ROWS[k] ? [G.ip(ROWS[k].rings), STEP_M] : FIX[k](); console.log(JSON.stringify(judge(src, step, k))) } catch (e) { console.log(k, 'REFUSED:', String(e.message).slice(0, 160)) } }
}
