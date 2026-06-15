import { readFileSync } from 'fs'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const find = id => r.streets.find(s => (s.skelId||s.name)===id)
for (const id of ['west-18th-street','south-18th-street-3','dolman-street-1']) {
  const s = find(id); if(!s){console.log(id,'MISSING');continue}
  const p=s.points
  console.log(`\n${id}: name="${s.name}" pts=${p.length} continuesAs=${JSON.stringify(s.continuesAs)} pairId=${s.pairId||''}`)
  console.log(`  ends: [${p[0].map(x=>x.toFixed(1))}] .. [${p[p.length-1].map(x=>x.toFixed(1))}]`)
  console.log(`  measure.left.pavHW=${s.measure?.left?.pavementHW} right.pavHW=${s.measure?.right?.pavementHW} symmetric=${s.measure?.symmetric}`)
}
// intersections that involve west-18th and/or south-18th-3
console.log('\n=== intersections involving west-18th or south-18th-3 ===')
for (const ix of (r.intersections||[])) {
  const names = (ix.streets||[]).map(si=>{const s=r.streets[typeof si==='object'?(si.street??si.idx):si];return s?(s.skelId||s.name):si})
  if (names.some(n=>n==='west-18th-street'||n==='south-18th-street-3')) {
    console.log(`  @[${ix.point.map(x=>x.toFixed(1))}] deg=${(ix.streets||[]).length} ${JSON.stringify(names)}`)
  }
}
