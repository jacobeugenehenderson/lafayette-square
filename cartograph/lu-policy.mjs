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
 *
 * ── THE THIRD STATE: `planted` (ruled by Jacob 2026-09-20) ──────────────────
 *
 * ⭐⭐ THE BINARY ANSWERS ONE QUESTION — "MAY A TREE STAND HERE?" — AND IT ALWAYS
 * WILL. `forbidden-surface.mjs` is a MASK: it drops or nudges, it never places.
 * `planted` answers a DIFFERENT question — "WHAT GROWS HERE?" — which is why it
 * is not a third value on the old axis but a second axis that only some classes
 * have, and why it carries a sub-selector rather than a flag.
 *
 *     soft    — green, and the census tree may stand. (a yard, a park)
 *     hard    — the interior is forbidden to a tree. ⚠️ WIDENED 2026-09-20: this
 *               no longer means "paved". `beach` and `bare` are hard and are not
 *               hardscape — nothing grows on sand or scree. The COLOUR is a
 *               separate judgment (`m3Colors`), and always was.
 *     planted — green, and the planting is SPECIFIED rather than free. A cornfield
 *               grows corn; an orchard grows fruit trees in rows; a marsh grows
 *               reeds. The census tree does NOT stand here — not because the
 *               ground is hostile but because the ground is already spoken for.
 *
 * ⛔⛔ AND THE GENERATOR DOES NOT EXIST YET, WHICH IS THE WHOLE REASON `planted`
 * IS DECLARED BEFORE IT IS CONSUMED. Nothing in the kit decides what a surface
 * should be planted WITH: the Arborist is a species FACTORY, `bake-trees.js`
 * SUBSTITUTES against a municipal census, and this module SUBTRACTS. There is a
 * filter where there should also be a generator.
 * ⇒ so a `planted` class today yields NO foliage, and `report()` SAYS SO BY NAME
 * every pour. ⛔ It must never quietly resolve to `soft` (trees in the corn) or
 * to `hard` (a blanked block reading as a design choice) — both are the silent
 * substitution this module exists to refuse. The face still PAINTS its own
 * colour, so the land reads as worked ground rather than going bald.
 * ⭐ `plantingOf(lu)` is the socket the generator will read. Its first customers
 * are `BRIEF-field-shader.md` (crop rows) and `orchard`.
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
  // `underived` is derive.js's honest "nothing classified this face" class —
  // no OSM land-use polygon covers it and no assessor parcel overlaps it
  // (`parcel-landuse.mjs`). SOFT on purpose, and the reasoning is this module's
  // own: a data gap routed to hardscape blanks the block and reads as a
  // deliberate design choice, which is the silent error. Soft makes the gap
  // look like land the operator can correct. ⛔ It is NOT a synonym for
  // 'unknown' below — that one is a face TYPE derive could not resolve at all,
  // and it stays hard.
  underived:           'soft',

  // Added 2026-09-20 with the vocabulary widening. A cemetery is lawn with
  // specimen trees; a forest is the one class where a canopy fill is not a
  // guess; brownfield is a ruled class of its own (Jacob, 2026-09-20) and an
  // abandoned industrial lot is colonised by weeds and volunteer trees, which
  // is what makes it read as abandoned rather than as a lot.
  cemetery:            'soft',
  forest:              'soft',
  brownfield:          'soft',

  // — hard: the interior is forbidden to a tree (ratified with Jacob 2026-07-18) —
  // ⚠️ WIDENED 2026-09-20 — see the header. `hard` no longer implies PAVED: the
  // two classes below it are bare natural ground, and nothing grows on them
  // either. Their COLOUR says sand and rock; this axis says "no tree".
  commercial:          'hard',
  parking:             'hard',
  industrial:          'hard',
  railway:             'hard',
  beach:               'hard',
  bare:                'hard',
  // NOTE: 'unknown' is the kit's OWN "derive.js could not classify this parcel"
  // bucket, ratified hard and eye-gated at LS (4 tiles). It is deliberately NOT
  // the same thing as a class name the kit has never seen — that defaults soft
  // (see resolveLuPolicy). Flagged in the report so the tension stays visible.
  unknown:             'hard',

  // — planted: green, and the planting is SPECIFIED. See the header. —
  // ⛔ NO GENERATOR CONSUMES `with` YET. That is declared, not hidden: `report()`
  // names every planted class and the foliage it is still owed, every pour.
  // ⭐ `with` is a ROSTER FILTER, not a new vocabulary — the species ids are the
  // same ones `design.json#/trees` and the Arborist already speak.
  agricultural:        { ground: 'planted', with: ['zea_mays'],       pattern: 'rows' },
  orchard:             { ground: 'planted', with: ['malus_domestica'], pattern: 'grid' },
  wetland:             { ground: 'planted', with: ['phragmites'],      pattern: 'scatter' },
}

/** What an unrecognized class resolves to. Soft + loud — never silent hardscape. */
export const UNRECOGNIZED_DEFAULT = 'soft'

/**
 * A policy row is either a bare ground kind (`'soft'`) or an object carrying the
 * planting spec (`{ ground: 'planted', with: [...], pattern }`). Both spellings
 * are first-class so every row written before 2026-09-20 stays valid verbatim.
 */
export const GROUND_KINDS = ['soft', 'hard', 'planted']
const groundOf = (row) => (typeof row === 'string' ? row : row?.ground)
/** The ground kind of a raw `LU_POLICY` row, whichever spelling it uses. */
export const groundKindOf = (row) => groundOf(row)

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
    for (const [lu, row] of Object.entries(raw)) {
      const g = groundOf(row)
      // ⛔ A ROW WE CANNOT READ IS DROPPED AND NAMED, never coerced. Coercing it
      // would make the operator's own file the silent substitution.
      if (!GROUND_KINDS.includes(g)) {
        console.warn(`[lu-policy] ${scene}: ignoring "${lu}" — expected ${GROUND_KINDS.map(k => `"${k}"`).join(' / ')}` +
                     ` (or { ground, with, pattern }), got ${JSON.stringify(row)}.`)
        continue
      }
      if (g === 'planted' && !(Array.isArray(row?.with) && row.with.length)) {
        console.warn(`[lu-policy] ${scene}: "${lu}" is "planted" with no \`with\` list — that is a planting spec` +
                     ` that specifies nothing. Ignored; declare the species or use "soft"/"hard".`)
        continue
      }
      out[lu] = row
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
 * @returns {{ isPlantable, kindOf, plantingOf, unrecognized, overridden, awaitingPlanting, report }}
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

  const rowOf = (lu) => override[lu] ?? LU_POLICY[lu] ?? UNRECOGNIZED_DEFAULT
  const kindOf = (lu) => groundOf(rowOf(lu)) || UNRECOGNIZED_DEFAULT
  // ⛔ `planted` IS NOT PLANTABLE, and that is the point rather than an oversight:
  // the ground is already spoken for, so the census tree does not stand here. The
  // foliage it is owed instead comes from `plantingOf`, which nothing reads yet —
  // announced in `report()` rather than quietly resolved either way.
  const isPlantable = (lu) => kindOf(lu) === 'soft'
  /** The planting spec for a `planted` class — `{ with, pattern }` — else null. */
  const plantingOf = (lu) => {
    const row = rowOf(lu)
    if (groundOf(row) !== 'planted') return null
    return { with: row.with || [], pattern: row.pattern || null }
  }
  const awaitingPlanting = [...new Set(classesPresent)].filter(lu => kindOf(lu) === 'planted').sort()

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
      const badge = kind === 'soft' ? '🌱 soft   ' : kind === 'hard' ? '🧱 hard   ' : '🌾 planted'
      const spec = kind === 'planted'
        ? `  → ${(plantingOf(lu).with || []).join(', ') || '(nothing declared)'}` +
          `${plantingOf(lu).pattern ? ` in ${plantingOf(lu).pattern}` : ''}`
        : ''
      lines.push(`   ${badge}  ${lu.padEnd(20)} (${why})${spec}`)
    }
    // ⛔⛔ THE OWED FOLIAGE, NAMED EVERY POUR. `planted` means the census tree does
    // not stand here and the specified planting does not exist yet, so these faces
    // carry NO foliage at all. That is a real, open gap; printing it is the only
    // thing standing between it and the silent substitution (`CLAUDE.md` Layer 0 q2).
    if (awaitingPlanting.length) {
      lines.push('')
      lines.push(`   🌾 ${awaitingPlanting.length} class(es) declared PLANTED: ${awaitingPlanting.join(', ')}`)
      lines.push(`   ⛔ NO PLANTING GENERATOR EXISTS — nothing in the kit reads \`plantingOf()\`, so these`)
      lines.push(`      faces paint their own colour and grow NOTHING. They are not bald by accident and`)
      lines.push(`      they are not planted; they are AWAITING a generator. (docs/briefs/BRIEF-field-shader.md)`)
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

  return { isPlantable, kindOf, plantingOf, unrecognized, overridden, awaitingPlanting, report }
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
