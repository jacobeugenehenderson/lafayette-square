// frag.mjs — the HPDM window's conformed triangles around P (window2-tj.json), through the welded and the exact detector.
import { readFileSync } from 'fs'
import * as B from './groundConformity.base.js'
import * as N from '/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/hpdm-gate/cartograph/groundConformity.js'
const rep = JSON.parse(readFileSync('/Users/jacobhenderson/Desktop/lafayette-square.nosync/scratch/ground-budget/hpdm-gate/window2-tj.json', 'utf8'))
const f = rep[1].variants.base.findings[0], R = Number(process.argv[2] || 0.01)
const tris = f.tris.filter(t => t.v.some(v => Math.hypot(v[0] - f.x, v[1] - f.z) < R))
const groups = [...new Set(tris.map(t => t.g))].map(id => { const ts = tris.filter(t => t.g === id), pos = [], idx = [], m = new Map()
  for (const t of ts) for (const v of t.v) { const k = v.join(','); if (!m.has(k)) { m.set(k, pos.length / 3); pos.push(v[0], 0, v[1]) } idx.push(m.get(k)) }
  return { id, positions: new Float32Array(pos), indices: new Uint32Array(idx) } })
for (const [n, D] of [['welded', B], ['exact', N]]) { const r = D.findTJunctions(groups); console.log(n, r.total, r.found.map(x => `(${x.x}, ${x.z}) ${x.vertexGroup}→${x.edgeGroup}`).join(' · ')) }
console.log(JSON.stringify(groups.map(g => ({ id: g.id, positions: [...g.positions], indices: [...g.indices] }))).length, 'bytes')
