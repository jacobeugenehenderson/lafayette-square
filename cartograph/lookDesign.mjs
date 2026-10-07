/**
 * THE DESIGN A BAKE READS — one reader, two authorities, and a refusal instead of `{}`.
 *
 * ⭐ THE SPLIT (Phase 2 C row 4, 2026-10-04). A map can carry many Looks (seasonal, sponsor), and a Look is cosmetic
 * (Jacob, 2026-09-19). So a design.json holds two kinds of field:
 *   • the TOWN's — facts about the place that every Look of it must share: how its ground is measured (Survey widths,
 *     corners, land use), how its terrain is exaggerated, what grows there, its water, whether lamps are derived.
 *     These are read from the town's HOME Look, `public/looks/<map>/design.json`, whichever Look is being baked.
 *   • the LOOK's — everything else: palette, materials, sky, labels, identity, layer visibility.
 * ⛔ Before this the bakes disagreed: bake-ground and bake-lamps read the baked Look's blockCustoms, derive-lamps and
 * bake-trees the home Look's, terrainLoad the home Look's terrainExag — the same file only while look id = map id.
 * A second Look of one town would have baked its ground and its lamps from two different Survey widths.
 * ⛔ A non-home Look that carries a town field with a value different from home's REFUSES (`assertOneTownAuthority`):
 * that edit belongs on the home Look, and baking either value silently would be a guess.
 *
 * ⛔ NO `{}`. A missing or unparseable design.json is a refusal naming the file — never "every consumer degrades to
 * its default", which baked a town's slab from kit defaults with nothing said (map §2, silent substitutions).
 * An ABSENT FIELD inside a design that exists is different: that is the town not having authored it, and the
 * consumer's neutral default is the honest answer.
 * ▶ node checks/claims-a-bake-reads-design-through-one-reader.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/** Fields a town owns, shared by every Look of it. Everything not listed is the Look's. */
export const TOWN_DESIGN_FIELDS = [
  'blockCustoms',                  // Survey widths + Section depths, per street — the ground's measurements
  'cornerRadiusOverrides',         // per junction
  'cornerCornerRadiusOverrides',   // per corner pair
  'blockLandUse',                  // per block
  'curbWidth',                     // the curb the zone tester and the ground share
  'terrainExag',                   // the terrain's vertical exaggeration — the ground is tessellated for it
  'trees',                         // the town's curated roster
  'groveThreshold',                // which species the grove admits
  'water',                         // the town's water levels and bed
  'lamps',                         // whether lamps are derived
  'pour',                          // how the Bake treats the town's pour: { held: "<why>" — a re-promote asks first ·
                                   // elevation: true — the pipeline reads the town's elevation cache ·
                                   // ribbons: "<repo path>" — where its promoted ribbons are committed } (G5/G2(b), 2026-10-07)
]

/**
 * Fields that hold a PLACE or a camera in the town's own frame — another town's are meaningless here, and LS's were
 * inherited this way (Huron's `parkTitlePos`, 2026-10-04). Jacob, 2026-09-19: "the camera motion is not something that
 * carries realistically from hood to hood" ⇒ the kit stores no camera.
 */
export const PLACE_DESIGN_FIELDS = ['heroKeyframes', 'shots', 'browseFrame', 'heroSubject', 'parkTitlePos']

/**
 * ⭐ WHAT A LOOK SEEDED FROM ANOTHER TOWN'S LOOK MAY NOT CARRY: the town's own fields and its places. Everything else is
 * the Look's (cosmetic) and travels. Declared here, from the two lists above, so a field added to either is stripped
 * the day it is added (Phase 2 C row 5). `serve.js#seedDesignForScene` adds its street-keyed list and its residue refusal.
 */
/**
 * ⭐ LOOK fields sized to ONE town — cosmetic, so not the town's, but a value authored for one town's size is wrong for
 * another's. `edgeFadeBand` is metres: Lafayette Square's 200 m seeded into a 5 km town would be a 4% band nobody
 * chose, and the kit's own default (5% of the radius) would never fire — the bleed Layer 0 names. Stripped on seed.
 */
export const TOWN_SCALED_LOOK_FIELDS = ['edgeFadeBand']
export const SEED_STRIPPED_FIELDS = [...new Set([...TOWN_DESIGN_FIELDS, ...PLACE_DESIGN_FIELDS, ...TOWN_SCALED_LOOK_FIELDS])]

export const designPath = (look) => join(ROOT, 'public', 'looks', look, 'design.json')

/** A design.json's text, parsed — or a refusal. Split out so the check can refuse fixtures, never a live town's file. */
export function parseDesign(text, look, who) {
  let d
  try { d = JSON.parse(text) } catch (e) { throw new Error(`[${who}] ⛔ Look "${look}"'s design.json is unreadable (${e.message}). Refusing to bake kit defaults in its place.`) }
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(`[${who}] ⛔ Look "${look}"'s design.json is not an object`)
  return d
}

/** A Look's design.json, parsed — or a refusal naming the file. */
export function readLookDesign(look, who) {
  if (!look) throw new Error(`[${who}] ⛔ no Look named — a bake reads a Look's design, never none`)
  const p = designPath(look)
  if (!existsSync(p)) throw new Error(`[${who}] ⛔ Look "${look}" has no design.json (${p}). Refusing to bake kit defaults in its place — create the Look (Stage) or name the right one.`)
  return parseDesign(readFileSync(p, 'utf-8'), look, who)
}

/** The town's fields — from its home Look, `public/looks/<map>/design.json` — or a refusal. */
export function readTownDesign(map, who) {
  if (!map) throw new Error(`[${who}] ⛔ no map named — the town's design is its home Look's`)
  const d = readLookDesign(map, `${who} (town "${map}"'s home Look)`)
  return Object.fromEntries(TOWN_DESIGN_FIELDS.filter(f => d[f] !== undefined).map(f => [f, d[f]]))
}

/**
 * ⛔ A Look that is not its town's home Look must not author a town field differently. Throws naming each field.
 * Equal copies pass (Stage's autosave writes them into every Look); a different value is an edit made in the wrong place.
 */
export function assertOneTownAuthority(look, map, who) {
  if (!map || look === map) return
  townAuthoritySplit(readLookDesign(look, who), readTownDesign(map, who), look, map, who)
}

/** The comparison itself, on two parsed designs. Throws naming each town field `look` authors differently. */
export function townAuthoritySplit(mine, home, look, map, who) {
  const split = TOWN_DESIGN_FIELDS.filter(f => mine[f] !== undefined && JSON.stringify(mine[f]) !== JSON.stringify(home[f]))
  if (split.length) throw new Error(`[${who}] ⛔ Look "${look}" authors ${split.join(', ')} differently from its town "${map}" — these are the TOWN's (cartograph/lookDesign.mjs#TOWN_DESIGN_FIELDS) and every Look of it shares them. Make the edit on Look "${map}", or remove the fields from "${look}"'s design.json. Refusing to bake either value as a guess.`)
}

/**
 * What a bake of `look` (a Look of `map`) reads: the Look's fields, with the town's fields from home overlaid.
 * One object, so a reader cannot accidentally take a town field from the wrong file.
 */
export function readBakeDesign(look, map, who) {
  assertOneTownAuthority(look, map, who)
  const own = readLookDesign(look, who)
  if (!map || look === map) return own
  const d = { ...own }
  for (const f of TOWN_DESIGN_FIELDS) delete d[f]
  return { ...d, ...readTownDesign(map, who) }
}
