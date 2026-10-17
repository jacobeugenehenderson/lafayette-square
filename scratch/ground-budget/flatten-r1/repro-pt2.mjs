// repro-pt2.mjs — for each item pt2 captured, triangulate it EXACTLY as groundConformity.js `conformAndRefine` does
// (THREE.ShapeUtils.triangulateShape(contour, holes)) and report triangles that cover PT although the item does not
// (inside its outer and outside every hole), plus the ring's validity: a hole vertex ON the outer or on another hole,
// holes overlapping, a repeated vertex.   node repro-pt2.mjs pt-cluster2.json
import { readFileSync } from 'fs'
import * as THREE from 'three'
const d = JSON.parse(readFileSync(process.argv[2], 'utf8')), [px, pz] = d.at
const pip = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const inTri = (a, b, c, x, z) => { const s = (p, q) => (q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0]); const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) }
const key = (p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`
for (const [g, items] of Object.entries(d.groups)) for (const it of items) {
  const holds = pip(it.outer, px, pz) && !it.holes.some(h => pip(h, px, pz))
  const tris = THREE.ShapeUtils.triangulateShape(it.outer.map(([x, z]) => new THREE.Vector2(x, z)), it.holes.map(h => h.map(([x, z]) => new THREE.Vector2(x, z))))
  const all = [...it.outer, ...it.holes.flat()]
  const cover = tris.filter(([a, b, c]) => inTri(all[a], all[b], all[c], px, pz))
  // validity
  const outerKeys = new Set(it.outer.map(key)), seen = new Map(); let onOuter = 0, holeHole = 0, repeated = 0
  it.holes.forEach((h, hi) => h.forEach(p => { const k = key(p); if (outerKeys.has(k)) onOuter++; if (seen.has(k) && seen.get(k) !== hi) holeHole++; seen.set(k, hi) }))
  for (const r of [it.outer, ...it.holes]) { const s = new Set(); for (const p of r) { const k = key(p); if (s.has(k)) repeated++; s.add(k) } }
  const flag = cover.length && !holds ? '⛔ COVERS the point the item does not hold' : holds ? 'holds the point' : 'ok'
  console.log(`${g}#${it.idx}: outer ${it.outer.length} v, ${it.holes.length} hole(s) · ${tris.length} tris · ${flag}${cover.length ? ` (${cover.length} tri(s))` : ''} · hole vertices ON the outer ${onOuter} · shared between holes ${holeHole} · repeated ${repeated}`)
  if (cover.length && !holds) for (const [a, b, c] of cover.slice(0, 3)) console.log(`     tri ${[a, b, c].map(i => `(${all[i][0].toFixed(3)}, ${all[i][1].toFixed(3)})`).join(' ')}`)
}
