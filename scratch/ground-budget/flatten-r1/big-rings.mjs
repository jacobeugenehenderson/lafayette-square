// big-rings.mjs — for each ring whose role differs between the HEAD and branch flatten dumps (above a floor), its winding,
// HEAD's parent's winding, and where its vertices lie against HEAD's parent and against the branch's parent.
// Reads only.   node big-rings.mjs <HEAD dump> <branch dump> [floor m² = 0.01]
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const C = createRequire('/Users/jacobhenderson/Desktop/lafayette-square.nosync/package.json')('clipper-lib')
const [fa, fb, fl = '0.01'] = process.argv.slice(2), a = JSON.parse(readFileSync(fa, 'utf8')), b = JSON.parse(readFileSync(fb, 'utf8')), S = 1000
const path = (r) => r.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) }))
const parents = (items) => { const m = new Map(); for (const it of items) { if (Array.isArray(it)) continue; const ok = JSON.stringify(it.outer); if (!m.has(ok)) m.set(ok, null); for (const h of it.holes || []) m.set(JSON.stringify(h), ok) } return m }
const rel = (outerKey, ring) => { if (!outerKey) return 'root'; const o = path(JSON.parse(outerKey)); let i = 0, on = 0, x = 0; for (const p of path(ring)) { const r = C.Clipper.PointInPolygon(p, o); r === 1 ? i++ : r === -1 ? on++ : x++ }
  return `${C.Clipper.Area(o) > 0 ? '+' : '−'} ${(Math.abs(C.Clipper.Area(o)) / S / S).toFixed(1)} m², ${i}/${on}/${x} in/on/out` }
for (const k of Object.keys(a)) { const pa = parents(a[k] || []), pb = parents(b[k] || [])
  for (const key of new Set([...pa.keys(), ...pb.keys()])) { if (pa.get(key) === pb.get(key)) continue
    const ring = JSON.parse(key), sa = C.Clipper.Area(path(ring)) / S / S; if (Math.abs(sa) < +fl) continue
    console.log(`${k}: ring ${ring.length} v, signed ${sa.toFixed(3)} m² at (${ring[0][0].toFixed(1)}, ${ring[0][1].toFixed(1)}) · HEAD parent [${rel(pa.get(key), ring)}] · branch parent [${rel(pb.get(key), ring)}]`) } }
