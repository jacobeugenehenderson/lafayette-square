// Zob's read-only trace of PTown's absorb refusal (2026-10-29): the ①-absorb inputs (pipeline.js --absorb-dump) near the cell that touches
// no face, by source: ink rings (①'s network), water rings (from the coast), centrelines, the frame. node scratch/cut-once/absorb-cell-trace.mjs <dump> X Y [R m]
import fs from 'fs'
const [f, X, Y, R = 5] = [process.argv[2], ...process.argv.slice(3).map(Number)], d = JSON.parse(fs.readFileSync(f, 'utf8'))
const dSeg = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((X - a[0]) * dx + (Y - a[1]) * dy) / L2)) : 0; return Math.hypot(X - a[0] - t * dx, Y - a[1] - t * dy) }
const scan = (name, rings, closed, lab) => rings.forEach((r, k) => { const pts = r.points || r; for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const a = pts[i], b = pts[(i + 1) % pts.length], dd = dSeg(a, b)
  if (dd <= R) console.log(`  ${name} ${k}${lab ? ` [${lab(k, i)}]` : ''} e${i} (${a.map(v => v.toFixed(3)).join(', ')}) → (${b.map(v => v.toFixed(3)).join(', ')}) ${(Math.hypot(b[0] - a[0], b[1] - a[1]) * 1000).toFixed(1)} mm · ${dd.toFixed(3)} m off`) } })
console.log(`within ${R} m of (${X}, ${Y}):`)
scan('ink', d.inkRings, true, (k, i) => JSON.stringify(d.inkLabels?.[k]?.[i] ?? null).slice(0, 60))
scan('water', d.waterRings, true)
scan('centreline', (d.centrelines || []).map(c => c.points || c), false, (k) => d.centrelines[k].skelId || d.centrelines[k].id || '')
scan('frame', [d.frame], true)
