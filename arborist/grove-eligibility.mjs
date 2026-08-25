/**
 * grove-eligibility.mjs — THE one rule that decides what a Look ships.
 *
 * ⛔ ONE RULE, ONE HOME. The Salon rail and the bake must never compute this separately;
 * two writers disagreeing about a name blanked the contested rail for nine species on
 * 2026-08-25, and this decides something far more visible — which trees exist on the map.
 *
 * THE MODEL (Jacob, 2026-08-25):
 *   library of N  →  demand-ordered  →  GREEN  →  two nested bars  →  ± per-species pin
 *
 * GREEN means "we can ship this species as itself", earned two ways: an operator composed
 * it from parts, or the library already holds a model that IS that species (the native
 * match). ⛔ Red species are never eligible, however they are pinned.
 *
 * TWO NESTED BARS over the demand-ordered green list:
 *   impostorTopN — how deep gets its OWN composed identity as an impostor. Cheap
 *                  (~0.56 MB/species measured), so it should run deep.
 *   meshTopN     — which of those also ship GEOMETRY. Expensive (~19 MB/species), so tight.
 * ⛔ NESTED, and the constraint is structural, not a preference: a mesh species still needs
 * an impostor, because only its TALLEST placements keep geometry and the rest of that same
 * species' trees render as impostors. meshTopN can never exceed impostorTopN.
 *
 * ⭐ THE PIN IS ASPIRATIONAL, AND THAT IS THE POINT. It is a DEMAND signal, not a readiness
 * claim: a director pins a species meaning "I want this" and an operator sees it pinned and
 * MUTED — a work item, not a contradiction. So a pin on a red species is legitimate and
 * renders as the shopping list ("what I need to go get to finish the species").
 *   pinned   — locked ON  (ships below the bar; the grotto's memorial tree)
 *   withheld — locked OFF (we HAVE a model and judge it not good enough)
 * ⛔ `withheld` beats the pin and both bars. ⛔ Distinct from `not-available`, which means
 * we have NOTHING — withheld means we have one and are choosing not to ship it.
 */

/** @returns 'mesh' | 'impostor' | 'out' — plus WHY, because the UI must show the reason. */
export function eligibilityFor(species, threshold, rank) {
  const { topN = null, meshTopN = null, pinned = [], withheld = [] } = threshold || {}
  const name = species.species
  const green = species.authoringState === 'composed'
  const isPinned = pinned.includes(name)
  const isWithheld = withheld.includes(name)

  // ⛔ Withheld first — a judgement no ranking overrides.
  if (isWithheld) return { tier: 'out', why: 'withheld — we have a model and it is not good enough', locked: true }
  // ⛔ Green is a precondition, never overridden by a pin. A pinned red species is an
  // ASPIRATION and must read as one: muted, with the reason naming what is missing.
  if (!green) {
    return isPinned
      ? { tier: 'out', why: 'pinned but not green — wanted, not yet buildable', locked: true, aspirational: true }
      : { tier: 'out', why: species.authoringState === 'not-available' ? 'not available' : 'not composed', locked: false }
  }

  const impostorCut = topN == null ? Infinity : topN
  const meshCut = meshTopN == null ? 0 : Math.min(meshTopN, impostorCut)   // ⛔ nesting enforced here too

  if (isPinned) return { tier: rank < meshCut ? 'mesh' : 'impostor', why: 'pinned — ships regardless of the bar', locked: true }
  if (rank < meshCut) return { tier: 'mesh', why: 'above the mesh bar', locked: false }
  if (rank < impostorCut) return { tier: 'impostor', why: 'above the impostor bar', locked: false }
  return { tier: 'out', why: 'below the impostor bar', locked: false }
}

/**
 * Rank every species by demand and resolve the whole board.
 * ⛔ Rank is over ALL species, not just green ones — the operator reads the demand list as
 * the census wrote it, and a red row at rank 3 is the loudest thing on the board.
 */
export function resolveGrove(speciesList, threshold) {
  const ranked = [...speciesList].sort((a, b) => (b.count || 0) - (a.count || 0))
  return ranked.map((s, i) => ({ ...s, rank: i, ...eligibilityFor(s, threshold, i) }))
}

/** ⛔ The nesting constraint, applied when either bar moves. Returns a clean threshold. */
export function clampBars(threshold) {
  const t = { topN: null, meshTopN: null, pinned: [], withheld: [], ...(threshold || {}) }
  if (t.topN != null && t.meshTopN != null && t.meshTopN > t.topN) t.meshTopN = t.topN
  t.pinned = (t.pinned || []).filter(s => !(t.withheld || []).includes(s))
  return t
}
