// §3.1: each candidate on the three fixtures, one row each, by the same measures.
// node scratch/cut-once/compare.mjs --cand=integer|provenance [--fixture=decks|breakwater|huron]
//   own/copy/new (own-edge.mjs) · outers/holes · crossings left after the one rounding (latticeNode.js#crossOf, every pair of
//   output edges that are not neighbours) · edges ≤ 2 mm · ms
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { openCloseAtStep } from '../../cartograph/structures.mjs'
import { ownEdge } from './own-edge.mjs'
import { changeGate, crossings, short, topo, ip, tree, flat, useCandidate } from './gate.mjs'
const { Clipper } = clipperLib
const SCALE = 1000
const arg = (k) => process.argv.slice(2).map(a => a.match(new RegExp(`^--${k}=(.+)$`))).find(Boolean)?.[1]
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const cand = arg('cand') || 'integer'
if (!['integer', 'provenance'].includes(cand)) throw new Error(`no candidate ${cand} (the library route stopped, Jacob 2026-10-28: README.md)`)
const C3 = cand === 'provenance' ? await import('./cand3.mjs') : null
if (C3) useCandidate(C3)
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
