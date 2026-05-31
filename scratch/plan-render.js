// Throwaway top-down plan rasterizer for baked ground.{json,bin}.
// Faithful XZ orthographic projection of the real baked triangles,
// painted in renderOrder. Inspection only — not a construction tool.
// Usage: node plan-render.js <ground.json> <out.png> [cx cz halfSpanMeters W H]
const fs = require('fs')
const zlib = require('zlib')

const [,, jsonPath, outPath, cxs, czs, halfs, Ws, Hs] = process.argv
const g = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
const binPath = jsonPath.replace(/[^/]*$/, g.bin)
const buf = fs.readFileSync(binPath)

// View window (meters). Default = full bbox.
const bb = g.bbox
let cx = cxs !== undefined ? +cxs : (bb.min[0] + bb.max[0]) / 2
let cz = czs !== undefined ? +czs : (bb.min[2] + bb.max[2]) / 2
let half = halfs !== undefined ? +halfs : Math.max(bb.max[0]-bb.min[0], bb.max[2]-bb.min[2]) / 2
const W = Ws ? +Ws : 2000, H = Hs ? +Hs : 2000
const minX = cx - half, maxX = cx + half, minZ = cz - half, maxZ = cz + half

// RGB framebuffer, paper background.
const img = Buffer.alloc(W * H * 3, 0)
for (let i = 0; i < W*H; i++) { img[i*3]=24; img[i*3+1]=24; img[i*3+2]=26 }

function hex(c){ const n=parseInt(c.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255] }
function px(x){ return ((x - minX) / (maxX - minX)) * W }
function py(z){ return ((z - minZ) / (maxZ - minZ)) * H } // +Z downward in image

function fillTri(ax,ay,bx,by,cx2,cy,r,gn,b){
  const minx=Math.max(0,Math.floor(Math.min(ax,bx,cx2)))
  const maxx=Math.min(W-1,Math.ceil(Math.max(ax,bx,cx2)))
  const miny=Math.max(0,Math.floor(Math.min(ay,by,cy)))
  const maxy=Math.min(H-1,Math.ceil(Math.max(ay,by,cy)))
  if (maxx<minx||maxy<miny) return
  const d=(by-cy)*(ax-cx2)+(cx2-bx)*(ay-cy)
  if (Math.abs(d)<1e-9) return
  for(let y=miny;y<=maxy;y++) for(let x=minx;x<=maxx;x++){
    const pxc=x+0.5, pyc=y+0.5
    const a=((by-cy)*(pxc-cx2)+(cx2-bx)*(pyc-cy))/d
    const bb2=((cy-ay)*(pxc-cx2)+(ax-cx2)*(pyc-cy))/d
    const c=1-a-bb2
    if(a>=-0.0001&&bb2>=-0.0001&&c>=-0.0001){ const o=(y*W+x)*3; img[o]=r; img[o+1]=gn; img[o+2]=b }
  }
}

const groups = g.groups.slice().sort((p,q)=>(p.renderOrder||0)-(q.renderOrder||0))
let tris=0, drawn=0
for(const grp of groups){
  const [r,gn,b]=hex(grp.color||'#888888')
  const vbo=grp.vertexByteOffset, ibo=grp.indexByteOffset, ic=grp.indexCount
  for(let k=0;k<ic;k+=3){
    const i0=buf.readUInt32LE(ibo+(k+0)*4), i1=buf.readUInt32LE(ibo+(k+1)*4), i2=buf.readUInt32LE(ibo+(k+2)*4)
    const o0=vbo+i0*12, o1=vbo+i1*12, o2=vbo+i2*12
    const x0=buf.readFloatLE(o0), z0=buf.readFloatLE(o0+8)
    const x1=buf.readFloatLE(o1), z1=buf.readFloatLE(o1+8)
    const x2=buf.readFloatLE(o2), z2=buf.readFloatLE(o2+8)
    tris++
    // cull tris fully outside window (quick reject)
    if((x0<minX&&x1<minX&&x2<minX)||(x0>maxX&&x1>maxX&&x2>maxX)||(z0<minZ&&z1<minZ&&z2<minZ)||(z0>maxZ&&z1>maxZ&&z2>maxZ)) continue
    fillTri(px(x0),py(z0),px(x1),py(z1),px(x2),py(z2),r,gn,b); drawn++
  }
}

// PNG encode (RGB, filter 0)
const stride=W*3
const raw=Buffer.alloc((stride+1)*H)
for(let y=0;y<H;y++){ raw[y*(stride+1)]=0; img.copy(raw,y*(stride+1)+1,y*stride,y*stride+stride) }
const idat=zlib.deflateSync(raw)
function chunk(type,data){ const len=Buffer.alloc(4); len.writeUInt32BE(data.length); const t=Buffer.from(type); const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t,data]))>>>0); return Buffer.concat([len,t,data,crc]) }
const CRC=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})()
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return (c^0xffffffff)>>>0}
const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))])
fs.writeFileSync(outPath,png)
console.log(`wrote ${outPath}  window=[${minX.toFixed(0)},${minZ.toFixed(0)}..${maxX.toFixed(0)},${maxZ.toFixed(0)}]m  ${W}x${H}  tris=${tris} drawn=${drawn}`)
