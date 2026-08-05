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
export function createVocabularyGate(stage, remedy) {
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
      const lines = [
        `[vocabulary:${stage}] ⚠️  ${scene || '(no scene)'} — ${total} OSM feature(s) in ` +
        `${rows.length} unreadable class(es), ${Math.round(area).toLocaleString()} m².`,
        `   These did NOT vote. They fell through to the honest fallback rather than`,
        `   capturing what they overlap — but the kit could not read them, so this town's`,
        `   map is poorer than its data. Worst first:`,
      ]
      for (const g of rows.slice(0, 12)) {
        lines.push(`     ${Math.round(g.area).toLocaleString().padStart(12)} m²  ×${String(g.count).padStart(3)}  ${g.signature}`)
      }
      if (rows.length > 12) lines.push(`     … and ${rows.length - 12} more class(es).`)
      lines.push(`   ▶ ${remedy}`)
      return lines.join('\n')
    },
  }
}
