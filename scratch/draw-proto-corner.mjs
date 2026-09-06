#!/usr/bin/env node
// DRAW THE EASED CORNER — the eye-gate for the node handles. READ-ONLY, writes one SVG.
// ⛔ Deliberately NOT `draw-proto-stack.mjs`'s filename: that file is modified in the operator's
// working tree and overwriting it would destroy his state.
// ⭐ Draws ① (the protopolygon ink), ② BEFORE the ease (sharp) and ② AFTER (eased) on top of each
// other, so what the handles changed is the only thing that differs between the two outlines.
// ▶ node scratch/draw-proto-corner.mjs [scene] --at x,z --span m
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'
import { buildTileGround } from '../src/lib/tileGround.js'
const scene = process.argv[2]?.startsWith('--') ? 'lafayette-square' : (process.argv[2] || 'lafayette-square')
const ai = process.argv.indexOf('--at'), si = process.argv.indexOf('--span')
const AT = ai > 0 ? process.argv[ai + 1].split(',').map(Number) : null
const SPAN = si > 0 ? Number(process.argv[si + 1]) : 120
const f = feed(scene); if (!f) process.exit(1)
const r = buildProto(f)
// ⭐ THE CONTROL: the same build with every radius forced to 0. R=0 is zero-length handles, so
// this is the SHARP contour through the identical code path — not a different construction.
const sharp = buildTileGround(f.ribbons, { grout: 'proto', smooth: 0, curbWidth: f.curbWidth,
  blockCustoms: f.blockCustoms, cornerR: 0 })
const P = []
const d = (rg) => 'M' + rg.map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join('L') + 'Z'
// ⛔ Clip to the window BEFORE serialising — the whole town's geometry inside a cropped viewBox
// is a 1.8 MB file that renders one intersection. Bbox-overlap only; no geometry is altered.
const V0 = () => [ (AT ? AT[0] : 0) - SPAN / 2, (AT ? AT[1] : 0) - SPAN / 2,
                   (AT ? AT[0] : 0) + SPAN / 2, (AT ? AT[1] : 0) + SPAN / 2 ]
const near = (rg) => { const [x0,y0,x1,y1] = V0()
  let a=Infinity,b=Infinity,c=-Infinity,e=-Infinity
  for (const q of rg) { if(q[0]<a)a=q[0]; if(q[0]>c)c=q[0]; if(q[1]<b)b=q[1]; if(q[1]>e)e=q[1] }
  return !(c < x0 || a > x1 || e < y0 || b > y1) }
const layer = (rings, fill, stroke, w) => { for (const rg of (rings || [])) if (rg?.length >= 3 && near(rg))
  P.push(`<path d="${d(rg)}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`) }
layer(r.protoBands?.lu, '#3f4a33', 'none', 0)
layer(r.protoBands?.sidewalk, '#efe9dc', 'none', 0)
layer(r.protoBands?.treelawn, '#5d8f35', 'none', 0)
layer(sharp.protoCurb, 'none', '#e2504a', 0.22)     // ② with R=0 — the sharp control
layer(r.protoCurb,     'none', '#3b6ef5', 0.30)     // ② eased at the authored R
layer(r.proto,         'none', '#f0b429', 0.10)     // ① the protopolygon ink
const [cx, cz] = AT || [0, 0]
const vx = cx - SPAN / 2, vy = cz - SPAN / 2
const out = `scratch/proto-corner-${scene}${AT ? `-${cx}_${cz}` : ''}.svg`
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${SPAN} ${SPAN}" width="1400" height="1400">
<rect x="${vx}" y="${vy}" width="${SPAN}" height="${SPAN}" fill="#23241f"/>
${P.join('\n')}
</svg>\n`)
console.log(`▶ ${out}`)
console.log('   RED = the curb with R=0 (sharp control)  ·  BLUE = the same curb eased at the authored R')
console.log('   yellow = ① the protopolygon ink · cream = sidewalk · green = treelawn')
console.log('   ⭐ THE GATE: at every intersection the blue should round the red corner off, and')
console.log('      nothing else about the two outlines should differ.')
