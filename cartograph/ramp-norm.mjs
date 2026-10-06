// ramp-norm.mjs — WHERE A TOWN'S CURB RAMPS COME FROM WHEN NOTHING RECORDS THEM (`BRIEF-corner-ramps-and-kerb §0a`).
//
// A ramp sits on a JUNCTION corner's arc (`iaJunction`). Its style is, in order — the finest wins:
//   1. the operator, per corner: `blockCustoms[skelId][side][segOrd].ramps.{start,end}` on either leg (live, in Section)
//   2. evidence — a recorded curb cut / crossing (its own landing, not yet built)
//   3. the TOWN's norm:   cartograph/data/<scene>/norms.json   → { "ramps": { … } }
//   4. the STATE's norm:  cartograph/states/<st>.mjs           → norms.ramps
//   5. the kit:           'none'
// ⛔ The kit default is NONE, never a style: any concrete style is a constant that is right for some town and wrong
//   for the next (`CLAUDE.md` Layer 0, Class D). It is made LOUD instead — every pour prints how many junction
//   corners have no ramp source.
// ⛔ A norm that names a style must also give its own dimensions (`width`, `warningDepth`, metres). They are the
//   jurisdiction's standard, not the kit's, so a missing one THROWS rather than being filled in.
// ▶ node checks/claims-every-junction-corner-has-a-ramp-source.mjs <scene>
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { stateRecord } from './states/index.mjs'

export const RAMP_STYLES = ['none', 'diagonal', 'perpendicular']
// ⭐ CROSSWALKS ride the same ladder, resolved on their own (a town may set one and inherit the other). A crosswalk
// runs from a ramp to the matching ramp across the street, so it needs ramps; its paint is the jurisdiction's:
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
  if (!n || typeof n !== 'object') throw new Error(`${where}: a ramp norm must be an object { style, width, warningDepth }`)
  if (!RAMP_STYLES.includes(n.style)) throw new Error(`${where}: ramp style ${JSON.stringify(n.style)} is not one of ${RAMP_STYLES.join(', ')}`)
  // ⭐ 'none' MAY still carry dimensions: a town with no default ramp whose operator places some by hand needs the
  // jurisdiction's sizes to draw them. Without them an authored ramp is counted (`noDims`), never sized by the kit.
  const dims = ['width', 'warningDepth'].filter(k => n[k] != null)
  for (const k of (n.style === 'none' ? dims : ['width', 'warningDepth'])) if (!(Number.isFinite(n[k]) && n[k] > 0))
    throw new Error(`${where}: ramp ${n.style === 'none' ? '' : `style '${n.style}' needs its own `}\`${k}\` in metres (> 0) — the jurisdiction's standard, never the kit's`)
  if (n.style === 'none' && dims.length && dims.length < 2) throw new Error(`${where}: give both \`width\` and \`warningDepth\`, or neither`)
  return (n.style === 'none' && !dims.length) ? { style: 'none' } : { style: n.style, width: n.width, warningDepth: n.warningDepth }
}

function resolveKind(kind, check, scene, state, dataRoot) {
  const p = join(dataRoot, scene, 'norms.json')
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

/** The town's ramp norm and the rung it came from (`source`: 'scene' · `state:<CODE>@<version>` · 'kit'), with its
 *  crosswalk norm nested under `crosswalks`, resolved on its own rung. */
export function resolveRampNorm(scene, state, dataRoot = 'cartograph/data') {
  return { ...resolveKind('ramps', validate, scene, state, dataRoot),
           crosswalks: resolveKind('crosswalks', validateCrosswalk, scene, state, dataRoot) }
}
