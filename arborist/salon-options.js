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
import { slugifyRoster } from './roster-coverage.js'

const RUBRIC = 'arborist/rubric.json'
const DOSSIERS = 'arborist/dossiers'
const PART_INDEX = 'arborist/state/part-index.json'
const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'))

/** Find the dossier for a Salon species id (roster slug OR botanical canonicalId). */
export function dossierForSalonSpecies(speciesId) {
  if (!speciesId || !existsSync(DOSSIERS)) return null
  for (const f of readdirSync(DOSSIERS).filter(n => n.endsWith('.json'))) {
    const d = readJSON(join(DOSSIERS, f))
    if (d.canonicalId === speciesId) return d
    for (const inv of (d.inventoryNames || [])) if (slugifyRoster(inv) === speciesId) return d
  }
  return null
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
  }
}
