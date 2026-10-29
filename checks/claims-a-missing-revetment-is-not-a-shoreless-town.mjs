// claims-a-missing-revetment-is-not-a-shoreless-town.mjs
//
// ⭐⭐ THE INVARIANT: the renderer may draw "no shore" only when it has been TOLD there is no shore — and the town's
// MANIFEST is what tells it (2026-10-28). `bake-revetment` writes nothing for a town with no shoreline, and
// `bake-manifest` (the Bake's last step) lists every file the slab holds. So src/lib/revetmentFromSlab.js#loadRevetment:
//   · the manifest names no revetment.json → nothing fetched, nothing said (an inland town is not an error);
//   · it names one → fetched, and anything but the JSON artifact — a 404, vite's 200-HTML index, a 500, a corrupt
//     body — is REFUSED BY NAME, never resolved as "no coast" (the manifest said it is there);
//   · there is no manifest → said by name, nothing drawn: absence is never a guess.
// ⛔ WHY (two generations): Marram, 2026-09-24 — the loader branched on 404 and vite's 200-HTML sent every coastless
// town down the FAILED branch; a three-state classifier then said "unverifiable". 2026-10-28 (Ward, HPDM's live
// player) — the loader still asked for a file the manifest never named, and on a published town that name cannot even
// be resolved (slabNames.js#shaOf throws): every cold load of every inland town logged "FAILED to load revetment.json".
// The answer is not a better guess at a response: it is not to ask.
// ⭐ BEHAVIOURAL (planted manifests, a spy fetch, a spy voice) + SOURCE (both callers go through loadRevetment).
// MUTATION TEST — each must turn this RED: an unconditional fetch · a failed load treated as absent (silent) · a
// missing manifest treated as inland (silent).
//   node checks/claims-a-missing-revetment-is-not-a-shoreless-town.mjs
// Read-only. Exits 1 if any case resolves the wrong way.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { loadRevetment } from '../src/lib/revetmentFromSlab.js'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const DOC = { arcs: [], seed: 1 }
const res = (status, ct, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => ct }, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) })
const INLAND = { town: 'planted', files: { 'ground.json': {} } }, COASTAL = { town: 'planted', files: { 'ground.json': {}, 'revetment.json': {} } }
const CASES = [
  // [name, manifest, response, want doc?, want fetch?, want said?]
  ['an inland town (manifest names none)', INLAND, res(404, 'text/html'), false, false, false],
  ['a coastal town, the artifact', COASTAL, res(200, 'application/json; charset=utf-8', DOC), true, true, false],
  ['named, but 404', COASTAL, res(404, 'text/html'), false, true, true],
  ["named, but vite's 200-HTML index", COASTAL, res(200, 'text/html; charset=utf-8'), false, true, true],
  ['named, but a 500', COASTAL, res(500, 'application/json'), false, true, true],
  ['named, but a corrupt body', COASTAL, res(200, 'application/json', '{not json'), false, true, true],
  ['no manifest at all', null, res(200, 'application/json', DOC), false, false, true],
]
const judge = async (load) => {
  const why = []
  for (const [name, manifest, response, wantDoc, wantFetch, wantSaid] of CASES) {
    let fetched = 0; const said = []
    const doc = await load('planted', { manifest, fetchFile: async () => { fetched++; return response }, say: (m) => said.push(m) })
    const bad = []
    if (!!doc !== wantDoc) bad.push(`doc ${doc ? 'drawn' : 'none'}`)
    if (!!fetched !== wantFetch) bad.push(fetched ? 'fetched' : 'not fetched')
    if (!!said.length !== wantSaid) bad.push(said.length ? `said "${said[0].slice(0, 60)}"` : 'silent')
    if (wantSaid && said.length && !/planted/.test(said[0])) bad.push('said without naming the town')
    if (bad.length) why.push(`${name}: ${bad.join(', ')}`)
  }
  return why
}
const W = await judge(loadRevetment)
row(!W.length, `loadRevetment: an inland town asks nothing and says nothing; a named revetment that fails is refused by name; no manifest is said (${CASES.length} cases)${W.length ? ': ' + W.join(' · ') : ''}`)

// SOURCE: both callers go through it, and neither asks for revetment.json itself.
for (const f of ['src/components/SlabRevetment.jsx', 'src/harness/lab/stage.js']) {
  const s = readFileSync(join(ROOT, f), 'utf8'), list = f.endsWith('stage.js') ? s.slice(s.indexOf('export async function listStages'), s.indexOf('\n}\n', s.indexOf('export async function listStages'))) : s
  const ok = /loadRevetment\(/.test(list) && !/slabFetch\([^)]*'revetment\.json'/.test(list)
  row(ok, `${f}: loads the revetment through loadRevetment, never asking for revetment.json itself: ${ok}`)
}

// MUTANTS
const mutate = async (name, m) => { const ok = !(await judge(m)).length; row(!ok, `mutant: ${name} → ${ok ? 'still GREEN — the row proves nothing' : 'RED as it must be'}`) }
await mutate('an unconditional fetch', (look, o) => loadRevetment(look, { ...o, manifest: o.manifest ? { ...o.manifest, files: { ...o.manifest.files, 'revetment.json': {} } } : o.manifest }))
await mutate('a failed load treated as absent', (look, o) => loadRevetment(look, { ...o, say: () => {} }))
await mutate('a missing manifest treated as inland', (look, o) => loadRevetment(look, { ...o, manifest: o.manifest ?? { files: {} } }))

console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ an inland town asks for no revetment; a shore the manifest names is never silently missing')
process.exit(red ? 1 : 0)
