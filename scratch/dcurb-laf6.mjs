import { readFileSync } from 'fs'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url), 'utf8'))
const get=n=>ribbons.streets.find(x=>x.skelId===n)
const laf6=get('lafayette-avenue-6')
console.log('laf-6 role:', laf6.phase?.role, 'spineStart:', laf6.phase?.spineAtStart, 'spineEnd:', laf6.phase?.spineAtEnd, 'pairId:', laf6.pairId)
console.log('laf-6 measure L/R:', laf6.measure?.left?.pavementHW, laf6.measure?.right?.pavementHW)
for(const sid of [laf6.phase?.spineAtStart, laf6.phase?.spineAtEnd]){
  const sp=get(sid)
  console.log(`  spine ${sid}:`, sp?'L='+sp.measure.left.pavementHW.toFixed(2)+' R='+sp.measure.right.pavementHW.toFixed(2)+' pts='+sp.points.length:'NOT FOUND')
  if(sp) console.log(`    spine ends: [${sp.points[0].map(v=>v.toFixed(0))}] .. [${sp.points[sp.points.length-1].map(v=>v.toFixed(0))}]`)
}
console.log('laf-6 ends: [', laf6.points[0].map(v=>v.toFixed(0)), '] .. [', laf6.points[laf6.points.length-1].map(v=>v.toFixed(0)),']')
