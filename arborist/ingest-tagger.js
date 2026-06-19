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
 */

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
  if (dn && DISPLAYNAME_HABIT[dn]) {
    tags['chassis.habit'] = tag(DISPLAYNAME_HABIT[dn], 'high', `curation.displayName("${curationEntry.displayName}")`, true)
  } else {
    const sp = meta.source && meta.source.species
    const h = sp && SPECIES_HABIT[sp]
    tags['chassis.habit'] = h
      ? tag(h, 'low', `source.species-botany(${sp})`, false)
      : tag(null, 'low', 'undetermined — no aspect at ingest, no species map', false)
  }
  return tags
}

// ── leaf ────────────────────────────────────────────────────────────────────
export function tagLeaf(rubric, packMeta) {
  const tags = {}
  const sil = normalizeVocab(rubric, 'leaf.silhouette', packMeta.morphology)
  tags['leaf.silhouette'] = sil.known
    ? tag(sil.value, 'high', `pack-meta.morphology${sil.normalizedFrom ? `(${sil.normalizedFrom}→${sil.value})` : ''}`, false)
    : tag(null, 'low', `pack-meta.morphology(${packMeta.morphology}) — not a silhouette (season/variant pack?)`, false, { unresolved: sil.unresolved })
  if (packMeta.naturalSize != null) {
    tags['leaf.size'] = tag(packMeta.naturalSize, 'high', 'pack-meta.naturalSize(cm)', false)
  }
  // leaf.ways is human-only — never auto-tagged (not in the card geometry).
  return tags
}

// ── bark ────────────────────────────────────────────────────────────────────
// barkDirMap (rubric, ratified) seeds Bark0NN → type; bark.color needs an image
// decoder we don't run this stage → honest null, source 'texture-sample-pending'.
export function tagBark(rubric, barkId) {
  const tags = {}
  const barkAxis = rubric.axes.find(a => a.id === 'bark.type')
  const mapEntry = barkAxis && barkAxis.barkDirMap && barkAxis.barkDirMap[barkId]
  const typeWord = mapEntry && /^([a-z]+)/.exec(mapEntry)
  if (typeWord && typeWord[1] !== 'unassigned') {
    const n = normalizeVocab(rubric, 'bark.type', typeWord[1])
    tags['bark.type'] = n.known
      ? tag(n.value, 'low', `rubric.barkDirMap(${barkId})`, false)
      : tag(null, 'low', `barkDirMap(${barkId})→${typeWord[1]} not in vocab`, false)
  } else {
    tags['bark.type'] = tag(null, 'low', `barkDirMap(${barkId}) unassigned — needs ratify`, false)
  }
  tags['bark.color'] = tag(null, 'low', 'texture-sample-pending (no decoder this stage)', false)
  return tags
}
