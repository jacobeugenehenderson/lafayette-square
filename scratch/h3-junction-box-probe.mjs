// READ-ONLY probe (H-3 Q8, 2026-09-23): can "junction island" vs "infield" be told apart WITHOUT a size constant?
// Candidate: the JUNCTION BOX, derived from the section. For a no-frontage region touching at-grade terminal T,
// box(T) = the largest curb-face distance among the legs meeting at T:
//   max over legs of (pavementHW on that leg's widest side + ped depth). Measures from ribbons.json, i.e. the chain's
// seed/survey measure, NOT blockCustoms. On LS that is a known limitation (Layer 0 q3); it is a probe, not the check.
// Reports the region's max ring distance from T, over box(T). An island should sit ≤ ~1; an infield well above.
import fs from 'node:fs'
const t = process.argv[2] || 'lafayette-square'
const rp = t === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${t}/clean/ribbons.json`
const R = JSON.parse(fs.readFileSync(rp)).streets, sh = JSON.parse(fs.readFileSync(`public/baked/${t}/shape.json`))
const bld = JSON.parse(fs.readFileSync(`cartograph/data/${t}/raw/msbf.json`)).buildings.map(b => [b.coords.reduce((s, q) => s + q.x, 0) / b.coords.length, b.coords.reduce((s, q) => s + q.z, 0) / b.coords.length])
const pip = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const K = p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`, legs = new Map()
for (const s of R) for (const p of s.points) { const k = K(p); if (!legs.has(k)) legs.set(k, []); legs.get(k).push(s) }
const side = m => Math.max(...['left', 'right'].map(sd => (m?.[sd]?.pavementHW || 0) + (m?.[sd]?.treelawn || 0) + (m?.[sd]?.sidewalk || 0)))
const term = []
for (const s of R) if (s.gradeSeparated) for (const p of [s.points[0], s.points.at(-1)]) { const L = legs.get(K(p)) || []; if (L.some(x => !x.gradeSeparated)) term.push({ p, box: Math.max(...L.map(x => side(x.measure))) }) }
console.log(`${t} [ribbons ${fs.statSync(rp).mtime.toISOString()} · shape ${fs.statSync(`public/baked/${t}/shape.json`).mtime.toISOString()}] terminals ${term.length}`)
sh.tiles.forEach((tl, i) => {
  const ring = Array.isArray(tl.ring?.[0]?.[0]) ? tl.ring[0] : tl.ring; if (!ring) return
  const T = term.filter(q => ring.some(p => Math.hypot(p[0] - q.p[0], p[1] - q.p[1]) < 1)); if (!T.length) return
  if (bld.some(b => pip(b, ring))) return
  // distance from the NEAREST touching terminal, per ring vertex; the region's reach = the max of that
  const reach = Math.max(...ring.map(p => Math.min(...T.map(q => Math.hypot(p[0] - q.p[0], p[1] - q.p[1]) / q.box))))
  console.log(`   tile ${i}: reach / box = ${reach.toFixed(2)}  (box ${T.map(q => q.box.toFixed(1)).join('/')} m)`)
})
