// THE OPEN AND THE CLOSE ALONE CUT ONCE (Zob's ruling (c), 2026-10-29): PTown's deck 0 alone (checks/fixtures/cut-once-ptown-street-decks-port.json)
// through cand3.mjs#closeAt and #openAt, live and under setCloseRaw (closeAt returns the morph's raw rings, no selection): live keeps the
// deck's own vertex v162 (118070, 166939) and e162's line; the mutant moves it 1 u (the re-made cap), RED.
// node scratch/cut-once/closeat-mutant.mjs
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint } = clipperLib
const C3 = await import('./cand3.mjs')
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`../../checks/fixtures/cut-once-${n}.json`, import.meta.url), 'utf8')), coast = fx('ptown-coast'), sd = fx('ptown-street-decks-port')
const D = C3.tagOwn([sd.rings[0].map(([x, z]) => new IntPoint(Math.round(x * 1000), Math.round(z * 1000)))]), V = [118070, 166939], E = [[118070, 166939], [118657, 167067]]
const keeps = (rs) => rs.some(r => r.some(q => q.X === V[0] && q.Y === V[1] && JSON.stringify(q.tag) === JSON.stringify(E)))
for (const mut of [false, true]) { C3.setCloseRaw(mut); const k = keeps(C3.closeAt(D, coast.fineM, 'deck 0'))
  console.log(`${mut ? 'MUTANT (raw close)' : 'LIVE'}: closeAt ${k ? 'keeps' : 'MOVES'} v162 and e162's line${mut ? (k ? ' — the row cannot see it' : ', RED as it must be') : ''}`) }
C3.setCloseRaw(false)
console.log(`LIVE: openAt ${keeps(C3.openAt(D, coast.fineM, 'deck 0')) ? 'keeps' : 'MOVES'} v162 and e162's line`)
