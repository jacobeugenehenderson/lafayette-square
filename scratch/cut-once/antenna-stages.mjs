// the take-out's stages on the antenna crop (fixtures/ptown-antenna-crop.json), each one's vertices at the antenna's tip and whether
// it carries an out-and-back there: w0 · loc · open (openAt) · thin · touching · u0 · e (closeAt) · the final water − decks.
// node scratch/cut-once/antenna-stages.mjs
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, Paths, JoinType, EndType } = clipperLib
const K = await import('../../cartograph/openClose.mjs')
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/ptown-antenna-crop.json', import.meta.url), 'utf8')), stepM = d.fineM, cellU = stepM * 1000, TIP = [192008, 63050]
const toP = (r) => r.map(([x, z]) => new IntPoint(Math.round(x * 1000), Math.round(z * 1000)))
const op = (type, a, b) => { const k = new Clipper(), o = new Paths(); k.StrictlySimple = true; k.AddPaths(a, PolyType.ptSubject, true); if (b) k.AddPaths(b, PolyType.ptClip, true); k.Execute(type, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const grow = (src, dd) => { const co = new ClipperOffset(), o = new Paths(); co.AddPaths(src, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, dd); return o }
const at = (name, pp) => { const hits = []; pp.forEach((r, k) => r.forEach((q, i) => { if (Math.hypot(q.X - TIP[0], q.Y - TIP[1]) <= 20) { const a = r[(i - 1 + r.length) % r.length], b = r[(i + 1) % r.length]; hits.push(`r${k}:${i} (${q.X},${q.Y}) prev (${a.X},${a.Y}) next (${b.X},${b.Y})${Math.hypot(a.X - b.X, a.Y - b.Y) < 5 ? ' ⛔ OUT-AND-BACK' : ''}`) } }))
  console.log(`${name}: ${pp.length} ring(s) · at the tip: ${hits.length ? hits.join(' | ') : 'nothing'}`) }
const water = d.water.map(toP), D = [toP(d.deck)]
at('water (the coast)', water); at('the deck', D)
const w0 = op(ClipType.ctDifference, water, D); at('w0 = water − deck', w0)
const loc = op(ClipType.ctIntersection, w0, grow(D, 2 * cellU)); at('loc = w0 ∩ grow(deck, 2 cells)', loc)
const open = K.openAt(loc, stepM, 'loc'); at('open = openAt(loc)', open)
const thin = op(ClipType.ctIntersection, op(ClipType.ctDifference, loc, open), grow(D, cellU)); at('thin = (loc − open) ∩ grow(deck, 1 cell)', thin)
const area = (ps) => ps.reduce((t, q) => t + Clipper.Area(q), 0), touching = thin.filter(q => Clipper.Area(q) > 0 && area(op(ClipType.ctIntersection, grow([q], 2), D)) > 0); at('touching', touching)
const u0 = op(ClipType.ctUnion, [...D, ...touching]); at('u0 = deck ∪ touching', u0)
const e = K.closeAt(u0, stepM, 'u0'); at('e = closeAt(u0)', e)
at('final = water − e', op(ClipType.ctDifference, water, e.filter(q => Clipper.Area(q) > 0)))
