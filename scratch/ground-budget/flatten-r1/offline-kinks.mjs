// offline-kinks.mjs — per town: evidence vertices that lie OFF a stamped block edge (iA⁺) by more than 0 and at most 5 mm
// (a class boundary meeting the block a hair off its line — the stamp inserts only proper crossings and exact on-edge vertices)
import { readFileSync, readdirSync, existsSync } from 'fs'
import { stampTile } from '../../../src/lib/tileGround.js'
const B = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/public/baked'
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
for (const town of readdirSync(B)) { const f = `${B}/${town}/shape.json`; if (!existsSync(f)) continue
  const T = JSON.parse(readFileSync(f, 'utf8')).tiles; let n = 0, tiles = 0; const hist = [0, 0, 0, 0, 0]
  for (const st of T) { if (!Array.isArray(st?.evidenceByPiece) || !st.iaFull?.length) continue
    let s2; try { s2 = stampTile(st) } catch { continue }
    const keys = new Set(s2.iA.flat().map(v => v.join(','))); let hit = false
    for (const l of s2.evidenceByPiece) for (const e of (l || [])) for (const r of e.rings) for (const p of r) { if (keys.has(p.join(','))) continue
      let d = Infinity; for (const ring of s2.iA) for (let k = 0; k < ring.length; k++) { d = Math.min(d, sd(p, ring[k], ring[(k + 1) % ring.length])); if (d === 0) break }
      if (d > 0 && d <= 0.005) { n++; hit = true; hist[Math.min(4, Math.floor(d * 1000))]++ } }
    if (hit) tiles++ }
  console.log(town.padEnd(18), n, 'evidence vertex(es) 0–5 mm off a block edge, in', tiles, 'tile(s) · by mm [0-1,1-2,2-3,3-4,4-5]', hist.join(','))
}
