import fs from 'fs'
const R=JSON.parse(fs.readFileSync('src/data/ribbons.json','utf8'))
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const turn=(a,b,c)=>{let ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1];const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);if(li<1e-9||lo<1e-9)return 0;return Math.acos(Math.max(-1,Math.min(1,(ix*ox+iz*oz)/(li*lo))))*180/Math.PI}
const jog=(a,b,c)=>{const dx=c[0]-a[0],dz=c[1]-a[1],L=Math.hypot(dx,dz);if(L<1e-9)return 0;return Math.abs((b[0]-a[0])*dz-(b[1]-a[1])*dx)/L}
const CIRCLES=[['A',-40.7,175.6],['B',-49.8,-188.7],['C',-168.3,-78.0]]
for(const [lab,cx,cz] of CIRCLES){
  console.log('\n===== CIRCLE '+lab+' ['+cx+','+cz+'] — all centerline vertices within 30m =====')
  const rows=[]
  for(const s of R.streets){const p=s.points;if(!p||p.length<2)continue
    for(let i=0;i<p.length;i++){const dd=dist(p[i],[cx,cz]);if(dd>30)continue
      const isEnd=(i===0||i===p.length-1)
      let t=null,jg=null,e0=null,e1=null
      if(!isEnd){t=turn(p[i-1],p[i],p[i+1]);jg=jog(p[i-1],p[i],p[i+1]);e0=dist(p[i-1],p[i]);e1=dist(p[i],p[i+1])}
      rows.push({d:dd,s:s.skelId||s.name,i,p:p[i],isEnd,t,jg,e0,e1,np:p.length})
    }
  }
  rows.sort((a,b)=>a.d-b.d)
  for(const r of rows.slice(0,10)){
    let line='  '+r.d.toFixed(1)+'m  '+(r.s||'?').padEnd(20)+' v'+r.i+'/'+(r.np-1)+' ['+r.p[0].toFixed(1)+','+r.p[1].toFixed(1)+']'
    if(r.isEnd)line+=' ENDPOINT'
    else{line+=' turn='+r.t.toFixed(1)+'° jog='+r.jg.toFixed(2)+'m edges='+r.e0.toFixed(1)+'/'+r.e1.toFixed(1)+'m'
      if(r.t>3&&(r.e0<25||r.e1<25))line+='  <<<'}
    console.log(line)
  }
}
