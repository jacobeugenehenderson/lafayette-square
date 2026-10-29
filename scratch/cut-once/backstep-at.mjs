// the take-out's ring and vertex index at the brief's back-step (282.791, 113.214) and Kerf's ① vertex (282.795, 113.216), under the
// integer take-out and the candidate's: every output vertex within 1 cm of either, with its neighbours. node scratch/cut-once/backstep-at.mjs
import fs from 'fs'
process.argv[1] = 'not-main'
const T = await import('./takeout.mjs'), S = await import('../../cartograph/structures.mjs')
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8')), coast = fx('ptown-coast'), sd = fx('ptown-street-decks')
const water = coast.water.flatMap(bd => [bd.outer, ...bd.holes]), arcs = coast.arcs || []
for (const [nm, w] of [['integer', S.waterWithoutDecks(water, arcs, sd.rings, coast.fineM)], ['candidate', T.takeOutCandidate(water, arcs, sd.rings, coast.fineM)]])
  for (const at of [[282.791, 113.214], [282.795, 113.216]]) w.rings.forEach((r, ri) => r.forEach((p, i) => { if (Math.hypot(p[0] - at[0], p[1] - at[1]) > (+process.env.R || 0.01)) return
    console.log(nm, `near (${at})`, `ring ${ri} v${i} deck ${r.deck?.[i]}:`, [-2, -1, 0, 1, 2].map(d => r[(i + d + r.length) % r.length].map(v => +v.toFixed(3)).join(',')).join(' → ')) }))
// the candidate's deck-1 EDGE passing nearest the back-step
const wc = T.takeOutCandidate(water, arcs, sd.rings, coast.fineM), at = [282.791, 113.214]
const sdist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) }
let best = null; wc.rings.forEach((r, ri) => r.forEach((p, i) => { const q = r[(i + 1) % r.length], d = sdist(at, p, q); if (!best || d < best.d) best = { d, ri, i, p, q, deck: r.deck?.[i] } }))
console.log('candidate nearest edge', JSON.stringify({ mm: +(best.d * 1000).toFixed(3), ring: best.ri, edge: best.i, deck: best.deck, from: best.p.map(v => +v.toFixed(3)), to: best.q.map(v => +v.toFixed(3)) }))
