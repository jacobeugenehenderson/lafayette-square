// curb-cut-norm.mjs — WHERE A TOWN'S CURB CUTS COME FROM WHEN NOTHING RECORDS THEM (`BRIEF-corner-ramps-and-kerb §0a`).
//
// A curb cut sits on a JUNCTION corner's arc (`iaJunction`). Its style is, in order — the finest wins:
//   1. the operator, per corner: `blockCustoms[skelId][side][segOrd].curbCuts.{start,end}` on either leg (live, in Section)
//   2. evidence — a recorded curb cut, landed on the arc at the freeze (`cartograph/curb-cut-evidence.mjs`)
//   3. the TOWN's norm:   cartograph/data/<scene>/norms.json   → { "curbCuts": { … } }
//   4. the STATE's norm:  cartograph/states/<st>.mjs           → norms.curbCuts
//   5. the kit:           'none'
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
// ⭐ CROSSWALKS ride the same ladder, resolved on their own (a town may set one and inherit the other). A crosswalk
// runs from a curb cut to the matching curb cut across the street, so it needs curb cuts; its paint is the jurisdiction's:
//   lines       — two transverse lines `line` wide, `width` apart (outer to outer)
//   continental — bars `line` wide, gaps `line` wide, `width` long, across the street
export const CROSSWALK_STYLES = ['none', 'lines', 'continental']

function validateCrosswalk(n, where) {
  if (!n || typeof n !== 'object') throw new Error(`${where}: a crosswalk norm must be an object { style, width, line }`)
  if (!CROSSWALK_STYLES.includes(n.style)) throw new Error(`${where}: crosswalk style ${JSON.stringify(n.style)} is not one of ${CROSSWALK_STYLES.join(', ')}`)
  if (n.style === 'none') return { style: 'none' }
  for (const k of ['width', 'line']) if (!(Number.isFinite(n[k]) && n[k] > 0))
    throw new Error(`${where}: crosswalk style '${n.style}' needs its own \`${k}\` in metres (> 0) — the jurisdiction's standard, never the kit's`)
  return { style: n.style, width: n.width, line: n.line }
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

function resolveKind(kind, check, scene, state) {
  const p = join(DATA_ROOT, scene, 'norms.json')
  if (existsSync(p)) {
    let j; try { j = JSON.parse(readFileSync(p, 'utf8')) } catch (e) { throw new Error(`${p} is not valid JSON: ${e.message}`) }
    if (j[kind]) return { ...check(j[kind], `${p} ${kind}`), source: 'scene' }
  }
  if (state) {
    const rec = stateRecord(state, `${scene}: `)
    if (rec.norms?.[kind]) return { ...check(rec.norms[kind], `cartograph/states/${state.toLowerCase()}.mjs norms.${kind}`), source: `state:${rec.code}@${rec.version}` }
  }
  return { style: 'none', source: 'kit' }
}

/** The town's curb-cut norm and the rung it came from (`source`: 'scene' · `state:<CODE>@<version>` · 'kit'), with its
 *  crosswalk norm nested under `crosswalks`, resolved on its own rung. */
export function resolveCurbCutNorm(scene, state) {
  // a scene with no data directory is a wrong name or a wrong root — never a town with no norm
  if (!existsSync(join(DATA_ROOT, scene))) throw new Error(`resolveCurbCutNorm: no scene data directory ${join(DATA_ROOT, scene)}`)
  return { ...resolveKind('curbCuts', validate, scene, state),
           crosswalks: resolveKind('crosswalks', validateCrosswalk, scene, state) }
}
