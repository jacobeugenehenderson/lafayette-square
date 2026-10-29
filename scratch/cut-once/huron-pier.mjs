// Huron's pier as mapped (checks/claims-the-coast-is-the-lidars.mjs's row: OSM area 1353092362, lines 1353092363/4, no width: the
// typical 1.8 m), its deck INPUTS (structures.mjs#deckInputs) through the candidate's open/close at 0.999 m: the refusal, whole.
// node scratch/cut-once/huron-pier.mjs
const S = await import('../../cartograph/structures.mjs'), C3 = await import('./cand3.mjs'), fs = await import('fs')
const pt = (xz) => xz.map(([x, z]) => ({ x, z }))
const huron = { man_made: [{ tags: { area: 'yes', man_made: 'pier' }, isClosed: true, coords: pt([[707.9, 353.78], [711.24, 353.48], [714.44, 353.19], [717.68, 386.02], [716.67, 385.71], [711.05, 383.94], [707.9, 353.78]]) },
  { tags: { man_made: 'pier' }, isClosed: false, coords: pt([[716.67, 385.71], [716.77, 387.46], [717.17, 394.99]]) },
  { tags: { man_made: 'pier' }, isClosed: false, coords: pt([[690.37, 379.7], [716.77, 387.46]]) }] }
const di = S.deckInputs(huron), paths = di.inputs.flat()
fs.writeFileSync(new URL('./fixtures/huron-pier-deck-inputs.json', import.meta.url), JSON.stringify({ note: 'deckInputs of the Huron pier row in claims-the-coast-is-the-lidars', fineM: 0.999, inputs: di.inputs.map(pp => pp.map(p => p.map(q => [q.X, q.Y]))) }))
console.log('inputs', di.inputs.length, 'paths', paths.length, paths.map(p => p.length))
try { const r = C3.openCloseProvenance(paths, 0.999, 'huron pier'); console.log('MINTED', r.rings.length, 'ring(s)') } catch (e) { console.log(String(e.message).slice(0, 2500)) }
