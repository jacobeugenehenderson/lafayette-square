/**
 * townsRecordKeys.js — where a town's share-card record (title, description, icon) lives in R2. One home for the parties
 * that name it: scripts/publish-towns-record.mjs writes a town's staging record from its Publish, Promote pins that
 * record, and both site Workers read it (src/lib/shareCard.js#cardFor).
 * ⭐ PER TOWN (Boz's ruling C, 2026-11-01): `{ [map]: { title, description, icon, iconFrom } }`, one entry, at the town's
 * own key on each side, so one town's Publish never reads, refuses on or rewrites another town's card. ⛔ The all-towns
 * staging/towns.json (and its list) was written beside the retired legacy player, coupled every town's card to every
 * other town's bake, and is retired with it.
 */
/** A town's staging record, written by its Publish and read by the staging Worker and by Promote. */
export const stagingTownsKey = (map) => `staging/sites/${map}/towns.json`
/** A promoted town's pinned copy, read by the production Worker. */
export const townsKey = (map) => `sites/${map}/towns.json`
