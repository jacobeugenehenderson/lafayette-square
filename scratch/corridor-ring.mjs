import { readFileSync } from 'fs'
import sharp from 'sharp'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
async function render(nm, tag) {
  const rings = (r.medians||[]).filter(m=>m.kind==='median'&&m.ring&&(m.streets||[])[0]===nm).map(m=>m.ring)
  const chains = r.streets.filter(s=>s.name===nm && s.phase?.kind==='divided').map(s=>s.points)
  if(!rings.length){console.log(nm+': NO median rings');return}
  const all=[...rings.flat(),...chains.flat()]
  const xs=all.map(p=>p[0]),ys=all.map(p=>p[1])
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2
  const W=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*1.1+5,ppx=1100,sc=ppx/W
  const X=x=>((x-(cx-W/2))*sc).toFixed(1),Y=y=>((y-(cy-W/2))*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${ppx}" height="${ppx}" style="background:#16243a">`
  for(const c of chains) s+=`<path d="${c.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')}" fill="none" stroke="#0a1a4a" stroke-width="2.5"/>`
  for(const rg of rings) s+=`<path d="${rg.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="#3a7d3a" stroke="#6c6" stroke-width="1.5"/>`
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./corridor-ring-${tag}.png`,import.meta.url).pathname)
  console.log('wrote corridor-ring-'+tag+'.png ('+rings.length+' rings)')
}
await render('South Jefferson Avenue','sjeff')
await render('Lafayette Avenue','laf')
