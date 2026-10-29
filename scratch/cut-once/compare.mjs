// §3.1: each candidate on the three fixtures, one row each, by the same measures.
// node scratch/cut-once/compare.mjs --cand=integer|jsts [--fixture=decks|breakwater|huron]
//   own/copy/new (own-edge.mjs) · outers/holes · crossings left after the one rounding (latticeNode.js#crossOf, every pair of
//   output edges that are not neighbours) · edges ≤ 2 mm · ms · fallbacks (JSTS: its silent paths, counted)
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { openCloseAtStep } from '../../cartograph/structures.mjs'
import { crossOf } from '../../src/lib/latticeNode.js'
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

const cand = arg('cand') || 'integer'
let J = null; if (cand === 'jsts') J = await import('./cand-jsts.mjs')
const FIX = { decks: () => { const d = fx('ptown-deck-inputs'); return { src: ip(d.inputs.flat()), stepM: d.fineM } },
  breakwater: () => { const d = fx('ptown-embankments'); return { src: ip(d.paths), stepM: d.fineM } },
  huron: () => { const d = fx('huron-traced'); return { src: ip(d.traced), stepM: d.fineM } } }
for (const name of (arg('fixture') ? [arg('fixture')] : Object.keys(FIX))) {
  const { src, stepM } = FIX[name](), t = tree(src), u = flat(t)
  const t0 = Date.now(); let paths, fallbacks = null
  if (cand === 'integer') paths = openCloseAtStep(src, stepM, name).paths
  else { const ops = J.makeOps(); paths = []; const refused = []
    // a part JSTS cannot compute even through its own fallback is REFUSED, counted and named, and left out of the measure
    for (const p of parts(t)) { try { paths.push(...J.toPaths(J.openCloseJSTS(p.outer, p.holes, stepM, SCALE, ops).geom)) }
      catch (e) { if (!/TopologyException/.test(String(e?.name) + String(e?.constructor?.name))) throw e
        refused.push({ at: [p.outer[0].X / SCALE, p.outer[0].Y / SCALE], vertices: p.outer.length, why: String(e.message || e).slice(0, 60) }) } }
    fallbacks = { ...ops.fallbacks, refused: refused.length, refusedParts: refused.slice(0, 3) } }
  const ms = Date.now() - t0
  // the kit unions the kept paths after (deckFootprints, bake-coast): measured on that union, as the reader sees it
  const out = flat(tree(paths)), e = ownEdge(u, out), X = crossings(out)
  console.log(JSON.stringify({ cand, fixture: name, ms, fallbacks, ...topo(out), src: topo(u), own: e.own, copy: e.copy, new: e.new, copyM: e.copyM, crossings: X.length, crossAt: X.slice(0, 3), le2mm: short(out), copies: e.copies.slice(0, 3) }))
}
