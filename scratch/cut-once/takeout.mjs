// The deck TAKE-OUT through the candidate (Zob, 2026-10-29: the gate before the port). structures.mjs#waterWithoutDecks is READ
// from the kit's source at run time and its two morphologies swapped for the candidate's (cand3.mjs#openAt, #closeAt at h = cell/2):
// the local water's open, grow(grow(loc, −h), +h) ∩ loc, and the deck's close, u0 ∪ grow(grow(u0, +h), −h). Nothing else changes,
// so this cannot drift from the kit; at the port the kit calls the candidate and these two lines go.
// Each call is judged against the definition (the same op by clipper on a lattice 1000× finer, as oracle.mjs) at NODE_BOUND and 2·NB.
// node scratch/cut-once/takeout.mjs [--consumer=<town data dir>]   (the consumer: ①'s mint on the result; see below)
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { NODE_BOUND } from '../../src/lib/latticeNode.js'
const CL = clipperLib, { IntPoint, Path, Paths, Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, PolyTree, JoinType, EndType } = CL
const C3 = await import('./cand3.mjs'), G = await import('./gate.mjs'), { ownEdge } = await import('./own-edge.mjs')
const S = await import('../../cartograph/structures.mjs')
const SCALE = 1000
const src = fs.readFileSync(new URL('../../cartograph/structures.mjs', import.meta.url), 'utf8')
const a = src.indexOf('export function waterWithoutDecks('), b = src.indexOf('\n}\n', a) + 2
const OPEN_K = 'open = op(ClipType.ctIntersection, grow(grow(loc, -cellU / 2), cellU / 2), loc)'
const CLOSE_K = 'e = op(ClipType.ctUnion, [...u0, ...grow(grow(u0, cellU / 2), -cellU / 2)])'
let body = src.slice(a, b).replace(/^export /, '')
for (const k of [OPEN_K, CLOSE_K]) if (body.split(k).length !== 2) throw new Error(`⛔ takeout.mjs: the kit's take-out no longer reads "${k}" exactly once — re-read structures.mjs#waterWithoutDecks`)
body = body.replace(OPEN_K, 'open = OPEN(loc, stepM, k)').replace(CLOSE_K, 'e = CLOSE(u0, stepM, k)')
const toPath = (ring) => { const p = new Path(); for (const [x, z] of ring) p.push(new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE))); return p }
const fromPath = (path) => path.map(q => [q.X / SCALE, q.Y / SCALE])
const signedArea = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const make = (OPEN, CLOSE) => new Function('Clipper', 'ClipperOffset', 'Paths', 'PolyType', 'PolyFillType', 'ClipType', 'JoinType', 'EndType', 'PolyTree', 'SCALE', 'toPath', 'fromPath', 'signedArea', 'inRing', 'OPEN', 'CLOSE', `${body}\nreturn waterWithoutDecks`)(
  Clipper, ClipperOffset, Paths, PolyType, PolyFillType, ClipType, JoinType, EndType, PolyTree, SCALE, toPath, fromPath, signedArea, inRing, OPEN, CLOSE)

// the definition, 1000× finer
const F = 1000, bound = NODE_BOUND * F
const up = (pp) => pp.map(p => p.map(q => new IntPoint(q.X * F, q.Y * F)))
const off = (pp, d) => { const co = new ClipperOffset(2), o = new Paths(); co.AddPaths(pp, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, d); return o }
const op = (t, x, y) => { const c = new Clipper(), o = new Paths(); c.AddPaths(x, PolyType.ptSubject, true); if (y) c.AddPaths(y, PolyType.ptClip, true); c.Execute(t, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const pieces = (pp) => { const c = new Clipper(), t = new PolyTree(); c.AddPaths(pp, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, t, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const o = []; const w = (n) => { for (const ch of n.Childs()) { o.push([ch.Contour(), ...ch.Childs().map(x => x.Contour())]); for (const hh of ch.Childs()) w(hh) } }; w(t); return o }
const survivesBy = (pp, d) => off(pp, -d).some(q => Clipper.Area(q) > 0)
export const JUDGED = []
const judge = (kind, k, input, got, stepM) => { const h = stepM / 2 * SCALE * F, I = up(input)
  const R = kind === 'open' ? op(ClipType.ctIntersection, off(off(I, -h), h), I) : op(ClipType.ctUnion, [...I, ...off(off(I, h), -h)]), K = up(got)
  const row = { kind, deck: k }
  for (const [side, d] of [['candidate only', op(ClipType.ctDifference, K, R)], ['definition only', op(ClipType.ctDifference, R, K)]]) for (const pp of pieces(d)) {
    if (!survivesBy(pp, bound)) continue; const v = (row[side] ||= { nb: 0, twoNb: 0, m2: 0 }); v.nb++; v.m2 = +(v.m2 + Clipper.Area(pp[0]) / F / F / 1e6).toFixed(5); if (survivesBy(pp, 2 * bound)) { v.twoNb++; let cx = 0, cy = 0; for (const q of pp[0]) { cx += q.X; cy += q.Y } (v.at ||= []).push([+(cx / pp[0].length / F / SCALE).toFixed(3), +(cy / pp[0].length / F / SCALE).toFixed(3), +(Clipper.Area(pp[0]) / F / F / 1e6).toFixed(4)]) } }
  JUDGED.push(row) }
export const INPUTS = []
const candOpen = (loc, stepM, k) => { INPUTS.push({ kind: 'open', k, input: loc }); const o = C3.openAt(loc, stepM, `take-out open, deck ${k}`); judge('open', k, loc, o, stepM); return o }
const candClose = (u0, stepM, k) => { const o = C3.closeAt(u0, stepM, `take-out close, deck ${k}`); judge('close', k, u0, o, stepM); return o }
export const takeOutCandidate = make(candOpen, candClose)

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const measure = (w, water, decks) => { const out = w.rings.map(toPath), srcP = [...water.map(toPath), ...decks.map(toPath)]
  let le2 = 0, onDeck = 0; const shortList = []
  for (const r of w.rings) for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= 0.002) { le2++; if (r.deck?.[i] != null) onDeck++; if (shortList.length < 4) shortList.push(p) } }
  const back = []; for (const r of w.rings) for (let i = 0; i < r.length; i++) { const p = r[(i - 1 + r.length) % r.length], q = r[i], s = r[(i + 1) % r.length]
    const ux = q[0] - p[0], uy = q[1] - p[1], vx = s[0] - q[0], vy = s[1] - q[1]; if (ux * vx + uy * vy < 0 && Math.abs(ux * vy - uy * vx) < 1e-9) back.push(q) }
  const e = ownEdge(op(ClipType.ctUnion, srcP), out)
  return { rings: w.rings.length, arcs: w.arcs.length, slivers: w.slivers.length, le2mm: le2, onDeck, copy: e.copy, crossings: G.crossings(out).length, backSteps: back.length, backAt: back.slice(0, 4), shortAt: shortList } }

if (import.meta.url === `file://${process.argv[1]}`) {
  const coast = fx('ptown-coast'), sd = fx('ptown-street-decks'), stepM = coast.fineM
  const water = coast.water.flatMap(bd => [bd.outer, ...bd.holes]), arcs = coast.arcs || []
  const t0 = Date.now(), wi = S.waterWithoutDecks(water, arcs, sd.rings, stepM), ti = Date.now() - t0
  const t1 = Date.now(), wc = takeOutCandidate(water, arcs, sd.rings, stepM), tc = Date.now() - t1
  console.log('integer  ', JSON.stringify({ ms: ti, ...measure(wi, water, sd.rings) }))
  console.log('candidate', JSON.stringify({ ms: tc, ...measure(wc, water, sd.rings) }))
  console.log('judged   ', JSON.stringify(JUDGED.filter(r => r['candidate only'] || r['definition only'])), `of ${JUDGED.length} calls`)
  fs.writeFileSync(new URL('./fixtures/ptown-takeout-candidate.json', import.meta.url), JSON.stringify({ note: 'takeout.mjs: waterWithoutDecks through the candidate on ptown-coast + ptown-street-decks', rings: wc.rings.map(r => ({ pts: r, deck: r.deck })), arcs: wc.arcs, decks: wc.decks, slivers: wc.slivers }))
}
