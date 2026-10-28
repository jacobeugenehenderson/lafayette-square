#!/usr/bin/env node
// claims-the-salon-says-why-its-library-is-empty.mjs — DOES THE SALON CALL ITS CHASSIS LIBRARY "EMPTY" ONLY WHEN IT IS?
//
// ⭐ "A message explains or goes away" (2026-10-28): the Arborist Salon showed "Chassis library is empty. Run node
// arborist/survey-deleaf.js …" while public/trees/_chassis held 241 chassis. The loader read each of the server's four answers with
// `.json()` and defaulted a missing list to [], so a failed answer (a 500, a proxy page, a restart) read as an empty library
// (arborist/BACKLOG.md item 3). Now src/arborist/salonLibraries.js#readSalonLibraries reads them:
//   ① a planted 500 (with the server's { error }), a non-JSON body, and an answer with no list each REFUSE, naming the library
//      and the cause — never an empty catalog;
//   ② a planted good answer with an empty catalog → [] and salonChassisLoaded: true (empty, truly); with chassis → them;
//   ③ the store loads through it and a failure leaves salonChassisLoaded false; SalonWorkstage's banner is gated on
//      salonChassisLoaded (read from the source);
//   (Measured once, by hand, 2026-10-28: the integration tree's catalog built offline as GET /salon/:species/chassis builds it —
//   listChassis 241 → species filter 228 → forest filter 221. Not run here: generate-salon.js's imports can write, which would make
//   this check live.)
// ⭐ MUTANTS (--mutants), each RED: the ok test removed (a 500 read as a body) · the banner's loaded gate removed.
//   node checks/claims-the-salon-says-why-its-library-is-empty.mjs [--mutants]
// Read-only. Exits 1 on any claim false or a mutant not seen.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'
const MUTANTS = process.argv.includes('--mutants')
const lib = (tag, transform) => importSource('src/arborist/salonLibraries.js', { suffix: `// ${tag}`, transform })
const res = (status, body, raw = false) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (raw) throw new Error('Unexpected token <'); return body } })
const good = { bark: res(200, { bark: [] }), leaves: res(200, { leaves: [] }), options: res(200, {}) }
const STORE = readFileSync(join(ROOT, 'src/arborist/stores/useArboristStore.js'), 'utf8'), SALON = readFileSync(join(ROOT, 'src/arborist/SalonWorkstage.jsx'), 'utf8')

async function claims({ readSalonLibraries }, store, salon) {
  const out = [], refuses = async (what, answers, must) => { try { const v = await readSalonLibraries(answers); out.push(`① ${what} read as a library (${JSON.stringify(v.salonChassisCatalog)})`) } catch (e) { if (!must.every(m => e.message.includes(m))) out.push(`① ${what}: the refusal does not name ${must.join(' and ')} (${e.message})`) } }
  await refuses('a 500 on the chassis catalog', { ...good, chassis: res(500, { error: 'ENOENT public/trees/_chassis' }) }, ['chassis catalog', 'HTTP 500', 'ENOENT'])
  await refuses('a proxy page (not JSON)', { ...good, chassis: res(200, null, true) }, ['chassis catalog', 'not JSON'])
  await refuses('an answer with no chassis list', { ...good, chassis: res(200, { error: 'x' }) }, ['chassis catalog', 'no `chassis` list'])
  await refuses('a 502 on the bark library', { ...good, chassis: res(200, { chassis: [] }), bark: res(502, {}) }, ['bark library', 'HTTP 502'])
  try { const e = await readSalonLibraries({ ...good, chassis: res(200, { chassis: [] }) }); if (!(Array.isArray(e.salonChassisCatalog) && !e.salonChassisCatalog.length && e.salonChassisLoaded === true)) out.push('② a truly empty catalog is not [] with salonChassisLoaded') } catch (e) { out.push(`② a good empty answer refused: ${e.message}`) }
  try { const e = await readSalonLibraries({ ...good, chassis: res(200, { chassis: [{ name: 'a' }] }) }); if (e.salonChassisCatalog?.length !== 1) out.push('② a catalog with chassis is not read') } catch (e) { out.push(`② a good answer refused: ${e.message}`) }
  if (!/set\(await readSalonLibraries\(/.test(store)) out.push('③ the store does not load through readSalonLibraries')
  if (!/salonChassisLoaded: false \}\)/.test(store)) out.push('③ a failed load does not leave salonChassisLoaded false')
  if (!/const chassisLibEmpty = chassisLoaded && chassisCatalog\.length === 0/.test(salon)) out.push('③ the "empty" banner is not gated on salonChassisLoaded')
  return out
}
let bad = 0
const real = await claims(await lib('real'), STORE, SALON)
for (const r of real) console.log(`⛔ ${r}`)
if (real.length) bad++
else console.log('✅ a failed answer refuses by name; an empty catalog is said only when the server answered one; the banner waits for a real answer')
if (MUTANTS) for (const [what, mod, salon] of [
  ['the ok test removed', await lib('no-ok', (t) => { const f = '    if (!r?.ok) {'; if (!t.includes(f)) throw new Error('[mutant] re-aim'); return t.replace(f, '    if (false) {') }), SALON],
  ["the banner's loaded gate removed", await lib('m2'), SALON.replace('const chassisLibEmpty = chassisLoaded && chassisCatalog.length === 0', 'const chassisLibEmpty = chassisCatalog.length === 0')],
]) { const got = await claims(mod, STORE, salon), red = got.length > real.length
  if (!red) bad++
  console.log(`   mutant · ${what}: ${red ? `RED, as it must be (${got[0]})` : '⛔ still clean — the check cannot see it'}`) }
console.log(bad ? '\n⛔ RED — the Salon can call its library empty when an answer failed' : '\n✅ GREEN — the Salon says "empty" only of an empty library, and names a failed answer')
process.exit(bad ? 1 : 0)
