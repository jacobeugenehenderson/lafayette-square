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
  // the classification (Zob, 2026-10-29): each wide disagreement's max width, the candidate's emission rules within 2h of it
  // (cand3.mjs#ORIGIN), and whether it touches an output edge that carries no line
  const h2 = stepM * 1000, emitted = [...C3.ORIGIN.entries()].map(([k, v]) => { const [x, y] = k.split(',').map(Number); return { x, y, v } })
  const EG = new Map(), eg = (x, y) => Math.floor(x / h2) + ',' + Math.floor(y / h2); for (const e of emitted) { const k2 = eg(e.x, e.y); (EG.get(k2) || EG.set(k2, []).get(k2)).push(e) }
  const isLine = (t) => Array.isArray(t) && t.length === 2 && t.every(pt => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite))
  const lineless = []; r.rings.forEach((q, k2) => q.forEach((v, i) => { const t = r.tags?.[k2]?.[i]; if (!(isLine(t) || (Array.isArray(t) && t.some(isLine)))) lineless.push([v, q[(i + 1) % q.length]]) }))
  const classify = (pp) => { const o = pp[0].map(q => [q.X / F, q.Y / F]); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of o) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    const rules = new Set(); for (let gx = Math.floor((x0 - h2) / h2); gx <= Math.floor((x1 + h2) / h2); gx++) for (let gy = Math.floor((y0 - h2) / h2); gy <= Math.floor((y1 + h2) / h2); gy++) for (const e of EG.get(gx + ',' + gy) || []) if (e.x >= x0 - h2 && e.x <= x1 + h2 && e.y >= y0 - h2 && e.y <= y1 + h2) for (const kd of String(e.v).split('|')) rules.add(kd)
    const touchesLineless = lineless.some(([a2, b2]) => Math.min(a2.X, b2.X) <= x1 + 2 && Math.max(a2.X, b2.X) >= x0 - 2 && Math.min(a2.Y, b2.Y) <= y1 + 2 && Math.max(a2.Y, b2.Y) >= y0 - 2)
    // max width: the widest sampled interior point's distance to the piece's own boundary (our units)
    const inR = (x, y, r2) => { let c = false; for (let i = 0, j = r2.length - 1; i < r2.length; j = i++) { const a2 = r2[i], b2 = r2[j]; if ((a2[1] > y) !== (b2[1] > y) && x < (b2[0] - a2[0]) * (y - a2[1]) / (b2[1] - a2[1]) + a2[0]) c = !c } return c }
    let wd = 0; const N = 16; for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const x = x0 + (x1 - x0) * i / N, y = y0 + (y1 - y0) * j / N; if (!inR(x, y, o)) continue
      let m = Infinity; for (let z = 0; z < o.length; z++) { const a2 = o[z], b2 = o[(z + 1) % o.length], ex = b2[0] - a2[0], ey = b2[1] - a2[1], L2 = ex * ex + ey * ey, t = L2 ? Math.max(0, Math.min(1, ((x - a2[0]) * ex + (y - a2[1]) * ey) / L2)) : 0; m = Math.min(m, Math.hypot(x - a2[0] - t * ex, y - a2[1] - t * ey)) } wd = Math.max(wd, m) }
    return { rules: [...rules].sort(), touchesLineless, widthU: +(2 * wd).toFixed(1) } }
  const wide = diffs.filter(x => survives(x.pp)).map(x => { const o = x.pp[0]; let cx = 0, cy = 0; for (const q of o) { cx += q.X; cy += q.Y }
    return { side: x.side, at: [+(cx / o.length / F / 1000).toFixed(3), +(cy / o.length / F / 1000).toFixed(3)], m2: +(area(x.pp) / F / F / 1e6).toFixed(5), vertices: o.length, ...classify(x.pp) } })
  // the dump for the largest CUT-JOIN cases (Zob, 2026-10-29): each one's piece, and every cut join (cand3.mjs#DETAIL: its stage, its
  // tags, X and its parameters along each line) within 2h. A DETAIL entry is written only where the cut was EMITTED AS X: neither
  // the gap rule nor the trimmed rule fired, and capAt did not square it
  const details = [...C3.DETAIL.entries()].map(([k2, v]) => { const [x, y] = k2.split(',').map(Number); return { x, y, ...v } })
  const cutDump = wide.filter(w => w.rules.includes('cut-join') && (!process.env.ORACLE_SIDE || w.side === process.env.ORACLE_SIDE)).sort((a, b) => b.m2 - a.m2).slice(0, 3).map(w => { const W = w.at.map(v => v * 1000)
    return { ...w, cuts: details.filter(dd => Math.hypot(dd.x - W[0], dd.y - W[1]) < h2 * 2).map(dd => ({ stage: dd.who, X: [dd.x, dd.y], t: dd.t, u: dd.u, ta: dd.ta, tb: dd.tb, A: dd.A, B: dd.B, distU: +Math.hypot(dd.x - W[0], dd.y - W[1]).toFixed(0) })).slice(0, 4) } })
  const byRule = {}; for (const w of wide) { const key = `${w.side} · ${w.rules.length ? w.rules.filter(x => !['own', 'run-vertex'].includes(x)).join('+') || 'own/run only' : 'no emission within 2h'}${w.touchesLineless ? ' · lineless' : ''}`; byRule[key] = (byRule[key] || 0) + 1 }
  const nearTo = (process.env.ORACLE_NEAR || '').split(';').filter(Boolean).map(t => t.split(',').map(Number)).map(([x, y]) => ({ at: [x, y], nearest: wide.map(w => ({ ...w, distM: +Math.hypot(w.at[0] - x, w.at[1] - y).toFixed(3) })).sort((a, b) => a.distM - b.distM).slice(0, 2) }))
  const bySide = wide.reduce((t, w) => ((t[w.side] = (t[w.side] || 0) + 1), t), {})
  return { name, ms, diffPieces: diffs.length, wider: wide.length, bySide, byRule, cutDump, linelessEdges: lineless.length, nearTo, widerList: wide.sort((a, b) => b.m2 - a.m2).slice(0, 10), kM2: +(area(K) / F / F / 1e6).toFixed(4), refM2: +(area(R) / F / F / 1e6).toFixed(4) }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
  const FIX = { decks: () => { const d = fx('ptown-deck-inputs'); return [G.ip(d.inputs.flat()), d.fineM] }, breakwater: () => { const d = fx('ptown-embankments'); return [G.ip(d.paths), d.fineM] }, huron: () => { const d = fx('huron-traced'); return [G.ip(d.traced), d.fineM] } }
  const which = process.argv.slice(2)
  for (const k of which.includes('planted') ? Object.keys(ROWS) : which.length ? which : Object.keys(FIX)) {
    try { const [src, step] = ROWS[k] ? [G.ip(ROWS[k].rings), STEP_M] : FIX[k](); console.log(JSON.stringify(judge(src, step, k))) } catch (e) { console.log(k, 'REFUSED:', String(e.message).slice(0, 160)) } }
}
