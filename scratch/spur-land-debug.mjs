// spur-land-debug.mjs — why did a curb fail to land? Prints every candidate the
// landing search considered, with the t/u/distance that got it rejected.
import fs from 'fs'
import { offsetPolyline } from '../cartograph/spurOutline.js'

const target = process.argv[2] || 'waverly-place-1'
const wantEnd = process.argv[3] || 'end'
const rib = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const S = rib.streets.filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
  .map(s => (s.strokePoints ? { ...s, points: s.strokePoints } : s))
const vk = p => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4)
const deg = new Map()
for (const s of S) { const p = s.points; for (let i = 0; i < p.length; i++) { const k = vk(p[i]); deg.set(k, (deg.get(k) || 0) + ((i === 0 || i === p.length - 1) ? 1 : 2)) } }

const s = S.find(x => (x.skelId || x.name) === target)
const p = s.points
const atStart = wantEnd === 'start'
let mi = -1
if (atStart) { for (let i = 1; i < p.length; i++) if ((deg.get(vk(p[i])) || 0) >= 3) { mi = i; break } }
else { for (let i = p.length - 2; i >= 0; i--) if ((deg.get(vk(p[i])) || 0) >= 3) { mi = i; break } }
console.log(`${target}[${wantEnd}]  points=${p.length}  mouthIdx=${mi}`)
if (mi < 0) { console.log('no mouth found'); process.exit(0) }

const tail = atStart ? p.slice(0, mi + 1) : p.slice(mi)
const hwR = s.measure?.right?.pavementHW || 0, hwL = s.measure?.left?.pavementHW || 0
const rightLine = offsetPolyline(tail, hwR), leftLine = offsetPolyline(tail, -hwL)
const mouthIdx = atStart ? tail.length - 1 : 0
const mouth = tail[mouthIdx]
console.log(`mouth ${mouth.map(v => v.toFixed(2))}  hwL=${hwL} hwR=${hwR}  tail=${tail.length}pts`)

const incident = []
for (let k = 0; k < S.length; k++) {
  const q = S[k].points
  for (let i = 0; i < q.length - 1; i++) {
    const onTail = S[k] === s && (atStart ? (i < mi) : (i >= mi))
    if (onTail) continue
    if (Math.hypot(q[i][0] - mouth[0], q[i][1] - mouth[1]) > 120 && Math.hypot(q[i + 1][0] - mouth[0], q[i + 1][1] - mouth[1]) > 120) continue
    incident.push({ id: S[k].skelId || S[k].name, seg: [q[i], q[i + 1]] })
  }
}
const reach = (hwL + hwR) * 6 + 4
console.log(`candidates within 120 m: ${incident.length}   reach=${reach.toFixed(1)} m\n`)

for (const [name, line] of [['LEFT', leftLine], ['RIGHT', rightLine]]) {
  const A = atStart ? line[1] : line[line.length - 2]
  const B = atStart ? line[0] : line[line.length - 1]
  console.log(`── ${name} curb, ray ${A.map(v => v.toFixed(2))} → ${B.map(v => v.toFixed(2))}`)
  const r = [B[0] - A[0], B[1] - A[1]]
  const rows = []
  for (const c of incident) {
    const [p3, p4] = c.seg
    const sv = [p4[0] - p3[0], p4[1] - p3[1]]
    const den = r[0] * sv[1] - r[1] * sv[0]
    if (Math.abs(den) < 1e-9) { rows.push({ on: c.id, verdict: 'parallel' }); continue }
    const t = ((p3[0] - A[0]) * sv[1] - (p3[1] - A[1]) * sv[0]) / den
    const u = ((p3[0] - A[0]) * r[1] - (p3[1] - A[1]) * r[0]) / den
    const x = [A[0] + r[0] * t, A[1] + r[1] * t]
    const d = Math.hypot(x[0] - mouth[0], x[1] - mouth[1])
    rows.push({ on: c.id, t: +t.toFixed(3), u: +u.toFixed(3), dToMouth: +d.toFixed(2), verdict: (u < 0 || u > 1) ? 'u OUTSIDE segment' : d > reach ? 'beyond reach' : '✅ ACCEPT' })
  }
  rows.sort((a, b) => (a.dToMouth ?? 1e9) - (b.dToMouth ?? 1e9))
  console.table(rows.slice(0, 8))
}
