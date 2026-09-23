// READ-ONLY probe (H-3 Q8, 2026-09-23): what are the regions at AT-GRADE RAMP TERMINALS?
// Terminal = a gradeSeparated chain endpoint that shares a vertex with a non-gs street (skeleton).
// For each frozen tile (shape.json) whose ring passes within 1 m of a terminal: area, perimeter, 2A/P (≈ a mean
// half-thickness), gs share of perimeter, and how many MSBF building centroids sit inside (frontage evidence).
import fs from 'node:fs'
const towns = process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square', 'huron']
const A = r => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return Math.abs(a / 2) }
const Per = r => r.reduce((s, p, i) => s + Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1]), 0)
const L = p => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s }
const pip = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
for (const t of towns) {
  const skP = `cartograph/data/${t}/clean/skeleton.json`, shP = `public/baked/${t}/shape.json`
  const sk = JSON.parse(fs.readFileSync(skP)).streets, sh = JSON.parse(fs.readFileSync(shP))
  const gsId = new Set(sk.filter(s => s.gradeSeparated).map(s => s.id))
  const K = p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`, town = new Set()
  for (const s of sk) if (!s.gradeSeparated) for (const p of s.points) town.add(K(p))
  const term = []
  for (const s of sk) if (s.gradeSeparated) for (const p of [s.points[0], s.points.at(-1)]) if (town.has(K(p))) term.push([p.x, p.z])
  const bld = JSON.parse(fs.readFileSync(`cartograph/data/${t}/raw/msbf.json`)).buildings.map(b => { const c = b.coords; return [c.reduce((s, q) => s + q.x, 0) / c.length, c.reduce((s, q) => s + q.z, 0) / c.length] })
  console.log(`${t} [skeleton ${fs.statSync(skP).mtime.toISOString()} · shape ${fs.statSync(shP).mtime.toISOString()}] at-grade terminals ${term.length}`)
  const seen = new Set()
  sh.tiles.forEach((tl, i) => {
    const ring = Array.isArray(tl.ring?.[0]?.[0]) ? tl.ring[0] : tl.ring; if (!ring) return
    if (!term.some(q => ring.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1))) return
    if (seen.has(i)) return; seen.add(i)
    const runs = (tl.runs || []).filter(x => x.skelId && !/^__/.test(x.skelId)), gl = runs.reduce((s, r) => s + (gsId.has(r.skelId) ? L(r.poly || []) : 0), 0), al = runs.reduce((s, r) => s + L(r.poly || []), 0)
    const a = A(ring), P = Per(ring), nb = bld.filter(b => pip(b, ring)).length
    console.log(`   tile ${i}: ${Math.round(a)} m² · 2A/P ${(2 * a / P).toFixed(1)} m · gs perim ${(gl / (al || 1)).toFixed(2)} · buildings ${nb} · ${[...new Set(runs.map(r => r.skelId + (gsId.has(r.skelId) ? '*' : '')))].join(' ')}`.slice(0, 260))
  })
}
