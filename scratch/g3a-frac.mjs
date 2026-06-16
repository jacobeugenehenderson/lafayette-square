import { readFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'
import { smoothChain } from '../src/lib/smoothCenterline.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
let streets=r.streets.filter(s=>s?.points?.length>=2).map(s=>{const sm=smoothChain(s.points,0.5);return sm?{...s,points:sm}:s})
const tiles=extractFaces(streets)
function inRing(px,py,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if(((yi>py)!=(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi))c=!c}return c}
const t=tiles.find(t=>inRing(-390,-260,t.ring))
// group runs
function groupRuns(tile){const{ring,edges}=tile;const n=edges.length;const same=(a,b)=>a.streetIdx===b.streetIdx&&a.side===b.side;let seam=0,found=false;for(let i=0;i<n;i++){if(!same(edges[i],edges[(i-1+n)%n])){seam=i;found=true;break}}if(!found)return[{streetIdx:edges[0].streetIdx,side:edges[0].side,poly:[...ring,ring[0]]}];const runs=[];let start=seam;for(let c=0;c<n;){const i0=start%n;let len=1;while(len<n&&same(edges[(start+len)%n],edges[i0]))len++;const poly=[];for(let k=0;k<=len;k++)poly.push(ring[(i0+k)%n]);runs.push({streetIdx:edges[i0].streetIdx,side:edges[i0].side,poly});start=(start+len)%n;c+=len}return runs}
const runs=groupRuns(t)
let medLen=0,totLen=0
for(const run of runs){
  let L=0;for(let i=0;i<run.poly.length-1;i++)L+=Math.hypot(run.poly[i+1][0]-run.poly[i][0],run.poly[i+1][1]-run.poly[i][1])
  const s=streets[run.streetIdx]
  const med = s.anchor==='inner-edge'&&s.innerSign&&run.side===(s.innerSign===+1?'right':'left')
  totLen+=L; if(med)medLen+=L
  console.log(JSON.stringify(s.name).padEnd(16),'side',run.side,'anchor',s.anchor,'innerSign',s.innerSign,'len',L.toFixed(1),'median?',med)
}
console.log('medLen',medLen.toFixed(1),'totLen',totLen.toFixed(1),'frac',(medLen/totLen).toFixed(2))
