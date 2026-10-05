// Forensic (Sward, 2026-10-04): what the sum→union change in luCoverageForFace moves, per town,
// WITHOUT a pour. Re-runs the face vote on each town's last-poured faces (ribbons.json) with the
// OLD per-feature SUM (inlined below, verbatim logic of HEAD) and the LIVE union (imported), then
// carries each change through to the baked tiles by luForRing's rule (smallest face holding the
// tile's interior point). A face is counted as "OSM-voted" when the OLD vote reproduces its poured
// `use` — the rest were decided by parcels / overrides and the vote never reached them.
// Usage: node scratch/huron-median-lu/union-before-after.mjs
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { OSM_TO_LU, luCoverageForFace, luWinnerFromCoverage } from '../../cartograph/derive.js'
import { unreadableFace } from '../../cartograph/osm-vocabulary.mjs'
const { Clipper, ClipType, PolyType, PolyFillType, Paths, IntPoint } = clipperLib
const SCALE = 1000, toC = (x, z) => new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE))
const _src = fs.readFileSync('cartograph/derive.js', 'utf8'), _m = _src.slice(_src.indexOf('const OSM_LU_DECLARED = {'))
const DECLARED = new Set([..._m.slice(0, _m.indexOf('\n  }')).matchAll(/'([a-z_]+:[a-z_]+)'/g)].map(x => x[1]))
function oldCoverage(faceRing, luPolys) { // HEAD's luCoverageForFace: overlap SUMMED per feature
  const out = {}; let b = [Infinity, -Infinity, Infinity, -Infinity]
  for (const p of faceRing) { const x = p[0] ?? p.x, z = p[1] ?? p.z; b = [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)] }
  const fp = faceRing.map(p => toC(p[0] ?? p.x, p[1] ?? p.z))
  for (const o of luPolys) {
    if (o.bb[0] > b[1] || o.bb[1] < b[0] || o.bb[2] > b[3] || o.bb[3] < b[2]) continue
    const c = new Clipper(); c.AddPath(fp, PolyType.ptSubject, true)
    c.AddPath(o.ring.map(q => toC(q.x ?? q[0], q.z ?? q[1])), PolyType.ptClip, true)
    for (const h of o.holes || []) c.AddPath(h.map(q => toC(q.x ?? q[0], q.z ?? q[1])), PolyType.ptClip, true)
    const sol = new Paths(); if (!c.Execute(ClipType.ctIntersection, sol, PolyFillType.pftNonZero, PolyFillType.pftEvenOdd)) continue
    let a = 0; for (const p of sol) a += Clipper.Area(p) / (SCALE * SCALE); a = Math.abs(a)
    if (a > 0) { const e = out[o.tag] || (out[o.tag] = { lu: o.lu, area: 0 }); e.area += a }
  }
  return out
}
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j].x ?? r[j][0]) * (r[i].z ?? r[i][1]) - (r[i].x ?? r[i][0]) * (r[j].z ?? r[j][1]); return Math.abs(a / 2) }
const pip = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i].x ?? r[i][0], zi = r[i].z ?? r[i][1], xj = r[j].x ?? r[j][0], zj = r[j].z ?? r[j][1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins } return ins }
function ringInteriorPoint(r) { let cx = 0, cy = 0; for (const p of r) { cx += p[0]; cy += p[1] }; cx /= r.length; cy /= r.length; if (pip(cx, cy, r)) return [cx, cy]; const a = r[0], b = r[1 % r.length], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; for (let i = 0; i < r.length; i++) { const t = i / r.length, px = mx + (cx - mx) * t, py = my + (cy - my) * t; if (pip(px, py, r)) return [px, py] } return [cx, cy] }
const TOWNS = [['lafayette-square', 'src/data/ribbons.json'], ['lafayette-square-staging'], ['hipointedemun'], ['huron'], ['provincetown'], ['altadena']]
for (const [town, ribPath = `cartograph/data/${town}/clean/ribbons.json`] of TOWNS) {
  const osm = JSON.parse(fs.readFileSync(`cartograph/data/${town}/raw/osm.json`)), rib = JSON.parse(fs.readFileSync(ribPath))
  const polys = []; let sameTagOverlapTags = new Set()
  for (const [cat, key] of [['landuse', 'landuse'], ['leisure', 'leisure'], ['natural', 'natural'], ['amenity', 'amenity']])
    for (const f of (osm.ground?.[cat] || [])) {
      const sub = f.tags?.[key]; if (!sub) continue
      const u = unreadableFace(f); if (u && u !== 'compound') continue
      const tag = `${cat}:${sub}`; if (DECLARED.has(tag)) continue
      const lu = OSM_TO_LU[tag]; if (!lu || !f.coords || f.coords.length < 3) continue
      let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const p of f.coords) b = [Math.min(b[0], p.x), Math.max(b[1], p.x), Math.min(b[2], p.z), Math.max(b[3], p.z)]
      polys.push({ lu, tag, ring: f.coords, holes: (f.holes || []).filter(h => Array.isArray(h) && h.length >= 3), bb: b })
    }
  const faces = (rib.faces || []).filter(f => f?.ring?.length >= 3 && f.use)
  let voted = 0, changed = [], changedOther = 0
  const newUse = faces.map(f => f.use)
  faces.forEach((f, i) => {
    const o = luWinnerFromCoverage(oldCoverage(f.ring, polys)), n = luWinnerFromCoverage(luCoverageForFace(f.ring, polys))
    if (o && o === f.use) voted++
    if (o !== n) { if (o === f.use) { changed.push({ i, from: o, to: n ?? '(no OSM vote → parcels/underived)', ha: A(f.ring) / 1e4 }); newUse[i] = n ?? f.use } else { changedOther++; console.log(`   (other) face ${i} poured=${f.use} old=${o} new=${n} ${(A(f.ring)/1e4).toFixed(2)} ha`) } }
  })
  const tot = {}; for (const c of changed) { const k = `${c.from} → ${c.to}`; (tot[k] ||= { n: 0, ha: 0 }); tot[k].n++; tot[k].ha += c.ha }
  // carry to the baked tiles
  let tileMoves = []
  const shapeP = `public/baked/${town}/shape.json`
  if (changed.length && fs.existsSync(shapeP)) {
    const tiles = JSON.parse(fs.readFileSync(shapeP)).tiles || []
    const moved = new Set(changed.map(c => c.i))
    tiles.forEach((t, ti) => {
      if (!t.ring || t.ring.length < 3) return
      const [px, pz] = ringInteriorPoint(t.ring); let best = -1, ba = Infinity
      faces.forEach((f, i) => { if (pip(px, pz, f.ring)) { const a = A(f.ring); if (a < ba) { ba = a; best = i } } })
      if (moved.has(best) && t.lu === faces[best].use) tileMoves.push(`tile ${ti} ${(A(t.ring) / 1e4).toFixed(1)} ha ${t.lu} → ${newUse[best]}`)
    })
  }
  console.log(`\n${town}: ${faces.length} faces, ${voted} OSM-voted (old vote reproduces poured use), ${polys.length} LU features`)
  console.log(`   faces whose vote CHANGES: ${changed.length}` + (changedOther ? ` (+${changedOther} where the vote changes but the poured use came from elsewhere — no effect)` : ''))
  for (const [k, v] of Object.entries(tot)) console.log(`      ${k}: ${v.n} face(s), ${v.ha.toFixed(2)} ha`)
  for (const m of tileMoves) console.log(`      ⇒ baked ${m}`)
}
