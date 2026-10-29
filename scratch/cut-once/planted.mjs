// The planted rows for checks/claims-the-open-close-cuts-once.mjs (BRIEF-cut-once-in-full-precision §4), ONE home: each a
// small integer polygon set (clipper units, 1 mm) at a 0.9988 m step (h = 499.4 u, Huron's and PTown's), aimed at one rule.
// Shapes only: what each must produce is the check's to say, measured live (planted.mjs --measure prints it).
export const STEP_M = 0.9988
const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
const rev = (r) => r.slice().reverse()
export const ROWS = {
  // a plain square, 20 m: the open/close leaves it unchanged
  square: { what: 'a 20 m square is unchanged', rings: [sq(0, 0, 20000, 20000)] },
  // a spike 0.4 m wide, 3 m tall, on the top wall: narrower than 2h, so the open removes it and the wall comes back straight
  spike: { what: 'a sub-2h spike on a straight wall is removed, the wall straight', rings: [[[0, 0], [20000, 0], [20000, 20000], [10200, 20000], [10000, 23000], [9800, 20000], [0, 20000]]] },
  // a slot 0.6 m wide, 3 m deep, into the top wall: narrower than 2h, so the close fills it
  notch: { what: 'a sub-2h notch is filled', rings: [[[0, 0], [20000, 0], [20000, 20000], [10300, 20000], [10300, 17000], [9700, 17000], [9700, 20000], [0, 20000]]] },
  // a long wedge with a 20° tip: past the miter limit, the open squares it
  sharp: { what: 'a 20° tip is squared, both cap ends on their lines', rings: [[[0, 0], [20000, 3527], [0, 7053]]] },
  // a valley in the top wall: a 24 u flat bottom between two 10° turns. ⚠ It does NOT fold: at a DIVERGING join the offset edge
  // LENGTHENS (by 2h·tan(θ/2)), and a converging join takes the rectangle corners, so a single ring cannot fold this way. Folds
  // come from run corners at V* (two nearly parallel BIRTH lines' crossing) in the close: covered by the fixtures, and by a
  // constructed close-stage row (owed). Kept as an UNCHANGED row
  valley: { what: 'a 24 u flat valley between two 10° turns is unchanged', rings: [[[0, 0], [20000, 0], [20000, 20000], [12000, 20000], [10012, 19650], [9988, 19650], [8000, 20000], [0, 20000]]] },
  // Huron's 3020/3021/3022 shape: a reflex near-straight chain with a 24 u middle edge on a long wall
  reflexChain: { what: 'a reflex near-straight chain with a short middle edge is unchanged', rings: [[[0, 0], [20000, 0], [20000, 20000], [12000, 20000], [10016, 19982], [9992, 19982], [8000, 20000], [0, 20000]]] },
  // a 50° V-notch 3 m deep in the top wall whose apex is a 20 u flat: the close's back-erode meets the notch's two sides past the
  // miter limit, and the flat's vertices lie ON those sides (within NODE_BOUND of the cut path), so the gap rule would emit the
  // apex. The miter limit comes first: the corner is SQUARED, as the definition squares it (Huron's closedK, 0.346 m²)
  notchAtLimit: { what: 'a V-notch past the miter limit, its apex a 20 u flat, is squared in the close', rings: [[[0, 0], [20000, 0], [20000, 20000], [11409, 20000], [10010, 17000], [9990, 17000], [8591, 20000], [0, 20000]]] },
  // a 20 m square whose bottom-right corner is a short chain the erode removes, so the open's back-dilate emits a TRIMMED ARC (the
  // corner X = (20000, 0) lies outside P): wholly inside D → P's own chain, unchanged; one vertex 6 u below the bottom line, outside
  // D → the arc CLIPPED at that line by lineCrossOf (the definition: P ∩ D cuts the dip off)
  arcInside: { what: 'a trimmed arc wholly inside D is P\'s own chain, unchanged', rings: [[[0, 0], [19980, 0], [19995, 5], [20000, 20], [20000, 20000], [0, 20000]]] },
  arcClipped: { what: 'a trimmed arc with a vertex 6 u outside D is clipped at the target line', rings: [[[0, 0], [19980, 0], [19990, -6], [20000, 20], [20000, 20000], [0, 20000]]] },
  // a 20 m square and a 1.8 m strip at 60° whose foot crosses the top edge near the corner (stub-search.mjs): the erode splits at the
  // neck, and the eroded square's ring carries a segment claimed by two of P's edges there, read in the ring's FORWARD order from
  // its predecessor (Huron's pier, 2026-10-29). Read as a set (tagRun's arc) the join runs backward and refuses
  cornerStub: { what: 'a strip crossing a square\'s corner at a neck: the neck token read in forward order, no refusal', rings: [sq(0, 0, 20000, 20000), [[18721, 20550], [20279, 19650], [24779, 27444], [23221, 28344]]] },
  // an outer and its own hole, collinear end to end, the wall between 0.95 m (< 2h) along a 0.3 m stretch: the open merges, the
  // close refills, the hole is kept
  wallShort: { what: 'a sub-2h wall over a short stretch is kept (the close refills it)', rings: [sq(0, 0, 20000, 20000), rev([[5000, 5000], [15000, 5000], [15000, 17000], [10150, 17000], [10150, 19050], [9850, 19050], [9850, 17000], [5000, 17000]])] },
  // the same wall below 2h over a 6 m stretch: the close cannot refill it; the hole opens, and the topology guard must refuse
  wallLong: { what: 'a sub-2h wall over a stretch wider than 2h opens the hole: the guard refuses', rings: [sq(0, 0, 20000, 20000), rev(sq(5000, 5000, 10000, 14300))] },
}
