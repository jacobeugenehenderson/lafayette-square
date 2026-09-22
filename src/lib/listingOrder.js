/**
 * listingOrder — the one order the directory is presented in.
 *
 * ⛔⛔ THERE WAS NO ORDER. Not one `.sort()` in `SidePanel`, `useListings` or
 * `useLandmarkFilter`: 285 listings rendered in whatever order the producer emitted,
 * which for an Overture base is that file's order. huron's directory opened on a
 * remodeling contractor, a detailer and a car wash, with the town's best-documented
 * restaurant at #48. ⚠️ `assignDisplayIds` DOES sort, which made it read as though an
 * ordering discipline existed — it sorts a filtered copy to hand out id numbers and
 * never reorders the array it returns.
 *
 * ⭐⭐ DEPTH FIRST, PROMINENCE AS TIE-BREAK (ruled by Jacob, 2026-09-22).
 *
 * DEPTH is what the card can actually show — a menu, hours, a description, a photo.
 * ⭐ It is self-maintaining and needs no model: as a Host corrects the directory and a
 * guardian claims a card, that listing rises on its own. Measured on huron at the time
 * of writing: 91 of 285 listings are a name and nothing else, and they were interleaved
 * with the eight carrying a full menu.
 *
 * ⛔ PROMINENCE ALONE WAS THE OBVIOUS ANSWER AND IT IS THE WRONG ONE. The kit computes
 * `prominence.rank` on every building and it is a footprint-and-brand-signal score, so
 * sorting huron by it puts Mickey Mart, Dunkin', Domino's, McDonald's, Wendy's and
 * Subway above a 1979 family restaurant — and moves Berardi's from #48 to #82. It is a
 * good tie-break among equals and a bad primary key for a directory people read.
 *
 * ⛔ AN ABSENT RANK SORTS LAST AND IS `null`, NEVER 0 — zero is a rank, and the best one.
 * A listing whose building carries no rank must not be promoted to the top by the
 * arithmetic of its own missing data.
 */

// The weights are ordinal, not a score: they express "a menu beats hours beats a
// description", nothing finer. ⛔ Do not tune them into a ranking model — the moment
// this needs calibration it has stopped being a presentation order and become a
// judgment, and a judgment belongs to the operator.
const DEPTH = [
  [l => !!(l.menu && (l.menu.sections || []).length), 4],
  [l => !!(l.hours && Object.keys(l.hours).length), 2],
  [l => !!l.description, 1],
  [l => !!(l.photos && l.photos.length), 1],
]

/** How much of a card there is to show. Higher is richer. */
export function listingDepth(l) {
  if (!l) return 0
  let d = 0
  for (const [has, w] of DEPTH) if (has(l)) d += w
  return d
}

/** Sorted copy: richest cards first, prominence breaking ties, unranked last. */
export function orderListings(listings) {
  const rank = l => (typeof l.prominence_rank === 'number' ? l.prominence_rank : Number.POSITIVE_INFINITY)
  return [...listings].sort((a, b) =>
    listingDepth(b) - listingDepth(a) ||
    rank(a) - rank(b) ||
    (a.name || '').localeCompare(b.name || ''))
}
