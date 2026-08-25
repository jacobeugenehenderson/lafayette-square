/**
 * THE SPECIES MAKER — mint a dossier STUB for a species the roster places but nobody
 * has authored.
 *
 * ⭐ What it does NOT do. A dossier carries judgment: `identityNotes`, `forces`, the
 * leaf.face colors, the season anchors, the recipe. None of that is derivable from a
 * botanical database and this script does not invent it. It mints the SOURCED skeleton
 * and leaves every judgment field null, named in `owed`. The species stays RED until a
 * human authors it -- resolves or empty, and empty stays red.
 *
 * ⛔ NEVER overwrites an existing dossier. Minting is additive only; hydration of
 * existing files is hydrate-dossiers.mjs's job and it defers to authored values.
 *
 * ⚠️ THE TAXON MATCH IS A CLAIM, NOT A FACT. The harvest matched "Elm, Hybrid" to
 * `Ulmus americana`, which is wrong -- a hybrid elm is not an American elm. Every mint
 * records the matched taxon and flags identity UNCONFIRMED so a wrong match cannot be
 * mistaken for a settled one.
 *
 *   node arborist/mint-dossiers.mjs           # dry run
 *   node arborist/mint-dossiers.mjs --write
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { sizeMetres, FEET_AXES } from './units.mjs'
import { resolveTerm, resolveSpecies, aliasesFor, normalize, verifyTaxon, TERM_REDIRECTS, NOT_A_TRAIT } from './vocabulary.mjs'

const WRITE = process.argv.includes('--write')
const root = path.join(import.meta.dirname, '..')
const dDir = path.join(root, 'arborist/dossiers')

// Jacob's ruling, 2026-08-24: hard for identity axes, soft for the rest.
const HARD = new Set(['leaf.type', 'leaf.shape', 'chassis.habit'])
// The judgment a database cannot supply. Minted null, listed in `owed`.
const OWED = ['forces', 'descriptor', 'identityNotes', 'referenceImages', 'recipe', 'partAvailability']

const rubric = JSON.parse(readFileSync(path.join(root, 'arborist/rubric.json'), 'utf8'))
const axisKind = new Map((rubric.axes || []).map(a => [a.id, a.kind || (a.values ? 'enum' : 'scalar')]))

const hydSrc = readFileSync(path.join(root, 'arborist/hydrate-dossiers.mjs'), 'utf8')

// ⛔ A PARTIAL PARSE IS THE `-1` DEFECT IN ANOTHER COSTUME: it fails by returning a
// usable-looking value. This regex once read 18 of 22 FIELD_MAP entries and nothing said
// so -- the check simply had a smaller idea of the field map than the code did. Count the
// assignment lines in the block and refuse to run on a mismatch.
function assertFullParse(block, parsedCount, what) {
  const lines = block.split('\n').filter(l => /^\s*'?[A-Za-z][^:]*'?:\s*'[^']*',/.test(l)).length
  if (lines !== parsedCount) {
    console.error(`⛔ ${what}: source has ${lines} entries, parsed ${parsedCount}. The parse is silently partial; fix the regex before trusting any result.`)
    process.exit(1)
  }
}

const fmBlock2 = hydSrc.match(/const FIELD_MAP = \{[\s\S]*?\n\}/)[0]
const fmEntries = [...fmBlock2.matchAll(/^\s*'?([A-Za-z_/ ,()0-9-]+?)'?:\s*'([a-z._]+)',/gm)]
assertFullParse(fmBlock2, fmEntries.length, 'FIELD_MAP (mint-dossiers)')
const FIELD_MAP = Object.fromEntries(fmEntries.map(m => [m[1], m[2]]))
const AUTHORED = new Set([...hydSrc.match(/const AUTHORED = new Set\(\[[\s\S]*?\]\)/)[0]
  .matchAll(/'([a-z._]+)'/g)].map(m => m[1]))

// ⚠️ Built from AUTHORED dossiers only. Including our own minted stubs here made the
// script idempotent in the worst way -- a stub minted with a bug could never be re-minted
// without deleting it by hand, and the tie fix below silently did nothing on first re-run.
const have = new Set()
for (const f of readdirSync(dDir).filter(f => f.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(path.join(dDir, f), 'utf8'))
  if (d.provenance?.minted) continue
  for (const n of [d.canonicalId, d.key, d.scientific, ...(d.inventoryNames || [])]) if (n) have.add(normalize(n))
  for (const a of aliasesFor(d.canonicalId || '')) have.add(normalize(a))
}

// ⚠️ Explicit flag check. hydrate-dossiers had `args[args.indexOf('--in') + 1]`, and
// indexOf returns -1 when the flag is absent, so -1 + 1 read args[0] -- `--write`.
const inFlag = process.argv.indexOf('--in')
const IN = inFlag >= 0 ? process.argv[inFlag + 1] : 'scratch/dossier-raw-observations.jsonl'
if (inFlag >= 0 && !IN) { console.error('⛔ --in given with no path'); process.exit(1) }
const obs = readFileSync(path.isAbsolute(IN) ? IN : path.join(root, IN), 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l))

// Strip the botanical authority ("Acer rubrum L." → "Acer rubrum"); keep the hybrid ×.
// ⚠️ The harvest carries HTML entities ("Acer &times freemanii"); decoding is not
// cosmetic here -- the × IS the identity claim that this is a hybrid.
const decode = (t) => String(t)
  .replace(/&times;?/g, '×').replace(/&amp;/g, '&').replace(/&#(\d+);?/g, (_, n) => String.fromCharCode(+n))
// ⛔ A BINOMIAL IS GENUS + EPITHET. Nothing after it belongs in an identity.
// The old form kept "the first three word-ish tokens", which let the AUTHORITY through
// whenever it looked like a genus: `Sorbus americana Marshall` minted
// sorbus_americana_marshall.json. `Acer rubrum L.` survived only because "L." carries a
// period. The filename IS the identity here, so this is not cosmetic.
// Take the genus, then the first epithet-shaped token after it (lowercase, or ×-marked).
const cleanTaxon = (t) => {
  const words = decode(t).replace(/\s*\[.*?\]\s*/g, ' ').split(/\s+/).filter(Boolean)
  const gi = words.findIndex(w => /^[A-Z][a-zà-ÿ-]+$/.test(w))
  if (gi < 0) return decode(t).trim()
  const genus = words[gi]
  let rest = words.slice(gi + 1)
  let hybrid = ''
  if (rest[0] === '×' || rest[0] === 'x') { hybrid = '×'; rest = rest.slice(1) }
  const epithet = rest.find(w => /^×?[a-zà-ÿ][a-zà-ÿ-]+$/.test(w))
  if (!epithet) return genus
  return `${genus} ${hybrid}${epithet}`.replace(/×\s+/g, '×')
}
const slug = (t) => normalize(cleanTaxon(t)).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

const bySpecies = new Map()
for (const o of obs) {
  if (!bySpecies.has(o.species)) bySpecies.set(o.species, { taxon: null, queried: null, matched: new Map(), cells: new Map(), sources: new Set() })
  const rec = bySpecies.get(o.species)
  // Per SOURCE, not first-wins. Batch 2: SelecTree answered a `Sorbus americana` query
  // with `Sorbus decora` while USDA answered correctly — taking the first match refused
  // the whole species and threw away 68 good observations to avoid 22 bad ones.
  if (o.field === '_matched_taxon') { rec.matched.set(o.source, o.value); if (!rec.taxon) rec.taxon = o.value }
  if (o.field === '_taxon_queried' && !rec.queried) rec.queried = o.value
  rec.sources.add(o.source)

  let axis = FIELD_MAP[o.field]
  if (!axis || AUTHORED.has(axis)) continue
  const nv = normalize(o.value)
  if (NOT_A_TRAIT[axis]?.[nv]) continue
  let forced = null
  const redir = TERM_REDIRECTS[axis]?.[nv]
  if (redir) { axis = redir.axis; forced = redir.value }
  if (!axisKind.has(axis)) continue

  let val = null
  if (axisKind.get(axis) === 'scalar') {
    // ⛔ mint used a raw parseFloat here while hydrate converted feet→metres, so the same
    // species got 24.4 from one writer and 80 from the other depending on run order.
    if (FEET_AXES.has(axis)) { val = sizeMetres(o.value) }
    else { const n = parseFloat(String(o.value).replace(/[^\d.-]/g, '')); val = Number.isFinite(n) ? n : null }
  } else {
    val = forced ?? (resolveTerm(axis, o.value).resolved ? resolveTerm(axis, o.value).value : null)
  }
  if (val == null) continue
  if (!rec.cells.has(axis)) rec.cells.set(axis, new Map())
  const tally = rec.cells.get(axis)
  // Same shape as hydrate — the source AND the field it answered. See the note there:
  // sources often are not disagreeing, they are answering different questions.
  if (!tally.has(val)) tally.set(val, new Map())
  tally.get(val).set(o.source, o.field)
}

const minted = []
const suspect = []
const sourceRejects = []
for (const [species, rec] of bySpecies) {
  const resolved = resolveSpecies(species).value
  if (have.has(normalize(species)) || have.has(normalize(resolved))) continue
  if (!rec.taxon) { suspect.push({ species, why: 'no matched taxon in the harvest' }); continue }

  // ── LAYER 1: is the returned record the binomial we asked for? ──
  // vocabulary.mjs's verifyTaxon, written by the harvest session. Catches the class that
  // poisons an identity axis silently: USDA symbol TICO returns Tiarella cordifolia (a
  // foamflower) for a Tilia cordata query.
  // ⛔ REJECT SOURCES, NOT SPECIES. A source that answered with the wrong plant loses ITS
  // observations; the species is only refused when NOTHING verifies. Identity is taken
  // from a source that DID verify, never from a rejected one.
  const rejected = new Map()
  let identity = null, identityVerdict = null
  if (rec.queried) {
    for (const [src, got] of rec.matched) {
      const v = verifyTaxon(rec.queried, got)
      if (v.match === 'mismatch') { rejected.set(src, `${src} answered "${v.returned}" — ${v.reason}`); continue }
      if (!identity) { identity = got; identityVerdict = v }
    }
    if (rec.matched.size && !identity) {
      suspect.push({ species, why: `every source mismatched the queried taxon: ${[...rejected.values()].join(' · ')}` })
      continue
    }
    if (identity) rec.taxon = identity
  }
  if (rejected.size) sourceRejects.push({ species, rejected: [...rejected.values()] })

  if (rec.queried && rec.taxon) {
    const v = identityVerdict || verifyTaxon(rec.queried, rec.taxon)
    if (v.match === 'mismatch') {
      suspect.push({ species, why: `taxon mismatch — asked ${v.queried}, got ${v.returned}: ${v.reason}` })
      continue
    }
    // ⛔ A CULTIVAR IS NOT THE SPECIES, and `returnedRank` is advisory precisely so this
    // decision lands here. SelecTree's top hit for Acer rubrum was `'Armstrong'`, which is
    // Columnar where the species is not -- on the #1 species by demand. Nomenclaturally
    // that record is `exact` and the peer was right not to force it into the verdict; but
    // MINT TAKES MORPHOLOGY from it, so for us a cultivar record is a stop.
    if (v.returnedRank && (v.returnedRank.cultivar || v.returnedRank.infraspecific)) {
      const r = v.returnedRank.cultivar || v.returnedRank.infraspecific
      suspect.push({ species, why: `returned record is the cultivar/infraspecific "${r}", not the species — its morphology is not the species' morphology` })
      continue
    }
  }

  // ── LAYER 2: does the CENSUS name carry a qualifier the taxon does not account for? ──
  // ⛔ A SEPARATE QUESTION, and verifyTaxon cannot answer it: it compares two binomials,
  // and "Elm, Hybrid" is a roster name. Measured, not assumed --
  // verifyTaxon('Ulmus', 'Ulmus americana') returns `exact`, and is RIGHT to: it IS a
  // Ulmus. What is wrong lives in the census name, which verifyTaxon never sees. Two
  // layers because there are genuinely two questions.
  // account for. "Elm, Hybrid" matched `Ulmus americana` -- a hybrid elm is not an
  // American elm, and minting it would put the WRONG IDENTITY IN THE FILENAME, where
  // identityConfirmed:false cannot undo it. Refuse; a human supplies the taxon.
  const qual = /\b(hybrid|cultivar|spp|var|hybr)\b/i.exec(species)
  if (qual && !/[×x]\s/.test(decode(rec.taxon))) {
    suspect.push({ species, why: `census says "${qual[1]}" but the match is a straight species: ${cleanTaxon(rec.taxon)}` })
    continue
  }

  const id = slug(rec.taxon)
  const file = path.join(dDir, `${id}.json`)
  if (existsSync(file)) {
    // Re-mint our own stub freely; ⛔ never touch a dossier a human has authored.
    const prior = JSON.parse(readFileSync(file, 'utf8'))
    if (!prior.provenance?.minted) { console.log(`  ⏭  ${species} → ${id}.json is AUTHORED; leaving it alone`); continue }
  }

  const required = {}
  const contested = []
  const ties = []
  for (const [axis, tally] of rec.cells) {
      // Candidates keep only the sources that verified; a value claimed ONLY by a rejected
    // source disappears with it.
    const ranked = [...tally].map(([v, srcs]) => [v, new Map([...srcs].filter(([x]) => !rejected.has(x)))])
      .filter(([, srcs]) => srcs.size)
      .sort((a, b) => b[1].size - a[1].size)
    if (!ranked.length) continue
    // ⛔⛔ NO PLURALITY, NO TARGET. Zelkova's habit came back columnar/multi-stem/
    // irregular/vase/rounded at one vote each; taking the first would dress an arbitrary
    // pick as a sourced answer, which is the fallback this kit exists to refuse. A tie
    // stays NULL and stays RED, with every candidate listed for the author.
    const tied = ranked.length > 1 && ranked[0][1].size === ranked[1][1].size
    // ⛔ Sourced axes only ever get SOFT hardness at mint, even the identity ones. A
    // hard target is a commitment about what this tree IS; a database majority is not
    // that commitment. Promotion to hard is the authoring step.
    required[axis] = {
      target: tied ? null : ranked[0][0],
      hardness: 'soft',
      tol: axisKind.get(axis) === 'scalar' ? 0.4 : 1,
      sourced: true,
    }
    // ONE VOCABULARY FOR ONE CONCEPT. mint said `unresolved`/`alternatives` where hydrate
    // says `contested`/`candidates`/`settle`, and the Salon's rail renders only hydrate's.
    // mint rebuilds a stub's whole `required` block, so running it AFTER hydrate replaced
    // those cells with a shape nothing displays -- nine species showing no disagreement
    // while having ties. Two writers disagreeing about what to CALL a thing is the same
    // defect as disagreeing about its value, and it hid behind run order.
    if (ranked.length > 1) {
      required[axis].contested = true
      required[axis].candidates = ranked.map(([value, srcs]) => ({
        value, seen: srcs.size, sources: [...srcs.keys()].sort(),
        askedAs: [...srcs].map(([src, field]) => `${src}: ${field}`).sort(),
      }))
      required[axis].settle = tied
        ? 'sources tie - no target. Pick one in the Salon; that pick is authoring.'
        : 'plurality shown as target, but sources disagree. Confirm or pick another.'
      ;(tied ? ties : contested).push(axis)
    }
    if (HARD.has(axis)) required[axis].owedHardness = 'identity axis — author must confirm and promote to hard'
  }

  const doc = {
    key: species,
    scientific: cleanTaxon(rec.taxon),
    canonicalId: id,
    inventoryNames: [species],
    identityConfirmed: false,
    forces: null,
    descriptor: null,
    identityNotes: null,
    referenceImages: [],
    required,
    recipe: null,
    partAvailability: null,
    owed: [
      '⚠️ identityConfirmed:false — the matched taxon is a CLAIM. Confirm it before authoring.',
      ...OWED.map(k => `${k} — judgment, not derivable from a database`),
      ...(ties.length ? [`⛔ NO TARGET — sources tied on: ${ties.join(', ')}. See .candidates; an author must choose.`] : []),
      ...(contested.length ? [`sources disagree on: ${contested.join(', ')} — see .alternatives`] : []),
      ...[...HARD].filter(a => required[a]).map(a => `${a} — identity axis minted SOFT; promote to hard when confirmed`),
    ],
    provenance: {
      minted: true,
      mintedAt: rubric._cutover?.at || null,
      matchedTaxon: rec.taxon,
      sources: [...rec.sources].filter(s => s !== 'harvest'),
      note: 'Sourced skeleton only. Every judgment field is null by construction — this species is RED until authored.',
    },
  }
  minted.push({ species, id, file, doc, cells: Object.keys(required).filter(a => required[a].target != null).length, contested, ties })
}

if (sourceRejects.length) {
  console.log(`\n⛔ ${sourceRejects.length} SPECIES with a REJECTED SOURCE — minted from the sources that verified:`)
  for (const r of sourceRejects) console.log(`   "${r.species}"  ${r.rejected.join(' · ')}`)
}
if (suspect.length) {
  console.log(`\n⛔ REFUSED TO MINT (${suspect.length}) — a wrong taxon becomes a wrong FILENAME:`)
  for (const s2 of suspect) console.log(`   "${s2.species}"  ${s2.why}`)
  console.log('   ▶ supply the taxon by hand, or fix the match upstream in the harvest.')
}
console.log(`\nspecies in harvest: ${bySpecies.size}   already have a dossier: ${bySpecies.size - minted.length}\n`)
if (!minted.length) { console.log('nothing to mint.'); process.exit(0) }

for (const m of minted) {
  console.log(`  ${m.id}.json`.padEnd(34) + `${m.cells} sourced cell(s)` + (m.ties.length ? `  ⛔ NO TARGET: ${m.ties.join(', ')}` : '') + (m.contested.length ? `  ⚠️ contested: ${m.contested.join(', ')}` : ''))
  console.log(`      "${m.species}"  →  ${m.doc.scientific}   (from "${m.doc.provenance.matchedTaxon}")`)
}
console.log(`\n⚠️ Every one is minted identityConfirmed:false with all judgment fields null.`)
console.log('   They will read RED until a human authors them. That is the intended state.')

if (!WRITE) { console.log(`\nDRY RUN — would mint ${minted.length} dossier(s). Re-run with --write.`); process.exit(0) }
for (const m of minted) writeFileSync(m.file, JSON.stringify(m.doc, null, 2) + '\n')
console.log(`\n✅ minted ${minted.length} dossier(s).`)
