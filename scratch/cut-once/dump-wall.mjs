// Zob's dump for the decks' ∩P conflict by part 4's narrowest wall: the P edges behind the tags near (241.2, 270.2), where the
// edge b (240831, 269880) → (241520, 270460) sits, the wall's width along b against the ring across it, and whether today's
// integer open/close (structures.mjs#openCloseAtStep) keeps the wall: is a point inside the wall material in its output?
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { openCloseAtStep } from '../../cartograph/structures.mjs'
import { arrange } from './cand3.mjs'
const { IntPoint } = clipperLib
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/ptown-deck-inputs.json', import.meta.url), 'utf8')), src = d.inputs.flat().map(p => p.map(q => new IntPoint(q.X, q.Y)))
const P = arrange([src.map(p => p.map(q => ({ X: q.X, Y: q.Y })))], w => w[0] !== 0, 'P').rings
const area = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p.X * q.Y - q.X * p.Y }, 0) / 2e6
for (const [g, i] of [[0, 3], [1, 0], [1, 26]]) { const R = P[g], a = R[i], b = R[(i + 1) % R.length]; console.log(`P ring ${g} (${area(R).toFixed(2)} m²) edge ${i}: (${a.X},${a.Y}) → (${b.X},${b.Y})`) }
let bAt = null; P.forEach((R, g) => R.forEach((a, i) => { if (a.X === 240831 && a.Y === 269880) bAt = { g, i, next: R[(i + 1) % R.length] } }))
console.log('edge b starts at P ring', bAt?.g, 'edge', bAt?.i, 'next vertex', JSON.stringify(bAt?.next), `(ring area ${area(P[bAt.g]).toFixed(2)} m²)`)
const segD = (p, a, b) => { const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((p[0] - a.X) * dx + (p[1] - a.Y) * dy) / L2)); return Math.hypot(p[0] - a.X - t * dx, p[1] - a.Y - t * dy) }
const other = P.map((R, g) => g).filter(g => g !== bAt.g)
const a0 = P[bAt.g][bAt.i], b0 = bAt.next, widths = []
for (let k = 0; k <= 10; k++) { const p = [a0.X + (b0.X - a0.X) * k / 10, a0.Y + (b0.Y - a0.Y) * k / 10]; let best = { d: Infinity }
  for (const g of other) { const R = P[g]; for (let i = 0; i < R.length; i++) { const dd = segD(p, R[i], R[(i + 1) % R.length]); if (dd < best.d) best = { d: dd, g } } }
  widths.push({ at: p.map(v => +(v / 1000).toFixed(3)), widthM: +(best.d / 1000).toFixed(4), across: `ring ${best.g} (${area(P[best.g]).toFixed(1)} m²)` }) }
console.log('wall width along b (2h = ' + d.fineM.toFixed(4) + ' m):'); for (const w of widths) console.log(' ', JSON.stringify(w))
const oc = openCloseAtStep(src, d.fineM, 'a deck'), inR = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a.Y > y) !== (b.Y > y) && x < (b.X - a.X) * (y - a.Y) / (b.Y - a.Y) + a.X) c = !c } return c }
const wind = (rs, x, y) => rs.reduce((t, r) => t + (inR(x, y, r) ? Math.sign(area(r)) : 0), 0)
for (const w of [widths[0], widths[5], widths[10]]) { const mid = w.at.map(v => v * 1000); console.log(`integer output at b's point ${JSON.stringify(w.at)}: winding ${wind(oc.paths, mid[0] + 0, mid[1])} (P: ${wind(P, mid[0], mid[1])})`) }
