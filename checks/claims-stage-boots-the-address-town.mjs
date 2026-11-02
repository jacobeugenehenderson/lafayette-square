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
//   3 · A STAGE ADDRESS WITH NO TOWN IS REFUSED BY NAME, RUN (2026-11-01: /stage/lafayette-square/hero was a blank page) —
//       /stage/<a town no Look belongs to> and /stage/<town>?look=<no Look> each resolve NO town, with a refusal naming
//       what exists (every town with a Look / every Look id), even with a town remembered; the same Look-less scene on
//       /cartograph is the Designer's `missing` state, not a refusal.
//   4 · STAGE SAYS WHY, READ — CartographApp mounts the panel only on a town and <StageNoTown> otherwise, and the store's
//       lookRefused starts at BOOT_TOWN.refused (so the refusal shows from the first render), and a hydration that resolves
//       a town clears it (a Look the bundle lacked boots refused and resolves over the fetched index).
// ⭐ MUTANTS (--mutants), each must go RED: (a) the old initializer `url.look || stored.look` back → 1 · (b) the old scene
// rule (stored.scene, ignoring ?look=) back → 1 · (c) a resolver that takes the remembered Look first → 2 · (d) the stage
// refusal removed → 3 · (e) a refusal that names nothing → 3 · (f) the panel mounted with no town → 4 · (g) lookRefused
// starting null → 4 · (h) a hydration that resolves a town keeping the boot's refusal → 4.
//   node checks/claims-stage-boots-the-address-town.mjs [--mutants]
// Read-only. Exits 1 on any failing judge or any mutant left GREEN.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveTown } from '../src/lib/authoringAddress.js'
import { importSource } from './_importSource.mjs'
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

function judgeStageRefusal(resolve) {
  const why = [], remembered = { scene: towns[0]?.scene, look: towns[0]?.id, shot: null }
  const sceneIds = [...new Set(towns.map((l) => l.scene))], lookIds = towns.map((l) => l.id)
  const typo = `${towns[0]?.scene}-not-a-town`
  const r1 = resolve(looksIndex.looks, { url: { scene: typo, look: null, shot: 'hero', stage: true }, stored: remembered })
  if (r1.lookId || r1.scene || !r1.refused) why.push(`/stage/${typo}/hero resolves ${JSON.stringify({ lookId: r1.lookId, scene: r1.scene })} with no refusal: Stage mounts on no town, in silence`)
  else if (!sceneIds.every((sc) => r1.refused.includes(sc))) why.push(`/stage/${typo}'s refusal does not name the towns that have a Look: "${r1.refused}"`)
  const r2 = resolve(looksIndex.looks, { url: { scene: towns[0]?.scene, look: 'no-such-look', shot: 'hero', stage: true }, stored: remembered })
  if (r2.lookId || !r2.refused) why.push(`/stage/${towns[0]?.scene}/hero?look=no-such-look resolves ${JSON.stringify(r2.lookId)} with no refusal`)
  else if (!lookIds.every((id) => r2.refused.includes(id))) why.push(`a bad ?look= on /stage is refused without naming the Looks there are: "${r2.refused}"`)
  const r3 = resolve(looksIndex.looks, { url: { scene: typo, look: null, shot: null }, stored: { scene: null, look: null, shot: null } })
  if (r3.refused || r3.missing !== typo) why.push(`on /cartograph a Look-less scene is not the Designer's missing state (${JSON.stringify(r3)})`)
  return why
}
const APP = 'src/cartograph/CartographApp.jsx'
function judgeStageSays(appText, store) {
  const why = [], a = code(appText), st = code(store)
  if (!/\{!inDesigner && !activeLookId && <StageNoTown \/>\}/.test(a)) why.push(`${APP} does not show <StageNoTown> when no town is open`)
  if (!/\{!inDesigner && activeLookId && \(\s*<StagePanelReal\b/.test(a)) why.push(`${APP} mounts Stage's panel with no town open: its controls read the town's place, and a throw there blanks the page`)
  if (!/^\s*lookRefused: BOOT_TOWN\.refused,/m.test(st)) why.push(`${STORE}'s lookRefused does not start at BOOT_TOWN.refused: Stage shows no reason until the Looks load`)
  // A Look made after the bundle: the boot (bundled index) refuses it, the fetched index resolves it, and the
  // hydration's success must clear the boot's refusal (Zob, 2026-11-01). The resolver half RUN, the store half read.
  const late = towns[0], without = looksIndex.looks.filter((l) => l.scene !== late?.scene)
  const addr = { url: { scene: late?.scene, look: null, shot: 'hero', stage: true }, stored: { scene: null, look: null, shot: null } }
  if (!resolveTown(without, addr).refused || resolveTown(looksIndex.looks, addr).lookId !== late?.id) why.push(`a Look missing from the bundle and present when fetched (${late?.id}) is not refused at boot and resolved at hydration: the case cannot be judged`)
  const ok = st.slice(st.indexOf('_loadLooks: async'), st.indexOf('_loadLooks: async') + 4000).match(/set\(\{ looks, defaultLookId, activeLookId: town\.lookId,[^\n]*\}\)/)?.[0] || ''
  if (!/\blookRefused: null\b/.test(ok)) why.push(`${STORE}#_loadLooks resolves a town without clearing lookRefused: a Look the bundle lacked boots refused and STAYS refused (Toolbar's self-correction stands down) after it resolves`)
  return why
}

const storeText = readFileSync(join(ROOT, STORE), 'utf8'), appText = readFileSync(join(ROOT, APP), 'utf8')
const resolverOf = async (transform) => (await importSource('src/lib/authoringAddress.js', { transform })).resolveTown
const res = { 1: judgeStore(storeText), 2: judgeResolver(resolveTown).why, 3: judgeStageRefusal(resolveTown), 4: judgeStageSays(appText, storeText) }
let bad = 0
console.log('\nStage boots the address\'s town')
for (const [k, name] of [[1, 'the store boots BOOT_TOWN'], [2, `the resolver, every ordered pair of ${towns.length} towns (${judgeResolver(resolveTown).pairs})`],
  [3, 'a Stage address with no town is refused, naming what exists'], [4, 'Stage says why in place of its panel']]) {
  if (res[k].length) { bad++; console.log(`  ⛔ ${k} · ${name}`); for (const w of res[k].slice(0, 6)) console.log(`       ${w}`) }
  else console.log(`  ✅ ${k} · ${name}`)
}

if (process.argv.includes('--mutants')) {
  const MUTANTS = [
    ['a · the old initializer back', 1, () => judgeStore(storeText.replace('activeLookId: BOOT_TOWN.lookId,', 'activeLookId: (({ url, stored }) => url.look || stored.look)(readAddress()),'))],
    ['b · the old scene rule back', 1, () => judgeStore(storeText.replace('scene: BOOT_TOWN.scene,', 'scene: (({ url, stored }) => isValidMapId(url.scene) ? url.scene : isValidMapId(stored.scene) ? stored.scene : null)(readAddress()),'))],
    ['c · a resolver taking the remembered Look first', 2, () => judgeResolver((looks, a) => (a.stored.look ? { lookId: a.stored.look } : resolveTown(looks, a))).why],
    ['d · the stage refusal removed', 3, async () => judgeStageRefusal(await resolverOf((t) => t.replace('if (url.stage && (!isValidMapId(url.scene) || !lookForScene(looks, url.scene, null))) {', 'if (false) {')))],
    ['e · a stage refusal that names nothing', 3, async () => judgeStageRefusal(await resolverOf((t) => t.replace('(towns with one: ${have})', '')))],
    ['f · the panel mounted with no town', 4, () => judgeStageSays(appText.replace('{!inDesigner && activeLookId && (', '{!inDesigner && ('), storeText)],
    ['g · lookRefused starting null', 4, () => judgeStageSays(appText, storeText.replace('lookRefused: BOOT_TOWN.refused,', 'lookRefused: null,'))],
    ['h · a resolved town keeps the boot refusal', 4, () => judgeStageSays(appText, storeText.replace('activeLookId: town.lookId, lookRefused: null,', 'activeLookId: town.lookId,'))],
  ]
  console.log('\n  mutants:')
  for (const [name, judge, run] of MUTANTS) {
    const r = await run()
    if (r.length) console.log(`  ✅ ${name} → judge ${judge} red: ${r[0].slice(0, 110)}`)
    else { bad++; console.log(`  ⛔ ${name} — planted and judge ${judge} STAYED GREEN`) }
  }
}

console.log(bad ? `\n⛔ ${bad} failure(s)\n` : '\n✅ Stage\'s first render is the address\'s town, never a remembered one\n')
process.exit(bad ? 1 : 0)
