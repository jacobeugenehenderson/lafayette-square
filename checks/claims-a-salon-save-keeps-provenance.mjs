// claims-a-salon-save-keeps-provenance.mjs — DOES A SALON SAVE KEEP WHAT THE WORKSTAGE NEVER SENDS?
//
// The workstage GETs a species' compositions, edits one plate, and POSTs the whole array back
// (arborist/serve.js → writeCompositions). Keys it does not know — `derivedFrom` (the
// 2026-08-25 form rename's provenance) and `auto` (a system build's per-plate picks) — must
// survive that round-trip; `effective` (computed on read) must never be persisted.
// Until 2026-09-25 writeCompositions rebuilt each slot from a fixed field list and erased both.
//
// Runs the real read + write on a throwaway species id under arborist/state/, removed after.
//
// ▶ MUTATION-TEST IT: in generate-salon.js writeCompositions, drop `...merged,` from the returned slot → RED (derivedFrom + auto lost).
//
//   node checks/claims-a-salon-save-keeps-provenance.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { readEffectiveCompositions, writeCompositions } from '../arborist/generate-salon.js'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const id = `__check_salon_save_${process.pid}`
const dir = path.join(REPO, 'arborist/state', id)
let red = 0
const bad = m => { red++; console.log(`   ⛔ ${m}`) }
try {
  fs.mkdirSync(dir, { recursive: true })
  const auto = { chassis: { pick: 'rounded_01', tier: 'G', reason: 'same genus' } }
  fs.writeFileSync(path.join(dir, 'compositions.json'), JSON.stringify({ species: id, compositions: [
    { slot: 1, name: 'Slot 1', chassis: 'rounded_01', bark: {}, leaves: { scale: 2 }, deformer: {}, transform: {}, derivedFrom: 'white_oak_a', auto },
  ] }))
  // the workstage round-trip: GET, change one plate, POST the whole array
  const got = await readEffectiveCompositions(id)
  if (got[0]?.auto?.chassis?.pick !== 'rounded_01') bad('the read does not return `auto` — the Salon cannot show which plates the system picked')
  const edited = got.map(c => ({ ...c, leaves: { ...c.leaves, scale: 3 } }))
  delete edited[0].derivedFrom; delete edited[0].auto          // a client that never heard of them
  await writeCompositions(id, edited)
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'compositions.json'), 'utf8')).compositions[0]
  saved.derivedFrom === 'white_oak_a' ? console.log('   ✅ derivedFrom survives a save') : bad(`derivedFrom lost (${saved.derivedFrom})`)
  saved.auto?.chassis?.pick === 'rounded_01' ? console.log('   ✅ auto survives a save') : bad('auto lost')
  saved.leaves?.scale === 3 ? console.log('   ✅ the edit landed') : bad(`the edit did not land (leaves.scale ${saved.leaves?.scale})`)
  'effective' in saved ? bad('`effective` (computed on read) was persisted') : console.log('   ✅ effective not persisted')
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}
console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
