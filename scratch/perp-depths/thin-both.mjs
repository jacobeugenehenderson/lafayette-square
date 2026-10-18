// thin-both.mjs <scene> — thin WALK and thin LAWN within 8 m of each junction corner (the curb-cut check's opening: mitred,
// 25 mm, mean width ≥ 3 mm, > 2 cm²), BEFORE (painter at 20d3529f, written by render.mjs to scratch/perp-depths-out/) vs
// AFTER (this tree) vs DIAGONAL (this tree), each counted only where the diagonal map has none at the same place (± 0.5 m).
// Also the "walk behind a cut" probe split by the corner's wedge. Read-only; through the shared feed, authoring loaded.
import clipperLib from 'clipper-lib'
import { pathToFileURL } from 'url'
import { feed } from '../_proto-feed.mjs'
import { intersectRings } from '../../src/lib/buildBlockGeometryV2.js'
const scene = process.argv[2] || 'huron', f = feed(scene), norm = f.ribbons.curbCutNorm
const before = (await import(pathToFileURL(`${process.cwd()}/scratch/perp-depths-out/tileGround.base.mjs`).href)).buildTileGround
const after = (await import('../../src/lib/tileGround.js')).buildTileGround
const build = (fn, nm) => { const prev = console.log; console.log = () => {}
  try { return fn({ ...f.ribbons, curbCutNorm: nm }, { grout: 'proto', smooth: 0, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse,
    cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale, protoProducer: true }) } finally { console.log = prev } }
const { ClipperOffset, Clipper, JoinType, EndType, ClipType, PolyType, PolyFillType } = clipperLib, S = 1000, D = 0.025
const toC = (rs) => rs.filter(r => r.length >= 3).map(r => r.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) })))
const offs = (ps, d) => { const co = new ClipperOffset(10, 0.25); co.AddPaths(ps, JoinType.jtMiter, EndType.etClosedPolygon); const o = []; co.Execute(o, d * S); return o }
const sa = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p2 = r[i], q2 = r[(i + 1) % r.length]; a += p2[0] * q2[1] - q2[0] * p2[1] } return a / 2 }
const open = (rings) => { const P = toC(rings); if (!P.length) return []
  const c = new Clipper(); c.AddPaths(P, PolyType.ptSubject, true); c.AddPaths(offs(offs(P, -D), D), PolyType.ptClip, true); const o = []
  c.Execute(ClipType.ctDifference, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return o.map(p => p.map(q => [q.X / S, q.Y / S])).filter(r => sa(r) > 0).map(r => { let L = 0; for (const a of r) for (const b of r) L = Math.max(L, Math.hypot(a[0] - b[0], a[1] - b[1]))
    const A = sa(r); return { area: A, len: L, w: L ? 2 * A / L : 0, at: r.reduce((s2, p2) => [s2[0] + p2[0] / r.length, s2[1] + p2[1] / r.length], [0, 0]) } }).filter(x => x.area > 2e-4 && x.w >= 0.003) }
const thinNear = (R, rings) => { const seen = new Set(), out = []
  for (const c of R.curbCutCorners || []) { const [x0, z0] = c.at, win = [[x0 - 12, z0 - 12], [x0 + 12, z0 - 12], [x0 + 12, z0 + 12], [x0 - 12, z0 + 12]]
    for (const x of open(intersectRings(rings.filter(r => r.some(([x, z]) => Math.abs(x - x0) < 40 && Math.abs(z - z0) < 40)), [win]))) {
      if (Math.hypot(x.at[0] - x0, x.at[1] - z0) > 8) continue
      const k = x.at.map(v => v.toFixed(1)).join(); if (!seen.has(k)) { seen.add(k); out.push({ ...x, wedge: c.wedge ?? null }) } } }
  return out }
const lawnOf = (R) => Object.values(R.treelawnByLu || {}).flat()
const Rd = build(after, { ...norm, style: 'diagonal' }), dW = thinNear(Rd, Rd.sidewalk || []), dL = thinNear(Rd, lawnOf(Rd))
const notIn = (a, b) => a.filter(x => !b.some(y => Math.hypot(y.at[0] - x.at[0], y.at[1] - x.at[1]) < 0.5))
const by = (a, k) => a.reduce((o, r) => { o[r[k]] = (o[r[k]] || 0) + 1; return o }, {})
console.log(`${scene} diagonal: thin walk ${dW.length} · thin lawn ${dL.length}`)
for (const [tag, fn] of [['before', before], ['after', after]]) { const R = build(fn, norm)
  const w = notIn(thinNear(R, R.sidewalk || []), dW), l = notIn(thinNear(R, lawnOf(R)), dL)
  console.log(`${scene} ${tag}: perpendicular-only thin WALK ${w.length} ${JSON.stringify(by(w, 'wedge'))} · thin LAWN ${l.length} ${JSON.stringify(by(l, 'wedge'))}`)
  console.log(`   lawn sites: ${l.slice(0, 12).map(x => `(${x.at[0].toFixed(1)}, ${x.at[1].toFixed(1)}) ${x.len.toFixed(2)} m × ${(x.w * 1000).toFixed(0)} mm`).join(' · ')}`) }
