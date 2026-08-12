// tipcoupler — hand-verify that a tip's cap coupler names the RIGHT TWO SIDES of
// the RIGHT chain-end, geometrically, not merely that a record is present.
//
// The convention it re-derives from scratch (derive.js `rightDir`, and the wedge
// comment "wedge runs CCW from A to B: A bounds it on its CCW side, B on its CW"):
//   measure-RIGHT at an end = (-tz, tx) of the POINT-ORDER tangent there
//   a.side must point +90° CCW from the arm's OUTWARD direction (node → body)
//   b.side must point -90° CW  from it
// Usage: node scratch/tipcoupler-verify-tips.mjs [scene] [skelId ...]
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const scene = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'lafayette-square'
const want = argv.length ? argv : ['south-18th-street-3', 'dolman-street-1', 'waverly-place-1']
const R = JSON.parse(fs.readFileSync(path.join(ROOT, `cartograph/data/${scene}/clean/map.json`), 'utf8')).layers.ribbons
const streets = (R.streets || []).filter(s => s?.points?.length >= 2)
const curbed = s => !s.gradeSeparated && !s.disabled
const vKey = p => p[0].toFixed(3) + ',' + p[1].toFixed(3)
const deg = new Map()
for (const s of streets) { if (!curbed(s)) continue; const p = s.points; for (let i = 0; i < p.length; i++) { const k = vKey(p[i]); deg.set(k, (deg.get(k) || 0) + ((i === 0 || i === p.length - 1) ? 1 : 2)) } }
const nodeAt = new Map((R.junctionMap?.nodes || []).map(n => [vKey(n.at), n]))
const nrm = (x, z) => { const L = Math.hypot(x, z) || 1; return [x / L, z / L] }
const rot = (u, ccw) => ccw ? [-u[1], u[0]] : [u[1], -u[0]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1]

let pass = 0, fail = 0, absent = 0
for (const id of want) {
  const s = streets.find(x => x.skelId === id)
  if (!s) { console.log(`\n${id}: ⛔ NOT IN SCENE`); fail++; continue }
  const p = s.points
  for (const end of ['start', 'end']) {
    const pt = end === 'start' ? p[0] : p[p.length - 1]
    const k = vKey(pt)
    if (deg.get(k) !== 1) continue                      // not a tip at this end
    const n = nodeAt.get(k)
    const L = s.measure?.left?.pavementHW, Rt = s.measure?.right?.pavementHW
    const hdr = `\n${id} @ ${end}  (${pt[0].toFixed(1)}, ${pt[1].toFixed(1)})  deg=1  |L−R|=${Math.abs((L || 0) - (Rt || 0)).toFixed(2)} m`
    if (!n) { console.log(`${hdr}\n  ⛔ NO JUNCTION NODE AT THIS TIP — nothing to hang a coupler on (Source 6's width-step gate)`); absent++; continue }
    const ca = n.cornersAdjacent || []
    if (ca.length !== 1) { console.log(`${hdr}\n  ⛔ expected exactly 1 cap coupler, got ${ca.length}`); fail++; continue }
    const rec = ca[0]
    // Ground truth, re-derived here — the two point-order tangent perpendiculars.
    const [a2, b2] = end === 'start' ? [p[0], p[1]] : [p[p.length - 2], p[p.length - 1]]
    const t = nrm(b2[0] - a2[0], b2[1] - a2[1])         // POINT-ORDER tangent at this end
    const right = [-t[1], t[0]]                          // measure-RIGHT
    const outward = end === 'start' ? t : [-t[0], -t[1]] // node → chain body
    const dirOf = side => side === 'right' ? right : [-right[0], -right[1]]
    const errs = []
    if (rec.a.chain !== id || rec.b.chain !== id) errs.push(`chain must be ${id}, got ${rec.a.chain}/${rec.b.chain}`)
    if (rec.a.end !== end || rec.b.end !== end) errs.push(`end must be '${end}', got ${rec.a.end}/${rec.b.end}`)
    if (rec.a.side === rec.b.side) errs.push(`the two sides must be OPPOSITE, both are '${rec.a.side}'`)
    if (rec.via !== 'cap') errs.push(`via must be 'cap', got ${rec.via}`)
    const dA = dot(dirOf(rec.a.side), rot(outward, true)), dB = dot(dirOf(rec.b.side), rot(outward, false))
    if (dA < 0.999) errs.push(`a.side='${rec.a.side}' is not the outward dir's CCW side (dot ${dA.toFixed(3)})`)
    if (dB < 0.999) errs.push(`b.side='${rec.b.side}' is not the outward dir's CW side (dot ${dB.toFixed(3)})`)
    console.log(`${hdr}\n  record: ${rec.a.chain}|${rec.a.end}|${rec.a.side}  →  ${rec.b.chain}|${rec.b.end}|${rec.b.side}   via=${rec.via}`)
    console.log(`  point-order tangent (${t[0].toFixed(3)}, ${t[1].toFixed(3)})  measure-right (${right[0].toFixed(3)}, ${right[1].toFixed(3)})  outward (${outward[0].toFixed(3)}, ${outward[1].toFixed(3)})`)
    if (errs.length) { console.log(`  ⛔ ${errs.join('\n  ⛔ ')}`); fail++ } else { console.log(`  ✅ names both sides of ${id}|${end}, CCW→CW about the cap`); pass++ }
  }
}
console.log(`\npass ${pass}  fail ${fail}  tips with NO node ${absent}`)
process.exit(fail ? 1 : 0)
