/**
 * osm-vocabulary.mjs — THE INGEST VOCABULARY GATE
 *
 * ⭐ THE INVARIANT THIS EXISTS TO ENFORCE (Jacob, 2026-08-04):
 *
 *     A SENTINEL IS NOT A VALUE.
 *     A classifier's failure to read an input must never become something that
 *     input carries downstream. An unreadable input DOES NOT VOTE, and its
 *     unreadability IS REPORTED.
 *
 * Both halves are load-bearing. Dropping an unreadable input silently is just a
 * quieter version of the same defect (`CLAUDE.md` Layer 0 — no fallbacks).
 *
 * ── WHY THIS MODULE EXISTS ──────────────────────────────────────────────────
 *
 * `classify.js` used to start every OSM overlay at `type = 'unknown'`, let four
 * branches rename it, and then push it into the classification vote AS A PEER OF
 * REAL ANSWERS. A face whose centroid landed inside an unreadable overlay took
 * the type `'unknown'` and `break`-ed — so it never reached the honest size
 * fallback, and `derive.js`'s `if (face.type === 'block')` then skipped the
 * land-use ladder entirely. The failure marker was structurally indistinguishable
 * from a result at every step.
 *
 * ⭐⭐ AN OSM POLYGON THE KIT CANNOT READ WAS STRICTLY WORSE THAN NO POLYGON AT
 * ALL — the richer a town's OSM data, the worse its map. Measured 2026-08-04,
 * every one of these faces was a hijack (zero reached the size fallback):
 *
 *     Lafayette Square     5 of 173 faces        72,686 m²   ← the mould: least
 *     Hi-Pointe–DeMun     17 of 302 faces     1,454,973 m²   ← 20× LS
 *     Altadena           108 of 742 faces    30,034,799 m²   ← 413× LS
 *
 * ⛔ THAT GRADIENT IS THE WHOLE POINT. The defect scales with how richly the town
 * is mapped, so it is FAINTEST in Lafayette Square — the scene you would reach
 * for to prove the kit travels. Nobody has ever looked at Altadena's land use.
 * A one-town fix would have been worthless; the gate is the deliverable.
 * (`ORIENTATION` — "that checker is the real prize".)
 *
 * ── THE SECOND CUSTOMER ─────────────────────────────────────────────────────
 * `OSM_TO_LU` is an allow-list one stage downstream with the same shape: a tag
 * it lacks is silently not-a-land-use. It reports through this same gate so the
 * operator gets ONE vocabulary account per pour instead of two half-accounts.
 *
 * Modelled on `lu-policy.mjs`'s `resolveLuPolicy().report()` — the established
 * idiom for "name what this town brought that the kit lacks", one stage down.
 */

/**
 * ⭐⭐⭐ CAN THE KIT READ THIS FEATURE AS A FACE? Returns null when yes, otherwise a
 * short reason that becomes part of the gap signature.
 *
 * ⛔ THE SECOND SHAPE OF THIS MODULE'S DEFECT, AND IT ARRIVED WITH RELATIONS
 * (2026-09-19). Until then every ground feature was a single closed way, so a
 * consumer could take `f.coords` as "the face" and be right. Multipolygon intake
 * broke both halves of that assumption at once:
 *
 *   · a feature can carry HOLES — an island in a lake, a courtyard in a block.
 *     `f.coords` alone is then the OUTER ring, and using it as the face FILLS the
 *     hole. Measured on Huron: 12 relations carry inner rings, including a water
 *     relation with 7 islands and five `landuse=grass` relations.
 *   · a feature can be CLIPPED — a big ring whose members close outside the fetch
 *     envelope (`fetch.js` scopes relation members deliberately). Lake Erie arrives
 *     as 1,329 vertices that do not close. Treated as a polygon it is not a lake
 *     with a ragged edge; it is a nonsense region whose interior is whatever the
 *     shoelace happens to say.
 *
 * ⭐ THE GRADIENT ARGUMENT AT THE TOP OF THIS FILE APPLIES UNCHANGED, which is why
 * this belongs here and not in a caller: multipolygons are what a RICHLY MAPPED town
 * has. Lafayette Square has no relations at all — its fetch predates them — so a
 * one-town check would see nothing and clear the kit. Huron has 28.
 *
 * ⛔ Callers must `record()` the reason and SKIP. Do not repair the ring, do not
 * drop it quietly, and do not let it vote — all three are the sentinel-as-value
 * defect this module exists to prevent.
 */
export function unreadableFace(f) {
  if (!f || !Array.isArray(f.coords) || f.coords.length < 3) return 'degenerate'
  // ⛔ `isClosed` is the producer's OWN declaration, not something re-derived from
  // the coordinates here. A consumer that re-decides closure by comparing endpoints
  // has taken over the producer's job and will disagree with it at the rounding.
  // ⛔ `clipped` IS TESTED ON ITS OWN, BEFORE `isClosed`, and that ordering is
  // load-bearing. `snap.js` RE-DERIVES closure after snapping, so a clipped ring
  // whose two loose ends happen to land on the same grid point comes out of the
  // snapper declaring `isClosed: true` while still being a fragment of a much
  // larger body. Keying only off closure would let exactly that through — and it
  // is the biggest ring in the town.
  if (f.clipped) return 'clipped'
  if (f.isClosed === false) return 'open'
  if (Array.isArray(f.holes) && f.holes.length) return 'compound'
  return null
}

/** Shoelace area of a ring of {x,z} or [x,z]. Sign-agnostic. */
function ringArea(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0
  let a = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n]
    const px = p.x ?? p[0], pz = p.z ?? p[1]
    const qx = q.x ?? q[0], qz = q.z ?? q[1]
    a += px * qz - qx * pz
  }
  return Math.abs(a / 2)
}

/**
 * Create a recorder for one ingest stage.
 *
 * @param {string} stage   — where the failure happened, e.g. 'classify'
 * @param {string} remedy  — the ONE line telling the operator what to do about
 *                           it. Be specific: a vague remedy is why these gaps
 *                           survive. Name the file and the shape of the edit.
 */
/**
 * ⭐ THIRD CUSTOMER, 2026-08-04 (`ROADMAP A07`) — the SHAPE producer.
 *
 * The curb has two producers and used to pick between them with no signal. That
 * is the identical invariant one layer down — *a silent choice is not a disclosed
 * one* — so it reports through THIS module rather than a third bespoke reporter.
 *
 * What it needed that vocabulary did not: different prose. "N OSM feature(s) in M
 * unreadable class(es) … these did NOT vote" is false when the subject is a curb.
 * So the wording is now a parameter (`prose`), defaulted to the exact vocabulary
 * strings — existing callers pass nothing and their output is byte-identical.
 * ⛔ If you need a fourth, parameterize further; do not fork this file.
 */
const VOCAB_PROSE = {
  noun: 'OSM feature',
  classNoun: 'unreadable class',
  unit: 'm²',
  /**
   * ⭐ IS THIS GAP MEASURED IN GROUND, OR JUST COUNTED? The first two customers
   * are spatial: an unreadable land-use polygon is bad in proportion to the
   * ground it covers, so the report leads with area and triages worst-area
   * first. The third is not — an unlicensable place record has no footprint,
   * and area-weighting it printed "0 m² ×482" next to a real problem, which
   * reads as "nothing is wrong" at a glance.
   * ⛔ Set `weighted: false` and the report counts instead of measuring. Do not
   * pass a fake ring to satisfy the column; a zero that means "not applicable"
   * is indistinguishable from a zero that means "none", which is the sentinel
   * defect this whole module exists to prevent.
   */
  weighted: true,
  body: [
    '   These did NOT vote. They fell through to the honest fallback rather than',
    '   capturing what they overlap — but the kit could not read them, so this town\'s',
    '   map is poorer than its data. Worst first:',
  ],
}

export function createVocabularyGate(stage, remedy, prose = {}) {
  const P = { ...VOCAB_PROSE, ...prose }
  /** @type {Map<string, {count:number, area:number, sample:object}>} */
  const gaps = new Map()
  let total = 0

  return {
    /**
     * Record an input the kit could not read.
     * @param {string} signature — the tag that WOULD have to be understood,
     *                             e.g. 'amenity=college'. This is the unit the
     *                             operator acts on, so make it the exact key.
     * @param {Array}  ring      — for area weighting (optional)
     * @param {object} tags      — kept as a sample for the report
     */
    record(signature, ring = null, tags = null) {
      total++
      const g = gaps.get(signature) || { count: 0, area: 0, sample: tags }
      g.count++
      g.area += ringArea(ring)
      gaps.set(signature, g)
    },

    get count() { return total },
    get distinct() { return gaps.size },
    /** Sorted worst-first by area — the operator's triage order. */
    get gaps() {
      return [...gaps.entries()]
        .map(([signature, g]) => ({ signature, ...g }))
        .sort((a, b) => b.area - a.area || b.count - a.count)
    },

    /**
     * The pour-time announcement. ⭐ An operator pouring town #7 learns their
     * vocabulary is unread AT POUR TIME, not by noticing grey ground weeks
     * later — the exact failure this whole arc came from.
     *
     * Returns null when there is nothing to say, so callers can stay quiet on a
     * clean pour without special-casing.
     */
    report(scene) {
      if (!total) return null
      const rows = this.gaps
      const area = rows.reduce((s, g) => s + g.area, 0)
      const size = P.weighted ? `, ${Math.round(area).toLocaleString()} ${P.unit}` : ''
      const lines = [
        `[vocabulary:${stage}] ⚠️  ${scene || '(no scene)'} — ${total} ${P.noun}(s) in ` +
        `${rows.length} ${P.classNoun}(es)${size}.`,
        ...P.body,
      ]
      for (const g of rows.slice(0, 12)) {
        lines.push(P.weighted
          ? `     ${Math.round(g.area).toLocaleString().padStart(12)} ${P.unit}  ×${String(g.count).padStart(3)}  ${g.signature}`
          : `     ×${String(g.count).padStart(6)} ${P.unit}  ${g.signature}`)
      }
      if (rows.length > 12) lines.push(`     … and ${rows.length - 12} more ${P.classNoun}(es).`)
      lines.push(`   ▶ ${remedy}`)
      return lines.join('\n')
    },
  }
}
