// the take-out's judged disagreements under both orders of the miter limit and the gap rule. node scratch/cut-once/takeout-order.mjs
import fs from 'fs'
process.argv[1] = 'not-main'
const T = await import('./takeout.mjs'), C3 = await import('./cand3.mjs')
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8')), coast = fx('ptown-coast'), sd = fx('ptown-street-decks')
for (const g of [false, true]) { C3.setGapBeforeLimit(g); T.JUDGED.length = 0
  T.takeOutCandidate(coast.water.flatMap(bd => [bd.outer, ...bd.holes]), coast.arcs || [], sd.rings, coast.fineM)
  console.log(g ? 'gap first  ' : 'limit first', JSON.stringify(T.JUDGED.filter(r => r['candidate only'] || r['definition only']))) }
