// curb-cut-norm.mjs — WHERE A TOWN'S CURB CUTS COME FROM WHEN NOTHING RECORDS THEM (`BRIEF-corner-ramps-and-kerb §0a`).
//
// A curb cut sits on a JUNCTION corner's arc (`iaJunction`). Its style is, in order — the finest wins:
//   1. the operator, per corner: `cut` in its one entry of `cornerCornerRadiusOverrides` (live, in Section's popover)
//   2. evidence — a recorded curb cut, landed on the arc at the freeze (`cartograph/curb-cut-evidence.mjs`)
//   3. the TOWN's norm:   cartograph/data/<scene>/norms.json   → { "curbCuts": { … } }
//   4. the STATE's norm:  cartograph/states/<st>.mjs           → norms.curbCuts
//   5. the kit:           'none'
// The same ladder carries the town's CROSSWALKS and its KERB (height + the cut's ramp/flare slopes), each on its own rung.
// ⛔ The kit default is NONE, never a style: any concrete style is a constant that is right for some town and wrong
//   for the next (`CLAUDE.md` Layer 0, Class D). It is made LOUD instead — every pour prints how many junction
//   corners have no curb-cut source.
// ⛔ A norm that names a style must also give its own dimensions (`width`, `warningDepth`, metres). They are the
//   jurisdiction's standard, not the kit's, so a missing one THROWS rather than being filled in.
// ▶ node checks/claims-every-junction-corner-has-a-curb-cut-source.mjs <scene>
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { stateRecord } from './states/index.mjs'

// ⛔ The scene's data directory is resolved from THIS MODULE, never the caller's working directory: the pour runs
// derive.js from cartograph/, and a cwd-relative path there found no norms.json and froze 'none (kit)' without a word
// (`BRIEF-corner-ramps-and-kerb §3` step 0). ▶ node checks/claims-the-pour-reads-the-towns-norm.mjs
const DATA_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'data')

export const CURB_CUT_STYLES = ['none', 'diagonal', 'perpendicular']
// ⭐ CROSSWALKS ride the same ladder, resolved on their own (a town may set one and inherit the other). A crosswalk runs
// SQUARE across the street it crosses (§0a item 9), centred on the curb cut that serves it, from kerb to kerb; its
// paint is the jurisdiction's:
//   lines       — two transverse lines `line` wide, `width` apart (outer to outer)
//   continental — bars `line` wide, gaps `line` wide, `width` long, across the street
// Two forms, both validated, a missing size THROWS:
//   { style: 'lines'|'continental', width, line, farKerb }        one paint for every corner
//   { style: 'byCorner', byCorner: { diagonal: {style, width, line}, perpendicular: {…} }, farKerb }
//        the paint FOLLOWS THE CORNER's resolved curb-cut style, whatever rung decided it (Jacob, 2026-10-06 — a town's
//        CHOICE, never a kit rule)
//   farKerb — a T's far kerb, where the square crosswalk lands on a straight kerb with no corner: 'none' (no crosswalk,
//        counted) or 'cut' (a curb cut there, sized by the curb-cut norm, crossed to). Required: no default.
// ⛔ Two paired cuts further apart along the street than the paint's `width` get NO crosswalk — counted and printed by
//   position (Jacob, 2026-10-06): one square crosswalk cannot hold both.
export const CROSSWALK_STYLES = ['none', 'lines', 'continental', 'byCorner']
export const FAR_KERB = ['none', 'cut']

function validatePaint(n, where) {
  if (!n || typeof n !== 'object' || !['lines', 'continental'].includes(n.style))
    throw new Error(`${where}: a crosswalk paint must be { style: 'lines'|'continental', width, line }`)
  for (const k of ['width', 'line']) if (!(Number.isFinite(n[k]) && n[k] > 0))
    throw new Error(`${where}: crosswalk style '${n.style}' needs its own \`${k}\` in metres (> 0) — the jurisdiction's standard, never the kit's`)
  return { style: n.style, width: n.width, line: n.line }
}

function validateCrosswalk(n, where) {
  if (!n || typeof n !== 'object') throw new Error(`${where}: a crosswalk norm must be an object { style, … }`)
  if (!CROSSWALK_STYLES.includes(n.style)) throw new Error(`${where}: crosswalk style ${JSON.stringify(n.style)} is not one of ${CROSSWALK_STYLES.join(', ')}`)
  if (n.style === 'none') return { style: 'none' }
  if (!FAR_KERB.includes(n.farKerb)) throw new Error(`${where}: crosswalks need \`farKerb\` — one of ${FAR_KERB.join(', ')} (a T's far kerb: no crosswalk, or a cut crossed to)`)
  if (n.style !== 'byCorner') return { ...validatePaint(n, where), farKerb: n.farKerb }
  const bc = n.byCorner || {}
  for (const k of Object.keys(bc)) if (!['diagonal', 'perpendicular'].includes(k)) throw new Error(`${where}: byCorner key ${JSON.stringify(k)} is not a curb-cut style (diagonal, perpendicular)`)
  if (!bc.diagonal || !bc.perpendicular) throw new Error(`${where}: byCorner needs a paint for BOTH diagonal and perpendicular corners`)
  return { style: 'byCorner', byCorner: { diagonal: validatePaint(bc.diagonal, `${where} byCorner.diagonal`), perpendicular: validatePaint(bc.perpendicular, `${where} byCorner.perpendicular`) }, farKerb: n.farKerb }
}

// ⭐ THE KERB — its HEIGHT is a jurisdiction value on the same ladder (`BRIEF-corner-ramps-and-kerb §3` step 5, ruled
// 2026-10-06). Kit = 0: a town that authors nothing stays one flat plane. ⛔ Never coupled to the curb's WIDTH, which is
// the Look's cosmetic `curbWidth` slider. A cut ramps h → 0: `rampSlope` (along the ramp) and `flareSlope` (its sides)
// are the jurisdiction's, given as "rise:run" — no kit default; the BAKE throws when a town with h > 0 has cuts and no
// slopes. ⭐ Where no curb is drawn the block slopes down FLUSH over `taperRun` (metres, the town's; Jacob 2026-10-06);
// the bake throws when a town with h > 0 has curbless frontage and no run. ⚠️ GAP: there is no NATIONAL rung (ADA is
// federal), so a US town names its slopes itself, citing ADA.
function validateKerb(n, where) {
  if (!n || typeof n !== 'object') throw new Error(`${where}: a kerb norm must be an object { height, rampSlope, flareSlope }`)
  if (!(Number.isFinite(n.height) && n.height >= 0)) throw new Error(`${where}: kerb \`height\` must be metres (>= 0)`)
  const out = { height: n.height }
  for (const k of ['rampSlope', 'flareSlope']) if (n[k] != null) {
    const m = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(String(n[k]))
    if (!m || !(+m[1] > 0 && +m[2] > 0)) throw new Error(`${where}: kerb \`${k}\` must be "rise:run" (e.g. "1:12"), got ${JSON.stringify(n[k])}`)
    out[k] = +m[1] / +m[2]; out[k + 'Text'] = `${m[1]}:${m[2]}`
  }
  if (n.taperRun != null) {
    if (!(Number.isFinite(n.taperRun) && n.taperRun > 0)) throw new Error(`${where}: kerb \`taperRun\` must be metres (> 0) — where no curb is drawn the block slopes flush over it`)
    out.taperRun = n.taperRun
  }
  return out
}

function validate(n, where) {
  if (!n || typeof n !== 'object') throw new Error(`${where}: a curb-cut norm must be an object { style, width, warningDepth }`)
  if (!CURB_CUT_STYLES.includes(n.style)) throw new Error(`${where}: curb-cut style ${JSON.stringify(n.style)} is not one of ${CURB_CUT_STYLES.join(', ')}`)
  // ⭐ 'none' MAY still carry dimensions: a town with no default curb cut whose operator places some by hand needs the
  // jurisdiction's sizes to draw them. Without them an authored curb cut is counted (`noDims`), never sized by the kit.
  const dims = ['width', 'warningDepth'].filter(k => n[k] != null)
  for (const k of (n.style === 'none' ? dims : ['width', 'warningDepth'])) if (!(Number.isFinite(n[k]) && n[k] > 0))
    throw new Error(`${where}: curb cut ${n.style === 'none' ? '' : `style '${n.style}' needs its own `}\`${k}\` in metres (> 0) — the jurisdiction's standard, never the kit's`)
  if (n.style === 'none' && dims.length && dims.length < 2) throw new Error(`${where}: give both \`width\` and \`warningDepth\`, or neither`)
  return (n.style === 'none' && !dims.length) ? { style: 'none' } : { style: n.style, width: n.width, warningDepth: n.warningDepth }
}

function resolveKind(kind, check, scene, state, kit = { style: 'none' }) {
  const p = join(DATA_ROOT, scene, 'norms.json')
  if (existsSync(p)) {
    let j; try { j = JSON.parse(readFileSync(p, 'utf8')) } catch (e) { throw new Error(`${p} is not valid JSON: ${e.message}`) }
    if (j[kind]) return { ...check(j[kind], `${p} ${kind}`), source: 'scene' }
  }
  if (state) {
    const rec = stateRecord(state, `${scene}: `)
    if (rec.norms?.[kind]) return { ...check(rec.norms[kind], `cartograph/states/${state.toLowerCase()}.mjs norms.${kind}`), source: `state:${rec.code}@${rec.version}` }
  }
  return { ...kit, source: 'kit' }
}

/** The town's curb-cut norm and the rung it came from (`source`: 'scene' · `state:<CODE>@<version>` · 'kit'), with its
 *  crosswalk norm nested under `crosswalks`, resolved on its own rung. */
export function resolveCurbCutNorm(scene, state) {
  // a scene with no data directory is a wrong name or a wrong root — never a town with no norm
  if (!existsSync(join(DATA_ROOT, scene))) throw new Error(`resolveCurbCutNorm: no scene data directory ${join(DATA_ROOT, scene)}`)
  return { ...resolveKind('curbCuts', validate, scene, state),
           crosswalks: resolveKind('crosswalks', validateCrosswalk, scene, state),
           kerb: resolveKind('kerb', validateKerb, scene, state, { height: 0 }) }
}
