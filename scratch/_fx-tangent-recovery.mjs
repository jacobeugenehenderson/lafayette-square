// Does a frozen fillet's TANGENT resolve to a vertex of the contour the proto painter
// indexes (`iaFull`)? Uses the painter's OWN 1mm-grid lookup, re-implemented verbatim.
import fs from 'fs'
const GRID=0.001, QK=(x,y)=>`${Math.round(x*1000)},${Math.round(y*1000)}`
const ixOf=r=>{const m=new Map();r.forEach((p,q)=>{const k=QK(p[0],p[1]);(m.get(k)||m.set(k,[]).get(k)).push(q)});return m}
const find=(ix,ring,P)=>{const cx=Math.round(P[0]*1000),cy=Math.round(P[1]*1000);let b=null,bd=Infinity
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const a=ix.get(`${cx+dx},${cy+dy}`);if(!a)continue
    for(const q of a){const d=Math.hypot(ring[q][0]-P[0],ring[q][1]-P[1]);if(d<bd){bd=d;b=q}}}
  return bd<=GRID?b:null}
for (const [label,p] of [['① proto (tonight, what the app reads)','public/baked/lafayette-square/shape.json'],
                         ['chain (2026-08-11 worktree)','.claude/worktrees/a0-deadend/public/baked/lafayette-square/shape.json']]) {
  const T=(JSON.parse(fs.readFileSync(p,'utf8')).tiles)||[]
  for (const which of ['iaFull','iA']) {
    let tot=0, both=0, minor=0
    for(const t of T){ const rings=t[which]||[]; const idx=rings.map(ixOf)
      for(const fl of t.fillets||[]){ tot++
        let ok=false, mn=false
        for(let r=0;r<rings.length;r++){ const a=find(idx[r],rings[r],fl.tA), b=find(idx[r],rings[r],fl.tB)
          if(a==null||b==null) continue; ok=true
          const n=rings[r].length, fwd=(b-a+n)%n, bwd=(a-b+n)%n, len=Math.min(fwd,bwd)
          if(!(len===0||len*2>n)) mn=true }
        if(ok)both++; if(mn)minor++ } }
    if(!tot) continue
    console.log(`${label.padEnd(38)} ${which.padEnd(7)} fillets ${String(tot).padStart(4)} · both tangents found on a ring ${String(both).padStart(4)} (${(100*both/tot).toFixed(1)}%) · usable MINOR arc ${String(minor).padStart(4)} (${(100*minor/tot).toFixed(1)}%)`)
  }
}
