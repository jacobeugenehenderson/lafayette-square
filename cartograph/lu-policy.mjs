/**
 * lu-policy.mjs — is a land-use class SOFT ground (lawn/yard) or HARD (paved lot)?
 *
 * ⭐ THE KIT RULE: an LU class the kit has never seen must NOT silently become
 * hardscape. That is the bug this module exists to make impossible.
 *
 * HPDM, 2026-07-21: `institutional` (9 tiles), `vacant` (3) and `vacant-commercial`
 * (3) — 7.7% of the neighborhood — went bald with no warning anywhere. They were
 * never *ruled* hardscape; they fell through a `PLANTABLE_LU.has()` on a Set built
 * from the four classes Lafayette Square happens to contain. LS has zero tiles of
 * any of the three, so the gap could not surface on the scene it was authored
 * against. Church and school lawns rendered as parking lots.
 *
 * Every new town brings vocabulary the kit has not seen (Łódź will bring Polish
 * classes). So the default for an unrecognized class is SOFT + LOUD, never silent:
 *
 *   - SOFT is the recoverable error. A tree on a hardscape interior is a visible
 *     wrong the operator's eye catches in one look, and the post-bake eligibility
 *     guard in bake-trees.js still fails the bake on curb/sidewalk/asphalt.
 *   - HARD is the silent error. It blanks whole blocks — no trees AND no grass —
 *     and looks like a deliberate design choice. That is what cost us HPDM.
 *
 * Wrong-but-visible beats wrong-and-silent. Same cure `src/instance.js` already
 * applies to an unknown `?look=`: still fall back, but ANNOUNCE it.
 *
 * Doctrine: "everything is a best guess, and everything is overridable"
 * (`NEIGHBORHOOD-INPUTS §0.0`); "always populate best-effort, then override"
 * (`SECTION §3.1`). Detector, not adjective (`POLYGON-FIRST §5`).
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The kit's known LU vocabulary — must stay in step with `bake-ground.js`
 * TREELAWN_LU_VARIANTS / PAINT_ORDER (the classes `derive.js` can emit).
 *
 * 'soft' = the INTERIOR is plantable, and paints as lawn.
 * 'hard' = the interior is a hardscape lot.
 *
 * The curbside TREELAWN is plantable whatever the block's class — street trees
 * line even a parking lot's frontage. This gate is the LU INTERIOR only.
 */
export const LU_POLICY = {
  // — soft: green ground, trees welcome —
  residential:         'soft',
  park:                'soft',
  recreation:          'soft',
  island:              'soft',
  // Added 2026-07-21 (the HPDM bald-blocks fix). These were never ratified OUT;
  // they were absent from LS and so never considered. Schools, churches and
  // government grounds are lawn; an empty lot is grass and weeds by definition.
  institutional:       'soft',
  vacant:              'soft',
  'vacant-commercial': 'soft',
  // `median` is NOT a parcel land use — it is the emergent divided-road face
  // (`tileGround.js` pushLu(…,'median',…), `RIBBONS §3.1`), so it appears in
  // luByClass but in neither the parcel data nor bake-ground's vocabulary list.
  // Found by the detector on the first HPDM run, not by inspection: it was the
  // single largest forbidden bucket at 2,709 trees. Boulevard medians are lawn.
  // ⚠️ EYE-GATE: medians are narrow — worth confirming this isn't over-planting
  // thin strips before it rides to another town.
  median:              'soft',

  // — hard: hardscape lot, interior forbidden (ratified with Jacob 2026-07-18) —
  commercial:          'hard',
  parking:             'hard',
  industrial:          'hard',
  // NOTE: 'unknown' is the kit's OWN "derive.js could not classify this parcel"
  // bucket, ratified hard and eye-gated at LS (4 tiles). It is deliberately NOT
  // the same thing as a class name the kit has never seen — that defaults soft
  // (see resolveLuPolicy). Flagged in the report so the tension stays visible.
  unknown:             'hard',
}

/** What an unrecognized class resolves to. Soft + loud — never silent hardscape. */
export const UNRECOGNIZED_DEFAULT = 'soft'

/**
 * Per-scene override: optional `cartograph/data/<scene>/lu-policy.json`
 *   { "institutional": "hard", "some-local-class": "soft" }
 * Absent file = kit defaults. A scene reclassifies its own land uses without
 * anyone editing kit source to pour a town.
 */
function loadSceneOverride(scene) {
  if (!scene) return {}
  const p = path.join(REPO_ROOT, 'cartograph', 'data', scene, 'lu-policy.json')
  if (!existsSync(p)) return {}
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8'))
    const out = {}
    for (const [lu, kind] of Object.entries(raw)) {
      if (kind === 'soft' || kind === 'hard') out[lu] = kind
      else console.warn(`[lu-policy] ${scene}: ignoring "${lu}": "${kind}" — expected "soft" or "hard".`)
    }
    return out
  } catch (e) {
    console.warn(`[lu-policy] ${scene}: could not read lu-policy.json (${e.message}) — using kit defaults.`)
    return {}
  }
}

/**
 * Resolve the policy for a scene.
 *
 * @param {string}   scene          scene id (for the per-scene override)
 * @param {string[]} classesPresent every LU class actually present in the scene —
 *                                  pass the keys of `luByClass` so the report can
 *                                  name what this town brought that the kit lacks.
 * @returns {{ isPlantable, kindOf, unrecognized, overridden, report }}
 */
export function resolveLuPolicy(scene, classesPresent = []) {
  const override = loadSceneOverride(scene)
  const unrecognized = []
  const overridden = []

  for (const lu of new Set(classesPresent)) {
    if (override[lu]) overridden.push(lu)
    else if (!(lu in LU_POLICY)) unrecognized.push(lu)
  }
  unrecognized.sort(); overridden.sort()

  const kindOf = (lu) => override[lu] || LU_POLICY[lu] || UNRECOGNIZED_DEFAULT
  const isPlantable = (lu) => kindOf(lu) === 'soft'

  /**
   * The bake-time announcement. An operator pouring town #7 learns their
   * vocabulary is unknown AT BAKE TIME, not by noticing bald blocks weeks later.
   */
  const report = () => {
    const present = [...new Set(classesPresent)].sort()
    const lines = [`[lu-policy] ${scene || '(no scene)'} — ${present.length} land-use classes present:`]
    for (const lu of present) {
      const kind = kindOf(lu)
      const why = override[lu] ? 'scene override'
        : (lu in LU_POLICY) ? 'kit default'
        : `UNRECOGNIZED → defaulted ${UNRECOGNIZED_DEFAULT}`
      lines.push(`   ${kind === 'soft' ? '🌱 soft' : '🧱 hard'}  ${lu.padEnd(20)} (${why})`)
    }
    if (unrecognized.length) {
      lines.push('')
      lines.push(`   ⚠️  ${unrecognized.length} class(es) the kit has no policy for: ${unrecognized.join(', ')}`)
      lines.push(`   ⚠️  They were treated as PLANTABLE so they render as lawn rather than silently`)
      lines.push(`       going bald. If any is genuinely hardscape, declare it in`)
      lines.push(`       cartograph/data/${scene}/lu-policy.json  →  { "${unrecognized[0]}": "hard" }`)
      lines.push(`       or add it to LU_POLICY in cartograph/lu-policy.mjs if it is kit-general.`)
    }
    return lines.join('\n')
  }

  return { isPlantable, kindOf, unrecognized, overridden, report }
}

/**
 * The correctness check (`POLYGON-FIRST §5` — one RED-until-true invariant per
 * bug-class). RED when a scene carries LU classes the kit has no policy for.
 * This is what makes the fix hold for town #100 instead of just for HPDM.
 */
export function checkLuVocabulary(scene, classesPresent = []) {
  const { unrecognized } = resolveLuPolicy(scene, classesPresent)
  return {
    name: 'lu-vocabulary',
    ok: unrecognized.length === 0,
    unrecognized,
    message: unrecognized.length
      ? `${scene}: ${unrecognized.length} unrecognized LU class(es): ${unrecognized.join(', ')} — defaulted plantable; declare them in cartograph/data/${scene}/lu-policy.json`
      : `${scene}: every LU class present has an explicit policy.`,
  }
}
