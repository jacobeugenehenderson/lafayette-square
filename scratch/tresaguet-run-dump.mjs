// Dump per-run meta (skelId, side, segOrd, resolved width, poly span) for runs
// near the artifact sites — names the culprit width per run.
import { R, build } from './tresaguet-setup.mjs'
const g = build()
const SITES = [
  { name: 'mackay-wedge', at: [10, -390], r: 60 },
  { name: 'waverly-step', at: [-44.8, 177.8], r: 60 },
  { name: 'missY-step', at: [173.0, 203.9], r: 40 },
  { name: 'park4-bump', at: [-400.2, -252.3], r: 50 },
]
const near = (poly, c, r) => poly.some(p => Math.hypot(p[0] - c[0], p[1] - c[1]) < r)
for (const S of SITES) {
  console.log('\n══', S.name, S.at)
  g._perRunMeta.forEach((runs, ti) => {
    for (const rm of runs) {
      if (!near(rm.poly, S.at, S.r)) continue
      const w = rm.measure?.[rm.side]?.pavementHW
      const p0 = rm.poly[0], p1 = rm.poly[rm.poly.length - 1]
      console.log(`  tile#${ti} ${rm.skelId}/${rm.side} segOrd=${rm.segOrd} hw=${(w ?? 0).toFixed(2)} n=${rm.poly.length} (${p0[0].toFixed(0)},${p0[1].toFixed(0)})→(${p1[0].toFixed(0)},${p1[1].toFixed(0)})`)
    }
  })
}
