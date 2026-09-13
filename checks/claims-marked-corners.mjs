// ⛔ THE OPERATOR'S EYE, MADE ADDRESSABLE. The Marker Tool writes circled regions to
// `clean/marker_strokes.json`; this classifies what is inside each one by CARRIED IDENTITY, so a
// circle becomes a named class instead of "a corner looks wrong".
// ▶ node checks/claims-marked-corners.mjs [scene]
import fs from 'fs'
import { feed, buildProto } from '../scratch/_proto-feed.mjs'

const scene = process.argv[2] || 'lafayette-square'
const f = feed(scene); if (!f || f.curbWidth == null) process.exit(1)
const marks = JSON.parse(fs.readFileSync(`cartograph/data/${scene}/clean/marker_strokes.json`, 'utf8'))
const strokes = Object.values(marks).filter(Array.isArray)
const tg = buildProto(f, { protoProducer: true })
const PP = f.ribbons.protopolygon, O = PP.owners

const circles = strokes.map((st, i) => {
  const pts = st.map(p => [p.x, p.z])
  let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1] }
  cx /= pts.length; cz /= pts.length
  let r = 0; for (const p of pts) r = Math.max(r, Math.hypot(p[0]-cx, p[1]-cz))
  return { i, c: [cx, cz], r: r * 1.15 }
})

const turnAt = (g, i) => { const n = g.length, P = g[(i-1+n)%n], V = g[i], N = g[(i+1)%n]
  const d1 = Math.atan2(V[1]-P[1], V[0]-P[0]), d2 = Math.atan2(N[1]-V[1], N[0]-V[0])
  let t = (d2-d1)*180/Math.PI; while (t>180) t-=360; while (t<-180) t+=360; return Math.abs(t) }

const tally = {}
console.log(`${scene}: ${circles.length} circled region(s)\n`)
for (const C of circles) {
  // the SHARPEST curb turn inside the circle — that is what the eye caught
  let worst = null
  for (const g of tg.protoCurb || []) for (let i = 0; i < g.length; i++) {
    if (Math.hypot(g[i][0]-C.c[0], g[i][1]-C.c[1]) > C.r) continue
    const t = turnAt(g, i)
    if (!worst || t > worst.t) worst = { t, p: g[i] }
  }
  // the ① block-ring vertex nearest that point — where the identity lives
  let best = null
  for (let k = 0; k < PP.blocks.length; k++) {
    const g = PP.blocks[k], L = PP.blockLabels[k], n = g.length
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(g[i][0]-C.c[0], g[i][1]-C.c[1])
      if (d > C.r * 2) continue
      const t = turnAt(g, i)
      if (t < 25) continue
      if (!best || d < best.d) best = { d, k, i, t, a: O[L[(i-1+n)%n]], b: O[L[i]] }
    }
  }
  let cls
  if (!best) cls = 'NO ① corner near the mark — not a corner class at all'
  else {
    const { a, b } = best
    if (!a || !b) cls = 'unlabelled ① edge'
    else if (a.gradeSeparated || b.gradeSeparated) cls = 'grade-separated (② builds no highway curb)'
    else if (a.tipEnd || b.tipEnd) cls = `dead-end TIP (${a.tipEnd || b.tipEnd})`
    else if (a.skelId !== b.skelId) cls = 'owner CHANGES — the ease should already see this'
    else if (a.hard && b.hard) cls = 'same owner, BROKEN handles — the ease should already see this'
    else cls = 'same owner, a BEZIER runs through — deliberately left alone'
  }
  // ⭐ THE DISCRIMINATOR: was an arc STAMPED here, and what did it achieve? "Not eased" and
  // "eased and still wrong" are different defects and must not share a bucket.
  const near = (tg.cornerSet || []).filter(c => Math.hypot(c.fillet.apex[0]-C.c[0], c.fillet.apex[1]-C.c[1]) < C.r * 1.5)
  const arcR = near.length ? near.map(c => c.fillet.r).sort((a,b)=>a-b)[Math.floor(near.length/2)] : null
  const sharpLeft = worst && worst.t >= 60
  const state = !near.length ? 'NOT EASED — no arc stamped here'
    : sharpLeft ? `EASED (${near.length} arc, r=${arcR.toFixed(2)} m) BUT a ${worst.t.toFixed(0)}° turn survives`
    : `eased, r=${arcR.toFixed(2)} m, no sharp turn left`
  cls = `${state}   [${cls}]`
  tally[state.split('(')[0].split('—')[0].trim()] = (tally[state.split('(')[0].split('—')[0].trim()] || 0) + 1
  console.log(`  #${String(C.i).padStart(2)} at ${C.c[0].toFixed(0)},${C.c[1].toFixed(0)} r=${C.r.toFixed(0)}m` +
    ` · sharpest curb turn inside: ${worst ? worst.t.toFixed(0)+'°' : 'none'}` +
    (best ? ` · ①(${best.a?.skelId} | ${best.b?.skelId}) turn ${best.t.toFixed(0)}°` : ''))
  console.log(`        ⇒ ${cls}`)
}
console.log('\nTALLY:')
for (const [k, v] of Object.entries(tally).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(2)} × ${k}`)
