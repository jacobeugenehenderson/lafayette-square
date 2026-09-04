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

/**
 * ⭐⭐ THE CAPTURE FORMAT VERSION — bump this when the capture CODE changes what a page
 * contains or how a stored measure is framed.
 *
 * ⛔ WHY IT EXISTS (2026-09-03). Every input below is a fact about the TREE — canopy dims,
 * bark records, hero dials. None of them is a fact about the CAPTURE, so a record shot by
 * older, buggier capture code was indistinguishable from a current one and was skipped
 * forever. The 2026-08-28 frame fix (band cuts were made in the chassis-LOCAL frame while
 * the camera clipped in WORLD metres) is the case that proved it: `FEATURES.md` promised
 * "one Bake → Slab per Look clears it", and it could not, because nothing about that fix
 * moved a fingerprint. LS was re-baked on 2026-09-03 and still carried three pre-fix
 * records; `quercus_alba`'s overhead had not been re-shot since 08-25.
 *
 * ⭐ Kit-level, which is the whole point: a bump makes every affected record dirty BY
 * CONSTRUCTION, in every town, on the next ordinary bake. No skip list, no per-town note,
 * and no operator who has to know to press ⟳. The ⟳ repair gesture stays for the cases a
 * fingerprint genuinely cannot see (a suspect asset on disk, a half-written capture).
 *
 * ⛔ A bump re-shoots EVERY species for that pool once, including records that happened to
 * be fine. That is correct and not a cost to optimise away: we cannot tell post-hoc which
 * code shot which record — that missing information IS the defect being closed.
 *
 * Per-pool so a hero-side change does not re-shoot every overhead band for nothing.
 *   overhead 3 — 2026-09-03: the capture pool now sources the ATLAS-REWRITTEN baked GLB
 *                (Grove.jsx) instead of the raw library file for substituted species.
 *                Same tree, different pixels — the fingerprint cannot see it, which is
 *                the exact reason this constant exists. First real use.
 *   hero     3 — same
 *   (2 — 2026-08-28 capture frame, local-vs-world; 1 — the implicit, unversioned era.)
 */
export const CAPTURE_FORMAT = { overhead: 3, hero: 3 }

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
 * @param {number} [format]  the pool's CAPTURE_FORMAT version — see the constant above
 * @returns {string} the fingerprint
 */
export function computeCaptureKey(manifest, species, dials = null, format = null) {
  if (!manifest || !species) return ''
  const m = manifest
  return fnv1a(stableStringify({
    canopy: m.canopyByVariant?.[species] ?? null,
    bark: m.barkBySpecies?.[species] ?? null,
    barkDetail: m.barkDetailBySpecies?.[species] ?? null,
    barkPosterized: m.barkPosterizedBySpecies?.[species] ?? null,
    deformer: m.deformerBySpecies?.[species] ?? null,
    dials: dials ?? null,
    format: format ?? null,
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
export function partitionByDirt(speciesList, recordsBySpecies, manifest, dialsFor = () => null, format = null) {
  const dirty = [], current = []
  for (const sp of speciesList) {
    const rec = recordsBySpecies?.[sp.species]
    const key = computeCaptureKey(manifest, sp.species, dialsFor(sp), format)
    if (!rec || !rec.captureKey || rec.captureKey !== key) dirty.push({ ...sp, captureKey: key })
    else current.push(sp)
  }
  return { dirty, current }
}
