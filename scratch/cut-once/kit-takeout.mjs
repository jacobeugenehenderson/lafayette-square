// the deck take-out THROUGH THE KIT (after the port): structures.mjs#waterWithoutDecks on ptown-coast + ptown-street-decks, against
// the candidate's own output before the port (fixtures/ptown-takeout-candidate.json, takeout.mjs), with its measures.
// node scratch/cut-once/kit-takeout.mjs
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Path, Clipper, ClipType, PolyType, PolyFillType, Paths } = clipperLib
const S = await import('../../cartograph/structures.mjs'), G = await import('./gate.mjs'), { ownEdge } = await import('./own-edge.mjs')
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8')), coast = fx('ptown-coast'), sd = fx('ptown-street-decks'), was = fx('ptown-takeout-candidate')
const water = coast.water.flatMap(bd => [bd.outer, ...bd.holes]), t0 = Date.now(), w = S.waterWithoutDecks(water, coast.arcs || [], sd.rings, coast.fineM), ms = Date.now() - t0
const toPath = (ring) => { const p = new Path(); for (const [x, z] of ring) p.push(new IntPoint(Math.round(x * 1000), Math.round(z * 1000))); return p }
const un = (pp) => { const c = new Clipper(), o = new Paths(); c.AddPaths(pp, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
let le2 = 0, onDeck = 0; for (const r of w.rings) for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= 0.002) { le2++; if (r.deck?.[i] != null) onDeck++ } }
const out = w.rings.map(toPath), e = ownEdge(un([...water.map(toPath), ...sd.rings.map(toPath)]), out)
const same = JSON.stringify(w.rings.map(r => ({ pts: r, deck: r.deck }))) === JSON.stringify(was.rings) && JSON.stringify(w.arcs) === JSON.stringify(was.arcs)
console.log(JSON.stringify({ ms, rings: w.rings.length, arcs: w.arcs.length, slivers: w.slivers.length, le2mm: le2, onDeck, copy: e.copy, crossings: G.crossings(out).length, sameAsCandidate: same }))
