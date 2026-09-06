#!/usr/bin/env node
// DRAW ①②③ — the protopolygon, the curb offset from it, and the ped stack painted inward.
// READ-ONLY, writes one SVG. The eye is the gate; every number so far is a distance against
// a curb the same run built, which can be uniformly wrong and still score well.
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'
const scene = process.argv[2] || 'lafayette-square'
// --at x,z --span m : crop to a window so a band 1.5 m wide is actually visible
const ai = process.argv.indexOf('--at'), si = process.argv.indexOf('--span')
const AT = ai > 0 ? process.argv[ai + 1].split(',').map(Number) : null
const SPAN = si > 0 ? Number(process.argv[si + 1]) : 300
const RIB = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
const rb = JSON.parse(fs.readFileSync(RIB, 'utf8'))
const f = feed(scene)
if (!f) process.exit(1)
const r = buildProto(f, { quiet: false })
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
// ⛔⛔ ONE PATH PER BAND, `fill-rule="evenodd"` — A BAND IS A COMPOUND PATH.
// An annulus is an outer ring PLUS a hole. Emitting each ring as its own filled <path> paints the
// outer solid and then the HOLE solid on top, in the same colour — a 0.381 m curb strip renders as a
// filled 19,816 m² block. That artefact was read as "band floods" and "black wedges" for hours,
// 2026-09-06, in geometry that was fine.
const layer = (rings, fill) => {
  const keep = (rings || []).filter(rg => rg?.length >= 3)
  if (keep.length) P.push(`<path d="${keep.map(d).join(' ')}" fill="${fill}" fill-rule="evenodd" stroke="none"/>`)
}
layer(B.lu, '#a8cf7a')          // the block interior — everything inside the sidewalk
layer(B.sidewalk, '#efe9dc')    // sidewalk
layer(B.treelawn, '#6aa83a')    // treelawn
layer(B.curb, '#6f6f68')        // the curb itself — ⛔ was `B.curbBand`, a key `protoBands` has never had, so this layer silently drew nothing
for (const rg of (r.proto || [])) if (rg?.length >= 3) P.push(`<path d="${d(rg)}" fill="none" stroke="#3b6ef5" stroke-width="0.4" opacity="0.5"/>`)
const pad = 40
let vx = x0 - pad, vy = y0 - pad, vw = x1 - x0 + 2 * pad, vh = y1 - y0 + 2 * pad
if (AT) { vx = AT[0] - SPAN / 2; vy = AT[1] - SPAN / 2; vw = SPAN; vh = SPAN }
const out = `scratch/proto-preview-${scene}${AT ? '-crop' : ''}.svg`   // ⛔ NOT proto-stack-*: that file is modified in the operator's working tree
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="1600">
<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#23241f"/>
${P.join('\n')}
</svg>\n`)
console.log(`\n▶ ${out}`)
console.log('   pale green = block interior · cream = SIDEWALK · dark green = treelawn · grey = the curb')
console.log('   blue = ① the protopolygon ink itself')
console.log('   ⭐ THE GATE: a seam is IMPOSSIBLE if this is truly offset from ①. If you see one, chains are still in it.\n')
