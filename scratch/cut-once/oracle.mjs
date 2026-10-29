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
function reference(P, stepM, stages = {}) { const h = (stepM / 2) * 1000 * F
  const erode = off(P, -h), open = op(ClipType.ctIntersection, off(erode, h), P), dilate = off(open, h), closedK = op(ClipType.ctUnion, [...open, ...off(dilate, -h)])
  Object.assign(stages, { erode, open, dilate, closedK })
  const tf = pieces(op(ClipType.ctDifference, P, open)).filter(survives), ff = pieces(op(ClipType.ctDifference, closedK, open)).filter(survives)
  let k = tf.length ? op(ClipType.ctDifference, P, tf.flat()) : P; if (ff.length) k = op(ClipType.ctUnion, [...k, ...ff.flat()]); stages.k = k; return k }
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
    return { rules: [...rules].sort(), touchesLineless } }
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
// ⭐ STAGE-WISE (Zob, 2026-10-29): the candidate against the reference at EACH stage (the open's erode, the open, the close's dilate,
// closedK, the final k), region to region on the fine lattice; every wide disagreement attributed to the FIRST stage where it appears
// (a later stage's piece overlapping an earlier stage's wide piece is carried, not new). ⛔ The 16 × 16 width sampler is removed (it
// read 0 on pieces that survive the erode); a piece is wide iff it survives the erode by NODE_BOUND, nothing else
export function stagewise(src, stepM, name) {
  const r = C3.openCloseProvenance(src, stepM, name), P = up(r.P), RS = {}; reference(P, stepM, RS)
  const CS = { erode: up(C3.STAGES.erode), open: up(C3.STAGES.open), dilate: up(C3.STAGES.dilate), closedK: up(C3.STAGES.closedK), k: up(r.rings) }
  const order = ['erode', 'open', 'dilate', 'closedK', 'k'], born = [], seen = []
  const box = (pp) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of pp[0]) { x0 = Math.min(x0, q.X); y0 = Math.min(y0, q.Y); x1 = Math.max(x1, q.X); y1 = Math.max(y1, q.Y) } return [x0, y0, x1, y1] }
  const meets = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
  const table = {}
  for (const st of order) { const K = CS[st], R = RS[st]
    const wide = [...pieces(op(ClipType.ctDifference, K, R)).map(pp => ({ pp, side: 'candidate only' })), ...pieces(op(ClipType.ctDifference, R, K)).map(pp => ({ pp, side: 'definition only' }))].filter(x => survives(x.pp))
    let n = 0
    for (const w of wide) { const b = box(w.pp); if (seen.some(sb => meets(sb, b))) continue; n++
      const o = w.pp[0]; let cx = 0, cy = 0; for (const q of o) { cx += q.X; cy += q.Y }
      born.push({ stage: st, side: w.side, m2: +(area(w.pp) / F / F / 1e6).toFixed(5), at: [+(cx / o.length / F / 1000).toFixed(3), +(cy / o.length / F / 1000).toFixed(3)] }) }
    for (const w of wide) seen.push(box(w.pp))
    table[st] = { wide: wide.length, born: n } }
  const byStage = {}; for (const b of born) { const k2 = `${b.stage} · ${b.side}`; byStage[k2] ||= { n: 0, m2: 0 }; byStage[k2].n++; byStage[k2].m2 = +(byStage[k2].m2 + b.m2).toFixed(4) }
  return { name, table, byStage, largest: born.sort((a, b) => b.m2 - a.m2).slice(0, 6) }
}
// ⭐ ISOLATED (Zob, 2026-10-29): each stage judged ALONE. The reference is fed the CANDIDATE's previous-stage region (×1000) and
// performs only that stage's rule, so a disagreement belongs to that rule and to nothing upstream. Two counts per stage and side:
// pieces surviving an erode by NODE_BOUND, and by 2·NODE_BOUND (the tiered bound: a stage whose input carries noding-inserted
// vertices may differ by up to two roundings, the close morphing the open's LINES and the reference its vertices), both reported
export function isolated(src, stepM, name) {
  const r = C3.openCloseProvenance(src, stepM, name), P = up(r.P), h = (stepM / 2) * 1000 * F
  const CS = { erode: up(C3.STAGES.erode), open: up(C3.STAGES.open), dilate: up(C3.STAGES.dilate), closedK: up(C3.STAGES.closedK), k: up(r.rings) }
  const feat = (pp) => pieces(pp).filter(survives)
  const REF = {
    erode: () => off(P, -h),
    open: () => op(ClipType.ctIntersection, off(CS.erode, h), P),
    dilate: () => off(CS.open, h),
    closedK: () => op(ClipType.ctUnion, [...CS.open, ...off(CS.dilate, -h)]),
    k: () => { const tf = feat(op(ClipType.ctDifference, P, CS.open)), ff = feat(op(ClipType.ctDifference, CS.closedK, CS.open))
      let k = tf.length ? op(ClipType.ctDifference, P, tf.flat()) : P; if (ff.length) k = op(ClipType.ctUnion, [...k, ...ff.flat()]); return k } }
  const survivesBy = (pp, b) => off(pp, -b).some(q => Clipper.Area(q) > 0)
  const out = {}, largest = []
  for (const st of Object.keys(REF)) { const K = CS[st], R = REF[st]()
    const diffs = [...pieces(op(ClipType.ctDifference, K, R)).map(pp => ({ pp, side: 'candidate only' })), ...pieces(op(ClipType.ctDifference, R, K)).map(pp => ({ pp, side: 'definition only' }))]
    const row = {}
    for (const x of diffs) { const s1 = survivesBy(x.pp, bound), s2 = s1 && survivesBy(x.pp, 2 * bound); if (!s1) continue
      const key = x.side; row[key] ||= { nb: 0, nbM2: 0, twoNb: 0, twoNbM2: 0 }; const m2 = area(x.pp) / F / F / 1e6
      row[key].nb++; row[key].nbM2 += m2; if (s2) { row[key].twoNb++; row[key].twoNbM2 += m2
        const o = x.pp[0]; let cx = 0, cy = 0; for (const q of o) { cx += q.X; cy += q.Y }; largest.push({ stage: st, side: x.side, m2: +m2.toFixed(5), at: [+(cx / o.length / F / 1000).toFixed(3), +(cy / o.length / F / 1000).toFixed(3)] }) } }
    for (const v of Object.values(row)) { v.nbM2 = +v.nbM2.toFixed(4); v.twoNbM2 = +v.twoNbM2.toFixed(4) }
    out[st] = row }
  return { name, isolated: out, largest: largest.sort((a, b) => b.m2 - a.m2).slice(0, 8) }
}
// the closedK dump and class table (Zob, 2026-10-29): every isolated closedK definition-only piece past 2·NB (material the
// reference's erode-back of OUR dilated region keeps and our close's back-offset C does not), with the emission rules of C's
// points inside the piece's box grown by h (cand3.mjs#ORIGIN: which rule emitted the boundary that cuts inside the reference's)
export function closedKDump(src, stepM, name, at = null) {
  const r = C3.openCloseProvenance(src, stepM, name), P = up(r.P), h = (stepM / 2) * 1000 * F
  const open = up(C3.STAGES.open), dil = up(C3.STAGES.dilate), ours = up(C3.STAGES.closedK)
  const ref = op(ClipType.ctUnion, [...open, ...off(dil, -h)])
  const survivesBy = (pp, b) => off(pp, -b).some(q => Clipper.Area(q) > 0)
  const defOnly = pieces(op(ClipType.ctDifference, ref, ours)).filter(pp => survivesBy(pp, 2 * bound))
  const emitted = [...C3.ORIGIN.entries()].map(([k2, v]) => { const [x, y] = k2.split(',').map(Number); return { x: x * F, y: y * F, v } })
  const rows = defOnly.map(pp => { const o = pp[0]; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0
    for (const q of o) { x0 = Math.min(x0, q.X); y0 = Math.min(y0, q.Y); x1 = Math.max(x1, q.X); y1 = Math.max(y1, q.Y); cx += q.X; cy += q.Y }
    const near = emitted.filter(e => e.x >= x0 - h && e.x <= x1 + h && e.y >= y0 - h && e.y <= y1 + h), kinds = {}
    for (const e of near) for (const k2 of String(e.v).split('|')) kinds[k2] = (kinds[k2] || 0) + 1
    return { at: [+(cx / o.length / F / 1000).toFixed(3), +(cy / o.length / F / 1000).toFixed(3)], m2: +(area(pp) / F / F / 1e6).toFixed(5), vertices: o.length, kinds,
      piece: o.map(q => [+(q.X / F).toFixed(0), +(q.Y / F).toFixed(0)]), emittedNear: near.slice(0, 14).map(e => [+(e.x / F).toFixed(0), +(e.y / F).toFixed(0), e.v]) } }).sort((a, b) => b.m2 - a.m2)
  const byKind = {}; for (const rw of rows) { const key = Object.keys(rw.kinds).filter(k2 => !['own', 'run-vertex'].includes(k2)).sort().join('+') || 'own/run only'; byKind[key] = (byKind[key] || 0) + 1 }
  return { name, n: rows.length, m2: +rows.reduce((t, rw) => t + rw.m2, 0).toFixed(4), byKind, largest: rows.slice(0, 2) }
}
if (import.meta.url === `file://${process.argv[1]}` && process.env.ORACLE_CLOSEDK) {
  const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8')), d = fx('huron-traced')
  console.log(JSON.stringify(closedKDump(G.ip(d.traced), d.fineM, 'huron')))
} else if (import.meta.url === `file://${process.argv[1]}` && process.env.ORACLE_ISOLATED) {
  const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
  const FIX = { decks: () => { const d = fx('ptown-deck-inputs'); return [G.ip(d.inputs.flat()), d.fineM] }, breakwater: () => { const d = fx('ptown-embankments'); return [G.ip(d.paths), d.fineM] }, huron: () => { const d = fx('huron-traced'); return [G.ip(d.traced), d.fineM] } }
  for (const k of process.argv.slice(2)) { const [src, step] = ROWS[k] ? [G.ip(ROWS[k].rings), STEP_M] : FIX[k](); console.log(JSON.stringify(isolated(src, step, k))) }
} else if (import.meta.url === `file://${process.argv[1]}` && process.env.ORACLE_STAGEWISE) {
  const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
  const FIX = { decks: () => { const d = fx('ptown-deck-inputs'); return [G.ip(d.inputs.flat()), d.fineM] }, breakwater: () => { const d = fx('ptown-embankments'); return [G.ip(d.paths), d.fineM] }, huron: () => { const d = fx('huron-traced'); return [G.ip(d.traced), d.fineM] } }
  for (const k of process.argv.slice(2)) { const [src, step] = ROWS[k] ? [G.ip(ROWS[k].rings), STEP_M] : FIX[k](); console.log(JSON.stringify(stagewise(src, step, k))) }
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
  const FIX = { decks: () => { const d = fx('ptown-deck-inputs'); return [G.ip(d.inputs.flat()), d.fineM] }, breakwater: () => { const d = fx('ptown-embankments'); return [G.ip(d.paths), d.fineM] }, huron: () => { const d = fx('huron-traced'); return [G.ip(d.traced), d.fineM] } }
  const which = process.argv.slice(2)
  for (const k of which.includes('planted') ? Object.keys(ROWS) : which.length ? which : Object.keys(FIX)) {
    try { const [src, step] = ROWS[k] ? [G.ip(ROWS[k].rings), STEP_M] : FIX[k](); console.log(JSON.stringify(judge(src, step, k))) } catch (e) { console.log(k, 'REFUSED:', String(e.message).slice(0, 160)) } }
}
