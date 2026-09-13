#!/usr/bin/env node
/**
 * "DOES A NEW LOOK START CLEAN?" — A11 / D-C, the recurrence gate.
 *
 * WHY THIS EXISTS (2026-08-07). `POST /looks` seeds a new Look's design.json
 * from an existing one, and the Pour calls it with no `fromLookId`, so the seed
 * is always the DEFAULT Look — Lafayette Square. Most of a design is style and
 * is meant to travel; `blockCustoms` and the corner/land-use maps are keyed by
 * the SCENE's own identities and must not. Three towns shipped with LS's
 * authored street widths in their own file because nothing stopped them.
 *
 * ⭐ THIS CHECK READS THE SERVER'S OWN SOURCE — it extracts the four A11
 * declarations out of `cartograph/serve.js` and runs THEM. It does not restate
 * the rule, so it cannot drift from it, and it does not import serve.js (which
 * would bind port 3333). If a declaration is renamed or deleted, this fails
 * loudly rather than passing against a copy.
 *
 * ⛔ READ-ONLY. Reads serve.js, public/looks/**, public/baked/**. Writes nothing.
 *
 * Usage: node scratch/claims-look-seed-scene-clean.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT   = new URL('..', import.meta.url).pathname
const PUBLIC_DIR = join(ROOT, 'public')
const SRC    = readFileSync(join(ROOT, 'cartograph/serve.js'), 'utf8')

// ── lift the declarations out of serve.js, by name ──────────────────────────
const WANT = ['SCENE_KEYED_DESIGN_FIELDS', 'bakedStreetNames', 'sceneKeyedResidue', 'seedDesignForScene']
const slice = (name) => {
  const start = SRC.search(new RegExp(`^(const|function) ${name}\\b`, 'm'))
  if (start < 0) return null
  // Balance ONE bracket kind so a `[]` default parameter can't end a function
  // slice early: `{}` for a function body, `[]` for the const array.
  const isFn = SRC.startsWith('function', start)
  const [open, close] = isFn ? ['{', '}'] : ['[', ']']
  let i = isFn ? SRC.indexOf(open, SRC.indexOf(')', start)) : SRC.indexOf(open, start)
  if (i < 0) return null
  for (let depth = 0; i < SRC.length; i++) {
    if (SRC[i] === open) depth++
    else if (SRC[i] === close && --depth === 0) return SRC.slice(start, i + 1)
  }
  return null
}
const parts = WANT.map(n => [n, slice(n)])
const missing = parts.filter(([, s]) => !s).map(([n]) => n)
if (missing.length) {
  console.error(`⛔ FAIL — cartograph/serve.js no longer declares: ${missing.join(', ')}.`)
  console.error('   The A11 cross-scene seed guard is gone or renamed. This check cannot verify it.')
  process.exit(2)
}

// Evaluate them with only the bindings they need. `readJsonOrNull`/`join`/
// `PUBLIC_DIR` are serve.js's own helpers, re-supplied identically here.
const readJsonOrNull = (p) => { try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null } }
const mod = new Function('join', 'PUBLIC_DIR', 'readJsonOrNull',
  parts.map(([, s]) => s).join('\n\n') + `\nreturn { ${WANT.join(', ')} }`)
const { SCENE_KEYED_DESIGN_FIELDS, bakedStreetNames, seedDesignForScene } = mod(join, PUBLIC_DIR, readJsonOrNull)

// ── the cases ───────────────────────────────────────────────────────────────
const idx = JSON.parse(readFileSync(join(PUBLIC_DIR, 'looks/index.json'), 'utf8'))
const sceneOf = new Map(idx.looks.map(l => [l.id, l.scene]))
const design = (id) => readJsonOrNull(join(PUBLIC_DIR, 'looks', id, 'design.json')) || {}
const slotCount = (bc) => { let n = 0; for (const s in bc || {}) for (const q in bc[s]) n += Object.keys(bc[s][q]).length; return n }

let pass = 0, fail = 0
const check = (label, fn) => {
  try { const why = fn(); if (why) { console.log(`  ⛔ FAIL  ${label}\n           ${why}`); fail++ } else { console.log(`  ✅ pass  ${label}`); pass++ } }
  catch (err) { console.log(`  ⛔ THREW ${label}\n           ${err.message}`); fail++ }
}

console.log(`\nLOOK SEED — does a new Look start clean?\ndeclared scene-keyed fields: ${SCENE_KEYED_DESIGN_FIELDS.join(', ')}\n`)

// 1. The real regression, replayed. Seed LS's HISTORICAL authored design (the
//    pre-reset copy — LS's live design.json now carries zero slots, so seeding
//    from it would pass vacuously) into a foreign scene.
const lsAuthored = readJsonOrNull(join(PUBLIC_DIR, 'looks/lafayette-square/design.json.pre-reset'))
check('the 2026-07-14 regression cannot recur — LS authoring does not reach a foreign scene', () => {
  if (!lsAuthored) return 'no design.json.pre-reset to replay against; test is vacuous'
  if (!slotCount(lsAuthored.blockCustoms)) return 'the replay fixture carries no authoring; test is vacuous'
  for (const target of ['altadena', 'ksi-y-m-yn', 'centrum']) {
    const { design: d, stripped } = seedDesignForScene(lsAuthored, 'lafayette-square', target)
    if (slotCount(d.blockCustoms)) return `${target} still received ${slotCount(d.blockCustoms)} blockCustoms slots`
    if (!stripped.length) return `${target}: nothing reported stripped — the drop was silent`
  }
  return null
})

// 2. Every declared field is actually dropped, not just blockCustoms.
check('every declared scene-keyed field is dropped on a cross-scene seed', () => {
  const seed = { ...lsAuthored, cornerRadiusOverrides: { a: 1 }, cornerCornerRadiusOverrides: { b: 2 }, blockLandUse: { c: 3 } }
  const { design: d } = seedDesignForScene(seed, 'lafayette-square', 'altadena')
  const left = SCENE_KEYED_DESIGN_FIELDS.filter(f => d[f] != null)
  return left.length ? `survived the strip: ${left.join(', ')}` : null
})

// 3. Style must still travel — a guard that strips everything is not a fix.
check('style still travels (palette / exposure / labels / trees survive)', () => {
  const { design: d } = seedDesignForScene(design('hipointe-demun'), 'hipointe-demun', 'altadena')
  const src = design('hipointe-demun')
  const styled = ['luColors', 'materialColors', 'labels', 'exposure', 'bloom', 'trees'].filter(f => src[f] != null)
  if (!styled.length) return 'fixture carries no style fields; test is vacuous'
  const lost = styled.filter(f => JSON.stringify(d[f]) !== JSON.stringify(src[f]))
  return lost.length ? `style was stripped too: ${lost.join(', ')}` : null
})

// 4. Same-scene cloning is untouched — duplicating a Look inside one town must
//    keep that town's authoring. (`hipointe-demun` has 17 real slots.)
check('a SAME-scene clone keeps its own authoring', () => {
  const src = design('hipointe-demun')
  if (!slotCount(src.blockCustoms)) return 'fixture carries no authoring; test is vacuous'
  const { design: d, stripped } = seedDesignForScene(src, 'hipointe-demun', 'hipointe-demun')
  if (slotCount(d.blockCustoms) !== slotCount(src.blockCustoms)) return `lost ${slotCount(src.blockCustoms) - slotCount(d.blockCustoms)} slots`
  return stripped.length ? `reported a strip on a same-scene clone: ${stripped.join(', ')}` : null
})

// 5. ⭐ The strip list is a declaration and declarations rot. An UNDECLARED
//    scene-keyed field must refuse, not travel. Synthesised with a real street
//    name from the seed scene's own bake, so it is the genuine failure shape.
check('an UNDECLARED scene-keyed field REFUSES (409) instead of travelling', () => {
  const names = bakedStreetNames('lafayette-square')
  if (!names?.size) return 'lafayette-square has no bake; cannot synthesise the case'
  const street = [...names][0]
  const seed = { ...lsAuthored, someFutureFieldNobodyDeclared: { [`${street}|left|0`]: 42 } }
  try { seedDesignForScene(seed, 'lafayette-square', 'altadena') }
  catch (err) {
    if (err.statusCode !== 409) return `refused with statusCode ${err.statusCode}, expected 409`
    if (!/someFutureFieldNobodyDeclared/.test(err.message)) return `the refusal does not name the offending field: ${err.message}`
    return null
  }
  return 'it did NOT refuse — an undeclared scene-keyed field would travel silently'
})

// 6. No false refusal on the looks that exist today (a guard that blocks real
//    pours is worse than the bug). Every committed Look, seeded cross-scene.
check('no committed Look triggers a false refusal when seeded cross-scene', () => {
  const bad = []
  for (const id of readdirSync(join(PUBLIC_DIR, 'looks')).filter(d => existsSync(join(PUBLIC_DIR, 'looks', d, 'design.json')))) {
    const from = sceneOf.get(id)
    if (!from) continue
    for (const to of sceneOf.values()) {
      if (to === from) continue
      try { seedDesignForScene(design(id), from, to) } catch (err) { bad.push(`${id}→${to}: ${err.message.slice(0, 110)}`) }
    }
  }
  return bad.length ? bad.join('\n           ') : null
})

// 7. The Pour's actual call shape: no fromLookId ⇒ seed is the DEFAULT Look.
//    This is the line that made it LS specifically; assert the default seed is
//    what gets scrubbed, whoever it happens to be.
check(`the Pour's seed (default Look "${idx.default}") is scrubbed for a new scene`, () => {
  const d0 = design(idx.default)
  const { design: d } = seedDesignForScene({ ...d0, blockCustoms: lsAuthored?.blockCustoms || {} }, sceneOf.get(idx.default), 'a-town-nobody-has-poured')
  return slotCount(d.blockCustoms) ? `${slotCount(d.blockCustoms)} slots reached the new town` : null
})

console.log(`\n${fail ? '⛔' : '✅'} ${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
