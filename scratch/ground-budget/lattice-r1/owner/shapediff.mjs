// shapediff.mjs <before cap> <after cap> — where two captures' frozen tiles differ: per tile (matched by its ① ring's first
// vertex), the iaFull / iA vertices present in one and not the other.
import { readFileSync } from 'fs'
const [A, B] = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8')))
const byR = (D) => new Map(D.tiles.map(t => [t.ring0.join(','), t]))
const a = byR(A), b = byR(B); let diff = 0
for (const [k, t] of a) { const u = b.get(k); if (!u) { console.log('tile gone', k); diff++; continue }
  for (const f of ['iaFull', 'iA']) { const sa = new Set(t[f].flat().map(v => v.join(','))), sb = new Set(u[f].flat().map(v => v.join(',')))
    const only = (x, y) => [...x].filter(v => !y.has(v))
    const oa = only(sa, sb), ob = only(sb, sa); if (oa.length || ob.length) { diff++; console.log(`tile ${k} ${f}: ${oa.length} only before, ${ob.length} only after · e.g. ${oa.slice(0, 2).join(' ; ')} | ${ob.slice(0, 2).join(' ; ')}`) } } }
console.log(diff ? `${diff} differences` : 'identical tiles')
