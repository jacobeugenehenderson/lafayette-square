/**
 * HOW MUCH OF THE TREE ATLAS SHEET IS ACTUALLY USED?
 *
 * Every region the manifest maps — bark tiles, leaf tiles, and the posterized / detail /
 * gradient slots — measured against the sheet the runtime downloads. Regions shared between
 * species are counted ONCE, so the number is occupancy, not a sum of consumers.
 *
 * ⛔ THE UV CONVENTION IS THE TRAP AND IT COST TWO WRONG READINGS IN ONE DAY (2026-08-26/27):
 * glTF's UV origin is the image TOP-left, so image y = v * H. Sampling with `(1 - v) * H` —
 * the OpenGL convention — reads a different strip and returns plausible, wrong colours.
 *
 * ▶ BACKLOG "2026-08-27 — BARK: VECTOR COLOUR OVER TESSELLATED GREYSCALE", step 4.
 *
 *   node scratch/atlas-occupancy.mjs [look]
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const ROOT = path.join(import.meta.dirname, '..')
const look = process.argv[2] || 'lafayette-square'
const a = JSON.parse(readFileSync(path.join(ROOT, 'public/baked', look, 'trees-atlas.json'), 'utf8'))
const file = path.join(ROOT, 'public', a.atlas.colorPath.replace(/^\//, ''))
const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
const W = info.width, H = info.height, ch = info.channels
function hue(r,g,b){const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;let h;if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;return (h*60+360)%360}

// glTF UV origin is the image TOP-LEFT: y = v * H  (NOT (1-v)*H — that is OpenGL).
function sampleTile(t) {
  const { offsetU, offsetV, scaleU, scaleV } = t.uvTransform
  const x0 = Math.round(offsetU * W), x1 = Math.round((offsetU + scaleU) * W)
  const y0 = Math.round(offsetV * H), y1 = Math.round((offsetV + scaleV) * H)
  let R=0,G=0,B=0,N=0
  for (let y=y0;y<y1;y+=2) for (let x=x0;x<x1;x+=2) {
    const o=(y*W+x)*ch
    if (ch===4 && data[o+3]<200) continue
    R+=data[o];G+=data[o+1];B+=data[o+2];N++
  }
  const px=Math.max(1,Math.ceil((x1-x0)/2)*Math.ceil((y1-y0)/2))
  return N ? { rgb:[R/N|0,G/N|0,B/N|0], hue:hue(R/N,G/N,B/N), opaque:100*N/px } : null
}
console.log(`${path.basename(file)}  ${W}×${H}`)
for (const t of a.tiles) {
  const s = sampleTile(t)
  const who = t.refs.slice(0,2).map(r=>r.species).join(',') + (t.refs.length>2?` +${t.refs.length-2}`:'')
  console.log(`  ${t.classification.padEnd(5)} #${t.tileIndex}  ${s ? `rgb(${s.rgb}) hue ${s.hue.toFixed(0).padStart(3)}  opaque ${s.opaque.toFixed(0).padStart(3)}%` : 'EMPTY'}   ${who}`)
}
// ⛔ EVERY mapped region, not just `tiles` — the posterized, detail and gradient slots live in
// the SAME sheet and are addressed by their own uvTransforms. Counting tiles alone understates
// occupancy by more than half. Deduped by rect, because a region shared across species is one
// piece of the sheet, not N.
const rects = new Map()
const add = (t) => { if (!t?.scaleU) return
  rects.set([t.offsetU, t.offsetV, t.scaleU, t.scaleV].join(','), (t.scaleU * W) * (t.scaleV * H)) }
for (const t of a.tiles) add(t.uvTransform)
for (const v of Object.values(a.barkPosterizedBySpecies || {})) add(v.uvTransform)
for (const v of Object.values(a.barkDetailBySpecies || {})) add(v.uvTransform)
for (const byV of Object.values(a.barkGradientByVariant || {})) for (const v of Object.values(byV)) add(v.uvTransform || v)
let used = 0
for (const px of rects.values()) used += px
const sheet = W * H
console.log(`\ndistinct regions ${rects.size}`)
console.log(`used   ${(used/1e6).toFixed(2)} MP of ${(sheet/1e6).toFixed(2)} MP sheet = ${(100*used/sheet).toFixed(1)}%`)
console.log(`empty  ${((sheet-used)/1e6).toFixed(2)} MP — shipped to every viewer in the colour AND normal sheets`)
