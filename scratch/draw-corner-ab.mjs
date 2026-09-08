#!/usr/bin/env node
// ⭐⭐⭐ OVERLAY THE CORRECT CORNERS ON OURS. *(Jacob: "Can you not overlay the correct ones and
// compare?")* ▶ node scratch/draw-corner-ab.mjs [--at x,z] [--span 60]
//
// LEFT = what `origin/main` draws — the code that is DEPLOYED and that Jacob calls mostly correct
// (chain-produced, walk painter). RIGHT = what this branch draws (① + the stamp painter).
// OVERLAY = both, main in outline over ours filled, so a difference is a place they disagree.
// ⛔ Both are built from the SAME ribbons and the SAME authoring, so the only variable is the code.
import fs from 'fs'
// ⛔ main's painter is imported FROM A WORKTREE AT `origin/main`, with its own `src/lib` — splicing
// one file into this tree fails, because the deployed painter depends on the deployed helpers. The
// point of this harness is that the ONLY variable is the code, so it has to be all of the code.
const MAIN = await import('../.claude/worktrees/main-ref/src/lib/tileGround.js')
const OURS = await import('../src/lib/tileGround.js')
const idx = JSON.parse(fs.readFileSync('public/looks/index.json', 'utf8'))
const look = (idx.looks || []).find(l => l.id === 'lafayette-square') || (idx.looks || [])[0]
const design = JSON.parse(fs.readFileSync(`public/looks/${look.id}/design.json`, 'utf8'))
const rb = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const argv = process.argv.slice(2)
const AT = (() => { const i = argv.indexOf('--at'); return i >= 0 ? argv[i + 1].split(',').map(Number) : null })()
const SPAN = (() => { const i = argv.indexOf('--span'); return i >= 0 ? Number(argv[i + 1]) : 70 })()
const opts = { curbWidth: design.curbWidth, blockCustoms: design.blockCustoms || null, blockLandUse: design.blockLandUse,
  cornerRadiusScale: design.cornerRadiusScale, cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides, emitArtifact: true }
const quiet = (fn) => { const p = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}
  try { return fn() } finally { console.log = p; console.warn = w } }
const A = quiet(() => MAIN.buildTileGround(rb, { ...opts }))
const B = quiet(() => OURS.buildTileGround(rb, { ...opts, grout: 'proto', protoProducer: true, protoArtifact: true }))
// pick the busiest corner if none given: the point where the two disagree most
const cen = (rs) => { let n = 0, x = 0, y = 0; for (const g of rs || []) for (const p of g) { x += p[0]; y += p[1]; n++ } return n ? [x / n, y / n] : [0, 0] }
const C = AT || cen(B.sidewalk).map(v => v)
const [cx, cz] = C, S = 900 / SPAN
const px = (p) => [((p[0] - cx) * S + 450).toFixed(1), ((p[1] - cz) * S + 450).toFixed(1)]
const path = (rs) => (rs || []).map(g => 'M' + g.map(p => px(p).join(',')).join('L') + 'Z').join('')
const near = (rs) => (rs || []).filter(g => g.some(p => Math.abs(p[0] - cx) < SPAN && Math.abs(p[1] - cz) < SPAN))
const panel = (r, dx, title) => `<g transform="translate(${dx},0)">
  <rect width="900" height="900" fill="#4a4a4a"/>
  <path d="${path(near(r.asphalt))}" fill="#3d3d3d"/>
  <path d="${path(near(r.block))}" fill="#7fa650"/>
  <path d="${path(near(Object.values(r.treelawnByLu||{}).flat()))}" fill="#c8a464"/>
  <path d="${path(near(r.sidewalk))}" fill="#ded8cc"/>
  <path d="${path(near(r.curb))}" fill="#b9b2a4"/>
  <text x="14" y="30" font="14px sans-serif" fill="#fff" font-size="20">${title}</text></g>`
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2740" height="900" viewBox="0 0 2740 900">
${panel(A, 0, 'origin/main — DEPLOYED, mostly correct')}
${panel(B, 920, 'this branch — ① + stamp painter')}
<g transform="translate(1840,0)"><rect width="900" height="900" fill="#4a4a4a"/>
  <path d="${path(near(B.sidewalk))}" fill="#ded8cc"/>
  <path d="${path(near(A.sidewalk))}" fill="none" stroke="#e0245e" stroke-width="2"/>
  <text x="14" y="30" fill="#fff" font-size="20">OVERLAY — ours filled, main's outline in red</text></g>
</svg>`
fs.writeFileSync('scratch/corner-ab.svg', svg)
console.log(`centre ${cx.toFixed(1)},${cz.toFixed(1)} · span ${SPAN} m`)
console.log(`main : ${(A.sidewalk||[]).length} sidewalk rings · ours: ${(B.sidewalk||[]).length}`)
console.log('▶ scratch/corner-ab.svg')
