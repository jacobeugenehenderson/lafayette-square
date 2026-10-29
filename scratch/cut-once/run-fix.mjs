// one fixture through the candidate, full stack on failure: node scratch/cut-once/run-fix.mjs <decks|breakwater|huron>
import fs from 'fs'
const G = await import('./gate.mjs'), C3 = await import('./cand3.mjs')
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const F = { decks: () => { const d = fx('ptown-deck-inputs'); return [G.ip(d.inputs.flat()), d.fineM] }, breakwater: () => { const d = fx('ptown-embankments'); return [G.ip(d.paths), d.fineM] }, huron: () => { const d = fx('huron-traced'); return [G.ip(d.traced), d.fineM] } }
const [src, step] = F[process.argv[2]](); C3.openCloseProvenance(src, step, process.argv[2]); console.log('ok')
