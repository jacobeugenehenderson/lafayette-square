// Zob's trace of Huron's two DECK residual pieces past 2·NB (the runtime net, 2026-10-29): for each piece, the deck part holding it, the
// OSM deck ways nearest it, the kit's emission rules (ORIGIN) on that part near the site, and that part's own residual against its
// definition, kit and frozen integer form. node scratch/cut-once/deck-residual-trace.mjs [huron]
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Clipper, ClipType, PolyType, PolyFillType, Paths } = clipperLib
const scene = process.argv[2] || 'huron'
const S = await import('../../cartograph/structures.mjs'), K = await import('../../cartograph/openClose.mjs'), J = await import('../../cartograph/openCloseJudge.mjs'), Z = await import('../../checks/fixtures/open-close-integer-frozen-464dfa5f.mjs')
const osm = JSON.parse(fs.readFileSync(new URL(`../../cartograph/data/${scene}/raw/osm.json`, import.meta.url), 'utf8')), coast = JSON.parse(fs.readFileSync(new URL(`../../cartograph/data/${scene}/clean/coast.json`, import.meta.url), 'utf8'))
const fine = coast.fineM, P = S.deckInputs(osm.ground).paths, k = S.deckFootprints(osm.ground, fine).paths, res = J.residualOf(k, P, fine)
console.log(`${scene}'s decks: ${res.n} piece(s) past 2·NB, ${res.m2} m²`)
const dsr = S.deckStructures(osm.ground), ds = [...dsr.areas, ...dsr.lines], parts = K.partsOf(P, 'decks')
const inR = (x, y, r) => { let c = false; for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const p = r[a], q = r[b]; if ((p.Y > y) !== (q.Y > y) && x < (q.X - p.X) * (y - p.Y) / (q.Y - p.Y) + p.X) c = !c } return c }
const dSeg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0; return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) }
for (const w of res.pieces) { const [x, y] = w.at, X = x * 1000, Y = y * 1000
  const bd = (pp) => { const xs = pp[0].map(q => q.X), ys = pp[0].map(q => q.Y); return Math.max(Math.min(...xs) - X, X - Math.max(...xs), Math.min(...ys) - Y, Y - Math.max(...ys), 0) }
  const gi = parts.map((pp, i) => [i, bd(pp)]).sort((a, b) => a[1] - b[1])[0][1] < 5000 ? parts.map((pp, i) => [i, bd(pp)]).sort((a, b) => a[1] - b[1])[0][0] : -1
  const near = ds.map(f => { const pts = f.ring || f.points || f.line || []; let m = Infinity; for (let i = 0; i + 1 < pts.length; i++) m = Math.min(m, dSeg(x, y, pts[i], pts[i + 1])); return { id: f.id, kind: f.kind, name: f.name, width: f.tags?.width, area: !!f.ring, d: +m.toFixed(2) } }).sort((a, b) => a.d - b.d).slice(0, 3)
  console.log(`\n== ${w.side} ${w.m2} m² at (${x}, ${y}) key ${w.key}\n   OSM decks nearest: ${JSON.stringify(near)}`)
  if (gi < 0) { console.log('   no deck part found'); continue }
  const part = J.ip(parts[gi]), r = K.openCloseCutOnce(parts[gi], fine, 'trace'), kinds = {}
  for (const [key, v] of r.origin) { const [vx, vy] = key.split(',').map(Number); if (Math.hypot(vx - X, vy - Y) < 3000) for (const kd of String(v).split('|')) kinds[kd] = (kinds[kd] || 0) + 1 }
  const kit = J.residualOf(J.ip(r.rings), part, fine), integer = J.residualOf(Z.openCloseAtStep(part, fine, 'int').paths, part, fine)
  console.log(`   part ${gi}: ${parts[gi].length} ring(s), ${(parts[gi].reduce((t, q) => t + K.area(q), 0) / 1e6).toFixed(1)} m² · emission kinds within 3 m: ${JSON.stringify(kinds)} · topology ${JSON.stringify(r.topology)}`)
  console.log(`   that part alone vs its definition: kit ${kit.n} piece(s) ${kit.m2} m² · the frozen integer form ${integer.n} piece(s) ${integer.m2} m²`) }
