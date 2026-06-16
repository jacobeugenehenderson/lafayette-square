import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const COL = { lu:'#cdebb0', sidewalk:'#d8d2c4', treelawn:'#8fcf63', curb:'#666', asphalt:'#4a4a4a' }
function svg(pr, minx, miny, w, h, stroke=0.25) {
  const order=[['lu',pr.lu],['sidewalk',pr.sidewalk],['treelawn',pr.treelawn],['curb',pr.curb],['asphalt',pr.asphalt]]
  const sc=1100/w, Y=y=>(y-miny)*sc, X=x=>(x-minx)*sc
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${(h*sc).toFixed(0)}" viewBox="0 0 1100 ${(h*sc).toFixed(0)}" style="background:#161616">`
  for(const [k,rings] of order){let d='';for(const r of rings){if(!r||r.length<3)continue;d+=r.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z '}if(d)s+=`<path d="${d}" fill="${COL[k]}" fill-rule="nonzero" stroke="#0a0a0a" stroke-width="${stroke}" stroke-opacity="0.5"/>`}
  return s+'</svg>'
}
const which = process.argv[2]
if (which==='toy'){
  const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
  const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/toy/neighborhood_boundary.json',import.meta.url)))
  const t0=Date.now(); const pr=buildTileGround(r,{stencil:bnd.boundary,smooth:0.5}); console.log('toy build',Date.now()-t0,'ms')
  writeFileSync(new URL('./t2-toy-full.svg',import.meta.url), svg(pr,-185,-185,370,370))
  writeFileSync(new URL('./t2-toy-ix.svg',import.meta.url), svg(pr,-72,-72,64,64,0.4))
} else {
  const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
  const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
  // build clip polygon like loadSceneStencil: scale to streetFade.outer+50
  let clip=null
  if(bnd.boundary){const tR=(bnd.streetFade?bnd.streetFade.outer+50:bnd.radius);const sc=bnd.radius>0?tR/bnd.radius:1;const cx=bnd.center[0],cz=bnd.center[1];clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc,cz+(z-cz)*sc])}
  const t0=Date.now(); const pr=buildTileGround(r,{stencil:clip,smooth:0.5}); console.log('LS build',Date.now()-t0,'ms')
  // bounds of asphalt
  let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9; for(const rr of pr.asphalt)for(const p of rr){mnx=Math.min(mnx,p[0]);mny=Math.min(mny,p[1]);mxx=Math.max(mxx,p[0]);mxy=Math.max(mxy,p[1])}
  console.log('asphalt bounds',mnx.toFixed(0),mny.toFixed(0),mxx.toFixed(0),mxy.toFixed(0))
  writeFileSync(new URL('./t2-ls-full.svg',import.meta.url), svg(pr,mnx-30,mny-30,(mxx-mnx)+60,(mxy-mny)+60,0.4))
  // zoom on a residential grid area + a divided road. Pick around (-400,-200)
  writeFileSync(new URL('./t2-ls-zoom.svg',import.meta.url), svg(pr,-480,-360,360,360,0.6))
}
console.log('rendered',which)
