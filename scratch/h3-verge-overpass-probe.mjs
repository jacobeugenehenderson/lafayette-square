// READ-ONLY probe (H-3 design review, 2026-09-23). Sizes the VERGE class on the frozen shape.json two ways:
//  STRICT  = every street-owned run is gradeSeparated (the brief's instrument)
//  SPANNED = every non-gs run is an OVERPASS SPAN: its chain carries bridge/tunnel/layer≠0 AND it is
//            sandwiched between gs runs in the tile's cyclic run order (the deck crosses the verge).
// Prints the artifact mtimes it read, because other sessions are re-pouring.
import fs from 'node:fs'
const towns = process.argv.slice(2).length ? process.argv.slice(2) : ['huron', 'lafayette-square', 'hipointe-demun', 'altadena']
const A = r => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return Math.abs(a / 2) }
const L = p => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s }
for (const t of towns) {
  const skP = `cartograph/data/${t}/clean/skeleton.json`, shP = `public/baked/${t}/shape.json`
  const sk = JSON.parse(fs.readFileSync(skP)).streets, sh = JSON.parse(fs.readFileSync(shP))
  const by = new Map(sk.map(s => [s.id, s]))
  const gs = id => !!by.get(id)?.gradeSeparated
  const offGrade = id => { const s = by.get(id); return !!s && (s.bridge || s.tunnel || (s.layer | 0) !== 0) }
  let strict = 0, strictA = 0, spanned = 0, spannedA = 0, mixed = 0, mixedA = 0, unknownSkel = 0
  const perim = []
  for (const tl of sh.tiles) {
    const runs = (tl.runs || []).filter(x => x.skelId && !/^__/.test(x.skelId))
    if (!runs.length) continue
    for (const r of runs) if (!by.has(r.skelId)) unknownSkel++
    const g = runs.map(r => gs(r.skelId))
    if (!g.some(Boolean)) continue
    const ring = Array.isArray(tl.ring?.[0]?.[0]) ? tl.ring[0] : tl.ring, a = ring ? A(ring) : 0
    if (g.every(Boolean)) { strict++; strictA += a; continue }
    const n = runs.length
    const span = runs.every((r, i) => g[i] || (offGrade(r.skelId) && g[(i + n - 1) % n] && g[(i + 1) % n]))
    const gl = runs.reduce((s, r, i) => s + (g[i] ? L(r.poly || []) : 0), 0), al = runs.reduce((s, r) => s + L(r.poly || []), 0)
    if (span) { spanned++; spannedA += a } else { mixed++; mixedA += a; perim.push(al ? gl / al : 0) }
  }
  perim.sort((x, y) => x - y)
  const q = f => perim.length ? perim[Math.floor(f * (perim.length - 1))].toFixed(2) : '-'
  console.log(`${t}  [skeleton ${fs.statSync(skP).mtime.toISOString()} · shape ${fs.statSync(shP).mtime.toISOString()}]`)
  console.log(`   verge STRICT ${strict} (${Math.round(strictA)} m²) · verge SPANNED-by-overpass +${spanned} (${Math.round(spannedA)} m²) · mixed ${mixed} (${Math.round(mixedA)} m²; gs share of perimeter p10/p50/p90 ${q(.1)}/${q(.5)}/${q(.9)})${unknownSkel ? ` · ⛔ ${unknownSkel} runs name a skelId absent from skeleton` : ''}`)
}
