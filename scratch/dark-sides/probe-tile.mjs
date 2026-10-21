// For named dark sides: a probe at pavHW + 3 m on that side, at the chain's midpoint — which tile ring holds it, and what do
// that tile's runs name? Also prints the chain's synthetic field and distance to the hood rim.
import fs from 'fs'; import path from 'path'
const CODE = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/census-202'
const [,, scene, ...keys] = process.argv
const { buildTileGround } = await import(path.join(CODE, 'src/lib/tileGround.js'))
const { resolveCurbWidth, curbedMinWidth } = await import(path.join(CODE, 'src/cartograph/streetProfiles.js'))
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const ribbons = rd(path.join(CODE, 'src/data/ribbons.json')), design = rd(path.join(CODE, `public/looks/${scene}/design.json`))
const hood = rd(path.join(CODE, `cartograph/data/${scene}/neighborhood_boundary.json`)).boundary
const pr = buildTileGround(ribbons, { stencil: hood, curbWidth: resolveCurbWidth(design).value, smooth: 0, blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: design.cornerRadiusScale ?? 1, cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null, blockCustoms: design.blockCustoms || null,
  curbedMinWidth: curbedMinWidth(rd(path.join(CODE, 'references/registry.json')), { code: 'MO' }, null) })
const pip = (x, z, ring) => { let o = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) o = !o } return o }
const segD = (p, A, B) => { const dx = B[0] - A[0], dz = B[1] - A[1], l = dx * dx + dz * dz; let t = l ? ((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - A[0] - t * dx, p[1] - A[1] - t * dz) }
const by = new Map(ribbons.streets.map(s => [s.skelId, s]))
for (const k of keys) {
  const [skel, side] = k.split('|'), st = by.get(skel), sign = side === 'left' ? -1 : 1
  const i = Math.floor((st.points.length - 1) / 2), A = st.points[i], B = st.points[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1])
  const nx = -(B[1] - A[1]) / L, nz = (B[0] - A[0]) / L, off = st.measure[side].pavementHW + 3
  const P = [(A[0] + B[0]) / 2 + sign * nx * off, (A[1] + B[1]) / 2 + sign * nz * off]
  let rim = Infinity; for (let j = 0; j < hood.length; j++) rim = Math.min(rim, segD(P, hood[j], hood[(j + 1) % hood.length]))
  const holders = (pr.protoShapeTiles || []).filter(t => (t.ring || t.outer || t.iaFull?.[0]) && pip(P[0], P[1], t.ring || t.outer || t.iaFull[0]))
  console.log(k, 'synthetic', JSON.stringify(st.synthetic), 'roadId', st.roadId, '| probe', P.map(v => v.toFixed(1)).join(','), 'rim', rim.toFixed(1), 'm | tiles holding probe:', holders.length,
    holders.map(t => [...new Set((t.runs || []).map(r => `${r.skelId}|${r.side}`))].join(' ')).join(' ;; '))
}
console.log('tile keys sample:', Object.keys(pr.protoShapeTiles[0]).join(','))
