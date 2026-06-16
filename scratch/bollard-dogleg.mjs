import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const turn=(a,b,c)=>{let ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1];const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);if(li<1e-9||lo<1e-9)return 0;return Math.acos(Math.max(-1,Math.min(1,(ix*ox+iz*oz)/(li*lo))))*180/Math.PI}
// perpendicular offset of B from line A-C (the jog magnitude)
const jog=(a,b,c)=>{const dx=c[0]-a[0],dz=c[1]-a[1],L=Math.hypot(dx,dz);if(L<1e-9)return 0;return Math.abs((b[0]-a[0])*dz-(b[1]-a[1])*dx)/L}
const CIRCLES=[['#A',-40.7,175.6],['#B',-49.8,-188.7],['#C',-168.3,-78.0]]
for(const [lab,cx,cz] of CIRCLES){
  console.log('\n===== CIRCLE '+lab+' ['+cx+','+cz+'] =====')
  for(const s of R.streets){const p=s.points;if(!p||p.length<2)continue
    // any vertex within 12m?
    const hits=[];for(let i=0;i<p.length;i++)if(dist(p[i],[cx,cz])<12)hits.push(i)
    if(!hits.length)continue
    console.log('  '+(s.name||s.skelId).padEnd(20)+'('+(s.skelId||'')+') pts='+p.length+' anchor='+(s.anchor||'-')+' pairId='+(s.pairId||'-'))
    for(let i=0;i<p.length;i++){
      if(dist(p[i],[cx,cz])>14)continue
      const isEnd=(i===0||i===p.length-1)
      let info='    v'+i+' ['+p[i][0].toFixed(1)+','+p[i][1].toFixed(1)+']'
      if(!isEnd){const t=turn(p[i-1],p[i],p[i+1]);const jg=jog(p[i-1],p[i],p[i+1]);const eIn=dist(p[i-1],p[i]),eOut=dist(p[i],p[i+1]);info+=' turn='+t.toFixed(1)+'° jog='+jg.toFixed(2)+'m edges='+eIn.toFixed(1)+'/'+eOut.toFixed(1)+'m'+((t>4&&t<60)?'  <<< DOG-LEG?':'')}
      else info+=' (endpoint)'
      console.log(info)
    }
  }
}
