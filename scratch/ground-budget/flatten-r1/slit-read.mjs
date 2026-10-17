// slit-read.mjs — reads slit.json (make-slit.mjs): unions each cutByStamp call's output pieces as the flatten does, takes the
// holes (slits) near the points, and asks of each slit vertex: which stamp parts' region boundaries pass within one lattice
// step of it, and does it sit (within a step) on a crossing between the boundaries of two DIFFERENT parts?
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
const require = createRequire('/Users/jacobhenderson/Desktop/lafayette-square.nosync/package.json')
const cl = require('clipper-lib'), S = 1000
const d = JSON.parse(readFileSync(fileURLToPath(new URL('./slit.json', import.meta.url)), 'utf8'))
const P = (r) => r.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) }))
const sd = (px, py, a, b) => { const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((px - a.X) * dx + (py - a.Y) * dy) / L2)) : 0; return Math.hypot(px - a.X - t * dx, py - a.Y - t * dy) }
const segX = (a, b, c, e) => { const r = [b.X - a.X, b.Y - a.Y], s = [e.X - c.X, e.Y - c.Y], den = r[0] * s[1] - r[1] * s[0]; if (!den) return null
  const t = ((c.X - a.X) * s[1] - (c.Y - a.Y) * s[0]) / den, u = ((c.X - a.X) * r[1] - (c.Y - a.Y) * r[0]) / den; if (t < 0 || t > 1 || u < 0 || u > 1) return null; return [a.X + t * r[0], a.Y + t * r[1]] }
let tot = 0, atCross = 0, onTwo = 0, onOne = 0
for (const [ci, c] of d.calls.entries()) {
  const U = new cl.Clipper(); U.AddPaths(c.out.map(P), cl.PolyType.ptSubject, true); const T = new cl.PolyTree(); U.Execute(cl.ClipType.ctUnion, T, cl.PolyFillType.pftNonZero, cl.PolyFillType.pftNonZero)
  const holes = []; const walk = (n) => { for (const ch of n.Childs()) { if (ch.IsHole()) holes.push(ch.Contour()); walk(ch) } }; walk(T)
  const near = holes.filter(h => c.pts.some(([x, z]) => h.some(v => Math.hypot(v.X / S - x, v.Y / S - z) < 3)))
  const parts = c.parts.map((p, pi) => ({ pi, lu: p.lu, edges: p.region.flatMap(r => { const q = P(r); return q.map((a, i) => [a, q[(i + 1) % q.length]]) }) }))
  console.log(`call ${ci} · classes ${c.classes.join(',')} · parts ${c.parts.length} · out pieces ${c.out.length} · union holes ${holes.length} (near the points ${near.length})`)
  for (const h of near.slice(0, 6)) for (const v of h) { tot++
    const on = parts.filter(p => p.edges.some(([a, b]) => sd(v.X, v.Y, a, b) <= 1)).map(p => p.lu + '#' + p.pi)
    let cross = false; const cand = parts.map(p => p.edges.filter(([a, b]) => sd(v.X, v.Y, a, b) <= 50))
    for (let i = 0; i < cand.length && !cross; i++) for (let j = i + 1; j < cand.length && !cross; j++) for (const [a, b] of cand[i]) { for (const [c2, e] of cand[j]) { const x = segX(a, b, c2, e); if (x && Math.hypot(x[0] - v.X, x[1] - v.Y) <= 1) { cross = true; break } } if (cross) break }
    if (cross) atCross++; if (on.length >= 2) onTwo++; else if (on.length === 1) onOne++
    if (tot <= 16) console.log(`   slit vertex (${v.X}, ${v.Y}) · on the boundaries of: ${on.join(' ') || 'none'} · at a crossing of two parts: ${cross}`) } }
console.log(`slit vertices ${tot}: at a crossing of two different parts ${atCross} · on two or more parts' boundaries ${onTwo} · on exactly one ${onOne} · on none ${tot - onTwo - onOne}`)
