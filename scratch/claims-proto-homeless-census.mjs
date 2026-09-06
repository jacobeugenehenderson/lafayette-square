#!/usr/bin/env node
// ⭐ WHAT ARE ①'s HOMELESS HOLES? — the census behind `claims-proto-tiles-vs-faces`.
//
// That probe reports a COUNT (LS 34 of 155 · HPDM 1110 of 1282) and the standing explanation
// — "① builds FULL, tiles are CROPPED" — was sized on LS alone. ⛔ It cannot carry 1110/1282.
// This asks what the homeless ACTUALLY are, on dimensions that separate the candidate causes:
//   · SIZE     — a sliver is an artifact of the mint; a block-sized hole is a real missing tile
//   · THE DISC — outside the boundary ⇒ the crop explains it; inside ⇒ it does not
//   · IDENTITY — can ① name the hole's edges at all? (`streetIdx` on the edge stamp)
// ⛔ Reads the boundary here because this is a DIAGNOSTIC. The construction may not (BRIEF-slice2 §4).
//
// ▶ node scratch/claims-proto-homeless-census.mjs [scene ...]
import fs from 'fs'
import { mintProtopolygon, tilesFromProto } from '../src/lib/tileGround.js'

const scenes = process.argv.slice(2)
if (!scenes.length) scenes.push('lafayette-square', 'hipointe-demun')
const RIB = (s) => s === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${s}/clean/ribbons.json`
const BND = (s) => `cartograph/data/${s}/neighborhood_boundary.json`
const A = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length]; a += x1*y2 - x2*y1 } return a/2 }
const inRing = (rg,x,y) => { let c=false; for(let i=0,j=rg.length-1;i<rg.length;j=i++){const[a,b]=rg[i],[e,f]=rg[j]; if((b>y)!==(f>y)&&x<(e-a)*(y-b)/(f-b)+a)c=!c} return c }
const interior = (r) => {
  let sx=0, sy=0; for (const p of r) { sx+=p[0]; sy+=p[1] }
  const c=[sx/r.length, sy/r.length]; if (inRing(r,c[0],c[1])) return c
  for (let i=0;i<r.length-1;i++){ const m=[(r[i][0]+r[i+1][0])/2,(r[i][1]+r[i+1][1])/2]
    for (const d of [[0.01,0],[-0.01,0],[0,0.01],[0,-0.01]]) { const q=[m[0]+d[0],m[1]+d[1]]; if (inRing(r,q[0],q[1])) return q } }
  return c
}
const BANDS = [[0,1],[1,10],[10,100],[100,1000],[1000,10000],[10000,Infinity]]
const bandName = (a) => { for (const [lo,hi] of BANDS) if (a >= lo && a < hi) return hi===Infinity?`≥${lo}`:`${lo}–${hi}`; return '?' }

for (const scene of scenes) {
  const path = RIB(scene)
  if (!fs.existsSync(path)) { console.log(`\n${scene}: no ribbons at ${path} — SKIPPED LOUDLY`); continue }
  const rb = JSON.parse(fs.readFileSync(path, 'utf8'))
  const streets  = rb.streets.filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
  const gradeSep = rb.streets.filter(s => s?.points?.length >= 2 && s.gradeSeparated)
  const proto = rb.protopolygon?.rings?.length ? rb.protopolygon : mintProtopolygon({ streets, gradeSep })
  const out = tilesFromProto(proto, rb.streets)
  const frozen = rb.tiles || []

  let disc = null
  if (fs.existsSync(BND(scene))) { const b = JSON.parse(fs.readFileSync(BND(scene),'utf8')); disc = { c: b.center||[0,0], r: b.radius, poly: b.boundary } }

  const homeless = []
  for (const t of out.tiles) {
    const p = interior(t.ring)
    if (frozen.some(f => inRing(f.ring, p[0], p[1]))) continue
    const area = Math.abs(A(t.ring))
    const d = disc ? Math.hypot(p[0]-disc.c[0], p[1]-disc.c[1]) : null
    const inDisc = disc ? (disc.poly ? inRing(disc.poly, p[0], p[1]) : d <= disc.r) : null
    const named = (t.edges||[]).filter(e => e?.streetIdx != null).length
    homeless.push({ area, d, inDisc, named, edges: (t.edges||[]).length })
  }

  console.log(`\n${scene}   ① holes ${out.tiles.length} · frozen tiles ${frozen.length} · HOMELESS ${homeless.length}`)
  if (!homeless.length) { console.log('   ✅ none'); continue }
  const inD = homeless.filter(h => h.inDisc === true), outD = homeless.filter(h => h.inDisc === false)
  console.log(`   THE DISC   inside ${inD.length}   outside ${outD.length}${disc ? `   (r=${disc.r})` : '   (no boundary found)'}`)
  console.log(`   SIZE (m²)  ${'band'.padEnd(12)} all   inside-disc`)
  for (const [lo,hi] of BANDS) {
    const f = h => h.area >= lo && h.area < hi
    const n = homeless.filter(f).length; if (!n) continue
    console.log(`              ${(hi===Infinity?`≥${lo}`:`${lo}–${hi}`).padEnd(12)} ${String(n).padStart(4)}  ${String(inD.filter(f).length).padStart(6)}`)
  }
  const tot = homeless.reduce((a,h)=>a+h.area,0), totIn = inD.reduce((a,h)=>a+h.area,0)
  console.log(`   AREA       total ${tot.toFixed(0)} m²   inside-disc ${totIn.toFixed(0)} m²`)
  const unnamed = homeless.filter(h => h.named === 0).length
  console.log(`   IDENTITY   ${unnamed} of ${homeless.length} have NO named edge`)
  const big = inD.filter(h => h.area >= 100).sort((a,b)=>b.area-a.area)
  console.log(`   ⛔ THE ONES THE CROP CANNOT EXPLAIN: ${big.length} inside the disc and ≥100 m²`)
  for (const h of big.slice(0,8)) console.log(`        ${h.area.toFixed(0).padStart(7)} m²   d=${h.d.toFixed(0)}   edges ${h.edges} (${h.named} named)`)
}
console.log('')
