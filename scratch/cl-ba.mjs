import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'
const load = f => JSON.parse(readFileSync(new URL(f, import.meta.url)))
const B = load('./vesalius-ribbons-BEFORE.json'), A = load('./vesalius-ribbons-AFTER.json')
const streets = o => o.streets || o.ribbons?.streets || []
console.log('BEFORE streets', streets(B).length, 'AFTER', streets(A).length)
// total point counts
const pc = o => streets(o).reduce((s, st) => s + (st.points?.length || 0), 0)
console.log('BEFORE pts', pc(B), 'AFTER pts', pc(A))
function render(o, name, minx, miny, w, h, px=1700){
  const sc=px/w,H=h*sc,X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${H.toFixed(0)}" style="background:#fff">`
  for(const st of streets(o)){const p=st.points;if(!p||p.length<2)continue
    s+=`<polyline points="${p.map(q=>X(q[0])+','+Y(q[1])).join(' ')}" fill="none" stroke="#c00" stroke-width="1.2"/>`
    for(const q of p) s+=`<circle cx="${X(q[0])}" cy="${Y(q[1])}" r="1.6" fill="#06c"/>`}
  s+='</svg>'
  writeFileSync(new URL('./'+name+'.svg',import.meta.url),s)
  return sharp(Buffer.from(s)).png().toFile(new URL('./'+name+'.png',import.meta.url).pathname)
}
await render(B,'cl-before',-130,-500,360,360)
await render(A,'cl-after',-130,-500,360,360)
console.log('wrote cl-before.png cl-after.png')
