// Sextant probe 2 — isolate the NO-MOUTH avenue curb at each marked T and
// measure its straightness. Classify block-ring vertices: arc-sample (short
// legs, ~7.5deg) vs REAL kink (legs>1m). Also report whether THRU fired and
// the avenue's per-fe widths across the node.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design  = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const opts = {
  curbWidth: Number.isFinite(design.curbWidth) ? design.curbWidth : 0.381,
  smooth: 0, blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null,
  blockCustoms: design.blockCustoms || null, emitArtifact: true,
}
const pr = buildTileGround(ribbons, opts)

const marks = {
  'Vail->Park':       { at: [340.0, -120.6],  avenue: 'park-avenue-1',     stem: 'vail-place' },
  'Kennett->Miss':    { at: [179.9, 115.9],   avenue: 'mississippi-avenue',stem: 'kennett-place' },
  'Mackay->Park':     { at: [-48.0, -203.9],  avenue: 'park-avenue-1',     stem: 'mackay-place-0' },
  'Albion->Missouri': { at: [-177.5, -78.7],  avenue: 'missouri-avenue-2', stem: 'albion-place' },
  'Waverly->Laf':     { at: [-25.3, 191.6],   avenue: 'lafayette-avenue-3',stem: 'waverly-place-0' },
}
const streets = ribbons.streets
const byId = new Map(streets.map(s => [s.skelId || s.name, s]))
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const nrm = (x, y) => { const L = Math.hypot(x, y) || 1; return [x / L, y / L] }

for (const [name, m] of Object.entries(marks)) {
  const av = byId.get(m.avenue), stem = byId.get(m.stem)
  // avenue vertex at node + tangent
  let vi = -1, bd = 1e9
  av.points.forEach((p, i) => { const d = D(p, m.at); if (d < bd) { bd = d; vi = i } })
  const a = av.points[vi - 1] || av.points[vi], b = av.points[vi + 1] || av.points[vi]
  const tAv = nrm(b[0] - a[0], b[1] - a[1])
  const nL = [tAv[1], -tAv[0]], nR = [-tAv[1], tAv[0]]
  // stem direction from the node (which side is the mouth)
  let se = D(stem.points[0], m.at) < D(stem.points[stem.points.length - 1], m.at) ? stem.points[1] : stem.points[stem.points.length - 2]
  const tStem = nrm(se[0] - m.at[0], se[1] - m.at[1])
  // mouth side = side whose normal aligns with stem dir
  const mouthIsL = (nL[0] * tStem[0] + nL[1] * tStem[1]) > 0
  const nNo = mouthIsL ? nR : nL              // no-mouth normal
  const sideNo = mouthIsL ? 'right' : 'left'

  console.log(`\n===== ${name}  node=[${m.at}]  vi=${vi} bd=${bd.toFixed(3)} =====`)
  console.log(`  avenue tangent=[${tAv.map(v=>v.toFixed(3))}]  no-mouth side=${sideNo}  nNo=[${nNo.map(v=>v.toFixed(3))}]`)

  // Collect block-ring vertices that lie on the NO-MOUTH side corridor:
  // dot(P-node, nNo) in [1, 30] (outboard, beyond centerline toward no-mouth),
  // and |longitudinal| <= 16. Project to (s = along tAv, r = along nNo).
  const band = []
  pr.block.forEach((ring, ri) => {
    const n = ring.length
    for (let i = 0; i < n; i++) {
      const P = ring[i]
      const dx = P[0] - m.at[0], dy = P[1] - m.at[1]
      const s = dx * tAv[0] + dy * tAv[1]
      const r = dx * nNo[0] + dy * nNo[1]
      if (r > 1 && r < 30 && Math.abs(s) < 16) {
        // turn angle + leg lengths at this vertex
        const A = ring[(i - 1 + n) % n], B = ring[(i + 1) % n]
        let ax = P[0]-A[0], ay=P[1]-A[1], bx=B[0]-P[0], by=B[1]-P[1]
        const la=Math.hypot(ax,ay), lb=Math.hypot(bx,by)
        let turn=0
        if(la>1e-6&&lb>1e-6){ax/=la;ay/=la;bx/=lb;by/=lb;turn=Math.acos(Math.max(-1,Math.min(1,ax*bx+ay*by)))*180/Math.PI}
        band.push({ ri, i, s, r, turn, la, lb })
      }
    }
  })
  band.sort((a, b) => a.s - b.s)
  // the curb line: take the band points with smallest r (closest to centerline) per ring — those are the curb
  // report min/max r and any REAL kink (legs>1m, turn>6deg)
  if (!band.length) { console.log('  (no block verts on no-mouth corridor)'); continue }
  const rings = [...new Set(band.map(b => b.ri))]
  for (const ri of rings) {
    const pts = band.filter(b => b.ri === ri)
    const rs = pts.map(p => p.r)
    const minR = Math.min(...rs), maxR = Math.max(...rs)
    // straight curb would have ~constant r. measure r spread + real kinks
    const realKinks = pts.filter(p => p.turn > 6 && p.la > 1.0 && p.lb > 1.0)
    console.log(`  ring#${ri}: ${pts.length} verts, r=[${minR.toFixed(2)}..${maxR.toFixed(2)}] (spread ${(maxR-minR).toFixed(2)}m)`)
    // show the curb-proximal points (r within 3m of minR) sorted by s, to see the dogleg profile
    const curb = pts.filter(p => p.r < minR + 4).sort((a,b)=>a.s-b.s)
    console.log('     curb profile (s -> r):  ' + curb.map(p=>`${p.s.toFixed(1)}:${p.r.toFixed(2)}`).join('  '))
    for (const k of realKinks) console.log(`     >> REAL KINK turn ${k.turn.toFixed(1)}deg @ s=${k.s.toFixed(2)} r=${k.r.toFixed(2)} legs(${k.la.toFixed(2)},${k.lb.toFixed(2)})`)
  }
}
