// At each dumped T-junction: is the vertex a BOUNDARY vertex (on an edge one triangle uses) when vertices are told apart
// by their exact float32 coordinates (as conformAndRefine's closer sees them: refinement midpoints are never welded),
// and when they are welded on the 1 mm lattice (as findTJunctions sees them)? And which other dumped vertices share its
// 1 mm weld key. Only triangles within 0.5 m are dumped, so an edge count here is exact for edges near the vertex. Read-only.
import { readFileSync } from 'node:fs'
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const wk = (x, z) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`
const ex = (x, z) => `${x},${z}`
for (const f of d.found) {
  const res = {}
  for (const [lab, key] of [['exact', ex], ['welded 1 mm', wk]]) {
    const cnt = new Map()
    for (const t of f.tris) for (let k = 0; k < 3; k++) {
      const a = key(...t.v[k]), b = key(...t.v[(k + 1) % 3]); if (a === b) continue
      const e = a < b ? a + '|' + b : b + '|' + a; cnt.set(e, (cnt.get(e) || 0) + 1)
    }
    const me = key(f.x, f.z)
    const inc = [...cnt].filter(([e]) => e.split('|').includes(me))
    res[lab] = `${inc.length} incident edge(s), ${inc.filter(([, n]) => n === 1).length} used once → ${inc.some(([, n]) => n === 1) ? 'BOUNDARY' : 'interior'}`
  }
  const same = [...new Set(f.tris.flatMap(t => t.v).filter(v => wk(...v) === wk(f.x, f.z)).map(v => `(${v[0]}, ${v[1]})`))]
  console.log(`■ (${f.x.toFixed(3)}, ${f.z.toFixed(3)}) · exact: ${res.exact} · welded: ${res['welded 1 mm']}`)
  console.log(`   vertices sharing its 1 mm weld key: ${same.join(' · ')}`)
}
