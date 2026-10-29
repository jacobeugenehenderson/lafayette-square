// one of candidate 3's remaining copies, up close: the output ring's vertices within --r of the place, each with the source edges
// within 2 u of it (own-edge.mjs's COPY_U) and whether it is a SOURCE vertex. node scratch/cut-once/copy-dump.mjs --fixture=huron --at=x,z [--r=0.05]
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { openCloseProvenance } from './cand3.mjs'
const { IntPoint, Clipper, ClipType, PolyType, PolyFillType, PolyTree } = clipperLib
const arg = (k) => process.argv.slice(2).map(a => a.match(new RegExp(`^--${k}=(.+)$`))).find(Boolean)?.[1]
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/huron-traced.json', import.meta.url), 'utf8')), src = d.traced.map(p => p.map(([X, Y]) => new IntPoint(X, Y)))
const at = arg('at').split(',').map(v => +v * 1000), r = +(arg('r') || 0.05) * 1000
const r3 = openCloseProvenance(src, d.fineM, 'huron')
const P = r3.P, SV = new Set(P.flat().map(q => q.X + ',' + q.Y))
const dist = (q, a, b) => { const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((q.X - a.X) * dx + (q.Y - a.Y) * dy) / L2)); return Math.hypot(q.X - a.X - t * dx, q.Y - a.Y - t * dy) }
for (const ring of r3.rings) { const idx = ring.map((q, i) => i).filter(i => Math.hypot(ring[i].X - at[0], ring[i].Y - at[1]) <= r); if (!idx.length) continue
  for (let i = Math.max(0, idx[0] - 2); i <= Math.min(ring.length - 1, idx[idx.length - 1] + 2); i++) { const q = ring[i]
    const near = []; for (const R of P) for (let k = 0; k < R.length; k++) { const a = R[k], b = R[(k + 1) % R.length]; const dd = dist(q, a, b); if (dd <= 2) near.push(`(${a.X},${a.Y})→(${b.X},${b.Y}) ${dd.toFixed(3)}u`) }
    console.log(`v${i} (${q.X}, ${q.Y})${SV.has(q.X + ',' + q.Y) ? ' SOURCE VERTEX' : ''}  near: ${near.slice(0, 3).join(' · ') || 'none'}`) } }
