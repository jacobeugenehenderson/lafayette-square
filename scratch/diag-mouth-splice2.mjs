import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'

const d = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const tiles = Array.isArray(d) ? d : d.tiles
const cw = 0.1524
const stripMat = { outer: 'LU', inner: 'SW' }
const dist = (a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const pt = (p)=> Array.isArray(p) ? p : [p.X, p.Y]
function ringArea(ring){let a=0;for(let i=0;i<ring.length;i++){const p=pt(ring[i]),q=pt(ring[(i+1)%ring.length]);a+=p[0]*q[1]-q[0]*p[1]}return Math.abs(a)/2}
function totalArea(rings){return (rings||[]).reduce((s,r)=>s+ringArea(r),0)}
const clone=(t)=>JSON.parse(JSON.stringify(t))

function collapse(t){
  const c=clone(t); const fillets=c.fillets||[]
  const isApex=(p)=>fillets.some(f=>dist(f.apex,p)<0.2)
  const allEnds=[]
  for(const r of c.runs) for(const idx of [0,r.poly.length-1]) allEnds.push(r.poly[idx])
  const bySkel=new Map()
  for(const r of c.runs){if(!bySkel.has(r.skelId))bySkel.set(r.skelId,[]);bySkel.get(r.skelId).push(r)}
  let n=0
  for(const [skel,rs] of bySkel){
    if(!rs.some(r=>r.side==='left')||!rs.some(r=>r.side==='right'))continue
    const cands=[]
    for(const r of rs) for(const idx of [0,r.poly.length-1]){const p=r.poly[idx];if(isApex(p))cands.push({r,idx,p})}
    for(let i=0;i<cands.length;i++)for(let j=i+1;j<cands.length;j++){
      const A=cands[i],B=cands[j];if(A.r.side===B.r.side)continue;if(dist(A.p,B.p)>16)continue
      const mid=[(A.p[0]+B.p[0])/2,(A.p[1]+B.p[1])/2]
      let node=null,best=1e9
      for(const e of allEnds){if(isApex(e))continue;const dd=dist(e,mid);if(dd<best&&dd<14){best=dd;node=e}}
      const target = node ? [node[0],node[1]] : mid
      A.r.poly[A.idx]=[target[0],target[1]]; B.r.poly[B.idx]=[target[0],target[1]]; n++
    }
  }
  return {tile:c,n}
}

function pathD(ring){return 'M'+ring.map(q=>{const a=pt(q);return a[0].toFixed(2)+','+(-a[1]).toFixed(2)}).join('L')+'Z'}
function svgFill(rings,color){let p='';for(const r of rings){if(r.length<3)continue;p+=`<path d="${pathD(r)}" fill="${color}" fill-rule="evenodd"/>`}return p}

function render(file,tile,label){
  const r=sectionPassTile(tile,cw,stripMat,null)
  const iaRings = tile.iA  // array of rings
  let xn=1e9,yn=1e9,xx=-1e9,yx=-1e9
  for(const ring of iaRings) for(const p0 of ring){const a=pt(p0);xn=Math.min(xn,a[0]);yn=Math.min(yn,a[1]);xx=Math.max(xx,a[0]);yx=Math.max(yx,a[1])}
  const pad=12;xn-=pad;yn-=pad;xx+=pad;yx+=pad
  const w=xx-xn,h=yx-yn
  let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${xn} ${-yx} ${w} ${h}" width="900" height="${Math.round(900*h/w)}">`
  s+=`<rect x="${xn}" y="${-yx}" width="${w}" height="${h}" fill="#1a1a1a"/>`
  for(const ring of iaRings) s+=`<path d="${pathD(ring)}" fill="#3a3a3a" stroke="#666" stroke-width="0.4"/>`
  s+=svgFill(r.Wacc,'#e0c46a')
  for(const f of (tile.fillets||[])) s+=`<circle cx="${f.apex[0]}" cy="${-f.apex[1]}" r="1.8" fill="#ff4040"/>`
  // mark run-ends as small cyan crosses
  for(const run of tile.runs) for(const idx of [0,run.poly.length-1]){const p=run.poly[idx];s+=`<circle cx="${p[0]}" cy="${-p[1]}" r="1.0" fill="#40d0ff"/>`}
  s+=`<text x="${xn+4}" y="${-yx+14}" fill="#fff" font-size="${(w/70).toFixed(1)}">${label} SW=${totalArea(r.Wacc).toFixed(0)}m2 rings=${r.Wacc.length}</text>`
  s+='</svg>'
  fs.writeFileSync(file,s)
  return r
}

for(const idx of [53,11]){
  const t=tiles[idx]
  const {tile:ct,n}=collapse(t)
  const sp=render(`scratch/diag-mouth-tile${idx}-spliced.svg`,t,`tile${idx} SPLICED`)
  const co=render(`scratch/diag-mouth-tile${idx}-collapsed.svg`,ct,`tile${idx} COLLAPSED`)
  console.log(`tile[${idx}] spurs-collapsed=${n}  SW spliced=${totalArea(sp.Wacc).toFixed(2)}  collapsed=${totalArea(co.Wacc).toFixed(2)}  Δ=${(totalArea(sp.Wacc)-totalArea(co.Wacc)).toFixed(2)}m²  ringΔ=${sp.Wacc.length-co.Wacc.length}`)
}
