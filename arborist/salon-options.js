/**
 * salon-options.js — the matcher's ranked options + the dossier, for one Salon
 * species (Forest Builder §9 / §7). Bridges the Salon's species id (a roster slug
 * like `oak_pin` via slugifyRoster, or a botanical canonicalId like
 * `quercus_palustris`) to its dossier, then runs the matcher per part-type so the
 * Salon's pickers can show ranked WORKABLE options with per-axis closeness badges
 * instead of raw dropdowns, plus the reference plates beside the live tree.
 *
 * Read-only. Returns { dossier: <slim> | null, options: {chassis,bark,leaf} | null }
 * — null dossier for a Salon species with no dossier (the pickers fall back to the
 * existing raw lists).
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { matcher } from './matcher.js'
import { recommend } from './recommend-plates.mjs'
import { slugifyRoster } from './roster-coverage.js'

const RUBRIC = 'arborist/rubric.json'
const DOSSIERS = 'arborist/dossiers'
const PART_INDEX = 'arborist/state/part-index.json'
const SPECIES_CURATION = 'arborist/state/_species-curation.json'
const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'))

/** Find the dossier for a Salon species id (roster slug OR botanical canonicalId). */
export function dossierForSalonSpecies(speciesId) {
  const p = dossierFileForSalonSpecies(speciesId)
  return p ? readJSON(p) : null
}

/**
 * The same lookup, returning the PATH rather than the parsed dossier — the settle
 * endpoint has to write the file back, and re-deriving the filename from canonicalId
 * would guess where dossierForSalonSpecies knows.
 */
export function dossierFileForSalonSpecies(speciesId) {
  if (!speciesId || !existsSync(DOSSIERS)) return null
  // ⭐ The identity is the SCIENTIFIC name (Jacob, 2026-09-25). A salon id the census never
  // named (`pine_pitch`) reaches `pinus_rigida.json` through its curated scientific name.
  const sci = scientificOf(speciesId)
  for (const f of readdirSync(DOSSIERS).filter(n => n.endsWith('.json'))) {
    const p = join(DOSSIERS, f)
    const d = readJSON(p)
    if (d.canonicalId === speciesId) return p
    for (const inv of (d.inventoryNames || [])) if (slugifyRoster(inv) === speciesId) return p
    if (sci && binomial(d.scientific) === sci) return p
  }
  return null
}
const binomial = (x) => String(x || '').toLowerCase().replace(/[×']/g, ' ').split(/\s+/).filter(w => w && w !== 'x').slice(0, 2).join(' ')
function scientificOf(speciesId) {
  try { return binomial(readJSON(SPECIES_CURATION).species?.[speciesId]?.scientific) || null } catch { return null }
}

/** matcher options + the (slim) dossier for one Salon species. */
export function salonOptionsForSpecies(speciesId) {
  const dossier = dossierForSalonSpecies(speciesId)
  if (!dossier) return { dossier: null, options: null }
  const rubric = readJSON(RUBRIC)
  const parts = existsSync(PART_INDEX) ? (readJSON(PART_INDEX).parts || []) : []
  return {
    dossier: {
      key: dossier.key,
      scientific: dossier.scientific,
      canonicalId: dossier.canonicalId,
      descriptor: dossier.descriptor,
      identityNotes: dossier.identityNotes,
      referenceImages: dossier.referenceImages || [],
      required: dossier.required || {},
    },
    options: {
      chassis: matcher(rubric, dossier, 'chassis', parts),
      bark: matcher(rubric, dossier, 'bark', parts),
      leaf: matcher(rubric, dossier, 'leaf', parts),
    },
    // The SAME ranking the system build uses (recommend-plates.mjs): per plate, which parts are
    // workable for this species — tier S/G/T and the reason in plain words. The Salon marks
    // plates with it; it never reorders the shelves (Phase 4: categorize, then mark).
    ...recommendations(dossier, parts, rubric),
  }
}

function recommendations(dossier, parts, rubric) {
  try {
    const out = {}
    // Keyed by partId AND by source name: the Salon's chassis catalog still lists source
    // filenames (`white_oak_a`), not the form ids the part-index and compositions use (`rounded_06`).
    const src = new Map(parts.map(p => [p.partId, p.sourcePath ? p.sourcePath.split('/').pop().replace(/\.glb$/, '') : null]))
    for (const t of ['chassis', 'bark', 'leaf']) {
      out[t] = {}
      recommend({ scientific: dossier.scientific, partType: t, parts, rubric, dossier }).forEach((r, i) => {
        const mark = { tier: r.tier, reason: r.reason, rank: i + 1, partId: r.partId }
        out[t][r.partId] = mark
        if (src.get(r.partId)) out[t][src.get(r.partId)] = mark
      })
    }
    return { recommend: out }
  } catch (e) {
    return { recommend: null, recommendError: e.message }   // ⛔ said, never swallowed (e.g. an unlabelled part-index)
  }
}
