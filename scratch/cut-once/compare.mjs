// §3.1: each candidate on the three fixtures, one row each, by the same measures.
// node scratch/cut-once/compare.mjs --cand=integer|provenance [--fixture=decks|breakwater|huron]
//   own/copy/new (own-edge.mjs) · outers/holes · crossings left after the one rounding (latticeNode.js#crossOf, every pair of
//   output edges that are not neighbours) · edges ≤ 2 mm · ms
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { openCloseAtStep } from '../../cartograph/structures.mjs'
import { crossOf, nodeCrossings, NODE_BOUND } from '../../src/lib/latticeNode.js'
import { facesOf } from '../../src/lib/latticeFaces.js'
import { ownEdge } from './own-edge.mjs'
const { IntPoint, Clipper, ClipType, PolyType, PolyFillType, PolyTree, Paths } = clipperLib
const SCALE = 1000
const arg = (k) => process.argv.slice(2).map(a => a.match(new RegExp(`^--${k}=(.+)$`))).find(Boolean)?.[1]
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const ip = (pp) => pp.map(p => p.map(q => (Array.isArray(q) ? new IntPoint(q[0], q[1]) : new IntPoint(q.X, q.Y))))
const tree = (pp) => { const c = new Clipper(), t = new PolyTree(); c.AddPaths(pp, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, t, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return t }
const flat = (t) => { const o = new Paths(); const w = (n) => { for (const ch of n.Childs()) { o.push(ch.Contour()); for (const hh of ch.Childs()) { o.push(hh.Contour()); w(hh) } } }; w(t); return o }
const parts = (t) => { const o = []; const w = (n) => { for (const ch of n.Childs()) { o.push({ outer: ch.Contour(), holes: ch.Childs().map(c => c.Contour()) }); for (const hh of ch.Childs()) w(hh) } }; w(t); return o }

function crossings(paths) {
  const E = []; paths.forEach((p, ri) => p.forEach((a, i) => { const b = p[(i + 1) % p.length]; E.push({ ri, i, n: p.length, a: [a.X, a.Y], b: [b.X, b.Y] }) }))
  const C = 4000, cells = new Map(); E.forEach((e, k) => { for (let cx = Math.floor(Math.min(e.a[0], e.b[0]) / C); cx <= Math.floor(Math.max(e.a[0], e.b[0]) / C); cx++) for (let cy = Math.floor(Math.min(e.a[1], e.b[1]) / C); cy <= Math.floor(Math.max(e.a[1], e.b[1]) / C); cy++) { const c = cx * 1e6 + cy; (cells.get(c) || cells.set(c, []).get(c)).push(k) } })
  const seen = new Set(), at = []
  for (const l of cells.values()) for (let u = 0; u < l.length; u++) for (let w = u + 1; w < l.length; w++) { const s = E[l[u]], t = E[l[w]]
    if (s.ri === t.ri && (Math.abs(s.i - t.i) === 1 || Math.abs(s.i - t.i) === s.n - 1)) continue
    const key = l[u] < l[w] ? l[u] + ':' + l[w] : l[w] + ':' + l[u]; if (seen.has(key)) continue; seen.add(key)
    const X = crossOf(s, t); if (X) at.push(X.map(v => v / SCALE)) }
  return at
}
const short = (paths) => paths.reduce((t, p) => t + p.filter((a, i) => { const b = p[(i + 1) % p.length]; return Math.hypot(b.X - a.X, b.Y - a.Y) <= 2 }).length, 0)
const topo = (paths) => { let o = 0, h = 0; for (const p of paths) (Clipper.Area(p) > 0 ? o++ : h++); return { outers: o, holes: h } }

// ⭐ ZOB'S GATE (2026-10-28), the definition in place of an area band: every piece of the symmetric difference between the
// output and P, each side computed exactly on the jointly noded arrangement (cand3.mjs#arrange → latticeFaces.js#facesOf), is
// ACCOUNTED FOR: P narrower than 2h there (removed: no disk of radius h of P fits; added: none of the complement fits), i.e. the
// largest sampled distance from the piece to P's boundary is under h; or a squared corner (clipper's miter limit, parity)
// stands within h of it. ⛔ Anything else is a defect, listed.
function changeGate(P, out, h, squares, who, outTagsIn = null, Ptags = null) {
  const S = []; for (const r of P) for (let i = 0; i < r.length; i++) S.push([r[i], r[(i + 1) % r.length]])
  const G = 4000, cells = new Map(); S.forEach(([a, b], k) => { for (let cx = Math.floor((Math.min(a.X, b.X) - h) / G); cx <= Math.floor((Math.max(a.X, b.X) + h) / G); cx++) for (let cy = Math.floor((Math.min(a.Y, b.Y) - h) / G); cy <= Math.floor((Math.max(a.Y, b.Y) + h) / G); cy++) { const c = cx + ',' + cy; (cells.get(c) || cells.set(c, []).get(c)).push(k) } })
  const dB = (x, y) => { let m = Infinity; for (const k of cells.get(Math.floor(x / G) + ',' + Math.floor(y / G)) || []) { const [a, b] = S[k], dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((x - a.X) * dx + (y - a.Y) * dy) / L2)) : 0; m = Math.min(m, Math.hypot(x - a.X - t * dx, y - a.Y - t * dy)) } return m }
  const inR = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a.Y > y) !== (b.Y > y) && x < (b.X - a.X) * (y - a.Y) / (b.Y - a.Y) + a.X) c = !c } return c }
  const table = (pp, side) => pp.map(([o, ...hs]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of o) { x0 = Math.min(x0, q.X); y0 = Math.min(y0, q.Y); x1 = Math.max(x1, q.X); y1 = Math.max(y1, q.Y) }
    let worst = 0; const N = 24
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const x = x0 + (x1 - x0) * i / N, y = y0 + (y1 - y0) * j / N; if (!inR(x, y, o) || hs.some(hh => inR(x, y, hh))) continue; worst = Math.max(worst, dB(x, y)) }
    // ⛔ a squared corner accounts for a piece only if EVERY vertex of the piece lies within h of that corner (it was a bounding-box
    // test, which accounted the decks' whole 1,988 m² hole filled in error)
    const sq = squares.some(([X, Y]) => o.every(q => Math.hypot(q.X - X, q.Y - Y) <= h * Math.SQRT2))
    const mm2 = [o, ...hs].reduce((t, r) => t + C3.area(r), 0)
    return { side, at: [o[0].X / SCALE, o[0].Y / SCALE], mm2: +mm2.toFixed(1), maxDistU: +worst.toFixed(1), h: +h.toFixed(1), narrow: worst < h, squared: sq, accounted: worst < h || sq } })
  // ⭐ ON ONE ARRANGEMENT (Zob, 2026-10-28): out and P noded TOGETHER once; every region below is a face set of that one noding, so
  // the books balance exactly (BigInt): added − removed = area(out) − area(P), both as noded. P's own move under the noding is
  // reported as one number, and every vertex the noding put on P's rings must lie within NODE_BOUND of the raw edge it sits on
  const rings = [...out.map((r, k) => ({ r, set: 0, t: outTagsIn?.[k] })), ...P.map((r, k) => ({ r, set: 1, t: r.map(q => q.tag ?? null) }))].filter(x => new Set(x.r.map(q => q.X + ',' + q.Y)).size >= 3)
  const NR = nodeCrossings(rings.map((x, i) => ({ p: x.r.map(q => [q.X / SCALE, q.Y / SCALE]), tag: `${who}#${i}` })), { pairs: () => true, self: true, who: `${who} gate` })
  const E = []; let moved = 0, worstMove = 0
  NR.forEach((o, i) => o.forEach((v, k) => { const w = o[(k + 1) % o.length]; E.push({ a: v.k, b: w.k, set: rings[i].set, tag: rings[i].t?.[v.edge] ?? null })
    if (v.src == null && rings[i].set === 1) { const R = rings[i].r, a2 = R[v.edge], b2 = R[(v.edge + 1) % R.length], dx = b2.X - a2.X, dy = b2.Y - a2.Y
      const d = Math.abs((v.k[0] - a2.X) * dy - (v.k[1] - a2.Y) * dx) / Math.hypot(dx, dy); moved++; worstMove = Math.max(worstMove, d) } }))
  const faceF = (keep, prefer = null) => facesOf(E, keep, { sets: 2, who: `${who} gate`, prefer, allTags: true }), face = (keep) => faceF(keep).rings
  const big = (rs) => rs.reduce((t, r) => { let a = 0n; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += BigInt(p.X) * BigInt(q.Y) - BigInt(q.X) * BigInt(p.Y) } return t + a }, 0n)
  const OUTN = faceF(w => w[0] > 0, 0), PNF = faceF(w => w[1] > 0, 1), outN = OUTN.rings, PN = PNF.rings, addR = face(w => w[0] > 0 && !(w[1] > 0)), remR = face(w => w[1] > 0 && !(w[0] > 0))
  const books = { balance: big(addR) - big(remR) === big(outN) - big(PN), addedMinusRemoved2: String(big(addR) - big(remR)), outMinusP2: String(big(outN) - big(PN)),
    PnodedMinusRawM2: +((Number(big(PN)) / 2 - P.reduce((t, r) => t + C3.area(r), 0)) / SCALE / SCALE).toFixed(6), Pmoves: moved, worstMoveU: +worstMove.toFixed(4), movesWithinBound: worstMove <= NODE_BOUND }
  const added = C3.pieces(addR), removed = C3.pieces(remR)
  const rowsAccounted = (x) => { const t = table([x.pp], x.side)[0]; return t.accounted }
  const NEARWALL_UNCONDITIONAL = !!process.env.CUTONCE_MUTANT_NEARWALL
  // ⭐ THE BAR (Zob, 2026-10-29): copy = 0 EXACTLY against P AS NODED, the same arrangement as the books: there a noding move
  // is one segment on both sides, never a copy
  // ⭐ THE THREE-WAY YARDSTICK (Zob, 2026-10-29, ruling (i)): a near-parallel output edge off s is (b) NEAR-WALL when it carries a
  // DIFFERENT line and the region between it and s is (part of) ONE accounted change piece; else (c) COPY. The bar is (c) = 0
  const pick = (t) => { const ls = (Array.isArray(t) ? t : [t]).filter(x => Array.isArray(x) && x.length === 2 && x.every(pt => Array.isArray(pt) && pt.every(Number.isFinite))); return ls }
  const oe = ownEdge(PN, outN, { srcTags: PNF.tags.map(r => r.map(t => pick(t)[0] ?? null)), outTags: OUTN.tags })
  const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a.Y > y) !== (b.Y > y) && x < (b.X - a.X) * (y - a.Y) / (b.Y - a.Y) + a.X) c = !c } return c }
  const inPiece = (x, y, pp) => inRing(x, y, pp[0]) && !pp.slice(1).some(hh => inRing(x, y, hh))
  const nearWall = [], copies = []
  for (const c of oe.copiesAll) { const Ls = pick(c.line), sl = c.sLine, same = sl && Ls.some(L => JSON.stringify(L) === JSON.stringify(sl))
    if (!Ls.length || same || !c.s) { copies.push({ ...c, why: !Ls.length ? 'no line' : same ? "s's own line, off it" : 'no s' }); continue }
    const [s0, s1] = c.s, ex = s1[0] - s0[0], ey = s1[1] - s0[1], L2 = ex * ex + ey * ey
    const sep = (q) => { const t = Math.max(0, Math.min(1, ((q[0] - s0[0]) * ex + (q[1] - s0[1]) * ey) / L2)); return { d: Math.hypot(q[0] - s0[0] - t * ex, q[1] - s0[1] - t * ey), foot: [s0[0] + t * ex, s0[1] + t * ey] } }
    const samples = [0, 0.25, 0.5, 0.75, 1].map(f => { const q = [c.A[0] + (c.B[0] - c.A[0]) * f, c.B ? c.A[1] + (c.B[1] - c.A[1]) * f : 0]; return { q, ...sep(q) } })
    const mid = samples[2], mx = (mid.q[0] + mid.foot[0]) / 2, my = (mid.q[1] + mid.foot[1]) / 2
    const piece = [...added.map((pp, i) => ({ pp, side: 'added', i })), ...removed.map((pp, i) => ({ pp, side: 'removed', i }))].find(x => inPiece(mx, my, x.pp))
    const accounted = piece && rowsAccounted(piece)
    if (accounted && !NEARWALL_UNCONDITIONAL) nearWall.push({ edge: [c.a, c.b], line: Ls[0], s: c.s, sepAlongU: samples.map(z => +z.d.toFixed(3)), piece: `${piece.side} #${piece.i}` })
    else if (NEARWALL_UNCONDITIONAL) nearWall.push({ edge: [c.a, c.b], line: Ls[0], s: c.s, sepAlongU: samples.map(z => +z.d.toFixed(3)), piece: 'UNCONDITIONAL (mutant)' })
    else copies.push({ ...c, why: piece ? 'its piece is unaccounted' : 'no change piece between it and s' }) }
  const vsNoded = { own: oe.own, copy: copies.length, nearWall: nearWall.length, nearWallTable: nearWall.slice(0, 8), new: oe.new, copies: copies.slice(0, 12).map(({ A, B, ...x }) => x) }

  const rows = [...table(added, 'added'), ...table(removed, 'removed')], bad = rows.filter(r => !r.accounted)
  return { books, vsNoded, added: added.length, removed: removed.length, addedMm2: +rows.filter(r => r.side === 'added').reduce((t, r) => t + r.mm2, 0).toFixed(1), removedMm2: +rows.filter(r => r.side === 'removed').reduce((t, r) => t + r.mm2, 0).toFixed(1),
    byNarrow: rows.filter(r => r.narrow).length, bySquare: rows.filter(r => !r.narrow && r.squared).length, unaccounted: bad.length, unaccountedRows: bad.slice(0, 10), rows: rows.length <= 12 ? rows : undefined }
}
const cand = arg('cand') || 'integer'
if (!['integer', 'provenance'].includes(cand)) throw new Error(`no candidate ${cand} (the library route stopped, Jacob 2026-10-28: README.md)`)
const C3 = cand === 'provenance' ? await import('./cand3.mjs') : null
const FIX = { decks: () => { const d = fx('ptown-deck-inputs'); return { src: ip(d.inputs.flat()), stepM: d.fineM } },
  breakwater: () => { const d = fx('ptown-embankments'); return { src: ip(d.paths), stepM: d.fineM } },
  huron: () => { const d = fx('huron-traced'); return { src: ip(d.traced), stepM: d.fineM } } }
for (const name of (arg('fixture') ? [arg('fixture')] : Object.keys(FIX))) {
  const { src, stepM } = FIX[name](), t = tree(src), u = flat(t)
  const t0 = Date.now(); let paths
  let stat = null, gate = null
  if (cand === 'integer') paths = openCloseAtStep(src, stepM, name).paths
  else { const r = C3.openCloseProvenance(src, stepM, name); paths = r.paths; const { squares, ...st } = r.stat; stat = { ...st, squares: (squares || []).length, opened: r.opened.length, closed: r.closed.length, slivers: r.slivers }
    gate = changeGate(r.P, r.rings, (stepM / 2) * SCALE, squares || [], name, r.tags) }
  const ms = Date.now() - t0
  // the kit unions the kept paths after (deckFootprints, bake-coast): measured on that union, as the reader sees it
  const out = flat(tree(paths)), e = ownEdge(u, out), X = crossings(out)
  const holeM2 = (pp) => pp.filter(p => Clipper.Area(p) < 0).map(p => +(Clipper.Area(p) / SCALE / SCALE).toFixed(4))
// each copy's two ends by the emission that made them (cand3.mjs#ORIGIN; 'none' = a vertex the noding or an arrangement made)
const copyOrigins = C3 ? (() => { const t = {}; for (const c of e.copiesAll || []) { const k = [c.a, c.b].map(p => C3.ORIGIN.get(Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)) || 'none').sort().join(' + '); t[k] = (t[k] || 0) + 1 } return t })() : null
console.log(JSON.stringify({ cand, fixture: name, ms, stat, gate, copyOrigins, holesM2: holeM2(out), srcHolesM2: holeM2(u), ...topo(out), src: topo(u), own: e.own, copy: e.copy, new: e.new, copyM: e.copyM, crossings: X.length, crossAt: X.slice(0, 3), le2mm: short(out), copies: e.copies.slice(0, 3), news: e.news }))
}
