import fs from 'fs'
const shape = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json','utf8'))
const TH=0.6
const gap=(m,s)=>Math.max(0, Number.isFinite(m?.[s]?.treelawn)?m[s].treelawn:0)
const glean=(m,s)=>{ const sd=m?.[s]; if(sd&&sd.terminal==='lawn'){const o=s==='left'?'right':'left'; if(m?.[o]?.terminal==='sidewalk') return gap(m,o)>=TH } return gap(m,s)>=TH }
// gather all runs by frontage identity (skelId|side), list their gleaned Y/N in segOrd order
const byFrontage = new Map()
for (const t of shape.tiles) for (const r of (t.runs||[])){
  const k=`${r.skelId}|${r.side}`
  if(!byFrontage.has(k)) byFrontage.set(k,[])
  byFrontage.get(k).push({ segOrd:r.segOrd, Y: glean(r.baseMeasure||r.measure, r.side)?'Y':'N', gapL:gap(r.baseMeasure,'left').toFixed(2), gapR:gap(r.baseMeasure,'right').toFixed(2) })
}
console.log('=== frontages whose segments FLIP arrangement (Y/N not constant along skelId|side) ===')
let flips=0
for (const [k,segs] of byFrontage){
  const ys=new Set(segs.map(s=>s.Y))
  if(ys.size>1){ flips++
    console.log(`  ${k}:  ${segs.sort((a,b)=>a.segOrd-b.segOrd).map(s=>`seg${s.segOrd}=${s.Y}(L${s.gapL}/R${s.gapR})`).join('  ')}`)
  }
}
console.log(`\nTOTAL frontages that FLIP mid-line: ${flips} / ${byFrontage.size}`)
console.log('(each flip = a seam where grass meets walk and the band cannot join)')
