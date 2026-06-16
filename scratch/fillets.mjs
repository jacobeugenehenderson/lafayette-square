import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/toy/neighborhood_boundary.json',import.meta.url)))
const pr=buildTileGround(r,{stencil:bnd.boundary,smooth:0.5})
const keys=Object.keys(pr.cornerFillets)
console.log('cornerFillets count:',keys.length)
for(const k of keys.slice(0,5)){const f=pr.cornerFillets[k];console.log(k,'r=',f.r.toFixed(2),'C=',f.C.map(x=>x.toFixed(1)).join(','))}
// show one where the clamp likely bit (small r) and a normal one
const rs=keys.map(k=>pr.cornerFillets[k].r).sort((a,b)=>a-b)
console.log('r range:',rs[0].toFixed(2),'..',rs[rs.length-1].toFixed(2),' (requested default 4.5)')
