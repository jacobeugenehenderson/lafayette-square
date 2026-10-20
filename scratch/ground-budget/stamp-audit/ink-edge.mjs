// ink-edge.mjs — premise check for a road-side sweep from ①: (1) are the tiles' rings ①'s ink boundary (shared vertices /
// within LATTICE_M)? (2) is the road band's inner edge (asphalt as painted BEFORE ①'s ink joins it) the ink boundary?
// From run3.sh's capture (stamp3-<town>.json: inkAudit {ink, roadInk, hwyInk, asphaltBefore}, tiles). Read-only.
import { readFileSync } from 'fs'
import { LATTICE_M } from '../../../src/lib/lattice.js'
const D = JSON.parse(readFileSync(process.argv[2], 'utf8')), I = D.inkAudit, R = +process.argv[3] || Infinity
const C = 1, NEAR = 0.05, key = (x, z) => `${Math.floor(x / C)},${Math.floor(z / C)}`
// the ink boundary as segments in a grid
const segs = new Map(); let nInkV = 0
for (const r of I.ink) { nInkV += r.length; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]
  for (let x = Math.floor(Math.min(a[0], b[0]) / C); x <= Math.floor(Math.max(a[0], b[0]) / C); x++) for (let z = Math.floor(Math.min(a[1], b[1]) / C); z <= Math.floor(Math.max(a[1], b[1]) / C); z++) { const k = `${x},${z}`; (segs.get(k) || segs.set(k, []).get(k)).push([a, b]) } } }
const inkV = new Set(I.ink.flatMap(r => r.map(p => `${p[0]},${p[1]}`)))
const dSeg = (p) => { let best = Infinity; const cx = Math.floor(p[0] / C), cz = Math.floor(p[1] / C)
  for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const [a, b] of segs.get(`${x},${z}`) || []) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
    best = Math.min(best, Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dz)) } return best }
const tally = (pts, label) => { let n = 0, shared = 0, onLat = 0, near = 0, far = 0; const offs = []
  for (const p of pts) { if (Math.hypot(p[0], p[1]) > R) continue; n++
    if (inkV.has(`${p[0]},${p[1]}`)) { shared++; continue }
    const d = dSeg(p); if (d <= LATTICE_M) onLat++; else if (d < NEAR) { near++; offs.push(d) } else far++ }
  offs.sort((a, b) => a - b)
  console.log(`${label}: ${n} vertices · shared with the ink exactly ${shared} · on an ink edge within LATTICE_M ${onLat} · 1 mm–5 cm off ${near}${offs.length ? ` (p50 ${(offs[offs.length >> 1] * 1000).toFixed(2)} mm, max ${(offs.at(-1) * 1000).toFixed(2)} mm)` : ''} · not at the ink (> 5 cm) ${far}`) }
console.log(`ink: ${I.ink.length} ring(s), ${nInkV} vertices · road ink ${I.roadInk.length} piece(s) · highway ink ${I.hwyInk.length} · inside r ${R}`)
tally(D.tiles.flatMap(t => t.ring), 'tile rings (①\'s blocks)')
tally(I.asphaltBefore.flatMap(r => r), 'road band as painted, before ①\'s ink joins it')
