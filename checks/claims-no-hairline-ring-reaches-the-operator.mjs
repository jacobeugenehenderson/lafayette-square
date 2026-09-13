// CLAIM: every ring the operator is shown — ① and the ②/③ ped bands — has a real
// WIDTH. A ring with none is not a place; it is the residue of two overlapping
// strokes that cancelled instead of merging.
//
// Jacob, 2026-09-08, having circled 12 spots on LS with the Marker:
//   "In Illustrator parlance, it seems like overlaps are getting eliminated
//    instead of included."
// A cancelled overlap does not vanish. It survives as a hairline sliver, and the
// band offset then paints a full curb/treelawn/sidewalk stack around it.
//
// THE METRIC, and why it is this one. Mean width W = 2·|area| / perimeter.
// ⛔ NOT the isoperimetric quotient 4πA/P² — that flags every long thin ANNULUS,
//    and a ped band IS a long thin annulus (LS medians: curb 36.8, treelawn 1.48,
//    sidewalk 1.47). Scoring bands by roundness reported 560 "defects" on LS, of
//    which nearly all were working bands. W is the thing a band always has and a
//    hairline never has, and it is in metres, so it ports without a tuned floor:
//    5 cm is below anything any operator can author.
//
// ⛔ Authoring ON — built through `_proto-feed`, never `blockCustoms: null`.
// ⛔ Every scene is measured or SKIPPED LOUDLY; a scene that cannot be fed is a
//    failure, not a pass.
//
//
// ⛔⛔ READ THE `① SOURCE` LINE BEFORE QUOTING A CROSS-TOWN NUMBER. Only
// lafayette-square carries a FROZEN ①; hipointe-demun, altadena and
// lafayette-square-staging have not been poured since ① landed, so their rows
// come from the LIVE re-derivation (`ROADMAP A20`). The check prints which one
// produced every row — it does not hide the difference and it does not refuse
// the live path, because a live row is still evidence. It is just weaker
// evidence, and a reader who cannot see which is which will treat them alike.
// ▶ node checks/claims-no-hairline-ring-reaches-the-operator.mjs [scene ...]
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'

const W_MIN = 0.05   // metres of mean width
const A_MIN = 1.0    // m² — a ring smaller than a floor tile is not a place

const ringM = (r) => {
  let a = 0, p = 0, cx = 0, cy = 0
  for (let i = 0, n = r.length; i < n; i++) {
    const u = r[i], v = r[(i + 1) % n], cr = u[0] * v[1] - v[0] * u[1]
    a += cr; p += Math.hypot(v[0] - u[0], v[1] - u[1])
    cx += (u[0] + v[0]) * cr; cy += (u[1] + v[1]) * cr
  }
  a /= 2
  return { a, p, w: p > 0 ? 2 * Math.abs(a) / p : 0,
           C: Math.abs(a) > 1e-9 ? [cx / (6 * a), cy / (6 * a)] : [r[0][0], r[0][1]] }
}

const scenes = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync('cartograph/data').filter(s => fs.existsSync(`cartograph/data/${s}/clean`))

let measured = 0
for (const scene of scenes) {
  const f = feed(scene); if (!f) continue
  const tg = buildProto(f); measured++
  const groups = [['① proto', tg.proto], ...Object.entries(tg.protoBands).map(([k, v]) => [k, v])]
  const hits = [], widths = {}
  for (const [name, rings] of groups) {
    const ws = []
    for (const r of (rings || [])) {
      if (r.length < 3) continue
      const m = ringM(r); ws.push(m.w)
      if (m.w < W_MIN || Math.abs(m.a) < A_MIN)
        hits.push({ band: name, area: +Math.abs(m.a).toFixed(3), w: +m.w.toFixed(4), verts: r.length, at: m.C.map(v => +v.toFixed(1)) })
    }
    ws.sort((a, b) => a - b)
    widths[name] = ws.length ? +ws[Math.floor(ws.length / 2)].toFixed(2) : null
  }
  hits.sort((a, b) => a.w - b.w)
  const by = {}; for (const h of hits) by[h.band] = (by[h.band] || 0) + 1
  console.log(`\n${scene}  (look ${f.look} · ${f.slots} authored slots · curbWidth ${f.curbWidth})`)
  console.log(`  ① SOURCE: ${tg.protoSource}`)
  console.log(`  median mean-width per ring set: ${JSON.stringify(widths)} m`)
  console.log(`  ⇒ ${hits.length ? '⛔ FAIL' : '✅ PASS'}: ${hits.length} hairline ring(s) — ${JSON.stringify(by)}`)
  for (const h of hits.slice(0, 6)) console.log(`     ${String(h.band).padEnd(9)} ${String(h.area).padStart(7)} m²  W ${h.w} m  ${String(h.verts).padStart(3)} verts  at ${h.at}`)

  // If the operator has marked this scene, say how many hairlines each mark encloses.
  const mp = `cartograph/data/${scene}/clean/marker_strokes.json`
  if (fs.existsSync(mp)) {
    const strokes = JSON.parse(fs.readFileSync(mp, 'utf8'))
    if (strokes.length) console.log(`  marker strokes (${strokes.length}) — hairlines enclosed:`)
    strokes.forEach((st, i) => {
      const cx = st.reduce((s, p) => s + p.x, 0) / st.length, cz = st.reduce((s, p) => s + p.z, 0) / st.length
      let rad = 0; for (const p of st) rad = Math.max(rad, Math.hypot(p.x - cx, p.z - cz))
      const n = hits.filter(h => Math.hypot(h.at[0] - cx, h.at[1] - cz) <= rad * 1.2).length
      console.log(`     ${String(i).padStart(2)} @ ${cx.toFixed(0)},${cz.toFixed(0)}  r ${rad.toFixed(0)} m  → ${n}`)
    })
  }
}
if (!measured) { console.log('⛔ NOTHING WAS MEASURED — no scene fed. This is a failure, not a pass.'); process.exit(2) }
