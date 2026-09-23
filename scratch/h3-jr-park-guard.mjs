// READ-ONLY probe (H-3 JR ruling, 2026-09-23): junction-residual candidates WITH and WITHOUT the park guard.
// JR = a frozen tile whose ring passes within 1 m of an AT-GRADE ramp terminal and holds zero MSBF building centroids.
// Guard (Jacob): lu ∈ {park, recreation} → stays a block. ⛔ lu 'underived' is a SENTINEL, not a value — counted apart.
import fs from 'node:fs'
const towns = process.argv.slice(2).length ? process.argv.slice(2) : ['huron', 'lafayette-square']
const GUARD = new Set(['park', 'recreation'])
const pip = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
for (const t of towns) {
  const skP = `cartograph/data/${t}/clean/skeleton.json`, shP = `public/baked/${t}/shape.json`
  const sk = JSON.parse(fs.readFileSync(skP)).streets, sh = JSON.parse(fs.readFileSync(shP))
  const K = p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`, town = new Set(), term = []
  for (const s of sk) if (!s.gradeSeparated) for (const p of s.points) town.add(K(p))
  for (const s of sk) if (s.gradeSeparated) for (const p of [s.points[0], s.points.at(-1)]) if (town.has(K(p))) term.push([p.x, p.z])
  const bld = JSON.parse(fs.readFileSync(`cartograph/data/${t}/raw/msbf.json`)).buildings.map(b => [b.coords.reduce((s, q) => s + q.x, 0) / b.coords.length, b.coords.reduce((s, q) => s + q.z, 0) / b.coords.length])
  const jr = []
  sh.tiles.forEach((tl, i) => { const ring = Array.isArray(tl.ring?.[0]?.[0]) ? tl.ring[0] : tl.ring; if (!ring) return
    if (!term.some(q => ring.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1))) return
    if (bld.some(b => pip(b, ring))) return
    const c = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]
    jr.push({ i, lu: tl.lu, c }) })
  const guarded = jr.filter(x => GUARD.has(x.lu)), sentinel = jr.filter(x => x.lu === 'underived' || x.lu == null)
  console.log(`${t} [skeleton ${fs.statSync(skP).mtime.toISOString()} · shape ${fs.statSync(shP).mtime.toISOString()}] JR without guard ${jr.length} · with guard ${jr.length - guarded.length} (guard keeps ${guarded.length} as blocks) · ⛔ lu SENTINEL on ${sentinel.length}`)
  for (const x of jr) console.log(`   tile ${x.i} @(${x.c.map(v => v.toFixed(0)).join(',')}) lu=${x.lu}${GUARD.has(x.lu) ? '  → BLOCK (guard)' : ''}`)
}
