// blend.mjs <scene> <x,z;…> [--out=dir] — PROXY of Jacob's acute-tip proposal (PROWAG R203.6.1.1, "a single blended
// transition that spans all crosswalks at the intersection corner"): at each site, the corner's ramps and the nose between
// them painted as ONE ramp — the convex hull of the corner's ramp paint and its arc, within the ground between the road edge and the
// land use (no lawn wedge reaches the nose), curb removed under it. Drawn over this tree's paint, the norm the pour would
// freeze now. ⛔ A picture for Jacob's eye, not a build: nothing here is in the painter.
import sharp from 'sharp'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { feed } from '../../_proto-feed.mjs'
import { resolveCurbCutNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { readSources } from '../../../cartograph/sources.js'
import { intersectRings } from '../../../src/lib/buildBlockGeometryV2.js'
const { buildTileGround } = await import('../../../src/lib/tileGround.js')
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const args = process.argv.slice(2), [scene, sites = ''] = args.filter(a => !a.startsWith('--'))
const OUT = resolve(ROOT, (args.find(a => a.startsWith('--out=')) || '--out=scratch/perp-depths-out').slice(6))
const HALF = +(process.env.HALF || 10), PPM = +(process.env.PPM || 40)
const f = feed(scene), src = readSources(scene), nm = resolveCurbCutNorm(scene, src.declared ? src.state : null)
const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
const R = buildTileGround({ ...f.ribbons, curbCutNorm: nm }, { grout: 'proto', smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, protoProducer: true })
console.log = pl; console.warn = pw
const hull = (P) => { P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo = [], up = []; for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p) }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p) }
  return lo.slice(0, -1).concat(up.slice(0, -1)) }
const at = sites.split(';').filter(Boolean).map(s => s.split(',').map(Number))
for (const [i, [cx, cz]] of at.entries()) {
  // the corner's ramps: the painted cut within 6 m of the site; the ground they blend across: walk, lawn, curb and cut
  const box = (r) => [[cx - r, cz - r], [cx + r, cz - r], [cx + r, cz + r], [cx - r, cz + r]]
  // and the corner's own arc, tangent to tangent (the painter's record, `arcPts`): the nose the blend paves across
  const c = (R.curbCutCorners || []).filter(c => c.arcPts).sort((a, b) => Math.hypot(a.at[0] - cx, a.at[1] - cz) - Math.hypot(b.at[0] - cx, b.at[1] - cz))[0]
  const cuts = intersectRings(R.curbCut || [], [box(6)]), pts = [...cuts.flat(), ...(c && Math.hypot(c.at[0] - cx, c.at[1] - cz) < 6 ? c.arcPts : [])]
  const ground = [...(R.sidewalk || []), ...Object.values(R.treelawnByLu || {}).flat(), ...(R.curb || []), ...(R.curbCut || [])]
  const blend = pts.length >= 3 ? intersectRings(intersectRings(ground, [box(8)]), [hull(pts)]) : []
  const P = ([x, z]) => `${((x - cx + HALF) * PPM).toFixed(1)},${((z - cz + HALF) * PPM).toFixed(1)}`
  const vis = (rr) => rr.some(([x, z]) => Math.abs(x - cx) < HALF * 3 && Math.abs(z - cz) < HALF * 3)
  const path = (rs) => (rs || []).filter(vis).map(rr => 'M' + rr.map(P).join('L') + 'Z').join(' ')
  const layers = [['asphalt', R.asphalt, '#3b3b3b'], ['lu', Object.values(R.luByClass || {}).flat(), '#d9cfb8'], ['lawn', Object.values(R.treelawnByLu || {}).flat(), '#6fa35a'],
    ['walk', R.sidewalk, '#c9c9c4'], ['curb', R.curb, '#8a8a85'], ['cut', R.curbCut, '#e2a514'], ['blend', blend, '#e2a514']]
  // two pictures: as built (the kit default today), and the proposal drawn over it
  for (const [tag, L, what] of [['built', layers.slice(0, -1), 'AS BUILT: the kit default'], ['blend', layers, 'PROPOSAL: one blended ramp across the tip — not built']]) {
    const W = 2 * HALF * PPM, t = `PROXY — ${scene} (${cx}, ${cz}) — ${what} — not the operator's eye-gate`
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}"><rect width="100%" height="100%" fill="#222"/>` +
      L.map(([, rs, c]) => `<path d="${path(rs)}" fill="${c}" fill-rule="nonzero" stroke="none"/>`).join('') +
      `<rect x="0" y="0" width="${W}" height="22" fill="#000" opacity="0.7"/><text x="6" y="15" font-family="Helvetica" font-size="11" fill="#fff">${t}</text>` +
      `<line x1="${W - 6 - PPM * 2}" y1="${W - 10}" x2="${W - 6}" y2="${W - 10}" stroke="#fff" stroke-width="2"/><text x="${W - 6 - PPM * 2}" y="${W - 14}" font-family="Helvetica" font-size="11" fill="#fff">2 m</text></svg>`
    const file = `${OUT}/${scene}-tip-${i}-${tag}.png`; await sharp(Buffer.from(svg)).png().toFile(file); console.log(file) }
}
