#!/usr/bin/env node
// ⭐ DRAW ① AND NOTHING ELSE — navy fill, hot-pink stroke. Jacob, 2026-09-06.
// READ-ONLY, writes one SVG. It reads the FROZEN artifact (`ribbons.json.protopolygon`), i.e.
// exactly what shipped, not a live rebuild — so what you see is what the consumer consumes.
//
// ⛔⛔ ONE <path>, `fill-rule="evenodd"`. ① IS A COMPOUND PATH: its holes ARE the blocks.
// Emitting each ring as its own filled <path> paints the outer solid and then paints every hole
// solid on top of it, in the same colour — the blocks vanish and ① reads as one filled blob.
// That exact artefact was read as "band floods" and "black wedges" for hours on 2026-09-06
// before the renderer was found to be the liar rather than the geometry.
//
// ▶ node scratch/draw-protopolygon.mjs [scene] [--at x,z] [--span m]
import fs from 'fs'
import clipperLib from 'clipper-lib'

const scene = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || 'lafayette-square'
const ai = process.argv.indexOf('--at'), si = process.argv.indexOf('--span')
const AT = ai > 0 ? process.argv[ai + 1].split(',').map(Number) : null
const SPAN = si > 0 ? Number(process.argv[si + 1]) : null

const RIB = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
if (!fs.existsSync(RIB)) { console.error(`⛔ ${scene}: no ribbons at ${RIB} — SKIPPED LOUDLY, nothing drawn.`); process.exit(2) }
const P = JSON.parse(fs.readFileSync(RIB, 'utf8')).protopolygon
if (!P?.rings?.length) { console.error(`⛔ ${scene}: ribbons carry NO protopolygon. Re-pour the scene; NOT drawing a substitute.`); process.exit(2) }

const rings = P.rings.filter(r => r?.length >= 3)
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
for (const r of rings) for (const p of r) { if (p[0]<x0)x0=p[0]; if (p[0]>x1)x1=p[0]; if (p[1]<y0)y0=p[1]; if (p[1]>y1)y1=p[1] }
if (AT && SPAN) { x0 = AT[0]-SPAN/2; x1 = AT[0]+SPAN/2; y0 = AT[1]-SPAN/2; y1 = AT[1]+SPAN/2 }
const pad = (x1-x0) * 0.02
x0 -= pad; x1 += pad; y0 -= pad; y1 += pad
const W = x1-x0, H = y1-y0
const PX = 1600, sc = PX / W

// ⛔ ORIENTATION IS REPORTED, NEVER INTERPRETED. This codebase carries BOTH shoelace sign
// conventions — this script's count of "positive" rings came out 108/7 where `derive.js`'s ①
// freeze log says "108 holes", i.e. exactly inverted. Guessing which is which is how "no medians
// on either town" got reported on 2026-09-06. `fill-rule="evenodd"` needs no orientation at all,
// so the DRAWING is correct either way and this line is a census, not a claim.
const sa = (r) => { let a = 0; for (let i=0,j=r.length-1;i<r.length;j=i++) a += (r[j][0]+r[i][0])*(r[j][1]-r[i][1]); return a/2 }
const posN = rings.filter(r => sa(r) > 0).length

// ⛔⛔ THE STROKE IS NOT THE SHAPE, AND THIS HARNESS PRETENDED IT WAS — TWICE.
// v1 drew ① with a stroke 1.5px converted to WORLD units — 1.74 m at scene scale, 350× wider
// than ① itself (ε = 0.005 m) — so every visible band was the stroke and ① was the hairline
// buried in it. Jacob: "This is a FAILED protopolygon. I am looking at FUCKING paths with
// thicknesses."
// v2 over-corrected to a hairline, which threw away the point. Jacob: "The expanded path IS THE
// WHOLE POINT." ① is defined as "Expand appearance, then Pathfinder > JOIN" — the EXPANSION is
// the mechanism and ε only makes the width nominal. A hairline hides the joins, the corners and
// the holes, which is everything ① carries.
//
// ⭐ SO `--expand <m>` IS A TRUE POLYGON OFFSET, NOT A STROKE. Stroking the ring paints a band
// centred ON the outline and leaves holes UNCHANGED; expanding offsets the compound path, so the
// ink grows and every hole SHRINKS by the same amount — which is what "expand appearance" does
// and the only version whose topology you can trust. jtMiter/etClosedPolygon: ① has sharp
// corners by ruling and an expansion must not invent round ones.
// ⛔ It is stamped in the SVG and the console: an expanded ① is a DIFFERENT OBJECT from ①, and
// conflating the two is exactly the mistake above. Never expand silently.
const ei = process.argv.findIndex(a => a === '--expand' || a === '--dilate')
const EXPAND = ei > 0 ? Number(process.argv[ei + 1]) : 0
let drawRings = rings
if (EXPAND > 0) {
  const SC = 1e6
  const co = new clipperLib.ClipperOffset(2, 0.25)
  co.AddPaths(rings.map(r => r.map(p => ({ X: Math.round(p[0]*SC), Y: Math.round(p[1]*SC) }))),
    clipperLib.JoinType.jtMiter, clipperLib.EndType.etClosedPolygon)
  const out = []
  co.Execute(out, EXPAND * SC)
  if (!out.length) { console.error(`⛔ expansion by ${EXPAND} m produced NOTHING — not falling back to the un-expanded contour.`); process.exit(2) }
  drawRings = out.map(pth => pth.map(q => [q.X/SC, q.Y/SC]))
}
const d = drawRings.map(r => 'M' + r.map(p => p[0].toFixed(2)+','+p[1].toFixed(2)).join('L') + 'Z').join(' ')
const body = `<path d="${d}" fill="#0a1a4a" fill-rule="evenodd" stroke="#ff2d95" stroke-width="1" vector-effect="non-scaling-stroke"/>`
  + (EXPAND > 0 ? `\n<text x="${x0 + W*0.02}" y="${y0 + H*0.05}" font-family="monospace" font-size="${W*0.02}" fill="#ff2d95">EXPANDED ${EXPAND} m — NOT the ink width (e=${P.eps} m). Topology true, thickness not.</text>` : '')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${Math.round(PX*H/W)}" viewBox="${x0} ${y0} ${W} ${H}">
<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#ffffff"/>
${body}
</svg>`
const out = `scratch/protopolygon-${scene}${AT&&SPAN?`-${AT[0]}_${AT[1]}`:''}${EXPAND>0?`-expand${EXPAND}`:''}.svg`
fs.writeFileSync(out, svg)
console.log(`① ${scene}: ${rings.length} ring(s) — ${posN} of one orientation, ${rings.length-posN} of the other, ε=${P.eps} m`)
console.log(`   ⛔ which class is "hole" is NOT asserted (both sign conventions live in this repo); evenodd needs no orientation.`)
console.log(`   extent ${W.toFixed(0)} × ${H.toFixed(0)} m${AT&&SPAN?`  (cropped at ${AT} span ${SPAN} m)`:''}`)
if (EXPAND > 0) console.log(`   ⭐ EXPANDED ${EXPAND} m — a true polygon offset (holes shrink with it), jtMiter so corners stay sharp. ⛔ NOT ①'s ink width (ε=${P.eps} m).`)
else console.log(`   un-expanded: ① is ${P.eps} m of ink, invisible at this scale. Use --expand <m> — the expanded path is the readable object.`)
console.log(`   → ${out}`)
