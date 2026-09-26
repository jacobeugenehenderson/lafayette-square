/**
 * ingest-tagger.js — the auto-tagger half of conform-and-tag-on-ingest
 * (Forest Builder Stage 1A, FOREST-BUILDER-KIT-MATCHER.md §4).
 *
 * PURE (no I/O): given a part's raw metadata, draft the rubric values it can,
 * each stamped {value, ratified, confidence, source}. The auto-tag is a DRAFT
 * the operator ratifies, NEVER gospel (feedback_proxy_render_is_not_the_operator_eye).
 * Every value is vocab-normalized through rubric.json so the three sources
 * (authored / lidar / procedural) feed the ONE vocabulary (§11 unified findability).
 *
 * The auto-vs-ratify boundary is the rubric's per-axis `tagging` (the §15.2
 * accepted decision): size / leaf.silhouette / leaf.size = high-auto; habit /
 * bark.type = low draft-then-ratify; bark.color = sample-pending; leaf.ways +
 * overlay = never auto. A curation displayName is the one real human signal and
 * overrides the noisy habit draft (ratified:true, high).
 *
 * Consumed by ingest.js (the orchestrator). rubric.json + dossiers are ratified
 * and read-only here; leaf-pack-bindings.json / roster-coverage.js are untouched.
 *
 * ⛔⛔ 2026-08-25 — THIS FILE IS A STORE OF AXIS IDS AND THE 19→31 CUTOVER MISSED IT.
 * `cutover-taxonomy.mjs` migrated rubric.json, dossiers/ and part-index.json — the
 * ARTIFACTS — and never the PRODUCER. This file still wrote `bark.type`,
 * `leaf.silhouette` and `leaf.size`, none of which the rubric carries, so
 * `claims-axis-keys-resolve` read the migrated artifact and said PASS while
 * **re-running ingest.js would have reverted the cutover for all 266 parts.**
 * Neither dead id threw. Both degraded into a plausible-looking wrong answer, and the
 * bark one is the worse kind of wrong: with `bark.type` gone the lookup returned
 * undefined and every part fell to the else branch writing
 * `"barkDirMap(X) unassigned — needs ratify"` — a CONFIDENT FALSE CAUSE. The dirs are
 * assigned; the axis moved. Someone reading that goes and ratifies what was never broken.
 *
 * ⭐ Fixed by deleting the second vocabulary rather than renaming keys. `normalizeVocab`
 * was a parallel resolver reading rubric-embedded `vocabNormalization`, and it could not
 * express the thing the cutover made necessary: `leaf.silhouette` split across
 * shape/type/margin, so THE VALUE DECIDES THE AXIS (`cordate`→shape, `compound-pinnate`
 * →type). vocabulary.mjs already does exactly that. One resolver, not two.
 */
import { resolveTerm, TERM_REDIRECTS, normalize } from './vocabulary.mjs'

/**
 * Resolve one raw token to {axis, value} using THE shared vocabulary, honouring the
 * value-decides-the-axis redirects. Returns null when nothing resolves — ⛔ never a guess.
 */
function resolveTagged(axisId, raw) {
  if (raw == null || raw === '') return null
  const nv = normalize(raw)
  const redir = TERM_REDIRECTS[axisId]?.[nv]
  if (redir) return { axis: redir.axis, value: redir.value, via: 'redirect' }
  const r = resolveTerm(axisId, raw)
  return r.resolved ? { axis: axisId, value: r.value, via: r.via } : null
}

// ── vocabulary normalization ────────────────────────────────────────────────
// Map a raw source token to the canonical rubric value for an enum axis, using
// the axis's own vocabNormalization + aliases + values. Honest about misses.
export function normalizeVocab(rubric, axisId, raw) {
  if (raw == null) return { value: null, known: false }
  const axis = rubric.axes.find(a => a.id === axisId)
  if (!axis || !axis.values) return { value: raw, known: true } // not an enum axis
  const values = new Set(axis.values)
  const token = String(raw).trim()
  if (values.has(token)) return { value: token, known: true }
  // vocabNormalization (cordate→heart, pinnate→compound, papery→exfoliating, …)
  const norm = axis.vocabNormalization && axis.vocabNormalization[token]
  if (norm && values.has(norm)) return { value: norm, known: true, normalizedFrom: token }
  // aliases (leaf.ways: scattered→alternate, mirrored→opposite, …)
  if (axis.aliases) {
    for (const [canon, aliasList] of Object.entries(axis.aliases)) {
      if (aliasList.includes(token) && values.has(canon)) return { value: canon, known: true, normalizedFrom: token }
    }
  }
  return { value: null, known: false, unresolved: token } // honest miss — not in vocab
}

const tag = (value, confidence, source, ratified = false, extra = {}) =>
  ({ value, ratified, confidence, source, ...extra })

// ── chassis ─────────────────────────────────────────────────────────────────
// Habit aspect is NOT in the conformed meta (canopyRadiusM is a publish-time
// field, tree-bounds.js), so the bbox-aspect draft is height-only/weak. We seed
// habit from the chassis's OWN declared source.species (the vendor's botanical
// claim — a defensible low-confidence draft), and let a curation displayName
// (the real human signal) override it ratified-high.
const SPECIES_HABIT = {
  acer_saccharum: 'oval', acer_saccharum_lowpoly: 'oval', acer_saccharum_procedural: 'oval',
  acer_rubrum: 'oval', acer_saccharinum: 'spreading',
  platanus_acerifolia: 'spreading', platanus_occidentalis: 'spreading',
  gleditsia_triacanthos: 'spreading',
  tilia_americana: 'oval', american_linden: 'oval',
  quercus_alba: 'rounded', quercus_palustris: 'pyramidal', quercus_winter_fall: 'rounded',
  betula_pendula: 'multi-stem', betula_nigra: 'multi-stem',
  populus_canescens: 'columnar', populus: 'columnar',
  cupressus_sempervirens: 'columnar', callitropsis_nootkatensis: 'pyramidal',
  blue_spruce_winter: 'pyramidal', pinus_sp: 'pyramidal',
  salix_alba: 'weeping', salix_babylonica: 'weeping', willow_stylized: 'weeping',
  nyssa_sylvatica: 'pyramidal', magnolia_sp: 'oval', liquidambar_styraciflua: 'pyramidal',
  taxodium_distichum: 'pyramidal', cercis_canadensis: 'multi-stem', malus_prairifire: 'rounded',
}

// A curation displayName that names a habit-bearing species → habit (ratified).
const DISPLAYNAME_HABIT = {
  'weeping willow': 'weeping', 'red maple': 'oval', 'maple': 'oval', 'sugar maple': 'oval',
  'silver maple': 'spreading', 'european linden': 'oval', 'american linden': 'oval',
  'pin oak': 'pyramidal', 'white oak': 'rounded', 'honey locust': 'spreading',
  'redbud': 'multi-stem', 'river birch': 'multi-stem', 'bald cypress': 'pyramidal',
}

export function tagChassis(rubric, meta, curationEntry) {
  const tags = {}
  // size — heightRange is the conformed bbox height (Y-min 0 contract). high/auto.
  if (Array.isArray(meta.heightRange)) {
    const h = +(meta.heightRange[1] - meta.heightRange[0]).toFixed(2)
    tags['chassis.size'] = tag(h, 'high', 'tree-bounds(heightRange)', false)
  }
  // habit — displayName (ratified human signal) wins; else species-botany draft.
  const dn = curationEntry && curationEntry.displayName && curationEntry.displayName.trim().toLowerCase()
  // ⭐ THE VALUE DECIDES THE AXIS, as for leaves: `multi-stem` left chassis.habit for
  // chassis.trunks on 2026-08-25, and the cutover migrated the part-index, not this producer —
  // so the first real re-import wrote the dead value back (claims-axis-keys-resolve went red).
  const put = (raw, confidence, source, ratified) => {
    const hit = resolveTagged('chassis.habit', raw)
    tags[hit ? hit.axis : 'chassis.habit'] = tag(hit ? hit.value : null, confidence,
      hit ? `${source}${hit.via === 'redirect' ? `(${raw}→${hit.axis})` : ''}` : `${source} — "${raw}" is no live habit`, ratified)
  }
  const sp = meta.source && meta.source.species
  if (dn && DISPLAYNAME_HABIT[dn]) put(DISPLAYNAME_HABIT[dn], 'high', `curation.displayName("${curationEntry.displayName}")`, true)
  else if (sp && SPECIES_HABIT[sp]) put(SPECIES_HABIT[sp], 'low', `source.species-botany(${sp})`, false)
  else tags['chassis.habit'] = tag(null, 'low', 'undetermined — no aspect at ingest, no species map', false)
  return tags
}

// ── leaf ────────────────────────────────────────────────────────────────────
export function tagLeaf(rubric, packMeta) {
  const tags = {}
  // ⭐ THE VALUE DECIDES THE AXIS. The cutover split `leaf.silhouette` into
  // shape / type / margin, and pack morphology is a single token that may be any of them
  // (`cordate` is a shape, `compound-pinnate` is a type). The old normalizeVocab could
  // not express that and wrote everything back under one dead key.
  // ⛔ …and the comment above said so while the code only asked leaf.shape (+ its redirects),
  // so `compound-pinnate` — an exact leaf.type value — tagged nothing, and a black locust
  // ranked a simple elm leaf over the one compound pack (2026-09-25). Ask each leaf axis.
  const hit = ['leaf.shape', 'leaf.type', 'leaf.margin'].map(a => resolveTagged(a, packMeta.morphology)).find(Boolean)
  if (hit) {
    tags[hit.axis] = tag(hit.value, 'high',
      `pack-meta.morphology${hit.via === 'redirect' ? `(${packMeta.morphology}→${hit.axis})` : ''}`, false)
  } else {
    tags['leaf.shape'] = tag(null, 'low',
      `pack-meta.morphology(${packMeta.morphology}) — no leaf shape, type or margin (season/variant pack?)`, false)
  }
  if (packMeta.naturalSize != null) {
    // `leaf.size` became `leaf.length`, and the rubric declares it cm — which is what
    // pack-meta already publishes, so no conversion.
    tags['leaf.length'] = tag(packMeta.naturalSize, 'high', 'pack-meta.naturalSize(cm)', false)
  }
  // leaf.ways is human-only — never auto-tagged (not in the card geometry).
  return tags
}

// ── bark ────────────────────────────────────────────────────────────────────
// barkDirMap (rubric, ratified) seeds Bark0NN → type; bark.color needs an image
// decoder we don't run this stage → honest null, source 'texture-sample-pending'.
export function tagBark(rubric, barkId) {
  const tags = {}
  // ⚠️ `barkDirMap` moved to bark.texture with the cutover. Looking it up on the dead
  // `bark.type` returned undefined and manufactured the false "unassigned" cause above.
  const barkAxis = rubric.axes.find(a => a.id === 'bark.texture')
  const mapEntry = barkAxis && barkAxis.barkDirMap && barkAxis.barkDirMap[barkId]
  const typeWord = mapEntry && /^([a-z]+)/.exec(mapEntry)
  if (typeWord && typeWord[1] !== 'unassigned') {
    const hit = resolveTagged('bark.texture', typeWord[1])
    tags['bark.texture'] = hit
      ? tag(hit.value, 'low', `rubric.barkDirMap(${barkId})`, false)
      : tag(null, 'low', `barkDirMap(${barkId})→${typeWord[1]} not in vocab`, false)
  } else {
    tags['bark.texture'] = tag(null, 'low', `barkDirMap(${barkId}) unassigned — needs ratify`, false)
  }
  tags['bark.color'] = tag(null, 'low', 'texture-sample-pending (no decoder this stage)', false)
  return tags
}

// ── plate labels (the Arborist's plate shelf, BRIEF-arborist-fashion-plates §1) ──
// A plate names the species or genus it came from, with the evidence, or says why it
// cannot. Facts only — read off the part's own metadata and the library's own names; the
// habit is drafted from a DOSSIER when the species has one (dossiers are the kit's
// sourced traits), never from a hand table of species. Everything here is `ratified:false`.
const sciOf = (indexSpecies, id) => (indexSpecies.find(s => s.species === id)?.scientific) || null
const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '')
function speciesLabel(id, indexSpecies, why0) {
  if (!id) return { species: null, genus: null, scientific: null, why: why0 || 'no species recorded on the part', ratified: false }
  const scientific = sciOf(indexSpecies, id)
  if (!scientific) return { species: id, genus: null, scientific: null, why: `library entry "${id}" carries no scientific name (generic or stylised asset)`, ratified: false }
  const [genus, epithet] = scientific.split(/\s+/)
  const genusLevel = !epithet || /^(sp|spp)\.?$/i.test(epithet) || /[×x]/.test(epithet)
  return { species: genusLevel ? null : id, genus, scientific, evidence: genusLevel ? 'genus' : 'species', source: `meta → index.json#species(${id})`, ratified: false }
}

/** Chassis: species/genus from `meta.source.species`; habit drafted from that species' dossier. */
export function labelChassis(meta, indexSpecies, dossiers) {
  const lab = speciesLabel(meta?.source?.species, indexSpecies, 'meta.source.species is empty')
  const d = lab.scientific && (dossiers[slug(lab.scientific)] || dossiers[meta.source.species])
  const habit = d?.required?.['chassis.habit']
  lab.habitFromDossier = habit?.target ?? null
  if (lab.habitFromDossier) lab.habitSource = `dossier(${d.id || slug(lab.scientific)})`
  return lab
}

/** Leaf pack: the species it was made for (pack meta `recommendedSpecies`, binomial slugs). */
export function labelLeaf(packMeta) {
  const rec = (packMeta?.recommendedSpecies || []).filter(Boolean)
  if (!rec.length) return { species: null, genus: null, why: 'pack meta names no species (a shape pack)', ratified: false }
  const genera = [...new Set(rec.map(r => r.split('_')[0]))]
  return { species: rec, genus: genera.length === 1 ? genera[0] : null, genera, evidence: 'recommendedSpecies', source: 'pack meta.recommendedSpecies', ratified: false }
}

/** Bark: the species it was photographed from, when its own meta says so. */
export function labelBark(barkId, bmeta) {
  const sp = bmeta?.species || bmeta?.source?.species || null
  if (sp) return { species: sp, genus: String(sp).split(/[_\s]/)[0], evidence: 'bark meta', source: 'bark meta.species', ratified: false }
  return { species: null, genus: null, why: /^Bark0\d+$/.test(barkId) ? 'generic photographic bark (ambientCG) — a TRAIT plate, no species' : 'bark meta names no species', ratified: false }
}
