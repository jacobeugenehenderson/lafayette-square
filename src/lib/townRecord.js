/**
 * READERS OF A TOWN'S IDENTITY RECORD — pure, so the kit (its source identity, `src/instance.js`) and the Ward (the
 * baked `manifest.identity`) read one record the same way. ⛔ Imports nothing: the Ward imports this, and must never
 * pull in `src/instance.js`.
 *
 * ── The backend key (`tenantOf`) ──
 *
 * Every backend (the Apps Script tenant, the Operations overlay, the content and commerce calls) names a town by its
 * sealed opaque id, minted once in `cartograph/data/<map>/town-id.json` (Jacob, 2026-10-04), never by its look, map
 * or address — so a rename moves no data. The kit's apps hand this their source identity (`src/instance.js`); the Ward
 * hands it the baked `manifest.identity`. Same record, same rule, one implementation.
 * ⛔ A record with no well-formed id has no tenant. This throws rather than guess: a guessed tenant reads and writes
 * another town's rows. ▶ node checks/claims-a-town-has-one-sealed-id.mjs
 */
export const TOWN_ID = /^tw-[a-z0-9]{8}$/

/** @param {{townId?: string} | null | undefined} identity  @param {string} who  the town, for the message */
export function tenantOf(identity, who) {
  const id = identity?.townId
  if (!TOWN_ID.test(id || '')) {
    throw new Error(`[townTenant] ${who} carries no sealed town id (townId = ${JSON.stringify(id)}) — refusing to call the backend as a guess.`)
  }
  return id
}

/**
 * The town's tab / share title: `branding.title` where the town authored one (Huron: "Huron Online"), else its `name` —
 * the one name authority. ⛔ Never another town's: a record with neither is "The Ward", the player's own name.
 * Read by the kit's tab, the Ward's tab and the share card (scripts/publish-player-to-staging.mjs).
 */
export function titleOf(identity) {
  return identity?.branding?.title || identity?.name || 'The Ward'
}
