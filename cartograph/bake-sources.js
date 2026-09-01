/**
 * bake-sources.js — pour this town's ATTRIBUTION into its slab.
 *
 * The public app is a static site. `/api/cartograph` is a Vite dev-server proxy
 * (`vite.config.js:173`) and does not exist in production, so a visitor-facing
 * credit CANNOT read the intake manifest at runtime. It travels the same way
 * everything else the public sees travels: through the bake, into the slab.
 * `SLAB-CONTRACT` — if it isn't baked in, the public never sees it.
 *
 * Reads : the intake manifest for <scene>, computed FROM DISK on every run
 *         (`intake-rows.mjs` — status is never stored)
 * Writes: public/baked/<look>/sources.json
 * Run   : node cartograph/bake-sources.js --look=<id> --scene=<id>
 *
 * ⭐ WHAT MAKES THIS PER-TOWN RATHER THAN A LIST. The credit is derived from
 * the rows this scene ACTUALLY HAS ON DISK — `status === FILLED` — not from the
 * rows a town could have. So Lafayette Square credits Microsoft because
 * `raw/msbf.json` is sitting there, and a Polish town that took hand-mapped OSM
 * footprints instead does not, because its msbf row is empty. Nobody has to
 * remember to update anything; the artifact is a reading of the disk.
 *
 * ⛔ THREE THINGS THIS MUST NEVER DO, all of them Layer 0:
 *
 * 1. NEVER INVENT A LICENCE. A row carries a `licence` only where the kit fixes
 *    its source and the terms were read at that source. A filled row without
 *    one is reported in `owed` — visibly, in the artifact and on stdout — and
 *    is NOT credited. Showing nothing is recoverable; asserting the wrong
 *    licence on a public page is not.
 *
 * 2. NEVER FALL BACK TO ANOTHER TOWN. No default scene, no LS copy. A scene
 *    with no readable intake writes an EMPTY credit list, which the runtime
 *    renders as a visible to-do. A wrong attribution is a plausible-looking
 *    success, which is the worst thing a kit can ship.
 *
 * 3. NEVER FLATTEN THE TWO OBLIGATIONS. `requires: 'attribution'` (ODbL §4.3)
 *    means credit; `requires: 'licence-text'` (CDLA Permissive 2.0 §2.1) means
 *    make the terms available. The artifact keeps them apart so the surface
 *    can too. See the `licence` block in `intake-rows.mjs`.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { intakeStatusForScene, STATUS, ACQUIRE, KIND } from './intake-rows.mjs'
import { assertBakeTarget } from './bake-target.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs() {
  const a = {}
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i]
    if (!k.startsWith('--')) continue
    const eq = k.indexOf('=')
    if (eq >= 0) a[k.slice(2, eq)] = k.slice(eq + 1)
    else { a[k.slice(2)] = process.argv[i + 1]; i++ }
  }
  return a
}

/**
 * One entry per SOURCE, not per row. Lafayette Square fills three OSM-derived
 * rows (the base extract, street lamps, OSM trees); OpenStreetMap is owed one
 * credit, not three. The rows that produced it ride along as `from`, because
 * "which of my inputs put me under this licence" is the question an operator
 * asks the moment they see the line.
 */
export function creditsForScene(scene) {
  const { rows } = intakeStatusForScene(scene)
  const filled = rows.filter(r => r.status === STATUS.FILLED)

  const bySource = new Map()
  const owed = []

  for (const row of filled) {
    if (!row.licence) {
      // ⭐ THREE-WAY, AND THE ROW ALREADY DECLARES WHICH. "No licence" is not
      // one condition. An input we DERIVED (`derive-ls-render-ledger.js`) or the
      // operator AUTHORED (the boundary pen, the measure tool) has no third
      // party behind it — there is nobody to credit and nothing owed, and
      // listing it as a debt buries the four rows that are real under ten that
      // are not. Only an outside well with unstated terms is owed.
      //
      // ⛔ This reads `acquisition.kind`, which every row must set, so it holds
      // for rows nobody has written yet. It is not a list of exceptions.
      const kind = row.acquisition?.kind
      if (kind === ACQUIRE.DERIVED || kind === ACQUIRE.OPERATOR) continue
      // A MEASURE row is COVERAGE of data some file row already accounted for
      // (storey counts live inside `raw/osm.json`), never an acquisition of its
      // own — so crediting it would double-count the file it is measuring.
      if (row.kind === KIND.MEASURE) continue
      // Not a failure of this script — a fact about the row, surfaced as work.
      owed.push({ row: row.id, label: row.label, acquisition: row.acquisition?.note ?? null })
      continue
    }
    const l = row.licence
    const hit = bySource.get(l.source)
    if (hit) { hit.from.push(row.id); continue }
    bySource.set(l.source, {
      source: l.source,
      sourceUrl: l.sourceUrl,
      credit: l.credit,
      licence: l.name,
      licenceUrl: l.url,
      requires: l.requires,
      from: [row.id],
    })
  }

  return { credits: [...bySource.values()], owed }
}

// ⭐ THE CLI IS GUARDED so `creditsForScene` can be imported without the module
// baking anything or calling process.exit. `scratch/claims-attribution-is-per-town.mjs`
// re-derives every town's credits through this exact function — the check and the
// bake must never be two implementations that can agree about something false.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) main()

function main() {
const args = parseArgs()
const look = args.look
const scene = args.scene

// ⛔ Neither may default. `--look` defaulting writes over another town's slab
// (the palimpsest mode, BRIEF-ls-bleed-excision site 14); `--scene` defaulting
// credits Lafayette Square's sources under this town's name, which is the exact
// lie this artifact exists to prevent.
if (!look || !scene) {
  console.error('[sources] ⛔ both --look and --scene are required. Refusing to guess: a defaulted look bakes over another town, a defaulted scene credits another town\'s sources.')
  process.exit(1)
}

  // …and the look must EXIST, or this writes a phantom nothing reads.
  assertBakeTarget('bake-sources', look, scene)

const { credits, owed } = creditsForScene(scene)

const out = {
  version: 1,
  scene,
  bakedAt: Date.now(),
  credits,
  // Filled inputs whose terms this kit cannot state. Carried INTO the artifact
  // rather than only printed, so the number is visible to whoever opens the
  // slab and does not depend on anyone having watched a bake scroll past.
  owed,
}

const dir = join(ROOT, 'public', 'baked', look)
mkdirSync(dir, { recursive: true })
const file = join(dir, 'sources.json')

// writeIfChanged: the bake's dirty graph keys off mtime, and `bakedAt` alone
// would make this artifact perpetually dirty and re-trigger downstream steps.
const next = JSON.stringify(out, null, 2)
let prev = null
try { if (existsSync(file)) prev = JSON.parse(readFileSync(file, 'utf8')) } catch { prev = null }
const same = prev
  && JSON.stringify({ ...prev, bakedAt: 0 }) === JSON.stringify({ ...out, bakedAt: 0 })
if (!same) writeFileSync(file, next)

const attributed = credits.filter(c => c.requires === 'attribution').map(c => c.source)
const textOwed = credits.filter(c => c.requires === 'licence-text').map(c => c.source)

console.log(`[sources] ${look} ← ${scene}: ${credits.length} source${credits.length === 1 ? '' : 's'}${same ? ' (unchanged)' : ''}`)
if (attributed.length) console.log(`[sources]   credit: ${attributed.join(', ')}`)
if (textOwed.length) console.log(`[sources]   licence text to ship: ${textOwed.join(', ')}`)

// ⭐ LOUD, not silent. These are inputs that reached the render under terms we
// cannot state. That is a real open obligation, not a cosmetic gap, and the one
// thing that must not happen is it passing unremarked.
if (owed.length) {
  console.warn(`[sources] ⚠️  ${owed.length} filled input${owed.length === 1 ? ' has' : 's have'} NO recorded licence — not credited, and still owed:`)
  for (const o of owed) console.warn(`[sources]     ${o.row} (${o.label})${o.acquisition ? ` — ${o.acquisition}` : ''}`)
  console.warn('[sources]   Record each in intake-rows.mjs `licence` ONLY after reading the terms at the source.')
}
if (!credits.length) {
  console.warn(`[sources] ⚠️  '${scene}' credits NOTHING. Either it has no inputs on disk, or none of the ones it has carry a licence. The public surface will show a to-do, not a credit.`)
}
}
