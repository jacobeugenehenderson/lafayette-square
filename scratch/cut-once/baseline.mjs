// §3.1 baseline: the kit's open/close today (clipper-lib, integer), on the three fixtures, by own-edge.mjs's yardstick.
// node scratch/cut-once/baseline.mjs [--skip-huron]
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { openCloseAtStep } from '../../cartograph/structures.mjs'
import { ownEdge } from './own-edge.mjs'
const { IntPoint, Clipper, ClipType, PolyType, PolyFillType, Paths } = clipperLib
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const ip = (pp) => pp.map(p => p.map(q => (Array.isArray(q) ? new IntPoint(q[0], q[1]) : new IntPoint(q.X, q.Y))))
const union = (pp) => { const c = new Clipper(), o = new Paths(); c.AddPaths(pp, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const run = (name, src, stepM, opt) => { const t0 = Date.now(), oc = openCloseAtStep(src, stepM, name, opt), ms = Date.now() - t0
  const u = union(src), e = ownEdge(u, oc.paths)
  console.log(JSON.stringify({ fixture: name, cutOnce: opt.cutOnce, ms, parts: oc.paths.length, own: e.own, copy: e.copy, new: e.new, copies: e.copies.slice(0, 4) })) }

// (1) PTown's decks, the footprint call (deckFootprints → openCloseAtStep(paths, stepM, 'a deck')), every deck input
const di = fx('ptown-deck-inputs')
run('ptown decks', ip(di.inputs.flat()), di.fineM, { cutOnce: true })
// (2) PTown's Breakwater strip: never opened today (structures.mjs#embankmentFootprints); opened here to see what the integer form
// does to a clean cut-once strip (the 7 mm × 100 m wedge the ruling names)
const em = fx('ptown-embankments')
run('ptown breakwater', ip(em.paths), em.fineM, { cutOnce: true })
// (3) Huron's traced water, both forms (the call bake-coast makes is cutOnce: false)
if (!process.argv.includes('--skip-huron')) { const h = fx('huron-traced'); for (const cutOnce of [false, true]) run('huron traced', ip(h.traced), h.fineM, { cutOnce }) }
