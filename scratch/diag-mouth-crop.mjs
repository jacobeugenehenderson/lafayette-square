import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
const d = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const tiles = Array.isArray(d) ? d : d.tiles
const cw = 0.1524, stripMat = { outer: 'LU', inner: 'SW' }
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const pt=(p)=>Array.isArray(p)?p:[p.X,p.Y]
const clone=(t)=>JSON.parse(JSON.stringify(t))
function collapse(t){const c=clone(t);const fillets=c.fillets||[];const isApex=(p)=>fillets.some(f=>dist(f.apex,p)<0.2);const allEnds=[];for(const r of c.runs)for(const idx of[0,r.poly.length-1])allEnds.push(r.poly[idx]);const bySkel=new Map();for(const r of c.runs){if(!bySkel.has(r.skelId))bySkel.set(r.skelId,[]);bySkel.get(r.skelId).push(r)}for(const[skel,rs]of bySkel){if(!rs.some(r=>r.side==='left')||!rs.some(r=>r.side==='right'))continue;const cands=[];for(const r of rs)for(const idx of[0,r.poly.length-1]){const p=r.poly[idx];if(isApex(p))cands.push({r,idx,p})}for(let i=0;i<cands.length;i++)for(let j=i+1;j<cands.length;j++){const A=cands[i],B=cands[j];if(A.r.side===B.r.side)continue;if(dist(A.p,B.p)>16)continue;const mid=[(A.p[0]+B.p[0])/2,(A.p[1]+B.p[1])/2];let node=null,best=1e9;for(const e of allEnds){if(isApex(e))continue;const dd=dist(e,mid);if(dd<best&&dd<14){best=dd;node=e}}const target=node?[node[0],node[1]]:mid;A.r.poly[A.idx]=[target[0],target[1]];B.r.poly[B.idx]=[target[0],target[1]]}}return c}
function pathD(ring){return 'M'+ring.map(q=>{const a=pt(q);return a[0].toFixed(2)+','+(-a[1]).toFixed(2)}).join('L')+'Z'}
function svgFill(rings,color){let p='';for(const r of rings){if(r.length<3)continue;p+=`<path d="${pathD(r)}" fill="${color}" fill-rule="evenodd"/>`}return p}
// crop centered on a world point, half-extent he (meters)
function renderCrop(file,tile,label,cx,cy,he){
  const r=sectionPassTile(tile,cw,stripMat,null)
  const xn=cx-he,xx=cx+he,yn=cy-he,yx=cy+he,w=2*he,h=2*he
  let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${xn} ${-yx} ${w} ${h}" width="700" height="700">`
  s+=`<rect x="${xn}" y="${-yx}" width="${w}" height="${h}" fill="#1a1a1a"/>`
  for(const ring of tile.iA) s+=`<path d="${pathD(ring)}" fill="#3a3a3a" stroke="#666" stroke-width="0.3"/>`
  s+=svgFill(r.Wacc,'#e0c46a')
  for(const f of (tile.fillets||[])) s+=`<circle cx="${f.apex[0]}" cy="${-f.apex[1]}" r="0.9" fill="#ff4040"/>`
  for(const run of tile.runs)for(const idx of[0,run.poly.length-1]){const p=run.poly[idx];s+=`<circle cx="${p[0]}" cy="${-p[1]}" r="0.6" fill="#40d0ff"/>`}
  s+=`<text x="${xn+1}" y="${-yx+4}" fill="#fff" font-size="3">${label}</text></svg>`
  fs.writeFileSync(file,s)
}
// tile53 albion mouth ~ between apexes (-184.68,-85.45)/(-186.47,-74.61), node ~(-177.5,-78.7)
const t53=tiles[53]
renderCrop('scratch/diag-mouth-tile53-spliced-crop.svg',t53,'t53 SPLICED mouth',-183,-80,20)
renderCrop('scratch/diag-mouth-tile53-collapsed-crop.svg',collapse(t53),'t53 COLLAPSED mouth',-183,-80,20)
// tile11 simpson mouth ~ apexes (-144.35,180.82)/(-152.17,179.58)
const t11=tiles[11]
renderCrop('scratch/diag-mouth-tile11-spliced-crop.svg',t11,'t11 simpson SPLICED',-148,180,22)
renderCrop('scratch/diag-mouth-tile11-collapsed-crop.svg',collapse(t11),'t11 simpson COLLAPSED',-148,180,22)
console.log('done')
