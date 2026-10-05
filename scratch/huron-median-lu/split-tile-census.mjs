// Forensic (Sward, 2026-10-04): baked tiles whose iA (the block area after the roadway is cut out) falls into
// MORE THAN ONE positive piece. Every piece takes the tile's ONE land use (luForRing reads one interior point),
// so a piece that is a different place — a motorway median, the far side of a trail — inherits a class
// measured somewhere else. Reads public/baked/<town>/shape.json. Usage: node scratch/huron-median-lu/split-tile-census.mjs
import fs from 'fs'
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const Pm = r => { let p = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) p += Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]); return p }
const MIN = +(process.env.MIN_PIECE ?? 100)   // m² — this report's floor, not the kit's
for (const town of fs.readdirSync('public/baked')) {
  const f = `public/baked/${town}/shape.json`; if (!fs.existsSync(f)) continue
  const S = JSON.parse(fs.readFileSync(f)), tiles = Array.isArray(S) ? S : S.tiles
  const hit = []
  tiles.forEach((t, i) => {
    const pos = (t.iA || []).map(r => ({ a: A(r), r })).filter(o => o.a > 0)
    if (pos.length < 2) return
    pos.sort((x, y) => y.a - x.a)
    const minor = pos.slice(1).filter(o => o.a >= MIN)
    if (minor.length) hit.push({ i, lu: t.lu, cls: t.blockClass, main: pos[0].a, minor: minor.map(o => ({ a: o.a, w: 2 * o.a / Pm(o.r), runs: [...new Set(t.runs.filter(u => u.poly.some(p => o.r.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.01))).map(u => u.skelId))] })) })
  })
  const sum = hit.reduce((s, h) => s + h.minor.reduce((a, m) => a + m.a, 0), 0)
  console.log(`\n${town}: ${tiles.length} tiles · ${hit.length} with a second iA piece ≥ ${MIN} m² · ${(sum / 1e4).toFixed(2)} ha in those pieces`)
  for (const h of hit.sort((x, y) => Math.max(...y.minor.map(m => m.a)) - Math.max(...x.minor.map(m => m.a))))
    for (const m of h.minor) console.log(`   tile ${String(h.i).padStart(3)} lu=${String(h.lu).padEnd(13)} main ${(h.main / 1e4).toFixed(2).padStart(7)} ha · piece ${(m.a / 1e4).toFixed(3)} ha, mean width ${m.w.toFixed(1)} m · ${m.runs.slice(0, 6).join(',')}`)
}
