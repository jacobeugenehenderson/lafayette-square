// Forensic (Sward): what land use each PIECE of a tile's iA would take if sampled on its own — the smallest
// ribbons.faces face holding an interior point of the piece (outer minus its holes) — against the tile's
// current one-point answer. Read-only preview of BRIEF-land-use-per-piece step 1; no code changed.
// Usage: node scratch/huron-median-lu/per-piece-preview.mjs <town> [MIN_PIECE m², default 100]
import fs from 'fs'
const town = process.argv[2] || 'huron', MIN = +(process.argv[3] ?? 100)
const S = JSON.parse(fs.readFileSync(`public/baked/${town}/shape.json`)), tiles = Array.isArray(S) ? S : S.tiles
const rib = JSON.parse(fs.readFileSync(town === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${town}/clean/ribbons.json`))
const faces = (rib.faces || []).filter(f => f?.ring?.length >= 3 && f.use)
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const faceAt = (x, z) => { let best = null, ba = Infinity; for (const f of faces) if (pip(x, z, f.ring)) { const a = Math.abs(A(f.ring)); if (a < ba) { ba = a; best = f.use } } return best }
// interior point of a piece: grid scan of its bbox, first point inside the outer and outside every hole, nearest the bbox centre
function pieceInterior(outer, holes) {
  let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const [x, z] of outer) b = [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)]
  const cx = (b[0] + b[1]) / 2, cz = (b[2] + b[3]) / 2, N = 40; let best = null, bd = Infinity
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const x = b[0] + (b[1] - b[0]) * i / N, z = b[2] + (b[3] - b[2]) * j / N
    if (!pip(x, z, outer) || holes.some(h => pip(x, z, h))) continue; const d = (x - cx) ** 2 + (z - cz) ** 2; if (d < bd) { bd = d; best = [x, z] } }
  return best
}
let moved = 0, movedA = 0
tiles.forEach((t, ti) => {
  const outers = (t.iA || []).filter(r => A(r) > 0), holes = (t.iA || []).filter(r => A(r) < 0)
  if (outers.length < 2) return
  for (const o of outers) {
    const a = A(o); if (a < MIN) continue
    const hs = holes.filter(h => pip(h[0][0], h[0][1], o)), p = pieceInterior(o, hs)
    const lu = p ? (faceAt(p[0], p[1]) ?? 'underived') : '(no interior point)'
    const flag = lu !== t.lu; if (flag) { moved++; movedA += a }
    console.log(`${flag ? '⇒' : ' '} tile ${String(ti).padStart(3)} now ${String(t.lu).padEnd(13)} piece ${(a / 1e4).toFixed(3).padStart(8)} ha → ${lu}`)
  }
})
console.log(`${town}: ${moved} piece(s), ${(movedA / 1e4).toFixed(2)} ha, would change class`)
