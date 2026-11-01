/**
 * townsRecordKeys.js — where the towns record (each town's share card: title, description, icon) lives in R2. One home for
 * the four parties that name it: scripts/publish-towns-record.mjs writes the staging copy, Promote pins a town's copy, and
 * both site Workers read them (src/lib/shareCard.js#cardFor).
 * ⭐ Its own keys, not the legacy player's prefix: the record outlives that player (Boz, Zob, 2026-11-01).
 */
/** The staging record, every town, and the list that says it is whole ({ sha256, bytes, builtAt }), written LAST. */
export const STAGING_TOWNS = 'staging/towns.json'
export const STAGING_TOWNS_LIST = 'staging/towns.list.json'
/** A promoted town's pinned copy, read by the production Worker. */
export const townsKey = (map) => `sites/${map}/towns.json`
