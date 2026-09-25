// Plumb, 2026-09-24 — BRIEF-junction-shape-where-the-offset-crosses, Phase 1 (read-only).
// Builds ①②③ in memory through the ONE feed (authoring loaded) and reports, per tile whose ② ring
// meets a window: the ① block ring, the ② curb contour (iaFull), and the drawn curb layer —
// self-crossings, reversal-ish turns, and each ② edge's length against its OWNING ① edge.
//   node scratch/plumb-junction-probe.mjs <scene> --at x,z --span m [--svg out.svg]
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'
const scene = process.argv[2]
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? (process.argv.includes(`--${k}`) ? process.argv[process.argv.indexOf(`--${k}`) + 1] : null)
const [cx, cz] = (arg('at') || '0,0').split(',').map(Number), span = +(arg('span') || 150)
const f = feed(scene); if (!f) process.exit(2)
const warns = []; const w0 = console.warn; console.warn = (...a) => warns.push(a.join(' '))
const tg = buildProto(f, { emitArtifact: true, protoProducer: true, protoArtifact: true })
console.warn = w0
const tiles = tg.protoShapeTiles || []
const inWin = (p) => Math.abs(p[0] - cx) < span && Math.abs(p[1] - cz) < span
const segX = (a, b, c, d) => { const o = (p, q, r) => (q[0]-p[0])*(r[1]-p[1]) - (q[1]-p[1])*(r[0]-p[0])
  const d1 = o(a,b,c), d2 = o(a,b,d), d3 = o(c,d,a), d4 = o(c,d,b); return d1*d2 < 0 && d3*d4 < 0 }
export const selfX = (r) => { const n = r.length, out = []
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue
    if (segX(r[i], r[(i+1)%n], r[j], r[(j+1)%n])) out.push([i, j]) } return out }
const turn = (r, i) => { const n = r.length, P = r[(i-1+n)%n], V = r[i], N = r[(i+1)%n]
  const t = Math.atan2(N[1]-V[1], N[0]-V[0]) - Math.atan2(V[1]-P[1], V[0]-P[0]); return Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) * 180 / Math.PI }
const area = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i+1)%r.length]; s += p[0]*q[1]-q[0]*p[1] } return s / 2 }
const fx = (p) => `(${p[0].toFixed(1)}, ${p[1].toFixed(1)})`
console.log(`${scene}: ${tiles.length} proto tiles · window ${fx([cx,cz])} ±${span} m`)
const hits = []
tiles.forEach((t, ti) => {
  const rings = t.iaFull || []
  if (!rings.some(r => r.some(inWin)) && !(t.ring || []).some(inWin)) return
  hits.push(ti)
  const R1 = t.ring || []
  console.log(`\n── tile ${ti} lu=${t.lu} cls=${t.blockClass || 'block'} · ① ring ${R1.length} v, area ${Math.abs(area(R1)).toFixed(0)} m², selfX ${selfX(R1).length}`)
  rings.forEach((r, ri) => {
    const sx = selfX(r), sharp = r.map((_, i) => [i, turn(r, i)]).filter(([, a]) => a > 120)
    console.log(`   ② iaFull[${ri}] ${r.length} v, area ${area(r).toFixed(1)} m², selfX ${sx.length}${sx.length ? ' e.g. ' + sx.slice(0,3).map(([i,j]) => `${i}×${j}@${fx(r[i])}`).join(' ') : ''}, turns>120°: ${sharp.length}${sharp.length ? ' ' + sharp.slice(0,6).map(([i,a]) => `${a.toFixed(0)}°@${fx(r[i])}`).join(' ') : ''}`)
  })
  ;(t.iA || []).forEach((r, ri) => { const sx = selfX(r); if (sx.length) console.log(`   ② iA(cut)[${ri}] selfX ${sx.length}`) })
})
const curbX = (tg.curb || []).filter(r => r.some(inWin)).map(r => ({ r, sx: selfX(r) }))
console.log(`\ndrawn curb layer rings in window: ${curbX.length}; self-crossing: ${curbX.filter(c => c.sx.length).length}`)
for (const c of curbX.filter(c => c.sx.length)) console.log(`   curb ring ${c.r.length} v selfX ${c.sx.length} at ${c.sx.slice(0,4).map(([i]) => fx(c.r[i])).join(' ')}`)
const svgOut = arg('svg')
if (svgOut) {
  const S = 800 / (2 * span), X = (p) => ((p[0] - cx + span) * S).toFixed(1), Y = (p) => ((p[1] - cz + span) * S).toFixed(1)
  const path = (r, st) => `<path d="M${r.map(p => `${X(p)},${Y(p)}`).join('L')}Z" ${st}/>`
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="#fff"/>`
  for (const r of tg.proto || []) s += path(r, 'fill="none" stroke="#000" stroke-width="1"')
  for (const ti of hits) for (const r of tiles[ti].iaFull || []) s += path(r, 'fill="rgba(60,120,220,0.15)" stroke="#36c" stroke-width="1"')
  for (const r of (tg.sidewalk || []).filter(r => r.some(inWin))) s += path(r, 'fill="rgba(240,200,60,0.35)" stroke="#b80" stroke-width="0.6"')
  for (const r of Object.values(tg.treelawnByLu || {}).flat().filter(r => r.some(inWin))) s += path(r, 'fill="rgba(60,180,60,0.35)" stroke="#080" stroke-width="0.6"')
  for (const c of curbX) s += path(c.r, 'fill="rgba(200,50,50,0.3)" stroke="#c33" stroke-width="0.6"')
  for (const ti of hits) for (const r of tiles[ti].iaFull || []) { const q = r.filter(inWin); if (!q.length) continue; const m = q[Math.floor(q.length/2)]; s += `<text x="${X(m)}" y="${Y(m)}" font-size="12" fill="#090">${ti}</text>` }
  for (const ti of hits) for (const r of tiles[ti].iaFull || []) for (const p of r) if (inWin(p)) s += `<circle cx="${X(p)}" cy="${Y(p)}" r="1.5" fill="#36c"/>`
  s += `<text x="8" y="16" font-size="12">${scene} ${fx([cx,cz])} ±${span} m · black ① · blue ② iaFull · red drawn curb</text></svg>`
  fs.writeFileSync(svgOut, s); console.log(`svg → ${svgOut}`)
}
if (process.argv.includes('--warns')) for (const w of warns) console.log('WARN', w.slice(0, 300))
