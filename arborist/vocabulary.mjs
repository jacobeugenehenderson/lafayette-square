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
const TERM_ALIASES = {
  "chassis.habit": {
    conical: 'pyramidal', conic: 'pyramidal', 'pyramidal conical': 'pyramidal',
    fastigiate: 'columnar', upright: 'columnar', erect: 'columnar',
    globose: 'rounded', globular: 'rounded', round: 'rounded', ball: 'rounded',
    ovoid: 'oval', elliptic: 'oval', elliptical: 'oval', egg: 'oval',
    'v shaped': 'vase', vaselike: 'vase', urn: 'vase',
    horizontal: 'spreading', wide: 'spreading', broad: 'spreading', umbrella: 'spreading',
    pendulous: 'weeping', pendent: 'weeping', drooping: 'weeping',
    clumping: 'multi-stem', multistem: 'multi-stem', 'multi stem': 'multi-stem',
    clump: 'multi-stem', asymmetric: 'irregular', open: 'irregular',
  },
  'bark.type': {
    striate: 'ridged', striated: 'ridged', grooved: 'ridged', fissured: 'furrowed',
    corrugated: 'furrowed', blocky: 'plated', platy: 'plated', plates: 'plated',
    flaking: 'exfoliating', peeling: 'exfoliating', papery: 'exfoliating',
    shaggy: 'exfoliating', stringy: 'fibrous', shreddy: 'fibrous',
    patchy: 'mottled', camouflage: 'mottled', blotchy: 'mottled',
    glabrous: 'smooth', tight: 'smooth',
  },
  'leaf.silhouette': {
    'palmately lobed': 'lobed', 'bristle lobed': 'lobed', 'deeply lobed': 'lobed',
    maple: 'palmate', 'palmately compound': 'palmate',
    cordate: 'heart', 'heart shaped': 'heart',
    oval: 'ovate', egg: 'ovate', elliptic: 'ovate',
    lance: 'lanceolate', linear: 'lanceolate', narrow: 'lanceolate',
    pinnate: 'compound', 'pinnately compound': 'compound', bipinnate: 'compound',
    fanshaped: 'fan', flabellate: 'fan',
    needles: 'needle', acicular: 'needle',
    scalelike: 'scale', 'scale like': 'scale', imbricate: 'scale',
  },
  'leaf.ways': {
    alternating: 'alternate', spiral: 'alternate', 'sub opposite': 'opposite',
    whorled: 'clusters', clustered: 'clusters', fascicled: 'clusters',
    spray: 'sprays', frond: 'sprays', 'one direction': 'all-one-direction',
  },
}

/** The rubric's terms for an axis, or [] if the axis is unknown. */
export function axisTerms(axisId) { return loadAxes().get(axisId) || [] }

/**
 * Resolve a TERM onto its axis's closed vocabulary.
 * @returns {{value:string, resolved:boolean, via:string}}
 */
export function resolveTerm(axisId, raw) {
  const terms = axisTerms(axisId)
  const n = normalize(raw)
  if (!n) return { value: raw, resolved: false, via: 'empty' }
  const byNorm = new Map(terms.map(t => [normalize(t), t]))
  if (byNorm.has(n)) return { value: byNorm.get(n), resolved: true, via: 'exact' }
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

/** Do two names denote the same species? The ≡ this module exists for. */
export function sameSpecies(a, b) {
  const ra = resolveSpecies(a), rb = resolveSpecies(b)
  if (ra.resolved && rb.resolved) return ra.value === rb.value
  return tokenKey(a) === tokenKey(b) && tokenKey(a) !== ''
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
