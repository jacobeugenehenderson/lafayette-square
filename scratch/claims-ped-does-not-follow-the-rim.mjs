// ⛔ NOTHING IS BUILT AT THE MAP EDGE — it is where the drawing stops. A ped band that WRAPS the
// rim runs ALONG the arc for tens of metres; a band that is CUT by the stamp meets it in chords
// no longer than the band is wide. So measure the LENGTH of band boundary lying on the arc.
// ▶ node scratch/claims-ped-does-not-follow-the-rim.mjs [scene ...]
import { feed } from './_proto-feed.mjs'
import { buildTileGround } from '../src/lib/tileGround.js'

for (const scene of (process.argv.slice(2).length?process.argv.slice(2):['lafayette-square'])) {
  const f = feed(scene); if (!f || f.curbWidth == null) continue
  const bR = f.ribbons.protopolygon?.boundaryRing
  if (!bR) { console.log(`⛔ ${scene}: no frozen boundaryRing — NOT checked`); continue }
  const dArc = p => { let m = Infinity
    for (let i=0,j=bR.length-1;i<bR.length;j=i++){ const a=bR[j],b=bR[i]
      const dx=b[0]-a[0],dz=b[1]-a[1],L2=dx*dx+dz*dz
      let t=L2?((p[0]-a[0])*dx+(p[1]-a[1])*dz)/L2:0; t=Math.max(0,Math.min(1,t))
      m=Math.min(m,Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dz))) }
    return m }
  // total edge length whose BOTH ends sit on the arc, and the longest single such run
  const onArc = rings => { let L=0, run=0, best=0
    for (const r of rings||[]) { run=0
      for (let i=0;i<r.length;i++) { const a=r[i], b=r[(i+1)%r.length]
        if (dArc(a)<0.05 && dArc(b)<0.05) { const d=Math.hypot(b[0]-a[0],b[1]-a[1]); L+=d; run+=d; best=Math.max(best,run) }
        else run=0 } }
    return { L, best } }
  const q = o => { const p=console.log; console.log=()=>{}
    const t=buildTileGround(f.ribbons,{smooth:0,curbWidth:f.curbWidth,blockCustoms:f.blockCustoms,stencil:bR,...o}); console.log=p; return t }
  const L = q({}), P = q({ grout:'proto', protoProducer:true })
  console.log(`${scene} — ped boundary lying ON the rim arc:`)
  for (const [tag,t] of [['LEGACY (tile world)',L],['① PROTO           ',P]]) {
    const sw = onArc(t.sidewalk)
    const tl = onArc(Object.values(t.treelawnByLu||{}).flat())
    console.log(`  ${tag}  sidewalk ${sw.L.toFixed(0).padStart(5)} m (longest unbroken run ${sw.best.toFixed(1)} m) · treelawn ${tl.L.toFixed(0).padStart(5)} m (longest ${tl.best.toFixed(1)} m)`)
  }
  console.log(`  ⭐ A CUT meets the arc in chords no longer than the band is wide. A WRAP runs along it.`)
}
