// the sharpest corners (interior angle at a convex vertex) of the source P and of each open/close's output, on the PTown decks
// fixture: does the open still remove the sharp corners it was introduced to remove (deckFootprints: "corners as sharp as 0.20°
// (Huron) and 1.13° (PTown), which the ink cannot outline")? integer = structures.mjs#openCloseAtStep; provenance = cand3.mjs
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { openCloseAtStep } from '../../cartograph/structures.mjs'
const { IntPoint, Clipper } = clipperLib
const C3 = await import('./cand3.mjs'), G = await import('./gate.mjs')
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/ptown-deck-inputs.json', import.meta.url), 'utf8')), src = d.inputs.flat().map(p => p.map(q => new IntPoint(q.X, q.Y)))
const sharp = (rings) => { const o = []; for (const r of rings) { const n = r.length, pos = Clipper.Area(r) > 0
  for (let i = 0; i < n; i++) { const a = r[(i - 1 + n) % n], b = r[i], c = r[(i + 1) % n], u = [a.X - b.X, a.Y - b.Y], v = [c.X - b.X, c.Y - b.Y]
    const cr = u[0] * v[1] - u[1] * v[0], ang = Math.atan2(Math.abs(cr), u[0] * v[0] + u[1] * v[1]) * 180 / Math.PI
    const convex = pos ? cr < 0 : cr > 0; if (convex && Math.hypot(...u) > 50 && Math.hypot(...v) > 50) o.push({ deg: +ang.toFixed(2), at: [b.X / 1000, b.Y / 1000] }) } }
  return o.sort((x, y) => x.deg - y.deg).slice(0, 5) }
const P = G.flat(G.tree(src)), I = G.flat(G.tree(openCloseAtStep(src, d.fineM, 'a deck').paths)), K = C3.openCloseProvenance(src, d.fineM, 'decks').rings.map(q => q.map(v => new IntPoint(v.X, v.Y)))
console.log('source P  :', JSON.stringify(sharp(P))); console.log('integer   :', JSON.stringify(sharp(I))); console.log('candidate3:', JSON.stringify(sharp(K)))
