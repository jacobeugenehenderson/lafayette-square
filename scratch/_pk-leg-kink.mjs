// Do the park's legs KINK on the way into the junction?
// `SKELETON §5h` (2026-07-22) says LS has ONE kinked tip (`geyer-avenue-2`) and
// "the four park corners are UNTOUCHED — they run straight in, no kink". That is a
// claim about a map Jacob has re-authored and re-baked many times since. Re-measure.
//
// The test is §5h's own: the angle between a leg's TIP approach and its BODY
// prevailing direction. `OVL_KINK_DEG = 30°` (derive.js:3605) is the threshold that
// decides whether the overlay corrects it.
import fs from 'fs'
import { feed } from './_proto-feed.mjs'
const OVL_KINK_DEG = 30
const NODES = [['Mississippi × Park', 229.0, -158.9], ['Mississippi × Lafayette', 166.5, 221.9]]
const f = feed('lafayette-square')
const streets = f.ribbons.streets || []
const P = (s) => (s.points || []).map(p => [p[0] ?? p.x, p[1] ?? p.z])
const unit = (a, b) => { const dx = b[0]-a[0], dz = b[1]-a[1], l = Math.hypot(dx,dz); return l < 1e-9 ? null : [dx/l, dz/l] }
const ang = (u, v) => Math.acos(Math.max(-1, Math.min(1, u[0]*v[0] + u[1]*v[1]))) * 180 / Math.PI
const BODY_M = Number(process.env.BODY || 40)   // metres of chain treated as "body"
for (const [name, X, Z] of NODES) {
  console.log(`\n${name}  (${X},${Z})   kink threshold ${OVL_KINK_DEG}°`)
  const rows = []
  for (const s of streets) {
    const pts = P(s); if (pts.length < 3) continue
    for (const end of ['start', 'end']) {
      const tipIdx = end === 'start' ? 0 : pts.length - 1
      const tip = pts[tipIdx]
      if (Math.hypot(tip[0]-X, tip[1]-Z) > 3) continue        // this chain ends AT the node
      const step = end === 'start' ? 1 : -1
      // tip approach = first real segment leaving the node
      let j = tipIdx + step, tipDir = null
      while (j >= 0 && j < pts.length) { tipDir = unit(tip, pts[j]); if (tipDir) break; j += step }
      // body direction = the chain over the first BODY_M metres beyond the node
      let acc = 0, k = tipIdx, bodyEnd = tipIdx
      while (k + step >= 0 && k + step < pts.length) {
        acc += Math.hypot(pts[k+step][0]-pts[k][0], pts[k+step][1]-pts[k][1]); k += step; bodyEnd = k
        if (acc >= BODY_M) break }
      const bodyDir = unit(tip, pts[bodyEnd])
      if (!tipDir || !bodyDir) continue
      const kink = ang(tipDir, bodyDir)
      rows.push({ id: s.id || s.skelId, end, kink: +kink.toFixed(1), bodyM: +acc.toFixed(1),
                  kinked: kink >= OVL_KINK_DEG })
    }
  }
  rows.sort((a,b) => b.kink - a.kink)
  if (!rows.length) { console.log('  ⛔ no chain ENDS within 3 m of this node — the legs pass through it as interior vertices'); continue }
  for (const r of rows) console.log(`  ${r.kinked ? '⛔ KINKED' : '   straight'}  ${String(r.kink).padStart(6)}°  ${r.id} (${r.end}, body ${r.bodyM} m)`)
}
