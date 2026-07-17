import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT,'src/data/ribbons.json')))
const streets = ribbons.streets
const tipKey = (p) => Math.round(p[0]*1000)+','+Math.round(p[1]*1000)
const deg = new Map()
for (const s of streets){ const p=s.points; if(!p||p.length<2)continue; for(const pt of p){const k=tipKey(pt);deg.set(k,(deg.get(k)||0)+1)} }
const nodes = { 'Kennett×S18':[386.5,149], 'Mackay×Hickory':[29.3,-434.9], 'Rutger×S18':[453.6,-197] }
const ang = (dx,dy)=>Math.round(Math.atan2(dy,dx)*180/Math.PI)
for (const [name,[nx,nz]] of Object.entries(nodes)){
  const nk=tipKey([nx,nz])
  console.log(`\n=== ${name}  node=${nk}  deg(interior+endpoint touches)=${deg.get(nk)||0} ===`)
  for (const s of streets){
    const p=s.points; if(!p||p.length<2)continue
    for (let i=0;i<p.length;i++){
      if(tipKey(p[i])!==nk) continue
      const interior = i>0 && i<p.length-1
      const legs=[]
      if(i>0){const d=[p[i-1][0]-p[i][0],p[i-1][1]-p[i][1]];legs.push('←'+ang(d[0],d[1]))}
      if(i<p.length-1){const d=[p[i+1][0]-p[i][0],p[i+1][1]-p[i][1]];legs.push('→'+ang(d[0],d[1]))}
      console.log(`  ${s.skelId||s.id}  ${interior?'INTERIOR(passes through)':'ENDPOINT(terminates)'}  legDirs=[${legs.join(', ')}]  role=${s.phase?.role||'-'}`)
    }
  }
}
