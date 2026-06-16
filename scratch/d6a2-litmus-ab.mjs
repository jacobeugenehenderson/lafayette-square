// D6a.2 necessary gate: litmus violation count ON vs OFF (no new violations).
// Replicates cartograph/litmus-curb-parallel.mjs exactly, toggling disableCorridorCurb.
import fs from 'fs'
import path from 'path'
const ROOT = process.cwd()
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const STEP = 0.5, MIN_RUN = 22, RAY_CAP = 4.5, MAX_TILE_SPAN = 250, TOL = 0.75, FILLET_MARGIN = 9
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const cross = (a, b) => a[0] * b[1] - a[1] * b[0]
const len = (a) => Math.hypot(a[0], a[1])
function rayHit(O, D, edges) { let best = Infinity; for (const [A, B] of edges) { const E = sub(B, A); const den = cross(E, D); if (Math.abs(den) < 1e-12) continue; const W = sub(A, O); const t = cross(E, W) / den; const s = cross(D, W) / den; if (t > 1e-4 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = t } return best }

function run(disable) {
  const pr = buildTileGround(ribbons, { stencil: null, curbWidth: 0.15, smooth: 0, blockLandUse: null, cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null, blockCustoms: null, emitArtifact: true, iaOffset: !disable })
  const tiles = pr._shapeArtifact || []
  const violations = []
  for (let ti = 0; ti < tiles.length; ti++) {
    const tile = tiles[ti]
    if (!tile?.iA?.length) continue
    let xn = Infinity, xx = -Infinity, yn = Infinity, yx = -Infinity
    for (const p of tile.ring) { xn = Math.min(xn, p[0]); xx = Math.max(xx, p[0]); yn = Math.min(yn, p[1]); yx = Math.max(yx, p[1]) }
    if (Math.hypot(xx - xn, yx - yn) > MAX_TILE_SPAN) continue
    const edges = []
    for (const ring of tile.iA) for (let i = 0; i < ring.length; i++) edges.push([ring[i], ring[(i + 1) % ring.length]])
    for (const r of tile.runs || []) {
      const poly = r.poly; if (!poly || poly.length < 2) continue
      let L = 0; for (let i = 1; i < poly.length; i++) L += len(sub(poly[i], poly[i - 1]))
      if (L < MIN_RUN) continue
      const hwL = r.measure?.left?.pavementHW || 0, hwR = r.measure?.right?.pavementHW || 0
      if (hwL < 0.5 && hwR < 0.5) continue
      let worst = 0, worstAt = null, worstSide = null, along = 0
      for (let i = 1; i < poly.length; i++) {
        const a = poly[i - 1], b = poly[i]; const segLen = len(sub(b, a)) || 1
        const fwd = [(b[0] - a[0]) / segLen, (b[1] - a[1]) / segLen]
        const leftN = [-fwd[1], fwd[0]], rightN = [fwd[1], -fwd[0]]
        for (let d = 0; d <= segLen; d += STEP) {
          const aAlong = along + d
          if (aAlong < FILLET_MARGIN || aAlong > L - FILLET_MARGIN) continue
          const O = [a[0] + (b[0] - a[0]) * (d / segLen), a[1] + (b[1] - a[1]) * (d / segLen)]
          let best = Infinity, bestDev = null, bestSide = null
          for (const [nrm, hw, sd] of [[leftN, hwL, 'left'], [rightN, hwR, 'right']]) {
            if (!(hw > 0.5)) continue
            const hit = rayHit(O, nrm, edges)
            if (!isFinite(hit) || hit < 0.1 || hit > hw + RAY_CAP) continue
            if (hit < best) { best = hit; bestDev = Math.abs(hit - hw); bestSide = sd }
          }
          if (bestDev != null && bestDev > worst) { worst = bestDev; worstAt = O; worstSide = bestSide }
        }
        along += segLen
      }
      if (worst > TOL) violations.push({ tile: ti, skelId: r.skelId, side: worstSide, maxDev: +worst.toFixed(2), at: worstAt?.map(v => +v.toFixed(1)) })
    }
  }
  return violations
}

const vOff = run(true), vOn = run(false)
console.log(`\nlitmus violations — OFF (no D6a): ${vOff.length}   ON (D6a): ${vOn.length}   Δ ${vOn.length - vOff.length}`)
const keyOf = v => `${v.skelId}|${v.side}|${v.at}`
const offSet = new Set(vOff.map(keyOf))
const onlyOn = vOn.filter(v => !offSet.has(keyOf(v)))
const onSet = new Set(vOn.map(keyOf))
const onlyOff = vOff.filter(v => !onSet.has(keyOf(v)))
console.log(`NEW violations introduced by D6a (must be 0): ${onlyOn.length}`)
for (const v of onlyOn.slice(0, 10)) console.log(`   + tile ${v.tile} ${v.skelId} ${v.side} ${v.maxDev}m @ ${v.at}`)
console.log(`violations REMOVED by D6a: ${onlyOff.length}`)
for (const v of onlyOff.slice(0, 10)) console.log(`   - tile ${v.tile} ${v.skelId} ${v.side} ${v.maxDev}m @ ${v.at}`)
