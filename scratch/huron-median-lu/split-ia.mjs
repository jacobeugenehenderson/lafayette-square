// Forensic (Sward): every tile whose iA has >1 component, or whose runs include __highway__/motorway:
// per iA component — area, perimeter, mean width (2A/P), and the skelIds of the runs bounding it.
import fs from 'fs'
const s = JSON.parse(fs.readFileSync('public/baked/huron/shape.json'))
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const Pm = r => { let p = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) p += Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]); return p }
const pip = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins } return ins }
s.tiles.forEach((t, i) => {
  const sk = new Set(t.runs.map(r => r.skelId))
  if (![...sk].some(k => /highway|motorway/.test(k))) return
  console.log(`tile ${i} lu=${t.lu} ring ${(Math.abs(A(t.ring)) / 1e4).toFixed(2)} ha, ${t.iA.length} iA comp(s)`)
  for (const r of t.iA) {
    const a = A(r); if (Math.abs(a) < 500) continue
    // which runs have their poly's first vertex inside / on this component
    const own = t.runs.filter(u => u.poly.some(p => r.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.01))).map(u => u.skelId)
    console.log(`   comp ${(a / 1e4).toFixed(2)} ha  P=${Pm(r).toFixed(0)} m  meanW=${(2 * Math.abs(a) / Pm(r)).toFixed(1)} m  runs=${[...new Set(own)].join(',')}`)
  }
})
