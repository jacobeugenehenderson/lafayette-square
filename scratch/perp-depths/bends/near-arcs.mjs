// near-arcs.mjs <scene> <x,z;…> — for each point: the nearest corner arc (the painter's `cornerArcs`, tangent to tangent),
// its distance, kind, and whether it is padded. Measures only.
import { feed } from '../../_proto-feed.mjs'
import { resolveCurbCutNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { readSources } from '../../../cartograph/sources.js'
const { buildTileGround } = await import('../../../src/lib/tileGround.js')
const [scene, pts] = process.argv.slice(2), f = feed(scene), src = readSources(scene), nm = resolveCurbCutNorm(scene, src.declared ? src.state : null)
const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
const R = buildTileGround({ ...f.ribbons, curbCutNorm: nm }, { grout: 'proto', smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, protoProducer: true })
console.log = pl; console.warn = pw
const segD = (P, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((P[0] - a[0]) * dx + (P[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(P[0] - a[0] - t * dx, P[1] - a[1] - t * dz) }
for (const P of pts.split(';').map(s => s.split(',').map(Number))) { let best = null
  for (const a of (R.cornerArcs || []).filter(a => a.arcPts?.length >= 2)) { let d = Infinity; for (let k = 1; k < a.arcPts.length; k++) d = Math.min(d, segD(P, a.arcPts[k - 1], a.arcPts[k])); if (!best || d < best.d) best = { d, a } }
  console.log(`(${P}) nearest arc ${best ? `${best.d.toFixed(2)} m — ${best.a.kind}${best.a.notCorner ? ' (not a corner)' : ''}, ${best.a.pad ? 'padded' : 'UNPADDED'}` : '—'}`) }
