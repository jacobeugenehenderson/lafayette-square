// Probe membership of points near the slit in the global asphalt, and dump
// tile#11's (south block) asphalt contribution near the node.
import { build, turnDeg } from './voussoir-setup.mjs'
const g = build()
const pip = (px, py, r) => {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const signedArea = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1] } return a / 2 }
const inPolyset = (rings, p) => {
  let cnt = 0
  for (const r of rings) if (pip(p[0], p[1], r)) cnt++
  return cnt % 2 === 1   // even-odd over outer+holes
}
const probes = [
  ['merge interior (479,271.5)', [479, 271.5]],
  ['just S of chain-6 (479,270.6)', [479, 270.6]],
  ['deeper S of chain-6 (479,269.0)', [479, 269.0]],
  ['B outboard mid (470,266)', [470, 266.0]],
  ['spine S just E of node (483,266)', [483, 266.0]],
  ['spine S deeper (483,263)', [483, 263.0]],
  ['N of chain-5 A outboard (470,277)', [470, 277.0]],
  ['spine N of node (483,277)', [483, 277.0]],
]
for (const [label, p] of probes) console.log(label.padEnd(36), 'asphalt:', inPolyset(g.asphalt, p))
// tile#11 asphalt contribution near node: recompute tile - iA for tile 11
const art = g._shapeArtifact
const J = [481.9, 272.1]
const near = (p, r) => Math.hypot(p[0] - J[0], p[1] - J[1]) < r
art.forEach((st, ti) => {
  if (ti !== 11) return
  // iA vertices near node
  for (const ia of st.iA) {
    const seg = []
    for (let i = 0; i < ia.length; i++) if (near(ia[i], 30)) {
      const t = turnDeg(ia[(i - 1 + ia.length) % ia.length], ia[i], ia[(i + 1) % ia.length])
      seg.push(`[${ia[i][0].toFixed(1)},${ia[i][1].toFixed(1)}]${t > 25 ? '∠' + t.toFixed(0) : ''}`)
    }
    if (seg.length) console.log('tile#11 iA near node:', seg.join(' '))
  }
  // ring vertices near node
  const seg = []
  for (let i = 0; i < st.ring.length; i++) if (near(st.ring[i], 40)) seg.push(`[${st.ring[i][0].toFixed(1)},${st.ring[i][1].toFixed(1)}]`)
  console.log('tile#11 ring near node:', seg.join(' '))
})
