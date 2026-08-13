// READ-ONLY. WHAT DOES THE BUILT FILL ACTUALLY PAINT AT EACH CAP SHOULDER?
//
// The coupler (tileGround.js:2341-2430) eases the walk band from its slot on the
// CAP to its slot on the LEG over a transition of length T down each shoulder.
// If the shoulder was paired with the WRONG leg, the band lands at s=T on slots
// that disagree with the leg it actually abuts — a discontinuity a band-width
// down the leg from the shoulder, on ONE side only.
//
// This samples the real sectionPassTile output on a grid (s along the leg, d
// depth outward from the curb) on BOTH shoulders of a cap and prints which
// material occupies each cell. A correct joint reads as one column of walk that
// never jumps; a mispaired shoulder reads as a jump at s≈T.
//
//   node scratch/tessel-cap-shoulder-material.mjs [scene] [skelId] [capEnd]
import fs from 'node:fs'
import { sectionPassTile, capCentre } from '../src/lib/tileGround.js'

const scene = process.argv[2] || 'lafayette-square'
const wantId = process.argv[3] || null
const wantEnd = process.argv[4] || null
const sh = JSON.parse(fs.readFileSync(`public/baked/${scene}/shape.json`, 'utf8'))
const dg = (() => { try { return JSON.parse(fs.readFileSync(`public/looks/${scene}/design.json`, 'utf8')) } catch { return {} } })()
const bc = dg.blockCustoms || null, CW = dg.curbWidth ?? 0.381
const TILES = Array.isArray(sh) ? sh : (sh.tiles || [])
const H = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])

// even-odd point-in-rings (rings may include holes; parity is what clipper means)
const inRings = (rings, p) => {
  let c = false
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const yi = r[i][1], yj = r[j][1]
      if ((yi > p[1]) !== (yj > p[1])) {
        const x = r[i][0] + (p[1] - yi) / (yj - yi) * (r[j][0] - r[i][0])
        if (x > p[0]) c = !c
      }
    }
  }
  return c
}

for (const [ti, st] of TILES.entries()) {
  for (const t of (st.roundTips || [])) {
    if (!t.skelId || !t.capEnd) continue
    if (wantId && t.skelId !== wantId) continue
    if (wantEnd && t.capEnd !== wantEnd) continue

    // axis, exactly as :1671-1683
    let ax = 0, az = 0, nAx = 0
    for (const run of (st.runs || [])) {
      const nP = run.poly.length
      for (const ix of [0, nP - 1]) {
        if (H(run.poly[ix], t.p) >= 1.5) continue
        const b = run.poly[ix === 0 ? 1 : nP - 2]; if (!b) continue
        const l = H(b, t.p) || 1
        ax += (b[0] - t.p[0]) / l; az += (b[1] - t.p[1]) / l; nAx++; break
      }
    }
    if (!nAx) continue
    const L = Math.hypot(ax, az) || 1, a = [ax / L, az / L]
    const c = capCentre(t)
    const hw = t.hw, tot = (t.tl || 0) + (t.sw || 0)

    const out = sectionPassTile(st, CW, { outer: 'LU', inner: 'SW' }, bc)
    const SW = out.Wacc
    const TL = Object.values(out.tlByLu).flat()

    console.log(`\n══ ${scene}  tile ${ti}  ${t.skelId}|${t.capEnd}   hw ${hw.toFixed(2)}  band ${tot.toFixed(2)}  centre off-node ${H(c, t.p).toFixed(3)} m`)
    const legs = (st.runs || []).filter(r => r.skelId === t.skelId && r.poly.some(p => H(p, t.p) < 1.5))
    for (const r of legs) console.log(`   leg ${r.side}${r.segOrd}  pavementHW ${(r.baseMeasure?.[r.side]?.pavementHW ?? 0).toFixed(2)}`)

    const T = tot                                   // transition length used by the coupler
    const SS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(k => k * T)
    const DD = []
    for (let d = 0.15; d < tot; d += tot / 8) DD.push(d)
    for (const sign of [1, -1]) {
      const p = [sign * -a[1], sign * a[0]]
      console.log(`   shoulder ${sign > 0 ? '+' : '-'}   depth →   ${DD.map(d => d.toFixed(1).padStart(4)).join('')}`)
      for (const s of SS) {
        const row = DD.map(d => {
          const q = [c[0] + a[0] * s + p[0] * (hw + CW + d), c[1] + a[1] * s + p[1] * (hw + CW + d)]
          const w = inRings(SW, q), g = inRings(TL, q)
          return (w && g ? '  ?' : w ? '  W' : g ? '  g' : '  .').padStart(4)
        }).join('')
        console.log(`     s=${s.toFixed(2).padStart(5)}          ${row}`)
      }
    }
  }
}
