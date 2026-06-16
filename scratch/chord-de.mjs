import fs from 'fs'
const ribbons = JSON.parse(fs.readFileSync('./src/data/ribbons.json','utf8'))
const key=(x,z)=>`${x.toFixed(1)},${z.toFixed(1)}`
const deg={}; for(const s of ribbons.streets){const p=s.points;if(!p||p.length<2)continue;for(const e of [p[0],p[p.length-1]]){const k=key(e[0],e[1]);deg[k]=(deg[k]||0)+1}}
// For each degree-1 endpoint, count points on the TERMINAL SEGMENT cluster near the tip
let stubs=[]
for(const s of ribbons.streets){const p=s.points;if(!p||p.length<2)continue
  const ends=[[0,p],[1,p.map((_,i)=>p[p.length-1-i])]] // forward & reversed views
  for(const[which,arr]of ends){ if(deg[key(arr[0][0],arr[0][1])]!==1) continue
    // count vertices within 30m of the tip (the cap/triangle zone)
    let near=0,acc=0
    for(let i=1;i<arr.length;i++){acc+=Math.hypot(arr[i][0]-arr[i-1][0],arr[i][1]-arr[i-1][1]); if(acc<30)near++; else break}
    stubs.push({name:s.name,total:p.length,nearTip:near+1})
  }}
const hist={}; stubs.forEach(s=>{const b=s.nearTip>=8?'8+':String(s.nearTip);hist[b]=(hist[b]||0)+1})
console.log('Dead-end stubs:', stubs.length)
console.log('Vertices within 30m of the dead-end TIP (the cap/triangle zone):')
Object.keys(hist).sort().forEach(k=>console.log(`  ${k} verts near tip: ${hist[k]} stubs`))
console.log('\nStubs with DENSE tips (>=5 verts near tip) — candidate thorn/triangle:')
stubs.filter(s=>s.nearTip>=5).slice(0,12).forEach(s=>console.log(' ',s.name||'(unnamed)','tip-verts:',s.nearTip,'total:',s.total))
