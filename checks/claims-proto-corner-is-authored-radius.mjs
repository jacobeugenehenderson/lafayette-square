// ⛔ AN AUTHORED FEATURE IS CHECKED BY DIMENSION (`RIBBONS §1`). The corner radius is authored, so
// the gate is: does ②'s eased contour actually turn at the radius the operator asked for?
// Measured as the circumradius of consecutive triples along the curb — a straight leg reads huge,
// an arc reads its radius. ⛔ Compared to the AUTHORED value, never to a hard-coded 4.5.
// ▶ node checks/claims-proto-corner-is-authored-radius.mjs [scene ...]
import fs from 'fs'
import { feed, buildProto } from '../scratch/_proto-feed.mjs'

for (const scene of (process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square'])) {
  const f = feed(scene); if (!f || f.curbWidth == null) continue
  const design = JSON.parse(fs.readFileSync(`public/looks/${f.look}/design.json`, 'utf8'))
  const scale = Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1
  const baseR = 4.5 * scale                       // the class seed × the operator's dial
  const nIx = Object.keys(design.cornerRadiusOverrides || {}).length
  const nCorner = Object.keys(design.cornerCornerRadiusOverrides || {}).length
  const tg = buildProto(f, { protoProducer: true, cornerRadiusScale: scale,
    cornerRadiusOverrides: design.cornerRadiusOverrides, cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides })
  const rings = tg.protoCurb || []
  const circum = (a, b, c) => {
    const A = Math.hypot(b[0]-c[0], b[1]-c[1]), B = Math.hypot(a[0]-c[0], a[1]-c[1]), C = Math.hypot(a[0]-b[0], a[1]-b[1])
    const s = Math.abs((b[0]-a[0])*(c[1]-a[1]) - (c[0]-a[0])*(b[1]-a[1])) / 2
    return s > 1e-12 ? (A*B*C) / (4*s) : Infinity
  }
  const arc = []
  let verts = 0
  for (const r of rings) {
    const n = r.length
    for (let i = 0; i < n; i++) { verts++
      const R = circum(r[(i-1+n)%n], r[i], r[(i+1)%n])
      if (Number.isFinite(R) && R < 50) arc.push(R)          // a leg vertex reads hundreds of m
    }
  }
  arc.sort((x, y) => x - y)
  const q = (fr) => arc.length ? arc[Math.floor(fr * (arc.length - 1))].toFixed(2) : 'n/a'
  console.log(`${scene}: ${rings.length} curb ring(s), ${verts} vertices`)
  console.log(`  authoring: cornerRadiusScale ${scale} · per-IX overrides ${nIx} · per-corner overrides ${nCorner}`)
  console.log(`  class seed R = ${baseR.toFixed(2)} m`)
  console.log(`  ARC vertices (local radius < 50 m): ${arc.length}`)
  console.log(`    p10 ${q(0.1)} · median ${q(0.5)} · p90 ${q(0.9)} m`)
  const near = arc.filter(x => Math.abs(x - baseR) / baseR < 0.25).length
  console.log(`    within 25% of the authored radius: ${near}/${arc.length} (${arc.length ? (100*near/arc.length).toFixed(0) : 0}%)`)
  if (!arc.length) console.log(`  ⛔ NO ARC ANYWHERE — the contour is sharp. The ease did not run, or every corner resolved R=0.`)
}
