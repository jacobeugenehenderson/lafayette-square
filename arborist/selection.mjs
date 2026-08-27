/**
 * selection.mjs — THE ONE SET. What this neighbourhood ships.
 *
 * ⛔⛔ THE DEFECT THIS EXISTS FOR, hit three times in one evening. Three consumers each
 * read a DIFFERENT set and every mismatch became a visible bug:
 *   capture pool  read the LOOK's species → 14 species could never get an impostor, so
 *                 2,251 placements (44% of the map) rendered as geometry
 *   variant pool  read the WHOLE library → the bars selected 13 and the slab placed 22
 *   atlas rects   read the LOOK's species → 964 placements had no leaf UV rect and
 *                 rendered dark maroon, which is what Jacob saw
 * Each was patched where it surfaced. The set was the bug.
 *
 * ⭐ THE SET IS THE SELECTION: green (composed, or a native model of that species) AND
 * above the impostor bar, ± the per-species pin/withhold. It is knowable BEFORE any bake,
 * which matters because bake-look runs FIRST and builds the atlas that bake-trees dresses
 * placements from — so "the slab's species" is circular and the selection is not.
 *
 *   selectionForScene(scene) → { species: Set<libId>, variants: [{species, variantId}],
 *                                meshTier: Set<libId>, reason: string }
 *
 * ⛔ Throws rather than returning an empty set on failure. A silent empty selection bakes
 * an empty map, and every consumer here has a fail-open path that must be reached
 * deliberately, not by an exception being swallowed.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { resolveGrove } from './grove-eligibility.mjs'
import { computeCoverage } from './roster-coverage.js'

const REPO_ROOT = path.join(import.meta.dirname, '..')

export async function selectionForScene(scene) {
  const design = JSON.parse(await readFile(path.join(REPO_ROOT, 'public/looks', scene, 'design.json'), 'utf8'))
  const board = resolveGrove((await computeCoverage(scene)).species, design.groveThreshold || {})

  const species = new Set(), meshTier = new Set()
  for (const b of board) {
    if (b.tier === 'out') continue
    for (const l of (b.ownsLibIds || [])) {
      species.add(l)
      if (b.tier === 'mesh') meshTier.add(l)
    }
  }

  // Resolve to the (species, variantId) pairs every consumer actually needs — the shape
  // `surveyRoster` and the placement bake both take.
  const index = JSON.parse(await readFile(path.join(REPO_ROOT, 'public/trees/index.json'), 'utf8'))
  const variants = (index.variants || [])
    .filter(v => species.has(v.species))
    .map(v => ({ species: v.species, variantId: v.variantId }))

  return {
    species,
    meshTier,
    variants,
    reason: `${species.size} species above the bars → ${variants.length} published variant(s)`,
  }
}
