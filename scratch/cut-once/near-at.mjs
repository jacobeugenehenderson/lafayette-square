// the final k's vertices and edge tags within R u of a point, on a fixture, under the spike:
// node scratch/cut-once/near-at.mjs decks X Y [R]   (X, Y in metres; R in units, default 2000)
import fs from 'fs'
const G = await import('./gate.mjs'), C3 = await import('./cand3.mjs'); C3.setBackPieces(true)
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/ptown-deck-inputs.json', import.meta.url), 'utf8'))
const [X, Y, R = 2000] = process.argv.slice(3).map(Number), cx = X * 1000, cy = Y * 1000
const r = C3.openCloseProvenance(G.ip(d.inputs.flat()), d.fineM, 'decks')
r.rings.forEach((ring, k) => ring.forEach((q, i) => { if (Math.hypot(q.X - cx, q.Y - cy) > R) return
  const w = ring[(i + 1) % ring.length]; console.log(k, i, [q.X, q.Y], '→', [w.X, w.Y], JSON.stringify(r.tags[k][i])) }))
