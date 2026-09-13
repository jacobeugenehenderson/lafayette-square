#!/usr/bin/env node
// ⛔⛔ HOW MANY APEXES DOES ① PUT AT A DEAD-END TIP? — Jacob, 2026-09-06: "There are 2 apexes."
//
// WHY IT MATTERS. `RIBBONS §1` carries an UNMADE RULING: "a single cubic cannot hold a half-turn;
// the coupler is TWO segments split at the apex, or the bezier is ruled canonical and bbf4adf6's
// circle becomes its approximation. Jacob's call, not made." ⭐ That question only exists if the
// tip is ONE node turning 180°. If the contour instead carries TWO nodes, each turning ~90°, with
// the crossing between them, then no node holds a half-turn and there is nothing to rule.
//
// ⛔ THIS DOES NOT ASSERT THE ANSWER — it counts. For every degree-1 chain end, find ①'s contour
// vertices near the tip and report how many there are and how far apart, plus the TURN each one
// takes. Two vertices ~ε apart turning ~90° each is the two-apex structure; one vertex turning
// ~180° is the half-turn.
// ⭐ The comparison that gives it teeth: `coupler-slit-universal.mjs` reports `gap=0.000m` on every
// LS tip in the FROZEN artifact — the collapsed-node signature. If ① separates them and the freeze
// does not, the two apexes are real and the freeze is where they die.
// ⛔ ① is width-free by ruling, so this reads the mint directly and takes NO authoring (correct here).
// ▶ node checks/claims-proto-tip-has-two-apexes.mjs [scene ...]
import fs from 'fs'
import { mintProtopolygon } from '../src/lib/tileGround.js'

const scenes = process.argv.slice(2); if (!scenes.length) scenes.push('lafayette-square')
const RIB = (s) => s === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${s}/clean/ribbons.json`
const EPS = 0.005
const ang = (a, b, c) => {   // interior turn at b, degrees
  const u = [a[0]-b[0], a[1]-b[1]], v = [c[0]-b[0], c[1]-b[1]]
  const d = (u[0]*v[0]+u[1]*v[1]) / ((Math.hypot(...u)||1)*(Math.hypot(...v)||1))
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI
}
for (const scene of scenes) {
  const p = RIB(scene); if (!fs.existsSync(p)) { console.log(`⛔ ${scene}: no ribbons — SKIPPED LOUDLY`); continue }
  const rb = JSON.parse(fs.readFileSync(p, 'utf8'))
  const streets = (rb.streets || []).filter(s => s.points?.length >= 2)
  const MP = mintProtopolygon({ streets, gradeSep: [], eps: EPS })

  // degree-1 ends: an endpoint no other chain endpoint shares (1 cm bucket)
  const cnt = new Map(), K = (q) => `${Math.round(q[0]*100)},${Math.round(q[1]*100)}`
  for (const s of streets) for (const q of [s.points[0], s.points.at(-1)]) cnt.set(K(q), (cnt.get(K(q))||0)+1)
  const tips = []
  for (const s of streets) for (const q of [s.points[0], s.points.at(-1)]) if (cnt.get(K(q)) === 1) tips.push({ name: s.skelId || s.name, q })

  const hist = new Map(); const turns = []; const gaps = []
  for (const t of tips) {
    let near = []
    for (const rg of MP.rings) for (let i = 0; i < rg.length; i++)
      if (Math.hypot(rg[i][0]-t.q[0], rg[i][1]-t.q[1]) < EPS * 3) near.push({ rg, i })
    hist.set(near.length, (hist.get(near.length)||0)+1)
    for (const { rg, i } of near) turns.push(ang(rg[(i-1+rg.length)%rg.length], rg[i], rg[(i+1)%rg.length]))
    if (near.length === 2) gaps.push(Math.hypot(near[0].rg[near[0].i][0]-near[1].rg[near[1].i][0], near[0].rg[near[0].i][1]-near[1].rg[near[1].i][1]))
  }
  const q50 = (a) => { const s=[...a].sort((x,y)=>x-y); return s.length? s[s.length>>1] : NaN }
  console.log(`\n${scene}: ${tips.length} degree-1 tip(s), ε=${EPS} m`)
  console.log(`   ① contour vertices found within 3ε of the tip:`)
  for (const [n, c] of [...hist].sort((a,b)=>a[0]-b[0])) console.log(`      ${n} vertex/vertices  ->  ${c} tip(s)`)
  console.log(`   median TURN at those vertices: ${q50(turns)?.toFixed(1)}°   (90° => two apexes · 180° => one half-turn)`)
  if (gaps.length) console.log(`   median SEPARATION of the pair: ${q50(gaps)?.toFixed(4)} m   (ε = ${EPS} m; 0.0000 = collapsed)`)
}
console.log('\n⛔ re-run this; do not quote its digits.')
