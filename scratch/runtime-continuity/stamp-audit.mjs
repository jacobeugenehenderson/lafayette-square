import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
const R='public/baked'
const STAMP=/^(look|lookName|town|scene|mapId|townId|sceneId|slug|id)$/
for (const folder of readdirSync(R)) {
  const d=join(R,folder); if(!statSync(d).isDirectory()) continue
  const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):e.name.endsWith('.json')?[join(p,e.name)]:[])
  for (const f of walk(d)) {
    let j; try{ j=JSON.parse(readFileSync(f,'utf8')) }catch{ console.log(folder,f,'UNPARSEABLE'); continue }
    const top={}; if(j&&typeof j==='object'&&!Array.isArray(j)) for(const [k,v] of Object.entries(j)) if(STAMP.test(k)&&(typeof v==='string'||typeof v==='number')) top[k]=v
    const abs=new Map(); let n=0
    const scan=(v,path,depth)=>{ if(depth>8) return; if(typeof v==='string'){const m=v.match(/^\/baked\/([^/]+)\//); if(m){abs.set(m[1],(abs.get(m[1])||0)+1); if(!abs.has('_ex:'+m[1])) abs.set('_ex:'+m[1],path)} }
      else if(Array.isArray(v)) v.forEach((x,i)=>scan(x,path+'[]',depth+1)); else if(v&&typeof v==='object') for(const [k,x] of Object.entries(v)) scan(x,path+'.'+k,depth+1) }
    scan(j,'',0)
    const absOut=[...abs].filter(([k])=>!k.startsWith('_ex:')).map(([k,c])=>`${k}×${c} e.g.${abs.get('_ex:'+k)}`)
    const mism=Object.entries(top).filter(([k,v])=>/look|scene|town|mapId/.test(k)&&k!=='townId'&&v!==folder).map(([k,v])=>`${k}=${v}`)
    const absMism=[...abs].filter(([k])=>!k.startsWith('_ex:')&&k!==folder).map(([k])=>k)
    if(Object.keys(top).length||absOut.length) console.log(`${folder}\t${f.slice(d.length+1)}\t${JSON.stringify(top)}\t${absOut.join('; ')}${mism.length||absMism.length?'\t⛔STALE '+[...mism,...absMism.map(x=>'abs:'+x)].join(','):''}`)
  }
}
