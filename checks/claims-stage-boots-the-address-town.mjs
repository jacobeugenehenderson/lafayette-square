#!/usr/bin/env node
// claims-stage-boots-the-address-town.mjs — DOES STAGE'S FIRST RENDER DRAW THE TOWN ITS ADDRESS NAMES, NEVER A REMEMBERED ONE?
//
// ⭐ THE CLAIM (Sigil, 2026-10-31; Boz's ruling, Zob's co-sign). The cartograph store's initial `activeLookId` and
// `scene` are the page's own town: the address resolved ONCE by authoringAddress.js#resolveTown over the bundled Looks
// index (`BOOT_TOWN`), the same resolver and index src/instance.js resolved the page's INSTANCE from. Found by a frame
// recorder: a fresh /stage/hipointedemun/hero with Provincetown remembered drew PROVINCETOWN's whole splash for ~6 s,
// because the store booted on its own rule (`url.look || stored.look`, no scene check) until _loadLooks corrected it.
// Two judges, each reading the source of truth rather than restating it:
//   1 · THE STORE — useCartographStore.js resolves BOOT_TOWN by resolveTown over the bundled index and readAddress();
//       its initial activeLookId and scene read BOOT_TOWN; and nowhere does it read the remembered Look or scene itself
//       (`stored.look` / `stored.scene`, outside comments) — resolveTown is their only reader.
//   2 · THE RESOLVER, RUN on the real index — for EVERY ordered pair of towns (A, B) in it: the address of town A (its
//       path scene) with town B's Look and scene remembered resolves to a Look OF TOWN A, never B's.
// ⭐ MUTANTS (--mutants), each must go RED: (a) the old initializer `url.look || stored.look` back → 1 · (b) the old scene
// rule (stored.scene, ignoring ?look=) back → 1 · (c) a resolver that takes the remembered Look first → 2.
//   node checks/claims-stage-boots-the-address-town.mjs [--mutants]
// Read-only. Exits 1 on any failing judge or any mutant left GREEN.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveTown } from '../src/lib/authoringAddress.js'
import looksIndex from '../public/looks/index.json' with { type: 'json' }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STORE = 'src/cartograph/stores/useCartographStore.js'
const code = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')

function judgeStore(text) {
  const why = [], c = code(text)
  if (!/export const BOOT_TOWN = resolveTown\(looksIndex\.looks \|\| \[\], readAddress\(\)\)/.test(c)) why.push(`${STORE} does not resolve BOOT_TOWN by resolveTown over the bundled index and readAddress()`)
  if (!/import looksIndex from '\.\.\/\.\.\/\.\.\/public\/looks\/index\.json'/.test(c)) why.push(`${STORE} does not import the bundled Looks index the page's INSTANCE resolves from`)
  if (!/^\s*activeLookId: BOOT_TOWN\.lookId,/m.test(c)) why.push(`${STORE}'s initial activeLookId is not BOOT_TOWN.lookId`)
  if (!/^\s*scene: BOOT_TOWN\.scene,/m.test(c)) why.push(`${STORE}'s initial scene is not BOOT_TOWN.scene`)
  const raw = c.split('\n').find((l) => /\bstored\.(look|scene)\b/.test(l))
  if (raw) why.push(`${STORE} reads the remembered Look/scene itself (resolveTown is its only reader): ${raw.trim().slice(0, 110)}`)
  return why
}

const towns = looksIndex.looks.filter((l) => l.scene)
function judgeResolver(resolve) {
  const why = []
  let pairs = 0
  for (const a of towns) for (const b of towns) {
    if (a.scene === b.scene) continue
    pairs++
    const r = resolve(looksIndex.looks, { url: { scene: a.scene, look: null, shot: 'hero' }, stored: { scene: b.scene, look: b.id, shot: null } })
    const got = looksIndex.looks.find((l) => l.id === r.lookId)
    if (!got || got.scene !== a.scene) why.push(`/stage/${a.scene}/… with ${b.id} remembered boots Look ${JSON.stringify(r.lookId)} — not a Look of ${a.scene}`)
  }
  if (pairs < 2) why.push('fewer than two towns in the Looks index — nothing was judged')
  return { why, pairs }
}

const storeText = readFileSync(join(ROOT, STORE), 'utf8')
const res = { 1: judgeStore(storeText), 2: judgeResolver(resolveTown).why }
let bad = 0
console.log('\nStage boots the address\'s town')
for (const [k, name] of [[1, 'the store boots BOOT_TOWN'], [2, `the resolver, every ordered pair of ${towns.length} towns (${judgeResolver(resolveTown).pairs})`]]) {
  if (res[k].length) { bad++; console.log(`  ⛔ ${k} · ${name}`); for (const w of res[k].slice(0, 6)) console.log(`       ${w}`) }
  else console.log(`  ✅ ${k} · ${name}`)
}

if (process.argv.includes('--mutants')) {
  const MUTANTS = [
    ['a · the old initializer back', 1, () => judgeStore(storeText.replace('activeLookId: BOOT_TOWN.lookId,', 'activeLookId: (({ url, stored }) => url.look || stored.look)(readAddress()),'))],
    ['b · the old scene rule back', 1, () => judgeStore(storeText.replace('scene: BOOT_TOWN.scene,', 'scene: (({ url, stored }) => isValidMapId(url.scene) ? url.scene : isValidMapId(stored.scene) ? stored.scene : null)(readAddress()),'))],
    ['c · a resolver taking the remembered Look first', 2, () => judgeResolver((looks, a) => (a.stored.look ? { lookId: a.stored.look } : resolveTown(looks, a))).why],
  ]
  console.log('\n  mutants:')
  for (const [name, judge, run] of MUTANTS) {
    const r = run()
    if (r.length) console.log(`  ✅ ${name} → judge ${judge} red: ${r[0].slice(0, 110)}`)
    else { bad++; console.log(`  ⛔ ${name} — planted and judge ${judge} STAYED GREEN`) }
  }
}

console.log(bad ? `\n⛔ ${bad} failure(s)\n` : '\n✅ Stage\'s first render is the address\'s town, never a remembered one\n')
process.exit(bad ? 1 : 0)
