// classify.mjs — every UNSTAMPED ② vertex (a frozen tile's iaStamp null) walked back to the stage where its label went
// null, from run.sh's dump (tileGround.audit.js probes). Exact coordinates join the stages (the booleans re-emit an
// unchanged vertex at its own coordinates; a vertex no stage lists was minted later — said so).
//   node scratch/ground-budget/stamp-audit/classify.mjs stamp-<town>.json <ribbons.json> [--show=n]
import { readFileSync } from 'fs'
const [file, ribFile] = process.argv.slice(2), SHOW = +(process.argv.find(a => a.startsWith('--show='))?.split('=')[1] || 6)
const A = JSON.parse(readFileSync(file, 'utf8')), rib = JSON.parse(readFileSync(ribFile, 'utf8'))
const gs = new Set((rib.streets || []).filter(s => s.gradeSeparated).map(s => s.skelId ?? s.name))
const key = (x, z) => `${x},${z}`
const at = new Map()
for (const [st, L] of Object.entries(A.stages || {})) for (const [x, z, k, why] of L) { const q = key(x, z); if (!at.has(q)) at.set(q, []); at.get(q).push(`${st}${why === 'refused' ? '(refused)' : why === 'ring-unlabelled' ? '(ring unlabelled)' : ''}`) }
const walk = new Map(); for (const w of A.walk || []) walk.set(key(w[0], w[1]), w)
const ORDER = ['offset', 'holeDifference', 'highwayDifference']
const cls = new Map(), sites = []
let total = 0, all = 0
for (const t of A.tiles || []) {
  const c = t.ring.reduce((s, q) => [s[0] + q[0] / t.ring.length, s[1] + q[1] / t.ring.length], [0, 0])
  ;(t.iaFull || []).forEach((ring, ri) => { const st = t.iaStamp?.[ri] || [], arc = t.iaArc?.[ri] || [], n = ring.length
    ring.forEach((p, i) => { all++; if (st[i] != null) return; total++
      const w = walk.get(key(p[0], p[1])), stages = at.get(key(p[0], p[1])) || []
      let c1 = w ? w[3] : 'not seen at the walk'
      if (c1 === 'label-null') { const first = ORDER.find(s => stages.some(x => x.startsWith(s))); c1 = `label null since the ${first ? stages.find(x => x.startsWith(first)) : 'UNLISTED stage (minted after the highway difference)'}` }
      if (c1 === 'cap') c1 = 'cap edge (declined as frontage)'
      c1 += arc[i] != null ? ' · on an arc' : ''
      cls.set(c1, (cls.get(c1) || 0) + 1)
      sites.push({ p, c, ri, c1, w })
    }) })
}
console.log(`${file}: ${total} unstamped ② vertices of ${all}`)
for (const [k, v] of [...cls].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`)
// clustering by tile (named by its ① ring's centre)
const byTile = new Map(); for (const s of sites) { const k = `(${s.c[0].toFixed(1)}, ${s.c[1].toFixed(1)})`; byTile.set(k, (byTile.get(k) || 0) + 1) }
console.log(`  in ${byTile.size} tile(s); most: ${[...byTile].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
const capRuns = new Map(); for (const s of sites) if (s.w?.[3] === 'cap') { const k = `${s.w[5]}`; capRuns.set(k, (capRuns.get(k) || 0) + 1) }
if (capRuns.size) console.log(`  cap edges by chain: ${[...capRuns].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}${gs.has(k) ? ' (grade-sep)' : ''} ${v}`).join(' · ')}`)
for (const s of sites.slice(0, SHOW)) console.log(`   (${s.p[0].toFixed(3)}, ${s.p[1].toFixed(3)}) · tile at ${s.c[0].toFixed(1)}, ${s.c[1].toFixed(1)} · ② ring ${s.ri} · ${s.c1}`)
