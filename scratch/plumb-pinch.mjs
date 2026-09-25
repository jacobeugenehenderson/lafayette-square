// Plumb — does a ② contour touch itself at a vertex (a pinch), and what are its lobes' areas and
// widths? `node scratch/plumb-pinch.mjs <scene> [tileIdx…]` (no idx ⇒ every tile; prints pinched ones)
import { feed, buildProto } from './_proto-feed.mjs'
const [scene, ...ids] = process.argv.slice(2)
const f = feed(scene); if (!f) process.exit(2)
const w0 = console.warn; console.warn = () => {}
const tg = buildProto(f, { emitArtifact: true, protoProducer: true, protoArtifact: true }); console.warn = w0
const area = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i+1)%r.length]; s += p[0]*q[1]-q[0]*p[1] } return s / 2 }
const perim = (r) => r.reduce((s, p, i) => s + Math.hypot(r[(i+1)%r.length][0]-p[0], r[(i+1)%r.length][1]-p[1]), 0)
const key = (p) => `${Math.round(p[0]*1000)},${Math.round(p[1]*1000)}`
const tiles = tg.protoShapeTiles || []
let nP = 0
for (const [ti, t] of tiles.entries()) {
  if (ids.length && !ids.includes(String(ti))) continue
  for (const [ri, r] of (t.iaFull || []).entries()) {
    const seen = new Map(); const pinches = []
    r.forEach((p, i) => { const k = key(p); if (seen.has(k) && i - seen.get(k) > 1) pinches.push([seen.get(k), i]); else seen.set(k, i) })
    if (!pinches.length) continue
    nP++
    const [a, b] = pinches[0]; const lobe = r.slice(a, b), rest = [...r.slice(b), ...r.slice(0, a)]
    const w = (x) => 2 * Math.abs(area(x)) / perim(x)
    console.log(`tile ${ti} (${t.lu}) ring ${ri}: ${pinches.length} pinch(es), first at (${r[a][0].toFixed(1)}, ${r[a][1].toFixed(1)}) · lobe A ${area(lobe).toFixed(1)} m² (mean width ${w(lobe).toFixed(2)} m) · lobe B ${area(rest).toFixed(1)} m² (mean width ${w(rest).toFixed(2)} m) · ${Math.sign(area(lobe)) === Math.sign(area(rest)) ? 'SAME orientation' : 'OPPOSITE orientation'}`)
  }
}
console.log(`${scene}: ${nP} pinched ② contour(s) of ${tiles.length} tiles`)
