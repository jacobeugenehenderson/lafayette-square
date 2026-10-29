// PTown's step-4 antenna as a planted crop (Zob, 2026-10-29): this run's coast water within W m of the site and the street deck whose
// corner the antenna reaches (a structures.mjs#deckFootprints outer: streetDecks' rings are its selected outers), then the deck
// take-out (structures.mjs#waterWithoutDecks) on them, judged by the coast check's own predicate (coastFile.mjs#ringViolations).
// node scratch/cut-once/antenna-crop.mjs [W m]
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Clipper, ClipType, PolyType, PolyFillType, Paths } = clipperLib
const S = await import('../../cartograph/structures.mjs'), CF = await import('../../cartograph/coastFile.mjs')
const [X, Y, W] = [192.134, 63.122, +(process.argv[2] || 60)]
const coast = JSON.parse(fs.readFileSync(new URL('../../cartograph/data/provincetown/clean/coast.json', import.meta.url), 'utf8')), osm = JSON.parse(fs.readFileSync(new URL('../../cartograph/data/provincetown/raw/osm.json', import.meta.url), 'utf8'))
const fp = S.deckFootprints(osm.ground, coast.fineM), dist = (r) => Math.min(...r.map(p => Math.hypot(p[0] - 192.008, p[1] - 63.050)))
const deck = fp.rings.filter(r => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) > 0).sort((a, b) => dist(a) - dist(b))[0]
console.log(`the deck: ${deck.length} vertices, its nearest vertex ${(dist(deck) * 1000).toFixed(1)} mm from the antenna's tip`)
const toP = (r) => r.map(([x, z]) => new IntPoint(Math.round(x * 1000), Math.round(z * 1000)))
const c = new Clipper(), o = new Paths(); c.AddPaths(coast.water.flatMap(b => [b.outer, ...b.holes]).map(toP), PolyType.ptSubject, true)
c.AddPath([[X - W / 2, Y - W / 2], [X + W / 2, Y - W / 2], [X + W / 2, Y + W / 2], [X - W / 2, Y + W / 2]].map(([a, b]) => new IntPoint(a * 1000, b * 1000)), PolyType.ptClip, true); c.Execute(ClipType.ctIntersection, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
const water = o.map(p => p.map(q => [q.X / 1000, q.Y / 1000]))
fs.writeFileSync(new URL('./fixtures/ptown-antenna-crop.json', import.meta.url), JSON.stringify({ note: `PTown's v7 coast water (this run), ${W} m round (${X}, ${Y}), and the street deck at the antenna's tip (deckFootprints)`, fineM: coast.fineM, water, deck }))
const w = S.waterWithoutDecks(water, [], [deck], coast.fineM)
const v = [...w.rings.flatMap(r => CF.ringViolations(r)), ...CF.ringsMeet(w.rings)]
const spike = w.rings.flatMap((r, k) => r.map((p, i) => [k, i, p, r[(i - 1 + r.length) % r.length], r[(i + 1) % r.length]])).filter(([, , p, a, b]) => Math.hypot(p[0] - 192.008, p[1] - 63.050) < 0.02 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.005)   // out and back: an ANTENNA
console.log(`the take-out: ${w.rings.length} water ring(s), ${w.slivers.length} sliver(s) · violations ${v.length}${v.length ? `: ${v.slice(0, 3).map(x => `${x.kind} @(${x.at.map(t => t.toFixed(3)).join(', ')})`).join(' · ')}` : ''} · ANTENNA at the tip: ${spike.length ? JSON.stringify(spike) : 'none'}`)
