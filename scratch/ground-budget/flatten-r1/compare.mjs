// compare.mjs — the flatten-r1 tolerance gates on two flatten dumps (prep.mjs's copies), HEAD vs the branch, per group:
//  · BYTE: are the group's items identical as JSON?
//  · AREA ON THE LATTICE: the region each version's items define (each item: outer − its holes, Clipper NonZero on the
//    1 mm grid; the group: the union of its items), and the area of their symmetric difference (XOR), in grid units² —
//    0 is equal on the lattice.
//  · NESTING: every ring by its exact points → its role (root outer, or hole/child of which ring); the rings whose role
//    differs, with their areas, and how many of them HEAD's tree had OUTSIDE their outer (the first vertex not ON the
//    outer lies outside it).
// Reads only.   node compare.mjs <HEAD dump> <branch dump>
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const C = createRequire('/Users/jacobhenderson/Desktop/lafayette-square.nosync/package.json')('clipper-lib')
const S = 1000
const [a, b] = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8')))
const path = (r) => r.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) }))
const region = (items) => { const u = new C.Clipper()
  for (const it of items) { const outer = Array.isArray(it) ? it : it.outer, holes = Array.isArray(it) ? [] : (it.holes || [])
    if (!outer || outer.length < 3) continue
    const c = new C.Clipper(); c.AddPath(path(outer), C.PolyType.ptSubject, true); for (const h of holes) if (h.length >= 3) c.AddPath(path(h), C.PolyType.ptClip, true)
    const o = new C.Paths(); c.Execute(C.ClipType.ctDifference, o, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero); u.AddPaths(o, C.PolyType.ptSubject, true) }
  const out = new C.Paths(); u.Execute(C.ClipType.ctUnion, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero); return out }
const areaOf = (ps) => ps.reduce((s, q) => s + C.Clipper.Area(q), 0)
const xorArea = (p, q) => { const c = new C.Clipper(); c.AddPaths(p, C.PolyType.ptSubject, true); c.AddPaths(q, C.PolyType.ptClip, true)
  const o = new C.Paths(); c.Execute(C.ClipType.ctXor, o, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero); return Math.abs(areaOf(o)) }
const roles = (items) => { const m = new Map()
  for (const it of items) { if (Array.isArray(it)) continue; const ok = JSON.stringify(it.outer)
    if (!m.has(ok)) m.set(ok, 'root-or-island')
    for (const h of it.holes || []) m.set(JSON.stringify(h), 'hole-of ' + ok) }
  return m }
const outside = (outer, hole) => { const o = path(outer); for (const p of path(hole)) { const r = C.Clipper.PointInPolygon(p, o); if (r !== -1) return r === 0 } return false }
let tot = { groups: 0, byteDiff: 0, xorUnits: 0, ringDiff: 0, ringArea: 0, outsideInHead: 0 }
for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
  const A = a[k] || [], B = b[k] || []; tot.groups++
  const same = JSON.stringify(A) === JSON.stringify(B); if (same) continue; tot.byteDiff++
  const x = xorArea(region(A), region(B)), ra = roles(A), rb = roles(B)
  let n = 0, ar = 0, out = 0; const ex = []
  for (const key of new Set([...ra.keys(), ...rb.keys()])) { if (ra.get(key) === rb.get(key)) continue
    n++; const ring = JSON.parse(key), area = Math.abs(C.Clipper.Area(path(ring))) / S / S; ar += area
    const hr = ra.get(key); const wasOut = hr?.startsWith('hole-of ') && outside(JSON.parse(hr.slice(8)), ring); if (wasOut) out++
    if (ex.length < 4) ex.push(`${ring.length} v ${area.toFixed(6)} m² at (${ring[0][0].toFixed(2)}, ${ring[0][1].toFixed(2)}) · HEAD ${hr ? hr.split(' ')[0] : 'absent'} → branch ${rb.get(key)?.split(' ')[0] ?? 'absent'}${wasOut ? ' · HEAD had it OUTSIDE its outer' : ''}`) }
  tot.xorUnits += x; tot.ringDiff += n; tot.ringArea += ar; tot.outsideInHead += out
  console.log(`  ${k}: items ${A.length} → ${B.length} · XOR ${x} grid units² (${(x / S / S).toFixed(6)} m²) · rings with another role ${n} (${ar.toFixed(6)} m²) · HEAD had ${out} outside their outer`)
  for (const e of ex) console.log(`      ${e}`) }
console.log(`[compare] ${tot.groups} groups · ${tot.byteDiff} not byte-identical · XOR total ${tot.xorUnits} grid units² (${(tot.xorUnits / S / S).toFixed(6)} m²) · ${tot.ringDiff} ring(s) with another role (${tot.ringArea.toFixed(6)} m²) · ${tot.outsideInHead} of them HEAD had outside their outer`)
console.log(tot.xorUnits === 0 ? '✅ painted area per group EQUAL on the lattice' : '⛔ painted area per group DIFFERS on the lattice')
