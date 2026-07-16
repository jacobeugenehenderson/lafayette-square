import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import fs from 'fs'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const bake = JSON.parse(fs.readFileSync('public/baked/hipointe-demun/trees.json','utf8'))
const insts=(bake.tiles?.instancesByTile||[]).flatMap(t=>t.instances)
const n=new Map(); for(const i of insts){const k=(i.lods?.lod0)||i.url; n.set(k,(n.get(k)||0)+1)}
function worldY(doc){ // true world-space Y extent honouring node transforms
  let mn=1e18,mx=-1e18
  const walk=(node,m)=>{
    const t=node.getMatrix()
    const M=mul(m,t)
    const mesh=node.getMesh()
    if(mesh) for(const pr of mesh.listPrimitives()){
      const a=pr.getAttribute('POSITION'); if(!a)continue
      const lo=a.getMin([]),hi=a.getMax([])
      for(let i=0;i<8;i++){
        const x=(i&1)?hi[0]:lo[0], y=(i&2)?hi[1]:lo[1], z=(i&4)?hi[2]:lo[2]
        const wy=M[1]*x+M[5]*y+M[9]*z+M[13]
        if(wy<mn)mn=wy; if(wy>mx)mx=wy
      }
    }
    for(const c of node.listChildren()) walk(c,M)
  }
  const I=[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
  for(const s of doc.getRoot().listScenes()) for(const r of s.listChildren()) walk(r,I)
  return {mn,mx,H:mx-mn}
}
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s}return o}
const rows=[]
for(const [url,count] of n){
  const p=url.replace(/^\//,'').replace(/^trees\//,'public/trees/').replace(/-lod[12]\.glb$/,'-lod0.glb')
  try{
    const d=await io.read(p)
    const {H}=worldY(d)
    const scales=doc_scales(d)
    rows.push({v:p.replace('public/trees/','').replace('-lod0.glb',''),count,H,scales})
  }catch(e){}
}
function doc_scales(d){const s=new Set(); for(const nd of d.getRoot().listNodes()){const sc=nd.getScale(); s.add(sc.map(x=>+x.toFixed(4)).join(','))} return [...s].join(' | ')}
rows.sort((a,b)=>b.H-a.H)
console.log('variant                          inst   WORLD height(m)   node scales      VERDICT')
for(const r of rows){
  const bad = r.H>60 || r.H<2
  console.log(`${r.v.padEnd(32)} ${String(r.count).padStart(4)}   ${r.H.toFixed(1).padStart(12)}   ${r.scales.padEnd(22)} ${bad?'<<< OUT OF RANGE':''}`)
}
