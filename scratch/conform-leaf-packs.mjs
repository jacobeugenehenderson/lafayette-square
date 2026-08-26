/**
 * conform-leaf-packs.mjs — leaf packs speak the botanica, not their own dialect.
 *
 * ⭐ Jacob, 2026-08-25: "conform everything to the agreed-upon nomenclature we
 * established… it is the truer industry speak."
 *
 * A pack's `morphology` was free text — `star`, `seasonal_oak`, `fine_compound`,
 * `ovate_large` — so `ingest-tagger` (which now resolves through vocabulary.mjs) had to
 * guess, and four packs resolved to NOTHING. Worse, the rubric SPLIT leaf.silhouette into
 * shape / type / margin in today's cutover, and a single `morphology` string cannot carry
 * that: `serrate_ovate` is a SHAPE and a MARGIN, and squashing it to "ovate" throws the
 * margin away.
 *
 * ⛔ `morphology` is KEPT and set to a rubric term — ingest-tagger reads it and this must
 * not become a second vocabulary. The axis fields are ADDED alongside so a pack can say
 * both things without either being inferred.
 *
 * ⚠️ `star` was RETIRED from the rubric today (Jacob: "retire star and fan, replacing them
 * with whatever the proper terms are"). A sweetgum leaf is palmately LOBED; `flabellate`
 * replaced `fan` for ginkgo. Those two renames are why this pass exists at all.
 *
 * ⛔ THE PALMATE TRAP, and it is a botanical error not a naming one: three packs said
 * `palmate`, which vocabulary.mjs resolves to `leaf.type = compound-palmate`. That is
 * CORRECT for a source saying "palmately compound" and WRONG for these packs. A maple and
 * a sycamore leaf are SIMPLE and palmately LOBED — compound-palmate means separate
 * leaflets (horse chestnut). The source vocabulary is right; the packs were imprecise.
 *
 *   node scratch/conform-leaf-packs.mjs            # dry run
 *   node scratch/conform-leaf-packs.mjs --write
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { resolveTerm, normalize, TERM_REDIRECTS } from '../arborist/vocabulary.mjs'

const WRITE = process.argv.includes('--write')
const ROOT = path.join(import.meta.dirname, '..')
const SHAPES = path.join(ROOT, 'public/textures/leaves/shapes')

// ⛔ Hand determinations, each a botanical claim with its reason. NOT inferred — the whole
// point is that the free-text names could not be resolved, so a human decides once and it
// is written down where the resolver can read it.
const CONFORM = {
  american_sweetgum: { shape: 'orbicular', margin: 'lobed', why: 'star-shaped = palmately 5-7 lobed, roughly circular in outline; `star` was retired from the rubric' },
  bigleaf_maple:     { shape: 'orbicular', margin: 'lobed', why: 'SIMPLE palmately lobed — not compound-palmate' },
  palmate:           { shape: 'orbicular', margin: 'lobed', why: 'generic maple-form pack: simple, palmately lobed' },
  sycamore:          { shape: 'orbicular', margin: 'lobed', why: 'Platanus: simple, palmately lobed' },
  oak_autumn:        { shape: 'obovate',   margin: 'lobed', why: 'oak form; `seasonal_oak` named a SEASON in a morphology field' },
  elm_autumn:        { shape: 'ovate',     margin: 'doubly-serrate', why: 'Ulmus: ovate, doubly serrate; `seasonal_elm` named a season' },
  fine_compound:     { type: 'compound-pinnate', why: 'many small leaflets on a rachis' },
  serrate_ovate:     { shape: 'ovate',     margin: 'serrate', why: 'the name carries BOTH axes; one field could only keep one' },
  ovate_large:       { shape: 'ovate',     why: 'size lives on leaf.length, never in the shape name' },
  california_black_oak: { shape: 'obovate', margin: 'lobed', why: 'Quercus kelloggii: obovate outline, deeply lobed' },
  eastern_black_oak:    { shape: 'obovate', margin: 'lobed', why: 'Quercus velutina: obovate outline, bristle-lobed' },
  lobed:  { margin: 'lobed', why: 'generic lobed pack — margin only, no shape claim' },
  heart:  { shape: 'cordate', why: '' },
  ginkgo: { shape: 'flabellate', why: '`fan` was retired for the proper term' },
  lanceolate: { shape: 'lanceolate', why: '' },
  ovate:      { shape: 'ovate', why: '' },
  long_needle:  { type: 'needle', why: 'needle length lives on leaf.length' },
  short_needle: { type: 'needle', why: 'needle length lives on leaf.length' },
}

const AXIS_OF = { shape: 'leaf.shape', margin: 'leaf.margin', type: 'leaf.type' }
let planned = 0, bad = 0
for (const name of readdirSync(SHAPES).sort()) {
  const mp = path.join(SHAPES, name, 'meta.json')
  if (!existsSync(mp)) continue
  const meta = JSON.parse(readFileSync(mp, 'utf8'))
  const c = CONFORM[name]
  if (!c) { console.error(`  ⚠️ ${name}: no determination — left alone`); continue }

  // ⛔ Every target must be a LIVE rubric term. A conform pass that invents vocabulary is
  // worse than the free text it replaces.
  const fields = {}
  for (const k of ['shape', 'margin', 'type']) {
    if (!c[k]) continue
    const r = resolveTerm(AXIS_OF[k], c[k])
    if (!r.resolved) { console.error(`  ⛔ ${name}: "${c[k]}" is not a live ${AXIS_OF[k]} term`); bad++; continue }
    fields[AXIS_OF[k]] = r.value
  }
  // `morphology` keeps a single rubric term for ingest-tagger; prefer shape, else type,
  // else margin — the value-decides-the-axis redirect handles it either way.
  const morph = fields['leaf.shape'] || fields['leaf.type'] || fields['leaf.margin']
  const changed = meta.morphology !== morph || JSON.stringify(meta.leafAxes || null) !== JSON.stringify(fields)
  if (!changed) continue
  planned++
  console.log(`  ${name.padEnd(24)} ${String(meta.morphology).padEnd(16)} → ${morph.padEnd(14)} ${JSON.stringify(fields)}`)
  if (c.why) console.log(`       ${c.why}`)
  if (WRITE) {
    meta.morphologyWas = meta.morphologyWas || meta.morphology
    meta.morphology = morph
    meta.leafAxes = fields
    writeFileSync(mp, JSON.stringify(meta, null, 2) + '\n')
  }
}
console.log(`\n${planned} pack(s) to conform${bad ? `, ${bad} bad target(s)` : ''}`)
if (bad) process.exit(1)
if (!WRITE) console.log('DRY RUN — re-run with --write.')
