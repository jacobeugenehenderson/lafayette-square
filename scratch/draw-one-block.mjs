#!/usr/bin/env node
// ⭐⭐⭐ ONE BLOCK. THE UNIT IS THE BLOCK — Jacob, 2026-09-06: "we need to be able to edit one block
// at a time and not redraw the whole map every frame."
//
// ⛔ WHY THIS EXISTS AND WHY EVERY EARLIER PROBE WAS THE WRONG SHAPE. Every ①②③ probe written today
// rebuilt the WHOLE SCENE and reported a whole-map total, and four times running an aggregate either
// hid a localised defect or manufactured one that was not there. The architecture does not operate
// at that scale: ① is frozen once, and authoring a width touches ONE HOLE, offsets ONE RING, redraws
// ONE BLOCK. ⇒ If a single block is right, the map is right, because there is nothing else.
//
// Draws, for ONE block, at a readable zoom: ① its own hole · ② the curb offset from it · ③ the bands.
// ▶ node scratch/draw-one-block.mjs [scene] [--street NAME | --at x,z | --block N] [--pad 12]
//   --street russell            → the blocks bounded by a street whose id contains "russell"
//   --street russell --nth 2    → the 2nd of them
// ⛔ `--at x,z` was the only selector and it is USELESS TO THE OPERATOR — nothing on screen tells you
// a coordinate. The map is addressed by STREET NAME, and `CLAUDE.md` is explicit that Jacob naming
// streets is CORRECT because authoring is street-keyed. A harness he cannot aim is a harness he
// cannot use, which is most of what a harness is for.
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'

const argv = process.argv.slice(2)
const scene = argv.find(a => !a.startsWith('--')) || 'lafayette-square'
const num = (k, d) => { const i = argv.indexOf(k); return i > 0 ? Number(argv[i + 1]) : d }
const AT = (() => { const i = argv.indexOf('--at'); return i > 0 ? argv[i + 1].split(',').map(Number) : null })()
const WANT = num('--block', NaN), PAD = num('--pad', 12), NTH = num('--nth', 1)
const STREET = (() => { const i = argv.indexOf('--street'); return i > 0 ? argv[i + 1].toLowerCase() : null })()

const f = feed(scene); if (!f) process.exit(1)
// ⛔⛔ `protoProducer` — DRAW WHAT SECTION PAINTS, NOT WHAT THE PRODUCER STRUCK.
// This harness drew `r.protoBands`, which is `buildTileGround`'s OWN band strike and is read by
// NOTHING on screen — only by probes. The map is painted by `sectionPassProtoTile` through
// `sectionOpen`, past the wall, off the frozen stamp; `protoProducer: true` is what routes the
// return through it. ⇒ Without this flag the harness renders a layer no operator can ever see, and
// a change to the FILL painter leaves the picture BYTE-IDENTICAL — which is exactly what happened:
// two A/B renders of a rebuilt corner came out the same file, to the byte.
// ⭐ Same class as every other instrument failure in this arc: ask what the probe is STRUCTURALLY
// UNABLE TO SEE. This one could not see the painter.
const r = buildProto(f, { quiet: false, protoProducer: true })
const SA = (rg) => { let a = 0; for (let i = 0; i < rg.length; i++) { const j = (i+1)%rg.length; a += rg[i][0]*rg[j][1] - rg[j][0]*rg[i][1] } return a / 2 }
const cen = (rg) => { let a=0,cx=0,cy=0; for(let i=0;i<rg.length;i++){const j=(i+1)%rg.length;const c=rg[i][0]*rg[j][1]-rg[j][0]*rg[i][1];a+=c;cx+=(rg[i][0]+rg[j][0])*c;cy+=(rg[i][1]+rg[j][1])*c} a/=2; return a?[cx/(6*a),cy/(6*a)]:rg[0] }
const inRing = (rg,x,y)=>{let c=false;for(let i=0,j=rg.length-1;i<rg.length;j=i++){const[a,b]=rg[i],[e,d]=rg[j];if((b>y)!==(d>y)&&x<(e-a)*(y-b)/(d-b)+a)c=!c}return c}

// ⛔ the block is chosen BY GEOMETRY (a point inside it) or by index into the HOLE list — never by a
// raw ring index, which differs between the live pass and any frozen artifact.
const holes = []
for (let k = 0; k < (r.proto || []).length; k++) {
  const rg = r.proto[k]
  if (rg?.length >= 3 && SA(rg) < 0) holes.push({ k, ring: rg, labs: r.protoLabels?.[k], area: Math.abs(SA(rg)) })
}
let pick = null
if (STREET) {
  const O0 = r.protoOwners || []
  const named = holes.filter(h => (h.labs || []).some(l => (O0[l]?.skelId || '').toLowerCase().includes(STREET)))
  if (!named.length) {
    // ⛔ LOUD, and it prints what IS there — a silent empty result reads as "no blocks on that street"
    const all = [...new Set((r.protoOwners || []).map(o => o?.skelId).filter(Boolean))].sort()
    console.log(`⛔ no block is bounded by a street matching "${STREET}".`)
    console.log(`   streets present: ${all.filter(n => n[0] === STREET[0]).join(', ') || all.slice(0, 20).join(', ') + ' …'}`)
    process.exit(1)
  }
  named.sort((a, b) => b.area - a.area)
  console.log(`  "${STREET}" bounds ${named.length} block(s); showing #${NTH} (largest first). --nth N for the others.`)
  pick = named[Math.max(0, NTH - 1)] || named[0]
}
else if (AT) pick = holes.find(h => inRing(h.ring, AT[0], AT[1]))
else if (Number.isFinite(WANT)) pick = holes[WANT]
else pick = holes.filter(h => h.area > 3000 && h.area < 20000 && h.ring.length <= 12).sort((a,b)=>a.ring.length-b.ring.length)[0]
if (!pick) { console.log('⛔ no block matched — NOT a pass'); process.exit(1) }

const O = r.protoOwners || []
const chains = [...new Set((pick.labs || []).map(l => O[l]).filter(Boolean).map(o => `${o.skelId}/${o.side}`))]
const authored = chains.filter(c => { const [s, sd] = c.split('/'); return Object.keys(f.blockCustoms?.[s]?.[sd] || {}).length })
console.log(`\nBLOCK (hole #${holes.indexOf(pick)} of ${holes.length}) — ${pick.area.toFixed(0)} m², ${pick.ring.length} vertices`)
console.log(`  bounded by: ${chains.join('  ')}`)
console.log(`  AUTHORED sides: ${authored.length ? authored.join(', ') : 'none — this block is at the to-code default'}`)

// clip everything to this block's own neighbourhood
const c = cen(pick.ring)
let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity
for (const p of pick.ring) { x0=Math.min(x0,p[0]); x1=Math.max(x1,p[0]); y0=Math.min(y0,p[1]); y1=Math.max(y1,p[1]) }
x0-=PAD; y0-=PAD; x1+=PAD; y1+=PAD
const near = (rg) => rg.some(p => p[0]>=x0 && p[0]<=x1 && p[1]>=y0 && p[1]<=y1)
const P = []
const d = (rg) => 'M' + rg.map(p => p[0].toFixed(3)+','+p[1].toFixed(3)).join('L') + 'Z'
const W = Math.max(x1-x0, y1-y0)
// ⛔⛔ ONE PATH PER BAND, `fill-rule="evenodd"` — A BAND IS A COMPOUND PATH.
// An annulus is an outer ring PLUS a hole ring. Emitting each ring as its own filled <path> paints
// the outer solid and then paints the HOLE solid on top of it, in the same colour — so a 0.381 m
// curb strip renders as a filled 19,816 m² block. ⭐ THE DEFECT WAS IN THIS RENDERER, and it sent me
// hunting "band floods" and "black wedges" in geometry that was fine. Same class as every other
// error of 2026-09-06: a compound path handled as loose rings.
const layer = (rings, fill, stroke, w) => {
  const keep = (rings || []).filter(rg => rg?.length >= 3 && near(rg))
  if (!keep.length) return
  P.push(`<path d="${keep.map(d).join(' ')}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${w}"/>`)
}
layer(Object.values(r.luByClass || {}).flat(),     '#3f4a33', 'none', 0)
layer(Object.values(r.treelawnByLu || {}).flat(),  '#5d8f35', 'none', 0)
layer(r.sidewalk,                                  '#efe9dc', 'none', 0)
layer(r.curb,                                      '#6f6f68', 'none', 0)
layer(r.protoCurb,            'none', '#2fe0e0', W/400)     // ② the curb
P.push(`<path d="${d(pick.ring)}" fill="none" stroke="#f0b429" stroke-width="${W/700}"/>`)  // ① this hole
const out = `scratch/one-block-${scene}.svg`
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${x1-x0} ${y1-y0}" width="1200" height="${Math.round(1200*(y1-y0)/(x1-x0))}">
<rect x="${x0}" y="${y0}" width="${x1-x0}" height="${y1-y0}" fill="#23241f"/>
${P.join('\n')}
</svg>\n`)
console.log(`\n▶ ${out}`)
console.log('   yellow = ① this block\'s own hole · cyan = ② its curb · grey/green/cream = ③ the bands')
console.log('   ⭐ THE GATE: the bands wrap the block continuously, the corners are round, nothing crosses the interior.')
