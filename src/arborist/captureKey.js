/**
 * captureKey — a per-species fingerprint of everything a capture depends on.
 *
 * The Grove bakes DIRTY species only ("drain-on-bake", Jacob 2026-07-22): adding
 * or editing a tree marks it for re-capture, everything else is left alone. So a
 * first bake after a big change may shoot ten species and every bake after it
 * shoots none — the cost tapers to zero instead of being paid in full every time.
 *
 * Dirtiness is DERIVED, never tracked. A dirty-flag ledger is a second source of
 * truth that drifts the moment anything writes around it (a hand-edited manifest,
 * a restored backup, a failed POST, another branch's bake) — and a stale "clean"
 * flag is invisible: the species just quietly keeps its old capture forever. A
 * fingerprint can't drift, because it is recomputed from the same inputs the
 * capture itself reads. Same inputs → same key → already current. Change the
 * tree, and the key changes on its own.
 *
 * Inputs are what a capture actually samples: the species' measured canopy dims
 * (they move whenever geometry does — a new chassis, a leaf-scale edit), its bark
 * records (the atlas sub-regions the capture binds), and — for hero — the capture
 * dials themselves, so re-shooting at a different azimuth count is correctly dirty.
 * Deliberately NOT included: `atlas.generatedAt` or file mtimes, which change on
 * every bake and would make everything permanently dirty — the exact failure this
 * design exists to avoid.
 */

// FNV-1a over the stable-stringified inputs. Short, dependency-free, and stable
// across runs/machines (JSON.stringify with sorted keys — plain object key order
// is insertion order, which differs between a fresh bake and a round-tripped file).
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}'
}

function fnv1a(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * @param {object} manifest  the look's trees-atlas.json
 * @param {string} species
 * @param {object} [dials]   capture parameters that change the output (hero: {azimuths, shells, albedoSize, aoSize})
 * @returns {string} the fingerprint
 */
export function computeCaptureKey(manifest, species, dials = null) {
  if (!manifest || !species) return ''
  const m = manifest
  return fnv1a(stableStringify({
    canopy: m.canopyByVariant?.[species] ?? null,
    bark: m.barkBySpecies?.[species] ?? null,
    barkDetail: m.barkDetailBySpecies?.[species] ?? null,
    barkPosterized: m.barkPosterizedBySpecies?.[species] ?? null,
    deformer: m.deformerBySpecies?.[species] ?? null,
    dials: dials ?? null,
  }))
}

/**
 * Split a species list into what needs capturing and what is already current.
 * A species is DIRTY when it has no record, its record predates fingerprinting
 * (no `captureKey` — every capture taken before this existed), or its fingerprint
 * has moved. Callers pass the record map for the form they're about to bake.
 *
 * @returns {{dirty: object[], current: object[]}}
 */
export function partitionByDirt(speciesList, recordsBySpecies, manifest, dialsFor = () => null) {
  const dirty = [], current = []
  for (const sp of speciesList) {
    const rec = recordsBySpecies?.[sp.species]
    const key = computeCaptureKey(manifest, sp.species, dialsFor(sp))
    if (!rec || !rec.captureKey || rec.captureKey !== key) dirty.push({ ...sp, captureKey: key })
    else current.push(sp)
  }
  return { dirty, current }
}
