#!/usr/bin/env node
// ⭐⭐⭐ CAN ① BE THE PRODUCER? — the injection test, tile by tile.
//
// `RIBBONS §1` (ruled 2026-08-12): blocks = boundary − stroked roads, walked with identity
// carried. ① IS that object, so its HOLES should be the blocks. This asks whether they are —
// not whether the counts match (⛔ `gate 1` warns LS's count match is a NET, one tile splitting
// while another receives nothing, "not a bijection"), but whether each hole lands inside a
// frozen tile and each frozen tile receives one.
//
// ⛔ THE POINT OF THE WHOLE EXERCISE, so nobody optimises the wrong thing (Jacob, 2026-09-06):
// "with the protopolygon these shapes are impossible." A junction knot, a spur retracing into a
// zero-width slit, a fillet struck from a needle — all are what you get when each chain is
// stroked separately and the strokes MEET. In one united contour there is no meeting. The class
// is not fixed, it is unconstructible. So the acceptance is not "prettier"; it is that ①'s
// holes reproduce the map's block topology without re-founding it.
//
// ▶ node scratch/claims-proto-tiles-vs-faces.mjs [scene ...]
import fs from 'fs'
import { mintProtopolygon, stencilProtopolygon, tilesFromProto } from '../src/lib/tileGround.js'

const scenes = process.argv.slice(2)
if (!scenes.length) scenes.push('lafayette-square', 'hipointe-demun')
const RIB = (s) => s === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${s}/clean/ribbons.json`
const BND = (s) => `cartograph/data/${s}/neighborhood_boundary.json`
const A = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length]; a += x1*y2 - x2*y1 } return a/2 }
const inRing = (rg,x,y) => { let c=false; for(let i=0,j=rg.length-1;i<rg.length;j=i++){const[a,b]=rg[i],[e,f]=rg[j]; if((b>y)!==(f>y)&&x<(e-a)*(y-b)/(f-b)+a)c=!c} return c }
const interior = (r) => { // a robust interior point: centroid, else an edge midpoint nudged inward
  let sx=0, sy=0; for (const p of r) { sx+=p[0]; sy+=p[1] }
  const c=[sx/r.length, sy/r.length]; if (inRing(r,c[0],c[1])) return c
  for (let i=0;i<r.length-1;i++){ const m=[(r[i][0]+r[i+1][0])/2,(r[i][1]+r[i+1][1])/2]
    for (const d of [[0.01,0],[-0.01,0],[0,0.01],[0,-0.01]]) { const q=[m[0]+d[0],m[1]+d[1]]; if (inRing(r,q[0],q[1])) return q } }
  return c
}

let failed = false
for (const scene of scenes) {
  const path = RIB(scene)
  if (!fs.existsSync(path)) { console.log(`\n${scene}: no ribbons at ${path} — SKIPPED LOUDLY`); failed = true; continue }
  const rb = JSON.parse(fs.readFileSync(path, 'utf8'))
  const streets  = rb.streets.filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
  const gradeSep = rb.streets.filter(s => s?.points?.length >= 2 && s.gradeSeparated)
  // ⛔ `gradeSep: []` — THE BLOCK GRID'S ①, NOT THE DRAWING'S. A grade-separated road does not
  // bound a city block (`SKELETON §2`: "Consumers exclude these from the face graph"); the block
  // runs on underneath it. Minting them into the cut slices the partition along every off-ramp —
  // measured on LS, SPLIT 7 with them vs 1 without. `stencilProtopolygon` refuses the drawing's ①
  // outright, so this is not a preference the probe is expressing; it is the only ① it will take.
  const proto = rb.protopolygon?.rings?.length ? rb.protopolygon : mintProtopolygon({ streets, gradeSep: [] })
  const src = rb.protopolygon?.rings?.length ? 'frozen' : 'live'
  // ⭐ THE PRODUCER CANDIDATE IS THE STENCILLED ①, not the raw mint — `blocks = boundary −
  // stroked roads` (`RIBBONS §1`). The raw mint cannot pass this test even in principle: it
  // mints the FULL network (every hole beyond the rim is homeless) and it cannot mint a rim
  // block at all (a rim block closes against the edge of the drawing, not against a street).
  // ⛔ The boundary is read HERE and passed IN — the construction may not read it (BRIEF-slice2 §4).
  if (!fs.existsSync(BND(scene))) { console.log(`\n${scene}: no boundary at ${BND(scene)} — SKIPPED LOUDLY`); failed = true; continue }
  const boundary = JSON.parse(fs.readFileSync(BND(scene), 'utf8')).boundary
  const stencilled = stencilProtopolygon({ proto, boundary })
  if (!stencilled || stencilled.refused) { console.log(`\n${scene}: stencil REFUSED — ${stencilled?.refused || 'null'}`); failed = true; continue }
  const out = tilesFromProto(stencilled, rb.streets, { take: 'faces' })
  const frozen = rb.tiles || []
  const rim = out.tiles.filter(t => t.edges.some(e => e.boundary)).length
  console.log(`\n${scene}  (① ${src}, stencilled)`)
  console.log(`   ① blocks → tiles: ${out.tiles.length}   (${rim} closing on the rim)      frozen face tiles: ${frozen.length}`)
  if (out.voids) console.log(`   ⚠️  ${out.voids} void(s) — a ring of road ink enclosed inside a block; not a block, counted not dropped`)
  if (out.skipped.length) {
    console.log(`   ⛔ ${out.skipped.length} hole(s) REFUSED — unnamed, never silently dropped:`)
    for (const s of out.skipped.slice(0,5)) console.log(`        ring ${s.k}  ${s.area.toFixed(0)} m²  — ${s.why}`)
  }
  // THE INJECTION: does each proto tile's interior land in exactly one frozen tile, and does
  // each frozen tile receive at least one? ⛔ Counts alone are a NET and hide a split.
  const hit = new Map()
  let homeless = 0, straddle = 0
  for (const t of out.tiles) {
    const p = interior(t.ring)
    const owners = frozen.map((f,i)=>({i,f})).filter(({f}) => inRing(f.ring, p[0], p[1]))
    if (!owners.length) homeless++
    else { if (owners.length > 1) straddle++; const i = owners[0].i; hit.set(i, (hit.get(i)||0)+1) }
  }
  const received = hit.size, split = [...hit.values()].filter(v=>v>1).length
  const empty = frozen.length - received
  const ok = homeless === 0 && straddle === 0 && empty === 0 && split === 0 && out.skipped.length === 0
  if (!ok) failed = true
  console.log(`   ${homeless===0?'✅':'⛔'} homeless   ${homeless}   proto tile whose interior is in NO frozen tile`)
  console.log(`   ${straddle===0?'✅':'⛔'} straddling ${straddle}   interior inside more than one frozen tile`)
  console.log(`   ${empty===0?'✅':'⛔'} unreceived ${empty}   frozen tile that receives NO proto tile`)
  console.log(`   ${split===0?'✅':'⚠️ '} split      ${split}   frozen tile receiving MORE than one (① subdivides it)`)
  console.log(`   ⇒ ${ok ? '✅ CLEAN INJECTION — ① reproduces the block topology without re-founding it' : '⛔ NOT a clean injection — ① is not ready to be the producer here'}`)
}
console.log(`\n${failed ? '⛔ FAIL — ① cannot be the producer yet; the gaps above are the work' : '✅ PASS'}\n`)
process.exit(failed ? 1 : 0)
