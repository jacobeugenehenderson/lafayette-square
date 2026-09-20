/**
 * CLAIM: a population that does not fade says so EXPLICITLY, and buildings are one.
 *
 * ⭐ THE RECEIPT. On 2026-09-20 buildings were taken out of the fade — "there is no
 * such thing as a ghosted building" — by DELETING the `{ fade }` argument from their
 * material. That did not work. `injectRadialFade` reads `fade?.inner ?? FADE_INNER`,
 * so an absent argument fell through to the LS module defaults and buildings went on
 * fading. Twelve LS buildings STRADDLE `fade.inner` and rendered half opaque, half
 * dissolved. Jacob caught it by eye: "the georgian is faded in half."
 *
 * ⛔⛔ THAT IS THIS ARC'S OWN DEFECT CLASS, COMMITTED BY ITS OWN FIX: a `??` turning
 * an absent value into a plausible default, with no error and a believable picture.
 * CLAUDE.md Layer 0 question 2. ⭐ REMOVING AN ARGUMENT IS NOT OPTING OUT — opting
 * out has to be a value you can pass, which is why `fade: null` now exists.
 *
 * WHAT IS ASSERTED, by READING THE SOURCE rather than restating it (§PRUNE #1):
 *   A. `injectRadialFade` distinguishes three states, and `null` means none
 *   B. the building material passes `fade: null` — explicitly, not by omission
 *   C. the no-fade path still injects TERRAIN displacement (buildings conform to
 *      the elevation field; only the alpha multiply is skipped)
 *   D. the shader program cache key separates faded from unfaded
 *
 * ⚠️ SCOPE: buildings are the ONLY population ruled out of the fade. This check does
 * not police the others — for landscape, stripes, parking and the rest the ring test
 * and the fade are both wanted, and asserting otherwise would be inventing a rule.
 *
 * ▶ node checks/claims-opting-out-of-the-fade-is-explicit.mjs
 */
import { readFileSync } from 'fs'

let fails = 0
const ok = (c, m) => { console.log(`${c ? '  ✅' : '  ❌'} ${m}`); if (!c) fails++ }
const h = (s) => console.log(`\n${s}`)

const SRC = 'src/cartograph/MapLayers.jsx'
const src = readFileSync(SRC, 'utf8')

h('A. injectRadialFade has an explicit "no fade" state')
const hasFadedFlag = /const\s+faded\s*=\s*fade\s*!==\s*null/.test(src)
ok(hasFadedFlag, 'binds `const faded = fade !== null` — null is the opt-out, distinct from undefined')
ok(/if\s*\(faded\)\s*mat\.transparent\s*=\s*true/.test(src),
  'only a FADED material is forced transparent (an opaque building stays opaque)')

h('B. buildings opt out explicitly, not by omitting the argument')
const bldLine = src.split('\n').find(l => /^\s*building:\s*makeFlatMat\(/.test(l))
ok(!!bldLine, `the building material is declared in ${SRC}`)
if (bldLine) {
  console.log(`      ${bldLine.trim()}`)
  ok(/fade:\s*null/.test(bldLine),
    'building passes `fade: null` — ⛔ if this ever reverts to omitting the argument, the `??` silently reinstates the LS default band and buildings fade again')
}

h('C. opting out of the fade does NOT opt out of terrain displacement')
// assignTerrainUniforms must run unconditionally; only the fade uniforms are gated.
const compileBody = src.slice(src.indexOf('mat.onBeforeCompile'), src.indexOf('mat.customProgramCacheKey'))
const terrainIdx = compileBody.indexOf('assignTerrainUniforms(shader)')
const gateIdx = compileBody.indexOf('if (faded) {')
ok(terrainIdx !== -1, 'assignTerrainUniforms is called in onBeforeCompile')
ok(terrainIdx !== -1 && gateIdx !== -1 && terrainIdx < gateIdx,
  'terrain uniforms are assigned BEFORE the `if (faded)` gate — an unfaded building still conforms to the elevation field')

h('D. the program cache key separates faded from unfaded')
ok(/ml-terrain-nofade-/.test(src),
  'a distinct `ml-terrain-nofade-` cache key exists — ⛔ without it an unfaded material could reuse a faded compiled program')

console.log(fails === 0 ? '\n✅ all claims hold' : `\n❌ ${fails} claim(s) FAILED`)
process.exit(fails === 0 ? 0 : 1)
