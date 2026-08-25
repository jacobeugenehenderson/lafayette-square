/**
 * vocabulary.mjs — ONE resolver for every name and term the Arborist keys on.
 *
 * ⭐ THE PROBLEM. `roster-coverage.js` canonicalised species with
 * `canon[raw] || raw` — an EXACT string match against a five-row hand-typed
 * table. So `London Plane`, `Platanus acerifolia`, `Sycamore, American` and
 * `london_plane` were four unrelated strings, one tree showed up as four
 * disconnected records, and typing the words a person actually says found
 * nothing. Meanwhile the census carries 180 distinct raw names with comma
 * inversion, quoted cultivars, parentheticals, `species`/`spp.` suffixes and
 * slashed pairs.
 *
 * ⭐ TWO KINDS OF VOCABULARY, and they behave differently (Jacob, 2026-08-24):
 *   NAMES — open-ended. `London Plane` ≡ `Platanus acerifolia` ≡ `Sycamore,
 *           American`. Needs synonyms; new towns bring new ones forever.
 *   TERMS — CLOSED sets from rubric.json. habit(9) · bark.type(8) ·
 *           leaf.silhouette(10) · leaf.ways(5) · density(3) · overlay(5).
 *           Equivalence here is ALIASING INTO A FIXED SET — `striate`→`ridged`,
 *           `conical`→`pyramidal` — so a botanical description resolves without
 *           anyone rewriting it into our nine words.
 *   ⭐ Habit and bark SATURATE (9 and 8 terms cover every tree there is). Leaves
 *     do not: a lobed maple and a lobed plane are both "lobed" and read nothing
 *     alike, so LEAF PACKS stay a procurement problem no vocabulary can fix.
 *
 * ⛔ BEST EFFORT, OVERRIDABLE — the kit's doctrine (NEIGHBORHOOD-INPUTS §0.0).
 * An unresolved input is RETURNED UNCHANGED with `resolved:false`, never dropped
 * and never silently coerced. Callers surface it; the operator overrides it.
 * The hand-typed rows in roster-name-canon.json WIN over anything derived here —
 * curation no auto-guess gets to overrule.
 *
 * Kit-generic: no scene names, no town-specific strings.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJSON = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }

// ── normalisation ───────────────────────────────────────────────────────────
// Everything below compares on these forms, never on the raw string.
const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Lowercase, drop cultivars/parentheticals/qualifiers, collapse punctuation. */
export function normalize(raw) {
  if (raw == null) return ''
  let s = stripAccents(String(raw)).toLowerCase()
  s = s.replace(/\([^)]*\)/g, ' ')          // (restricted use), (Prairiefire, ...)
  s = s.replace(/['"’`]/g, '')               // 'Kwanzan' → kwanzan
  s = s.replace(/\b(spp?|species|cultivar|var|subsp|sp)\b\.?/g, ' ')
  s = s.replace(/[_\-/,.]+/g, ' ')           // slugs, slashes, commas all → space
  s = s.replace(/[^a-z0-9 ]+/g, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

/** Order-insensitive key: "Oak, Pin" and "Pin Oak" collapse to the same thing. */
export function tokenKey(raw) {
  const n = normalize(raw)
  return n ? n.split(' ').sort().join(' ') : ''
}

/** Every form a value might be recognised by. */
export function keysFor(raw) {
  const out = new Set()
  const n = normalize(raw)
  if (n) { out.add(n); out.add(tokenKey(n)) }
  return out
}

// ── the closed TERM vocabularies, read from the rubric ───────────────────────
// ⛔ READ, never restated — the rubric is the source and this cannot go stale.
function loadAxes() {
  const r = readJSON(path.join(ROOT, 'arborist', 'rubric.json')) || {}
  const axes = r.axes || r
  const out = new Map()   // axisId -> string[]
  for (const [k, v] of Object.entries(axes)) {
    const vals = v && typeof v === 'object' ? (v.values || v.enum || v.options) : null
    if (Array.isArray(vals) && vals.every(x => typeof x === 'string')) out.set(String(v.id ?? k), vals)
  }
  return out
}

// Aliases INTO those closed sets — the words botanical descriptions actually
// use. ⛔ The target must already exist in the rubric; `axisTerms` asserts it.
// Aliases INTO those closed sets — the words botanical descriptions actually use.
// ⛔ The target must already exist in the rubric; `axisTerms` asserts it, and
// `scratch/claims-axis-keys-resolve.mjs` asserts the AXIS ids too.
//
// ⚠️ REGRESSION, found 2026-08-24: this table was keyed on the PRE-CUTOVER axis ids
// (`bark.type`, `leaf.silhouette`, `leaf.ways`) and had therefore been dead since the
// 19→31 cutover — `blocky`→`plated` et al. never fired. The claims check knew about
// three axis-id stores and not this, the fourth. It knows about it now.
const TERM_ALIASES = {
  'chassis.habit': {
    conic: 'pyramidal', 'pyramidal conical': 'pyramidal',
    upright: 'columnar',
    // ⛔ NO `erect` ROW, AND THIS IS DELIBERATE — do not re-add it.
    // `Erect` is an ORIENTATION, not a silhouette: USDA's list is Climbing ·
    // Decumbent · Erect · Prostrate · Semi-Erect, i.e. "grows upward" vs "creeps",
    // and nearly every tree is erect. NCSU offers `Erect` AND `Columnar` as separate
    // options in the same field — a source that ships both is saying they differ.
    // Aliasing it wrote `columnar` into quercus_rubra and tilia_americana at
    // hardness `hard`, so a broad rounded oak could only ever match a columnar
    // chassis. It resolves to nothing now; the cell stays empty and the species
    // stays red, which is the correct outcome for a term we cannot map.
    globose: 'rounded', globular: 'rounded', round: 'rounded', ball: 'rounded',
    egg: 'oval', 'egg shaped': 'oval',
    'v shaped': 'vase', vaselike: 'vase', urn: 'vase',
    wide: 'spreading', broad: 'spreading', umbrella: 'spreading',
    pendulous: 'weeping', pendent: 'weeping', drooping: 'weeping',
    clumping: 'multi-stem', multistem: 'multi-stem', 'multi stem': 'multi-stem',
    'multi trunked': 'multi-stem', 'multiple stem': 'multi-stem',
    'multi stemmed': 'multi-stem', 'multiple trunk': 'multi-stem', clump: 'multi-stem',
    asymmetric: 'irregular', open: 'irregular',
  },
  'bark.texture': {
    striate: 'ridged', striated: 'ridged', grooved: 'ridged', ridges: 'ridged',
    corrugated: 'furrowed', furrows: 'furrowed',
    blocky: 'plated', platy: 'plated', plates: 'plated',
    flaking: 'exfoliating', peeling: 'exfoliating', shredding: 'exfoliating',
    stringy: 'fibrous', shreddy: 'fibrous',
    patchy: 'mottled', camouflage: 'mottled', blotchy: 'mottled',
    glabrous: 'smooth', tight: 'smooth',
    lenticels: 'lenticellate', 'lenticels prominent': 'lenticellate',
    warts: 'warty', scales: 'scaly',
  },
  // ── the three axes the cutover split `leaf.silhouette` into ──
  'leaf.shape': {
    'heart shaped': 'cordate', heart: 'cordate',
    'fan shaped': 'flabellate', fanshaped: 'flabellate', fan: 'flabellate',
    'diamond shaped': 'rhomboid', diamond: 'rhomboid', rhombic: 'rhomboid',
    rhomboidal: 'rhomboid',
    'spear shaped': 'lanceolate', lance: 'lanceolate', 'lance shaped': 'lanceolate',
    oval: 'elliptical', elliptic: 'elliptical', ellipse: 'elliptical',
    'egg shaped': 'ovate', egg: 'ovate',
    'kidney shaped': 'reniform', kidney: 'reniform',
    'spoon shaped': 'spatulate', spoon: 'spatulate',
    triangular: 'deltoid', triangle: 'deltoid',
    circular: 'orbicular', 'round shaped': 'orbicular',
    needlelike: 'acicular', 'needle like': 'acicular', needles: 'acicular',
    strap: 'linear', narrow: 'linear',
  },
  'leaf.type': {
    'pinnately compound': 'compound-pinnate', pinnate: 'compound-pinnate',
    'odd pinnate': 'compound-pinnate', 'even pinnate': 'compound-pinnate',
    'bipinnately compound': 'compound-bipinnate', bipinnate: 'compound-bipinnate',
    'twice compound': 'compound-bipinnate',
    'palmately compound': 'compound-palmate', palmate: 'compound-palmate',
    needles: 'needle', acicular: 'needle',
    scalelike: 'scale', 'scale like': 'scale', imbricate: 'scale',
    entire: 'simple', undivided: 'simple',
  },
  'leaf.margin': {
    'palmately lobed': 'lobed', 'pinnately lobed': 'lobed',
    'bristle lobed': 'lobed', 'deeply lobed': 'lobed', lobes: 'lobed',
    toothed: 'serrate', 'sharply toothed': 'serrate', saw: 'serrate',
    'twice serrate': 'doubly-serrate', biserrate: 'doubly-serrate',
    smooth: 'entire', 'not toothed': 'entire',
    wavy: 'undulate', scalloped: 'crenate', spiny: 'spinose',
  },
  'leaf.arrangement': {
    alternating: 'alternate', spiral: 'alternate', spirally: 'alternate',
    'sub opposite': 'opposite', subopposite: 'opposite',
    clustered: 'whorled', fascicled: 'whorled',
    rosette: 'rosulate',
  },
  'leaf.foliage_type': {
    'broadleaf evergreen': 'broadleaf-evergreen', broadleaved: 'broadleaf-evergreen',
    'needled evergreen': 'needled-evergreen', conifer: 'needled-evergreen',
    'semi evergreen': 'semi-evergreen', tardily: 'semi-evergreen',
    'deciduous conifer': 'deciduous-conifer',
  },
  'crown.texture': { bold: 'coarse', delicate: 'fine', moderate: 'medium' },
  // USDA's `Foliage Porosity Summer/Winter` is a closed 3-term scale — Porous ·
  // Moderate · Dense — and it runs the OPPOSITE way to ours: porous foliage is a
  // SPARSE crown. Only `Dense` matched by exact spelling before, so the axis took
  // the dense end of the scale and dropped the rest, reading denser than the source.
  // Observed across the pilot's 20: Dense ×12, Moderate ×2. `porous` is the third
  // documented term, unobserved here and expected in the corpus run.
  'chassis.density': { porous: 'sparse', open: 'sparse', moderate: 'medium', average: 'medium' },
  // SelecTree `flower_showiness` is Inconspicuous · Low · Showy against our
  // showy · present · insignificant — a 3-to-3 alignment, middle term to middle term.
  'overlay.conspicuous': { inconspicuous: 'insignificant', low: 'present', none: 'insignificant' },
}

// ⭐ VALUE-LEVEL AXIS REDIRECT. A source files a value under one heading; our taxonomy
// keeps it under another. The cutover moved lobing out of shape and into MARGIN, so
// NC State's `Leaf Shape :: Palmately-lobed` must land on `leaf.margin :: lobed`.
// A field→axis map alone cannot express this — the VALUE decides the axis.
export const TERM_REDIRECTS = {
  // ⭐⭐ ORIENTATION IS ITS OWN AXIS (Jacob, 2026-08-25). USDA ships Growth Form as one
  // multi-valued field mixing SILHOUETTE (Conical, Rounded) with ORIENTATION (Erect,
  // Prostrate), so the value decides the axis.
  //
  // These were discarded as "near-constant for trees, no discriminating signal." Jacob:
  // "It's *nearly* universal; and in 1 example we found a variant." That is the argument.
  // A near-universal trait WITH variants carries no information for the 99% and ALL of it
  // for the one row that matters — judging the axis by its average is the same error shape
  // as a fallback, cheapest exactly where it is wrong. We found the variant (Juniperus
  // horizontalis, prostrate) in the first place we looked, off a roster of 20 street trees.
  //
  // ⛔ Recorded, NOT matched: chassis.orientation is deliberately absent from matcher.js
  // MATCH_AXES. Scoring every tree on a value they nearly all share would dilute the axes
  // that discriminate. Capture now, match if and when the roster grows past tree form.
  'chassis.habit': {
    erect: { axis: 'chassis.orientation', value: 'erect' },
    'semi erect': { axis: 'chassis.orientation', value: 'semi-erect' },
    decumbent: { axis: 'chassis.orientation', value: 'decumbent' },
    prostrate: { axis: 'chassis.orientation', value: 'prostrate' },
    creeping: { axis: 'chassis.orientation', value: 'prostrate' },
    trailing: { axis: 'chassis.orientation', value: 'prostrate' },
    climbing: { axis: 'chassis.orientation', value: 'climbing' },
    vining: { axis: 'chassis.orientation', value: 'climbing' },
    // Spread behaviour — same argument, same field. A thicket-forming sumac or a suckering
    // aspen is a different object to place than a single-crown oak.
    colonizing: { axis: 'chassis.spread', value: 'colonizing' },
    'thicket forming': { axis: 'chassis.spread', value: 'thicket-forming' },
    rhizomatous: { axis: 'chassis.spread', value: 'rhizomatous' },
    stoloniferous: { axis: 'chassis.spread', value: 'stoloniferous' },
    suckering: { axis: 'chassis.spread', value: 'suckering' },
    // ⭐ `Dense` — the harvest session discarded this, reasoning that NCSU's Habit/Form
    // `Dense` is a crown-FORM tag while USDA's Foliage Porosity is a 3-point measurement,
    // and folding two scales under one axis makes the axis meaningless. That was right
    // BEFORE Jacob's publish-the-disagreement ruling, because someone had to decide
    // whether NCSU's "Dense" means USDA's "Dense" — a calibration question with no
    // answer available to us.
    // ⭐⭐ That ruling dissolves it. We no longer have to decide: both land on
    // chassis.density as candidates carrying their source, and if they disagree the cell
    // is CONTESTED and the operator settles it. Discarding real data to avoid a judgment
    // call we are no longer required to make is the wrong trade.
    dense: { axis: 'chassis.density', value: 'dense' },
    open: { axis: 'chassis.density', value: 'sparse' },
  },
  'leaf.shape': {
    'palmately lobed': { axis: 'leaf.margin', value: 'lobed' },
    'pinnately lobed': { axis: 'leaf.margin', value: 'lobed' },
    lobed: { axis: 'leaf.margin', value: 'lobed' },
    // NC State's precise lobing depths. `-fid` = cut toward the middle, `-sect` = cut to
    // the midrib. Both are LOBING, which our taxonomy keeps on the margin axis; the depth
    // itself is a distinction we do not model and deliberately flatten.
    palmatifid: { axis: 'leaf.margin', value: 'lobed' },
    palmasect: { axis: 'leaf.margin', value: 'lobed' },
    pinnatifid: { axis: 'leaf.margin', value: 'lobed' },
    pinnatisect: { axis: 'leaf.margin', value: 'lobed' },
    'pinnately compound': { axis: 'leaf.type', value: 'compound-pinnate' },
    'bipinnately compound': { axis: 'leaf.type', value: 'compound-bipinnate' },
    'palmately compound': { axis: 'leaf.type', value: 'compound-palmate' },
  },
}

// ⛔ NOT A TRAIT. Values a source publishes under a heading we mapped, that carry no
// morphology at all — NC State's `Plant Type` is a multi-valued CATEGORY tag where only
// `Deciduous` is a foliage fact. These are DISCARDED WITH A COUNTED REASON, never
// silently: the hydrator prints them, so a mismapped field still shows up loudly.
export const NOT_A_TRAIT = {
  'leaf.foliage_type': {
    'native plant': 'ncsu category tag', perennial: 'ncsu category tag',
    edible: 'ncsu category tag', poisonous: 'ncsu category tag',
    shrub: 'ncsu category tag', tree: 'ncsu category tag',
    herb: 'ncsu category tag', vine: 'ncsu category tag',
    wildflower: 'ncsu category tag', 'ground cover': 'ncsu category tag',
    weed: 'ncsu category tag', 'native plant tree': 'ncsu category tag',
    no: 'usda Leaf Retention Y/N — not a foliage class',
    yes: 'usda Leaf Retention Y/N — not a foliage class',
  },
  'chassis.habit': {
    'single stem': 'trunk COUNT, not crown form — complement of multi-stem',
    'single crown': 'trunk COUNT, not crown form — complement of multi-stem',
    'single trunk': 'trunk COUNT, not crown form — complement of multi-stem',
    // ⛔ DELIBERATELY UNMAPPABLE — and it belongs HERE, not in the unresolved list.
    // `Erect` is an ORIENTATION (USDA: Climbing/Decumbent/Erect/Prostrate/Semi-Erect),
    // and NCSU ships `Erect` AND `Columnar` as separate options in the same field. It was
    // aliased to `columnar` and wrote that into red oak at tol 0.
    // Listing it as unresolved made a settled decision look like owed alias work, 20x per
    // run — which is precisely how someone re-adds the alias in six months. Discarded with
    // a reason instead. See the no-`erect`-row note in TERM_ALIASES above.
    // (orientation terms moved to their own axis — see TERM_REDIRECTS chassis.orientation)
  },
}

/** The rubric's terms for an axis, or [] if the axis is unknown. */
export function axisTerms(axisId) { return loadAxes().get(axisId) || [] }

/**
 * Resolve a TERM onto its axis's closed vocabulary.
 * @returns {{value:string, resolved:boolean, via:string}}
 */
/**
 * Candidate singulars for a normalized word. Conservative on purpose: the caller only
 * accepts a candidate that is an exact term, so an over-eager guess costs nothing, but a
 * wrong REWRITE would. Applies to the last word only — "compound leaves" keeps its head.
 */
function depluralize(n) {
  const parts = n.split(' ')
  const w = parts[parts.length - 1]
  const stems = []
  if (/ies$/.test(w)) stems.push(w.slice(0, -3) + 'y')
  if (/(ches|shes|sses|xes|zes)$/.test(w)) stems.push(w.slice(0, -2))
  if (/s$/.test(w) && !/ss$/.test(w)) stems.push(w.slice(0, -1))
  return stems.map(st => [...parts.slice(0, -1), st].join(' '))
}

export function resolveTerm(axisId, raw) {
  const terms = axisTerms(axisId)
  const n = normalize(raw)
  if (!n) return { value: raw, resolved: false, via: 'empty' }
  const byNorm = new Map(terms.map(t => [normalize(t), t]))
  if (byNorm.has(n)) return { value: byNorm.get(n), resolved: true, via: 'exact' }
  // ⭐ PLURALS ARE A CLASS, NOT AN ALIAS. Sources publish "Follicles", "Samaras",
  // "Scales" against our singular terms. Adding one alias per plural is an instance
  // patch that town #2 never benefits from; depluralize once, here, and only accept
  // the result when the singular is an EXACT term -- no fuzzy widening.
  for (const sing of depluralize(n)) {
    if (byNorm.has(sing)) return { value: byNorm.get(sing), resolved: true, via: 'plural' }
  }

  const alias = TERM_ALIASES[axisId]?.[n]
  if (alias && byNorm.has(normalize(alias))) {
    return { value: byNorm.get(normalize(alias)), resolved: true, via: 'alias' }
  }
  // A descriptor often CONTAINS the term ("smooth grey-brown bark").
  for (const t of terms) {
    const tn = normalize(t)
    if (tn && new RegExp(`\\b${tn.replace(/[-\s]/g, '[-\\s]')}\\b`).test(n)) {
      return { value: t, resolved: true, via: 'contains' }
    }
  }
  for (const [aliasWord, target] of Object.entries(TERM_ALIASES[axisId] || {})) {
    if (new RegExp(`\\b${aliasWord.replace(/\s/g, '\\s')}\\b`).test(n) && byNorm.has(normalize(target))) {
      return { value: byNorm.get(normalize(target)), resolved: true, via: 'alias-contains' }
    }
  }
  return { value: raw, resolved: false, via: 'unresolved' }
}

// ── SPECIES names ───────────────────────────────────────────────────────────
// Seeded from what the repo already knows: every dossier carries `key`,
// `scientific` and `inventoryNames`, and roster-name-canon.json carries the
// operator's hand merges. ⛔ Hand rows WIN.
let _speciesIndex = null
function speciesIndex() {
  if (_speciesIndex) return _speciesIndex
  const byKey = new Map()      // candidate key -> canonical
  const canonical = new Map()  // canonical -> { canonical, aliases:Set }
  const add = (canon, alias) => {
    if (!canon || !alias) return
    if (!canonical.has(canon)) canonical.set(canon, { canonical: canon, aliases: new Set() })
    canonical.get(canon).aliases.add(String(alias))
    for (const k of keysFor(alias)) if (!byKey.has(k)) byKey.set(k, canon)
  }
  const dossierDir = path.join(ROOT, 'arborist', 'dossiers')
  if (existsSync(dossierDir)) {
    for (const f of readdirSync(dossierDir).filter(x => x.endsWith('.json'))) {
      const d = readJSON(path.join(dossierDir, f))
      if (!d) continue
      const canon = d.key || d.canonicalId || f.replace(/\.json$/, '')
      add(canon, canon)
      add(canon, d.canonicalId)
      add(canon, d.scientific)
      add(canon, f.replace(/\.json$/, ''))
      for (const inv of d.inventoryNames || []) add(canon, inv)
    }
  }
  // ⭐ THE COMPOSITION DIRECTORIES ARE A NAME STORE TOO. `arborist/state/<id>/` is keyed by the
  // ROSTER slug (`maple_red`) while the dossier is keyed by the common name (`Red Maple`) and
  // the scientific one (`Acer rubrum`). Seed from it as well and the merge pass unifies them —
  // `maple_red` and `Red Maple` share the token key `maple red`.
  // ⛔ Without this a COMPOSED species reports `unauthored`, because the lookup never finds the
  // directory holding its recipe. Measured: composed 9 → 8 with this missing.
  const stateDir = path.join(ROOT, 'arborist', 'state')
  if (existsSync(stateDir)) {
    for (const d of readdirSync(stateDir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('_')) continue
      if (!existsSync(path.join(stateDir, d.name, 'compositions.json'))) continue
      add(d.name, d.name)
    }
  }

  // Operator hand-merges LAST so they overwrite anything derived.
  const canonFile = readJSON(path.join(ROOT, 'arborist', 'roster-name-canon.json'))
  for (const [raw, target] of Object.entries(canonFile?.canon || {})) {
    for (const k of keysFor(raw)) byKey.set(k, target)
    add(target, target); add(target, raw)
  }
  // ⭐⭐ THE MERGE PASS — this is the ≡ the module exists for.
  // Two canonicals that share ANY key are one tree. Without this the resolver
  // faithfully reproduces the twin problem it was built to fix: the operator's
  // canon table says `Oak, Pin` while the dossier key says `Pin Oak`, and
  // "oak pin" is the normalised form of one AND the word-order key of the other.
  // Union them, then pick ONE representative.
  const parent = new Map()
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b) }
  for (const c of canonical.keys()) parent.set(c, c)
  const seen = new Map()   // key -> first canonical that claimed it
  for (const [canon, rec] of canonical) {
    for (const alias of rec.aliases) {
      for (const k of keysFor(alias)) {
        if (seen.has(k)) union(seen.get(k), canon)
        else seen.set(k, canon)
      }
    }
  }
  // Representative: prefer the operator's hand-canon target, else the longest
  // (most specific) name, so a merge never silently demotes curation.
  const handTargets = new Set(Object.values(readJSON(path.join(ROOT, 'arborist', 'roster-name-canon.json'))?.canon || {}))
  const groups = new Map()
  for (const c of canonical.keys()) {
    const r = find(c)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(c)
  }
  const merged = new Map()
  for (const members of groups.values()) {
    // ⭐ THE REPRESENTATIVE IS WHAT THE OPERATOR SEES, so it must be the COMMON NAME.
    // `ORIENTATION §2`: "A species' identity, everywhere the operator can see it, is its common
    // name… Botanical slugs are SUPPLY-SIDE METADATA — provenance on a part, never a name on a
    // surface." ⛔ Picking the LONGEST string made `acer_saccharum` beat `Sugar Maple`, which is
    // exactly the inversion that doctrine forbids.
    // Order: the operator's hand-canon target · a human common name (has a space, no underscore)
    // · anything without an underscore · longest.
    const humanish = (m) => /\s/.test(m) && !/_/.test(m)
    const rep = members.find(m => handTargets.has(m))
      || members.find(humanish)
      || members.find(m => !/_/.test(m))
      || members.slice().sort((a, b) => b.length - a.length)[0]
    const aliases = new Set()
    for (const m of members) for (const a of canonical.get(m).aliases) aliases.add(a)
    merged.set(rep, { canonical: rep, aliases, mergedFrom: members })
    for (const a of aliases) for (const k of keysFor(a)) byKey.set(k, rep)
  }

  _speciesIndex = { byKey, canonical: merged }
  return _speciesIndex
}

/** Drop the memoised index (tests / after an operator edit). */
export function reloadVocabulary() { _speciesIndex = null }

/**
 * Resolve a species NAME to its canonical form.
 * @returns {{value:string, resolved:boolean, via:string}}
 */
export function resolveSpecies(raw) {
  const { byKey } = speciesIndex()
  if (raw == null || normalize(raw) === '') return { value: raw, resolved: false, via: 'empty' }
  const n = normalize(raw), t = tokenKey(raw)
  if (byKey.has(n)) return { value: byKey.get(n), resolved: true, via: 'name' }
  if (byKey.has(t)) return { value: byKey.get(t), resolved: true, via: 'word-order' }
  return { value: raw, resolved: false, via: 'unresolved' }
}

/**
 * Every name known for a canonical — the merged alias set.
 * ⭐ Needed because a species is keyed DIFFERENTLY in different stores: the dossier says
 * `Sugar Maple`, the state directory says `maple_sugar`. A consumer holding one must be able
 * to find the other, or it silently stops matching.
 */
export function aliasesFor(canonical) {
  const { canonical: recs } = speciesIndex()
  const rec = recs.get(canonical)
  return rec ? [...rec.aliases] : [String(canonical)]
}

/**
 * Do two names denote the same species IN OUR ROSTER VOCABULARY? The ≡ this module
 * exists for — it reasons over the census alias graph, so operator curation wins.
 * ⛔ For "did the database return the binomial I asked for?", use `verifyTaxon`;
 * that is nomenclature, not our aliases, and the two deliberately disagree.
 */
export function sameSpecies(a, b) {
  const ra = resolveSpecies(a), rb = resolveSpecies(b)
  if (ra.resolved && rb.resolved) return ra.value === rb.value
  return tokenKey(a) === tokenKey(b) && tokenKey(a) !== ''
}


// ── BOTANICAL NOMENCLATURE — a different question from `sameSpecies` ─────────
/**
 * Parse a scientific name into its parts. Tolerant of what the databases
 * actually return: HTML italics, `&times;` with or without its semicolon,
 * authorities, infraspecific ranks and quoted cultivars.
 */
function parseBinomial(raw) {
  let s = String(raw ?? '')
  s = s.replace(/<[^>]+>/g, ' ')                                  // USDA italicises
  s = s.replace(/&times;?|&#0*215;?|&#x0*d7;?/gi, ' × ')          // SelecTree omits the ;
  s = s.replace(/&nbsp;?/gi, ' ').replace(/&amp;?/gi, '&')
  s = stripAccents(s).replace(/\s+/g, ' ').trim()

  const cultivar = (s.match(/['"’]([^'"’]+)['"’]/) || [])[1] || null
  s = s.replace(/['"’][^'"’]*['"’]/g, ' ')                        // cultivar out of the way
  s = s.replace(/\[[^\]]*\]/g, ' ')                               // [rubrum × saccharinum]
  s = s.replace(/\s+/g, ' ').trim()

  const toks = s.split(' ').filter(Boolean)
  let i = 0, hybrid = false
  const isMark = (t) => /^[×x]$/i.test(t)
  if (toks[i] && isMark(toks[i])) { hybrid = true; i++ }          // ×Cupressocyparis
  let genus = toks[i++] || ''
  if (/^×/.test(genus)) { hybrid = true; genus = genus.slice(1) }

  if (toks[i] && isMark(toks[i])) { hybrid = true; i++ }          // Acer × freemanii
  let epithet = toks[i] || ''
  if (/^×/.test(epithet)) { hybrid = true; epithet = epithet.slice(1) }
  // An epithet is lowercase by convention; an uppercase token here is the authority.
  if (!epithet || !/^[a-z][a-z-]*$/.test(epithet)) epithet = ''
  else i++

  let infraspecific = null
  const RANK = /^(var|subsp|ssp|f|forma|cv)\.?$/i
  while (toks[i] && RANK.test(toks[i]) && toks[i + 1]) { infraspecific = toks[i + 1].toLowerCase(); i += 2 }

  const authority = toks.slice(i).join(' ').trim() || null
  return { genus: genus.toLowerCase(), epithet, hybrid, infraspecific, cultivar, authority }
}

/**
 * Is the record a database returned actually the taxon we asked it for?
 *
 * ⛔ THIS IS NOT `sameSpecies`, AND THE TWO MUST NOT BE MERGED. `sameSpecies`
 * asks whether two NAMES denote the same tree in OUR roster vocabulary, over the
 * census alias graph — it will happily tell you `Birch` ≡ `betula_nigra`, because
 * the operator's curation says so. This asks a question about BOTANICAL
 * NOMENCLATURE: did the record that came back carry the binomial we requested?
 * Nomenclature would refuse `Birch` ≡ `Betula nigra`. The answers legitimately
 * diverge, and collapsing them is a category error.
 *
 * ⭐ WHY IT EXISTS. A database key is a guess until the returned NAME confirms it.
 * USDA PLANTS symbol `TICO` is *Tiarella cordifolia*, a foamflower — not *Tilia
 * cordata*. Nothing rejected it; a linden was one call away from being described
 * by a herb's traits, on axes the operator cannot eyeball.
 *
 * ⛔ NOT A BOOLEAN, deliberately. A strict genus+epithet test rejects things that
 * are fine — `Acer freemanii` against `Acer ×freemanii`, or a database more
 * current than our dossier. A boolean forces a choice between letting TICO
 * through and rejecting real hybrids, so the verdict names WHAT differed and the
 * caller decides. Precedence, strongest first: mismatch › hybrid-mark ›
 * authority-only › exact; `reason` carries the rest when more than one applies.
 *
 * ⚠️ `returnedRank` is advisory and does NOT change the verdict. A cultivar on the
 * returned side is nomenclaturally consistent but a real hazard: SelecTree's top
 * hit for *Acer rubrum* was `'Armstrong'`, which is Columnar where the species is
 * not — a cultivar-specific silhouette on a hard identity axis. Callers taking
 * morphology should treat a non-null `returnedRank` as a reason to look again.
 *
 * @returns {{match:'exact'|'hybrid-mark'|'authority-only'|'mismatch',
 *            queried:string, returned:string, reason:string,
 *            returnedRank:{cultivar:string|null,infraspecific:string|null}|null}}
 */
export function verifyTaxon(queried, returned) {
  const q = parseBinomial(queried), r = parseBinomial(returned)
  const out = (match, reason) => ({
    match, reason,
    queried: String(queried ?? ''), returned: String(returned ?? ''),
    returnedRank: (r.cultivar || r.infraspecific)
      ? { cultivar: r.cultivar, infraspecific: r.infraspecific } : null,
  })

  if (!q.genus || !r.genus) return out('mismatch', 'a name is empty or unparseable')
  if (q.genus !== r.genus) return out('mismatch', `genus differs: "${q.genus}" vs "${r.genus}"`)
  // A genus-only query cannot disagree on an epithet it never had.
  if (q.epithet && r.epithet && q.epithet !== r.epithet) {
    return out('mismatch', `epithet differs: "${q.epithet}" vs "${r.epithet}"`)
  }
  if (q.epithet && !r.epithet) return out('mismatch', `returned no epithet for "${q.epithet}"`)

  const notes = []
  if (!q.epithet && !r.epithet) notes.push('genus-level on both sides')
  else if (!q.epithet) notes.push(`genus-level query matched "${r.epithet}"`)
  if (r.cultivar) notes.push(`returned a cultivar '${r.cultivar}'`)
  if (r.infraspecific && r.infraspecific !== q.infraspecific) notes.push(`returned ${r.infraspecific} below species`)

  const hybridDiffers = q.hybrid !== r.hybrid
  const authorityDiffers = (q.authority || null) !== (r.authority || null)
  const tail = notes.length ? ` (${notes.join('; ')})` : ''

  if (hybridDiffers) {
    return out('hybrid-mark',
      `same binomial; × present on ${r.hybrid ? 'the returned' : 'the queried'} side only${tail}`)
  }
  if (authorityDiffers) {
    return out('authority-only',
      `same binomial; authority ${r.authority ? `"${r.authority}" on the returned side` : 'dropped'}${tail}`)
  }
  return out('exact', `genus and epithet agree${tail}`)
}

/** Free-text search over every known alias — what the species search bar wants. */
export function searchSpecies(query, limit = 20) {
  const q = normalize(query)
  if (!q) return []
  const { canonical } = speciesIndex()
  const hits = []
  for (const rec of canonical.values()) {
    for (const a of rec.aliases) {
      const an = normalize(a)
      if (an === q) { hits.push({ canonical: rec.canonical, matched: a, score: 3 }); break }
      if (an.startsWith(q)) { hits.push({ canonical: rec.canonical, matched: a, score: 2 }); break }
      if (an.includes(q) || tokenKey(a).includes(tokenKey(q))) { hits.push({ canonical: rec.canonical, matched: a, score: 1 }); break }
    }
  }
  return hits.sort((x, y) => y.score - x.score || x.canonical.localeCompare(y.canonical)).slice(0, limit)
}
