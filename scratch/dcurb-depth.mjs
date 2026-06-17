import { readFileSync } from 'fs'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url), 'utf8'))
const get=n=>ribbons.streets.find(s=>s.skelId===n)
for(const n of ['lafayette-avenue-3','lafayette-avenue-7','lafayette-avenue-8','lafayette-avenue-5','lafayette-avenue-6','lafayette-avenue-1']){
  const s=get(n); if(!s){console.log(n,'MISSING');continue}
  const m=s.measure||{}
  console.log(`${n} role=${s.phase?.role||'-'} pair=${s.pairId||'-'} spineAtStart=${s.phase?.spineAtStart??'-'} spineAtEnd=${s.phase?.spineAtEnd??'-'}`)
  console.log(`    L.pavementHW=${m.left?.pavementHW} R.pavementHW=${m.right?.pavementHW} anchor=${s.anchor||'-'} innerSign=${s.innerSign??'-'}`)
}
