// Sextant forensic probe (READ-ONLY proxy harness) — runs the production
// buildTileGround on LS, measures the block edge (iA) on the NO-MOUTH side of
// each marked deg-3 T, and reports whether THRU/E3 fired there.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design  = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))

const opts = {
  curbWidth: Number.isFinite(design.curbWidth) ? design.curbWidth : 0.381,
  smooth: 0,
  blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null,
  blockCustoms: design.blockCustoms || null,
  emitArtifact: true,
}
const pr = buildTileGround(ribbons, opts)
console.log('block rings:', pr.block.length, ' jPolys:', pr._jPolys?.length, ' cornerCuts:', pr._jCornerCuts?.length)

const marks = {
  'Vail->Park':       [340.0, -120.6],
  'Kennett->Miss':    [179.9, 115.9],
  'Mackay->Park':     [-48.0, -203.9],
  'Albion->Missouri': [-177.5, -78.7],
  'Waverly->Laf':     [-25.3, 191.6],
}
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// For each node: find the block-ring vertices within R of the node, and for the
// stretch of ring nearest the node, compute the max turn angle (the dogleg).
function ringTurns(ring) {
  const n = ring.length, out = []
  for (let i = 0; i < n; i++) {
    const A = ring[(i - 1 + n) % n], V = ring[i], B = ring[(i + 1) % n]
    let ax = V[0] - A[0], ay = V[1] - A[1], bx = B[0] - V[0], by = B[1] - V[1]
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by)
    if (la < 1e-6 || lb < 1e-6) { out.push({ i, V, turn: 0, la, lb }); continue }
    ax /= la; ay /= la; bx /= lb; by /= lb
    const turn = Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by))) * 180 / Math.PI
    out.push({ i, V, turn, la, lb })
  }
  return out
}

for (const [name, at] of Object.entries(marks)) {
  console.log(`\n===== ${name}  node=${at} =====`)
  // gather all block-ring vertices near the node, with their turn angles
  let hits = []
  pr.block.forEach((ring, ri) => {
    const turns = ringTurns(ring)
    for (const t of turns) {
      const d = D(t.V, at)
      if (d < 12) hits.push({ ri, ...t, d })
    }
  })
  hits.sort((a, b) => a.d - b.d)
  // report the nearest vertices and any significant turns within 12m
  const sig = hits.filter(h => h.turn > 5).sort((a, b) => b.turn - a.turn)
  console.log(`  block verts within 12m: ${hits.length};  turns>5deg: ${sig.length}`)
  for (const h of sig.slice(0, 6)) {
    console.log(`    turn ${h.turn.toFixed(1)}deg @ [${h.V[0].toFixed(2)},${h.V[1].toFixed(2)}] dist ${h.d.toFixed(2)}m legs(${h.la.toFixed(2)},${h.lb.toFixed(2)}) ring#${h.ri}`)
  }
  if (!sig.length) console.log('    (no block-edge turn > 5deg within 12m — straight pass-through)')
}
