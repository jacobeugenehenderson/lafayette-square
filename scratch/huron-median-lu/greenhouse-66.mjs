// Forensic (Sward): tile 66's greenhouse_horticulture — each feature's area in the tile, and the
// UNION (5 m sampling) vs the per-tag SUM that luCoverageForFace reports (overlaps double-count).
import fs from 'fs'
const s = JSON.parse(fs.readFileSync('public/baked/huron/shape.json')), osm = JSON.parse(fs.readFileSync('cartograph/data/huron/raw/osm.json'))
const pip = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i].x ?? r[i][0], zi = r[i].z ?? r[i][1], xj = r[j].x ?? r[j][0], zj = r[j].z ?? r[j][1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins } return ins }
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].z - r[i].x * r[j].z; return Math.abs(a / 2) }
const tile = s.tiles[+(process.argv[2] ?? 66)], TAG = process.argv[3] ?? 'greenhouse_horticulture'
const gh = osm.ground.landuse.filter(f => f.tags?.landuse === TAG && f.coords?.length >= 3)
let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const p of tile.ring) { b[0] = Math.min(b[0], p[0]); b[1] = Math.max(b[1], p[0]); b[2] = Math.min(b[2], p[1]); b[3] = Math.max(b[3], p[1]) }
const S = 5, per = gh.map(() => 0); let uni = 0, multi = 0
for (let x = b[0]; x <= b[1]; x += S) for (let z = b[2]; z <= b[3]; z += S) {
  if (!pip(x, z, tile.ring)) continue
  let k = 0; gh.forEach((f, i) => { if (pip(x, z, f.coords) && !(f.holes || []).some(h => pip(x, z, h))) { per[i]++; k++ } })
  if (k) uni++; if (k > 1) multi++
}
console.log(`${TAG}: ${gh.length} features town-wide, total outer area ${(gh.reduce((a, f) => a + A(f.coords), 0) / 1e4).toFixed(2)} ha`)
gh.forEach((f, i) => per[i] && console.log(`   osm ${f.osmId} ${f.tags.name ?? ''} outer ${(A(f.coords) / 1e4).toFixed(2)} ha, in tile ${(per[i] * S * S / 1e4).toFixed(2)} ha, holes ${(f.holes || []).length}`))
console.log(`in tile: SUM ${(per.reduce((a, c) => a + c, 0) * S * S / 1e4).toFixed(2)} ha · UNION ${(uni * S * S / 1e4).toFixed(2)} ha · covered by >1 feature ${(multi * S * S / 1e4).toFixed(2)} ha`)
