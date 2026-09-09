// Render what the OPERATOR sees at each marker stroke: the V2 proto band stack
// (the same buildTileGround the Designer's BlockGeometryV2Debug draws), plus a
// second pane outlining ① so a cancelled overlap shows as a hole.
// ⛔ Builds through _proto-feed — authoring ON.
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'

const SCENE = process.argv[2] || 'lafayette-square'
const f = feed(SCENE); if (!f) process.exit(1)
const tg = buildProto(f)
const strokes = JSON.parse(fs.readFileSync(`cartograph/data/${SCENE}/clean/marker_strokes.json`, 'utf8'))
const PAD = Number(process.env.PAD || 30)

const P = (r) => r.map(p => `${p[0]},${p[1]}`).join(' ')
const bb = (r) => { let a=1/0,b=-1/0,c=1/0,d=-1/0; for(const p of r){const x=Array.isArray(p)?p[0]:p.x, z=Array.isArray(p)?p[1]:p.z; if(x<a)a=x; if(x>b)b=x; if(z<c)c=z; if(z>d)d=z} return {minX:a,maxX:b,minZ:c,maxZ:d} }
const hit = (r, v) => !(r.maxX < v.x || r.minX > v.x+v.w || r.maxZ < v.z || r.minZ > v.z+v.h)
const area = (r) => { let s=0; for(let i=0,n=r.length;i<n;i++){const a=r[i],b=r[(i+1)%n]; s += a[0]*b[1]-b[0]*a[1]} return s/2 }

const STACK = [
  ['lu',       tg.protoBands.lu,       '#cddcb4'],
  ['asphalt',  tg.asphalt,             '#b9b5ae'],
  ['curb',     tg.protoBands.curb,     '#8e8a84'],
  ['treelawn', tg.protoBands.treelawn, '#9fbd7f'],
  ['sidewalk', tg.protoBands.sidewalk, '#efeae0'],
]

strokes.forEach((st, i) => {
  const s = bb(st)
  const v = { x: s.minX-PAD, z: s.minZ-PAD, w: (s.maxX-s.minX)+2*PAD, h: (s.maxZ-s.minZ)+2*PAD }
  const sw = (v.w/400).toFixed(3)
  let A = '', B = ''
  for (const [name, rings, col] of STACK)
    for (const r of (rings||[])) { if (r.length<3 || !hit(bb(r), v)) continue
      A += `<polygon points="${P(r)}" fill="${col}" stroke="${col}" stroke-width="${sw}"/>` }
  // ① pane: positive rings pale, NEGATIVE (hole) rings red-hatched, all outlined
  let holes = 0, slivers = []
  const inView = tg.proto.map((r,k)=>({r,k,a:area(r)})).filter(o => o.r.length>=3 && hit(bb(o.r), v))
  inView.sort((x,y)=>Math.abs(y.a)-Math.abs(x.a))          // big first, so slivers stay visible
  for (const { r, k, a } of inView) {
    const isHole = a < 0
    if (isHole) holes++
    if (Math.abs(a) < 2000 && r.length <= 8) slivers.push({ k, a:+Math.abs(a).toFixed(1), n:r.length, hole:isHole })
    B += `<polygon points="${P(r)}" fill="${isHole?'#e33':'#dfd8c8'}" fill-opacity="${isHole?0.6:1}" stroke="#333" stroke-width="${sw}"/>`
  }
  const stroke = `<polyline points="${st.map(p=>`${p.x},${p.z}`).join(' ')}" fill="none" stroke="#e00" stroke-width="${sw*3}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`
  const W = 820, H = Math.round(W*v.h/v.w)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W*2+10}" height="${H}" viewBox="0 0 ${v.w*2+v.w*0.012} ${v.h}">
<defs><clipPath id="c"><rect x="${v.x}" y="${v.z}" width="${v.w}" height="${v.h}"/></clipPath></defs>
<g transform="translate(${-v.x},${-v.z})" clip-path="url(#c)"><rect x="${v.x}" y="${v.z}" width="${v.w}" height="${v.h}" fill="#f7f4ee"/>${A}${stroke}</g>
<g transform="translate(${-v.x+v.w*1.012},${-v.z})" clip-path="url(#c)"><rect x="${v.x}" y="${v.z}" width="${v.w}" height="${v.h}" fill="#fff"/>${B}${stroke}</g></svg>`
  fs.writeFileSync(`scratch/_mk2-${i}.svg`, svg)
  console.log(`stroke ${i} @ ${((s.minX+s.maxX)/2).toFixed(0)},${((s.minZ+s.maxZ)/2).toFixed(0)}  ①rings-in-view holes=${holes}  slivers=${JSON.stringify(slivers)}`)
})
