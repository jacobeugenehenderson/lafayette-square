// Forensic (Sward): how much ground would (b) "paint each piece by the faces under it" paint differently from
// (a) "each piece takes the class covering most of it"? Both read ribbons.faces (the frozen, voted faces —
// the only READABLE split lines; the raw OSM polygons leave the uncovered remainder, which is unruled).
// 10 m grid over every piece of every tile's iA. Usage: node scratch/huron-median-lu/a-vs-b.mjs [town ...]
import fs from 'fs'
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const bb = r => { let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const [x, z] of r) b = [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)]; return b }
const S = 10
for (const town of process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square', 'hipointedemun', 'huron', 'provincetown']) {
  const Sh = JSON.parse(fs.readFileSync(`public/baked/${town}/shape.json`)), tiles = Array.isArray(Sh) ? Sh : Sh.tiles
  const rib = JSON.parse(fs.readFileSync(town === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${town}/clean/ribbons.json`))
  const faces = (rib.faces || []).filter(f => f?.ring?.length >= 3 && f.use).map(f => ({ use: f.use, ring: f.ring, bb: bb(f.ring), a: Math.abs(A(f.ring)) }))
  const useAt = (x, z) => { let best = null, ba = Infinity; for (const f of faces) if (x >= f.bb[0] && x <= f.bb[1] && z >= f.bb[2] && z <= f.bb[3] && f.a < ba && pip(x, z, f.ring)) { ba = f.a; best = f.use } return best ?? 'underived' }
  let total = 0, diff = 0, pieces = 0, mixed = 0, vergeSkip = 0; const worst = []
  tiles.forEach((t, ti) => {
    if (t.blockClass === 'verge' || t.blockClass === 'jr') { vergeSkip++; return }   // the mint rules these `verge`, no choice
    const outers = (t.iA || []).filter(r => A(r) > 0), holes = (t.iA || []).filter(r => A(r) < 0)
    for (const o of outers) {
      const hs = holes.filter(h => pip(h[0][0], h[0][1], o)), b = bb(o), c = {}; let n = 0
      for (let x = b[0] + S / 2; x <= b[1]; x += S) for (let z = b[2] + S / 2; z <= b[3]; z += S) {
        if (!pip(x, z, o) || hs.some(h => pip(x, z, h))) continue; n++; const u = useAt(x, z); c[u] = (c[u] || 0) + 1 }
      if (!n) continue; pieces++
      const maj = Object.entries(c).sort((p, q) => q[1] - p[1])[0], off = n - maj[1]
      total += n; diff += off; if (off) { mixed++; worst.push({ ti, off, n, c }) }
    }
  })
  console.log(`\n${town}: ${pieces} pieces (${vergeSkip} verge/JR tiles excluded) · ${mixed} pieces lie under >1 face class · (b) would paint ${(diff * S * S / 1e4).toFixed(1)} ha of ${(total * S * S / 1e4).toFixed(1)} ha differently from (a) = ${(100 * diff / total).toFixed(1)}%`)
  for (const w of worst.sort((p, q) => q.off - p.off).slice(0, 5)) console.log(`   tile ${w.ti}: ${(w.off * S * S / 1e4).toFixed(1)} ha off-majority · ${Object.entries(w.c).sort((p, q) => q[1] - p[1]).map(([k, v]) => `${k} ${(v * S * S / 1e4).toFixed(1)}`).join(' · ')}`)
}
