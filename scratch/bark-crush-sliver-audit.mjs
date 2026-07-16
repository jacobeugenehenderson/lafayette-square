import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import fs from 'fs'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const bake=JSON.parse(fs.readFileSync('public/baked/hipointe-demun/trees.json','utf8'))
const insts=(bake.tiles?.instancesByTile||[]).flatMap(t=>t.instances)
const n=new Map(); for(const i of insts){const k=(i.lods?.lod0)||i.url; n.set(k,(n.get(k)||0)+1)}
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s}return o}
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
function collect(doc){ // [{prim, M}] with true world matrices
  const out=[]
  const walk=(node,m)=>{const M=mul(m,node.getMatrix()); const mesh=node.getMesh()
    if(mesh) for(const pr of mesh.listPrimitives()) out.push({pr,M})
    for(const c of node.listChildren()) walk(c,M)}
  for(const s of doc.getRoot().listScenes()) for(const r of s.listChildren()) walk(r,I)
  return out
}
const xf=(M,x,y,z)=>[M[0]*x+M[4]*y+M[8]*z+M[12], M[1]*x+M[5]*y+M[9]*z+M[13], M[2]*x+M[6]*y+M[10]*z+M[14]]
const rows=[]
for(const [url,count] of n){
  const p0=url.replace(/^\//,'').replace(/^trees\//,'public/trees/').replace(/-lod[12]\.glb$/,'-lod0.glb')
  for (const lod of ['lod1','lod2']) {
    try{
      const d0=await io.read(p0), d=await io.read(p0.replace('-lod0.glb',`-${lod}.glb`))
      // true world height from lod0
      let mn=1e18,mx=-1e18
      for(const {pr,M} of collect(d0)){const a=pr.getAttribute('POSITION'); if(!a)continue
        const lo=a.getMin([]),hi=a.getMax([])
        for(let i=0;i<8;i++){const w=xf(M,(i&1)?hi[0]:lo[0],(i&2)?hi[1]:lo[1],(i&4)?hi[2]:lo[2]); if(w[1]<mn)mn=w[1]; if(w[1]>mx)mx=w[1]}}
      const H=mx-mn
      let maxE=0,slivers=0,tot=0
      for(const {pr,M} of collect(d)){
        const pos=pr.getAttribute('POSITION')?.getArray(); const idx=pr.getIndices()?.getArray()
        if(!pos||!idx)continue
        for(let i=0;i<idx.length;i+=3){ tot++
          const P=[0,1,2].map(k=>{const j=idx[i+k]; return xf(M,pos[j*3],pos[j*3+1],pos[j*3+2])})
          let big=false
          for(const [a,b] of [[0,1],[1,2],[2,0]]){
            const L=Math.hypot(P[a][0]-P[b][0],P[a][1]-P[b][1],P[a][2]-P[b][2])
            if(L>maxE)maxE=L; if(L>H*0.5) big=true }
          if(big) slivers++ }
      }
      rows.push({v:p0.replace('public/trees/','').replace('-lod0.glb',''),lod,count,H,maxE,pct:H?100*maxE/H:0,slivers,tot})
    }catch(e){}
  }
}
rows.sort((a,b)=>b.pct-a.pct)
console.log('TRUE world units (node transforms applied). Sliver = edge > 50% of tree height.')
console.log('variant                        lod   inst   treeH   maxEdge   %ofH  slivers/tris')
for(const r of rows.slice(0,16))
  console.log(`${r.v.padEnd(30)} ${r.lod}  ${String(r.count).padStart(4)}  ${r.H.toFixed(1).padStart(5)}m  ${r.maxE.toFixed(1).padStart(7)}m ${r.pct.toFixed(0).padStart(5)}%  ${r.slivers}/${r.tot}`)
