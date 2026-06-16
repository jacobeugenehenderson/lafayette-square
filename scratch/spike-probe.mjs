import { readFileSync } from 'fs'
import { buildPureRibbonShape } from '../cartograph/spike-pure-ribbon.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/toy/neighborhood_boundary.json', import.meta.url)))
const pr = buildPureRibbonShape(ribbons, { stencil: bnd.boundary })
function area(r){let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return a/2}
function inRing(px,py,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const[xi,yi]=r[i],[xj,yj]=r[j];if(((yi>py)!=(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi))c=!c}return c}
// winding-aware point-in-polyset: count signed coverage
function cover(px,py,rings){let w=0;for(const r of rings){if(inRing(px,py,r))w+= area(r)>0?1:-1}return w}
for(const [k,rings] of [['asphalt',pr.asphalt],['curb',pr.curb],['treelawn',pr.treelawn],['sidewalk',pr.sidewalk],['lu',pr.lu]]){
  console.log(k.padEnd(9), 'rings',rings.length, 'areas:', rings.map(r=>Math.round(area(r))).slice(0,8).join(','))
}
console.log('--- coverage (net winding) at probe points ---')
for(const [px,py] of [[0,0],[0,20],[-80,0],[80,80],[0,80]]){
  const row=[]
  for(const [k,rings] of [['asphalt',pr.asphalt],['curb',pr.curb],['treelawn',pr.treelawn],['sidewalk',pr.sidewalk],['lu',pr.lu]])
    row.push(k+'='+cover(px,py,rings))
  console.log(`(${px},${py})`, row.join(' '))
}

// --- holedPolys hole-retention check ---
function inRing2(px,py,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const[xi,yi]=r[i],[xj,yj]=r[j];if(((yi>py)!=(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi))c=!c}return c}
function centroid(r){const c=r.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]);return [c[0]/r.length,c[1]/r.length]}
const aOuters=pr.asphalt.filter(r=>area(r)>0), aHoles=pr.asphalt.filter(r=>area(r)<0)
console.log('asphalt outers',aOuters.length,'holes',aHoles.length)
let dropped=0
for(const h of aHoles){const c=centroid(h);let assigned=false;for(const o of aOuters)if(inRing2(c[0],c[1],o))assigned=true;if(!assigned){dropped++;console.log('  HOLE centroid outside its outer? area',Math.round(area(h)),'centroid',c.map(v=>v.toFixed(1)).join(','))}}
console.log('dropped holes (centroid not in any outer):',dropped)
