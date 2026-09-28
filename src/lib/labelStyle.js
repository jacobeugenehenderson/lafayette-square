/**
 * THE LABEL STYLE — one home: the town's labels.json `style`, beside the geometry it lays out
 * (Warden's ruling (A), 2026-09-28). Pure; the bake (cartograph/bake-labels.js) and the player both import it.
 *
 * ⭐ WHY. The player's label pieces (street labels, set-piece labels, the park title) read their style out of the
 * AUTHORING store, which only Stage/Designer hydrate — so the published player drew LABEL_STYLE_DEFAULT, never the
 * town's authored style (measured on staging, huron: mixed case, where the town authored upper case). labels.json carried only the two layout fields (v3). v4 carries the whole authored block.
 * ▶ node checks/claims-the-town-reads-no-player-store.mjs · node checks/claims-a-town-page-fetches-no-authoring.mjs
 */

/** The kit's neutral label style: what a Look that authored none gets. Not any town's. */
export const LABEL_STYLE_DEFAULT = {
  // sizeK absent → Auto (size ∝ real width). Set to a number to override scale.
  weight:        600,          // 300 | 400 | 500 | 600 | 700
  fill:          '#e8e8f0',
  halo:          '#14141c',
  haloWidth:     0.07,         // fontSize units (Troika outlineWidth) — % of glyph height
  letterSpacing: 0.05,         // fontSize units (TroikaText letterSpacing)
  opacity:       1,
  case:          'mixed',      // 'mixed' | 'upper' | 'lower' — applied at render time
  fontFamily:    '',           // fontsource id (e.g. 'inter'); empty = Troika default (Roboto)
}

/** An old halo width (pre-fraction units) reads as the neutral one. */
export function migrateLabels(labels) {
  if (!labels) return labels
  const out = { ...labels }
  if (typeof out.haloWidth === 'number' && out.haloWidth > 0.21) out.haloWidth = 0.07
  return out
}

/** labels.json version that carries the full authored style. v3 carried only { sizeK, letterSpacing }. */
export const LABELS_FULL_STYLE_VERSION = 4

/**
 * The style a town's labels are drawn in: the artifact's baked style, under Stage's live override when one is given.
 * A v3 artifact (two layout fields only) fills the rest from the kit default — ⏳ until the town's labels are
 * re-baked; `claims-the-labels-carry-their-style` lists those towns, and this becomes a loud failure when the list
 * is empty (Warden, 2026-09-28).
 */
export function labelStyleOf(artifact, override = null) {
  const baked = artifact?.style || {}
  const full = (artifact?.version ?? 0) >= LABELS_FULL_STYLE_VERSION
  return { ...(full ? {} : LABEL_STYLE_DEFAULT), ...migrateLabels(baked), ...(override ? migrateLabels(override) : {}) }
}
