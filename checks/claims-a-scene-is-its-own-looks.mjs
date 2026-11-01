#!/usr/bin/env node
// claims-a-scene-is-its-own-looks.mjs — DOES THE SCENE HOOK HAND OUT ONLY THE ASKED LOOK'S SCENE, NEVER THE PREVIOUS ONE'S?
//
// ⭐ THE CLAIM (Sigil, 2026-10-31; Boz's ruling, Zob's co-sign). src/lib/useSceneJson.js holds { lookId, scene } and
// returns it through src/lib/sceneFor.js#sceneFor, which gives the held scene ONLY for the Look it belongs to, else null
// ("not loaded"). Found by a frame recorder: on a Look switch the hook returned the PREVIOUS Look's scene until the new
// read resolved, and Stage drew Provincetown's 🦞 under "Hi-Pointe–DeMun" (every consumer drew that frame of the old town).
// ⭐ A re-read of the SAME Look (`reread`, Stage's re-bake) keeps its previous scene meanwhile: same town, no leak.
// Two judges, each reading the source of truth rather than restating it:
//   1 · THE HOOK — useSceneJson imports sceneFor, keeps the Look in its state (`setHeld({ lookId, scene: … })`), derives
//       its scene as sceneFor(held, lookId), and holds no bare scene state (`useState` paired with a `setScene`).
//   2 · THE GATE, RUN — sceneFor(held of 'a', 'b') is null · (held of 'a', 'a') is that scene · (null, 'a') is null.
// ⭐ MUTANTS (--mutants), each must go RED: (a) the bare scene state back in the hook → 1 · (b) the hook returning the
// held scene without the gate → 1 · (c) a gate that returns the held scene for any Look → 2.
//   node checks/claims-a-scene-is-its-own-looks.mjs [--mutants]
// Read-only. Exits 1 on any failing judge or any mutant left GREEN.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sceneFor } from '../src/lib/sceneFor.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOOK = 'src/lib/useSceneJson.js'
const code = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')

function judgeHook(text) {
  const why = [], c = code(text)
  if (!/import \{ sceneFor \} from '\.\/sceneFor\.js'/.test(c)) why.push(`${HOOK} does not import sceneFor`)
  if (!/setHeld\(\{ lookId, scene: /.test(c)) why.push(`${HOOK} does not keep the Look its scene belongs to (setHeld({ lookId, scene }))`)
  if (!/const scene = sceneFor\(held, lookId\)/.test(c)) why.push(`${HOOK} does not derive its scene through sceneFor(held, lookId)`)
  if (/\bsetScene\b/.test(c)) why.push(`${HOOK} holds a bare scene state (setScene) — it returns the previous Look's scene across a switch`)
  return why
}

function judgeGate(gate) {
  const why = [], S = { identity: { mark: '🦞' } }
  if (gate({ lookId: 'provincetown', scene: S }, 'hipointedemun') !== null) why.push("sceneFor hands provincetown's scene to hipointedemun — another Look's scene")
  if (gate({ lookId: 'provincetown', scene: S }, 'provincetown') !== S) why.push("sceneFor does not hand provincetown its own held scene")
  if (gate(null, 'provincetown') !== null) why.push('sceneFor with nothing held is not null')
  return why
}

const hookText = readFileSync(join(ROOT, HOOK), 'utf8')
const res = { 1: judgeHook(hookText), 2: judgeGate(sceneFor) }
let bad = 0
console.log('\nA scene is its own Look\'s')
for (const [k, name] of [[1, 'the hook gates its scene by Look'], [2, 'the gate, run']]) {
  if (res[k].length) { bad++; console.log(`  ⛔ ${k} · ${name}`); for (const w of res[k]) console.log(`       ${w}`) }
  else console.log(`  ✅ ${k} · ${name}`)
}

if (process.argv.includes('--mutants')) {
  const MUTANTS = [
    ['a · the bare scene state back', 1, () => judgeHook(hookText.replace('const [held, setHeld] = useState(null)', 'const [scene, setScene] = useState(null)').replace('if (!cancelled) setHeld({ lookId, scene: s })', 'if (!cancelled) setScene(s)').replace('const scene = sceneFor(held, lookId)', ''))],
    ['b · the held scene returned without the gate', 1, () => judgeHook(hookText.replace('const scene = sceneFor(held, lookId)', 'const scene = held?.scene ?? null'))],
    ['c · a gate that ignores the Look', 2, () => judgeGate((held) => held?.scene ?? null)],
  ]
  console.log('\n  mutants:')
  for (const [name, judge, run] of MUTANTS) {
    const r = run()
    if (r.length) console.log(`  ✅ ${name} → judge ${judge} red: ${r[0].slice(0, 110)}`)
    else { bad++; console.log(`  ⛔ ${name} — planted and judge ${judge} STAYED GREEN`) }
  }
}

console.log(bad ? `\n⛔ ${bad} failure(s)\n` : '\n✅ the scene hook hands out only the asked Look\'s scene\n')
process.exit(bad ? 1 : 0)
