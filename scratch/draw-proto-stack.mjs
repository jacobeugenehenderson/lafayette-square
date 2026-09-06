#!/usr/bin/env node
// DRAW ①②③ — the protopolygon, the curb offset from it, and the ped stack painted inward.
// READ-ONLY, writes one SVG. The eye is the gate; every number so far is a distance against
// a curb the same run built, which can be uniformly wrong and still score well.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const scene = process.argv[2] || 'lafayette-square'
const RIB = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
const rb = JSON.parse(fs.readFileSync(RIB, 'utf8'))
const r = buildTileGround(rb, { grout: 'proto', smooth: 0 })
const P = []
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
const bb = (rg) => { for (const p of rg) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1] } }
for (const rg of (r.protoCurb || [])) bb(rg)
const d = (rg) => 'M' + rg.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join('L') + 'Z'
// ⭐ THE BANDS ARE DIFFERENCES BETWEEN SUCCESSIVE OFFSETS OF ONE CONTOUR — no strokes, no
// per-run pieces. So a SEAM in any band is proof that chains are still in the construction.
// Drawn with NO stroke on the fills, so any seam that appears is real geometry and not a
// hairline I painted between two polygons.
const B = r.protoBands || {}
const layer = (rings, fill) => { for (const rg of (rings || [])) if (rg?.length >= 3) P.push(`<path d="${d(rg)}" fill="${fill}" stroke="none"/>`) }
layer(B.lu, '#a8cf7a')          // the block interior — everything inside the sidewalk
layer(B.sidewalk, '#efe9dc')    // sidewalk
layer(B.treelawn, '#6aa83a')    // treelawn
layer(B.curbBand, '#6f6f68')    // the curb itself
for (const rg of (r.proto || [])) if (rg?.length >= 3) P.push(`<path d="${d(rg)}" fill="none" stroke="#3b6ef5" stroke-width="0.4" opacity="0.5"/>`)
const pad = 40
const out = `scratch/proto-stack-${scene}.svg`
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0-pad} ${y0-pad} ${x1-x0+2*pad} ${y1-y0+2*pad}" width="1800">
<rect x="${x0-pad}" y="${y0-pad}" width="${x1-x0+2*pad}" height="${y1-y0+2*pad}" fill="#23241f"/>
${P.join('\n')}
</svg>\n`)
console.log(`\n▶ ${out}`)
console.log('   pale green = block interior · cream = SIDEWALK · dark green = treelawn · grey = the curb')
console.log('   blue = ① the protopolygon ink itself')
console.log('   ⭐ THE GATE: a seam is IMPOSSIBLE if this is truly offset from ①. If you see one, chains are still in it.\n')
